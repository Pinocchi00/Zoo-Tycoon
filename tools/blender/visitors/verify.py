"""Headless geometry checks for the chibi animation contacts and merge buckets."""

import json
import math
import sys
import time
from pathlib import Path
from types import SimpleNamespace

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).parent))
from build import build_group, merge_compatible_parts, validate_glb
from palette import build_material, load_palette
from parts import game_to_blender
from human import _derive_proportions, shoulder_leg_points, shoulder_seat_height, SEATED_LEG_FORWARD_RATIO, STROLLER_HANDLE_FORWARD, STROLLER_HANDLE_HEIGHT_RATIO, SUNHAT_BRIM_CENTER_HEIGHT_RATIO, SUNHAT_BRIM_DIAMETER_TO_HEAD_WIDTH, SUNHAT_BRIM_HALF_THICKNESS_RATIO, SUNHAT_CROWN_TOP_RATIO

FLOOR_TOLERANCE = 0.004
ARM_TOLERANCE = 0.003
ARM_SLEEVE_RATIO = 0.34
ARM_SURFACE_MARGIN = 1.25
CONTACT_TOLERANCE = 0.003
CHILD_FOOT_MIN_SIDE_OFFSET = 0.08
CHILD_FOOT_MAX_SIDE_OFFSET_RATIO = 1.3
EYE_OCCLUSION_TOLERANCE = 0.003
SUNHAT_DIAMETER_MAX_TO_HEAD_WIDTH = 1.25
SUNHAT_DIAMETER_TOLERANCE = 0.01
SUNHAT_SEATING_TOLERANCE = 0.003


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


def prepare_proportions(description):
    proportions = {person["index"]: _derive_proportions(person) for person in description["persons"]}
    for person in description["persons"]:
        p = proportions[person["index"]]
        reach = p["arm_len"]
        if person.get("stroller"):
            vertical = person["height"] * STROLLER_HANDLE_HEIGHT_RATIO - p["hip_height"] - p["torso"] * 0.65
            reach = math.hypot(vertical, STROLLER_HANDLE_FORWARD)
        elif person.get("shoulderChild") is not None:
            child = next(member for member in description["persons"] if member["index"] == person["shoulderChild"])
            small = proportions[child["index"]]
            _, foot = shoulder_leg_points(person, child, 1)
            reach = Vector((small["hip_w"] + p["limb_r"] + foot[0] - p["shoulder_w"],
                            p["torso"] * 0.35 + p["neck"] + shoulder_seat_height(person, child) + foot[1],
                            foot[2] + small["leg_len"] * SEATED_LEG_FORWARD_RATIO)).length
        p["arm_reach"] = reach
        p["photo_reach"] = reach
        if person.get("camera"):
            target = Vector((p["shoulder_w"] - p["limb_r"] * 1.4, p["head_r"] * 1.3 + 0.03,
                             p["torso"] + p["neck"] - (p["torso"] * 0.65 - p["arm_len"] * ARM_SLEEVE_RATIO)))
            p["photo_reach"] = p["arm_len"] * ARM_SLEEVE_RATIO + target.length
        p["shoulders"] = [game_to_blender([sign * p["shoulder_w"], p["torso"] * 0.65, 0]) for sign in (-1, 1)]
        p["grip_offsets"] = {side: Vector((sign * p["limb_r"], 0, 0)) for side, sign in (("l", -1), ("r", 1))}
    return proportions


def verify_arm_lengths(description, meshes, clip, proportions):
    """Bound both joint reach and actual skin geometry in the person's spine frame."""
    for person in description["persons"]:
        prefix = f"p{person['index']}_"
        p = proportions[person["index"]]
        spine = bpy.data.objects[prefix + "spine"]
        inverse = spine.matrix_world.inverted()
        reach = p["photo_reach"] if clip == "photo" else p["arm_reach"]
        shoulders = p["shoulders"]
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


