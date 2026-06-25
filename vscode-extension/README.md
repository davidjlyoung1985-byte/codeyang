# CodeYang VS Code Extension

AI-powered code completion and refactoring for VS Code.

## Features

- **Inline Code Completion** - Real-time suggestions as you type
- **Smart Refactoring** - Extract functions, rename variables, optimize code
- **Test Generation** - Automatically generate unit tests
- **Powered by Claude** - Uses Claude 3.5 Sonnet for high-quality completions

## Installation

### From Source

```bash
cd vscode-extension
npm install
npm run compile
npm run package
code --install-extension codeyang-vscode-0.1.0.vsix
```

### Configuration

1. Open VS Code Settings
2. Search for "CodeYang"
3. Set your Claude API key in `codeyang.apiKey`

Or set environment variable:
```bash
export ANTHROPIC_API_KEY=your-key-here
```

## Usage

### Inline Completion

Just start typing - completions appear automatically after 300ms delay.

**Keyboard Shortcuts:**
- `Ctrl+Shift+Space` - Manually trigger completion
- `Tab` - Accept completion
- `Esc` - Dismiss completion

### Refactoring

1. Select code
2. Press `Ctrl+Shift+P`
3. Run "CodeYang: Refactor Selection"
4. Choose refactoring action

### Test Generation

1. Open a source file
2. Press `Ctrl+Shift+P`
3. Run "CodeYang: Generate Tests"
4. Tests will be created in `*.test.*` file

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `codeyang.apiKey` | `""` | Claude API key |
| `codeyang.enableInlineCompletion` | `true` | Enable inline completion |
| `codeyang.completionDelay` | `300` | Delay before triggering (ms) |
| `codeyang.maxCompletionLength` | `500` | Max completion length |

## Performance

- **Response time:** ~500-1000ms per completion
- **Caching:** Results cached for faster repeated requests
- **Debouncing:** Prevents excessive API calls

## License

MIT
