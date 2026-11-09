"""Headless geometry checks for the chibi animation contacts and merge buckets."""

import json
import math
import sys
from pathlib import Path
from types import SimpleNamespace

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).parent))
from build import build_group, merge_compatible_parts, validate_glb
from palette import build_material, load_palette
from parts import game_to_blender
from human import _derive_proportions, STROLLER_HANDLE_FORWARD, STROLLER_HANDLE_HEIGHT_RATIO

FLOOR_TOLERANCE = 0.004
ARM_TOLERANCE = 0.003
ARM_SLEEVE_RATIO = 0.34
ARM_SURFACE_MARGIN = 1.25


def select_clip(group, name, rest):
    end = 0
    for obj in group.children_recursive:
        obj.matrix_basis = rest[obj.name].copy()
        if obj.animation_data:
            obj.animation_data.action = None
            for track in obj.animation_data.nla_tracks:
                track.mute = track.name != name
                if not track.mute:
                    end = max(end, *(strip.frame_end for strip in track.strips))
    return end


def minimum_height(obj):
    return min((obj.matrix_world @ vertex.co).z for vertex in obj.data.vertices)


def verify_arm_lengths(description, meshes, clip):
    """Bound both joint reach and actual skin geometry in the person's spine frame."""
    for person in description["persons"]:
        prefix = f"p{person['index']}_"
        p = _derive_proportions(person)
        spine = bpy.data.objects[prefix + "spine"]
        inverse = spine.matrix_world.inverted()
        reach = p["arm_len"]
        if person.get("stroller"):
            vertical = person["height"] * STROLLER_HANDLE_HEIGHT_RATIO - p["hip_height"] - p["torso"] * 0.65
            reach = math.hypot(vertical, STROLLER_HANDLE_FORWARD)
        elif person.get("shoulderChild") is not None:
            reach = Vector((p["head_r"] * 0.65, p["head_r"] * 2, 0.10)).length
        elif person.get("camera") and clip == "photo":
            # The camera pose has a deliberately longer reach, derived from the
            # face and grip proportions, never from animated scale or mesh bounds.
            grip = p["limb_r"] * 1.4
            target = Vector((p["shoulder_w"] - grip,
                             p["head_r"] * 1.3 + 0.03,
                             p["torso"] + p["neck"] - (p["torso"] * 0.65 - p["arm_len"] * ARM_SLEEVE_RATIO)))
            reach = p["arm_len"] * ARM_SLEEVE_RATIO + target.length
        shoulders = [game_to_blender([sign * p["shoulder_w"], p["torso"] * 0.65, 0]) for sign in (-1, 1)]
        for side, shoulder in zip(("l", "r"), shoulders):
            arm = bpy.data.objects[prefix + f"arm_{side}"]
            hand = inverse @ arm.matrix_world @ game_to_blender(arm["zooHand"])
            assert (hand - shoulder).length <= reach + ARM_TOLERANCE, f"{prefix}{side} arm reach exceeds proportions during {clip}"
            if not arm.children:
                # Supported arms share the spine frame, so the unused individual
                # contact pivots must remain rigid relative to it in every clip.
                assert (Vector(arm.rotation_euler)).length < ARM_TOLERANCE, f"supported arm rotates during {clip}"
                assert all(abs(value - 1) < ARM_TOLERANCE for value in arm.scale), f"supported arm scales during {clip}"
        limit = reach + p["limb_r"] * ARM_SURFACE_MARGIN + ARM_TOLERANCE
        for obj in meshes:
            if obj["zooPerson"] != person["index"] or obj["zooTint"] != "skin" or obj.parent.name == prefix + "head":
                continue
            for vertex in obj.data.vertices:
                point = inverse @ obj.matrix_world @ vertex.co
                assert min((point - shoulder).length for shoulder in shoulders) <= limit, f"{obj.name} arm geometry exceeds proportions during {clip}"


