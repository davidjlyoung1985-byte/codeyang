/**
 * Qt module barrel export.
 * Public API for Qt project detection, knowledge injection, and tool registration.
 */
export { detectQtProject, type QtContext } from './detector.js';
export { buildQtPrompt } from './prompt.js';
export { createQtTools } from './tools.js';
