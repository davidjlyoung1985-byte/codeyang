# CodeYang VS Code Extension - DeepSeek Anthropic API

AI coding agent powered by DeepSeek's Anthropic-compatible API. Chat with CodeYang inside VS Code with full tool-using capabilities.

## Features

- 🤖 **AI Coding Assistant** - Natural language coding, debugging, and code explanation
- 🔧 **64+ Built-in Tools** - File operations, code search, shell commands, git operations, and more
- ⚡ **Real-time Streaming** - See responses as they generate
- 🔄 **DeepSeek Anthropic API** - Use DeepSeek models with Anthropic SDK
- 💡 **Auto Model Mapping** - Claude model names automatically map to DeepSeek models

## Quick Start

### 1. Get DeepSeek API Key

Visit [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys) to get your API key.

### 2. Install Extension

1. Copy the `vscode-extension` folder
2. Open VS Code
3. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
4. Run: `Developer: Install Extension from Location...`
5. Select the `vscode-extension` folder

### 3. Start Chat

- Press `Ctrl+Shift+Y` (or `Cmd+Shift+Y` on Mac)
- Or: Command Palette → "CodeYang: Start Chat"
- Enter your API settings in the setup panel

## Configuration

### Default Settings (DeepSeek Anthropic API)

```json
{
  "codeyang.apiBaseUrl": "https://api.deepseek.com/anthropic",
  "codeyang.model": "deepseek-v4-pro",
  "codeyang.apiKey": "sk-your-key-here"
}
```

### Model Options

- **deepseek-v4-pro** - Best quality, thinking mode enabled
- **deepseek-v4-flash** - Fast responses, cost-effective
- **claude-opus-4-*** - Auto-maps to deepseek-v4-pro
- **claude-sonnet-4-*** - Auto-maps to deepseek-v4-flash
- **claude-haiku-*** - Auto-maps to deepseek-v4-flash

### Alternative: OpenAI-Compatible API

If you prefer the OpenAI-compatible format:

```json
{
  "codeyang.apiBaseUrl": "https://api.deepseek.com/v1",
  "codeyang.model": "deepseek-chat"
}
```

### Alternative: Official Anthropic API

```json
{
  "codeyang.apiBaseUrl": "https://api.anthropic.com",
  "codeyang.model": "claude-sonnet-4-20250514",
  "codeyang.apiKey": "sk-ant-your-key-here"
}
```

## Why DeepSeek Anthropic API?

DeepSeek provides an Anthropic-compatible API endpoint that:

1. **Uses Anthropic SDK** - Full compatibility with `@anthropic-ai/sdk`
2. **Model Mapping** - Claude model names automatically map to DeepSeek models
3. **Tool Use** - Native support for function calling with Anthropic's tool format
4. **Streaming** - Real-time response streaming
5. **Cost Effective** - Much cheaper than official Claude API

### Base URL Comparison

| Provider | Base URL | SDK |
|----------|----------|-----|
| DeepSeek (Anthropic API) | `https://api.deepseek.com/anthropic` | `@anthropic-ai/sdk` |
| DeepSeek (OpenAI API) | `https://api.deepseek.com/v1` | `openai` |
| Official Anthropic | `https://api.anthropic.com` | `@anthropic-ai/sdk` |

## Available Tools

### File Operations
- **Read** - Read files or list directories
- **Write** - Create or overwrite files
- **Edit** - Surgical text replacement
- **Glob** - Find files by pattern
- **Grep** - Search file contents

### Code Tools
- **Search** - Search by name and content
- **ImageInfo** - Read image metadata
- **ImageToBase64** - Encode images

### Execution
- **Bash** - Run shell commands (PowerShell on Windows)

### Web
- **WebFetch** - Fetch web content

### Project Management
- **TodoWrite** - Task tracking
- **Question** - Ask user for clarification

## Usage Examples

### Read and Explain Code
```
Can you read src/index.ts and explain what it does?
```

### Find and Fix Bugs
```
Search for any TODO comments in the codebase and list them
```

### Refactor Code
```
Read utils/helper.ts and refactor the duplicate code into a shared function
```

### Run Commands
```
Run npm test and analyze the output
```

### Multi-step Tasks
```
1. Find all TypeScript files with console.log statements
2. Remove them
3. Run the linter to verify
```

## Configuration File

Settings are saved to `~/.codeyang/config.json`:

```json
{
  "apiKey": "sk-your-key-here",
  "apiBaseUrl": "https://api.deepseek.com/anthropic",
  "model": "deepseek-v4-pro"
}
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+Y` / `Cmd+Shift+Y` | Start/Show Chat |
| `Enter` | Send message |
| `Shift+Enter` | New line in input |

## Troubleshooting

### "Invalid API key" Error
- Verify your API key at [platform.deepseek.com](https://platform.deepseek.com)
- Make sure there are no extra spaces
- Check that your account has sufficient balance

### "Network error"
- Verify internet connection
- Check if `https://api.deepseek.com` is accessible
- Try pinging the API: `curl https://api.deepseek.com/anthropic`

### "Model not found"
- Use `deepseek-v4-pro` or `deepseek-v4-flash`
- Claude model names (e.g., `claude-opus-4-20250514`) are auto-mapped

### Extension Not Loading
1. Check VS Code version (requires 1.85.0+)
2. Reload window: `Ctrl+Shift+P` → "Developer: Reload Window"
3. Check Output panel for errors: View → Output → CodeYang

## Development

### Build Extension
```bash
cd vscode-extension
npm install
# Extension uses pre-built tools from ../dist/cjs/tools.cjs
```

### Package Extension
```bash
npm install -g @vscode/vsce
vsce package
# Produces codeyang-vscode-x.x.x.vsix
```

### Install from VSIX
```bash
code --install-extension codeyang-vscode-x.x.x.vsix
```

## Links

- DeepSeek Platform: https://platform.deepseek.com
- Anthropic API Docs: https://docs.anthropic.com
- DeepSeek Anthropic API Docs: https://api-docs.deepseek.com/guides/anthropic_api

## License

MIT
