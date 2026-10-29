import { afterEach, describe, expect, it, vi } from 'vitest';
import { consoleSink, createLogger, type LogLevel } from './logger';

const LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createLogger', () => {
  it.each(LEVELS)('forwards %s messages to the sink when enabled', (level) => {
    const sink = vi.fn();
    const log = createLogger(true, sink);

    log[level]('hello', 1, 'two');

    expect(sink).toHaveBeenCalledExactlyOnceWith(level, 'hello', [1, 'two']);
  });

  it.each(LEVELS)('stays silent for %s messages when disabled', (level) => {
    const sink = vi.fn();
    const log = createLogger(false, sink);

    log[level]('hello');

    expect(sink).not.toHaveBeenCalled();
  });
});

describe('consoleSink', () => {
  it.each(LEVELS)('writes %s messages to the matching console method', (level) => {
    const spy = vi.spyOn(console, level).mockImplementation(() => undefined);

    consoleSink(level, 'hello', [42]);

    expect(spy).toHaveBeenCalledExactlyOnceWith('[zoo] hello', 42);
  });
});
