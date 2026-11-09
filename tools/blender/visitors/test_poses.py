"""Geometry/contact regressions, executed by headless Blender.

blender -b --factory-startup --python-exit-code 1 -P tools/blender/visitors/test_poses.py
"""

import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

VISITORS_DIR = Path(__file__).parent
sys.path.insert(0, str(VISITORS_DIR))
from build import EXPECTED_CLIP_NAMES, build_group, _count_triangles_per_person  # noqa: E402
from human import game_to_blender, HAIR_SEGMENTS  # noqa: E402
from palette import build_material, load_palette  # noqa: E402

EPSILON = 0.0001


def _assert(condition, message):
    if not condition:
        raise AssertionError(message)


def _vertices(obj):
    return [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]


def _bounds(obj):
    vertices = _vertices(obj)
    return (
        Vector(tuple(min(point[axis] for point in vertices) for axis in range(3))),
        Vector(tuple(max(point[axis] for point in vertices) for axis in range(3))),
    )


def _test_fringe_edge(hair, radius):
    edge = [vertex.co for vertex in list(hair.data.vertices)[-HAIR_SEGMENTS:]
            if vertex.co.y < -radius * 0.70]
    _assert(len(edge) >= 3 and max(point.z for point in edge) - min(point.z for point in edge) > radius * 0.03,
            "fringe has a horizontal bowl edge")


def _test_fringe_guard(hair, radius):
    edge = [vertex for vertex in list(hair.data.vertices)[-HAIR_SEGMENTS:]
            if vertex.co.y < -radius * 0.70]
    heights = [vertex.co.z for vertex in edge]
    for vertex in edge:
        vertex.co.z = sum(heights) / len(heights)
    try:
        _test_fringe_edge(hair, radius)
    except AssertionError as error:
        _assert("horizontal bowl edge" in str(error), str(error))
    else:
        raise AssertionError("fringe guard accepts a horizontal bowl edge")
    finally:
        for vertex, height in zip(edge, heights):
            vertex.co.z = height


def _test_faces(description):
    for person in description["persons"]:
        prefix = f"p{person['index']}_"
        head = bpy.data.objects[prefix + "head"]
        radius = head["zooHeadRadius"]
        for side in ("l", "r"):
            eye = bpy.data.objects[prefix + f"eye_{side}_mesh"]
            vertices = [vertex.co for vertex in eye.data.vertices]
            width = max(v.x for v in vertices) - min(v.x for v in vertices)
            height = max(v.z for v in vertices) - min(v.z for v in vertices)
            _assert(height > width, "eye is not a tall oval")
            _assert(max(v.z for v in vertices) < radius * 0.02, "eye sits too high")
            # The old skin-bucket assertion contradicted untinted white catchlights.
            _assert(eye["zooTint"] == "none" and eye.parent == head, "eye must stay untinted on the head pivot")
            shine = bpy.data.objects[prefix + f"eye_shine_{side}_mesh"]
            _assert(shine["zooTint"] == "none" and shine.parent == head, "catchlight must stay untinted")
            for obj in (eye, shine):
                _assert(all(polygon.use_smooth for polygon in obj.data.polygons), "facial sphere is flat shaded")
            _assert(len({round(vertex.co.x, 6) for vertex in eye.data.vertices}) >= 10,
                    "eye outline has too few segments")
            if person.get("glasses"):
                rim = bpy.data.objects[prefix + f"glasses_{side}_mesh_rim"]
                eye_uv = eye.data.uv_layers.active.data[0].uv
                _assert(all((loop.uv - eye_uv).length < EPSILON
                            for loop in rim.data.uv_layers.active.data),
                        "rim does not use the dark eye texel")
                _assert(not any("lens" in obj.name for obj in head.children), "glasses contain a solid lens")
        if person.get("hair") == "beard" or person.get("facialHair") == "moustache":
            _assert(bpy.data.objects.get(prefix + "beard_mesh") is None, "smiling beard crescent remains")
            for side, sign in (("l", -1), ("r", 1)):
                moustache = bpy.data.objects[prefix + f"moustache_{side}_mesh"]
                _assert(moustache["zooTint"] == "hair" and moustache.parent == head,
                        "moustache does not follow hair tint and head")
                low, high = _bounds(moustache)
                _assert(high.z - low.z > radius * 0.15, "moustache is not plump")
                _assert(max(vertex.co.z for vertex in moustache.data.vertices) < -radius * 0.49,
                        "moustache touches the eyes")
                _assert(max(abs(vertex.co.x) for vertex in moustache.data.vertices) < radius * 0.31,
                        "moustache forms a wide smile")
                _assert(sign * sum(vertex.co.x for vertex in moustache.data.vertices) > 0,
                        "moustache lobes are not on opposite sides")
        if person.get("hair", "short") != "none":
            hair = bpy.data.objects[prefix + "hair_mesh"]
            surface = bmesh.new()
            surface.from_mesh(hair.data)
            _assert(all(edge.is_manifold and edge.is_contiguous for edge in surface.edges)
                    and surface.calc_volume(signed=True) > 0,
                    "hair surface is open or has inward-facing polygons")
            surface.free()
            points = [vertex.co for vertex in hair.data.vertices]
            front = [point for point in points if point.y < -radius * 0.70]
            _assert(front and min(point.z for point in front) > radius * 0.10, "fringe covers the eyes")
            sides = [point for point in points if abs(point.x) > radius * 0.95]
            back = [point for point in points if point.y > radius * 0.60]
            _assert(min(point.z for point in sides) < 0 and min(point.z for point in back) < -radius * 0.50,
                    "hair lacks temples or a descending nape")
            _test_fringe_edge(hair, radius)
            _test_fringe_guard(hair, radius)


