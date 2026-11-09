"""Headless geometry checks for the chibi animation contacts and merge buckets."""

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).parent))
from build import build_group, merge_compatible_parts
from palette import build_material, load_palette
from parts import game_to_blender

FLOOR_TOLERANCE = 0.004


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


def verify(description, exported=False):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if exported:
        root = Path(__file__).resolve().parents[3]
        path = root / "assets/models/visitors" / f"{description['archetypeId']}.glb"
        bpy.ops.import_scene.gltf(filepath=str(path))
        group = next(obj for obj in bpy.data.objects if obj.get("zooVisitor") is not None)
        bpy.context.scene.frame_set(0)
    else:
        palette = load_palette()
        group = build_group(description, palette, build_material(palette))
        merge_compatible_parts(group)
    meshes = [obj for obj in group.children_recursive if obj.type == "MESH"]
    rest = {obj.name: obj.matrix_basis.copy() for obj in group.children_recursive}
    buckets = [(obj.parent.name, obj["zooPerson"], obj["zooTint"]) for obj in meshes]
    assert len(buckets) == len(set(buckets)), "unmerged compatible pieces"
    standing = [person for person in description["persons"] if person.get("posture", "standing") == "standing"]
    for clip in ("walk", "stop", "look", "point", "photo", "sit"):
        end = select_clip(group, clip, rest)
        assert end > 0, f"empty animation: {clip}"
        for step in range(9):
            time = end * step / 8
            bpy.context.scene.frame_set(int(time), subframe=time % 1)
            for obj in meshes:
                assert all(math.isfinite(value) for row in obj.matrix_world for value in row), f"invalid pose: {clip}"
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
        assert (hands[0] - hands[1]).length < 0.12, "hands do not meet at camera"
        camera = bpy.data.objects[f"p{person['index']}_camera"]
        forward = camera.matrix_world.to_quaternion() @ Vector((0.0, -1.0, 0.0))
        assert forward.dot(Vector((0.0, -1.0, 0.0))) > 0.99, "camera does not face forward"
        head = bpy.data.objects[f"p{person['index']}_head"]
        camera_local = head.matrix_world.inverted() @ camera.matrix_world.translation
        assert -camera_local.y >= head["zooHeadRadius"] * 1.05, "camera inside face"
        assert abs(camera.matrix_world.translation.z - head.matrix_world.translation.z) < 0.08, "camera not at face height"
    source = "GLB" if exported else "source"
    print(f"[zoo-refuge] {description['archetypeId']} ({source}): six clips, merge, walk, sit, photo verified; floor minimum {lowest:.4f} m")


def main():
    for path in sorted((Path(__file__).parent / "descriptions").glob("*.json")):
        description = json.loads(path.read_text())
        verify(description)
        verify(description, exported=True)


if __name__ == "__main__":
    main()