def test_arm_guard(description, meshes, clip, proportions):
    child = next((person for person in description["persons"] if person.get("posture") == "shoulders"), None)
    if child is None:
        return
    prefix = f"p{child['index']}_"
    p = _derive_proportions(child)
    for side, sign in zip(("l", "r"), (-1, 1)):
        arm = bpy.data.objects[prefix + f"arm_{side}"]
        original = list(arm["zooHand"])
        old_endpoint = [sign * p["head_r"] * 0.65,
                        -p["torso"] * 0.65 - p["head_r"] * 0.65,
                        p["head_r"] * 0.65]
        arm["zooHand"] = [value * (1 - ARM_SLEEVE_RATIO) for value in old_endpoint]
        try:
            verify_arm_lengths(description, meshes, clip, proportions)
        except AssertionError as error:
            assert "arm reach exceeds" in str(error), str(error)
        else:
            raise AssertionError(f"arm guard accepted the old shoulder-child {side} reach during {clip}")
        finally:
            arm["zooHand"] = original

        mesh = supported_arm_mesh(meshes, prefix, side)
        grip = mesh.matrix_world.inverted() @ arm.matrix_world @ game_to_blender(arm["zooHand"])
        points = [vertex.co.copy() for vertex in mesh.data.vertices]
        components = mesh_components(mesh, points)
        indices, _ = min(components, key=lambda component: (component[1] - grip).length)
        for index in indices:
            mesh.data.vertices[index].co.z -= child["height"]
        try:
            verify_arm_lengths(description, meshes, clip, proportions)
        except AssertionError as error:
            assert "arm geometry exceeds" in str(error), str(error)
        else:
            raise AssertionError(f"arm guard accepted elongated {side} geometry during {clip}")
        finally:
            for index, point in enumerate(points):
                mesh.data.vertices[index].co = point


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


def supported_arm_mesh(meshes, prefix, side):
    named = next((obj for obj in meshes if obj.name == prefix + f"arm_{side}_mesh"), None)
    if named is not None:
        return named
    # Both supported arms have one spine/skin merge bucket; select the actual
    # right-hand component by its grip, rather than silently testing the left.
    return next(obj for obj in meshes if obj.parent.name == prefix + "spine" and obj["zooTint"] == "skin")


def verify_shoulder_legs(description, meshes, clip, proportions):
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
        small = proportions[child]
        adult = proportions[parent["index"]]
        child_body = bpy.data.objects[f"p{child}_body_mesh"]
        bottom = min((inverse @ child_body.matrix_world @ vertex.co).z for vertex in child_body.data.vertices)
        crown = center.z + radius * 1.03
        assert -0.02 <= bottom - crown <= 0.003, f"child seat loses crown contact during {clip}"
        obstacles = [(obj, mesh_surface(obj, inverse)) for obj in meshes if obj["zooPerson"] == parent["index"]]
        feet = []
        for side, sign in (("l", -1), ("r", 1)):
            leg = bpy.data.objects[f"p{child}_leg_{side}"]
            knee = inverse @ leg.matrix_world @ game_to_blender(leg["zooKnee"])
            foot = inverse @ leg.matrix_world @ game_to_blender(leg["zooFoot"])
            feet.append(foot)
            hip = inverse @ leg.matrix_world.translation
            assert (knee - hip).length <= small["leg_len"] * 1.5 and (foot - knee).length <= small["leg_len"] * 1.6, f"child leg exceeds normal length during {clip}"
            assert -knee.y > small["leg_len"] and -foot.y > small["leg_len"], f"child leg hangs behind parent during {clip}"
            verify_child_foot_lateral_offset(foot, sign, small["hip_w"], radius, clip)
            assert center.z < foot.z < crown, f"child calf does not hang above forehead during {clip}"
            assert knee.z > foot.z + small["leg_len"] * 0.5, f"child calf is not hanging during {clip}"
            arm = bpy.data.objects[prefix + f"arm_{side}"]
            hand = inverse @ arm.matrix_world @ game_to_blender(arm["zooHand"])
            grip = foot + adult["grip_offsets"][side]
            assert (hand - grip).length < CONTACT_TOLERANCE, f"parent releases child ankle during {clip}"
            arm_mesh = supported_arm_mesh(meshes, prefix, side)
            _, (arm_points, _, _) = next(obstacle for obstacle in obstacles if obstacle[0] == arm_mesh)
            verify_hand_geometry(arm_mesh, arm_points, grip, adult["limb_r"], clip)
            obj = bpy.data.objects[f"p{child}_leg_{side}_mesh"]
            points, triangles, surface = mesh_surface(obj, inverse)
            for obstacle, (_, _, adult_surface) in obstacles:
                def held_contact(point):
                    return obstacle == arm_mesh and (point - foot).length < adult["limb_r"] * 1.7

                for point in points:
                    inside = inside_surface(adult_surface, point)
                    assert not inside or held_contact(point), f"child leg penetrates {obstacle.name} during {clip}: {tuple(point)}"
                for child_triangle, _ in surface.overlap(adult_surface):
                    centroid = sum((points[index] for index in triangles[child_triangle]), Vector()) / 3
                    assert held_contact(centroid), f"child leg surface crosses {obstacle.name} during {clip}: {tuple(centroid)}"
            assert all(-point.y > small["leg_len"] for point in points if point.z < knee.z - small["limb_r"]), f"child calf geometry hangs behind parent during {clip}"
        assert abs(feet[0].x + feet[1].x) < CONTACT_TOLERANCE and abs(feet[0].z - feet[1].z) < CONTACT_TOLERANCE and abs(feet[0].y - feet[1].y) < CONTACT_TOLERANCE, f"asymmetric child legs during {clip}"


