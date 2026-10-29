import { DEFAULT_LOCALE, t } from '@/i18n';

// Wiring only for now: the game loop and the scene arrive in later tasks.
document.documentElement.lang = DEFAULT_LOCALE;
document.title = t('app.title');
