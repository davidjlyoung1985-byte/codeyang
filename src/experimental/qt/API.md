# Qt Module API Documentation

**Version**: 1.0.0-beta  
**Stability**: 2 (Unstable - API may change in minor versions)  
**Status**: Fully integrated, auto-activates for Qt projects

---

## Overview

The Qt module provides specialized tools and context-aware assistance for Qt/QML development. It automatically detects Qt projects and enhances the agent with Qt-specific knowledge.

### Key Features

- 🔍 **Auto-detection** - Detects Qt projects automatically
- 🛠️ **Qt-specific tools** - Build, QML, .pro files, signals/slots
- 📚 **Qt knowledge injection** - Qt API documentation and patterns
- 🧪 **Testing support** - Qt Test framework integration
- 🎨 **UI tools** - Qt Widgets, QML, Graphics View
- 🧵 **Threading** - QThread and concurrent programming
- 📊 **Data visualization** - Qt Charts integration
- 🔄 **Migration helpers** - Qt 5 → Qt 6 migration

---

## Installation

```typescript
import {
  detectQtProject,
  buildQtPrompt,
  createQtTools,
  QT_API_VERSION,
} from './experimental/qt/index.js';
```

---

## Core API

### detectQtProject(cwd)

Detects if the current directory contains a Qt project.

```typescript
const qtContext = await detectQtProject('/path/to/project');

if (qtContext) {
  console.log('Qt version:', qtContext.version);
  console.log('Uses QML:', qtContext.usesQml);
  console.log('Build system:', qtContext.buildSystem);
}
```

**Parameters**:
- `cwd: string` - Project directory path

**Returns**: `Promise<QtContext | null>`

```typescript
interface QtContext {
  version: string;           // Qt version (e.g., "6.5.0")
  usesQml: boolean;          // Uses QML?
  usesWidgets: boolean;      // Uses Qt Widgets?
  buildSystem: 'qmake' | 'cmake' | 'meson' | 'unknown';
  proFiles: string[];        // Found .pro files
  cmakelists: string[];      // Found CMakeLists.txt
  qmlFiles: string[];        // Found .qml files
  uiFiles: string[];         // Found .ui files
  modules: string[];         // Detected Qt modules
}
```

**Detection Criteria**:
- Looks for `.pro` files (qmake)
- Looks for `CMakeLists.txt` with Qt references
- Looks for `.qml` files (Qt Quick/QML)
- Looks for `.ui` files (Qt Designer)
- Checks for Qt modules in build files

**Example**:
```typescript
const qt = await detectQtProject(process.cwd());

if (qt) {
  if (qt.version.startsWith('5')) {
    console.log('Qt 5 project detected');
  } else if (qt.version.startsWith('6')) {
    console.log('Qt 6 project detected');
  }

  if (qt.usesQml) {
    console.log('QML modules:', qt.qmlFiles.length);
  }

  if (qt.usesWidgets) {
    console.log('Widgets UI files:', qt.uiFiles.length);
  }
}
```

---

### buildQtPrompt(qtContext)

Generates Qt-specific context prompt for the agent.

```typescript
const qtPrompt = buildQtPrompt(qtContext);
// Inject into agent system prompt
```

**Parameters**:
- `qtContext: QtContext` - Detected Qt project context

**Returns**: `string` - Formatted prompt with Qt knowledge

**Generated Prompt Includes**:
- Qt version-specific APIs
- QML/QtQuick patterns
- Signals and slots syntax
- Qt build system commands
- Common Qt classes and modules
- Qt 6 migration hints (if Qt 5 detected)

**Example**:
```typescript
const qt = await detectQtProject(cwd);
if (qt) {
  const qtPrompt = buildQtPrompt(qt);
  
  // Add to agent system prompt
  systemPrompt += '\n\n' + qtPrompt;
}
```

---

### createQtTools()

Creates Qt-specific tools for the agent.

```typescript
const qtTools = createQtTools();

// Register with agent
agent.registerTools(qtTools);
```

**Returns**: `Tool[]` - Array of Qt tool definitions

**Available Qt Tools**:
1. `QtBuild` - Build Qt projects
2. `QtProFile` - Manage .pro files
3. `QtQml` - QML file operations
4. `QtSignals` - Signals/slots helpers
5. `QtThread` - Threading patterns
6. `QtUi` - UI file operations
7. `QtCharts` - Charts integration
8. `QtGraphics` - Graphics View
9. `QtModelView` - Model/View patterns
10. `QtMigration` - Qt 5 → 6 migration
11. `QtTest` - Test generation/running

