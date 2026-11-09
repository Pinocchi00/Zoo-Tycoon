"""Build a visitor group GLB from its description.

Run headless:
    blender -b --factory-startup -P tools/blender/visitors/build.py -- \
        --desc tools/blender/visitors/descriptions/teen-photographer.json \
        --out assets/models/visitors/teen-photographer.glb
"""

import argparse
import json
import struct
import sys
from pathlib import Path

import bpy

BLENDER_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BLENDER_DIR))
from palette import build_material, load_palette  # noqa: E402

VISITORS_DIR = Path(__file__).parent
sys.path.insert(0, str(VISITORS_DIR))
from animations import build_person_animations  # noqa: E402
from human import add_stroller, build_person  # noqa: E402

EXPECTED_CLIP_NAMES = {"walk", "stop", "look", "point", "photo", "sit"}
ALLOWED_TINTS = {"skin", "hair", "shirt", "pants", "none"}
TRIANGLE_BUDGET_MIN = 800
TRIANGLE_BUDGET_MAX = 1500


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Build a visitor group model.")
    parser.add_argument("--desc", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    return parser.parse_args(argv)


def _count_triangles_per_person(group_root, member_count):
    counts = {i: 0 for i in range(member_count)}
    for obj in group_root.children_recursive:
        if obj.type != "MESH":
            continue
        person = obj.get("zooPerson")
        if person is None or person not in counts:
            continue
        counts[person] += sum(len(p.vertices) - 2 for p in obj.data.polygons)
    return counts


def build_group(description, palette, material):
    archetype_id = description["archetypeId"]
    member_count = description["memberCount"]

    group_root = bpy.data.objects.new(archetype_id, None)
    group_root.empty_display_type = "PLAIN_AXES"
    group_root.empty_display_size = 0.1
    group_root["zooVisitor"] = {
        "version": description.get("version", 1),
        "archetypeId": archetype_id,
        "memberCount": member_count,
    }
    bpy.context.collection.objects.link(group_root)

    persons = description["persons"]
    pivots_by_index = {}

    for person in persons:
        idx = person["index"]
        pivots = build_person(idx, person, palette, material, group_root)
        pivots_by_index[idx] = pivots

    # Optional parent-child relationships and props.
    for person in persons:
        idx = person["index"]
        if person.get("stroller", False):
            seat_pivot = add_stroller(pivots_by_index[idx], person, palette, material)
            pivots_by_index[idx]["stroller_seat"] = seat_pivot
        shoulder_child = person.get("shoulderChild")
        if shoulder_child is not None and shoulder_child in pivots_by_index:
            child_root = pivots_by_index[shoulder_child]["root"]
            shoulder_seat = pivots_by_index[idx]["shoulder_seat"]
            child_root.parent = shoulder_seat
            child_root.location = (0.0, 0.0, 0.0)

    # Move stroller baby onto the seat pivot.
    for person in persons:
        idx = person["index"]
        sit_target = person.get("sitOn")
        if sit_target is not None and sit_target in pivots_by_index:
            baby_root = pivots_by_index[idx]["root"]
            baby_root.parent = pivots_by_index[sit_target]["stroller_seat"]
            baby_root.location = (0.0, 0.0, 0.0)

    # Freeze the support hierarchy before snapshotting animation rest poses.
    for person in persons:
        idx = person["index"]
        build_person_animations(
            pivots_by_index[idx], idx, person.get("animations", {}),
            posture=person.get("posture", "standing"),
            stroller=person.get("stroller", False),
            shoulder_carrier=person.get("shoulderChild") is not None,
        )

    # Frame zero is the shared neutral pose; Blender defaults to frame one,
    # which already evaluates the sit transition and lowers the bind pose.
    bpy.context.scene.frame_set(0)
    return group_root


def merge_compatible_parts(group_root):
    """Keep independent articulation and tinting while sharing one draw per bucket."""
    buckets = {}
    for obj in group_root.children_recursive:
        if obj.type == "MESH":
            key = (obj.parent, obj["zooPerson"], obj["zooTint"])
            buckets.setdefault(key, []).append(obj)
    for objects in buckets.values():
        if len(objects) < 2:
            continue
        anchor = next((obj for obj in objects if obj.name.endswith(("_head_mesh", "_body_mesh"))), objects[0])
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = anchor
        bpy.ops.object.join()
        anchor.select_set(False)


def export(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_skins=False,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_force_sampling=True,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
    )


def _read_glb_json(path):
    """Return the JSON chunk of a GLB file as a Python dict."""
    data = path.read_bytes()
    if len(data) < 12:
        raise ValueError("GLB too small")
    magic, version, length = struct.unpack("<4sII", data[:12])
    if magic != b"glTF":
        raise ValueError("not a GLB file")
    chunk_len, chunk_type = struct.unpack("<II", data[12:20])
    if chunk_type != 0x4E4F534A:
        raise ValueError("first GLB chunk is not JSON")
    json_bytes = data[20 : 20 + chunk_len]
    return json.loads(json_bytes.decode("utf-8"))


def _node_name_to_person_index(name):
    """Extract the person index from a pivot/mesh name like p3_head_mesh."""
    if not name.startswith("p") or len(name) < 2 or not name[1].isdigit():
        return None
    end = 2
    while end < len(name) and name[end].isdigit():
        end += 1
    try:
        return int(name[1:end])
    except ValueError:
        return None


def _count_accessor_triangles(gltf, accessor_index):
    accessor = gltf["accessors"][accessor_index]
    count = accessor["count"]
    if accessor.get("type") != "SCALAR":
        # Assume triangles from a non-indexed primitive.
        return count // 3
    return count // 3


def validate_glb(path, description):
    """Fail loudly if the exported GLB does not match the visitor contract."""
    archetype_id = description["archetypeId"]
    member_count = description["memberCount"]
    gltf = _read_glb_json(path)

    # Single shared material and texture.
    materials = gltf.get("materials", [])
    if len(materials) != 1:
        raise ValueError(f"expected exactly one material, got {len(materials)}")
    if materials[0].get("name") != "palette":
        raise ValueError(f"material name must be 'palette', got {materials[0].get('name')}")
    images = gltf.get("images", [])
    if len(images) != 1:
        raise ValueError(f"expected exactly one image, got {len(images)}")

    # Root node with zooVisitor extras.
    root_node = None
    for node in gltf.get("nodes", []):
        extras = node.get("extras", {})
        visitor = extras.get("zooVisitor")
        if visitor is not None and visitor.get("archetypeId") == archetype_id:
            root_node = node
            break
    if root_node is None:
        raise ValueError(f"missing root node with zooVisitor archetypeId {archetype_id}")
    visitor = root_node.get("extras", {}).get("zooVisitor", {})
    if visitor.get("memberCount") != member_count:
        raise ValueError(
            f"zooVisitor memberCount mismatch: {visitor.get('memberCount')} != {member_count}"
        )

    # Exactly the six expected animation clips.
    animation_names = {anim.get("name") for anim in gltf.get("animations", [])}
    if animation_names != EXPECTED_CLIP_NAMES:
        raise ValueError(f"animation names mismatch: {animation_names}")
    for anim in gltf.get("animations", []):
        for channel in anim.get("channels", []):
            target_node = channel.get("target", {}).get("node")
            if target_node is None:
                raise ValueError("animation channel missing target node")
            node_name = gltf["nodes"][target_node].get("name", "")
            if _node_name_to_person_index(node_name) is None:
                raise ValueError(f"animation targets non-visitor node {node_name}")

    # Mesh nodes have zooPerson/zooTint and unique names starting with p<index>_.
    node_names = set()
    triangle_counts = {i: 0 for i in range(member_count)}
    mesh_by_index = {i: mesh for i, mesh in enumerate(gltf.get("meshes", []))}
    for node in gltf.get("nodes", []):
        node_name = node.get("name", "")
        if node_name in node_names:
            raise ValueError(f"duplicate node name {node_name}")
        node_names.add(node_name)
        mesh_index = node.get("mesh")
        if mesh_index is None:
            continue
        person = _node_name_to_person_index(node_name)
        if person is None:
            continue
        extras = node.get("extras", {})
        zoo_person = extras.get("zooPerson")
        zoo_tint = extras.get("zooTint")
        if zoo_person is None or not isinstance(zoo_person, int):
            raise ValueError(f"mesh node {node_name} missing integer zooPerson")
        if zoo_tint not in ALLOWED_TINTS:
            raise ValueError(f"mesh node {node_name} has invalid zooTint {zoo_tint}")
        if zoo_person != person:
            raise ValueError(
                f"mesh node {node_name} person index {person} != zooPerson {zoo_person}"
            )
        mesh = mesh_by_index.get(mesh_index)
        if mesh is None:
            raise ValueError(f"mesh node {node_name} references missing mesh {mesh_index}")
        for primitive in mesh.get("primitives", []):
            indices = primitive.get("indices")
            if indices is not None:
                triangle_counts[person] += _count_accessor_triangles(gltf, indices)
            else:
                position_accessor = primitive.get("attributes", {}).get("POSITION")
                if position_accessor is not None:
                    triangle_counts[person] += _count_accessor_triangles(gltf, position_accessor)

    for idx in range(member_count):
        count = triangle_counts[idx]
        if not (TRIANGLE_BUDGET_MIN <= count <= TRIANGLE_BUDGET_MAX):
            raise ValueError(
                f"person {idx} triangle count {count} outside budget "
                f"[{TRIANGLE_BUDGET_MIN}, {TRIANGLE_BUDGET_MAX}]"
            )


def main():
    args = parse_args()
    description = json.loads(args.desc.read_text(encoding="utf-8"))
    bpy.ops.wm.read_factory_settings(use_empty=True)

    palette = load_palette()
    material = build_material(palette)
    group_root = build_group(description, palette, material)
    merge_compatible_parts(group_root)
    export(args.out)

    counts = _count_triangles_per_person(group_root, description["memberCount"])
    for idx, tris in counts.items():
        print(f"[zoo-refuge] {description['archetypeId']} person {idx}: {tris} triangles")
    total = sum(counts.values())
    print(f"[zoo-refuge] {description['archetypeId']}: {total} triangles -> {args.out}")

    validate_glb(args.out, description)
    print(f"[zoo-refuge] {description['archetypeId']}: GLB validation passed")


if __name__ == "__main__":
    main()
