# User Guide

**Version**: v1.0.0  
**Last Updated**: 2026-11-12  
**Target Audience**: Developers, Teams

---

## 📚 Table of Contents

1. [Getting Started](#getting-started)
2. [Basic Usage](#basic-usage)
3. [Advanced Features](#advanced-features)
4. [Best Practices](#best-practices)
5. [Common Workflows](#common-workflows)
6. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Installation

```bash
# Clone repository
git clone https://github.com/davidjlyoung1985-byte/codeyang.git
cd codeyang

# Install dependencies
npm install

# Build
npm run build

# Start
npm start
```

### Configuration

Create `.env` file or edit `~/.codeyang/config.json`:

```json
{
  "apiKey": "your-api-key",
  "model": "deepseek-chat",
  "baseURL": "https://api.deepseek.com/v1",
  "maxTokens": 32000
}
```

### First Run

```bash
# Start interactive session
npm start

# Or with specific options
npm start -- --model gpt-4 --max-tokens 8000
```

---

## Basic Usage

### 1. Interactive Chat

Start a conversation with CodeYang:

```
You: Help me create a simple HTTP server in TypeScript
```

CodeYang will:
1. Analyze your request
2. Choose appropriate tools
3. Write the code
4. Verify the result

### 2. File Operations

#### Read Files
```
You: Read src/index.ts and explain its purpose
You: Show me the package.json file
```

#### Edit Files
```
You: Add a new script "test:watch" to package.json
You: Refactor the login function to use async/await
```

#### Create Files
```
You: Create a new README.md with project description
You: Generate a TypeScript config file
```

### 3. Git Operations

```
You: Check git status
You: Commit all changes with message "feat: add new feature"
You: Create a new branch feature/authentication
You: Push changes to remote
```

### 4. Command Execution

```
You: Run npm test
You: Check the Node.js version
You: List all running processes
```

---

## Advanced Features

### 1. MCP (Model Context Protocol)

Connect external tool servers for unlimited extensibility:

```json
// mcp-config.json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    },
    "database": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"]
    }
  }
}
```

### 2. Memory System

CodeYang learns from interactions:

```
You: Remember that I prefer TypeScript over JavaScript
You: Recall my coding style preferences
```

View memory:
```bash
cat ~/.codeyang/memory/summary.md
```

### 3. Session Management

Save and resume conversations:

```
# Save current session
/save my-feature-session

# List sessions
/sessions

# Load session
/load my-feature-session
```

### 4. Custom Tools

Create custom tools for your workflow:

```typescript
// src/tools/MyCustomTool.ts
export const MyCustomTool = {
  name: 'custom_deploy',
  description: 'Deploy application to staging',
  input_schema: {
    type: 'object',
    properties: {
      env: { type: 'string', enum: ['staging', 'production'] }
    }
  },
  execute: async (params) => {
    // Deployment logic
    return `Deployed to ${params.env}`;
  }
};
```

---

## Best Practices

### 1. Clear Instructions

**Good**:
```
You: Create a user authentication module with JWT tokens, 
     including login, logout, and token refresh endpoints
```

**Not ideal**:
```
You: Make auth stuff
```

### 2. Break Down Complex Tasks

Instead of:
```
You: Build a complete e-commerce application
```

Try:
```
You: Create a product catalog API with CRUD operations
You: Add shopping cart functionality
You: Implement checkout process
```

### 3. Verify Results

After CodeYang makes changes:
```
You: Run the tests to verify the changes
You: Show me the git diff
```

### 4. Use Context

Provide context for better results:
```
You: In the user service module, add email validation 
     using the same pattern as in the auth module
```

### 5. Leverage Memory

Teach CodeYang your preferences:
```
You: I prefer functional components over class components in React
You: Always add JSDoc comments for public functions
You: Use 2 spaces for indentation
```

---

## Common Workflows

### Workflow 1: Feature Development

```
You: Create a new branch feature/user-profile
You: Create a UserProfile component in React
You: Add tests for the UserProfile component
You: Run tests
You: Commit with message "feat: add user profile component"
You: Push to remote
```

### Workflow 2: Bug Fix

```
You: Check git status
You: Read src/auth/login.ts
You: The login function has a bug - it doesn't handle network errors
You: Fix the bug by adding try-catch and proper error handling
You: Run tests
You: Commit with message "fix: handle network errors in login"
```

### Workflow 3: Code Review

```
You: Review the latest changes in git diff
You: Check for potential security issues
You: Suggest improvements for error handling
You: Add comments to the code
```

### Workflow 4: Refactoring

```
You: Analyze src/utils/helpers.ts for refactoring opportunities
You: Extract duplicate code into reusable functions
You: Add unit tests for the new functions
You: Run tests to ensure nothing broke
```

### Workflow 5: Documentation

```
You: Generate API documentation for all endpoints
You: Create a user guide based on the code structure
You: Add JSDoc comments to all public functions
```

---

## Troubleshooting

### Issue 1: CodeYang Doesn't Understand

**Problem**: Vague or ambiguous instructions

**Solution**: Be more specific
```
Instead of: "Fix the bug"
Try: "Fix the null pointer exception in UserService.getUser() 
      when the user ID doesn't exist"
```

### Issue 2: Wrong File Modified

**Problem**: CodeYang modifies the wrong file

**Solution**: Specify exact file paths
```
You: Edit src/components/Header.tsx (not src/components/Footer.tsx)
     to add a logout button
```

### Issue 3: Tests Failing

**Problem**: Changes break existing tests

**Solution**: Ask CodeYang to fix
```
You: The tests are failing. Run npm test and fix the failing tests
```

### Issue 4: Slow Response

**Problem**: CodeYang is slow to respond

**Solution**: 
- Use smaller context windows
- Break down large tasks
- Check network connection

### Issue 5: API Rate Limits

**Problem**: Too many API calls

**Solution**:
```bash
# Add delays between requests
CODEYANG_REQUEST_DELAY=1000 npm start

# Use cheaper model
npm start -- --model deepseek-chat
```

---

## Keyboard Shortcuts

### In Interactive Mode

| Shortcut | Action |
|----------|--------|
| `Ctrl+C` | Cancel current operation |
| `Ctrl+D` | Exit CodeYang |
| `↑` / `↓` | Navigate command history |
| `Tab` | Auto-complete commands |

### Built-in Commands

| Command | Description |
|---------|-------------|
| `/help` | Show help message |
| `/tools` | List available tools |
| `/sessions` | View saved sessions |
| `/save <name>` | Save current session |
| `/load <name>` | Load saved session |
| `/clear` | Clear conversation |
| `/model <name>` | Switch LLM model |
| `/exit` | Quit CodeYang |

---

## Tips & Tricks

### 1. Use Aliases

Create shell aliases for common tasks:
```bash
# In ~/.bashrc or ~/.zshrc
alias cy='npm start'
alias cytest='npm start -- --non-interactive < test-prompt.txt'
```

### 2. Batch Processing

Process multiple files:
```
You: For each .ts file in src/, add a header comment with the filename
```

### 3. Template Generation

Create reusable templates:
```
You: Create a React component template with TypeScript, 
     tests, and Storybook story
You: Save this as a template for future components
```

### 4. Integration with VS Code

Use the VS Code extension for seamless integration:
1. Install extension
2. Use `Cmd+Shift+P` → "CodeYang: Chat"
3. Select code and ask questions

### 5. CI/CD Integration

Use CodeYang in CI pipelines:
```yaml
# .github/workflows/code-review.yml
- name: AI Code Review
  run: |
    echo "Review this PR for security issues" | npx codeyang --non-interactive
```

---

## Performance Tips

### 1. Optimize Context

```
You: Only show the last 10 messages in context
You: Summarize the conversation so far
```

### 2. Use Appropriate Models

- **Fast tasks**: Use smaller models (gpt-3.5-turbo, deepseek-chat)
- **Complex tasks**: Use larger models (gpt-4, claude-3)

### 3. Parallel Operations

CodeYang can handle multiple tasks:
```
You: In parallel:
     1. Run tests
     2. Build the project
     3. Generate documentation
```

---

## Security Best Practices

### 1. API Key Management

- Never commit API keys to git
- Use environment variables
- Rotate keys regularly

### 2. Code Review

Always review generated code before:
- Committing to git
- Deploying to production
- Sharing with team

### 3. Sandbox Mode

Enable sandbox for risky operations:
```bash
CODEYANG_SANDBOX=true npm start
```

### 4. Permission System

Configure permissions in `~/.codeyang/permissions.json`:
```json
{
  "deny": [
    "rm -rf /",
    "sudo *",
    "chmod 777 *"
  ]
}
```

---

## 📞 Getting Help

- **Documentation**: [README.md](../README.md)
- **FAQ**: [FAQ.en.md](FAQ.en.md)
- **Issues**: https://github.com/davidjlyoung1985-byte/codeyang/issues
- **Examples**: [examples/](../examples/)

---

**Last Updated**: 2026-11-12  
**Version**: v1.0.0
