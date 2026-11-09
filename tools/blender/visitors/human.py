"""Articulated, non-skinned human figure built from reused animal primitives.

Each person is a hierarchy of Empty pivots and Mesh parts.  build_part is reused
unchanged; the visitor pipeline only sets custom properties and parents afterwards.
"""

from pathlib import Path
import math

import bpy
import bmesh
from mathutils import Vector

BLENDER_DIR = Path(__file__).parent.parent
import sys

sys.path.insert(0, str(BLENDER_DIR))
from parts import build_part, game_to_blender  # noqa: E402

PIVOT_DISPLAY_SIZE = 0.05
STROLLER_HANDLE_HEIGHT_RATIO = 0.59
STROLLER_HANDLE_FORWARD = 0.38
STROLLER_SEAT_HEIGHT = 0.61
ROUND_SEGMENTS = 16
ROUND_RINGS = 4
LIMB_SEGMENTS = 12
EYE_SEGMENTS = 20
HAIR_SEGMENTS = 24
HAIR_RINGS = 5
SEAT_HAIR_OVERLAP = 0.012
SEATED_LEG_FORWARD_RATIO = 0.4


def shoulder_seat_height(parent, child):
    adult, small = _derive_proportions(parent), _derive_proportions(child)
    return adult["head_r"] * 1.03 + small["torso"] * 0.34 - SEAT_HAIR_OVERLAP


def shoulder_leg_points(parent, child, sign):
    """Short bent legs rest above the forehead rather than straddling the skull."""
    small = _derive_proportions(child)
    length = small["leg_len"]
    knee = [sign * length * 0.27, -length * 0.20, length * 1.33]
    foot = [knee[0], -length * 1.50, length * 2.10]
    return knee, foot


def _empty(name, location, parent=None):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = PIVOT_DISPLAY_SIZE
    obj.location = game_to_blender(location)
    if parent is not None:
        obj.parent = parent
    bpy.context.collection.objects.link(obj)
    return obj


def _make(spec, palette, material):
    """build_part plus visitor metadata, with a unique mesh object name."""
    if spec.get("zooTint", "none") != "none":
        spec = dict(spec, color="eye_shine")
    obj = build_part(spec, palette, material)
    # Pivots use the base name (e.g. p0_head); meshes get a _mesh suffix so
    # every object and data-block name in the scene is unique and stable for
    # the loader and the glTF exporter.
    mesh_name = f"{spec['name']}_mesh"
    obj.name = mesh_name
    obj.data.name = mesh_name
    obj["zooPerson"] = spec["zooPerson"]
    obj["zooTint"] = spec.get("zooTint", "none")
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.data.update()
    return obj


def _blob(
    name,
    center,
    radii,
    color,
    person,
    tint,
    palette,
    material,
    segments=8,
    rings=6,
    exponent=1.0,
    face_forward=False,
):
    obj = _make(
        {
            "name": name,
            "kind": "body",
            "center": center,
            "radii": [radii[0], radii[2], radii[1]] if face_forward else radii,
            "pitchDeg": 90.0 if face_forward else 0.0,
            "segments": segments,
            "rings": rings,
            "exponent": exponent,
            "color": color,
            "zooPerson": person,
            "zooTint": tint,
            "bone": name,
        },
        palette,
        material,
    )
    if segments >= 12 and rings >= 4:
        uv = obj.data.uv_layers.active.data[0].uv.copy()
        vertices, faces = [], []
        for ring in range(rings + 1):
            latitude = math.pi * ring / rings
            count = 1 if ring in (0, rings) else max(4, round(segments * math.sin(latitude) / 4) * 4)
            start = len(vertices)
            for segment in range(count):
                longitude = 2 * math.pi * segment / count
                x = radii[0] * math.sin(latitude) * math.cos(longitude)
                along = math.cos(latitude)
                across = math.sin(latitude) * math.sin(longitude)
                point = [x, radii[1] * (across if face_forward else along),
                         radii[2] * (along if face_forward else across)]
                vertices.append(game_to_blender([a + b for a, b in zip(center, point)]))
            if ring:
                _join_rings(faces, previous_start, previous_count, start, count)
            previous_start, previous_count = start, count
        # Ring winding is reversed when the polar axis changes from up to forward.
        if face_forward:
            faces = [tuple(reversed(face)) for face in faces]
        _replace_surface(obj, vertices, faces, uv)
    return obj


