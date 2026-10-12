import { Registry } from '@prometheus-io/client';

// One registry per app. Every business module registers its metrics here.
export function createRegistry(): Registry {
  return new Registry();
}