def test_arm_guard(description, meshes, clip):
    child = next((person for person in description["persons"] if person.get("posture") == "shoulders"), None)
    if child is None:
        return
    prefix = f"p{child['index']}_"
    p = _derive_proportions(child)
    arm = bpy.data.objects[prefix + "arm_l"]
    original = list(arm["zooHand"])
    old_endpoint = [-p["head_r"] * 0.65, -p["torso"] * 0.65 - p["head_r"] * 0.65, p["head_r"] * 0.65]
    arm["zooHand"] = [value * (1 - ARM_SLEEVE_RATIO) for value in old_endpoint]
    try:
        verify_arm_lengths(description, meshes, clip)
    except AssertionError as error:
        assert "arm reach exceeds" in str(error), str(error)
    else:
        raise AssertionError(f"arm guard accepted the old shoulder-child reach during {clip}")
    finally:
        arm["zooHand"] = original
    mesh = next(obj for obj in meshes if obj["zooPerson"] == child["index"] and obj["zooTint"] == "skin" and obj.parent.name == prefix + "spine")
    vertex = mesh.data.vertices[0]
    original_vertex = vertex.co.copy()
    vertex.co.z -= child["height"]
    try:
        verify_arm_lengths(description, meshes, clip)
    except AssertionError as error:
        assert "arm geometry exceeds" in str(error), str(error)
    else:
        raise AssertionError(f"arm guard accepted elongated geometry during {clip}")
    finally:
        vertex.co = original_vertex


