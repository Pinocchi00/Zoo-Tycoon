export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogSink = (level: LogLevel, message: string, details: readonly unknown[]) => void;

export interface Logger {
  debug: (message: string, ...details: unknown[]) => void;
  info: (message: string, ...details: unknown[]) => void;
  warn: (message: string, ...details: unknown[]) => void;
  error: (message: string, ...details: unknown[]) => void;
}

export const consoleSink: LogSink = (level, message, details) => {
  const prefixed = `[zoo] ${message}`;
  switch (level) {
    case 'debug':
      console.debug(prefixed, ...details);
      return;
    case 'info':
      console.info(prefixed, ...details);
      return;
    case 'warn':
      console.warn(prefixed, ...details);
      return;
    case 'error':
      console.error(prefixed, ...details);
      return;
  }
};

const silentSink: LogSink = () => undefined;

/** A logger that writes to `sink` when enabled and does nothing otherwise. */
export function createLogger(enabled: boolean, sink: LogSink = consoleSink): Logger {
  const write = enabled ? sink : silentSink;
  return {
    debug: (message, ...details) => {
      write('debug', message, details);
    },
    info: (message, ...details) => {
      write('info', message, details);
    },
    warn: (message, ...details) => {
      write('warn', message, details);
    },
    error: (message, ...details) => {
      write('error', message, details);
    },
  };
}

/** Development logger: silent in production builds. */
export const logger: Logger = createLogger(import.meta.env.DEV);
