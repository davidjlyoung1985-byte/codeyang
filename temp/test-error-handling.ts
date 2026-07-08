/**
 * Test script for enhanced error handling and user feedback
 */
import {
  toolError,
  toolErrorWithActions,
  fileNotFound,
  netError,
  gitError,
  parseError,
  invalidParam,
} from './dist/chunk-HIAIX6ED.js';

console.log('=== Testing Enhanced Error Messages ===\n');

// Test 1: Basic error with severity
console.log('1. Basic error with severity:');
console.log(toolError('Test', 'Something went wrong', 'Check the logs', 'error'));
console.log('');

// Test 2: Critical error
console.log('2. Critical error:');
console.log(toolError('Security', 'Access denied', 'Contact administrator', 'critical'));
console.log('');

// Test 3: Warning
console.log('3. Warning:');
console.log(toolError('Config', 'Deprecated option used', 'Update your configuration', 'warning'));
console.log('');

// Test 4: File not found with actions
console.log('4. File not found with actions:');
console.log(fileNotFound('/path/to/file.txt', '/current/dir'));
console.log('');

// Test 5: Network error with timeout
console.log('5. Network error (timeout):');
console.log(netError('https://api.example.com', 'Connection timeout', true));
console.log('');

// Test 6: Network error (general)
console.log('6. Network error (general):');
console.log(netError('https://api.example.com', 'DNS resolution failed', false));
console.log('');

// Test 7: Git error with actions
console.log('7. Git error with actions:');
console.log(gitError('push', 'remote rejected'));
console.log('');

// Test 8: Parse error with actions
console.log('8. Parse error with actions:');
console.log(parseError('JSON', 'Unexpected token at line 42'));
console.log('');

// Test 9: Invalid parameter with actions
console.log('9. Invalid parameter with actions:');
console.log(invalidParam('timeout', 'a positive number'));
console.log('');

// Test 10: Custom error with multiple actions
console.log('10. Custom error with multiple actions:');
console.log(
  toolErrorWithActions({
    severity: 'error',
    context: 'Database',
    message: 'Connection pool exhausted',
    hint: 'Too many concurrent connections',
    actions: [
      'Reduce the number of parallel queries',
      'Increase connection pool size in config',
      'Check for connection leaks',
      'Restart the database service',
    ],
  }),
);
console.log('');

console.log('=== All tests completed ===');
