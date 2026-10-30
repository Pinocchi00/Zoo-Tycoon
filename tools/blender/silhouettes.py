"""Renders every exported model as a black side-view silhouette on white.

Run headless (see docs/blender.md, or `npm run models:silhouettes`):
    blender -b --factory-startup -P tools/blender/silhouettes.py -- \
        --models assets/models --out docs/silhouettes.png

The silhouettes sit side by side, in alphabetical order, one square cell each.
They are the recognition test of the art direction: every species must be
identifiable from its shadow alone, at this size.
"""

import argparse
import sys
import tempfile
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

CELL_PIXELS = 48
# Share of the cell left empty around the animal, on each side.
MARGIN = 0.06
CAMERA_DISTANCE_M = 20.0
CHANNELS = 4
WHITE = (1.0, 1.0, 1.0)
BLACK = (0.0, 0.0, 0.0)


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Render the silhouette sheet.")
    parser.add_argument("--models", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    return parser.parse_args(argv)


def setup_scene():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = CELL_PIXELS
    scene.render.resolution_y = CELL_PIXELS
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    # Hard edges: the sheet is pure black on pure white.
    scene.display.render_aa = "OFF"
    scene.view_settings.view_transform = "Standard"
    shading = scene.display.shading
    shading.light = "FLAT"
    shading.color_type = "SINGLE"
    shading.single_color = BLACK
    shading.show_object_outline = False
    shading.show_cavity = False
    shading.show_xray = False
    world = bpy.data.worlds.new("white")
    world.color = WHITE
    scene.world = world

    data = bpy.data.cameras.new("side")
    data.type = "ORTHO"
    camera = bpy.data.objects.new("side", data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    return camera


def clear_models():
    for obj in list(bpy.data.objects):
        if obj.type != "CAMERA":
            bpy.data.objects.remove(obj, do_unlink=True)


def import_in_rest_pose(path):
    clear_models()
    bpy.ops.import_scene.gltf(filepath=str(path))
    for obj in bpy.data.objects:
        if obj.type == "ARMATURE":
            # The importer may leave an animation applied: show the bind pose.
            obj.data.pose_position = "REST"
    bpy.context.view_layer.update()
    # The importer also adds helper shapes for the bones: only the skinned mesh is the animal.
    return [
        obj
        for obj in bpy.data.objects
        if obj.type == "MESH" and any(m.type == "ARMATURE" for m in obj.modifiers)
    ]


def world_bounds(meshes):
    corners = [obj.matrix_world @ Vector(c) for obj in meshes for c in obj.bound_box]
    low = Vector(tuple(min(c[i] for c in corners) for i in range(3)))
    high = Vector(tuple(max(c[i] for c in corners) for i in range(3)))
    return low, high


def frame_side_view(camera, meshes):
    """Looks along +X, so the animal faces right (its forward is -Y in Blender)."""
    low, high = world_bounds(meshes)
    center = (low + high) / 2.0
    right, up, back = Vector((0, -1, 0)), Vector((0, 0, 1)), Vector((-1, 0, 0))
    rotation = Matrix((right, up, back)).transposed().to_4x4()
    camera.matrix_world = Matrix.Translation(center + back * CAMERA_DISTANCE_M) @ rotation
    largest = max(high.y - low.y, high.z - low.z)
    camera.data.ortho_scale = largest / (1.0 - 2.0 * MARGIN)


def render_cell(scene, scratch):
    scene.render.filepath = str(scratch)
    bpy.ops.render.render(write_still=True)
    image = bpy.data.images.load(str(scratch))
    pixels = list(image.pixels)
    bpy.data.images.remove(image)
    return pixels


def assemble(cells, out):
    width = CELL_PIXELS * len(cells)
    sheet = [1.0] * (width * CELL_PIXELS * CHANNELS)
    row_values = CELL_PIXELS * CHANNELS
    for index, cell in enumerate(cells):
        for row in range(CELL_PIXELS):
            start = (row * width + index * CELL_PIXELS) * CHANNELS
            sheet[start : start + row_values] = cell[row * row_values : (row + 1) * row_values]
    image = bpy.data.images.new("silhouettes", width=width, height=CELL_PIXELS, alpha=False)
    image.pixels = sheet
    image.filepath_raw = str(out)
    image.file_format = "PNG"
    out.parent.mkdir(parents=True, exist_ok=True)
    image.save()


def main():
    args = parse_args()
    models = sorted(args.models.glob("*.glb"), key=lambda path: path.name)
    if not models:
        raise SystemExit(f"no .glb model in {args.models}")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    camera = setup_scene()
    scene = bpy.context.scene
    cells = []
    with tempfile.TemporaryDirectory() as scratch_dir:
        for model in models:
            meshes = import_in_rest_pose(model)
            frame_side_view(camera, meshes)
            cells.append(render_cell(scene, Path(scratch_dir) / f"{model.stem}.png"))
    assemble(cells, args.out)
    print(f"[zoo-refuge] silhouettes: {len(cells)} models -> {args.out}")


if __name__ == "__main__":
    main()