def verify(description, exported=False):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if exported:
        root = Path(__file__).resolve().parents[3]
        path = root / "assets/models/visitors" / f"{description['archetypeId']}.glb"
        validate_glb(path, description)
        bpy.ops.import_scene.gltf(filepath=str(path))
        group = next(obj for obj in bpy.data.objects if obj.get("zooVisitor") is not None)
        bpy.context.scene.frame_set(0)
    else:
        palette = load_palette()
        group = build_group(description, palette, build_material(palette))
        # Reverse traversal to catch accidental dependence on creation order.
        merge_compatible_parts(SimpleNamespace(children_recursive=list(reversed(group.children_recursive))))
    meshes = [obj for obj in group.children_recursive if obj.type == "MESH"]
    rest = {obj.name: obj.matrix_basis.copy() for obj in group.children_recursive}
    buckets = [(obj.parent.name, obj["zooPerson"], obj["zooTint"]) for obj in meshes]
    assert len(buckets) == len(set(buckets)), "unmerged compatible pieces"
    for person in description["persons"]:
        for piece, tint, pivot in (("head", "skin", "head"), ("body", "shirt", "spine")):
            name = f"p{person['index']}_{piece}_mesh"
            obj = bpy.data.objects.get(name)
            assert obj is not None and obj in meshes, f"missing shadow caster {name}"
            assert obj["zooTint"] == tint and obj.parent.name == f"p{person['index']}_{pivot}", f"incorrect merge anchor {name}"
        head = bpy.data.objects[f"p{person['index']}_head"]
        faces = [obj for obj in meshes if obj.parent == head and obj["zooTint"] == "none"]
        assert len(faces) == 1, "facial details must share exactly one untinted head bucket"
        palette = load_palette()
        face_uvs = {tuple(round(value, 5) for value in loop.uv) for loop in faces[0].data.uv_layers.active.data}
        expected = {tuple(round(value, 5) for value in palette.uv(color)) for color in ("eye_black", "eye_shine", "nose_dark")}
        assert face_uvs == expected, "facial bucket lost the eyes, white catchlights or mouth"
        skin = bpy.data.objects[f"p{person['index']}_head_mesh"]
        assert all((loop.uv - Vector(palette.uv("eye_shine"))).length < 0.0001 for loop in skin.data.uv_layers.active.data), "facial details remain in the skin bucket"
    standing = [person for person in description["persons"] if person.get("posture", "standing") == "standing"]
    for clip in ("walk", "stop", "look", "point", "photo", "sit"):
        end = select_clip(group, clip, rest)
        assert end > 0, f"empty animation: {clip}"
        for step in range(9):
            time = end * step / 8
            bpy.context.scene.frame_set(int(time), subframe=time % 1)
            for obj in meshes:
                assert all(math.isfinite(value) for row in obj.matrix_world for value in row), f"invalid pose: {clip}"
            verify_arm_lengths(description, meshes, clip)
            if step == 0:
                test_arm_guard(description, meshes, clip)
            for person in description["persons"]:
                if person.get("posture") == "shoulders":
                    head = bpy.data.objects["p0_head"]
                    radius = head["zooHeadRadius"]
                    inverse = head.matrix_world.inverted()
                    for obj in meshes:
                        if obj["zooPerson"] == person["index"] and "_leg_" in obj.name:
                            for vertex in obj.data.vertices:
                                local = inverse @ obj.matrix_world @ vertex.co
                                distance = (local.x / (radius * 1.04)) ** 2 + (local.y / (radius * 0.96)) ** 2 + (local.z / (radius * 0.94)) ** 2
                                assert distance >= 1.0, f"child leg intersects parent head during {clip}"
                if not person.get("camera"):
                    continue
                prefix = f"p{person['index']}_"
                camera = bpy.data.objects[prefix + "camera"]
                strap = bpy.data.objects[prefix + "camera_strap"]
                end_position = strap.matrix_world @ Vector((0, 0, -strap["zooStrapLength"]))
                assert (end_position - camera.matrix_world.translation).length < 0.003, f"detached strap during {clip}"
                for side in ("l", "r"):
                    hand = bpy.data.objects[prefix + f"hand_{side}"]
                    relative = camera.parent.matrix_world.inverted() @ hand.matrix_world
                    assert all(abs(value - 1.0) < 0.003 for value in relative.to_scale()), f"hand changes size during {clip}"
    end = select_clip(group, "walk", rest)
    lowest = float("inf")
    for frame in range(31):
        time = end * frame / 30
        bpy.context.scene.frame_set(int(time), subframe=time % 1)
        for person in standing:
            for side in ("l", "r"):
                obj = bpy.data.objects[f"p{person['index']}_leg_{side}_mesh"]
                lowest = min(lowest, minimum_height(obj))
    assert lowest >= -FLOOR_TOLERANCE, f"walk crosses floor: {lowest}"
    end = select_clip(group, "sit", rest)
    for step in range(61):
        time = end * step / 60
        bpy.context.scene.frame_set(int(time), subframe=time % 1)
        for person in standing:
            for side in ("l", "r"):
                leg = bpy.data.objects[f"p{person['index']}_leg_{side}_mesh"]
                assert minimum_height(leg) >= -FLOOR_TOLERANCE, f"sit leg crosses floor: {minimum_height(leg)}"
    bpy.context.scene.frame_set(int(end), subframe=end % 1)
    for person in standing:
        if person.get("stroller"):
            continue
        body = bpy.data.objects[f"p{person['index']}_body_mesh"]
        height = minimum_height(body)
        assert -FLOOR_TOLERANCE <= height <= 0.04, f"sit not grounded: {height}"
    end = select_clip(group, "photo", rest)
    bpy.context.scene.frame_set(int(end * 0.5), subframe=(end * 0.5) % 1)
    for person in standing:
        if not person.get("camera"):
            continue
        hands = []
        for side in ("l", "r"):
            arm = bpy.data.objects[f"p{person['index']}_arm_{side}"]
            hands.append(arm.matrix_world @ game_to_blender(arm["zooHand"]))
        camera = bpy.data.objects[f"p{person['index']}_camera"]
        for hand, sign in zip(hands, (-1, 1)):
            grip = camera.matrix_world @ Vector((sign * camera["zooGripWidth"], 0, 0))
            assert (hand - grip).length < 0.003, "hand misses its camera grip"
        forward = camera.matrix_world.to_quaternion() @ Vector((0.0, -1.0, 0.0))
        assert forward.dot(Vector((0.0, -1.0, 0.0))) > 0.99, "camera does not face forward"
        head = bpy.data.objects[f"p{person['index']}_head"]
        camera_local = head.matrix_world.inverted() @ camera.matrix_world.translation
        assert -camera_local.y >= head["zooHeadRadius"] * 1.05, "camera inside face"
        assert abs(camera.matrix_world.translation.z - head.matrix_world.translation.z) < 0.08, "camera not at face height"
    for clip in ("walk", "stop", "look", "point", "sit"):
        end = select_clip(group, clip, rest)
        for step in range(9):
            time = end * step / 8
            bpy.context.scene.frame_set(int(time), subframe=time % 1)
            for person in standing:
                if person.get("camera"):
                    camera = bpy.data.objects[f"p{person['index']}_camera"]
                    assert camera.parent.name == f"p{person['index']}_spine", "camera remains on an arm"
                    assert (camera.location - rest[camera.name].translation).length < 0.0001, f"camera leaves chest during {clip}"
    source = "GLB" if exported else "source"
    print(f"[zoo-refuge] {description['archetypeId']} ({source}): six clips, arm proportions, merge, walk, sit, photo verified; floor minimum {lowest:.4f} m")


def main():
    for path in sorted((Path(__file__).parent / "descriptions").glob("*.json")):
        description = json.loads(path.read_text())
        verify(description)
        verify(description, exported=True)


if __name__ == "__main__":
    main()
