import { err, ok, type Result } from '../../shared';
import type { TextStore } from './text-store';

/** How many valid copies survive each write, so that one damaged file never loses the park. */
export const KEPT_VALID_COPIES = 3;

const TEMPORARY_KEY = 'save.tmp';
const COPY_KEY_PREFIX = 'save.copy.';
const COPY_KEY_PATTERN = /^save\.copy\.(\d+)$/;

export interface StorageFailure {
  readonly kind: 'storageFailed';
  readonly reason: string;
}

export type WriteError =
  | StorageFailure
  /** The text read back was not the text written, or did not validate. Older copies are untouched. */
  | { readonly kind: 'verificationFailed'; readonly stage: 'temporary' | 'copy' };

export type LoadError<E> =
  | StorageFailure
  | { readonly kind: 'noSave' }
  | { readonly kind: 'noValidCopy'; readonly errors: readonly E[] };

export interface LoadedCopy<T> {
  readonly value: T;
  readonly sequence: number;
  /** Newer copies that could not be read: above zero, app emits `saveRecovered`. */
  readonly skippedCopies: number;
}

export interface SaveCopyInfo<E> {
  readonly sequence: number;
  /** Null when the copy is valid. */
  readonly error: E | null;
}

/** Validates save text; in the game this is `deserialize` from src/save. */
export type SaveValidator<T, E> = (text: string) => Result<T, E>;

export interface SaveStorage<T, E> {
  /** Loads the newest valid copy, skipping damaged ones. */
  read: () => Promise<Result<LoadedCopy<T>, LoadError<E>>>;
  /** Writes a new copy safely and returns its sequence number. */
  write: (text: string) => Promise<Result<number, WriteError>>;
  /** Every copy, newest first, with its validity. */
  listCopies: () => Promise<Result<SaveCopyInfo<E>[], StorageFailure>>;
}

async function attempt<T>(operation: () => Promise<T>): Promise<Result<T, StorageFailure>> {
  try {
    return ok(await operation());
  } catch (error) {
    // Storage I/O fails for expected reasons (full quota, revoked permission): report, never hide.
    return err({
      kind: 'storageFailed',
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

function copyKey(sequence: number): string {
  return `${COPY_KEY_PREFIX}${String(sequence)}`;
}

/** Sequence numbers of every stored copy, newest first. */
function copySequences(keys: readonly string[]): number[] {
  const sequences: number[] = [];
  for (const key of keys) {
    const match = COPY_KEY_PATTERN.exec(key);
    if (match?.[1] !== undefined) {
      sequences.push(Number(match[1]));
    }
  }
  return sequences.sort((a, b) => b - a);
}

/**
 * Safe writes and resilient loads on top of any TextStore.
 * Write: temporary slot → read back and validate → new numbered copy → read back and validate
 * → prune. Old copies are only removed once the new one is proven readable.
 */
export function createSaveStorage<T, E>(
  store: TextStore,
  validate: SaveValidator<T, E>,
): SaveStorage<T, E> {
  async function listSequences(): Promise<Result<number[], StorageFailure>> {
    const keys = await attempt(() => store.keys());
    return keys.ok ? ok(copySequences(keys.value)) : keys;
  }

  async function writeVerified(
    key: string,
    text: string,
    stage: 'temporary' | 'copy',
  ): Promise<Result<void, WriteError>> {
    const written = await attempt(() => store.set(key, text));
    if (!written.ok) {
      return written;
    }
    const readBack = await attempt(() => store.get(key));
    if (!readBack.ok) {
      return readBack;
    }
    if (readBack.value !== text || !validate(readBack.value).ok) {
      await attempt(() => store.remove(key));
      return err({ kind: 'verificationFailed', stage });
    }
    return ok(undefined);
  }

  async function listCopies(): Promise<Result<SaveCopyInfo<E>[], StorageFailure>> {
    const sequences = await listSequences();
    if (!sequences.ok) {
      return sequences;
    }
    const copies: SaveCopyInfo<E>[] = [];
    for (const sequence of sequences.value) {
      const text = await attempt(() => store.get(copyKey(sequence)));
      if (!text.ok) {
        return text;
      }
      if (text.value !== null) {
        const validated = validate(text.value);
        copies.push({ sequence, error: validated.ok ? null : validated.error });
      }
    }
    return ok(copies);
  }

  /** Removes every copy older than the oldest of the newest valid copies we keep. */
  async function prune(): Promise<Result<void, StorageFailure>> {
    const copies = await listCopies();
    if (!copies.ok) {
      return copies;
    }
    let validSeen = 0;
    for (const copy of copies.value) {
      if (validSeen >= KEPT_VALID_COPIES) {
        const removed = await attempt(() => store.remove(copyKey(copy.sequence)));
        if (!removed.ok) {
          return removed;
        }
      } else if (copy.error === null) {
        validSeen += 1;
      }
    }
    return ok(undefined);
  }

  async function write(text: string): Promise<Result<number, WriteError>> {
    const sequences = await listSequences();
    if (!sequences.ok) {
      return sequences;
    }
    // Never reuse a number, even a damaged copy's: the newest copy must always be the newest write.
    const sequence = (sequences.value[0] ?? 0) + 1;
    const staged = await writeVerified(TEMPORARY_KEY, text, 'temporary');
    if (!staged.ok) {
      return staged;
    }
    const committed = await writeVerified(copyKey(sequence), text, 'copy');
    if (!committed.ok) {
      return committed;
    }
    const cleaned = await attempt(() => store.remove(TEMPORARY_KEY));
    if (!cleaned.ok) {
      return cleaned;
    }
    const pruned = await prune();
    return pruned.ok ? ok(sequence) : pruned;
  }

  async function read(): Promise<Result<LoadedCopy<T>, LoadError<E>>> {
    const sequences = await listSequences();
    if (!sequences.ok) {
      return sequences;
    }
    if (sequences.value.length === 0) {
      return err({ kind: 'noSave' });
    }
    const errors: E[] = [];
    let skippedCopies = 0;
    for (const sequence of sequences.value) {
      const text = await attempt(() => store.get(copyKey(sequence)));
      if (!text.ok) {
        return text;
      }
      if (text.value !== null) {
        const validated = validate(text.value);
        if (validated.ok) {
          return ok({ value: validated.value, sequence, skippedCopies });
        }
        errors.push(validated.error);
      }
      skippedCopies += 1;
    }
    return err({ kind: 'noValidCopy', errors });
  }

  return { read, write, listCopies };
}
