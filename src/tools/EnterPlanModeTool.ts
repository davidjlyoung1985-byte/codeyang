/**
 * EnterPlanModeTool — switch the agent into structured planning mode.
 * In plan mode, the agent must first write a plan before executing.
 */
import { setPlanMode } from './registry.js';

export async function executeEnterPlanMode(goal?: string): Promise<string> {
  setPlanMode(true);
  return goal
    ? `Planning mode activated.\n\nGoal: ${goal}\n\nOutline your step-by-step plan. After the user approves, you may execute.`
    : `Planning mode activated.\n\nBefore making changes, outline your plan step by step. Wait for user approval before executing.`;
}