def _join_rings(faces, first, first_count, second, second_count):
    a = b = 0
    while a < first_count or b < second_count:
        left = first + a % first_count
        right = second + b % second_count
        if first_count == 1:
            faces.append((left, second + (b + 1) % second_count, right))
            b += 1
            if b == second_count:
                break
        elif second_count == 1:
            faces.append((left, first + (a + 1) % first_count, right))
            a += 1
            if a == first_count:
                break
        elif (a + 1) / first_count <= (b + 1) / second_count:
            faces.append((left, first + (a + 1) % first_count, right))
            a += 1
        else:
            faces.append((left, second + (b + 1) % second_count, right))
            b += 1


def _replace_surface(obj, vertices, faces, uv):
    obj.data.clear_geometry()
    obj.data.from_pydata(vertices, [], faces)
    for layer in list(obj.data.uv_layers):
        obj.data.uv_layers.remove(layer)
    layer = obj.data.uv_layers.new()
    for loop in layer.data:
        loop.uv = uv
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.data.update()


def _limb(
    name,
    start,
    end,
    start_radius,
    end_radius,
    color,
    person,
    tint,
    palette,
    material,
    segments=10,
):
    return _make(
        {
            "name": name,
            "kind": "leg",
            "start": start,
            "end": end,
            "segments": segments,
            "startRadius": start_radius,
            "endRadius": end_radius,
            "color": color,
            "zooPerson": person,
            "zooTint": tint,
            "bone": name,
        },
        palette,
        material,
    )


def _derive_proportions(params):
    h = params["height"]
    w = params.get("width", 1.0)
    head_r = h / (2.0 * params.get("heads", 2.0)) * params.get("headScale", 1.0)
    leg = h * params.get("legRatio", 0.20)
    hip = leg + h * 0.10
    head_center = h - head_r * 0.94
    torso = head_center - hip - head_r * 0.55
    return {
        "hip_height": hip,
        "torso": torso,
        "neck": head_r * 0.55,
        "head_r": head_r,
        "shoulder_w": h * 0.175 * w,
        "hip_w": h * 0.105 * w,
        "arm_len": h * 0.19,
        "leg_len": leg,
        "body_w": h * 0.205 * w,
        "body_d": h * 0.155 * w,
        "limb_r": h * 0.082,
    }


def _round_limb(name, start, end, radius, color, person, tint, palette, material, segments=LIMB_SEGMENTS, rings=ROUND_RINGS, cap_ratio=1.0):
    center = [(a + b) * 0.5 for a, b in zip(start, end)]
    direction = game_to_blender(end) - game_to_blender(start)
    cap_length = min(radius * 0.65, direction.length * cap_ratio)
    obj = _blob(name, center, [radius, direction.length * 0.5 + cap_length, radius],
                color, person, tint, palette, material, segments=segments, rings=rings,
                face_forward=True)
    rotation = Vector((0.0, 0.0, -1.0)).rotation_difference(direction.normalized())
    origin = game_to_blender(center)
    for vertex in obj.data.vertices:
        vertex.co = origin + rotation @ (vertex.co - origin)
    return obj


def _simplify_hidden_back(obj, depth):
    """Spend the saved rear pole triangles on the visible outline instead."""
    _simplify_hidden_vertices(obj, lambda point: point.y > depth)


