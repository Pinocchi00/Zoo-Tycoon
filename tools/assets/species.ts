// Schema of a species description (tools/blender/species/*.json).
// Blender builds the model from it; the asset check reads the expected size from it.
import { z } from 'zod';

const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const positive = z.number().positive();
const segments = z.number().int().min(3).max(64);
const name = z.string().regex(/^[a-z][a-z0-9_]*$/);

const boneSchema = z.strictObject({
  name,
  parent: name.optional(),
  head: vec3,
  tail: vec3,
});

const sharedPartFields = {
  name,
  bone: name,
  color: name,
  mirror: z.boolean().optional(),
  mirrorOffset: vec3.optional(),
  /** A seeded share of faces painted in a nearby shade, for a hand-painted look. */
  speckle: z
    .strictObject({ color: name, share: z.number().min(0).max(1), seed: z.number().int() })
    .optional(),
};

const blobPartSchema = z.strictObject({
  ...sharedPartFields,
  kind: z.enum(['body', 'head', 'muzzle', 'ear', 'eye', 'nose', 'foot', 'patch']),
  center: vec3,
  radii: z.tuple([positive, positive, positive]),
  exponent: z.number().min(0.2).max(1).optional(),
  pitchDeg: z.number().optional(),
  rollDeg: z.number().optional(),
  segments,
  rings: segments,
});

const limbPartSchema = z.strictObject({
  ...sharedPartFields,
  kind: z.enum(['leg', 'tail']),
  start: vec3,
  end: vec3,
  startRadius: positive,
  endRadius: positive,
  segments,
});

const nonNegative = z.number().nonnegative();
const MAX_TAIL_LIFT_DEG = 90;

/** Names of the signature animations: each species declares exactly one. */
export const SIGNATURE_ANIMATIONS = ['swim', 'stretch', 'trunk', 'root'] as const;
export type SignatureAnimation = (typeof SIGNATURE_ANIMATIONS)[number];
const signatureSchema = z.enum(SIGNATURE_ANIMATIONS);

const animationsSchema = z.strictObject({
  idle: z.strictObject({
    durationS: positive,
    breathsPerLoop: z.number().int().positive(),
    breathScale: z.number().min(0).max(0.2),
    blinkAtS: nonNegative,
    earTwitchAtS: nonNegative,
    earTwitchDeg: z.number(),
    headNodDeg: z.number(),
  }),
  walk: z.strictObject({
    durationS: positive,
    legSwingDeg: z.number(),
    bodyBobM: nonNegative,
    headNodDeg: z.number(),
  }),
  sleep: z.strictObject({
    durationS: positive,
    breathsPerLoop: z.number().int().positive(),
    breathScale: z.number().min(0).max(0.2),
    /** How far the body sinks towards the ground, in metres. */
    bodyDropM: nonNegative,
    /** How far the head rests below its standing pose. */
    headDropDeg: nonNegative,
    /** Raises the tail (when there is one) so that it does not sink into the ground. */
    tailLiftDeg: z.number().min(0).max(MAX_TAIL_LIFT_DEG).optional(),
  }),
  eat: z.strictObject({
    durationS: positive,
    /** How far the head lowers towards the ground. */
    headDipDeg: nonNegative,
    chewCount: z.number().int().positive(),
    chewDeg: nonNegative,
  }),
  swim: z
    .strictObject({
      durationS: positive,
      paddleDeg: nonNegative,
      rollDeg: nonNegative,
      undulationDeg: nonNegative,
      /** Used only when the skeleton has a tail bone. */
      tailSwayDeg: nonNegative,
    })
    .optional(),
  stretch: z
    .strictObject({
      durationS: positive,
      /** How high the rump rises, in metres. */
      rumpLiftM: positive,
      foreLegReachDeg: nonNegative,
      headDownDeg: nonNegative,
    })
    .optional(),
  trunk: z
    .strictObject({
      durationS: positive,
      swingDeg: nonNegative,
      curlDeg: nonNegative,
      headNodDeg: nonNegative,
    })
    .optional(),
  root: z
    .strictObject({
      durationS: positive,
      headDownDeg: nonNegative,
      sweepDeg: nonNegative,
      pokeDeg: nonNegative,
      pokeCount: z.number().int().positive(),
    })
    .optional(),
});

export const speciesDescriptionSchema = z
  .strictObject({
    id: name,
    family: name,
    /** Real nose-to-rump length, in metres: the model must match it. */
    lengthM: positive,
    signatures: z.array(z.string().min(1)).length(3),
    /** The one animation that makes this species recognisable; its settings sit in `animations`. */
    signature: signatureSchema,
    bones: z.array(boneSchema).min(1),
    parts: z.array(z.discriminatedUnion('kind', [blobPartSchema, limbPartSchema])).min(1),
    animations: animationsSchema,
  })
  .superRefine((description, context) => {
    if (description.animations[description.signature] === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['animations', description.signature],
        message: `the signature animation "${description.signature}" needs its settings in animations`,
      });
    }
    for (const other of SIGNATURE_ANIMATIONS) {
      if (other !== description.signature && description.animations[other] !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['animations', other],
          message: `the settings of "${other}" are not allowed: the signature is "${description.signature}"`,
        });
      }
    }
  });

export type SpeciesDescription = z.infer<typeof speciesDescriptionSchema>;
