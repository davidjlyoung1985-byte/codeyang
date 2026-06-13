#!/usr/bin/env tsx
/**
 * Test DeepSeek Anthropic API Integration
 *
 * This script tests the DeepSeek Anthropic-compatible API endpoint
 * to verify that it works with the @anthropic-ai/sdk
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Load API key from config
function loadConfig() {
  try {
    const configPath = path.join(os.homedir(), '.codeyang', 'config.json');
    const data = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function testAnthropicAPI() {
  const config = loadConfig();
  const apiKey = config?.apiKey || process.env.DEEPSEEK_API_KEY || process.env.CODEYANG_API_KEY;

  if (!apiKey) {
    console.error('❌ No API key found. Please set DEEPSEEK_API_KEY or configure ~/.codeyang/config.json');
    process.exit(1);
  }

  console.log('🧪 Testing DeepSeek Anthropic API...\n');

  // Test configuration
  const baseURL = 'https://api.deepseek.com/anthropic';
  const model = 'deepseek-v4-pro';

  console.log('📋 Configuration:');
  console.log(`   Base URL: ${baseURL}`);
  console.log(`   Model: ${model}`);
  console.log(`   API Key: ${apiKey.slice(0, 8)}...${apiKey.slice(-4)}\n`);

  try {
    const client = new Anthropic({
      apiKey,
      baseURL,
    });

    console.log('📤 Sending test message...\n');

    const message = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: 'Hello! Please respond with a brief greeting and confirm you are working correctly.',
        },
      ],
    });

    console.log('✅ Response received!\n');
    console.log('📝 Message:');
    console.log('─'.repeat(60));

    for (const block of message.content) {
      if (block.type === 'text') {
        console.log(block.text);
      }
    }

    console.log('─'.repeat(60));
    console.log('\n📊 Metadata:');
    console.log(`   ID: ${message.id}`);
    console.log(`   Model: ${message.model}`);
    console.log(`   Role: ${message.role}`);
    console.log(`   Stop Reason: ${message.stop_reason}`);
    console.log(`   Input Tokens: ${message.usage.input_tokens}`);
    console.log(`   Output Tokens: ${message.usage.output_tokens}`);

    console.log('\n✅ DeepSeek Anthropic API integration is working!\n');
  } catch (error) {
    const err = error as { status?: number; message?: string; code?: string };
    console.error('\n❌ API Error:\n');
    console.error(`   Status: ${err.status || 'N/A'}`);
    console.error(`   Message: ${err.message}`);

    if (err.status === 401) {
      console.error('\n💡 Tip: Check your API key at https://platform.deepseek.com/api_keys');
    } else if (err.status === 403) {
      console.error('\n💡 Tip: Check your account balance at https://platform.deepseek.com/');
    } else if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      console.error('\n💡 Tip: Check your internet connection and verify api.deepseek.com is accessible');
    }

    process.exit(1);
  }
}

async function testToolUse() {
  const config = loadConfig();
  const apiKey = config?.apiKey || process.env.DEEPSEEK_API_KEY || process.env.CODEYANG_API_KEY;

  console.log('\n🔧 Testing Tool Use...\n');

  const baseURL = 'https://api.deepseek.com/anthropic';
  const model = 'deepseek-v4-pro';

  try {
    const client = new Anthropic({
      apiKey,
      baseURL,
    });

    const tools = [
      {
        name: 'get_weather',
        description: 'Get the weather for a location',
        input_schema: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'City name',
            },
          },
          required: ['location'],
        },
      },
    ];

    console.log('📤 Sending message with tools...\n');

    const message = await client.messages.create({
      model,
      max_tokens: 1024,
      tools,
      messages: [
        {
          role: 'user',
          content: "What's the weather in San Francisco?",
        },
      ],
    });

    console.log('✅ Response received!\n');
    console.log('📝 Content Blocks:');
    console.log('─'.repeat(60));

    for (const block of message.content) {
      if (block.type === 'text') {
        console.log(`[Text] ${block.text}`);
      } else if (block.type === 'tool_use') {
        console.log(`[Tool Use] ${block.name}`);
        console.log(`   ID: ${block.id}`);
        console.log(`   Input: ${JSON.stringify(block.input)}`);
      }
    }

    console.log('─'.repeat(60));
    console.log('\n✅ Tool use is working!\n');
  } catch (error) {
    const err = error as { message?: string };
    console.error('\n❌ Tool Use Error:\n');
    console.error(`   Message: ${err.message}`);
    process.exit(1);
  }
}

async function testStreaming() {
  const config = loadConfig();
  const apiKey = config?.apiKey || process.env.DEEPSEEK_API_KEY || process.env.CODEYANG_API_KEY;

  console.log('\n🌊 Testing Streaming...\n');

  const baseURL = 'https://api.deepseek.com/anthropic';
  const model = 'deepseek-v4-pro';

  try {
    const client = new Anthropic({
      apiKey,
      baseURL,
    });

    console.log('📤 Starting stream...\n');

    const stream = await client.messages.stream({
      model,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: 'Count from 1 to 5 slowly, one number per line.',
        },
      ],
    });

    process.stdout.write('📝 Streaming response: ');

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          process.stdout.write(event.delta.text);
        }
      }
    }

    console.log('\n');
    console.log('─'.repeat(60));
    console.log('\n✅ Streaming is working!\n');
  } catch (error) {
    const err = error as { message?: string };
    console.error('\n❌ Streaming Error:\n');
    console.error(`   Message: ${err.message}`);
    process.exit(1);
  }
}

// Main
async function main() {
  console.log('═'.repeat(60));
  console.log('  CodeYang - DeepSeek Anthropic API Test Suite');
  console.log('═'.repeat(60));
  console.log();

  await testAnthropicAPI();
  await testToolUse();
  await testStreaming();

  console.log('═'.repeat(60));
  console.log('  ✅ All tests passed!');
  console.log('═'.repeat(60));
  console.log();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