---

## Qt Tools API

### QtBuildTool

Build and configure Qt projects.

```typescript
// Build project
{
  "tool": "QtBuild",
  "action": "build",
  "config": "Release",
  "target": "all"
}

// Clean build
{
  "tool": "QtBuild",
  "action": "clean"
}

// Run qmake
{
  "tool": "QtBuild",
  "action": "qmake",
  "args": ["-spec", "linux-g++"]
}
```

**Actions**:
- `build` - Build the project
- `clean` - Clean build artifacts
- `qmake` - Run qmake
- `configure` - Configure CMake build

---

### QtQmlTool

Analyze and manipulate QML files.

```typescript
// Analyze QML file
{
  "tool": "QtQml",
  "action": "analyze",
  "file": "main.qml"
}

// Format QML
{
  "tool": "QtQml",
  "action": "format",
  "file": "MyComponent.qml"
}

// Validate QML
{
  "tool": "QtQml",
  "action": "validate",
  "file": "*.qml"
}
```

**Actions**:
- `analyze` - Analyze QML structure
- `format` - Format QML file
- `validate` - Validate QML syntax
- `create` - Create QML component

---

### QtProFileTool

Manage Qt project (.pro) files.

```typescript
// Parse .pro file
{
  "tool": "QtProFile",
  "action": "parse",
  "file": "myapp.pro"
}

// Add source file
{
  "tool": "QtProFile",
  "action": "addSource",
  "file": "myapp.pro",
  "source": "newfile.cpp"
}

// Add Qt module
{
  "tool": "QtProFile",
  "action": "addModule",
  "file": "myapp.pro",
  "module": "network"
}
```

**Actions**:
- `parse` - Parse .pro file
- `addSource` - Add source file
- `addHeader` - Add header file
- `addModule` - Add Qt module
- `setConfig` - Set configuration

---

### QtSignalsTool

Generate and analyze Qt signals/slots.

```typescript
// Generate signal/slot connection
{
  "tool": "QtSignals",
  "action": "connect",
  "sender": "button",
  "signal": "clicked()",
  "receiver": "this",
  "slot": "onButtonClicked()"
}

// Analyze connections
{
  "tool": "QtSignals",
  "action": "analyze",
  "file": "mainwindow.cpp"
}
```

**Actions**:
- `connect` - Generate connection code
- `analyze` - Analyze existing connections
- `generate` - Generate signal/slot declarations

---

### QtMigrationTool

Migrate Qt 5 code to Qt 6.

```typescript
// Check compatibility
{
  "tool": "QtMigration",
  "action": "check",
  "file": "widget.cpp"
}

// Migrate file
{
  "tool": "QtMigration",
  "action": "migrate",
  "file": "widget.cpp",
  "target": "Qt6"
}

// Show migration report
{
  "tool": "QtMigration",
  "action": "report",
  "directory": "src/"
}
```

**Migration Features**:
- Detects deprecated APIs
- Suggests Qt 6 replacements
- Updates include paths
- Fixes namespace changes
- Updates CMake/qmake files

**Common Migrations**:
```cpp
// Qt 5
#include <QDesktopWidget>
qApp->desktop()->screenGeometry();

// Qt 6
#include <QScreen>
QGuiApplication::primaryScreen()->geometry();
```

---

### QtTestTool

Generate and run Qt tests.

```typescript
// Generate test
{
  "tool": "QtTest",
  "action": "generate",
  "class": "MyClass",
  "methods": ["method1", "method2"]
}

// Run tests
{
  "tool": "QtTest",
  "action": "run",
  "test": "tst_myclass"
}

// Coverage report
{
  "tool": "QtTest",
  "action": "coverage",
  "format": "html"
}
```

---

## Usage Examples

### Example 1: Detect and Configure

```typescript
import { detectQtProject, buildQtPrompt, createQtTools } from './experimental/qt/index.js';

async function setupQtProject() {
  // Detect Qt project
  const qt = await detectQtProject(process.cwd());
  
  if (!qt) {
    console.log('Not a Qt project');
    return;
  }

  console.log(`Qt ${qt.version} project detected`);
  console.log(`Build system: ${qt.buildSystem}`);

  // Generate Qt-specific prompt
  const qtPrompt = buildQtPrompt(qt);

  // Create Qt tools
  const qtTools = createQtTools();

  // Return configuration
  return { qtPrompt, qtTools, qt };
}
```

### Example 2: Qt 6 Migration

