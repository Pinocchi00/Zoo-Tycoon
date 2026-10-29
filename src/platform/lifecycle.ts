/** What the app lifecycle needs from the page, injectable for tests. */
export interface VisibilitySource {
  readonly hidden: boolean;
  addEventListener: (type: 'visibilitychange', listener: () => void) => void;
  removeEventListener: (type: 'visibilitychange', listener: () => void) => void;
}

/**
 * Calls `listener` with true when the app comes back to the foreground and false when it
 * leaves it (other tab, home button, locked screen). Returns a function that stops listening.
 * Capacitor's native pause and resume events will be plugged in here as well.
 */
export function onForegroundChange(
  listener: (foreground: boolean) => void,
  source: VisibilitySource = document,
): () => void {
  const onChange = (): void => {
    listener(!source.hidden);
  };
  source.addEventListener('visibilitychange', onChange);
  return () => {
    source.removeEventListener('visibilitychange', onChange);
  };
}