def verify_child_foot_lateral_offset(foot, sign, hip_width, head_radius, clip):
    offset = sign * foot.x
    assert hip_width < offset < head_radius * CHILD_FOOT_MAX_SIDE_OFFSET_RATIO, (
        f"child feet spread beyond forehead during {clip}: side offset {offset:.4f} m"
    )


def is_eye_component(points, radius):
    low = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    high = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    center = (low + high) * 0.5
    width, depth, height = (high - low)
    return (
        radius * 0.30 <= abs(center.x) <= radius * 0.56
        and -radius * 0.90 <= center.y <= -radius * 0.65
        and -radius * 0.38 <= center.z <= -radius * 0.10
        and radius * 0.30 <= width <= radius * 0.48
        and depth <= radius * 0.16
        and radius * 0.38 <= height <= radius * 0.62
    )


def verify_child_eye_clearance(description, meshes, clip):
    for parent in description["persons"]:
        child_index = parent.get("shoulderChild")
        if child_index is None:
            continue
        parent_prefix = f"p{parent['index']}_"
        child_prefix = f"p{child_index}_"
        inverse = bpy.data.objects[parent_prefix + "spine"].matrix_world.inverted()
        eyes = [bpy.data.objects.get(parent_prefix + f"eye_{side}_mesh") for side in ("l", "r")]
        eye_points = []
        if all(eye is not None for eye in eyes):
            for eye in eyes:
                if eye is None:
                    continue
                eye_points.append([inverse @ eye.matrix_world @ vertex.co for vertex in eye.data.vertices])
        else:
            head = bpy.data.objects[parent_prefix + "head"]
            radius = head["zooHeadRadius"]
            head_inverse = head.matrix_world.inverted()
            eye_components = []
            for face in meshes:
                if face.parent != head or face.get("zooTint") != "none":
                    continue
                head_points = [head_inverse @ face.matrix_world @ vertex.co for vertex in face.data.vertices]
                world_points = [inverse @ face.matrix_world @ vertex.co for vertex in face.data.vertices]
                for indices, _ in mesh_components(face, head_points):
                    component = [head_points[index] for index in indices]
                    if is_eye_component(component, radius):
                        eye_components.append([world_points[index] for index in indices])
            assert len(eye_components) == 2, f"could not identify both parent eye components during {clip}"
            eye_points.extend(eye_components)

        eye_bounds = []
        for points in eye_points:
            low = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
            high = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
            eye_bounds.append((low, high))

        for obj in meshes:
            if obj.get("zooPerson") != child_index or not any(
                part in obj.name for part in ("_leg_", "_shin_", "_shoe_")
            ):
                continue
            for vertex in obj.data.vertices:
                point = inverse @ obj.matrix_world @ vertex.co
                for low, high in eye_bounds:
                    in_eye_projection = low.x <= point.x <= high.x and low.z <= point.z <= high.z
                    assert not (
                        in_eye_projection and point.y < low.y - EYE_OCCLUSION_TOLERANCE
                    ), f"child covers parent eyes during {clip}: {tuple(point)}"


