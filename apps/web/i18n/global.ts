import { routing } from './routing';
import messages from '../messages/en.json';

// Type-safe locales + message keys (autocompletion, typo-catching).
// Kept to Locale/Messages only — no global formats in Phase 3.
declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