def _simplify_hidden_vertices(obj, hidden, stride=2):
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    candidates = sorted((vertex for vertex in mesh.verts if hidden(vertex.co)),
                        key=lambda vertex: tuple(vertex.co))
    for vertex in candidates[::stride]:
        if vertex.is_valid:
            bmesh.ops.dissolve_verts(mesh, verts=[vertex], use_face_split=False, use_boundary_tear=False)
    bmesh.ops.triangulate(mesh, faces=list(mesh.faces))
    mesh.to_mesh(obj.data)
    mesh.free()
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def _hair_cap(prefix, radius, style, color, person, palette, material):
    """A scalloped fringe blends into longer temples and a rounded nape."""
    obj = _blob(f"{prefix}hair", [0, 0, 0], [1, 1, 1], color, person, "hair", palette, material)
    uv = obj.data.uv_layers.active.data[0].uv.copy()
    vertices = [game_to_blender([0, radius * 1.03, 0])]
    faces = []
    previous_start, previous_count = 0, 1
    for ring in range(1, HAIR_RINGS + 1):
        count = max(8, round(HAIR_SEGMENTS * min(1, ring / (HAIR_RINGS * 0.65)) / 4) * 4)
        start = len(vertices)
        for segment in range(count):
            longitude = 2 * math.pi * segment / count
            front = max(math.sin(longitude), 0.0)
            back = max(-math.sin(longitude), 0.0)
            edge_angle = math.pi * (0.61 - 0.23 * front + 0.12 * back)
            edge_angle += 0.10 * front * math.cos(3 * longitude + 0.4)
            if style == "bob":
                edge_angle += 0.15 * (1 - front)
            latitude = edge_angle * ring / HAIR_RINGS
            vertices.append(game_to_blender([
                radius * 1.09 * math.sin(latitude) * math.cos(longitude),
                radius * (0.04 + 0.99 * math.cos(latitude)),
                radius * 1.01 * math.sin(latitude) * math.sin(longitude),
            ]))
        _join_rings(faces, previous_start, previous_count, start, count)
        previous_start, previous_count = start, count
    # Close the underside inside the head; its edge never appears in the silhouette.
    faces.append(tuple(range(start, start + count)))
    _replace_surface(obj, vertices, faces, uv)
    return obj


def _hat_crown(prefix, radius, person, palette, material):
    obj = _blob(f"{prefix}hair", [0, 0, 0], [1, 1, 1],
                "fur_jaguar_light", person, "none", palette, material)
    uv = obj.data.uv_layers.active.data[0].uv.copy()
    vertices = [game_to_blender([0, radius * 1.13, 0])]
    faces = []
    previous_start, previous_count = 0, 1
    for ring, count in enumerate((8, 16, 24, 24), start=1):
        latitude = math.pi * ring / 8
        start = len(vertices)
        for segment in range(count):
            longitude = 2 * math.pi * segment / count
            vertices.append(game_to_blender([radius * 1.05 * math.sin(latitude) * math.cos(longitude),
                                            radius * (0.55 + 0.58 * math.cos(latitude)),
                                            radius * 1.05 * math.sin(latitude) * math.sin(longitude)]))
        _join_rings(faces, previous_start, previous_count, start, count)
        previous_start, previous_count = start, count
    faces.append(tuple(range(start, start + count)))
    _replace_surface(obj, vertices, faces, uv)
    return obj