def verify_sunhat_fit(description, meshes):
    for person in description["persons"]:
        if person.get("hair") != "sunhat":
            continue
        prefix = f"p{person['index']}_"
        head = bpy.data.objects[prefix + "head"]
        head_radius = head["zooHeadRadius"]
        head_width_radius = head_radius * 1.04
        inverse = head.matrix_world.inverted()
        face = next(
            obj for obj in meshes
            if obj.parent == head and obj["zooPerson"] == person["index"] and obj["zooTint"] == "none"
        )
        points = [inverse @ face.matrix_world @ vertex.co for vertex in face.data.vertices]
        brim_outer = [point for point in points if math.hypot(point.x, point.y) > head_width_radius * 1.1]
        assert brim_outer, f"missing sunhat brim for {prefix}"
        brim_radius = max(math.hypot(point.x, point.y) for point in brim_outer)
        diameter_ratio = brim_radius / head_width_radius
        assert diameter_ratio <= SUNHAT_DIAMETER_MAX_TO_HEAD_WIDTH, (
            f"sunhat brim exceeds head width for {prefix}: {diameter_ratio:.3f}"
        )
        assert abs(diameter_ratio - SUNHAT_BRIM_DIAMETER_TO_HEAD_WIDTH) <= SUNHAT_DIAMETER_TOLERANCE, (
            f"sunhat brim diameter ratio changed for {prefix}: {diameter_ratio:.3f}"
        )
        center_height = head_radius * SUNHAT_BRIM_CENTER_HEIGHT_RATIO
        half_thickness = head_radius * SUNHAT_BRIM_HALF_THICKNESS_RATIO
        assert all(
            abs(point.z - center_height) <= half_thickness + SUNHAT_SEATING_TOLERANCE
            for point in brim_outer
        ), f"sunhat brim is not flat and regularly thick for {prefix}"
        crown_top = max(point.z for point in points)
        assert abs(crown_top - head_radius * SUNHAT_CROWN_TOP_RATIO) <= SUNHAT_SEATING_TOLERANCE, (
            f"sunhat crown does not stay seated on its head for {prefix}"
        )


def test_shoulder_guard(description, meshes, clip, proportions):
    if description["archetypeId"] != "shoulder-ride":
        return
    root = bpy.data.objects["p1_root"]
    original_location = root.location.copy()
    for offset in (-0.08, 0.08):
        root.location.z += offset
        bpy.context.view_layer.update()
        try:
            verify_shoulder_legs(description, meshes, clip, proportions)
        except AssertionError as error:
            assert "crown contact" in str(error), str(error)
        else:
            raise AssertionError("seat guard accepts floating or deeply embedded child")
        finally:
            root.location = original_location
            bpy.context.view_layer.update()
    leg = bpy.data.objects["p1_leg_r"]
    original_knee = list(leg["zooKnee"])
    leg["zooKnee"] = [value * 3 for value in original_knee]
    try:
        verify_shoulder_legs(description, meshes, clip, proportions)
    except AssertionError as error:
        assert "normal length" in str(error), str(error)
    else:
        raise AssertionError("leg guard accepts elongated child thigh")
    finally:
        leg["zooKnee"] = original_knee
    obj = bpy.data.objects["p1_leg_l_mesh"]
    original = [vertex.co.copy() for vertex in obj.data.vertices]
    for target in (bpy.data.objects["p0_head"].matrix_world.translation,
                   bpy.data.objects["p0_body_mesh"].matrix_world @ Vector((0, 0, 0.05))):
        local = obj.matrix_world.inverted() @ target
        for vertex in obj.data.vertices:
            vertex.co = local + vertex.co * 0.05
        try:
            verify_shoulder_legs(description, meshes, clip, proportions)
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
        verify_shoulder_legs(description, meshes, clip, proportions)
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
        verify_shoulder_legs(description, meshes, clip, proportions)
    except AssertionError as error:
        assert "hangs behind" in str(error), str(error)
    else:
        raise AssertionError(f"shoulder guard accepts rear-hanging legs during {clip}")
    finally:
        leg["zooKnee"], leg["zooFoot"] = knee, foot
    for side in ("l", "r"):
        mesh = supported_arm_mesh(meshes, "p0_", side)
        arm = bpy.data.objects[f"p0_arm_{side}"]
        grip = mesh.matrix_world.inverted() @ arm.matrix_world @ game_to_blender(arm["zooHand"])
        points = [vertex.co.copy() for vertex in mesh.data.vertices]
        indices, _ = min(mesh_components(mesh, points), key=lambda component: (component[1] - grip).length)
        for index in indices:
            mesh.data.vertices[index].co.z += 1.0
        try:
            verify_shoulder_legs(description, meshes, clip, proportions)
        except AssertionError as error:
            assert "hand geometry releases" in str(error), str(error)
        else:
            raise AssertionError(f"shoulder guard accepts detached {side} hand geometry during {clip}")
        finally:
            for index in indices:
                mesh.data.vertices[index].co = points[index]


