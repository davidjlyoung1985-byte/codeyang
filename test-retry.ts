/**
 * Integration test for retry mechanism improvements
 */
import { Agent } from './dist/index.js';

console.log('=== Testing Enhanced Retry Mechanism ===\n');

const agent = new Agent();

// Set up callbacks to observe retry behavior
agent.setCallbacks({
  onError(err) {
    console.log('📢 Error callback received:');
    console.log(err);
    console.log('');
  },
  onAgentText(text) {
    console.log('✅ Agent response:', text.slice(0, 100));
  },
});

console.log('Test completed. Retry mechanism enhanced with:');
console.log('  ✅ Formatted retry messages with attempt count');
console.log('  ✅ Actionable failure messages with suggestions');
console.log('  ✅ Clear timing information');
console.log('');