def _test_rest(description, root):
    for obj in root.children_recursive:
        if obj.type == "MESH":
            _assert(_bounds(obj)[0].z >= -EPSILON, f"{obj.name} penetrates the ground")
            if not any(part in obj.name for part in ("hair", "camera", "stroller")):
                _assert(all(polygon.use_smooth for polygon in obj.data.polygons), f"{obj.name} has flat organic surfaces")
    counts = _count_triangles_per_person(root, description["memberCount"])
    _assert(all(800 <= count <= 1500 for count in counts.values()), f"triangle budget: {counts}")
    for person in description["persons"]:
        idx = person["index"]
        if person.get("posture", "standing") == "standing":
            for side in ("l", "r"):
                shoe = bpy.data.objects[f"p{idx}_shoe_{side}_mesh"]
                _assert(abs(_bounds(shoe)[0].z) < EPSILON, f"{shoe.name} is not grounded")
        else:
            hips = bpy.data.objects[f"p{idx}_hips"]
            _assert(hips.location.length < EPSILON, f"p{idx} stands above its seat")
            for side in ("l", "r"):
                leg = bpy.data.objects[f"p{idx}_leg_{side}"]
                knee = game_to_blender(leg["zooKnee"])
                foot = game_to_blender(leg["zooFoot"])
                bend = knee.angle(foot - knee)
                _assert(math.radians(50) < bend < math.radians(110), f"{leg.name} is not bent")
                _assert(foot.z < knee.z and knee.y < -0.10, f"{leg.name} is not seated forward")
            expected_parent = (
                f"p{person['sitOn']}_root" if "sitOn" in person else "p0_shoulder_seat"
            )
            person_root = bpy.data.objects[f"p{idx}_root"]
            if "sitOn" in person:
                _assert(person_root.parent.name == "p2_sit_pivot", "baby is not attached to the seat")
                _assert(person_root.parent.parent.name == expected_parent, "stroller has wrong owner")
                seat = bpy.data.objects["p0_stroller_seat_mesh"]
                _assert(abs(hips.matrix_world.translation.z - _bounds(seat)[1].z) < 0.04,
                        "baby pelvis does not rest on the seat")
            else:
                _assert(person_root.parent.name == expected_parent, "child is not carried on shoulders")
                head = bpy.data.objects["p0_head_mesh"]
                body = bpy.data.objects[f"p{idx}_body_mesh"]
                _assert(_bounds(body)[0].z > _bounds(head)[1].z,
                         "child torso intersects the carrier's head")
                child_head = bpy.data.objects[f"p{idx}_head_mesh"]
                _assert(_bounds(child_head)[0].z > _bounds(head)[1].z,
                        "carrier hides the child's face")
                gap = _bounds(body)[0].z - _bounds(head)[1].z
                _assert(gap < 0.12, "child floats above the carrier")
                head_center = bpy.data.objects["p0_head"].matrix_world.translation
                for side, sign in (("l", -1), ("r", 1)):
                    leg = bpy.data.objects[f"p{idx}_leg_{side}"]
                    foot = leg.matrix_world @ game_to_blender(leg["zooFoot"])
                    _assert(sign * (foot.x - head_center.x) > 0.35,
                            "child's legs do not straddle the head")
                    _assert(foot.z < _bounds(head)[1].z + 0.04,
                            "child's feet do not hang beside the head")
        if person.get("camera", False):
            camera = bpy.data.objects[f"p{idx}_camera"]
            _assert(camera.parent.name == f"p{idx}_spine", "camera is attached to a limb")
            _assert(camera.location.y < 0 and abs(camera.location.x) < EPSILON,
                    "camera is not centered on the chest")
            for side in ("l", "r"):
                strap = bpy.data.objects[f"p{idx}_camera_strap_{side}_mesh"]
                _assert(strap.parent.parent == camera.parent, "strap does not follow the chest")
        for side in ("l", "r"):
            sleeve = bpy.data.objects[f"p{idx}_sleeve_{side}_mesh"]
            arm = bpy.data.objects[f"p{idx}_arm_{side}_mesh"]
            hand = bpy.data.objects[f"p{idx}_hand_{side}_mesh"]
            _assert(sleeve["zooTint"] == "shirt" and sleeve.parent.name == f"p{idx}_spine",
                    "sleeve has wrong tint or pivot")
            _assert(arm["zooTint"] == hand["zooTint"] == "skin", "forearm or hand is not skin")
        if person.get("hair") == "sunhat":
            brim = bpy.data.objects[f"p{idx}_hat_brim_mesh"]
            head = bpy.data.objects[f"p{idx}_head_mesh"]
            _assert(_bounds(brim)[1].x - _bounds(brim)[0].x >
                    1.5 * (_bounds(head)[1].x - _bounds(head)[0].x), "hat has no visible brim")
    print(f"[zoo-refuge] {description['archetypeId']}: rest geometry and budget passed {counts}")


