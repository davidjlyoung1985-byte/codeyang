# Security Policy

## Supported Versions

We provide security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.7.x   | :white_check_mark: |
| < 0.7   | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, report them via one of these channels:

1. **GitHub Security Advisories** (preferred)
   - Go to https://github.com/davidjlyoung1985-byte/codeyang/security/advisories
   - Click "New draft security advisory"

2. **Email** (if GitHub not available)
   - Send to: [your-security-email@example.com]
   - Subject: "[SECURITY] CodeYang Vulnerability Report"

### What to Include

Please provide:
- **Description**: What the vulnerability is
- **Impact**: What an attacker could do
- **Reproduction**: Step-by-step to reproduce
- **Environment**: OS, Node version, CodeYang version
- **Severity**: Your assessment (Critical/High/Medium/Low)
- **Suggested Fix**: If you have one

### Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Fix Timeline**: 
  - Critical: 7-14 days
  - High: 14-30 days
  - Medium: 30-60 days
  - Low: Next minor release

We'll keep you informed throughout the process.

## Security Measures

CodeYang implements multiple security layers:

### 1. Input Validation

**All tool inputs are validated:**
- JSON schema validation
- Type checking
- Path traversal prevention (`resolveSafePath`)
- URL scheme whitelist

**Example:**
```typescript
// Bad: User input directly passed to fs
await fs.readFile(userInput); // ❌ Path traversal risk

// Good: Validated path
const safePath = resolveSafePath(baseDir, userInput);
await fs.readFile(safePath); // ✅ Safe
```

### 2. Command Injection Prevention

**Shell commands are sanitized:**
- Deny list for dangerous commands (rm -rf, sudo, curl|sh)
- Permission system for user confirmation
- Argument escaping

**Example:**
```typescript
// BashTool blocks:
rm -rf /          // Denied
sudo apt install  // Denied
curl ... | sh     // Denied
```

### 3. SSRF Protection

**Network requests are validated:**
- Private IP ranges blocked (10.x, 192.168.x, 127.x, 169.254.x)
- DNS rebinding prevention
- Redirect validation
- URL scheme whitelist (http/https only)

**Blocked:**
```typescript
http://localhost:8080      // Loopback
http://192.168.1.1         // Private
http://10.0.0.1            // Private
http://169.254.169.254     // AWS metadata
file:///etc/passwd         // Local file
```

### 4. Code Execution Isolation

**Sandbox for untrusted code:**
- Process isolation (`child_process.fork`)
- Resource limits (CPU, memory, timeout)
- File system restrictions
- Network isolation (optional)

**Usage:**
```typescript
// High-risk commands run in sandbox
const sandbox = new Sandbox({ timeoutMs: 30_000 });
await sandbox.run('node', ['untrusted.js']);
```

### 5. Authentication & Authorization

**Gateway layer:**
- API key validation
- Rate limiting (30 burst, 10/sec refill)
- Audit logging
- Permission system (allow/ask/deny)

### 6. Secret Management

**Sensitive data protection:**
- API keys from environment variables (never hardcoded)
- Log sanitization (mask secrets in output)
- Git hooks prevent committing `.env` files

**Example:**
```typescript
// Bad: Hardcoded secret
const apiKey = 'sk-1234567890'; // ❌

// Good: Environment variable
const apiKey = process.env.ANTHROPIC_API_KEY; // ✅
```

### 7. Dependency Security

**Supply chain protection:**
- Dependabot for vulnerability alerts
- Dependency Review workflow (blocks PRs with high-severity CVEs)
- Pinned versions in package-lock.json
- Regular dependency audits

## Security Best Practices for Users

### 1. API Key Storage

**Never commit API keys:**
```bash
# .env (gitignored)
ANTHROPIC_API_KEY=sk-...

# Load in code
import 'dotenv/config';
```

### 2. Permission Mode

**Use appropriate permission level:**
```bash
# Ask for confirmation (safest)
codeyang --permission ask

# Auto-allow safe operations
codeyang --permission auto

# Manual control
codeyang --permission deny
```

### 3. Deny List

**Add project-specific dangerous commands:**
```bash
export CODEYANG_DENY_COMMANDS="deploy,kubectl,terraform"
```

### 4. Sandbox Mode

**Enable for untrusted code:**
```bash
export CODEYANG_SANDBOX_ENABLED=true
```

### 5. Audit Logs

**Review security events:**
```bash
# Check audit log
cat .codeyang/audit.jsonl | grep -i "denied\|blocked\|security"
```

## Known Limitations

### 1. AI Model Behavior
- LLM outputs are probabilistic and may be unpredictable
- Always review generated code before production use
- CodeYang cannot guarantee LLM won't generate insecure code

### 2. Shell Access
- BashTool grants shell access with user permissions
- Deny list is not exhaustive (use permission mode)
- User is ultimately responsible for confirming risky operations

### 3. Network Access
- SSRF protection is best-effort (DNS rebinding still possible)
- Outbound network access is not blocked by default
- Consider firewall rules for additional protection

### 4. File System
- Agent can read/write files within working directory
- Permission checks rely on OS permissions
- Use sandbox for untrusted operations

## Security Checklist for Contributors

Before submitting code:

- [ ] Input validation for all user-provided data
- [ ] No hardcoded secrets or credentials
- [ ] Shell commands properly escaped
- [ ] Network requests validated (SSRF check)
- [ ] Error messages don't leak sensitive info
- [ ] Tests include security edge cases
- [ ] Dependencies are pinned versions
- [ ] No eval() or Function() with user input

## Vulnerability Disclosure Policy

We follow **coordinated disclosure**:

1. **Report**: You report the vulnerability privately
2. **Acknowledgment**: We confirm receipt (48 hours)
3. **Investigation**: We assess and develop fix
4. **Fix**: We release patched version
5. **Disclosure**: We publish security advisory (with credit to reporter)
6. **Public**: Issue is made public after fix is available

**Credit:** We acknowledge reporters in security advisories (unless you prefer to remain anonymous).

## Security Hall of Fame

Thank you to researchers who've helped secure CodeYang:

- _No reports yet — be the first!_

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [GitHub Security Advisories](https://docs.github.com/en/code-security/security-advisories)

---

**Last Updated:** 2026-06-25
