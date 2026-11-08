"""Articulated, non-skinned human figure built from reused animal primitives.

Each person is a hierarchy of Empty pivots and Mesh parts.  build_part is reused
unchanged; the visitor pipeline only sets custom properties and parents afterwards.
"""

import math
from pathlib import Path

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
    leg = h * params.get("legRatio", 0.46)
    torso = h * params.get("torsoRatio", 0.34)
    neck = h * 0.06
    head_r = 0.11 * params.get("headScale", 1.0) * (h / 1.7)
    return {
        "hip_height": leg + 0.03 + 0.045 * (h / 1.7) * 0.7,
        "torso": torso,
        "neck": neck,
        "head_r": head_r,
        "shoulder_w": 0.24 * w * (h / 1.7),
        "hip_w": 0.16 * w * (h / 1.7),
        "arm_len": torso * 0.95,
        "leg_len": leg,
        "body_w": 0.22 * w * (h / 1.7),
        "body_d": 0.14 * w * (h / 1.7),
        "limb_r": 0.045 * (h / 1.7),
    }


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

    # Root and waist/hip chain.  The spine pivot is the waist: the torso mesh is
    # centred above it, the head starts at torso+neck, and the shoulders sit near
    # the top of the torso.  This keeps the rest pose coherent and avoids the
    # torso overlapping the head or leaving a floating waist gap.
    root = _empty(f"{prefix}root", params.get("position", [0.0, 0.0, 0.0]), parent_object)
    hips = _empty(f"{prefix}hips", [0.0, 0.0 if seated else p["hip_height"], 0.0], root)
    spine = _empty(f"{prefix}spine", [0.0, 0.0, 0.0], hips)
    head = _empty(f"{prefix}head", [0.0, p["torso"] + p["neck"], 0.0], spine)
    shoulder_seat = _empty(f"{prefix}shoulder_seat", [0.0, p["torso"] + 0.04, -0.20], spine)
    arm_l = _empty(f"{prefix}arm_l", [-p["shoulder_w"], p["torso"] * 0.9, 0.0], spine)
    arm_r = _empty(f"{prefix}arm_r", [p["shoulder_w"], p["torso"] * 0.9, 0.0], spine)
    leg_l = _empty(f"{prefix}leg_l", [-p["hip_w"], 0.0, 0.0], hips)
    leg_r = _empty(f"{prefix}leg_r", [p["hip_w"], 0.0, 0.0], hips)

    # Torso, centred above the waist pivot.
    body = _blob(
        f"{prefix}body",
        [0.0, p["torso"] * 0.5, 0.0],
        [p["body_w"], p["torso"] * 0.5, p["body_d"]],
        shirt,
        index,
        "shirt",
        palette,
        material,
        segments=12,
        rings=10,
        exponent=0.55,
    )
    body.parent = spine

    # Head and face.
    head_mesh = _blob(
        f"{prefix}head",
        [0.0, 0.0, 0.0],
        [p["head_r"], p["head_r"] * 1.05, p["head_r"] * 0.95],
        skin,
        index,
        "skin",
        palette,
        material,
        segments=12,
        rings=10,
    )
    head_mesh.parent = head

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
                segments=10,
                rings=8,
                exponent=0.5,
            )
        else:
            hair_mesh = _blob(
                f"{prefix}hair",
                [0.0, p["head_r"] * 0.4, -p["head_r"] * 0.1],
                [p["head_r"] * 1.05, p["head_r"] * 0.9, p["head_r"] * 1.0],
                hair,
                index,
                "hair",
                palette,
                material,
                segments=10,
                rings=8,
                exponent=0.6,
            )
        hair_mesh.parent = head
        if hair_style == "sunhat":
            brim = _blob(
                f"{prefix}hat_brim", [0.0, p["head_r"] * 0.55, 0.0],
                [p["head_r"] * 1.7, p["head_r"] * 0.12, p["head_r"] * 1.7],
                hair, index, "hair", palette, material, segments=10, rings=4,
            )
            brim.parent = head

    eye_y = p["head_r"] * 0.05
    eye_z = p["head_r"] * 0.75
    eye_r = p["head_r"] * 0.18
    for side, sx in (("l", -1), ("r", 1)):
        eye = _blob(
            f"{prefix}eye_{side}",
            [sx * p["head_r"] * 0.35, eye_y, eye_z],
            [eye_r, eye_r * 0.8, eye_r],
            "eye_black",
            index,
            "none",
            palette,
            material,
            segments=8,
            rings=6,
        )
        eye.parent = head

    nose = _blob(
        f"{prefix}nose",
        [0.0, -p["head_r"] * 0.1, p["head_r"] * 0.85],
        [p["head_r"] * 0.15, p["head_r"] * 0.12, p["head_r"] * 0.12],
        "nose_dark",
        index,
        "none",
        palette,
        material,
        segments=8,
        rings=6,
    )
    nose.parent = head

    if params.get("glasses", False):
        glasses = _blob(
            f"{prefix}glasses",
            [0.0, eye_y, eye_z + p["head_r"] * 0.08],
            [p["head_r"] * 0.9, p["head_r"] * 0.25, p["head_r"] * 0.1],
            "eye_black",
            index,
            "none",
            palette,
            material,
            segments=8,
            rings=6,
            exponent=0.5,
        )
        glasses.parent = head

    # Arms and legs.
    for side, sx, pivot in (("l", -1, arm_l), ("r", 1, arm_r)):
        arm_end = [0.0, -p["arm_len"], 0.0]
        elbow = None
        if params.get("stroller", False):
            arm_end = [0.0, params["height"] * STROLLER_HANDLE_HEIGHT_RATIO
                       - p["hip_height"] - p["torso"] * 0.9, STROLLER_HANDLE_FORWARD]
            elbow = [0.0, -p["arm_len"] * 0.55, 0.12]
        elif params.get("shoulderChild") is not None:
            arm_end = [-sx * 0.03, -0.13, 0.05]
            elbow = [sx * 0.04, -p["arm_len"] * 0.45, 0.0]
        elif seated:
            arm_end = [0.0, -p["arm_len"] * 0.65, p["arm_len"] * 0.35]
            elbow = [sx * p["limb_r"], -p["arm_len"] * 0.5, 0.0]
        arm = _limb(
            f"{prefix}arm_{side}",
            [0.0, 0.0, 0.0],
            elbow if elbow is not None else arm_end,
            p["limb_r"] * 1.3,
            p["limb_r"],
            shirt,
            index,
            "shirt",
            palette,
            material,
            segments=10,
        )
        arm.parent = pivot
        if elbow is not None:
            forearm = _limb(
                f"{prefix}forearm_{side}", elbow, arm_end,
                p["limb_r"], p["limb_r"] * 0.85,
                skin, index, "skin", palette, material,
            )
            forearm.parent = pivot
        pivot["zooHand"] = arm_end

    for side, sx, pivot in (("l", -1, leg_l), ("r", 1, leg_r)):
        foot = [0.0, -p["leg_len"], 0.0]
        knee = None
        if seated:
            splay = p["leg_len"] * (0.4 if posture == "shoulders" else 0.18)
            knee = [sx * splay, -p["leg_len"] * 0.08, p["leg_len"] * 0.5]
            foot = [sx * splay, -p["leg_len"] * 0.46, p["leg_len"] * 0.55]
            pivot["zooKnee"] = knee
        pivot["zooFoot"] = foot
        leg = _limb(
            f"{prefix}leg_{side}",
            [0.0, 0.0, 0.0],
            knee if knee is not None else foot,
            p["limb_r"] * 1.4,
            p["limb_r"] * 1.1,
            pants,
            index,
            "pants",
            palette,
            material,
            segments=10,
        )
        leg.parent = pivot
        if knee is not None:
            shin = _limb(
                f"{prefix}shin_{side}", knee, foot,
                p["limb_r"] * 1.2, p["limb_r"] * 1.1,
                pants, index, "pants", palette, material,
            )
            shin.parent = pivot
        shoe = _blob(
            f"{prefix}shoe_{side}",
            [foot[0], foot[1] - 0.03, foot[2] + 0.04],
            [p["limb_r"] * 1.4, p["limb_r"] * 0.7, p["limb_r"] * 2.2],
            "fur_tapir_dark",
            index,
            "none",
            palette,
            material,
            segments=8,
            rings=6,
            exponent=0.5,
        )
        shoe.parent = pivot

    camera = None
    if params.get("camera", False):
        hand = arm_r["zooHand"]
        camera = _blob(
            f"{prefix}camera",
            [hand[0], hand[1], hand[2] + p["limb_r"]],
            [p["limb_r"] * 2.0, p["limb_r"] * 1.2, p["limb_r"] * 2.5],
            "eye_black",
            index,
            "none",
            palette,
            material,
            segments=8,
            rings=6,
            exponent=0.5,
        )
        camera.parent = arm_r

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
