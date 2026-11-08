"""Geometry/contact regressions, executed by headless Blender.

blender -b --factory-startup --python-exit-code 1 -P tools/blender/visitors/test_poses.py
"""

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

VISITORS_DIR = Path(__file__).parent
sys.path.insert(0, str(VISITORS_DIR))
from build import EXPECTED_CLIP_NAMES, build_group, _count_triangles_per_person  # noqa: E402
from human import game_to_blender  # noqa: E402
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


def _test_rest(description, root):
    for obj in root.children_recursive:
        if obj.type == "MESH":
            _assert(_bounds(obj)[0].z >= -EPSILON, f"{obj.name} penetrates the ground")
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
                _assert(_bounds(body)[0].y > _bounds(head)[1].y,
                        "child torso intersects the carrier's head")
        if person.get("camera", False):
            arm = bpy.data.objects[f"p{idx}_arm_r"]
            hand = arm.matrix_world @ game_to_blender(arm["zooHand"])
            low, high = _bounds(bpy.data.objects[f"p{idx}_camera_mesh"])
            _assert(all(low[axis] - EPSILON <= hand[axis] <= high[axis] + EPSILON
                        for axis in range(3)), "camera floats away from the hand")
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
        _test_clips(description, root)
    print("[zoo-refuge] visitor pose regression checks passed")


if __name__ == "__main__":
    main()
