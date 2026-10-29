"""Library of parametric low-poly parts shared by every species.

Descriptions use game axes (x to the animal's left, y up, z forward, metres),
the same as glTF and Three.js. Blender is Z-up with the front towards -Y, so
every point goes through `game_to_blender` once, here and nowhere else.

Two primitives cover the whole library:
- a blob (rounded box / ellipsoid) for bodies, heads, muzzles, ears, eyes, feet;
- a limb (tapered cylinder between two points) for legs and tails.
"""

import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

BLOB_KINDS = {"body", "head", "muzzle", "ear", "eye", "nose", "foot", "patch"}
LIMB_KINDS = {"leg", "tail"}

# Faceted, never smooth-shaded: the hand-made look of the art direction.
FLAT_SHADING = True


def game_to_blender(point):
    x, y, z = point
    return Vector((x, -z, y))


def _squircle(value, exponent):
    # Exponent below 1 pushes the sphere towards a box: a square muzzle, a barrel body.
    return math.copysign(abs(value) ** exponent, value)


def _orientation(spec):
    pitch = math.radians(spec.get("pitchDeg", 0.0))
    roll = math.radians(spec.get("rollDeg", 0.0))
    # Positive pitch lifts the front (-Y in Blender); positive roll tips the top to the left (+X).
    return Matrix.Rotation(-pitch, 4, "X") @ Matrix.Rotation(-roll, 4, "Y")


def _build_blob(bm, spec):
    bmesh.ops.create_uvsphere(bm, u_segments=spec["segments"], v_segments=spec["rings"], radius=1.0)
    rx, ry, rz = spec["radii"]
    radii = Vector((rx, rz, ry))
    exponent = spec.get("exponent", 1.0)
    transform = Matrix.Translation(game_to_blender(spec["center"])) @ _orientation(spec)
    for vert in bm.verts:
        shaped = Vector(_squircle(c, exponent) * r for c, r in zip(vert.co, radii))
        vert.co = transform @ shaped


def _build_limb(bm, spec):
    start = game_to_blender(spec["start"])
    end = game_to_blender(spec["end"])
    axis = end - start
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=spec["segments"],
        radius1=spec["startRadius"],
        radius2=spec["endRadius"],
        depth=axis.length,
    )
    rotation = Vector((0.0, 0.0, 1.0)).rotation_difference(axis.normalized()).to_matrix().to_4x4()
    transform = Matrix.Translation((start + end) / 2.0) @ rotation
    for vert in bm.verts:
        vert.co = transform @ vert.co


FACE_KEY_DECIMALS = 4


def _position_key(point):
    return tuple(round(c, FACE_KEY_DECIMALS) for c in point)


def _sort_by_position(sequence, position_of):
    # BMesh sorts only by a number, so rank the elements by position first.
    sequence.index_update()
    ordered = sorted(sequence, key=lambda element: _position_key(position_of(element)))
    rank = {element.index: i for i, element in enumerate(ordered)}
    sequence.sort(key=lambda element: rank[element.index])
    sequence.index_update()


def _face_color(spec, face):
    """Base colour, or for a seeded share of faces a nearby shade.

    The scattered shade breaks up flat fur like a painted figurine. Blender
    does not keep face order stable between runs, so each face draws from its
    own position: every build stays byte-identical.
    """
    speckle = spec.get("speckle")
    if speckle is None:
        return spec["color"]
    key = ":".join(f"{c:.{FACE_KEY_DECIMALS}f}" for c in _position_key(face.calc_center_median()))
    draw = random.Random(f"{speckle['seed']}:{key}").random()
    return speckle["color"] if draw < speckle["share"] else spec["color"]


def build_part(spec, palette, material):
    """One part as its own mesh object, fully weighted to a single bone."""
    kind = spec["kind"]
    bm = bmesh.new()
    if kind in BLOB_KINDS:
        _build_blob(bm, spec)
    elif kind in LIMB_KINDS:
        _build_limb(bm, spec)
    else:
        raise ValueError(f"part '{spec['name']}' has unknown kind '{kind}'")

    # Colours go on whole facets first, so a speckle never splits a quad in two.
    uv_layer = bm.loops.layers.uv.new("UVMap")
    for face in bm.faces:
        uv = palette.uv(_face_color(spec, face))
        face.smooth = not FLAT_SHADING
        face.material_index = 0
        for loop in face.loops:
            loop[uv_layer].uv = uv
    # Every polygon a triangle, so the glTF triangle count is predictable.
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    # Blender's element order varies between runs; sorting by position makes the export reproducible.
    _sort_by_position(bm.verts, lambda vert: vert.co)
    _sort_by_position(bm.faces, lambda face: face.calc_center_median())

    mesh = bpy.data.meshes.new(spec["name"])
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(material)

    obj = bpy.data.objects.new(spec["name"], mesh)
    bpy.context.collection.objects.link(obj)
    group = obj.vertex_groups.new(name=spec["bone"])
    group.add(range(len(mesh.vertices)), 1.0, "REPLACE")
    return obj


def _mirror_point(point, offset):
    x, y, z = point
    dx, dy, dz = offset
    return [-x + dx, y + dy, z + dz]


def _is_left(name):
    # Left-side names end their last segment with "l": ear_l, leg_fl, foot_bl.
    return "_" in name and name.endswith("l")


def _mirror_name(name):
    if not _is_left(name):
        raise ValueError(f"mirrored name '{name}' must end with _l, _fl or _bl")
    return name[:-1] + "r"


def expand_mirrors(part_specs):
    """Mirrored parts (ears, eyes, legs) become a left copy and a right copy.

    `mirrorOffset` nudges only the right copy: the deliberate asymmetry of the
    art direction (an ear a little lower than the other).
    """
    expanded = []
    for spec in part_specs:
        expanded.append(spec)
        if not spec.get("mirror", False):
            continue
        offset = spec.get("mirrorOffset", [0.0, 0.0, 0.0])
        twin = dict(spec)
        twin["name"] = _mirror_name(spec["name"])
        twin["bone"] = _mirror_name(spec["bone"]) if _is_left(spec["bone"]) else spec["bone"]
        for key in ("center", "start", "end"):
            if key in spec:
                twin[key] = _mirror_point(spec[key], offset)
        if "rollDeg" in spec:
            twin["rollDeg"] = -spec["rollDeg"]
        expanded.append(twin)
    return expanded
