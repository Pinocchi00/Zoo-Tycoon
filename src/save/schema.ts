import { z } from 'zod';
import { animalId, enclosureId, speciesId, type IdError, type Result } from '../shared';
import { STATE_VERSION, STEP_MS } from '../sim';

const MAX_UINT32 = 0xffff_ffff;

const amount = z.int().min(0);
const uint32 = z.int().min(0).max(MAX_UINT32);

/** Turns a branding function into a schema, so that a loaded id is checked like a fresh one. */
function brandedId<T>(brand: (raw: string) => Result<T, IdError>): z.ZodType<T, string> {
  return z.string().transform((raw, context) => {
    const branded = brand(raw);
    if (!branded.ok) {
      context.addIssue({ code: 'custom', message: branded.error });
      return z.NEVER;
    }
    return branded.value;
  });
}

/** Full shape of the current GameState. Strict: an unknown field means the file is not ours. */
export const gameStateSchema = z.strictObject({
  version: z.literal(STATE_VERSION),
  clock: z.strictObject({
    timeMs: amount,
    // The accumulator never holds a whole step: advance() would have simulated it.
    accumulatorMs: amount.max(STEP_MS - 1),
  }),
  rng: z.tuple([uint32, uint32, uint32, uint32]),
  currencies: z.strictObject({
    coins: amount,
    arrivalTickets: amount,
    careMedals: amount,
    decorTickets: amount,
    shavings: amount,
  }),
  enclosures: z.array(z.strictObject({ id: brandedId(enclosureId) })),
  animals: z.array(z.strictObject({ id: brandedId(animalId), speciesId: brandedId(speciesId) })),
});

/** Dotted path of the first issue, e.g. `currencies.coins`, so that a bad save says what is wrong. */
export function firstIssuePath(error: z.ZodError): string {
  const [issue] = error.issues;
  return issue === undefined ? '' : issue.path.map(String).join('.');
}
