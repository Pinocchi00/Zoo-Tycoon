"""Shared colour palette: one small image, one material, every model.

Each colour fills one square swatch of a grid. A face picks its colour by
pointing all its UVs at the centre of that swatch, so the whole bestiary
shares a single texture and a single material.
"""

import json
from pathlib import Path

import bpy

MATERIAL_NAME = "palette"
IMAGE_NAME = "palette"
PALETTE_FILE = Path(__file__).with_name("palette.json")


class Palette:
    def __init__(self, grid_size, swatch_pixels, colors):
        self.grid_size = grid_size
        self.swatch_pixels = swatch_pixels
        self.colors = colors  # list of (name, (r, g, b)) in sRGB 0..1
        self._index = {name: i for i, (name, _) in enumerate(colors)}
        if len(colors) > grid_size * grid_size:
            raise ValueError("palette has more colours than swatches")
        if len(self._index) != len(colors):
            raise ValueError("palette colour names must be unique")

    def uv(self, color_name):
        """UV coordinate of the centre of a colour's swatch."""
        if color_name not in self._index:
            raise KeyError(f"unknown palette colour '{color_name}'")
        index = self._index[color_name]
        column = index % self.grid_size
        row = index // self.grid_size
        # Row 0 is at the top of the image; Blender's V axis points up.
        return ((column + 0.5) / self.grid_size, 1.0 - (row + 0.5) / self.grid_size)


def _hex_to_rgb(text):
    value = text.lstrip("#")
    if len(value) != 6:
        raise ValueError(f"colour '{text}' must be #rrggbb")
    return tuple(int(value[i : i + 2], 16) / 255.0 for i in (0, 2, 4))


def load_palette():
    data = json.loads(PALETTE_FILE.read_text(encoding="utf-8"))
    colors = [(entry["name"], _hex_to_rgb(entry["hex"])) for entry in data["colors"]]
    return Palette(data["gridSize"], data["swatchPixels"], colors)


def _build_image(palette):
    size = palette.grid_size * palette.swatch_pixels
    image = bpy.data.images.new(IMAGE_NAME, width=size, height=size, alpha=False)
    image.colorspace_settings.name = "sRGB"
    # Unused swatches stay a neutral grey so a wrong UV is easy to spot.
    pixels = [0.5, 0.5, 0.5, 1.0] * (size * size)
    for index, (_, (r, g, b)) in enumerate(palette.colors):
        column = index % palette.grid_size
        row_from_top = index // palette.grid_size
        for dy in range(palette.swatch_pixels):
            # Image pixel rows start at the bottom.
            y = size - 1 - (row_from_top * palette.swatch_pixels + dy)
            for dx in range(palette.swatch_pixels):
                x = column * palette.swatch_pixels + dx
                offset = (y * size + x) * 4
                pixels[offset : offset + 4] = [r, g, b, 1.0]
    image.pixels.foreach_set(pixels)
    image.file_format = "PNG"
    image.pack()
    return image


def build_material(palette):
    """The one material every model uses: matte, coloured by the palette image."""
    material = bpy.data.materials.new(MATERIAL_NAME)
    # Closed meshes only: drawing back faces would double the fill cost on mobile.
    material.use_backface_culling = True
    material.use_nodes = True
    nodes = material.node_tree.nodes
    shader = nodes["Principled BSDF"]
    shader.inputs["Roughness"].default_value = 1.0
    shader.inputs["Metallic"].default_value = 0.0
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = _build_image(palette)
    # Nearest filtering keeps each swatch a flat colour, even at swatch edges.
    texture.interpolation = "Closest"
    material.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    return material