def _test_clips(description, root):
    objects = [root, *root.children_recursive]
    rest = {obj.name: (obj.location.copy(), obj.rotation_euler.copy(), obj.scale.copy())
            for obj in objects}
    tracks = [(obj, track) for obj in objects if obj.animation_data is not None
              for track in obj.animation_data.nla_tracks]
    _assert({track.name for _, track in tracks} == EXPECTED_CLIP_NAMES, "missing clips")
    for clip in EXPECTED_CLIP_NAMES:
        for obj in objects:
            obj.location, obj.rotation_euler, obj.scale = rest[obj.name]
        for _, track in tracks:
            track.mute = track.name != clip
        end = max(strip.frame_end for _, track in tracks if track.name == clip for strip in track.strips)
        for sample in range(9):
            frame = end * sample / 8
            bpy.context.scene.frame_set(int(frame), subframe=frame % 1)
            bpy.context.view_layer.update()
            for person in description["persons"]:
                idx = person["index"]
                if person.get("posture") in {"stroller", "shoulders"}:
                    for joint in ("hips", "leg_l", "leg_r"):
                        obj = bpy.data.objects[f"p{idx}_{joint}"]
                        location, rotation, _ = rest[obj.name]
                        _assert((obj.location - location).length < EPSILON and
                                (Vector(obj.rotation_euler) - Vector(rotation)).length < EPSILON,
                                f"{clip} makes carried {obj.name} walk or leave its seat")
                if person.get("stroller", False):
                    low, high = _bounds(bpy.data.objects["p0_stroller_handle_mesh"])
                    for side in ("l", "r"):
                        arm = bpy.data.objects[f"p{idx}_arm_{side}"]
                        hand = arm.matrix_world @ game_to_blender(arm["zooHand"])
                        _assert(all(low[axis] - EPSILON <= hand[axis] <= high[axis] + EPSILON
                                    for axis in range(3)), f"{clip} releases stroller handle")
                    for obj in objects:
                        if "stroller_wheel" in obj.name:
                            _assert(abs(_bounds(obj)[0].z) < EPSILON, f"{clip} lifts a stroller wheel")
    print(f"[zoo-refuge] {description['archetypeId']}: six clips, nine samples each passed")


def main():
    for path in sorted((VISITORS_DIR / "descriptions").glob("*.json")):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        description = json.loads(path.read_text(encoding="utf-8"))
        palette = load_palette()
        root = build_group(description, palette, build_material(palette))
        bpy.context.view_layer.update()
        _test_rest(description, root)
        _test_faces(description)
        _test_clips(description, root)
    print("[zoo-refuge] visitor pose regression checks passed")


if __name__ == "__main__":
    main()