```typescript
// Detect Qt 5 project
const qt = await detectQtProject(cwd);

if (qt && qt.version.startsWith('5')) {
  console.log('Qt 5 project detected, migration recommended');

  // Use migration tool
  const agent = new Agent(config);
  agent.registerTools(createQtTools());

  // Ask agent to migrate
  await agent.run(
    'Check Qt 6 compatibility and suggest migration steps for all source files'
  );
}
```

### Example 3: QML Development

```typescript
const qt = await detectQtProject(cwd);

if (qt && qt.usesQml) {
  console.log(`Found ${qt.qmlFiles.length} QML files`);

  // Validate all QML files
  for (const qmlFile of qt.qmlFiles) {
    // Use QtQml tool to validate
  }
}
```

### Example 4: Build Automation

```typescript
const qt = await detectQtProject(cwd);

if (qt) {
  const agent = new Agent(config);
  agent.registerTools(createQtTools());

  // Build project
  await agent.run('Build the Qt project in Release mode');

  // Run tests
  await agent.run('Run all Qt tests and show coverage report');
}
```

---

## Integration with Agent

```typescript
import { Agent } from './agent/Agent.js';
import { detectQtProject, buildQtPrompt, createQtTools } from './experimental/qt/index.js';

async function createQtAwareAgent(config) {
  const agent = new Agent(config);

  // Detect Qt project
  const qt = await detectQtProject(config.cwd || process.cwd());

  if (qt) {
    console.log(`✓ Qt ${qt.version} project detected`);

    // Inject Qt knowledge
    const qtPrompt = buildQtPrompt(qt);
    agent.addSystemPrompt(qtPrompt);

    // Register Qt tools
    const qtTools = createQtTools();
    agent.registerTools(qtTools);

    console.log(`✓ Registered ${qtTools.length} Qt tools`);
  }

  return agent;
}

// Usage
const agent = await createQtAwareAgent({
  model: 'claude-opus-5',
  cwd: '/path/to/qt/project',
});

await agent.run('Analyze the QML components and suggest improvements');
```

---

## Qt Knowledge Base

The module injects knowledge about:

### Qt Core
- QObject, QThread, QTimer
- Signals and slots mechanism
- Meta-object system
- Event loop and events

### Qt GUI
- QWidget hierarchy
- Layouts (QVBoxLayout, QHBoxLayout, QGridLayout)
- Common widgets (QPushButton, QLabel, QLineEdit)
- Custom widgets

### Qt Quick/QML
- QML syntax and components
- Property bindings
- JavaScript in QML
- Qt Quick Controls

### Qt Network
- QTcpSocket, QUdpSocket
- QNetworkAccessManager
- HTTP requests

### Qt Multimedia
- Audio/video playback
- Camera access

---

## API Stability Roadmap

### Current (v1.0.0-beta)
- Stability Level: 2 (Unstable)
- All APIs functional, may change

### v1.0.0 (Target)
- Core detection API becomes stable
- Tool interfaces finalized
- Stability Level: 3 (Stable)

### v1.1.0+
- Additional Qt modules (WebEngine, 3D, etc.)
- Enhanced migration tools
- Qt 7 support (when available)

---

## Best Practices

1. **Always check detection result**:
   ```typescript
   const qt = await detectQtProject(cwd);
   if (!qt) return; // Not a Qt project
   ```

2. **Version-specific logic**:
   ```typescript
   if (qt.version.startsWith('6')) {
     // Use Qt 6 APIs
   } else {
     // Use Qt 5 APIs
   }
   ```

3. **Conditional tool registration**:
   ```typescript
   if (qt.usesQml) {
     agent.registerTool(QtQmlTool);
   }
   ```

4. **Respect build system**:
   ```typescript
   if (qt.buildSystem === 'cmake') {
     // Use CMake commands
   } else if (qt.buildSystem === 'qmake') {
     // Use qmake commands
   }
   ```

---

## Troubleshooting

### Qt not detected
- Ensure `.pro`, `CMakeLists.txt`, or `.qml` files exist
- Check file permissions
- Verify Qt is installed

### Build failures
- Check Qt version compatibility
- Verify all required Qt modules are installed
- Check environment variables (QTDIR, PATH)

### QML validation errors
- Ensure `qmlformat` is in PATH
- Check QML syntax
- Verify import paths

---

## Support

- **Issues**: https://github.com/davidjlyoung1985-byte/codeyang/issues
- **Docs**: See `src/experimental/README.md`
- **Qt Docs**: https://doc.qt.io/

---

**Last Updated**: 2026-09-12  
**Next Review**: v1.0.0 release
