import { createRng, randomFloat, randomInt, type RngState } from '@/sim/rng';

/** Maximum visual spread is 35% of the one-metre construction cell. */
export const MAX_VISITOR_OFFSET_M = 0.35;
const TWO_PI = Math.PI * 2;

export interface VisitorVisualOffset {
  readonly x: number;
  readonly z: number;
}

/** Hashes a visitor id string into an unsigned 32-bit seed. */
export function seedFromId(id: string): number {
  let hash = 0x811c_9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193) >>> 0;
  }
  return hash;
}

/** Creates a visual RNG for a visitor group, independent from the simulation RNG. */
export function visualRng(id: string): RngState {
  return createRng(seedFromId(id));
}

/** Returns a stable, uniform-in-area offset within a small ground-plane disk. */
export function visitorVisualOffset(id: string): VisitorVisualOffset {
  const rng = visualRng(id);
  const angle = randomFloat(rng) * TWO_PI;
  const radius = Math.sqrt(randomFloat(rng)) * MAX_VISITOR_OFFSET_M;
  return { x: Math.sin(angle) * radius, z: Math.cos(angle) * radius };
}

/** Returns a deterministic per-member phase offset from the group seed. */
export function memberPhaseOffset(rng: RngState, memberIndex: number): number {
  // Mix the member index into the sequence without changing the group seed itself.
  const mixed = Math.imul(memberIndex, 0x9e37_79b9) >>> 0;
  const base = randomFloat(rng);
  return (base + mixed / 0x1_0000_0000) % 1;
}

/** Picks a viewing clip deterministically from the group seed. */
export function pickViewingClip(rng: RngState): 'look' | 'point' | 'photo' {
  const value = randomInt(rng, 0, 2);
  if (value === 0) {
    return 'look';
  }
  if (value === 1) {
    return 'point';
  }
  return 'photo';
}

/** Stable per-person tint color chosen from a few hand-picked variants. */
export function tintColor(rng: RngState, tint: 'skin' | 'hair' | 'shirt' | 'pants'): number {
  switch (tint) {
    case 'skin':
      return pickFrom(rng, [0xff_c8_a8, 0xff_d5_b5, 0xee_b8_8e, 0x8d_55_2a]);
    case 'hair':
      return pickFrom(rng, [0x2c_1b_12, 0x4a_34_25, 0xee_d4_a0, 0x8c_78_5b, 0xee_ee_ee]);
    case 'shirt':
      return pickFrom(
        rng,
        [0xff_55_55, 0x55_aa_ff, 0xff_dd_44, 0x88_cc_88, 0xff_99_00, 0xee_ee_ee],
      );
    case 'pants':
      return pickFrom(rng, [0x33_44_55, 0x55_66_77, 0x88_77_66, 0x44_44_44, 0x99_88_77]);
  }
}

function pickFrom(rng: RngState, values: readonly number[]): number {
  return values[randomInt(rng, 0, values.length - 1)] ?? 0xff_ff_ff;
}
