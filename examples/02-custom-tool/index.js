import { Agent } from '../../dist/agent/Agent.js';

// Define a custom weather tool
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

// Mock weather data (in production, call a real API)
const mockWeatherData = {
  'tokyo': { temp_c: 22, temp_f: 72, conditions: 'Partly cloudy', humidity: 65 },
  'san francisco': { temp_c: 18, temp_f: 64, conditions: 'Foggy', humidity: 80 },
  'london': { temp_c: 12, temp_f: 54, conditions: 'Rainy', humidity: 75 },
  'sydney': { temp_c: 25, temp_f: 77, conditions: 'Sunny', humidity: 55 },
};

async function executeWeather(args) {
  const { city, units = 'celsius' } = args;
  const cityKey = city.toLowerCase();

  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 500));

  const data = mockWeatherData[cityKey];

  if (!data) {
    throw new Error(`Weather data not available for ${city}. Try: Tokyo, San Francisco, London, or Sydney.`);
  }

  return {
    city,
    temperature: units === 'celsius' ? data.temp_c : data.temp_f,
    units,
    conditions: data.conditions,
    humidity: data.humidity,
  };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable not set');
    process.exit(1);
  }

  console.log('🌤️  Custom Weather Tool Example\n');

  const agent = new Agent({
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    apiKey: process.env.ANTHROPIC_API_KEY,
    tools: [weatherTool],
  });

  // Handle custom tool execution
  agent.on('tool_call', async (toolName, args) => {
    if (toolName === 'get_weather') {
      console.log(`\n[🔧 Calling ${toolName}]`);
      console.log(`  City: ${args.city}`);
      console.log(`  Units: ${args.units || 'celsius'}`);

      try {
        const result = await executeWeather(args);
        console.log(`[✅ Weather fetched]\n`);
        return result;
      } catch (error) {
        console.log(`[❌ Error: ${error.message}]\n`);
        throw error;
      }
    }
  });

  const queries = [
    "What's the weather like in Tokyo?",
    "Compare the weather in London and Sydney",
  ];

  for (const query of queries) {
    console.log(`\nUser: ${query}`);
    console.log('Agent: ');

    try {
      const stream = agent.run(query);

      for await (const chunk of stream) {
        if (chunk.type === 'text') {
          process.stdout.write(chunk.content);
        }
      }

      console.log('\n');
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  }

  console.log('✨ Example complete!');
}

main();
