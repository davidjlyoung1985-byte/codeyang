# CodeYang 工具任务执行指南

## 🎯 快速开始

### 方式 1: 交互式使用（推荐）
```bash
# 启动 CodeYang
npm start

# 然后输入你的任务
你: 帮我分析 src/agent/Agent.ts 的代码
你: 列出所有 .ts 文件
你: 创建一个新文件 hello.js
```

### 方式 2: 命令行直接执行
```bash
# 使用 node 运行
node dist/index.js
```

### 方式 3: 使用演示脚本
```bash
# 运行工具演示
node tool-demo.js
```

---

## 🛠️ 工具分类和使用示例

### 1. 文件操作工具

#### 读取文件
```
任务: 读取 package.json 文件
工具: Read
结果: 显示文件内容
```

#### 写入文件
```
任务: 创建一个新文件 test.txt，内容是 "Hello World"
工具: Write
结果: 文件创建成功
```

#### 编辑文件
```
任务: 将 test.txt 中的 "World" 替换为 "CodeYang"
工具: Edit
结果: 文件修改成功
```

#### 搜索文件
```
任务: 查找所有 .ts 文件
工具: Glob
结果: 列出所有匹配的文件
```

#### 搜索内容
```
任务: 在 src 目录中搜索包含 "Agent" 的文件
工具: Grep
结果: 显示匹配的行
```

---

### 2. Git 工具（16个）

#### Git 状态
```
任务: 显示 git 状态
工具: GitStatus
结果: 显示修改、暂存、未跟踪的文件
```

#### Git 提交
```
任务: 提交所有修改，消息是 "fix: update files"
工具: GitCommit
结果: 创建新的提交
```

#### Git 分支
```
任务: 列出所有分支
工具: GitBranch
结果: 显示所有本地和远程分支
```

#### Git 日志
```
任务: 显示最近 5 条提交记录
工具: GitLog
结果: 显示提交历史
```

---

### 3. 代码分析工具

#### AST 解析
```
任务: 解析 src/agent/Agent.ts 的 AST
工具: ParseAst
结果: 显示抽象语法树结构
```

#### 代码分析
```
任务: 分析 src/agent/Agent.ts 的函数和类
工具: AnalyzeCode
结果: 列出所有函数、类、导出
```

#### 复杂度计算
```
任务: 计算 src/agent/Agent.ts 的圈复杂度
工具: Complexity
结果: 显示复杂度指标
```

#### 代码检查
```
任务: 对 src/agent/Agent.ts 运行 ESLint
工具: Lint
结果: 显示代码问题
```

#### 依赖分析
```
任务: 分析项目的依赖关系
工具: FindDeps
结果: 列出所有依赖包
```

#### 代码行数统计
```
任务: 统计 src 目录的代码行数
工具: CountLines
结果: 显示代码、注释、空行统计
```

---

### 4. 数据处理工具

#### JSON 处理
```
任务: 解析 package.json
工具: JsonParse
结果: 格式化显示 JSON 数据
```

#### JSON 查询
```
任务: 从 package.json 中提取 version 字段
工具: JsonQuery
结果: "0.7.0"
```

#### YAML 处理
```
任务: 解析 .github/workflows/ci.yml
工具: YamlParse
结果: 显示 YAML 配置
```

#### CSV 处理
```
任务: 将数组转换为 CSV 格式
工具: CsvWrite
结果: 生成 CSV 文件
```

---

### 5. 网络工具

#### HTTP 请求
```
任务: 获取 https://api.github.com/repos/nodejs/node
工具: HttpRequest
结果: 显示 API 响应
```

#### 网页抓取
```
任务: 获取 https://example.com 的文本内容
工具: WebFetch
结果: 显示网页文本
```

#### 文件下载
```
任务: 下载 https://example.com/file.zip
工具: DownloadFile
结果: 文件下载到本地
```

---

### 6. 数学工具

#### 数学求解
```
任务: 求解方程 x^2 + 2x - 3 = 0
工具: MathSolve
结果: x = 1 或 x = -3
```

#### 函数绘图
```
任务: 绘制 y = x^2 的函数图像
工具: MathPlot
结果: 生成 SVG 图像
```

#### 概念解释
```
任务: 解释什么是导数
工具: MathExplain
结果: 详细的数学概念解释
```

