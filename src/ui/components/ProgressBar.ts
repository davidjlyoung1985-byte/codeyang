/**
 * Progress bar component for CLI
 */
import picocolors from 'picocolors';

const c = picocolors;

export class ProgressBar {
  private label = '';
  private current = 0;
  private total = 100;
  private startTime = 0;
  private lastDraw = 0;

  start(label: string, total = 100) {
    this.label = label;
    this.total = total;
    this.current = 0;
    this.startTime = Date.now();
    this.lastDraw = 0;
    this.draw();
  }

  update(current: number) {
    this.current = Math.min(current, this.total);
    // Throttle updates to avoid excessive redraws
    const now = Date.now();
    if (now - this.lastDraw < 100) return;
    this.lastDraw = now;
    this.draw();
  }

  private draw() {
    const percent = this.total > 0 ? Math.floor((this.current / this.total) * 100) : 0;
    const barWidth = 30;
    const filled = Math.floor((percent / 100) * barWidth);
    const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const timeStr = elapsed >= 60 ? `${Math.floor(elapsed / 60)}m${elapsed % 60}s` : `${elapsed}s`;

    process.stdout.write(
      `\r  ${c.cyan(bar)} ${c.bold(percent + '%')} ${c.dim(this.label)} ${c.dim(`(${this.current}/${this.total}) ${timeStr}`)}`,
    );
  }

  complete(message?: string) {
    this.current = this.total;
    this.draw();
    process.stdout.write('\n');
    if (message) {
      console.log(`  ${c.green('✓')} ${message}`);
    }
  }

  fail(message?: string) {
    process.stdout.write('\n');
    if (message) {
      console.log(`  ${c.red('✗')} ${message}`);
    }
  }

  stop() {
    process.stdout.write('\n');
  }
}
