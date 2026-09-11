/**
 * Single source of truth for CodeYang version.
 * Derived from package.json so `npm version` / release bumps propagate everywhere.
 */
import pkg from '../package.json' with { type: 'json' };

export const VERSION: string = pkg.version;
