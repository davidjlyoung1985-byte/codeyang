/**
 * Reflexion Module - Beta API
 *
 * This module provides reflection, critique, and error handling capabilities.
 * While fully integrated and tested, the API may evolve in minor versions.
 *
 * @module reflexion
 * @version 1.0.0-beta
 * @stability 2 - Unstable (API may change in minor versions)
 */

/**
 * API version for the reflexion module.
 * Check this version before relying on specific API signatures.
 */
export const REFLEXION_API_VERSION = '1.0.0-beta';

/**
 * API stability level:
 * 0 - Deprecated
 * 1 - Experimental
 * 2 - Unstable (current)
 * 3 - Stable
 * 4 - Locked
 */
export const REFLEXION_API_STABILITY = 2;

// Core exports - Stable APIs (likely to graduate to stable)
export { ReflexionEngine, type ReflexionConfig } from './ReflexionEngine.js';
export { ExecutionTracker, type ExecutionRecord } from './ExecutionTracker.js';
export { LearningStore, type Reflection } from './LearningStore.js';
export { ReflectionPrompt } from './ReflectionPrompt.js';
export { ReflexionIntegration } from './ReflexionIntegration.js';
export { CritiqueEngine, type CritiqueConfig, type CritiqueResult, type CritiqueIssue } from './CritiqueEngine.js';

// Enhanced features - API may change
export {
  CircuitBreaker,
  RetryHandler,
  ErrorClassifier,
  EnhancedErrorHandler,
  type RetryConfig,
  type CircuitBreakerConfig,
} from './ErrorHandler.js';

// Performance optimizations - API may change
export {
  ReflectionCache,
  BatchProcessor,
  QueryOptimizer,
  PerformanceMonitor,
  type CacheConfig,
  type BatchConfig,
} from './PerformanceOptimizer.js';
