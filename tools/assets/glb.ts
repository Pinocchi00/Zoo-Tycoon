// Reads the JSON part of a binary glTF (.glb) file, without any dependency.
// Spec: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#binary-gltf-layout
import { z } from 'zod';
import { err, ok, type Result } from '../../src/shared/result';

const GLB_MAGIC = 0x46546c67; // "glTF"
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a; // "JSON"
const HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;

export type GlbError =
  | { readonly kind: 'tooShort'; readonly bytes: number }
  | { readonly kind: 'badMagic' }
  | { readonly kind: 'badVersion'; readonly version: number }
  | { readonly kind: 'lengthMismatch'; readonly declared: number; readonly actual: number }
  | { readonly kind: 'missingJsonChunk' }
  | { readonly kind: 'badJson'; readonly message: string };

const index = z.number().int().nonnegative();
const vec3 = z.tuple([z.number(), z.number(), z.number()]);

const accessorSchema = z.object({
  count: z.number().int().nonnegative(),
  min: z.array(z.number()).optional(),
  max: z.array(z.number()).optional(),
});

const primitiveSchema = z.object({
  attributes: z.record(z.string(), index),
  indices: index.optional(),
  material: index.optional(),
  mode: z.number().int().optional(),
});

const nodeSchema = z.object({
  name: z.string().optional(),
  mesh: index.optional(),
  children: z.array(index).optional(),
  translation: vec3.optional(),
  rotation: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  scale: vec3.optional(),
  matrix: z
    .tuple([
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
    ])
    .optional(),
});

const named = z.object({ name: z.string().optional() });

/** The subset of glTF 2.0 the asset rules look at. Unknown fields are ignored. */
export const gltfSchema = z.object({
  asset: z.object({ version: z.string() }),
  scene: index.optional(),
  scenes: z.array(z.object({ nodes: z.array(index).optional() })).default([]),
  nodes: z.array(nodeSchema).default([]),
  meshes: z
    .array(z.object({ name: z.string().optional(), primitives: z.array(primitiveSchema) }))
    .default([]),
  accessors: z.array(accessorSchema).default([]),
  materials: z.array(named).default([]),
  textures: z.array(z.object({})).default([]),
  images: z.array(named).default([]),
  animations: z.array(named).default([]),
});

export type Gltf = z.infer<typeof gltfSchema>;
export type GltfNode = z.infer<typeof nodeSchema>;
export type GltfPrimitive = z.infer<typeof primitiveSchema>;

/** Checks the binary container and returns its JSON chunk, still unvalidated. */
export function readGlbJson(bytes: Uint8Array): Result<unknown, GlbError> {
  if (bytes.byteLength < HEADER_BYTES + CHUNK_HEADER_BYTES) {
    return err({ kind: 'tooShort', bytes: bytes.byteLength });
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) {
    return err({ kind: 'badMagic' });
  }
  const version = view.getUint32(4, true);
  if (version !== GLB_VERSION) {
    return err({ kind: 'badVersion', version });
  }
  const declared = view.getUint32(8, true);
  if (declared !== bytes.byteLength) {
    return err({ kind: 'lengthMismatch', declared, actual: bytes.byteLength });
  }
  const chunkLength = view.getUint32(HEADER_BYTES, true);
  const chunkType = view.getUint32(HEADER_BYTES + 4, true);
  const start = HEADER_BYTES + CHUNK_HEADER_BYTES;
  if (chunkType !== JSON_CHUNK_TYPE || start + chunkLength > bytes.byteLength) {
    return err({ kind: 'missingJsonChunk' });
  }
  const text = new TextDecoder().decode(bytes.subarray(start, start + chunkLength));
  try {
    const json: unknown = JSON.parse(text);
    return ok(json);
  } catch (error: unknown) {
    return err({
      kind: 'badJson',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
