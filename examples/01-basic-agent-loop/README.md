# Example 1: Basic Agent Loop

This example demonstrates the core agent loop: receiving user input, calling tools, and streaming responses.

## What You'll Learn

- Setting up a minimal agent instance
- Streaming responses from the LLM
- Tool execution flow
- Error handling

## Prerequisites

```bash
npm install
export ANTHROPIC_API_KEY=your-key-here
```

## Running the Example

```bash
node examples/01-basic-agent-loop/index.js
```

## Code Walkthrough

### 1. Initialize the Agent

```typescript
import { Agent } from '../../dist/agent/Agent.js';

const agent = new Agent({
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  apiKey: process.env.ANTHROPIC_API_KEY,
});
```

### 2. Stream a Response

```typescript
const stream = agent.run('List files in the current directory');

for await (const chunk of stream) {
  if (chunk.type === 'text') {
    process.stdout.write(chunk.content);
  } else if (chunk.type === 'tool_use') {
    console.log(`\n[Tool: ${chunk.name}]`);
  }
}
```

### 3. Handle Tool Results

The agent automatically:
1. Detects when a tool should be called
2. Executes the tool with provided arguments
3. Feeds the result back to the LLM
4. Continues the conversation

## Expected Output

```
Let me list the files for you.

[Tool: Bash]
Running: ls -la

Here are the files in your current directory:
- package.json
- src/
- dist/
...
```

## Key Concepts

**Streaming**: Responses arrive incrementally, not all at once. This provides a better UX for long responses.

**Tool Loop**: The agent can call multiple tools in sequence. Each tool result is fed back into the conversation context.

**Error Recovery**: If a tool fails, the agent receives the error message and can retry with different arguments.

## Next Steps

- [Example 2: Custom Tool](../02-custom-tool/) - Create your own tool
- [Example 3: MCP Integration](../03-mcp-integration/) - Connect to external services
