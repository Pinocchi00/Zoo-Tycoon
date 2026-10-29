"""Mandatory animation loops, driven by each species' parameters.

Every loop ends on the same pose it starts with, so it repeats seamlessly.
Bone names follow the quadruped skeleton: spine, chest, head, eyes, ear_l,
ear_r, leg_fl, leg_fr, leg_bl, leg_br.
"""

import math

import bpy

FPS = 30
REQUIRED_BONES = (
    "spine",
    "chest",
    "head",
    "eyes",
    "ear_l",
    "ear_r",
    "leg_fl",
    "leg_fr",
    "leg_bl",
    "leg_br",
)
# Diagonal pairs move together, as in a real walk.
LEG_PHASE = {"leg_fl": 0.0, "leg_br": 0.0, "leg_fr": 0.5, "leg_bl": 0.5}
BLINK_FRAMES = 3
EAR_TWITCH_FRAMES = 4
CLOSED_EYE_SCALE = 0.1


def _frame(seconds):
    return round(seconds * FPS)


def _reset_pose(armature):
    for pose_bone in armature.pose.bones:
        pose_bone.location = (0.0, 0.0, 0.0)
        pose_bone.rotation_euler = (0.0, 0.0, 0.0)
        pose_bone.scale = (1.0, 1.0, 1.0)


def _key(armature, bone_name, path, frame, value):
    pose_bone = armature.pose.bones[bone_name]
    setattr(pose_bone, path, value)
    pose_bone.keyframe_insert(data_path=path, frame=frame, group=bone_name)


def _new_action(armature, name):
    _reset_pose(armature)
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    armature.animation_data.action = action
    return action


def _stash(armature, action):
    # Each action on its own NLA track, so the exporter writes one glTF animation per action.
    track = armature.animation_data.nla_tracks.new()
    track.name = action.name
    track.strips.new(action.name, 0, action)
    armature.animation_data.action = None


def build_idle(armature, params):
    action = _new_action(armature, "idle")
    end = _frame(params["durationS"])
    breath = params["breathScale"]
    breaths = params["breathsPerLoop"]
    for i in range(breaths * 2 + 1):
        inflated = 1.0 + breath if i % 2 == 1 else 1.0
        # Local X is lateral and Z vertical for a bone pointing forward.
        _key(armature, "chest", "scale", round(end * i / (breaths * 2)), (inflated, 1.0, inflated))

    blink = _frame(params["blinkAtS"])
    for frame, scale in ((0, 1.0), (blink, 1.0), (blink + BLINK_FRAMES, CLOSED_EYE_SCALE),
                         (blink + 2 * BLINK_FRAMES, 1.0), (end, 1.0)):
        # The eye bone points up, so its local Y squashes the eyes vertically.
        _key(armature, "eyes", "scale", frame, (1.0, scale, 1.0))

    twitch = _frame(params["earTwitchAtS"])
    angle = math.radians(params["earTwitchDeg"])
    for frame, value in ((0, 0.0), (twitch, 0.0), (twitch + EAR_TWITCH_FRAMES, angle),
                         (twitch + 2 * EAR_TWITCH_FRAMES, 0.0), (end, 0.0)):
        _key(armature, "ear_r", "rotation_euler", frame, (value, 0.0, 0.0))

    nod = math.radians(params["headNodDeg"])
    for frame, value in ((0, 0.0), (end // 2, nod), (end, 0.0)):
        _key(armature, "head", "rotation_euler", frame, (value, 0.0, 0.0))
    _stash(armature, action)


def build_walk(armature, params):
    action = _new_action(armature, "walk")
    end = _frame(params["durationS"])
    swing = math.radians(params["legSwingDeg"])
    for bone, phase in LEG_PHASE.items():
        for step in range(5):
            t = step / 4
            value = swing * math.cos(2.0 * math.pi * (t + phase))
            _key(armature, bone, "rotation_euler", round(end * t), (value, 0.0, 0.0))

    bob = params["bodyBobM"]
    nod = math.radians(params["headNodDeg"])
    for step in range(5):
        t = step / 4
        # Two bobs per cycle: the body rises each time a diagonal pair passes under it.
        lift = bob * (1.0 - math.cos(4.0 * math.pi * t)) / 2.0
        _key(armature, "spine", "location", round(end * t), (0.0, 0.0, lift))
        _key(armature, "head", "rotation_euler", round(end * t),
             (nod * math.sin(4.0 * math.pi * t), 0.0, 0.0))
    _stash(armature, action)


def build_animations(armature, params):
    missing = [name for name in REQUIRED_BONES if name not in armature.pose.bones]
    if missing:
        raise ValueError(f"skeleton is missing bones: {', '.join(missing)}")
    bpy.context.scene.render.fps = FPS
    armature.animation_data_create()
    build_idle(armature, params["idle"])
    build_walk(armature, params["walk"])
    _reset_pose(armature)
