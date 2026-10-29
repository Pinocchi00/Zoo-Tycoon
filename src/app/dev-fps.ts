import { t } from '@/i18n';

/** How often the number changes: faster is unreadable. */
const REFRESH_MS = 500;
const MS_PER_SECOND = 1000;

export interface FpsCounter {
  record: (frameMs: number) => void;
}

/** Frames-per-second readout. Development builds only: app never imports it in production. */
export function createFpsCounter(parent: HTMLElement): FpsCounter {
  const element = document.createElement('div');
  element.className = 'dev-fps';
  element.setAttribute('aria-hidden', 'true');
  parent.append(element);
  const unit = t('dev.fpsUnit');
  let frames = 0;
  let elapsedMs = 0;
  return {
    record: (frameMs) => {
      frames += 1;
      elapsedMs += frameMs;
      if (elapsedMs < REFRESH_MS) {
        return;
      }
      element.textContent = `${String(Math.round((frames * MS_PER_SECOND) / elapsedMs))} ${unit}`;
      frames = 0;
      elapsedMs = 0;
    },
  };
}
