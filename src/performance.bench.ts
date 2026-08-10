/**
 * Performance Benchmarks for CodeYang
 *
 * Measures performance of critical code paths
 * Run with: npm run bench
 */

import { bench, describe } from 'vitest';
import { isComplexPrompt, formatComplexPrompt, validateMessages } from './agent/AgentRunHelpers.js';
import { jsonClone } from './agent/AgentUtils.js';
import { validateUrl, isPrivateIP } from './security/ssrf.js';
import { loadConfig } from './config/index.js';
import type { LLMMessage } from './agent/LLMClient.js';

describe('Agent Performance Benchmarks', () => {
  describe('Prompt Processing', () => {
    bench('isComplexPrompt - simple', () => {
      isComplexPrompt('hello world');
    });

    bench('isComplexPrompt - complex', () => {
      isComplexPrompt('a'.repeat(300));
    });

    bench('formatComplexPrompt', () => {
      formatComplexPrompt('Build a web application');
    });
  });

  describe('Message Handling', () => {
    const smallHistory: LLMMessage[] = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ];

    const largeHistory: LLMMessage[] = Array.from({ length: 100 }, (_, i) => ({
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `Message ${i}`,
    }));

    bench('validateMessages - small', () => {
      validateMessages(smallHistory, 'test');
    });

    bench('jsonClone - small history', () => {
      jsonClone(smallHistory);
    });

    bench('jsonClone - large history', () => {
      jsonClone(largeHistory);
    });
  });

  describe('Security Validation', () => {
    bench('validateUrl - valid URL', () => {
      validateUrl('https://api.example.com/data');
    });

    bench('validateUrl - private IP (blocked)', () => {
      try {
        validateUrl('http://127.0.0.1/admin');
      } catch {
        // Expected
      }
    });

    bench('isPrivateIP - public', () => {
      isPrivateIP('8.8.8.8');
    });

    bench('isPrivateIP - private', () => {
      isPrivateIP('192.168.1.1');
    });
  });

  describe('Configuration', () => {
    bench('loadConfig', () => {
      loadConfig();
    });
  });
});

describe('String Operations Benchmarks', () => {
  const shortString = 'hello world';
  const longString = 'a'.repeat(10000);

  bench('String length check - short', () => {
    shortString.length > 200;
  });

  bench('String length check - long', () => {
    longString.length > 200;
  });

  bench('Regex match - short', () => {
    shortString.match(/[。；;.!?？]/g);
  });

  bench('Regex match - long', () => {
    longString.match(/[。；;.!?？]/g);
  });

  bench('String includes - short', () => {
    shortString.includes('\n');
  });

  bench('String includes - long', () => {
    longString.includes('\n');
  });
});

describe('Array Operations Benchmarks', () => {
  const smallArray = Array.from({ length: 10 }, (_, i) => ({ id: i, data: `item-${i}` }));
  const largeArray = Array.from({ length: 1000 }, (_, i) => ({ id: i, data: `item-${i}` }));

  bench('Array filter - small', () => {
    smallArray.filter((item) => item.id > 5);
  });

  bench('Array filter - large', () => {
    largeArray.filter((item) => item.id > 500);
  });

  bench('Array map - small', () => {
    smallArray.map((item) => ({ ...item, processed: true }));
  });

  bench('Array map - large', () => {
    largeArray.map((item) => ({ ...item, processed: true }));
  });

  bench('Array reduce - small', () => {
    smallArray.reduce((acc, item) => acc + item.id, 0);
  });

  bench('Array reduce - large', () => {
    largeArray.reduce((acc, item) => acc + item.id, 0);
  });
});

describe('JSON Operations Benchmarks', () => {
  const simpleObject = { name: 'test', value: 123 };
  const complexObject = {
    name: 'complex',
    nested: {
      level1: {
        level2: {
          level3: Array.from({ length: 100 }, (_, i) => ({ id: i, data: `item-${i}` })),
        },
      },
    },
  };

  bench('JSON.stringify - simple', () => {
    JSON.stringify(simpleObject);
  });

  bench('JSON.stringify - complex', () => {
    JSON.stringify(complexObject);
  });

  bench('JSON.parse - simple', () => {
    JSON.parse('{"name":"test","value":123}');
  });

  bench('JSON.parse - complex', () => {
    const str = JSON.stringify(complexObject);
    JSON.parse(str);
  });

  bench('structuredClone - simple', () => {
    structuredClone(simpleObject);
  });

  bench('structuredClone - complex', () => {
    structuredClone(complexObject);
  });
});
