"""Six non-empty actions per visitor: walk, stop, look, point, photo, sit.

Pivots are animated as plain objects.  Each object gets uniquely-named actions,
but they are stashed on NLA tracks whose names are the base clip names; the
 glTF exporter merges tracks with identical names into one clip per animation.
All location keyframes are offsets from the pivot's rest location, so the rest
height of the hips (and every other joint) is never overwritten.
"""

import math

import bpy
from mathutils import Vector

FPS = 30


def _store_rest(pivots):
    """Snapshot each pivot's rest transform so clips can safely offset from it."""
    rest = {}
    for obj in pivots.values():
        if obj is None:
            continue
        rest[obj.name] = {
            "location": obj.location.copy(),
            "rotation_euler": obj.rotation_euler.copy(),
            "scale": obj.scale.copy(),
        }
    return rest


def _restore_rest(pivots, rest):
    """Bring every pivot back to its rest pose before authoring a new clip."""
    for obj in pivots.values():
        if obj is None:
            continue
        r = rest.get(obj.name)
        if r is None:
            continue
        obj.location = r["location"].copy()
        obj.rotation_euler = r["rotation_euler"].copy()
        obj.scale = r["scale"].copy()


def _new_action(obj, base_name):
    """Create a uniquely-named action for this object, keyed by base clip name."""
    obj.animation_data_create()
    # Use a per-object unique action name; Blender deduplicates global action
    # names automatically, but the NLA track name below is the shared base name.
    action = bpy.data.actions.new(f"{base_name}_{obj.name}")
    action.use_fake_user = True
    obj.animation_data.action = action
    return action


def _stash(obj, action, base_name):
    """Push the action onto an NLA track named after the base clip."""
    track = obj.animation_data.nla_tracks.new()
    track.name = base_name
    track.strips.new(action.name, 0, action)
    obj.animation_data.action = None


def _loc_offset(obj, frame, offset_xyz, rest):
    """Keyframe location as rest + offset."""
    base = rest.get(obj.name, {}).get("location", Vector((0.0, 0.0, 0.0)))
    obj.location = base + Vector(offset_xyz)
    obj.keyframe_insert(data_path="location", frame=frame)


def _rot(obj, frame, xyz):
    obj.rotation_euler = xyz
    obj.keyframe_insert(data_path="rotation_euler", frame=frame)


def _scale(obj, frame, xyz):
    obj.scale = xyz
    obj.keyframe_insert(data_path="scale", frame=frame)


def _reset(obj, rest):
    r = rest.get(obj.name, {})
    obj.location = r.get("location", Vector((0.0, 0.0, 0.0))).copy()
    obj.rotation_euler = r.get("rotation_euler", Vector((0.0, 0.0, 0.0))).copy()
    obj.scale = r.get("scale", Vector((1.0, 1.0, 1.0))).copy()


def build_walk(pivots, person_index, rest, duration_s=1.0, swing_deg=25.0, bob_m=0.03,
               hands_busy=False):
    base = "walk"
    end = round(duration_s * FPS)
    swing = math.radians(swing_deg)
    leg_l = _new_action(pivots["leg_l"], base)
    leg_r = _new_action(pivots["leg_r"], base)
    arm_l = _new_action(pivots["arm_l"], base)
    arm_r = _new_action(pivots["arm_r"], base)
    hips = _new_action(pivots["hips"], base)

    for step in range(5):
        t = step / 4
        frame = round(end * t)
        v_leg_l = swing * math.cos(2.0 * math.pi * t)
        v_leg_r = swing * math.cos(2.0 * math.pi * (t + 0.5))
        v_arm_l = -v_leg_l * 0.7
        v_arm_r = -v_leg_r * 0.7
        _rot(pivots["leg_l"], frame, (v_leg_l, 0.0, 0.0))
        _rot(pivots["leg_r"], frame, (v_leg_r, 0.0, 0.0))
        _rot(pivots["arm_l"], frame, (0.0 if hands_busy else v_arm_l, 0.0, 0.0))
        _rot(pivots["arm_r"], frame, (0.0 if hands_busy else v_arm_r, 0.0, 0.0))
        lift = bob_m * (1.0 - math.cos(4.0 * math.pi * t)) / 2.0
        _loc_offset(pivots["hips"], frame, (0.0, 0.0, lift), rest)

    _stash(pivots["leg_l"], leg_l, base)
    _stash(pivots["leg_r"], leg_r, base)
    _stash(pivots["arm_l"], arm_l, base)
    _stash(pivots["arm_r"], arm_r, base)
    _stash(pivots["hips"], hips, base)