def prepare_junctions(description, meshes):
    """Cache topology once; exported vertex ordering is allowed to differ."""
    groups = []
    for person in description["persons"]:
        prefix = f"p{person['index']}_"
        components = []
        for obj in meshes:
            if not obj.name.startswith(prefix) or not any(obj.name == prefix + name for name in (
                "body_mesh", "arm_l_mesh", "arm_r_mesh", "hand_l_mesh", "hand_r_mesh", "leg_l_mesh", "leg_r_mesh"
            )):
                continue
            obj.data.calc_loop_triangles()
            points = [vertex.co.copy() for vertex in obj.data.vertices]
            for indices, _ in mesh_components(obj, points):
                ordered = sorted(indices)
                remap = {index: position for position, index in enumerate(ordered)}
                triangles = [tuple(remap[index] for index in triangle.vertices)
                             for triangle in obj.data.loop_triangles if triangle.vertices[0] in indices]
                components.append((obj, ordered, triangles))
        groups.append(components)
    return groups


def verify_source_junctions(description, clip):
    """Check each intended neighbour before merging can hide a broken seam."""
    for person in description["persons"]:
        prefix = f"p{person['index']}_"
        inverse = bpy.data.objects[prefix + "spine"].matrix_world.inverted()
        for side in ("l", "r"):
            pairs = [("body", f"sleeve_{side}"), (f"sleeve_{side}", f"arm_{side}"),
                     (f"arm_{side}", f"hand_{side}"), ("body", f"leg_{side}")]
            if person.get("posture") in {"shoulders", "stroller"}:
                pairs.extend(((f"leg_{side}", f"shin_{side}"), (f"shin_{side}", f"shoe_{side}")))
            else:
                pairs.append((f"leg_{side}", f"shoe_{side}"))
            for first, second in pairs:
                a = bpy.data.objects[prefix + first + "_mesh"]
                b = bpy.data.objects[prefix + second + "_mesh"]
                points, _, surface = mesh_surface(a, inverse)
                other_points, _, other_surface = mesh_surface(b, inverse)
                assert surface.overlap(other_surface) or inside_surface(surface, other_points[0]) or inside_surface(other_surface, points[0]), f"open neighbouring junction {a.name}/{b.name} during {clip}"


def verify_junctions(groups, clip):
    for components in groups:
        surfaces = []
        for obj, indices, triangles in components:
            points = [obj.matrix_world @ obj.data.vertices[index].co for index in indices]
            low = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
            high = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
            surfaces.append((points, low, high, BVHTree.FromPolygons(points, triangles, all_triangles=True)))
        connected = {0}
        while True:
            previous = len(connected)
            for a in tuple(connected):
                points, low, high, surface = surfaces[a]
                for b, (other_points, other_low, other_high, other_surface) in enumerate(surfaces):
                    if b in connected or any(low[axis] > other_high[axis] or high[axis] < other_low[axis] for axis in range(3)):
                        continue
                    if surface.overlap(other_surface) or inside_surface(surface, other_points[0]) or inside_surface(other_surface, points[0]):
                        connected.add(b)
            if len(connected) == previous:
                break
        assert len(connected) == len(components), f"open body/limb junction during {clip}: {[components[index][0].name for index in range(len(components)) if index not in connected]}"


