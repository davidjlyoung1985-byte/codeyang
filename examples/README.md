# CodeYang Examples

Real-world usage scenarios demonstrating CodeYang's capabilities.

## Getting Started

Each example includes:
- 📝 Step-by-step instructions
- 🎯 Learning objectives
- 💡 Best practices
- ⚠️ Common pitfalls

## Examples

### 1. [Basic File Operations](./01-basic-file-ops/)

**Learn:** Core file manipulation tools

**Covers:**
- Creating project structures
- Reading and analyzing files
- Automated find-replace editing
- Cross-file searching

**Tools:** `Write`, `Read`, `Edit`, `Glob`, `Grep`

**Time:** ~10 minutes

---

### 2. [Git Workflow Automation](./02-git-workflow/)

**Learn:** Automate common Git tasks

**Covers:**
- Branch creation and switching
- Automated commits with proper messages
- Merge conflict resolution
- Git history exploration
- Real-world development cycles

**Tools:** `GitBranch`, `GitCommit`, `GitDiff`, `GitLog`, `GitStatus`

**Time:** ~15 minutes

---

### 3. [Code Analysis & Refactoring](./03-code-analysis/)

**Learn:** Analyze and improve code quality

**Covers:**
- Code quality analysis (complexity, bugs, smells)
- Duplicate code detection
- Automated refactoring (rename, extract, organize)
- Security vulnerability scanning
- Performance optimization
- Legacy code modernization

**Tools:** `CodeAnalysis`, `RefactorRename`, `RefactorExtract`, `RefactorOrganizeImports`

**Time:** ~20 minutes

---

## Quick Start

```bash
# Navigate to an example
cd examples/01-basic-file-ops

# Start CodeYang
codeyang

# Follow the instructions in README.md
```

## Prerequisites

- CodeYang installed (`npm install -g codeyang`)
- Basic command-line knowledge
- Git installed (for example 2)

## Tips for Learning

1. **Follow in order** — Examples build on each other
2. **Type naturally** — Describe what you want, don't memorize commands
3. **Experiment** — Try variations of the examples
4. **Review output** — Understand what tools CodeYang uses

## Common Patterns

### Declarative Requests

❌ **Don't:** "Use the Write tool to create index.ts with content X"
✅ **Do:** "Create index.ts as a TypeScript entry point"

### Natural Language

❌ **Don't:** "Execute Grep with pattern TODO"
✅ **Do:** "Find all TODO comments"

### Multi-step Tasks

❌ **Don't:** "Run tool A, then tool B, then tool C"
✅ **Do:** "Create a user profile page with component, tests, and routing"

## Troubleshooting

### CodeYang doesn't understand my request

- Be more specific about what you want
- Break complex tasks into smaller steps
- Provide file paths or patterns

### Changes aren't applied

- Check file permissions
- Verify you're in the correct directory
- Review error messages from tools

### Git operations fail

- Ensure Git is initialized (`git init`)
- Configure user name and email
- Check for uncommitted changes

## Next Steps

After completing the examples:

1. **Read the docs:**
   - [API Reference](../docs/api-reference.md) — Complete tool list
   - [Architecture](../docs/architecture.md) — How CodeYang works
   - [Contributing](../CONTRIBUTING.md) — Add your own tools

2. **Try on real projects:**
   - Use CodeYang in your daily workflow
   - Automate repetitive tasks
   - Explore advanced features

3. **Join the community:**
   - Share your use cases
   - Report bugs or request features
   - Contribute examples

## Additional Resources

- [Documentation](../docs/) — Full documentation
- [GitHub Issues](https://github.com/davidjlyoung1985-byte/codeyang/issues) — Bug reports
- [Discussions](https://github.com/davidjlyoung1985-byte/codeyang/discussions) — Q&A

## Contributing Examples

Have a cool use case? Contribute it!

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

---

**Happy coding with CodeYang!** 🚀
