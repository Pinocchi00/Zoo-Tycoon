"""Render the exported visitor models in stop pose for the owner's review."""

import argparse
import math
import re
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[3]
ARCHETYPES = ("stroller-family", "shoulder-ride", "couple", "teen-photographer", "retirees")
# Keep these sRGB choices in sync with src/render/visitors/visual-seed.ts.
TINT_COLORS = {
    "skin": (0xFFC8A8, 0xFFD5B5, 0xEEB88E, 0x8D552A),
    "hair": (0x2C1B12, 0x4A3425, 0xEED4A0, 0x8C785B, 0xEEEEEE),
    "shirt": (0xFF5555, 0x55AAFF, 0xFFDD44, 0x88CC88, 0xFF9900, 0xEEEEEE),
    "pants": (0x334455, 0x556677, 0x887766, 0x444444, 0x998877),
}
FACE_PEOPLE = (3, 1, 0, 0, 1)
DARKEST_SKIN = 0x8D552A
LIGHT_SKIN = 0xFFC8A8


def linear_channel(value):
    value /= 255.0
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def tint_material(obj, color):
    # Match Three.js: multiply the existing palette texel by a linear instance color.
    material = obj.data.materials[0].copy()
    obj.data.materials[0] = material
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
    base = shader.inputs["Base Color"]
    texture = base.links[0].from_socket
    multiply = nodes.new("ShaderNodeMixRGB")
    multiply.blend_type = "MULTIPLY"
    multiply.inputs[0].default_value = 1.0
    multiply.inputs[2].default_value = tuple(linear_channel((color >> shift) & 255) for shift in (16, 8, 0)) + (1.0,)
    links.new(texture, multiply.inputs[1])
    links.new(multiply.outputs[0], base)


def verify_game_colors():
    source = (ROOT / "src/render/visitors/visual-seed.ts").read_text(encoding="utf-8")
    for tint, colors in TINT_COLORS.items():
        case = source.split(f"case '{tint}':", 1)[1].split("[", 1)[1].split("]", 1)[0]
        game_colors = tuple(int(value.replace("_", ""), 16) for value in re.findall(r"0x[0-9a-f_]+", case))
        assert colors == game_colors, f"preview {tint} palette differs from visual-seed.ts"


def person_tint(archetype_index, person, tint):
    # Explicit light/dark swatches make catchlight regressions visible in both previews.
    if tint == "skin" and person == FACE_PEOPLE[archetype_index]:
        return DARKEST_SKIN if archetype_index == 1 else LIGHT_SKIN
    choices = TINT_COLORS[tint]
    return choices[(archetype_index * 2 + person) % len(choices)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--faces", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    verify_game_colors()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for index, archetype in enumerate(ARCHETYPES):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(ROOT / "assets/models/visitors" / f"{archetype}.glb"))
        bpy.context.scene.frame_set(0)
        objects = set(bpy.data.objects) - before
        group = next(obj for obj in objects if obj.get("zooVisitor") is not None)
        group.location.x = (-5.1, -2.2, -0.2, 1.8, 3.8)[index]
        group.rotation_euler.z = math.radians(-25)
        for obj in objects:
            if obj.animation_data:
                obj.animation_data.action = None
            if obj.type == "MESH" and obj.get("zooTint", "none") != "none":
                tint = obj["zooTint"]
                tint_material(obj, person_tint(index, obj["zooPerson"], tint))
        # Imported glTF actions are assigned directly by Blender; evaluate only stop.
        for obj in objects:
            if obj.animation_data:
                stop = next((track for track in obj.animation_data.nla_tracks if "stop" in track.name), None)
                for track in obj.animation_data.nla_tracks:
                    track.mute = track != stop
        if args.faces:
            person = FACE_PEOPLE[index]
            for obj in objects:
                if obj.type == "MESH" and obj["zooPerson"] != person:
                    obj.hide_render = True
                if obj.type == "MESH" and "_leg_" in obj.name:
                    obj.hide_render = True
            group.rotation_euler.z = 0.0
            group.location = (0.0, 0.0, 0.0)
            scene = bpy.context.scene
            scene.frame_set(15)
            bpy.context.view_layer.update()
            head = next(obj for obj in objects if obj.name.split(".")[0] == f"p{person}_head")
            factor = 0.48 / head["zooHeadRadius"]
            group.scale = (factor,) * 3
            bpy.context.view_layer.update()
            center = head.matrix_world.translation.copy()
            group.location = Vector(((index - 2) * 1.10, 0.0, 1.25)) - center

    scene = bpy.context.scene
    scene.frame_set(15)
    bpy.ops.mesh.primitive_plane_add(size=200)
    floor = bpy.context.object
    floor.name = "preview_floor"
    material = bpy.data.materials.new("preview_neutral")
    material.diffuse_color = (0.85, 0.85, 0.83, 1.0)
    floor.data.materials.append(material)
    bpy.ops.object.camera_add(location=(0.0, -12.0, 1.2 if args.faces else 5.5))
    camera = bpy.context.object
    camera.rotation_euler = (Vector((0.0, 0.0, 1.2 if args.faces else 0.8)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 5.7 if args.faces else 12.8
    scene.camera = camera
    for location, energy, size in (((-3, -5, 8), 700, 8), ((6, 1, 6), 400, 7)):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = size
        light.rotation_euler = (-light.location).to_track_quat("-Z", "Y").to_euler()
    scene.world = bpy.data.worlds.new("preview_world")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.85, 0.85, 0.83, 1)
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.5
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 32
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "Standard"
    scene.render.filepath = str(ROOT / "docs" / ("visitors-preview-faces.png" if args.faces else "visitors-preview.png"))
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