def build_person(index, params, palette, material, parent_object):
    """Create one articulated person under parent_object. Returns a dict of pivots."""
    tints = params["tints"]
    skin = tints.get("skin", "fur_capybara_light")
    hair = tints.get("hair", "fur_capybara_dark")
    shirt = tints.get("shirt", "otter_throat")
    pants = tints.get("pants", "fur_tapir_dark")

    p = _derive_proportions(params)
    prefix = f"p{index}_"
    posture = params.get("posture", "standing")
    seated = posture in {"stroller", "shoulders"}

    # The head overlaps the egg-shaped torso so there is no visible neck.
    root = _empty(f"{prefix}root", params.get("position", [0.0, 0.0, 0.0]), parent_object)
    hips = _empty(f"{prefix}hips", [0.0, 0.0 if seated else p["hip_height"], 0.0], root)
    hips["zooSeatHeight"] = p["torso"] * 0.34
    spine = _empty(f"{prefix}spine", [0.0, 0.0, 0.0], hips)
    head = _empty(f"{prefix}head", [0.0, p["torso"] + p["neck"], 0.0], spine)
    head["zooHeadRadius"] = p["head_r"]
    shoulder_seat = _empty(f"{prefix}shoulder_seat", [0.0, p["torso"] + p["neck"] + params.get("shoulderSeatHeight", p["head_r"]), 0.0], spine)
    arm_l = _empty(f"{prefix}arm_l", [-p["shoulder_w"], p["torso"] * 0.65, 0.0], spine)
    arm_r = _empty(f"{prefix}arm_r", [p["shoulder_w"], p["torso"] * 0.65, 0.0], spine)
    leg_l = _empty(f"{prefix}leg_l", [-p["hip_w"], 0.0, 0.0], hips)
    leg_r = _empty(f"{prefix}leg_r", [p["hip_w"], 0.0, 0.0], hips)
    if posture == "shoulders":
        for leg in (leg_l, leg_r):
            leg.location.y -= p["leg_len"] * SEATED_LEG_FORWARD_RATIO

    # Torso, centred above the waist pivot.
    body = _blob(
        f"{prefix}body",
        [0.0, p["torso"] * 0.38, 0.0],
        [p["body_w"], p["torso"] * 0.72, p["body_d"]],
        shirt,
        index,
        "shirt",
        palette,
        material,
        segments=16,
        rings=4,
        exponent=1.0,
        face_forward=True,
    )
    body.parent = spine
    _simplify_hidden_back(body, 0.0)
    for vertex in body.data.vertices:
        height_fraction = vertex.co.z / max(p["torso"], 0.01)
        vertex.co.x *= 1.0 - 0.18 * height_fraction
        vertex.co.y *= 1.0 - 0.18 * height_fraction

    # Head and face.
    head_mesh = _blob(
        f"{prefix}head",
        [0.0, 0.0, 0.0],
        [p["head_r"] * 1.04, p["head_r"] * 0.94, p["head_r"] * 0.96],
        skin,
        index,
        "skin",
        palette,
        material,
        segments=32,
        rings=8,
        face_forward=True,
    )
    head_mesh.parent = head
    _simplify_hidden_back(head_mesh, p["head_r"] * 0.3)
    if params.get("hair", "short") != "none":
        _simplify_hidden_vertices(head_mesh, lambda point: point.z > p["head_r"] * 0.3, stride=1)
    for vertex in head_mesh.data.vertices:
        vertex.co.x *= 1.0 - 0.09 * vertex.co.z / p["head_r"]
        # Flatten only the front, preserving the round back and cheek silhouette.
        vertex.co.y = max(vertex.co.y, -p["head_r"] * 0.77)

    hair_style = params.get("hair", "short")
    if hair_style != "none":
        hair_mesh = (_hat_crown(prefix, p["head_r"], index, palette, material)
                     if hair_style == "sunhat" else
                     _hair_cap(prefix, p["head_r"], hair_style, hair, index, palette, material))
        hair_mesh.parent = head
        if hair_style in {"bob", "bun", "ponytail", "curls", "beard"}:
            styles = {
                "bob": [],
                "bun": [(0.0, 0.90, -0.65, 0.45)],
                "ponytail": [(0.0, 0.20, -1.05, 0.48)],
                "curls": [(-0.7, 0.65, 0.05, 0.42), (0.0, 0.90, 0.05, 0.42), (0.7, 0.65, 0.05, 0.42)],
                "beard": [],
            }
            for n, (x, y, z, radius) in enumerate(styles[hair_style]):
                detail = _blob(f"{prefix}hair_detail_{n}",
                               [x * p["head_r"], y * p["head_r"], z * p["head_r"]],
                               [radius * p["head_r"]] * 3, hair, index, "hair",
                                 palette, material, segments=12, rings=4, face_forward=True)
                if hair_style == "ponytail":
                    center = game_to_blender([x * p["head_r"], y * p["head_r"], z * p["head_r"]])
                    for vertex in detail.data.vertices:
                        vertex.co.z = center.z + (vertex.co.z - center.z) * 1.35
                detail.parent = head
        if hair_style == "sunhat":
            brim = _blob(
                f"{prefix}hat_brim", [0.0, p["head_r"] * 0.55, 0.0],
                [p["head_r"] * 1.7, p["head_r"] * 0.055, p["head_r"] * 1.7],
                "fur_jaguar_light", index, "none", palette, material, segments=32, rings=4,
            )
            uv = brim.data.uv_layers.active.data[0].uv.copy()
            vertices, faces = [], []
            for height in (-0.055, 0.055):
                vertices.extend(game_to_blender([p["head_r"] * 1.7 * math.cos(2 * math.pi * i / 32),
                                                p["head_r"] * (0.55 + height),
                                                p["head_r"] * 1.7 * math.sin(2 * math.pi * i / 32)]) for i in range(32))
            _join_rings(faces, 0, 32, 32, 32)
            faces.extend((tuple(reversed(range(32))), tuple(range(32, 64))))
            _replace_surface(brim, vertices, faces, uv)
            brim.parent = head
        elif hair_style in {"cap", "cap_backwards"}:
            brim = _blob(
                f"{prefix}hat_brim", [0.0, p["head_r"] * 0.30, -p["head_r"] * 0.94 if hair_style == "cap_backwards" else p["head_r"] * 0.94],
                [p["head_r"] * 0.68, p["head_r"] * 0.06, p["head_r"] * 0.50],
                hair, index, "hair", palette, material, segments=8, rings=3,
            )
            brim.parent = head


    moustache = hair_style == "beard" or params.get("facialHair") == "moustache"
    if moustache:
        nose = _blob(f"{prefix}nose", [0, -p["head_r"] * 0.44, p["head_r"] * 0.79],
                     [p["head_r"] * 0.075, p["head_r"] * 0.06, p["head_r"] * 0.07],
                     skin, index, "skin", palette, material, segments=8, rings=2, face_forward=True)
        nose.parent = head
        for side, sign in (("l", -1), ("r", 1)):
            detail = _blob(f"{prefix}moustache_{side}",
                           [sign * p["head_r"] * 0.13, -p["head_r"] * 0.61, p["head_r"] * 0.77],
                           [p["head_r"] * 0.16, p["head_r"] * 0.10, p["head_r"] * 0.12],
                           hair, index, "hair", palette, material, segments=12, rings=3, face_forward=True)
            detail.parent = head

    eye_y = -p["head_r"] * 0.24
    eye_z = p["head_r"] * 0.785
    eye_r = p["head_r"] * 0.205
    for side, sx in (("l", -1), ("r", 1)):
        eye = _blob(
            f"{prefix}eye_{side}",
            [sx * p["head_r"] * 0.43, eye_y, eye_z],
            [eye_r, eye_r * 1.22, eye_r * 0.24],
            "eye_black",
            index,
            "none",
            palette,
            material,
            segments=EYE_SEGMENTS,
            rings=2,
            face_forward=True,
        )
        eye.parent = head
        shine = _blob(
            f"{prefix}eye_shine_{side}",
            [sx * p["head_r"] * 0.43 - eye_r * 0.30,
             eye_y + eye_r * 0.43, eye_z + eye_r * 0.23],
            [eye_r * 0.23, eye_r * 0.23, eye_r * 0.07], "eye_shine", index, "none",
             palette, material, segments=8, rings=2, face_forward=True,
        )
        shine.parent = head

    nose = _blob(
        f"{prefix}mouth",
        [0.0, -p["head_r"] * (0.77 if moustache else 0.53), p["head_r"] * (0.65 if moustache else 0.78)],
        [p["head_r"] * 0.045, p["head_r"] * 0.022, p["head_r"] * 0.018],
        "nose_dark",
        index,
        "none",
        palette,
        material,
        segments=8,
        rings=2,
        face_forward=True,
    )
    nose.parent = head

    if params.get("glasses", False):
        for side, sign in (("l", -1), ("r", 1)):
            glasses = _blob(f"{prefix}glasses_{side}", [0, 0, 0], [1, 1, 1],
                              "eye_black", index, "none", palette, material)
            uv = glasses.data.uv_layers.active.data[0].uv.copy()
            glasses.name += "_rim"
            vertices, faces = [], []
            rim_segments = 18
            # The invisible rear half of the wire costs no triangles; the front
            # retains a curved cross-section and a finer circular outline.
            for ring, (offset, depth) in enumerate(((0.018, 0), (0, 0.018), (-0.018, 0))):
                for segment in range(rim_segments):
                    angle = 2 * math.pi * segment / rim_segments
                    radius = p["head_r"] * (0.30 + offset)
                    vertices.append(Vector((radius * math.cos(angle), radius * math.sin(angle), p["head_r"] * depth)))
                if ring:
                    _join_rings(faces, (ring - 1) * rim_segments, rim_segments, ring * rim_segments, rim_segments)
            _replace_surface(glasses, vertices, faces, uv)
            glasses.rotation_euler.x = math.pi / 2
            glasses.location = game_to_blender([sign * p["head_r"] * 0.43, eye_y, eye_z + p["head_r"] * 0.06])
            glasses.parent = head
        bridge = _limb(f"{prefix}glasses_bridge",
                       [-p["head_r"] * 0.13, eye_y, eye_z + p["head_r"] * 0.06],
                       [p["head_r"] * 0.13, eye_y, eye_z + p["head_r"] * 0.06],
                       p["head_r"] * 0.018, p["head_r"] * 0.018,
                       "eye_black", index, "none", palette, material, segments=4)
        bridge.parent = head

    # Arms and legs.
    hand_pivots = {}
    supported_arms = seated or params.get("stroller", False) or params.get("shoulderChild") is not None
    for side, sx, pivot in (("l", -1, arm_l), ("r", 1, arm_r)):
        arm_end = [0.0, -p["arm_len"], 0.0]
        if params.get("stroller", False):
            arm_end = [0.0, params["height"] * STROLLER_HANDLE_HEIGHT_RATIO
                       - p["hip_height"] - p["torso"] * 0.65, STROLLER_HANDLE_FORWARD]
        elif params.get("shoulderChild") is not None:
            arm_end = params["shoulderGrips"][side]
        elif posture == "shoulders":
            direction = Vector((sx * 0.25, -1.0, 0.25)).normalized() * p["arm_len"]
            arm_end = list(direction)
        elif seated:
            arm_end = [0.0, -p["arm_len"] * 0.65, p["arm_len"] * 0.35]
        sleeve_end = [value * 0.34 for value in arm_end]
        sleeve_start = [pivot.location.x, pivot.location.z, -pivot.location.y]
        sleeve = _round_limb(f"{prefix}sleeve_{side}", sleeve_start,
                            [a + b for a, b in zip(sleeve_start, sleeve_end)],
                            p["limb_r"] * 1.08, shirt, index, "shirt", palette, material)
        sleeve.parent = spine
        pivot.location += game_to_blender(sleeve_end)
        arm_end = [a - b for a, b in zip(arm_end, sleeve_end)]
        # Supported hands never rotate relative to the spine in any of the six clips.
        # Author their geometry in that shared frame, keeping all moving arms separate.
        offset = [pivot.location.x, pivot.location.z, -pivot.location.y] if supported_arms else [0.0, 0.0, 0.0]
        endpoint = [a + b for a, b in zip(offset, arm_end)]
        arm = _round_limb(f"{prefix}arm_{side}", offset, endpoint,
                           p["limb_r"], skin, index, "skin", palette, material,
                           cap_ratio=0.15 if params.get("camera") else 1.0)
        arm.parent = spine if supported_arms else pivot
        hand_pivot = _empty(f"{prefix}hand_{side}", arm_end, pivot) if params.get("camera") else None
        hand_pivots[f"hand_{side}"] = hand_pivot
        hand = _blob(f"{prefix}hand_{side}", [0, 0, 0] if hand_pivot else endpoint, [p["limb_r"]] * 3,
                     skin, index, "skin", palette, material, segments=12, rings=4, face_forward=True)
        hand.parent = spine if supported_arms else hand_pivot if hand_pivot else pivot
        pivot["zooHand"] = arm_end

    for side, sx, pivot in (("l", -1, leg_l), ("r", 1, leg_r)):
        foot = [0.0, -p["leg_len"], 0.0]
        knee = None
        if seated:
            splay = p["head_r"] * 1.6 if posture == "shoulders" else p["leg_len"] * 0.18
            forward = max(p["leg_len"] * 0.5, 0.11)
            knee = [sx * splay, -p["leg_len"] * 0.08, forward]
            drop = 1.4 if posture == "shoulders" else 0.46
            foot = [sx * splay, -p["leg_len"] * drop, forward + p["leg_len"] * 0.05]
            if posture == "shoulders":
                knee, foot = params["shoulderLegs"][side]
            pivot["zooKnee"] = knee
        pivot["zooFoot"] = foot
        leg_end = knee if knee is not None else foot
        leg = _round_limb(f"{prefix}leg_{side}", [0.0, 0.0, 0.0], leg_end,
                          p["limb_r"], pants, index, "pants", palette, material,
                          segments=12 if posture == "shoulders" else LIMB_SEGMENTS,
                          rings=4 if posture == "shoulders" else ROUND_RINGS)
        leg.parent = pivot
        if knee is not None:
            shin = _round_limb(
                f"{prefix}shin_{side}", knee, foot,
                p["limb_r"],
                pants, index, "pants", palette, material,
                segments=12 if posture == "shoulders" else LIMB_SEGMENTS,
                rings=4 if posture == "shoulders" else ROUND_RINGS,
            )
            shin.parent = pivot
        shoe = _blob(
            f"{prefix}shoe_{side}",
            [foot[0], foot[1] - params["height"] * 0.018, foot[2] + p["limb_r"] * (0.75 if posture == "shoulders" else 0.25)],
            [p["limb_r"] * 1.05, p["limb_r"], p["limb_r"] * 1.4],
            pants,
            index,
            "pants",
            palette,
            material,
            segments=ROUND_SEGMENTS,
            rings=4,
            exponent=1.0,
            face_forward=True,
        )
        shoe.parent = pivot
        bottom = game_to_blender([foot[0], foot[1] - params["height"] * 0.018, foot[2]])
        _simplify_hidden_vertices(shoe, lambda point: bottom.z - p["limb_r"] * 0.95 < point.z < bottom.z - p["limb_r"] * 0.1)

    # Facial texels must retain zooTint none: skin multiplication would darken
    # the white catchlights. The merger combines them only within the head pivot.

    camera = None
    strap_pivot = None
    if params.get("camera", False):
        camera = _empty(f"{prefix}camera", [0.0, p["torso"] * 0.32, p["body_d"] * 1.15], spine)
        camera["zooGripWidth"] = p["limb_r"] * 1.4
        camera_body = _blob(
            f"{prefix}camera",
            [0.0, 0.0, 0.0],
            [p["limb_r"] * 1.15, p["limb_r"] * 0.75, p["limb_r"] * 0.50],
            "eye_black",
            index,
            "none",
            palette,
            material,
            segments=8,
            rings=3,
            exponent=0.5,
        )
        camera_body.parent = camera
        lens = _blob(f"{prefix}camera_lens",
                      [0.0, 0.0, p["limb_r"] * 0.64],
                     [p["limb_r"] * 0.45, p["limb_r"] * 0.45, p["limb_r"] * 0.35],
                      "otter_throat", index, "none", palette, material, segments=6, rings=3)
        lens.parent = camera
        neck = [0.0, p["torso"] * 0.90, p["body_d"] * 0.70]
        strap_pivot = _empty(f"{prefix}camera_strap", neck, spine)
        strap_vector = camera.location - strap_pivot.location
        strap_pivot["zooStrapLength"] = strap_vector.length
        strap_pivot.rotation_euler = Vector((0, 0, -1)).rotation_difference(strap_vector).to_euler()
        for side, sign in (("l", -1), ("r", 1)):
            strap = _limb(f"{prefix}camera_strap_{side}",
                          [sign * p["limb_r"] * 0.85, 0.0, 0.0],
                          [sign * p["limb_r"] * 0.85, -strap_vector.length, 0.0],
                          0.009, 0.009, "nose_dark", index, "none", palette, material, segments=4)
            strap.parent = strap_pivot

    return {
        "root": root,
        "hips": hips,
        "spine": spine,
        "head": head,
        "shoulder_seat": shoulder_seat,
        "arm_l": arm_l,
        "arm_r": arm_r,
        "leg_l": leg_l,
        "leg_r": leg_r,
        "camera": camera,
        "camera_strap": strap_pivot,
        **hand_pivots,
    }


