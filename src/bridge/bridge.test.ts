/**
 * Tests for Bridge module — types and config.
 * Full integration tests require a running bridge server (covered by e2e tests).
 */
import { describe, it, expect } from 'vitest';

// Bridge module exports types and functions — test that exports exist
describe('Bridge Module', () => {
  it('should export expected functions', async () => {
    const bridge = await import('./index.js');

    // Check function exports
    expect(bridge).toHaveProperty('startBridgeServer');
    expect(typeof bridge.startBridgeServer).toBe('function');

    expect(bridge).toHaveProperty('configureBridge');
    expect(typeof bridge.configureBridge).toBe('function');

    expect(bridge).toHaveProperty('checkBridgeHealth');
    expect(typeof bridge.checkBridgeHealth).toBe('function');

    expect(bridge).toHaveProperty('sendTaskToClaude');
    expect(typeof bridge.sendTaskToClaude).toBe('function');

    expect(bridge).toHaveProperty('sendMessageToClaude');
    expect(typeof bridge.sendMessageToClaude).toBe('function');

    expect(bridge).toHaveProperty('getMessagesFromClaude');
    expect(typeof bridge.getMessagesFromClaude).toBe('function');

    expect(bridge).toHaveProperty('writeSharedFile');
    expect(typeof bridge.writeSharedFile).toBe('function');

    expect(bridge).toHaveProperty('readSharedFile');
    expect(typeof bridge.readSharedFile).toBe('function');

    expect(bridge).toHaveProperty('getBridgeToken');
    expect(typeof bridge.getBridgeToken).toBe('function');
  });

  it('should export expected types', async () => {
    // Types are compile-time only, we just verify the module imports without error
    const bridge = await import('./index.js');
    expect(bridge).toBeDefined();
  });
});