def build_stop(pivots, person_index, rest, duration_s=2.0):
    base = "stop"
    end = round(duration_s * FPS)
    spine = _new_action(pivots["spine"], base)
    head = _new_action(pivots["head"], base)
    arm_l = _new_action(pivots["arm_l"], base)
    arm_r = _new_action(pivots["arm_r"], base)

    # Subtle breathing: spine scales and shoulders relax.
    for step in range(5):
        t = step / 4
        frame = round(end * t)
        s = 1.0 + 0.015 * math.sin(2.0 * math.pi * t)
        _scale(pivots["spine"], frame, (s, s, s))
        _rot(pivots["arm_l"], frame, (math.radians(2.0 * math.sin(2.0 * math.pi * t)), 0.0, 0.0))
        _rot(pivots["arm_r"], frame, (math.radians(2.0 * math.sin(2.0 * math.pi * t + 0.5)), 0.0, 0.0))
        _rot(pivots["head"], frame, (math.radians(1.5 * math.sin(2.0 * math.pi * t)), 0.0, 0.0))

    _stash(pivots["spine"], spine, base)
    _stash(pivots["head"], head, base)
    _stash(pivots["arm_l"], arm_l, base)
    _stash(pivots["arm_r"], arm_r, base)


def build_look(pivots, person_index, rest, duration_s=2.0, yaw_deg=35.0):
    base = "look"
    end = round(duration_s * FPS)
    head = _new_action(pivots["head"], base)

    for step in range(5):
        t = step / 4
        frame = round(end * t)
        yaw = math.radians(yaw_deg) * math.sin(2.0 * math.pi * t)
        _rot(pivots["head"], frame, (0.0, 0.0, yaw))

    _stash(pivots["head"], head, base)


def build_point(pivots, person_index, rest, duration_s=1.5):
    base = "point"
    end = round(duration_s * FPS)
    arm_r = _new_action(pivots["arm_r"], base)
    head = _new_action(pivots["head"], base)

    # Arm raises and points, head turns to look.
    for t, arm_x, arm_z, head_z in (
        (0.0, 0.0, 0.0, 0.0),
        (0.2, -math.radians(70.0), math.radians(20.0), math.radians(-15.0)),
        (0.4, -math.radians(90.0), math.radians(35.0), math.radians(-25.0)),
        (0.7, -math.radians(90.0), math.radians(35.0), math.radians(-25.0)),
        (1.0, 0.0, 0.0, 0.0),
    ):
        frame = round(end * t)
        _rot(pivots["arm_r"], frame, (arm_x, 0.0, arm_z))
        _rot(pivots["head"], frame, (0.0, 0.0, head_z))

    _stash(pivots["arm_r"], arm_r, base)
    _stash(pivots["head"], head, base)


def build_photo(pivots, person_index, rest, duration_s=2.0):
    base = "photo"
    end = round(duration_s * FPS)
    arm_r = _new_action(pivots["arm_r"], base)
    head = _new_action(pivots["head"], base)

    # Raise camera to eye level and hold, with a tiny head tilt.
    for t, arm_x, head_x in (
        (0.0, 0.0, 0.0),
        (0.25, -math.radians(75.0), math.radians(-5.0)),
        (0.4, -math.radians(85.0), math.radians(-10.0)),
        (0.6, -math.radians(85.0), math.radians(-10.0)),
        (0.75, -math.radians(75.0), math.radians(-5.0)),
        (1.0, 0.0, 0.0),
    ):
        frame = round(end * t)
        _rot(pivots["arm_r"], frame, (arm_x, 0.0, math.radians(30.0)))
        _rot(pivots["head"], frame, (head_x, 0.0, 0.0))

    _stash(pivots["arm_r"], arm_r, base)
    _stash(pivots["head"], head, base)


