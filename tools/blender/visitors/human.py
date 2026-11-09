"""Articulated, non-skinned human figure built from reused animal primitives.

Each person is a hierarchy of Empty pivots and Mesh parts.  build_part is reused
unchanged; the visitor pipeline only sets custom properties and parents afterwards.
"""

from pathlib import Path
import math

import bpy
from mathutils import Vector

BLENDER_DIR = Path(__file__).parent.parent
import sys

sys.path.insert(0, str(BLENDER_DIR))
from parts import build_part, game_to_blender  # noqa: E402

PIVOT_DISPLAY_SIZE = 0.05
STROLLER_HANDLE_HEIGHT_RATIO = 0.59
STROLLER_HANDLE_FORWARD = 0.38
STROLLER_SEAT_HEIGHT = 0.61


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
):
    return _make(
        {
            "name": name,
            "kind": "body",
            "center": center,
            "radii": radii,
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


def _round_limb(name, start, end, radius, color, person, tint, palette, material):
    center = [(a + b) * 0.5 for a, b in zip(start, end)]
    direction = game_to_blender(end) - game_to_blender(start)
    obj = _blob(name, center, [radius, max(direction.length * 0.65, radius), radius],
                color, person, tint, palette, material, segments=6, rings=4)
    rotation = Vector((0.0, 0.0, -1.0)).rotation_difference(direction.normalized())
    origin = game_to_blender(center)
    for vertex in obj.data.vertices:
        vertex.co = origin + rotation @ (vertex.co - origin)
    return obj


def _chin_crescent(prefix, radius, hair, index, palette, material):
    obj = _blob(f"{prefix}beard", [0, 0, 0], [1, 1, 1], hair, index, "hair", palette, material)
    uv = obj.data.uv_layers.active.data[0].uv.copy()
    vertices = []
    faces = []
    arc_steps, tube_steps = 12, 4
    for step in range(arc_steps + 1):
        angle = math.pi * (1.18 + step / arc_steps * 0.64)
        taper = 0.025 + 0.065 * math.sin(math.pi * step / arc_steps)
        for tube in range(tube_steps):
            cross = 2 * math.pi * tube / tube_steps
            vertices.append(game_to_blender([
                radius * (0.65 + taper * math.cos(cross)) * math.cos(angle),
                radius * (0.78 + taper * math.cos(cross)) * math.sin(angle),
                radius * (0.64 + taper * math.sin(cross)),
            ]))
    for step in range(arc_steps):
        for tube in range(tube_steps):
            a = step * tube_steps + tube
            b = step * tube_steps + (tube + 1) % tube_steps
            faces.append((a, b, b + tube_steps, a + tube_steps))
    obj.data.clear_geometry()
    obj.data.from_pydata(vertices, [], faces)
    layer = obj.data.uv_layers.new()
    for loop in layer.data:
        loop.uv = uv
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
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
    shoulder_seat = _empty(f"{prefix}shoulder_seat", [0.0, p["torso"] + p["neck"] + p["head_r"] * 1.5, 0.0], spine)
    arm_l = _empty(f"{prefix}arm_l", [-p["shoulder_w"], p["torso"] * 0.65, 0.0], spine)
    arm_r = _empty(f"{prefix}arm_r", [p["shoulder_w"], p["torso"] * 0.65, 0.0], spine)
    leg_l = _empty(f"{prefix}leg_l", [-p["hip_w"], 0.0, 0.0], hips)
    leg_r = _empty(f"{prefix}leg_r", [p["hip_w"], 0.0, 0.0], hips)

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
        segments=8,
        rings=6,
        exponent=1.0,
    )
    body.parent = spine
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
        segments=24,
        rings=10,
    )
    head_mesh.parent = head
    for vertex in head_mesh.data.vertices:
        vertex.co.x *= 1.0 - 0.09 * vertex.co.z / p["head_r"]
        # Flatten only the front, preserving the round back and cheek silhouette.
        vertex.co.y = max(vertex.co.y, -p["head_r"] * 0.77)

    hair_style = params.get("hair", "short")
    if hair_style != "none":
        if hair_style in {"cap", "cap_backwards", "sunhat"}:
            # Slightly oversized flattened box on top.
            hair_mesh = _blob(
                f"{prefix}hair",
                [0.0, p["head_r"] * 0.7, 0.0],
                [p["head_r"] * 1.15, p["head_r"] * 0.5, p["head_r"] * 1.2],
                hair,
                index,
                "hair",
                palette,
                material,
                segments=8,
                rings=5,
                exponent=0.5,
            )
        else:
            hair_mesh = _blob(
                f"{prefix}hair",
                [0.0, p["head_r"] * 0.50, -p["head_r"] * 0.24],
                [p["head_r"] * 1.06, p["head_r"] * 0.65, p["head_r"] * 0.91],
                hair,
                index,
                "hair",
                palette,
                material,
                segments=8,
                rings=5,
                exponent=1.0,
            )
        hair_mesh.parent = head
        if hair_style in {"bob", "bun", "ponytail", "curls", "beard"}:
            styles = {
                "bob": [(0.78, -0.05, -0.30, 0.40), (-0.78, -0.05, -0.30, 0.40)],
                "bun": [(0.0, 0.90, -0.65, 0.45)],
                "ponytail": [(0.0, 0.20, -1.05, 0.48)],
                "curls": [(-0.7, 0.65, 0.05, 0.42), (0.0, 0.90, 0.05, 0.42), (0.7, 0.65, 0.05, 0.42)],
                "beard": [],
            }
            for n, (x, y, z, radius) in enumerate(styles[hair_style]):
                detail = _blob(f"{prefix}hair_detail_{n}",
                               [x * p["head_r"], y * p["head_r"], z * p["head_r"]],
                               [radius * p["head_r"]] * 3, hair, index, "hair",
                               palette, material, segments=6, rings=4)
                detail.parent = head
        if hair_style == "sunhat":
            brim = _blob(
                f"{prefix}hat_brim", [0.0, p["head_r"] * 0.55, 0.0],
                [p["head_r"] * 1.7, p["head_r"] * 0.12, p["head_r"] * 1.7],
                hair, index, "hair", palette, material, segments=10, rings=4,
            )
            brim.parent = head

        if hair_style == "beard":
            detail = _chin_crescent(prefix, p["head_r"], hair, index, palette, material)
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
            segments=12,
            rings=5,
        )
        eye.parent = head
        shine = _blob(
            f"{prefix}eye_shine_{side}",
            [sx * p["head_r"] * 0.43 - eye_r * 0.30,
             eye_y + eye_r * 0.43, eye_z + eye_r * 0.23],
            [eye_r * 0.23, eye_r * 0.23, eye_r * 0.07], "eye_shine", index, "none",
            palette, material, segments=6, rings=3,
        )
        shine.parent = head

    nose = _blob(
        f"{prefix}mouth",
        [0.0, -p["head_r"] * 0.53, p["head_r"] * 0.78],
        [p["head_r"] * 0.045, p["head_r"] * 0.022, p["head_r"] * 0.018],
        "nose_dark",
        index,
        "none",
        palette,
        material,
        segments=4,
        rings=3,
    )
    nose.parent = head

    if params.get("glasses", False):
        for side, sign in (("l", -1), ("r", 1)):
            bpy.ops.mesh.primitive_torus_add(
                major_segments=12, minor_segments=3,
                major_radius=p["head_r"] * 0.30, minor_radius=p["head_r"] * 0.018,
            )
            glasses = bpy.context.object
            # Reuse a palette-mapped primitive's metadata and UVs for the open rim.
            template = _blob(f"{prefix}glasses_{side}", [0, 0, 0], [1, 1, 1],
                             "eye_black", index, "none", palette, material)
            uv = template.data.uv_layers.active.data[0].uv.copy()
            glasses.name = template.name + "_rim"
            glasses.data.materials.append(material)
            for layer in list(glasses.data.uv_layers):
                glasses.data.uv_layers.remove(layer)
            layer = glasses.data.uv_layers.new()
            for loop in layer.data:
                loop.uv = uv
            for polygon in glasses.data.polygons:
                polygon.use_smooth = True
            bpy.data.objects.remove(template, do_unlink=True)
            glasses["zooPerson"] = index
            glasses["zooTint"] = "none"
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
    for side, sx, pivot in (("l", -1, arm_l), ("r", 1, arm_r)):
        arm_end = [0.0, -p["arm_len"], 0.0]
        if params.get("stroller", False):
            arm_end = [0.0, params["height"] * STROLLER_HANDLE_HEIGHT_RATIO
                       - p["hip_height"] - p["torso"] * 0.65, STROLLER_HANDLE_FORWARD]
        elif params.get("shoulderChild") is not None:
            arm_end = [sx * p["head_r"] * 0.65, p["head_r"] * 2.0, 0.10]
        elif posture == "shoulders":
            arm_end = [sx * p["head_r"] * 0.65, -p["torso"] * 0.65 - p["head_r"] * 0.65, p["head_r"] * 0.65]
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
        arm = _round_limb(f"{prefix}arm_{side}", [0.0, 0.0, 0.0], arm_end,
                          p["limb_r"], skin, index, "skin", palette, material)
        arm.parent = pivot
        hand_pivot = _empty(f"{prefix}hand_{side}", arm_end, pivot) if params.get("camera") else None
        hand_pivots[f"hand_{side}"] = hand_pivot
        hand = _blob(f"{prefix}hand_{side}", [0, 0, 0] if hand_pivot else arm_end, [p["limb_r"]] * 3,
                     skin, index, "skin", palette, material, segments=6, rings=4)
        hand.parent = hand_pivot if hand_pivot else pivot
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
            pivot["zooKnee"] = knee
        pivot["zooFoot"] = foot
        leg_end = knee if knee is not None else foot
        leg = _round_limb(f"{prefix}leg_{side}", [0.0, 0.0, 0.0], leg_end,
                          p["limb_r"], pants, index, "pants", palette, material)
        leg.parent = pivot
        if knee is not None:
            shin = _round_limb(
                f"{prefix}shin_{side}", knee, foot,
                p["limb_r"],
                pants, index, "pants", palette, material,
            )
            shin.parent = pivot
        shoe = _blob(
            f"{prefix}shoe_{side}",
            [foot[0], foot[1] - params["height"] * 0.018, foot[2] + p["limb_r"] * 0.25],
            [p["limb_r"] * 1.05, p["limb_r"], p["limb_r"] * 1.4],
            pants,
            index,
            "pants",
            palette,
            material,
            segments=6,
            rings=4,
            exponent=1.0,
        )
        shoe.parent = pivot

    # Dark facial texels stay dark when multiplied by skin; the bright texel
    # becomes a warm catchlight. Sharing the head bucket pays for rigid hands.
    for obj in head.children:
        if obj.type == "MESH" and obj.get("zooTint") == "none":
            obj["zooTint"] = "skin"

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
            rings=4,
            exponent=0.5,
        )
        camera_body.parent = camera
        lens = _blob(f"{prefix}camera_lens",
                      [0.0, 0.0, p["limb_r"] * 0.64],
                     [p["limb_r"] * 0.45, p["limb_r"] * 0.45, p["limb_r"] * 0.35],
                     "otter_throat", index, "none", palette, material, segments=6, rings=4)
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
