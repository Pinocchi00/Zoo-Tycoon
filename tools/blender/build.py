"""Builds one species model from its description and exports it as .glb.

Run headless (see docs/blender.md, or `npm run models`):
    blender -b --factory-startup -P tools/blender/build.py -- \
        --species tools/blender/species/capybara.json --out assets/models/capybara.glb
"""

import argparse
import json
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).parent))

from animations import build_animations  # noqa: E402
from palette import build_material, load_palette  # noqa: E402
from parts import build_part, expand_mirrors  # noqa: E402
from rig import bind, build_armature  # noqa: E402

MODEL_OBJECT_NAME = "body"


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Build a species model.")
    parser.add_argument("--species", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    return parser.parse_args(argv)


def build_mesh(parts, palette, material):
    objects = [build_part(spec, palette, material) for spec in expand_mirrors(parts)]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    # One mesh, one material, one draw call per animal.
    bpy.ops.object.join()
    mesh_object = bpy.context.view_layer.objects.active
    mesh_object.name = f"{MODEL_OBJECT_NAME}"
    mesh_object.data.name = mesh_object.name
    return mesh_object


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
        export_skins=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
    )


def main():
    args = parse_args()
    description = json.loads(args.species.read_text(encoding="utf-8"))
    bpy.ops.wm.read_factory_settings(use_empty=True)

    palette = load_palette()
    material = build_material(palette)
    armature = build_armature(description["bones"])
    mesh_object = build_mesh(description["parts"], palette, material)
    mesh_object.name = description["id"]
    bind(mesh_object, armature)
    build_animations(armature, description["animations"])
    export(args.out)

    triangles = sum(len(p.vertices) - 2 for p in mesh_object.data.polygons)
    print(f"[zoo-refuge] {description['id']}: {triangles} triangles -> {args.out}")


if __name__ == "__main__":
    main()
