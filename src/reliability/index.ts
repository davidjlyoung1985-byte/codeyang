/**
 * Reliability Module Index
 *
 * Exports all reliability and fault tolerance components:
 * - Session recovery with automatic checkpoints
 * - Error recovery with retry and circuit breaker
 * - Health checking with self-healing
 */

export {
  SessionRecoveryManager,
  sessionRecovery,
  type SessionCheckpoint,
  type RecoveryOptions,
} from './SessionRecovery.js';

export {
  ErrorRecoveryManager,
  errorRecovery,
  CircuitBreaker,
  CircuitState,
  type RetryOptions,
  type CircuitBreakerOptions,
} from './ErrorRecovery.js';

export {
  HealthChecker,
  healthChecker,
  HealthStatus,
  type HealthCheck,
  type HealthReport,
  type HealthCheckOptions,
  type SelfHealAction,
} from './HealthChecker.js';