def add_stroller(parent_pivots, params, palette, material):
    """Attach a stroller to person 0; returns a seat pivot for the baby."""
    root = parent_pivots["root"]
    proportions = _derive_proportions(params)
    handle_height = params["height"] * STROLLER_HANDLE_HEIGHT_RATIO
    half_width = proportions["shoulder_w"]
    index = 0
    prefix = "p0_stroller_"

    # Root-relative coordinates keep wheels grounded while the parent walks.
    handle = _limb(
        f"{prefix}handle",
        [-half_width, handle_height, STROLLER_HANDLE_FORWARD],
        [half_width, handle_height, STROLLER_HANDLE_FORWARD],
        0.03,
        0.03,
        "fur_tapir_dark",
        index,
        "none",
        palette,
        material,
        segments=6,
    )
    handle.parent = root

    # Basket/seat shell under the handle.
    seat = _blob(
        f"{prefix}seat",
        [0.0, 0.47, 0.75],
        [0.28, 0.12, 0.32],
        "fur_jaguar_light",
        index,
        "none",
        palette,
        material,
        segments=8,
        rings=6,
        exponent=0.5,
    )
    seat.parent = root

    # Four wheels and two side frames make the support legible in silhouette.
    for side, sx in (("l", -1), ("r", 1)):
        frame = _limb(
            f"{prefix}frame_{side}",
            [sx * half_width, handle_height, STROLLER_HANDLE_FORWARD],
            [sx * 0.29, 0.10, 0.90], 0.025, 0.025,
            "fur_tapir_dark", index, "none", palette, material, segments=6,
        )
        frame.parent = root
        for axle, forward in (("front", 1.0), ("rear", 0.52)):
            wheel = _blob(
                f"{prefix}wheel_{side}_{axle}",
                [sx * 0.29, 0.10, forward], [0.045, 0.10, 0.10],
                "eye_black", index, "none", palette, material,
                segments=6, rings=4,
            )
            wheel.parent = root

    # Pivot where the baby sits, so the baby follows the stroller.
    seat_pivot = _empty("p2_sit_pivot", [0.0, STROLLER_SEAT_HEIGHT, 0.75], root)
    return seat_pivot
