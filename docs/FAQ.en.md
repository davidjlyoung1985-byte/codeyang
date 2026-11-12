# Frequently Asked Questions (FAQ)

**Version**: 1.0  
**Last Updated**: 2026-11-12

---

## 📋 Table of Contents

- [General Questions](#general-questions)
- [Installation & Configuration](#installation--configuration)
- [Features & Usage](#features--usage)
- [Performance & Limitations](#performance--limitations)
- [Troubleshooting](#troubleshooting)
- [Security & Privacy](#security--privacy)
- [Advanced Topics](#advanced-topics)

---

## General Questions

### Q1: What is CodeYang?

**A**: CodeYang is an AI-powered coding assistant that helps you:
- Write and refactor code
- Run commands and manage Git
- Review code quality
- Generate tests and documentation
- Learn from errors

It uses Large Language Models (LLM) to understand natural language instructions and execute development tasks.

### Q2: What's the difference between CodeYang and GitHub Copilot?

**A**: Key differences:

| Feature | CodeYang | GitHub Copilot |
|---------|----------|----------------|
| Scope | Full codebase operations | Primarily code completion |
| Tool Access | Filesystem, Git, CLI | Limited |
| Autonomy | Highly autonomous, multi-step tasks | Passive completion |
| Learning | Learns from errors (Reflexion) | No |
| Qt Support | Specialized Qt/QML tools | General support |

### Q3: Is CodeYang free?

**A**: CodeYang itself is open-source (MIT License), but you need:
- An LLM API key (e.g., DeepSeek, OpenAI, Claude)
- API usage incurs costs

### Q4: Which LLMs are supported?

**A**: CodeYang supports any OpenAI-compatible LLM:
- **DeepSeek** (default, cost-effective)
- **OpenAI** GPT-4/GPT-3.5
- **Claude** (via adapter)
- **Local models** (e.g., Ollama)

### Q5: What's the current project status?

**A**: 
- **Version**: v1.0.0 (Stable)
- **Quality Score**: 91.5/100
- **Test Coverage**: 75.9% (2535+ tests)
- **Status**: Production-ready for personal and small team use
- **CI/CD**: Fully automated with security scanning

---

## Installation & Configuration

### Q6: How do I install CodeYang?

**A**: 
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

See [QUICK_START.md](QUICK_START.en.md) for detailed guide.

### Q7: What are the system requirements?

**A**:
- **Node.js**: >= 18.0.0
- **npm**: >= 8.0.0
- **OS**: Windows, macOS, Linux
- **RAM**: 2GB+ recommended
- **Disk**: 500MB+ for installation

### Q8: How do I configure the API key?

**A**: Three methods:

**1. Environment variable** (recommended):
```bash
export CODEYANG_API_KEY=your-key-here
```

**2. Configuration file** (`~/.codeyang/config.json`):
```json
{
  "apiKey": "your-key-here",
  "model": "deepseek-chat"
}
```

**3. Command line**:
```bash
npm start -- --api-key your-key-here
```

### Q9: Can I use multiple API keys?

**A**: Yes! Configure different profiles:
```json
{
  "profiles": {
    "default": {
      "apiKey": "deepseek-key",
      "model": "deepseek-chat"
    },
    "openai": {
      "apiKey": "openai-key",
      "model": "gpt-4"
    }
  }
}
```

Switch profiles: `npm start -- --profile openai`

---

## Features & Usage

### Q10: What can CodeYang do?

**A**: CodeYang has 60+ built-in tools:

**File Operations**:
- Read, Write, Edit files
- Search (Grep, Glob)
- Code analysis

**Git Operations**:
- Status, Commit, Push, Pull
- Branch management
- Merge, Rebase

**Command Execution**:
- Bash commands
- npm/yarn scripts
- Build tools

**Advanced**:
- MCP server integration
- Sandbox isolation
- Memory system

### Q11: How do I use MCP (Model Context Protocol)?

**A**: 
1. Install MCP server (e.g., file server)
2. Configure in `mcp-config.json`
3. CodeYang auto-loads MCP tools

Example:
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  }
}
```

### Q12: Can CodeYang work with VS Code?

**A**: Yes! Install the VS Code extension:
```bash
cd vscode-extension
npm install
code --install-extension .
```

Features:
- In-editor chat
- Code actions
- Inline completions

---

## Performance & Limitations

### Q13: How fast is CodeYang?

**A**: Performance metrics:
- **Tool response**: < 1s (average)
- **LLM streaming**: Real-time
- **File operations**: < 100ms
- **Git operations**: < 200ms

### Q14: What are the limitations?

**A**: Current limitations:
- **Context window**: Limited by LLM (typically 32K-128K tokens)
- **File size**: Large files (>10MB) may be slow
- **Concurrent operations**: Limited to prevent rate limits
- **Network isolation**: Requires admin on Windows/macOS

### Q15: How much does it cost to run?

**A**: Cost depends on LLM provider:

**DeepSeek** (recommended):
- Input: $0.14 / 1M tokens
- Output: $0.28 / 1M tokens
- Typical session: $0.01 - $0.10

**OpenAI GPT-4**:
- Input: $2.50 / 1M tokens
- Output: $10.00 / 1M tokens
- Typical session: $0.50 - $5.00

---

## Troubleshooting

### Q16: CodeYang hangs or times out

**A**: Solutions:
1. Increase timeout:
   ```bash
   CODEYANG_STREAM_TIMEOUT=600000 npm start
   ```

2. Check network:
   ```bash
   curl https://api.deepseek.com/v1/models
   ```

3. Enable debug:
   ```bash
   CODEYANG_DEBUG=true npm start
   ```

### Q17: Tests are failing

**A**: Common causes:
1. **Parallel test flakiness**: Run sequentially
   ```bash
   npm test -- --pool=threads --maxWorkers=2
   ```

2. **Git operations**: Check git configuration
   ```bash
   git config --list
   ```

3. **Permissions**: Check file/directory permissions

### Q18: How do I report bugs?

**A**:
1. Check existing issues: https://github.com/davidjlyoung1985-byte/codeyang/issues
2. Create new issue with:
   - CodeYang version
   - Node.js version
   - Error logs
   - Steps to reproduce

---

## Security & Privacy

### Q19: Is my code secure?

**A**: CodeYang implements multiple security layers:
- **Sandbox isolation**: Risky commands run in isolated processes
- **Permission system**: User approval for sensitive operations
- **SSRF protection**: Blocks malicious network requests
- **Input validation**: Sanitizes all user input
- **No data collection**: All data stays local

### Q20: Where is my data stored?

**A**: All data is stored locally:
- **Sessions**: `~/.codeyang/sessions/`
- **Memory**: `~/.codeyang/memory/`
- **Config**: `~/.codeyang/config.json`
- **Logs**: `~/.codeyang/logs/`

No data is sent to external servers except LLM API calls.

### Q21: Can I use CodeYang offline?

**A**: Partially:
- **Local tools work**: File operations, Git, Bash
- **LLM required**: AI features need internet connection
- **Local LLM support**: Use Ollama or similar for offline AI

---

## Advanced Topics

### Q22: How do I create custom tools?

**A**: Create a tool definition:
```typescript
// src/tools/MyTool.ts
export const MyTool = {
  name: 'my_tool',
  description: 'Does something useful',
  input_schema: {
    type: 'object',
    properties: {
      param: { type: 'string' }
    }
  },
  execute: async (params) => {
    // Tool logic
    return 'Result';
  }
};
```

Register in `src/tools/index.ts`.

### Q23: Can I integrate CodeYang into my CI/CD?

**A**: Yes! Use as CLI tool:
```bash
# In GitHub Actions
- name: Run CodeYang
  run: |
    echo "Review this PR" | npx codeyang --non-interactive
```

See [.github/workflows/](../.github/workflows/) for examples.

### Q24: How do I contribute?

**A**: 
1. Read [CONTRIBUTING.md](../CONTRIBUTING.md)
2. Fork repository
3. Create feature branch
4. Add tests
5. Submit PR

We welcome:
- Bug fixes
- New tools
- Documentation
- Test improvements

---

## 📞 Still Have Questions?

- **GitHub Issues**: https://github.com/davidjlyoung1985-byte/codeyang/issues
- **Documentation**: [README.md](../README.md)
- **User Guide**: [USER_GUIDE.md](USER_GUIDE.en.md)
- **Discord**: [Join our community](#) (coming soon)

---

**Last Updated**: 2026-11-12  
**Version**: 1.0.0
