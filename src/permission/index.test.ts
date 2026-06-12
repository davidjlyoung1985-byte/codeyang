import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkPermission, addRule, reloadPermissions } from './index.js';

describe('permission', () => {
  beforeEach(async () => {
    process.env['CODEYANG_PERMIT_RM'] = '';
    process.env['CODEYANG_PERMIT_SUDO'] = '';
    process.env['CODEYANG_PERMIT_FORCE'] = '';
    await reloadPermissions();
  });

  it('allows unknown commands by default', async () => {
    const r = await checkPermission('bash', 'echo hello');
    expect(r.level).toBe('allow');
  });

  it('allows file operations by default', async () => {
    const r = await checkPermission('file', 'read /tmp/x');
    expect(r.level).toBe('allow');
  });

  it('asks for rm -rf', async () => {
    const r = await checkPermission('bash', 'rm -rf /tmp');
    expect(r.level).toBe('ask');
  });

  it('denies mkfs (first word match)', async () => {
    const r = await checkPermission('bash', 'mkfs.ext4');
    expect(r.level).toBe('deny');
  });

  // Full command checking is done by BashTool which extracts the first word;
  // the permission system checks the first word only via anchored regex.

  it('env override allows rm -rf', async () => {
    process.env['CODEYANG_PERMIT_RM'] = 'allow';
    const r = await checkPermission('bash', 'rm -rf /project');
    expect(r.level).toBe('allow');
  });

  it('env override allows sudo', async () => {
    process.env['CODEYANG_PERMIT_SUDO'] = 'allow';
    const r = await checkPermission('bash', 'sudo apt install');
    expect(r.level).toBe('allow');
  });

  it('env override allows force push', async () => {
    process.env['CODEYANG_PERMIT_FORCE'] = 'allow';
    const r = await checkPermission('bash', 'git push --force origin master');
    expect(r.level).toBe('allow');
  });

  it('adds and evaluates custom rules', async () => {
    await addRule({ pattern: 'danger-command', level: 'deny', category: 'bash' });
    const r = await checkPermission('bash', 'danger-command');
    expect(r.level).toBe('deny');
  });
});
