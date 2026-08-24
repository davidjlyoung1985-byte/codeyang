# Example 4: VS Code Extension Integration

Learn how CodeYang integrates with VS Code as an extension.

## What You'll Learn

- VS Code extension architecture
- Webview communication
- Editor integration (selections, diagnostics)
- Extension activation events

## Installation

The VS Code extension is already included in this project:

```bash
cd vscode-ext
npm install
npm run compile
```

Then press F5 in VS Code to launch the Extension Development Host.

## Architecture

```
┌─────────────────────────────────────┐
│   VS Code Extension Host            │
│                                     │
│  ┌──────────────────────────────┐  │
│  │  Extension (TypeScript)       │  │
│  │  - Commands                   │  │
│  │  - Webview Provider          │  │
│  │  - Editor Integration        │  │
│  └──────────┬───────────────────┘  │
│             │                       │
│  ┌──────────▼───────────────────┐  │
│  │  Webview (HTML/CSS/JS)       │  │
│  │  - Chat UI                   │  │
│  │  - Message handling          │  │
│  └──────────┬───────────────────┘  │
│             │                       │
└─────────────┼───────────────────────┘
              │
    ┌─────────▼──────────┐
    │  Agent Backend     │
    │  - Tool execution  │
    │  - File operations │
    │  - LLM streaming   │
    └────────────────────┘
```

## Key Features

### 1. Sidebar Chat Panel

```typescript
// src/vscode-ext/extension.ts
export function activate(context: vscode.ExtensionContext) {
  const provider = new CodeYangViewProvider(context.extensionUri);
  
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'codeyang.chatView',
      provider
    )
  );
}
```

### 2. Editor Context Integration

```typescript
// Get current file selection
const editor = vscode.window.activeTextEditor;
if (editor) {
  const selection = editor.document.getText(editor.selection);
  // Send to agent with context
}
```

### 3. Inline Diagnostics

```typescript
// Show agent suggestions as diagnostics
const diagnostics = new vscode.DiagnosticCollection();
diagnostics.set(document.uri, [
  new vscode.Diagnostic(
    range,
    'Agent suggestion: Consider extracting this to a function',
    vscode.DiagnosticSeverity.Information
  ),
]);
```

### 4. Code Actions

```typescript
// Register quick fix provider
vscode.languages.registerCodeActionsProvider('typescript', {
  provideCodeActions(document, range) {
    const fix = new vscode.CodeAction(
      'Ask CodeYang to fix this',
      vscode.CodeActionKind.QuickFix
    );
    fix.command = {
      command: 'codeyang.fixIssue',
      title: 'Fix with CodeYang',
      arguments: [document, range],
    };
    return [fix];
  },
});
```

## Communication Flow

```
User types in webview
  ↓
postMessage to extension
  ↓
Extension receives message
  ↓
Call agent backend
  ↓
Stream response chunks
  ↓
postMessage back to webview
  ↓
Update UI incrementally
```

## Extension Commands

- `codeyang.openChat` - Open chat panel
- `codeyang.askAboutSelection` - Send selection to agent
- `codeyang.explainError` - Explain the error at cursor
- `codeyang.generateTests` - Generate tests for current file
- `codeyang.refactor` - Suggest refactorings

## Configuration

```json
// .vscode/settings.json
{
  "codeyang.apiKey": "your-key",
  "codeyang.model": "claude-sonnet-4-20250514",
  "codeyang.maxTokens": 4096,
  "codeyang.autoSuggest": true
}
```

## Packaging

```bash
# Install vsce
npm install -g @vscode/vsce

# Package the extension
cd vscode-ext
vsce package

# Install .vsix file
code --install-extension codeyang-0.7.1.vsix
```

## Testing

```bash
# Run extension tests
npm run test

# Manual testing
# 1. Press F5 to launch Extension Development Host
# 2. Open a project
# 3. Click CodeYang icon in sidebar
# 4. Type a message
```

## Key Concepts

**Webview Security**: Webviews run in isolated context. Use `postMessage` for communication.

**Extension Activation**: Extensions activate on specific events (`onView:codeyang.chatView`, `onCommand:codeyang.*`).

**Resource URIs**: Use `asWebviewUri()` to serve static files to webview.

**State Persistence**: Use `context.globalState` or `context.workspaceState` for settings.

## Debugging

```typescript
// Enable extension development logging
const output = vscode.window.createOutputChannel('CodeYang');
output.appendLine('Debug message');
output.show();
```

## Next Steps

- See [src/vscode-ext/](../../src/vscode-ext/) for full implementation
- Read [VS Code Extension API](https://code.visualstudio.com/api)
- Check [Webview UI Toolkit](https://github.com/microsoft/vscode-webview-ui-toolkit)

## Common Issues

**Webview not loading**: Check `extensionUri` is correct and CSP allows scripts

**Commands not found**: Ensure `package.json` declares all commands in `contributes.commands`

**Slow activation**: Move heavy initialization to background, activate lazily
