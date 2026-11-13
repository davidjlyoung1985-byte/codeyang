#!/usr/bin/env node
/**
 * CodeYang 配置向导
 *
 * 交互式引导用户完成初始配置：
 * - 选择 LLM 提供商
 * - 输入 API Key
 * - 测试连接
 * - 保存配置
 */

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function print(msg: string, color: keyof typeof colors = 'reset'): void {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function printHeader(title: string): void {
  console.log();
  print('═══════════════════════════════════════════════', 'cyan');
  print(`  ${title}`, 'bright');
  print('═══════════════════════════════════════════════', 'cyan');
  console.log();
}

// LLM 提供商配置
interface ProviderConfig {
  name: string;
  apiKeyPattern: RegExp;
  apiKeyExample: string;
  defaultBaseURL: string;
  testEndpoint: string;
  instructions: string;
}

const providers: Record<string, ProviderConfig> = {
  deepseek: {
    name: 'DeepSeek',
    apiKeyPattern: /^deepseek-r-[a-zA-Z0-9_-]+$/,
    apiKeyExample: 'deepseek-r-xxxxxxxxxxxxxxxx',
    defaultBaseURL: 'https://api.deepseek.com',
    testEndpoint: '/v1/chat/completions',
    instructions:
      '1. 访问 https://platform.deepseek.com/api_keys\n' +
      '   2. 创建新的 API Key\n' +
      '   3. 复制 API Key (以 deepseek-r- 开头)',
  },
  openai: {
    name: 'OpenAI',
    apiKeyPattern: /^sk-[a-zA-Z0-9_-]+$/,
    apiKeyExample: 'sk-xxxxxxxxxxxxxxxxxxxxxxxx',
    defaultBaseURL: 'https://api.openai.com',
    testEndpoint: '/v1/models',
    instructions:
      '1. 访问 https://platform.openai.com/api-keys\n' +
      '   2. 创建新的 API Key\n' +
      '   3. 复制 API Key (以 sk- 开头)',
  },
  anthropic: {
    name: 'Anthropic',
    apiKeyPattern: /^anthropic-[a-zA-Z0-9_-]+$/,
    apiKeyExample: 'anthropic-xxxxxxxxxxxxxxxx',
    defaultBaseURL: 'https://api.anthropic.com',
    testEndpoint: '/v1/messages',
    instructions:
      '1. 访问 https://console.anthropic.com/settings/keys\n' +
      '   2. 创建新的 API Key\n' +
      '   3. 复制 API Key (以 anthropic- 开头)',
  },
};

// 配置文件路径
const configDir = join(homedir(), '.codeyang');
const configFile = join(configDir, 'config.json');

async function testConnection(provider: ProviderConfig, apiKey: string): Promise<boolean> {
  try {
    print('  正在测试连接...', 'yellow');

    const testUrl = `${provider.defaultBaseURL}${provider.testEndpoint}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
    };

    if (provider.name === 'Anthropic') {
      headers['anthropic-version'] = '2023-06-01';
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(testUrl, {
      method: provider.name === 'Anthropic' ? 'POST' : 'GET',
      headers,
      signal: AbortSignal.timeout(10000),
      body:
        provider.name === 'Anthropic'
          ? JSON.stringify({
              model: 'claude-3-haiku-20240307',
              max_tokens: 10,
              messages: [{ role: 'user', content: 'test' }],
            })
          : undefined,
    });

    if (response.status === 401) {
      print('  ✗ API Key 无效', 'red');
      return false;
    }

    if (response.status === 429) {
      print('  ⚠ 速率限制，但 API Key 有效', 'yellow');
      return true;
    }

    if (response.ok || response.status === 400) {
      // 400 可能是测试请求格式问题，但说明认证通过
      print('  ✓ 连接成功！', 'green');
      return true;
    }

    print(`  ✗ 连接失败 (${response.status})`, 'red');
    return false;
  } catch (err) {
    const error = err as Error;
    if (error.message.includes('timeout')) {
      print('  ✗ 连接超时，请检查网络', 'red');
    } else {
      print(`  ✗ 连接错误: ${error.message}`, 'red');
    }
    return false;
  }
}

async function saveConfig(provider: string, apiKey: string, baseURL: string): Promise<void> {
  const config = {
    provider,
    apiKey,
    baseURL,
    model: provider === 'deepseek' ? 'deepseek-reasoner' : provider === 'openai' ? 'gpt-4' : 'claude-sonnet-4-20250514',
    maxTokens: 8192,
    temperature: 0.7,
    configuredAt: new Date().toISOString(),
  };

  await mkdir(configDir, { recursive: true });
  await writeFile(configFile, JSON.stringify(config, null, 2));
  print(`  ✓ 配置已保存到: ${configFile}`, 'green');
}

async function main(): Promise<void> {
  const rl = createInterface({ input, output });

  try {
    printHeader('🎉 欢迎使用 CodeYang！');

    print('CodeYang 是一个强大的 AI Agent 框架，帮助你自动化开发任务。', 'cyan');
    print('让我们开始配置...', 'cyan');

    // 检查是否已配置
    if (existsSync(configFile)) {
      console.log();
      print('⚠️  检测到已有配置文件', 'yellow');
      const overwrite = await rl.question('是否覆盖现有配置？(y/N): ');
      if (overwrite.toLowerCase() !== 'y') {
        print('已取消配置。', 'yellow');
        rl.close();
        return;
      }
    }

    // 选择提供商
    printHeader('步骤 1: 选择 LLM 提供商');
    print('1) DeepSeek  (推荐 - 性价比高)', 'cyan');
    print('2) OpenAI    (强大但昂贵)', 'cyan');
    print('3) Anthropic (Claude 系列)', 'cyan');
    console.log();

    let providerChoice = '';
    while (!['1', '2', '3'].includes(providerChoice)) {
      providerChoice = await rl.question('请选择 (1-3): ');
    }

    const providerMap: Record<string, string> = {
      '1': 'deepseek',
      '2': 'openai',
      '3': 'anthropic',
    };
    const selectedProvider = providerMap[providerChoice];
    const provider = providers[selectedProvider];

    // 获取 API Key
    printHeader('步骤 2: 获取 API Key');
    print(`如何获取 ${provider.name} API Key:`, 'cyan');
    print(provider.instructions, 'yellow');
    console.log();

    let apiKey = '';
    let isValid = false;

    while (!isValid) {
      apiKey = await rl.question(`请输入你的 API Key (${provider.apiKeyExample}): `);
      apiKey = apiKey.trim();

      if (!apiKey) {
        print('  ✗ API Key 不能为空', 'red');
        continue;
      }

      if (!provider.apiKeyPattern.test(apiKey)) {
        print(`  ✗ API Key 格式不正确，应该以 ${provider.apiKeyExample.split('-')[0]} 开头`, 'red');
        const retry = await rl.question('重新输入？(Y/n): ');
        if (retry.toLowerCase() === 'n') break;
        continue;
      }

      // 测试连接
      printHeader('步骤 3: 测试连接');
      isValid = await testConnection(provider, apiKey);

      if (!isValid) {
        const retry = await rl.question('重新输入 API Key？(Y/n): ');
        if (retry.toLowerCase() === 'n') break;
      }
    }

    if (!isValid) {
      print('配置未完成。你可以稍后运行 codeyang setup 重新配置。', 'yellow');
      rl.close();
      return;
    }

    // 保存配置
    printHeader('步骤 4: 保存配置');
    await saveConfig(selectedProvider, apiKey, provider.defaultBaseURL);

    // 完成
    printHeader('✨ 配置完成！');
    print('你现在可以使用以下命令:', 'cyan');
    console.log();
    print('  codeyang                 # 启动交互式会话', 'green');
    print('  codeyang "任务描述"      # 执行单个任务', 'green');
    print('  codeyang --help          # 查看帮助', 'green');
    console.log();
    print('祝你使用愉快！🚀', 'bright');
    console.log();
  } catch (err) {
    const error = err as Error;
    print(`\n错误: ${error.message}`, 'red');
    process.exit(1);
  } finally {
    rl.close();
  }
}

main().catch(console.error);
