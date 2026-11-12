# Quick Start Guide

Get CodeYang up and running in 5 minutes.

## 🚀 Quick Installation

### Method 1: Automated Scripts (Recommended)

#### Windows (PowerShell)
```powershell
# Full deployment (with tests)
.\deploy.ps1

# Quick deployment (skip tests)
.\deploy.ps1 -SkipTests

# Clean deployment
.\deploy.ps1 -Clean
```

#### Linux / macOS (Bash)
```bash
# Add execute permission
chmod +x deploy.sh

# Full deployment (with tests)
./deploy.sh

# Quick deployment (skip tests)
./deploy.sh --skip-tests

# Clean deployment
./deploy.sh --clean
```

---

### Method 2: Manual Steps

```bash
# 1. Install dependencies
npm install

# 2. Build the project
npm run build

# 3. Start CodeYang
npm start
```

---

## 🔑 First-Time Configuration

### Configure API Key

#### Option A: Command Line
```bash
npm start -- --api-key YOUR_API_KEY
```

#### Option B: Environment Variable
```bash
# Linux/macOS
export CODEYANG_API_KEY=your_key_here
npm start

# Windows PowerShell
$env:CODEYANG_API_KEY="your_key_here"
npm start
```

#### Option C: Configuration File
Create or edit `~/.codeyang/config.json`:
```json
{
  "apiKey": "your_api_key",
  "model": "deepseek-chat",
  "baseURL": "https://api.deepseek.com/v1"
}
```

---

## ✅ Verify Installation

```bash
# Check version
npm start -- --version

# View help
npm start -- --help

# List sessions
npm start -- --list-sessions
```

---

## 🎯 First Steps

### 1. Start Interactive Session
```bash
npm start
```

### 2. Try Simple Commands
```
You: Create a simple HTTP server in TypeScript
You: Read package.json and explain it
You: What files are in this directory?
```

### 3. Use Built-in Commands
```
/help          # Show available commands
/tools         # List available tools
/sessions      # View saved sessions
/clear         # Clear conversation
/exit          # Quit CodeYang
```

---

## 🛠️ Troubleshooting

### Issue 1: npm install fails
```bash
# Clean and retry
rm -rf node_modules package-lock.json
npm install
```

### Issue 2: Build fails
```bash
# Check Node.js version (requires >= 18)
node --version

# Update npm
npm install -g npm@latest
```

### Issue 3: API connection error
```bash
# Check your API key
echo $CODEYANG_API_KEY

# Test with debug mode
CODEYANG_DEBUG=true npm start
```

For more troubleshooting, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

---

## 📚 Next Steps

1. ✅ **Complete setup**
2. 🔑 **Configure API key**
3. 🚀 **Start using**: `npm start`
4. 📖 **Read docs**: [README.md](README.md)
5. 📝 **View examples**: [examples/](examples/)

---

## 🌟 Recommended Configuration

Create `.env` file in project root:
```bash
# API Configuration
CODEYANG_API_KEY=your_key_here
CODEYANG_MODEL=deepseek-chat
CODEYANG_BASE_URL=https://api.deepseek.com/v1

# Performance
CODEYANG_MAX_TOKENS=32000
CODEYANG_BASH_LIMIT=500

# Debug (optional)
CODEYANG_DEBUG=false
```

---

## 📞 Getting Help

- **GitHub Issues**: https://github.com/davidjlyoung1985-byte/codeyang/issues
- **Documentation**: [README.md](README.md)
- **FAQ**: [FAQ.md](FAQ.md)
- **User Guide**: [USER_GUIDE.md](USER_GUIDE.md)

---

**Last Updated**: 2026-11-12  
**Version**: v1.0.0