def build_sit(pivots, person_index, rest, duration_s=1.0):
    base = "sit"
    end = round(duration_s * FPS)
    hips = _new_action(pivots["hips"], base)
    spine = _new_action(pivots["spine"], base)
    leg_l = _new_action(pivots["leg_l"], base)
    leg_r = _new_action(pivots["leg_r"], base)

    for step in range(5):
        t = step / 4
        frame = round(end * t)
        sit = (1.0 - math.cos(math.pi * t)) / 2.0
        # Hips drop relative to the rest pose; the rest height itself is preserved.
        _loc_offset(pivots["hips"], frame, (0.0, 0.0, -0.35 * sit), rest)
        _rot(pivots["spine"], frame, (math.radians(15.0) * sit, 0.0, 0.0))
        _rot(pivots["leg_l"], frame, (math.radians(-90.0) * sit, 0.0, 0.0))
        _rot(pivots["leg_r"], frame, (math.radians(-90.0) * sit, 0.0, 0.0))

    _stash(pivots["hips"], hips, base)
    _stash(pivots["spine"], spine, base)
    _stash(pivots["leg_l"], leg_l, base)
    _stash(pivots["leg_r"], leg_r, base)


def build_supported_pose(pivots, rest, base, duration_s, carried):
    """Keep support contacts fixed; only breathing and head attention move."""
    end = round(duration_s * FPS)
    for name in ("hips", "leg_l", "leg_r", "arm_l", "arm_r", "spine", "head"):
        obj = pivots[name]
        action = _new_action(obj, base)
        for step in range(5):
            t = step / 4
            frame = round(end * t)
            _loc_offset(obj, frame, (0.0, 0.0, 0.0), rest)
            rotation = rest[obj.name]["rotation_euler"].copy()
            if name == "head":
                rotation.z += math.radians(12.0 if base == "look" else 2.0) * math.sin(2 * math.pi * t)
            _rot(obj, frame, rotation)
            if name == "spine" and carried:
                breath = 1.0 + 0.005 * math.sin(2 * math.pi * t)
                _scale(obj, frame, (1.0, 1.0, breath))
        _stash(obj, action, base)


def build_person_animations(pivots, person_index, params=None, posture="standing",
                            stroller=False, shoulder_carrier=False):
    """Create all six clips for one person."""
    params = params or {}
    rest = _store_rest(pivots)
    _restore_rest(pivots, rest)
    carried = posture in {"stroller", "shoulders"}
    if carried or stroller or shoulder_carrier:
        for base, default_duration in (
            ("walk", 1.0), ("stop", 2.0), ("look", 2.0),
            ("point", 1.5), ("photo", 2.0), ("sit", 1.0),
        ):
            duration = params.get(f"{base}DurationS", default_duration)
            if base == "walk" and not carried:
                build_walk(pivots, person_index, rest, duration_s=duration,
                           hands_busy=True, bob_m=0.0 if stroller else 0.03)
            elif base == "sit" and shoulder_carrier:
                build_sit(pivots, person_index, rest, duration_s=duration)
            else:
                build_supported_pose(pivots, rest, base, duration, carried)
            _restore_rest(pivots, rest)
        return

    build_walk(pivots, person_index, rest, duration_s=params.get("walkDurationS", 1.0))
    _restore_rest(pivots, rest)
    build_stop(pivots, person_index, rest, duration_s=params.get("stopDurationS", 2.0))
    _restore_rest(pivots, rest)
    build_look(pivots, person_index, rest, duration_s=params.get("lookDurationS", 2.0))
    _restore_rest(pivots, rest)
    build_point(pivots, person_index, rest, duration_s=params.get("pointDurationS", 1.5))
    _restore_rest(pivots, rest)
    build_photo(pivots, person_index, rest, duration_s=params.get("photoDurationS", 2.0))
    _restore_rest(pivots, rest)
    build_sit(pivots, person_index, rest, duration_s=params.get("sitDurationS", 1.0))

    # Leave the rig in rest pose so the prototype is clean.
    _restore_rest(pivots, rest)
