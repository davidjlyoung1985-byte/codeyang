# SpaceY - Native Windows AI Coding Agent

SpaceY is a C++ native Windows desktop application that brings CodeYang's AI coding capabilities to a fast, native interface.

## Features

- 🚀 **Native Performance** - Written in C++, faster startup and lower memory usage
- 🎨 **Modern UI** - Clean, dark-themed interface built with Qt 6
- 🛠️ **64+ Tools** - File operations, shell commands, code analysis, Git, and more
- 🤖 **AI Powered** - Uses DeepSeek or any OpenAI-compatible API
- 💬 **Real-time Streaming** - See AI responses as they generate
- 📁 **Tool Execution** - Automatic tool execution with progress feedback

## Building

### Prerequisites

- Visual Studio 2019+ or MinGW-w64
- CMake 3.20+
- Qt 6.5+ (optional, for UI)
- vcpkg (for dependencies)

### Install Dependencies with vcpkg

```bash
vcpkg install curl nlohmann-json
vcpkg integrate install
```

### Build

```bash
mkdir build
cd build
cmake .. -DCMAKE_TOOLCHAIN_FILE=[vcpkg root]/scripts/buildsystems/vcpkg.cmake
cmake --build . --config Release
```

## Usage

1. Set your API key:
```bash
set SPACEY_API_KEY=your-deepseek-api-key
```

2. Run SpaceY:
```bash
.\build\Release\SpaceY.exe
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SPACEY_API_KEY` | — | API key for DeepSeek or OpenAI |
| `SPACEY_MODEL` | `deepseek-chat` | Model name |
| `SPACEY_BASE_URL` | `https://api.deepseek.com/v1` | API base URL |

## Architecture

```
SpaceY/
├── src/
│   ├── main.cpp           # Qt UI application
│   ├── agent/             # Agent core (LLM client, message history)
│   ├── tools/             # Tool implementations (64+ tools)
│   └── utils/             # Config, logger, async executor
├── include/spacey/        # Public headers
└── CMakeLists.txt         # Build configuration
```

## Available Tools

- **File Operations**: Read, Write, Edit, Copy, Move, Delete, Mkdir, List
- **Shell**: Bash (PowerShell/cmd execution)
- **Search**: Glob, Grep, full-text search
- **Git**: Status, Diff, Commit, Push, Pull, Branch, Checkout
- **Code Analysis**: AST parsing, complexity analysis, dependencies
- **Network**: HTTP requests, downloads, uploads
- **Data**: JSON/YAML/XML parsing and manipulation

## Comparison with CodeYang

| Feature | CodeYang (Node.js) | SpaceY (C++) |
|---------|-------------------|--------------|
| Startup Time | ~500ms | ~100ms |
| Memory (Idle) | ~150MB | ~50MB |
| Platform | Cross-platform | Windows native |
| UI Framework | Electron | Qt 6 / Win32 |
| Binary Size | ~200MB | ~15MB |

## License

MIT License - See LICENSE file

## Contributing

Contributions welcome! Please open an issue or PR.
