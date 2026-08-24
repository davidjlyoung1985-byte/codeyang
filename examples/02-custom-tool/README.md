# Example 2: Custom Tool

Learn how to create and register your own tools for the agent to use.

## What You'll Learn

- Tool definition structure
- Parameter validation
- Error handling in tools
- Registering custom tools with the agent

## The Weather Tool

This example creates a simple weather lookup tool that the agent can call.

## Running the Example

```bash
export ANTHROPIC_API_KEY=your-key-here
node examples/02-custom-tool/index.js
```

## Code Walkthrough

### 1. Define Your Tool

```typescript
const weatherTool = {
  name: 'get_weather',
  description: 'Get current weather for a city. Returns temperature and conditions.',
  input_schema: {
    type: 'object',
    properties: {
      city: {
        type: 'string',
        description: 'City name (e.g., "San Francisco", "Tokyo")',
      },
      units: {
        type: 'string',
        enum: ['celsius', 'fahrenheit'],
        description: 'Temperature units',
        default: 'celsius',
      },
    },
    required: ['city'],
  },
};
```

### 2. Implement the Tool Function

```typescript
async function executeWeather(args) {
  const { city, units = 'celsius' } = args;
  
  // In a real tool, you'd call a weather API
  // For this example, we'll return mock data
  const temp = units === 'celsius' ? 22 : 72;
  
  return {
    city,
    temperature: temp,
    units,
    conditions: 'Partly cloudy',
    humidity: 65,
  };
}
```

### 3. Register with the Agent

```typescript
import { Agent } from '../../dist/agent/Agent.js';

const agent = new Agent({
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  apiKey: process.env.ANTHROPIC_API_KEY,
  tools: [weatherTool], // Add your custom tool
});

// Add the execution handler
agent.on('tool_call', async (toolName, args) => {
  if (toolName === 'get_weather') {
    return executeWeather(args);
  }
});
```

## Try It

Ask the agent: "What's the weather like in Tokyo?"

The agent will:
1. Recognize it needs weather information
2. Call your `get_weather` tool with `{city: "Tokyo"}`
3. Receive the result
4. Incorporate it into a natural language response

## Key Concepts

**Tool Schema**: The `input_schema` tells the LLM what parameters your tool accepts. Use clear descriptions and appropriate types.

**Validation**: The agent validates arguments against your schema before calling the tool.

**Async Execution**: Tools can be async, allowing API calls, file I/O, etc.

**Error Handling**: If your tool throws an error, the agent receives it and can retry or explain the failure to the user.

## Advanced: Tool Composition

Tools can call other tools! For example, a "travel_planner" tool could internally use "get_weather" and "search_flights".

## Next Steps

- [Example 3: MCP Integration](../03-mcp-integration/) - Connect to external Model Context Protocol servers
- See [src/tools/definitions/](../../src/tools/definitions/) for more tool examples
