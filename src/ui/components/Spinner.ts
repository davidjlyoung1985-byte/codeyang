/**
 * Spinner component for CLI progress indication
 */
import picocolors from 'picocolors';

const c = picocolors;

export class Spinner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private label = '';
  private startTime = 0;
  private spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

  start(label = '') {
    this.stop();
    this.label = label;
    this.startTime = Date.now();
    this.draw();
    this.timer = setInterval(() => this.draw(), 80);
  }

  private draw() {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const timeStr = elapsed >= 60 ? `${Math.floor(elapsed / 60)}m${elapsed % 60}s` : `${elapsed}s`;
    const char = this.spinnerChars[Math.floor(Date.now() / 80) % this.spinnerChars.length];
    const dots = '.'.repeat(3 - Math.min(3, Math.floor(elapsed / 2) % 4));
    process.stdout.write(`\r  ${c.cyan(char)} ${c.dim(this.label)}${dots} ${c.dim(timeStr)}`);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
    }
  }

  succeed(message?: string) {
    this.stop();
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const timeStr = elapsed >= 60 ? `${Math.floor(elapsed / 60)}m${elapsed % 60}s` : `${elapsed}s`;
    console.log(`  ${c.green('✓')} ${message || this.label} ${c.dim(timeStr)}`);
  }

  fail(message?: string) {
    this.stop();
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const timeStr = elapsed >= 60 ? `${Math.floor(elapsed / 60)}m${elapsed % 60}s` : `${elapsed}s`;
    console.log(`  ${c.red('✗')} ${message || this.label} ${c.dim(timeStr)}`);
  }
}
