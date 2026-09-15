/**
 * Qt Module - Beta API
 *
 * Auto-detects Qt projects and provides specialized tools for Qt/QML development.
 * Activated automatically when a Qt project is detected.
 *
 * @module qt
 * @version 1.0.0-beta
 * @stability 2 - Unstable (API may change in minor versions)
 */

/**
 * API version for the Qt module.
 * Check this version before relying on specific API signatures.
 */
export const QT_API_VERSION = '1.0.0-beta';

/**
 * API stability level:
 * 0 - Deprecated
 * 1 - Experimental
 * 2 - Unstable (current)
 * 3 - Stable
 * 4 - Locked
 */
export const QT_API_STABILITY = 2;

// Public API for Qt project detection, knowledge injection, and tool registration
export { detectQtProject, type QtContext } from './detector.js';
export { buildQtPrompt } from './prompt.js';
export { createQtTools } from './tools.js';
