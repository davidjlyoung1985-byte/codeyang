// Quick sandbox debug test
import { Sandbox } from './src/sandbox/index.js';

const sandbox = new Sandbox({
  timeoutMs: 5000,
  cleanupTempDir: true,
});

console.log('Testing sandbox with node -e...');

const result = await sandbox.run('node', ['-e', 'console.log("hello from sandbox")']);

console.log('Result:', JSON.stringify(result, null, 2));

await sandbox.cleanup();

process.exit(result.success ? 0 : 1);
