/**
 * Continual Learning Module - Beta API
 *
 * Provides automatic memory classification, compression, and consolidation.
 * Runs every 10 agent iterations to optimize memory usage.
 *
 * @module continual-learning
 * @version 1.0.0-beta
 * @stability 2 - Unstable (API may change in minor versions)
 */

/**
 * API version for the continual-learning module.
 * Check this version before relying on specific API signatures.
 */
export const CONTINUAL_LEARNING_API_VERSION = '1.0.0-beta';

/**
 * API stability level:
 * 0 - Deprecated
 * 1 - Experimental
 * 2 - Unstable (current)
 * 3 - Stable
 * 4 - Locked
 */
export const CONTINUAL_LEARNING_API_STABILITY = 2;

// Memory management and consolidation APIs
export {
  autoClassify,
  trackAccess,
  findCompressibleMemories,
  compressMemories,
  findStaleMemories,
  forgetStaleMemories,
  runConsolidation,
  getMemoryHealth,
} from './MemoryManager.js';
export type { ConsolidationReport } from './MemoryManager.js';
