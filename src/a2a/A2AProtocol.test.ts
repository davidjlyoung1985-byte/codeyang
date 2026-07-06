import { describe, it, expect, beforeEach } from 'vitest';
import {
  InProcessChannel,
  AgentRegistry,
  A2AProtocol,
  buildA2AMessage,
  type AgentCard,
  type A2AMessage,
} from './A2AProtocol.js';

describe('InProcessChannel', () => {
  let channel: InProcessChannel;

  beforeEach(() => {
    channel = new InProcessChannel();
  });

  it('should send and receive messages', async () => {
    const msg: A2AMessage = {
      id: 'msg-1',
      type: 'request',
      sender: 'agent-1',
      target: 'agent-2',
      conversationId: 'conv-1',
      timestamp: Date.now(),
      payload: { task: 'test task' },
    };

    await channel.send(msg);

    const received: A2AMessage[] = [];
    for await (const receivedMsg of channel.receive()) {
      received.push(receivedMsg);
      break; // Only get first message
    }

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(msg);
  });

  it('should throw when sending to closed channel', async () => {
    channel.close();

    const msg: A2AMessage = {
      id: 'msg-1',
      type: 'request',
      sender: 'agent-1',
      target: 'agent-2',
      conversationId: 'conv-1',
      timestamp: Date.now(),
      payload: {},
    };

    await expect(channel.send(msg)).rejects.toThrow('Channel closed');
  });

  it('should report closed status', () => {
    expect(channel.closed).toBe(false);
    channel.close();
    expect(channel.closed).toBe(true);
  });

  it('should handle multiple messages in order', async () => {
    const msg1: A2AMessage = {
      id: 'msg-1',
      type: 'request',
      sender: 'a1',
      target: 'a2',
      conversationId: 'c1',
      timestamp: Date.now(),
      payload: {},
    };

    const msg2: A2AMessage = {
      id: 'msg-2',
      type: 'response',
      sender: 'a2',
      target: 'a1',
      conversationId: 'c1',
      timestamp: Date.now(),
      payload: {},
    };

    // Send both messages
    await channel.send(msg1);
    await channel.send(msg2);

    // Receive them
    const messages: A2AMessage[] = [];
    let count = 0;
    for await (const msg of channel.receive()) {
      messages.push(msg);
      count++;
      if (count >= 2) break;
    }

    expect(messages).toHaveLength(2);
    expect(messages[0]?.id).toBe('msg-1');
    expect(messages[1]?.id).toBe('msg-2');
  });
});

describe('AgentRegistry', () => {
  let registry: AgentRegistry;
  let mockCard: AgentCard;

  beforeEach(() => {
    registry = new AgentRegistry();
    mockCard = {
      agentId: 'agent-1',
      name: 'Test Agent',
      version: '1.0.0',
      capabilities: ['file_ops', 'shell_exec'],
      tools: ['Read', 'Write', 'Bash'],
      context: 'Test agent context',
      maxConcurrentTasks: 3,
    };
  });

  describe('Registration', () => {
    it('should register agent and return channel', () => {
      const channel = registry.register(mockCard);

      expect(channel).toBeDefined();
      expect(channel).toBeInstanceOf(InProcessChannel);
      expect(registry.count).toBe(1);
    });

    it('should retrieve registered agent card', () => {
      registry.register(mockCard);
      const card = registry.getCard('agent-1');

      expect(card).toEqual(mockCard);
    });

    it('should retrieve channel for registered agent', () => {
      const channel = registry.register(mockCard);
      const retrieved = registry.getChannel('agent-1');

      expect(retrieved).toBe(channel);
    });

    it('should return undefined for non-existent agent', () => {
      const card = registry.getCard('non-existent');
      expect(card).toBeUndefined();
    });

    it('should unregister agent and close channel', () => {
      const channel = registry.register(mockCard);
      registry.unregister('agent-1');

      expect(registry.count).toBe(0);
      expect(channel.closed).toBe(true);
    });
  });

  describe('Agent discovery', () => {
    beforeEach(() => {
      registry.register(mockCard);
      registry.register({
        ...mockCard,
        agentId: 'agent-2',
        name: 'Second Agent',
        capabilities: ['code_search', 'code_analysis'],
      });
      registry.register({
        ...mockCard,
        agentId: 'agent-3',
        name: 'Third Agent',
        capabilities: ['file_ops', 'network'],
      });
    });

    it('should find agents by capability', () => {
      const fileAgents = registry.findAgentsByCapability('file_ops');
      expect(fileAgents).toHaveLength(2);
      expect(fileAgents.map((a) => a.agentId)).toContain('agent-1');
      expect(fileAgents.map((a) => a.agentId)).toContain('agent-3');
    });

    it('should return empty array if no agents match capability', () => {
      const agents = registry.findAgentsByCapability('custom');
      expect(agents).toHaveLength(0);
    });

    it('should find best agent for task', () => {
      const best = registry.findBestAgent('read files', ['file_ops', 'shell_exec']);

      expect(best).toBeDefined();
      expect(best?.agentId).toBe('agent-1'); // Has both capabilities
    });

    it('should return null if no agent matches', () => {
      const best = registry.findBestAgent('custom task', ['custom']);
      expect(best).toBeNull();
    });

    it('should list all agents', () => {
      const all = registry.listAgents();
      expect(all).toHaveLength(3);
    });
  });
});

