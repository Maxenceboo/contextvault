import { readFileSync } from 'node:fs';

/** Version du paquet, lue une fois au chargement (dist/ et src/ sont au même niveau). */
export const SERVER_VERSION: string = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;
