/**
 * ExitPlanModeTool — exit planning mode and return to normal execution.
 */
import { setPlanMode } from './registry.js';

export function executeExitPlanMode(): string {
  setPlanMode(false);
  return 'Planning mode deactivated. You may now execute changes directly.';
}
