"""Simple skeleton and rigid skinning.

Each part follows exactly one bone with full weight. Low-poly parts stay
crisp this way, and the skinning is trivial to check and cheap on mobile.
"""

import bpy

from parts import game_to_blender

ARMATURE_NAME = "skeleton"


def build_armature(bone_specs):
    data = bpy.data.armatures.new(ARMATURE_NAME)
    armature = bpy.data.objects.new(ARMATURE_NAME, data)
    bpy.context.collection.objects.link(armature)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="EDIT")
    created = {}
    for spec in bone_specs:
        bone = data.edit_bones.new(spec["name"])
        bone.head = game_to_blender(spec["head"])
        bone.tail = game_to_blender(spec["tail"])
        bone.roll = 0.0
        parent = spec.get("parent")
        if parent is not None:
            if parent not in created:
                raise ValueError(f"bone '{spec['name']}' lists parent '{parent}' before it exists")
            bone.parent = created[parent]
        created[spec["name"]] = bone
    bpy.ops.object.mode_set(mode="OBJECT")
    for pose_bone in armature.pose.bones:
        pose_bone.rotation_mode = "XYZ"
    return armature


def bind(mesh_object, armature):
    bone_names = {bone.name for bone in armature.data.bones}
    for group in mesh_object.vertex_groups:
        if group.name not in bone_names:
            raise ValueError(f"part weighted to unknown bone '{group.name}'")
    mesh_object.parent = armature
    modifier = mesh_object.modifiers.new("skeleton", "ARMATURE")
    modifier.object = armature
