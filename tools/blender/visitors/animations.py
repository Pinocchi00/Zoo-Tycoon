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


def build_walk(pivots, person_index, rest, duration_s=1.0, swing_deg=18.0, bob_m=0.035,
               hands_busy=False):
    base = "walk"
    end = round(duration_s * FPS)
    swing = math.radians(swing_deg)
    leg_l = _new_action(pivots["leg_l"], base)
    leg_r = _new_action(pivots["leg_r"], base)
    arm_l = _new_action(pivots["arm_l"], base)
    arm_r = _new_action(pivots["arm_r"], base)
    hips = _new_action(pivots["hips"], base)

    for step in range(17):
        t = step / 16
        frame = round(end * t)
        v_leg_l = swing * math.cos(2.0 * math.pi * t)
        v_leg_r = swing * math.cos(2.0 * math.pi * (t + 0.5))
        v_arm_l = -v_leg_l * 0.7
        v_arm_r = -v_leg_r * 0.7
        _rot(pivots["leg_l"], frame, (v_leg_l, 0.0, 0.0))
        _rot(pivots["leg_r"], frame, (v_leg_r, 0.0, 0.0))
        _rot(pivots["arm_l"], frame, (0.0 if hands_busy else v_arm_l, 0.0, 0.0))
        _rot(pivots["arm_r"], frame, (0.0 if hands_busy else v_arm_r, 0.0, 0.0))
        lift = bob_m * (1.0 - math.cos(4.0 * math.pi * t)) / 2.0 + 0.008
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
        _rot(pivots["head"], frame, (math.radians(1.5 * math.sin(2.0 * math.pi * t)), math.radians(3.0), 0.0))

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
        _rot(pivots["head"], frame, (0.0, math.radians(5.0) * math.sin(2.0 * math.pi * t), yaw))

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
    arm_l = _new_action(pivots["arm_l"], base)
    head = _new_action(pivots["head"], base)
    camera = pivots["camera"]
    camera_action = _new_action(camera, base) if camera is not None else None
    strap = pivots["camera_strap"]
    strap_action = _new_action(strap, base) if strap is not None else None
    hand_actions = {side: _new_action(pivots[f"hand_{side}"], base)
                    for side in ("l", "r") if pivots[f"hand_{side}"] is not None}

    # Dense keys keep the rotating strap in contact with the translating camera.
    for frame in range(end + 1):
        t = frame / end
        lift = min(t / 0.4, (1.0 - t) / 0.4, 1.0)
        reach = (1.0 - math.cos(math.pi * lift)) * 0.5
        for side, sign in (("r", 1), ("l", -1)):
            arm = pivots[f"arm_{side}"]
            hand = arm["zooHand"]
            source = Vector((hand[0], -hand[2], hand[1]))
            grip = camera["zooGripWidth"] if camera is not None else 0.055
            target = Vector((-arm.location.x + sign * grip,
                              -pivots["head"]["zooHeadRadius"] * 1.3 - 0.03,
                              pivots["head"].location.z - arm.location.z))
            rotation = source.rotation_difference(target).to_euler()
            _rot(arm, frame, tuple(value * reach for value in rotation))
            stretch = 1.0 + (target.length / source.length - 1.0) * reach if camera is not None else 1.0
            _scale(arm, frame, (1.0, 1.0, stretch))
            if side in hand_actions:
                # The forearm extends longitudinally; the hand remains a rigid ball.
                _scale(pivots[f"hand_{side}"], frame, (1.0, 1.0, 1.0 / stretch))
        if camera is not None:
            target = Vector((0.0, -pivots["head"]["zooHeadRadius"] * 1.3 - 0.03,
                             pivots["head"].location.z))
            origin = rest[camera.name]["location"]
            _loc_offset(camera, frame, (target - origin) * reach, rest)
            _rot(camera, frame, (0.0, 0.0, 0.0))
            direction = camera.location - strap.location
            rotation = Vector((0, 0, -1)).rotation_difference(direction).to_euler()
            _rot(strap, frame, rotation)
            _scale(strap, frame, (1.0, 1.0, direction.length / strap["zooStrapLength"]))
        _rot(pivots["head"], frame, (0.0, 0.0, 0.0))

    _stash(pivots["arm_r"], arm_r, base)
    _stash(pivots["arm_l"], arm_l, base)
    _stash(pivots["head"], head, base)
    if camera is not None:
        _stash(camera, camera_action, base)
        _stash(strap, strap_action, base)
    for side, action in hand_actions.items():
        _stash(pivots[f"hand_{side}"], action, base)


def build_sit(pivots, person_index, rest, duration_s=1.0):
    base = "sit"
    end = round(duration_s * FPS)
    hips = _new_action(pivots["hips"], base)
    spine = _new_action(pivots["spine"], base)
    leg_l = _new_action(pivots["leg_l"], base)
    leg_r = _new_action(pivots["leg_r"], base)

    for step in range(17):
        t = step / 16
        frame = round(end * t)
        sit = (1.0 - math.cos(math.pi * t)) / 2.0
        legs = min(sit * 2.0, 1.0)
        descend = max(sit * 2.0 - 1.0, 0.0)
        # Hips drop relative to the rest pose; the rest height itself is preserved.
        hip_height = rest[pivots["hips"].name]["location"].z
        seat_height = pivots["hips"]["zooSeatHeight"]
        _loc_offset(pivots["hips"], frame, (0.0, 0.0, (seat_height - hip_height) * descend), rest)
        _rot(pivots["spine"], frame, (math.radians(-5.0) * sit, 0.0, 0.0))
        _rot(pivots["leg_l"], frame, (math.radians(-85.0) * legs, 0.0, 0.0))
        _rot(pivots["leg_r"], frame, (math.radians(-85.0) * legs, 0.0, 0.0))

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
