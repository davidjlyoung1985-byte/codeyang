import { Agent } from '../../dist/agent/Agent.js';

async function main() {
  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable not set');
    console.error('Usage: export ANTHROPIC_API_KEY=your-key-here');
    process.exit(1);
  }

  console.log('🚀 Starting basic agent loop example...\n');

  // Initialize the agent
  const agent = new Agent({
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  // Run a simple query that will trigger a tool call
  const userQuery = 'List the files in the current directory and tell me what this project is about';

  console.log(`User: ${userQuery}\n`);
  console.log('Agent: ');

  try {
    const stream = agent.run(userQuery);

    for await (const chunk of stream) {
      if (chunk.type === 'text') {
        // Stream text output directly
        process.stdout.write(chunk.content);
      } else if (chunk.type === 'tool_use') {
        // Log tool executions
        console.log(`\n\n[🔧 Tool: ${chunk.name}]`);
        console.log(`Arguments: ${JSON.stringify(chunk.input, null, 2)}`);
      } else if (chunk.type === 'tool_result') {
        console.log(`[✅ Tool completed]\n`);
      }
    }

    console.log('\n\n✨ Agent response complete!');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
