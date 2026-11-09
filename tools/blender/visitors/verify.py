"""Headless geometry checks for the chibi animation contacts and merge buckets."""

import json
import math
import sys
from pathlib import Path
from types import SimpleNamespace

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).parent))
from build import build_group, merge_compatible_parts, validate_glb
from palette import build_material, load_palette
from parts import game_to_blender
from human import _derive_proportions, shoulder_leg_points, SHOULDER_SEAT_RADII, STROLLER_HANDLE_FORWARD, STROLLER_HANDLE_HEIGHT_RATIO

FLOOR_TOLERANCE = 0.004
ARM_TOLERANCE = 0.003
ARM_SLEEVE_RATIO = 0.34
ARM_SURFACE_MARGIN = 1.25
CONTACT_TOLERANCE = 0.003


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
            child = next(member for member in description["persons"] if member["index"] == person["shoulderChild"])
            small = _derive_proportions(child)
            _, foot = shoulder_leg_points(person, child, 1)
            reach = Vector((small["hip_w"] + p["limb_r"] + foot[0] - p["shoulder_w"],
                            p["torso"] * 0.35 + p["neck"] + p["head_r"] * SHOULDER_SEAT_RADII + foot[1],
                            foot[2])).length
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


def mesh_surface(obj, inverse):
    points = [inverse @ obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    obj.data.calc_loop_triangles()
    triangles = [tuple(triangle.vertices) for triangle in obj.data.loop_triangles]
    return points, triangles, BVHTree.FromPolygons(points, triangles, all_triangles=True)


def inside_surface(surface, point):
    nearest, _, _, distance = surface.find_nearest(point)
    if nearest is None or distance <= CONTACT_TOLERANCE:
        return False
    direction = Vector((1.0, 0.371, 0.529)).normalized()
    origin = point.copy()
    crossings = 0
    while True:
        hit, _, _, _ = surface.ray_cast(origin, direction)
        if hit is None:
            return crossings % 2 == 1
        crossings += 1
        assert crossings < 100, "ray failed to leave closed visitor geometry"
        origin = hit + direction * 0.00001


def mesh_components(obj, points):
    neighbors = [set() for _ in points]
    for edge in obj.data.edges:
        a, b = edge.vertices
        neighbors[a].add(b)
        neighbors[b].add(a)
    remaining = set(range(len(points)))
    components = []
    while remaining:
        stack = [min(remaining)]
        indices = set()
        while stack:
            index = stack.pop()
            if index in indices:
                continue
            indices.add(index)
            stack.extend(neighbors[index] - indices)
        remaining -= indices
        center = sum((points[index] for index in indices), Vector()) / len(indices)
        components.append((indices, center))
    return components


def verify_hand_geometry(obj, points, grip, radius, clip):
    components = mesh_components(obj, points)
    indices, center = min(components, key=lambda component: (component[1] - grip).length)
    assert (center - grip).length < CONTACT_TOLERANCE, f"parent hand geometry releases child ankle during {clip}"
    assert all(abs((points[index] - center).length - radius) < CONTACT_TOLERANCE for index in indices), f"parent hand is not a rigid round grip during {clip}"


def verify_shoulder_legs(description, meshes, clip):
    for parent in description["persons"]:
        child = parent.get("shoulderChild")
        if child is None:
            continue
        prefix = f"p{parent['index']}_"
        spine = bpy.data.objects[prefix + "spine"]
        inverse = spine.matrix_world.inverted()
        head = bpy.data.objects[prefix + "head"]
        radius = head["zooHeadRadius"]
        center = inverse @ head.matrix_world.translation
        obstacles = [(obj, mesh_surface(obj, inverse)) for obj in meshes if obj["zooPerson"] == parent["index"]]
        feet = []
        for side, sign in (("l", -1), ("r", 1)):
            leg = bpy.data.objects[f"p{child}_leg_{side}"]
            knee = inverse @ leg.matrix_world @ game_to_blender(leg["zooKnee"])
            foot = inverse @ leg.matrix_world @ game_to_blender(leg["zooFoot"])
            feet.append(foot)
            assert -knee.y > radius * 0.65 and -foot.y > radius * 0.85, f"child leg hangs behind parent during {clip}"
            assert sign * foot.x > radius and foot.z < center.z, f"child calf does not hang in front of chest during {clip}"
            assert knee.z > foot.z + radius * 0.65, f"child calf is not hanging during {clip}"
            arm = bpy.data.objects[prefix + f"arm_{side}"]
            hand = inverse @ arm.matrix_world @ game_to_blender(arm["zooHand"])
            grip = foot + Vector((sign * _derive_proportions(parent)["limb_r"], 0, 0))
            assert (hand - grip).length < CONTACT_TOLERANCE, f"parent releases child ankle during {clip}"
            arm_mesh, (arm_points, _, _) = next(obstacle for obstacle in obstacles if obstacle[0].name == prefix + "arm_l_mesh")
            verify_hand_geometry(arm_mesh, arm_points, grip, _derive_proportions(parent)["limb_r"], clip)
            obj = bpy.data.objects[f"p{child}_leg_{side}_mesh"]
            points, triangles, surface = mesh_surface(obj, inverse)
            for obstacle, (_, _, adult_surface) in obstacles:
                def held_contact(point):
                    return obstacle.name == prefix + "arm_l_mesh" and (point - foot).length < _derive_proportions(parent)["limb_r"] * 1.7

                for point in points:
                    inside = inside_surface(adult_surface, point)
                    assert not inside or held_contact(point), f"child leg penetrates {obstacle.name} during {clip}"
                for child_triangle, _ in surface.overlap(adult_surface):
                    centroid = sum((points[index] for index in triangles[child_triangle]), Vector()) / 3
                    assert held_contact(centroid), f"child leg surface crosses {obstacle.name} during {clip}: {tuple(centroid)}"
            assert all(-point.y > radius * 0.65 for point in points if point.z < knee.z - radius * 0.15), f"child calf geometry hangs behind parent during {clip}"
        assert abs(feet[0].x + feet[1].x) < CONTACT_TOLERANCE and abs(feet[0].z - feet[1].z) < CONTACT_TOLERANCE and abs(feet[0].y - feet[1].y) < CONTACT_TOLERANCE, f"asymmetric child legs during {clip}"


def test_shoulder_guard(description, meshes, clip):
    if description["archetypeId"] != "shoulder-ride":
        return
    obj = bpy.data.objects["p1_leg_l_mesh"]
    original = [vertex.co.copy() for vertex in obj.data.vertices]
    for target in (bpy.data.objects["p0_head"].matrix_world.translation,
                   bpy.data.objects["p0_body_mesh"].matrix_world @ Vector((0, 0, 0.05))):
        local = obj.matrix_world.inverted() @ target
        for vertex in obj.data.vertices:
            vertex.co = local + vertex.co * 0.05
        try:
            verify_shoulder_legs(description, meshes, clip)
        except AssertionError as error:
            assert "penetrates" in str(error) or "surface crosses" in str(error), str(error)
        else:
            raise AssertionError(f"shoulder guard accepts penetration during {clip}")
        finally:
            for vertex, position in zip(obj.data.vertices, original):
                vertex.co = position
    inverse = bpy.data.objects["p0_spine"].matrix_world.inverted()
    to_local = obj.matrix_world.inverted() @ bpy.data.objects["p0_spine"].matrix_world
    for vertex in obj.data.vertices:
        point = inverse @ obj.matrix_world @ vertex.co
        point.y += 1.0
        vertex.co = to_local @ point
    try:
        verify_shoulder_legs(description, meshes, clip)
    except AssertionError as error:
        assert "geometry hangs behind" in str(error), str(error)
    else:
        raise AssertionError(f"shoulder guard accepts rear-hanging geometry during {clip}")
    finally:
        for vertex, position in zip(obj.data.vertices, original):
            vertex.co = position
    leg = bpy.data.objects["p1_leg_l"]
    knee, foot = list(leg["zooKnee"]), list(leg["zooFoot"])
    leg["zooKnee"] = [knee[0], knee[1], -abs(knee[2])]
    leg["zooFoot"] = [foot[0], foot[1], -abs(foot[2])]
    try:
        verify_shoulder_legs(description, meshes, clip)
    except AssertionError as error:
        assert "hangs behind" in str(error), str(error)
    else:
        raise AssertionError(f"shoulder guard accepts rear-hanging legs during {clip}")
    finally:
        leg["zooKnee"], leg["zooFoot"] = knee, foot
    mesh = bpy.data.objects["p0_arm_l_mesh"]
    arm = bpy.data.objects["p0_arm_l"]
    grip = mesh.matrix_world.inverted() @ arm.matrix_world @ game_to_blender(arm["zooHand"])
    points = [vertex.co.copy() for vertex in mesh.data.vertices]
    indices, _ = min(mesh_components(mesh, points), key=lambda component: (component[1] - grip).length)
    for index in indices:
        mesh.data.vertices[index].co.z += 1.0
    try:
        verify_shoulder_legs(description, meshes, clip)
    except AssertionError as error:
        assert "hand geometry releases" in str(error), str(error)
    else:
        raise AssertionError(f"shoulder guard accepts detached hand geometry during {clip}")
    finally:
        for index in indices:
            mesh.data.vertices[index].co = points[index]


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
        samples = math.ceil(end) * 2
        for step in range(samples + 1):
            time = end * step / samples
            bpy.context.scene.frame_set(int(time), subframe=time % 1)
            for obj in meshes:
                assert all(math.isfinite(value) for row in obj.matrix_world for value in row), f"invalid pose: {clip}"
            verify_arm_lengths(description, meshes, clip)
            verify_shoulder_legs(description, meshes, clip)
            if step == 0:
                test_arm_guard(description, meshes, clip)
                test_shoulder_guard(description, meshes, clip)
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
