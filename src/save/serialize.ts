import { z } from 'zod';
import { err, ok, type Result } from '../shared';
import { STATE_VERSION, type GameState } from '../sim';
import { checksum } from './checksum';
import type { SaveError } from './errors';
import { MIGRATIONS, runMigrations } from './migrations';
import { firstIssuePath, gameStateSchema } from './schema';

export const SAVE_FORMAT = 'zoo-refuge-save';
/** Version of the envelope itself; the state inside has its own `version`. */
export const SAVE_FORMAT_VERSION = 1;

const CHECKSUM_PATTERN = /^[0-9a-f]{8}$/;

/** Read first, so that a newer envelope is reported as such instead of as a broken one. */
const headerSchema = z.looseObject({
  format: z.literal(SAVE_FORMAT),
  formatVersion: z.int().min(1),
});

const envelopeSchema = z.strictObject({
  format: z.literal(SAVE_FORMAT),
  formatVersion: z.literal(SAVE_FORMAT_VERSION),
  writtenAtMs: z.int().min(0),
  checksum: z.string().regex(CHECKSUM_PATTERN),
  // The state is kept as text so that the checksum covers exactly the bytes written.
  payload: z.string(),
});

export interface LoadedSave {
  readonly state: GameState;
  /** Wall-clock time of the write, given by the app; used later for offline catch-up. */
  readonly writtenAtMs: number;
}

/** Turns the game into save text. `writtenAtMs` comes from outside: the simulation has no clock. */
export function serialize(state: GameState, writtenAtMs: number): string {
  if (!Number.isSafeInteger(writtenAtMs) || writtenAtMs < 0) {
    throw new RangeError(`writtenAtMs must be a non-negative integer, got ${String(writtenAtMs)}.`);
  }
  const payload = JSON.stringify(state);
  return JSON.stringify({
    format: SAVE_FORMAT,
    formatVersion: SAVE_FORMAT_VERSION,
    writtenAtMs,
    checksum: checksum(payload),
    payload,
  });
}

function parseJson(text: string): Result<unknown, SaveError> {
  try {
    const parsed: unknown = JSON.parse(text);
    return ok(parsed);
  } catch (error) {
    // A damaged file is expected; anything else is a bug and must surface.
    if (error instanceof SyntaxError) {
      return err({ kind: 'invalidJson' });
    }
    throw error;
  }
}

/** Reads save text back, with the write time. Never throws on a damaged or foreign file. */
export function readSave(text: string): Result<LoadedSave, SaveError> {
  const json = parseJson(text);
  if (!json.ok) {
    return json;
  }
  const header = headerSchema.safeParse(json.value);
  if (header.success && header.data.formatVersion > SAVE_FORMAT_VERSION) {
    return err({ kind: 'unsupportedFormat', formatVersion: header.data.formatVersion });
  }
  const envelope = envelopeSchema.safeParse(json.value);
  if (!envelope.success) {
    return err({ kind: 'invalidEnvelope', path: firstIssuePath(envelope.error) });
  }
  const { payload, writtenAtMs } = envelope.data;
  if (checksum(payload) !== envelope.data.checksum) {
    return err({ kind: 'checksumMismatch' });
  }
  const rawState = parseJson(payload);
  if (!rawState.ok) {
    return err({ kind: 'invalidPayload' });
  }
  const migrated = runMigrations(rawState.value, MIGRATIONS, STATE_VERSION);
  if (!migrated.ok) {
    return migrated;
  }
  const state = gameStateSchema.safeParse(migrated.value);
  if (!state.success) {
    return err({ kind: 'invalidState', path: firstIssuePath(state.error) });
  }
  return ok({ state: state.data, writtenAtMs });
}

/** Reads save text back into the game state. */
export function deserialize(text: string): Result<GameState, SaveError> {
  const loaded = readSave(text);
  return loaded.ok ? ok(loaded.value.state) : loaded;
}