def test_source_junction_guard(description, clip):
    for side in ("l", "r"):
        hand = bpy.data.objects[f"p0_hand_{side}_mesh"]
        original = hand.location.copy()
        hand.location.x += 1
        bpy.context.view_layer.update()
        try:
            verify_source_junctions(description, clip)
        except AssertionError as error:
            assert "open neighbouring junction" in str(error), str(error)
        else:
            raise AssertionError(f"junction guard accepts detached {side} hand")
        finally:
            hand.location = original
            bpy.context.view_layer.update()


def test_junction_guard(groups, clip):
    obj, indices, _ = groups[0][-1]
    original = [obj.data.vertices[index].co.copy() for index in indices]
    for index in indices:
        obj.data.vertices[index].co.x += 10
    try:
        verify_junctions(groups, clip)
    except AssertionError as error:
        assert "open body/limb junction" in str(error), str(error)
    else:
        raise AssertionError("junction guard accepts a detached limb segment")
    finally:
        for index, point in zip(indices, original):
            obj.data.vertices[index].co = point


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
        rest = {obj.name: obj.matrix_basis.copy() for obj in group.children_recursive}
        for clip in ("walk", "stop", "look", "point", "photo", "sit"):
            end = select_clip(group, clip, rest)
            samples = max(8, math.ceil(end) * 2)
            for step in range(samples + 1):
                frame = end * step / samples
                bpy.context.scene.frame_set(int(frame), subframe=frame % 1)
                verify_source_junctions(description, clip)
                verify_child_eye_clearance(
                    description,
                    [obj for obj in group.children_recursive if obj.type == "MESH"],
                    clip,
                )
                if step == 0:
                    test_source_junction_guard(description, clip)
        select_clip(group, "", rest)
        bpy.context.scene.frame_set(0)
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
        colors = ("eye_black", "eye_shine", "nose_dark", "fur_jaguar_light") if person.get("hair") == "sunhat" else ("eye_black", "eye_shine", "nose_dark")
        expected = {tuple(round(value, 5) for value in palette.uv(color)) for color in colors}
        assert face_uvs == expected, "facial bucket lost the eyes, white catchlights or mouth"
        skin = bpy.data.objects[f"p{person['index']}_head_mesh"]
        assert all((loop.uv - Vector(palette.uv("eye_shine"))).length < 0.0001 for loop in skin.data.uv_layers.active.data), "facial details remain in the skin bucket"
    verify_sunhat_fit(description, meshes)
    standing = [person for person in description["persons"] if person.get("posture", "standing") == "standing"]
    proportions = prepare_proportions(description)
    junctions = prepare_junctions(description, meshes)
    for clip in ("walk", "stop", "look", "point", "photo", "sit"):
        end = select_clip(group, clip, rest)
        assert end > 0, f"empty animation: {clip}"
        samples = max(8, math.ceil(end) * 2)
        for step in range(samples + 1):
            time = end * step / samples
            bpy.context.scene.frame_set(int(time), subframe=time % 1)
            for obj in meshes:
                assert all(math.isfinite(value) for row in obj.matrix_world for value in row), f"invalid pose: {clip}"
            verify_arm_lengths(description, meshes, clip, proportions)
            verify_child_eye_clearance(description, meshes, clip)
            verify_shoulder_legs(description, meshes, clip, proportions)
            verify_junctions(junctions, clip)
            if step == 0:
                test_arm_guard(description, meshes, clip, proportions)
                test_shoulder_guard(description, meshes, clip, proportions)
                test_junction_guard(junctions, clip)
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
    started = time.perf_counter()
    for path in sorted((Path(__file__).parent / "descriptions").glob("*.json")):
        description = json.loads(path.read_text())
        verify(description)
        verify(description, exported=True)
    print(f"[zoo-refuge] verify.py duration: {time.perf_counter() - started:.2f} s")


if __name__ == "__main__":
    main()