---

### 7. Qt 工具（10个）

#### Qt 构建
```
任务: 构建 Qt 项目
工具: QtBuild
结果: 执行 qmake/cmake 构建
```

#### Qt UI 分析
```
任务: 分析 mainwindow.ui 文件
工具: QtUi
结果: 显示 UI 组件结构
```

#### Qt QML 分析
```
任务: 分析 main.qml 文件
工具: QtQml
结果: 显示 QML 组件和属性
```

---

## 💡 实际使用场景

### 场景 1: 项目代码审查
```
1. 统计项目代码行数
   任务: "统计 src 目录的代码行数"

2. 分析代码复杂度
   任务: "分析 src/agent/Agent.ts 的复杂度"

3. 运行代码检查
   任务: "对 src 目录运行 ESLint"

4. 生成报告
   任务: "创建代码审查报告 code-review.md"
```

### 场景 2: Git 工作流
```
1. 查看状态
   任务: "显示 git 状态"

2. 添加文件
   任务: "将所有修改添加到暂存区"

3. 创建提交
   任务: "提交修改，消息是 'feat: add new feature'"

4. 推送代码
   任务: "推送到远程仓库"
```

### 场景 3: 文件批处理
```
1. 查找文件
   任务: "查找所有包含 'TODO' 的文件"

2. 批量替换
   任务: "将所有文件中的 'TODO' 替换为 'DONE'"

3. 验证修改
   任务: "搜索剩余的 TODO 标记"
```

### 场景 4: 数据转换
```
1. 读取 JSON
   任务: "读取 data.json"

2. 转换格式
   任务: "将 data.json 转换为 CSV 格式"

3. 保存结果
   任务: "保存为 data.csv"
```

---

## 🔥 高级技巧

### 技巧 1: 链式任务
```
任务: "读取 package.json，提取版本号，然后创建一个 VERSION.txt 文件保存版本号"
结果: CodeYang 会自动使用多个工具完成任务
```

### 技巧 2: 批量操作
```
任务: "列出所有 .test.ts 文件，统计总行数"
结果: 使用 Glob + CountLines 工具
```

### 技巧 3: 条件处理
```
任务: "如果存在 TODO.md 文件，读取它；否则创建一个空的 TODO.md"
结果: CodeYang 会检查文件存在性并执行相应操作
```

### 技巧 4: 复杂分析
```
任务: "分析 src/agent 目录下所有文件的复杂度，生成汇总报告"
结果: 综合使用多个分析工具
```

---

## 📊 工具使用统计

### 最常用工具 TOP 10
1. **Read** - 读取文件
2. **Write** - 写入文件
3. **Glob** - 查找文件
4. **Grep** - 搜索内容
5. **GitStatus** - Git 状态
6. **Bash** - 执行命令
7. **AnalyzeCode** - 代码分析
8. **JsonParse** - JSON 解析
9. **Edit** - 编辑文件
10. **Complexity** - 复杂度分析

---

## 🎓 最佳实践

### 1. 清晰的任务描述
❌ 差: "处理文件"
✅ 好: "读取 config.json，提取 apiKey 字段，保存到 .env 文件"

### 2. 提供具体路径
❌ 差: "分析代码"
✅ 好: "分析 src/agent/Agent.ts 的代码复杂度"

### 3. 明确期望结果
❌ 差: "检查代码"
✅ 好: "对 src 目录运行 ESLint，修复所有警告"

### 4. 分步执行复杂任务
❌ 差: "完成整个重构"
✅ 好: 
   - 步骤1: "列出所有需要重构的文件"
   - 步骤2: "重构第一个文件"
   - 步骤3: "运行测试验证"

---

## 🚀 快速命令参考

```bash
# 查看帮助
npm start
> /help

# 列出所有工具
> /tools

# 列出会话
> /sessions

# 清空会话
> /clear

# 退出
> /exit
```

---

## 📞 获取帮助

- **文档**: [README.md](README.md)
- **部署指南**: [LOCAL_DEPLOYMENT_GUIDE.md](LOCAL_DEPLOYMENT_GUIDE.md)
- **工具参考**: 运行 `/tools` 查看所有工具

---

**准备好了吗？运行 `npm start` 开始执行工具任务！** 🚀

---

生成时间: 2026-07-17
