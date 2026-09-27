import { routing } from './routing';
import messages from '../messages/en.json';

// Type-safe locales + message keys (autocompletion, typo-catching). New keys
// must be added to en.json to type-check; a missing ar.json key is a runtime
// error, which is why the two files are kept in lockstep.
declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
