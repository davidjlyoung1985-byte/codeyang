/**
 * Terminal utility functions
 */
import picocolors from 'picocolors';

const c = picocolors;

/**
 * Get terminal width, capped at 120 columns
 */
export function termW(): number {
  return Math.min(process.stdout.columns || 80, 120);
}

/**
 * Print a horizontal rule with optional label
 */
export function hr(label?: string): void {
  const w = termW();
  if (label) {
    const side = Math.max(0, (w - label.length - 4) >> 1);
    console.log(c.dim('─'.repeat(side) + `  ${label}  ` + '─'.repeat(side)));
  } else {
    console.log(c.dim('─'.repeat(w)));
  }
}
