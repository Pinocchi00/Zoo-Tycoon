"""Inspect rest location and walk keyframes in the source scene."""
import json
import sys
from pathlib import Path

import bpy

BLENDER_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BLENDER_DIR))
from palette import build_material, load_palette  # noqa: E402

VISITORS_DIR = Path(__file__).parent
sys.path.insert(0, str(VISITORS_DIR))
from animations import build_person_animations  # noqa: E402
from human import build_person  # noqa: E402

desc_path = Path(sys.argv[-1])
desc = json.loads(desc_path.read_text(encoding="utf-8"))

bpy.ops.wm.read_factory_settings(use_empty=True)
palette = load_palette()
material = build_material(palette)

person = desc["persons"][0]
pivots = build_person(person["index"], person, palette, material, None)
print("hips rest location before anim:", pivots["hips"].location)
build_person_animations(pivots, person["index"], person.get("animations", {}))
print("hips rest location after anim:", pivots["hips"].location)

# Inspect the walk action fcurve on hips.
hips = pivots["hips"]
for track in hips.animation_data.nla_tracks:
    print("track", track.name)
    for strip in track.strips:
        action = strip.action
        print("action", action.name)
        for fcurve in action.fcurves:
            print(fcurve.data_path, fcurve.array_index, [k.co for k in fcurve.keyframe_points])