describe('buildA2AMessage', () => {
  it('should build message with all fields', () => {
    const msg = buildA2AMessage('request', 'sender-1', 'target-1', 'conv-1', { task: 'test' }, { priority: 'high' });

    expect(msg.id).toBeDefined();
    expect(msg.type).toBe('request');
    expect(msg.sender).toBe('sender-1');
    expect(msg.target).toBe('target-1');
    expect(msg.conversationId).toBe('conv-1');
    expect(msg.payload.task).toBe('test');
    expect(msg.metadata?.priority).toBe('high');
    expect(msg.timestamp).toBeGreaterThan(0);
  });

  it('should generate unique IDs', () => {
    const msg1 = buildA2AMessage('request', 's1', 't1', 'c1', {});
    const msg2 = buildA2AMessage('request', 's1', 't1', 'c1', {});

    expect(msg1.id).not.toBe(msg2.id);
  });
});

describe('A2AProtocol', () => {
  let protocol: A2AProtocol;
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
    protocol = new A2AProtocol({}, registry);
  });

  describe('Configuration', () => {
    it('should use default config', () => {
      const card = protocol.getMyCard();

      expect(card.agentId).toBeDefined();
      expect(card.name).toBe('CodeYang');
      expect(card.version).toBe('0.7.0');
      expect(card.capabilities).toContain('file_ops');
      expect(card.capabilities).toContain('shell_exec');
    });

    it('should use custom config', () => {
      const customProtocol = new A2AProtocol({
        agentId: 'custom-agent',
        agentName: 'Custom Agent',
        maxConcurrentConversations: 5,
      });

      const card = customProtocol.getMyCard();
      expect(card.agentId).toBe('custom-agent');
      expect(card.name).toBe('Custom Agent');
      expect(card.maxConcurrentTasks).toBe(5);
    });

    it('should expose registry', () => {
      const reg = protocol.getRegistry();
      expect(reg).toBe(registry);
    });
  });

  describe('Message handling', () => {
    it('should handle ping message', async () => {
      // Register protocol's own agent so it has a channel
      const myCard = protocol.getMyCard();
      registry.register(myCard);

      const pingMsg: A2AMessage = {
        id: 'ping-1',
        type: 'ping',
        sender: 'requester',
        target: myCard.agentId,
        conversationId: 'conv-ping',
        timestamp: Date.now(),
        payload: {},
      };

      const response = await protocol.handleIncoming(pingMsg, () => Promise.resolve('ok'));

      expect(response).toBeDefined();
      expect(response?.type).toBe('pong');
      expect(response?.sender).toBe(myCard.agentId);
    });

    it('should throw if target agent not found', async () => {
      await expect(protocol.sendTask('non-existent', 'test task')).rejects.toThrow(
        'Agent non-existent not found or not connected',
      );
    });

    it('should send task to registered agent', async () => {
      // Register a target agent
      const targetCard: AgentCard = {
        agentId: 'target-agent',
        name: 'Target',
        version: '1.0.0',
        capabilities: ['file_ops'],
        tools: ['Read'],
        context: 'Target agent',
        maxConcurrentTasks: 1,
      };

      const channel = registry.register(targetCard);

      // Simulate target agent responding
      const respondPromise = (async () => {
        for await (const msg of channel.receive()) {
          if (msg.type === 'request') {
            await channel.send(
              buildA2AMessage('response', 'target-agent', msg.sender, msg.conversationId, {
                content: 'File content',
                status: 'completed',
              }),
            );
            break;
          }
        }
      })();

      // Send task
      const responsePromise = protocol.sendTask('target-agent', 'read file', 'context', ['file.txt']);

      // Wait for both
      const [response] = await Promise.all([responsePromise, respondPromise]);

      expect(response.type).toBe('response');
      expect(response.payload.content).toBe('File content');
      expect(response.payload.status).toBe('completed');
    });

    it('should timeout if agent does not respond', async () => {
      const targetCard: AgentCard = {
        agentId: 'slow-agent',
        name: 'Slow',
        version: '1.0.0',
        capabilities: [],
        tools: [],
        context: 'Slow agent',
        maxConcurrentTasks: 1,
      };

      registry.register(targetCard);

      // Use short timeout
      const shortProtocol = new A2AProtocol({ messageTimeoutMs: 100 }, registry);

      await expect(shortProtocol.sendTask('slow-agent', 'task')).rejects.toThrow(/timeout/i);
    });
  });

  describe('Conversation tracking', () => {
    it('should track conversation messages when handling requests', async () => {
      // Register protocol's agent
      const myCard = protocol.getMyCard();
      registry.register(myCard);

      const convId = 'test-conv-1';
      const msg: A2AMessage = {
        id: 'msg-1',
        type: 'request',
        sender: 'agent-1',
        target: myCard.agentId,
        conversationId: convId,
        timestamp: Date.now(),
        payload: { task: 'test' },
      };

      // Handle the request (this should record it in conversations)
      await protocol.handleIncoming(msg, () => Promise.resolve('result'));

      const conversation = protocol.getConversation(convId);
      expect(conversation).toBeDefined();
      expect(conversation!.length).toBeGreaterThan(0);
      expect(conversation![0]?.id).toBe('msg-1');
    });

    it('should count active conversations', async () => {
      // Register protocol's agent
      const myCard = protocol.getMyCard();
      registry.register(myCard);

      const initialCount = protocol.getActiveConversations();

      const msg: A2AMessage = {
        id: 'msg-1',
        type: 'request',
        sender: 'agent-1',
        target: myCard.agentId,
        conversationId: 'conv-count',
        timestamp: Date.now(),
        payload: { task: 'test' },
      };

      await protocol.handleIncoming(msg, () => Promise.resolve('result'));

      expect(protocol.getActiveConversations()).toBeGreaterThan(initialCount);
    });
  });
});
