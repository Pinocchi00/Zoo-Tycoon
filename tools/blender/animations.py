"""Animation loops, driven by each species' parameters.

Every loop ends on the same pose it starts with, so it repeats seamlessly.
Bone names follow the quadruped skeleton: spine, chest, head, eyes, ear_l,
ear_r, leg_fl, leg_fr, leg_bl, leg_br. Two bones are optional: `trunk`
(required by the trunk signature) and `tail` (waved by swim when present).

Pose-bone axes, for the forward-pointing bones (spine, head, trunk): local X is
lateral and a positive rotation about it lifts the front, local Y runs forward,
local Z is up (a rotation about it turns the bone sideways). The leg bones hang
down: a positive X rotation swings the foot backwards. The tail bone points
backwards with Z up.
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
LEG_BONES = tuple(LEG_PHASE)
FRONT_LEG_BONES = ("leg_fl", "leg_fr")
HIND_LEG_BONES = ("leg_bl", "leg_br")
BLINK_FRAMES = 3
EAR_TWITCH_FRAMES = 4
CLOSED_EYE_SCALE = 0.1
# Keys per loop for the curve-driven animations.
SMOOTH_STEPS = 24
# Shares of the eat loop where the head is fully lowered and where it starts rising.
EAT_LOWERED_AT = 0.2
EAT_RAISED_AT = 0.8
# Shares of the stretch loop where the bow is reached and where it is released.
STRETCH_REACHED_AT = 0.3
STRETCH_RELEASED_AT = 0.7
# Swimming legs paddle twice per loop; body and tail undulate once.
PADDLE_CYCLES = 2
# The tail lags a quarter loop behind the body, like a real undulation.
TAIL_LAG = 0.25
# The trunk curls twice per loop while it sways once.
TRUNK_CURL_CYCLES = 2
# The rooting head sweeps from side to side twice per loop.
ROOT_SWEEP_CYCLES = 2


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


def _smooth(armature, bone_name, path, duration_s, pose_at):
    """Keys a curve sampled SMOOTH_STEPS times; `pose_at(t)` takes t in 0..1."""
    end = _frame(duration_s)
    for step in range(SMOOTH_STEPS + 1):
        t = step / SMOOTH_STEPS
        _key(armature, bone_name, path, round(end * t), pose_at(t))


def _lift_body(armature, frame, lift_m, tilt_rad=0.0):
    """Moves the spine up (or down) and resizes the legs so the feet keep their place.

    A spine tilted nose-down about its rear end lowers each leg root in
    proportion to its distance from that end: the legs make up for it too.
    """
    _key(armature, "spine", "location", frame, (0.0, 0.0, lift_m))
    bones = armature.data.bones
    for name in LEG_BONES:
        distance = abs(bones[name].head_local.y - bones["spine"].head_local.y)
        leg_lift = lift_m - distance * math.sin(tilt_rad)
        _key(armature, name, "scale", frame, (1.0, 1.0 + leg_lift / bones[name].length, 1.0))


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


def build_sleep(armature, params):
    action = _new_action(armature, "sleep")
    end = _frame(params["durationS"])
    breath = params["breathScale"]
    breaths = params["breathsPerLoop"]
    head_drop = math.radians(params["headDropDeg"])
    tail_lift = math.radians(params.get("tailLiftDeg", 0.0))
    for i in range(breaths * 2 + 1):
        inflated = 1.0 + breath if i % 2 == 1 else 1.0
        _key(armature, "chest", "scale", round(end * i / (breaths * 2)), (inflated, 1.0, inflated))
    for frame in (0, end):
        _lift_body(armature, frame, -params["bodyDropM"])
        _key(armature, "head", "rotation_euler", frame, (-head_drop, 0.0, 0.0))
        # Closed eyes, held for the whole loop.
        _key(armature, "eyes", "scale", frame, (1.0, CLOSED_EYE_SCALE, 1.0))
        if "tail" in armature.pose.bones:
            # A long tail would sink into the ground with the body: it rests raised.
            _key(armature, "tail", "rotation_euler", frame, (tail_lift, 0.0, 0.0))
    _stash(armature, action)


def build_eat(armature, params):
    action = _new_action(armature, "eat")
    end = _frame(params["durationS"])
    dip = math.radians(params["headDipDeg"])
    chew = math.radians(params["chewDeg"])
    chews = params["chewCount"]
    frames = [(0.0, 0.0), (EAT_LOWERED_AT, -dip)]
    for i in range(1, chews * 2):
        t = EAT_LOWERED_AT + (EAT_RAISED_AT - EAT_LOWERED_AT) * i / (chews * 2)
        # Chewing nudges the lowered head up and down around the grazing angle.
        frames.append((t, -dip + (chew if i % 2 == 1 else -chew)))
    frames.extend([(EAT_RAISED_AT, -dip), (1.0, 0.0)])
    for t, angle in frames:
        _key(armature, "head", "rotation_euler", round(end * t), (angle, 0.0, 0.0))
    _stash(armature, action)


def build_swim(armature, params):
    action = _new_action(armature, "swim")
    duration = params["durationS"]
    paddle = math.radians(params["paddleDeg"])
    roll = math.radians(params["rollDeg"])
    undulation = math.radians(params["undulationDeg"])
    tail_sway = math.radians(params["tailSwayDeg"])

    def leg_at(phase):
        def pose_at(t):
            return (paddle * math.cos(2.0 * math.pi * PADDLE_CYCLES * (t + phase)), 0.0, 0.0)
        return pose_at

    def body_at(t):
        return (0.0, roll * math.sin(2.0 * math.pi * t), undulation * math.sin(2.0 * math.pi * t))

    def tail_at(t):
        return (0.0, 0.0, tail_sway * math.sin(2.0 * math.pi * (t - TAIL_LAG)))

    for bone, phase in LEG_PHASE.items():
        _smooth(armature, bone, "rotation_euler", duration, leg_at(phase))
    _smooth(armature, "spine", "rotation_euler", duration, body_at)
    if "tail" in armature.pose.bones:
        _smooth(armature, "tail", "rotation_euler", duration, tail_at)
    _stash(armature, action)


def build_stretch(armature, params):
    action = _new_action(armature, "stretch")
    end = _frame(params["durationS"])
    lift = params["rumpLiftM"]
    reach = math.radians(params["foreLegReachDeg"])
    head_down = math.radians(params["headDownDeg"])
    # Tilting the spine about its rear end by this much keeps the front feet on the ground.
    tilt = math.asin(min(1.0, lift / armature.pose.bones["spine"].length))
    # Rest, a held bow, rest again.
    shape = ((0.0, 0.0), (STRETCH_REACHED_AT, 1.0), (STRETCH_RELEASED_AT, 1.0), (1.0, 0.0))
    for t, amount in shape:
        frame = round(end * t)
        _lift_body(armature, frame, lift * amount, tilt * amount)
        _key(armature, "spine", "rotation_euler", frame, (-tilt * amount, 0.0, 0.0))
        _key(armature, "head", "rotation_euler", frame, (-head_down * amount, 0.0, 0.0))
        for name in HIND_LEG_BONES:
            _key(armature, name, "rotation_euler", frame, (-tilt * amount, 0.0, 0.0))
        for name in FRONT_LEG_BONES:
            _key(armature, name, "rotation_euler", frame, (-(tilt + reach) * amount, 0.0, 0.0))
    _stash(armature, action)


def build_trunk(armature, params):
    if "trunk" not in armature.pose.bones:
        raise ValueError("the trunk animation needs a skeleton with a 'trunk' bone")
    action = _new_action(armature, "trunk")
    duration = params["durationS"]
    swing = math.radians(params["swingDeg"])
    curl = math.radians(params["curlDeg"])
    nod = math.radians(params["headNodDeg"])

    def trunk_at(t):
        curled = curl * (1.0 - math.cos(2.0 * math.pi * TRUNK_CURL_CYCLES * t)) / 2.0
        return (curled, 0.0, swing * math.sin(2.0 * math.pi * t))

    def head_at(t):
        return (nod * math.sin(2.0 * math.pi * t), 0.0, 0.0)

    _smooth(armature, "trunk", "rotation_euler", duration, trunk_at)
    _smooth(armature, "head", "rotation_euler", duration, head_at)
    _stash(armature, action)


def build_root(armature, params):
    action = _new_action(armature, "root")
    duration = params["durationS"]
    down = math.radians(params["headDownDeg"])
    sweep = math.radians(params["sweepDeg"])
    poke = math.radians(params["pokeDeg"])
    pokes = params["pokeCount"]

    def head_at(t):
        # The head drops to the ground, works from side to side with jabs, then comes back up.
        reach = math.sin(math.pi * t)
        jab = (1.0 - math.cos(2.0 * math.pi * pokes * t)) / 2.0
        yaw = sweep * reach * math.sin(2.0 * math.pi * ROOT_SWEEP_CYCLES * t)
        return (-(down * reach + poke * reach * jab), 0.0, yaw)

    _smooth(armature, "head", "rotation_euler", duration, head_at)
    _stash(armature, action)


SIGNATURE_BUILDERS = {
    "swim": build_swim,
    "stretch": build_stretch,
    "trunk": build_trunk,
    "root": build_root,
}


def _declared_signature(params):
    # build.py hands over only the animation settings: the signature is the one
    # signature animation they describe (the schema guarantees the declared one is there).
    declared = [name for name in SIGNATURE_BUILDERS if name in params]
    if len(declared) != 1:
        raise ValueError(f"expected settings for exactly one signature animation, got {declared}")
    return declared[0]


def build_animations(armature, params):
    missing = [name for name in REQUIRED_BONES if name not in armature.pose.bones]
    if missing:
        raise ValueError(f"skeleton is missing bones: {', '.join(missing)}")
    signature = _declared_signature(params)
    bpy.context.scene.render.fps = FPS
    armature.animation_data_create()
    build_idle(armature, params["idle"])
    build_walk(armature, params["walk"])
    build_sleep(armature, params["sleep"])
    build_eat(armature, params["eat"])
    SIGNATURE_BUILDERS[signature](armature, params[signature])
    _reset_pose(armature)
