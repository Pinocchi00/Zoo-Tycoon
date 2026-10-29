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

export const speciesDescriptionSchema = z.strictObject({
  id: name,
  family: name,
  /** Real nose-to-rump length, in metres: the model must match it. */
  lengthM: positive,
  signatures: z.array(z.string().min(1)).length(3),
  bones: z.array(boneSchema).min(1),
  parts: z.array(z.discriminatedUnion('kind', [blobPartSchema, limbPartSchema])).min(1),
  animations: z.strictObject({
    idle: z.strictObject({
      durationS: positive,
      breathsPerLoop: z.number().int().positive(),
      breathScale: z.number().min(0).max(0.2),
      blinkAtS: z.number().nonnegative(),
      earTwitchAtS: z.number().nonnegative(),
      earTwitchDeg: z.number(),
      headNodDeg: z.number(),
    }),
    walk: z.strictObject({
      durationS: positive,
      legSwingDeg: z.number(),
      bodyBobM: z.number().nonnegative(),
      headNodDeg: z.number(),
    }),
  }),
});

export type SpeciesDescription = z.infer<typeof speciesDescriptionSchema>;
