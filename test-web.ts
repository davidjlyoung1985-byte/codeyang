import { Agent } from './src/agent/Agent.js';
import { config, loadLocalConfig, setSessionApiKey } from './src/agent/config.js';

async function main() {
  await loadLocalConfig();
  const apiKey = config.apiKey || process.env['CODEYANG_API_KEY'] || process.env['DEEPSEEK_API_KEY'] || '';
  if (!apiKey) {
    console.error('No API key found');
    process.exit(1);
  }
  setSessionApiKey(apiKey);
  process.env['CODEYANG_BASE_URL'] = 'http://127.0.0.1:15721';

  console.log('URL:', config.baseURL);
  console.log('Key:', config.apiKey ? 'YES' : 'NO');
  console.log('Model:', config.model);

  const agent = new Agent();

  let hasText = false;
  agent.setCallbacks({
    onAgentDelta(text) {
      hasText = true;
      console.log('DELTA:', JSON.stringify(text));
    },
    onAgentText(text) {
      hasText = true;
      console.log('TEXT:', JSON.stringify(text));
    },
    onToolStart(name, args) {
      console.log('TOOL:', name, JSON.stringify(args).slice(0, 100));
    },
    onToolResult(name, out) {
      console.log('RESULT:', name, JSON.stringify(out).slice(0, 100));
    },
    onError(err) {
      console.log('ERROR:', err);
    },
  });

  console.log('\n--- Running agent ---');
  await agent.run('回复一句话：你好');
  console.log('--- Done ---');
  if (!hasText) console.log('WARNING: No text was generated!');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
