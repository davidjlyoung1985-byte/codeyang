# VS Code 扩展测试指南

## 🎯 新功能：多行补全

### 已优化的功能

#### 1. **智能上下文分析**
- ✅ 自动检测补全意图（函数/类/语句/注释）
- ✅ 根据意图调整上下文范围（50-100 行）
- ✅ 识别缩进和代码风格

#### 2. **多行补全支持**
- ✅ 函数定义补全（完整函数体）
- ✅ 类定义补全（完整类结构）
- ✅ 控制流补全（if/for/while 块）
- ✅ 自动缩进对齐

#### 3. **性能优化**
- ✅ 自适应 token 限制（单行 500，多行 2000）
- ✅ 温度设置优化（0.2，更确定性）
- ✅ LRU 缓存管理
- ✅ 补全统计跟踪

---

## 📦 安装测试

### 方式 1：安装 VSIX（推荐）

```bash
cd E:\Qt\ai-code-agent\vscode-extension
code --install-extension codeyang-vscode-0.1.0.vsix --force
```

### 方式 2：开发模式

1. 在 VS Code 中打开 `vscode-extension` 文件夹
2. 按 `F5` 启动扩展开发主机
3. 在新窗口中测试

---

## 🧪 测试场景

### 测试 1: 单行补全

**输入：**
```typescript
const add = (a: number, b: number|
```

**预期输出：**
```typescript
): number => a + b;
```

**验证：**
- ✅ 单行补全
- ✅ 类型推断正确
- ✅ 符合 TypeScript 语法

---

### 测试 2: 函数补全（多行）

**输入：**
```typescript
function calculateTotal(items: Item[]) {|
```

**预期输出：**
```typescript
  return items.reduce((sum, item) => sum + item.price, 0);
}
```

**验证：**
- ✅ 多行补全
- ✅ 自动缩进
- ✅ 完整函数体
- ✅ 闭合花括号

---

### 测试 3: 类定义补全

**输入：**
```typescript
class UserService {|
```

**预期输出：**
```typescript
  private users: User[] = [];

  async getUser(id: string): Promise<User | null> {
    return this.users.find(u => u.id === id) || null;
  }

  async createUser(data: CreateUserDto): Promise<User> {
    const user = { id: generateId(), ...data };
    this.users.push(user);
    return user;
  }
}
```

**验证：**
- ✅ 多行补全
- ✅ 类成员方法
- ✅ 完整类结构
- ✅ 正确缩进

---

### 测试 4: 控制流补全

**输入：**
```typescript
if (user.isAdmin) {|
```

**预期输出：**
```typescript
  console.log('Admin user detected');
  // Additional admin logic
}
```

**验证：**
- ✅ 多行补全
- ✅ 代码块完整
- ✅ 自动闭合

---

### 测试 5: 注释补全

**输入：**
```typescript
// Calculate the fibonacci|
```

**预期输出：**
```typescript
 number at position n
```

**验证：**
- ✅ 单行补全
- ✅ 注释风格一致

---

### 测试 6: 缓存测试

**步骤：**
1. 输入相同代码 2 次
2. 观察第二次响应速度

**验证：**
- ✅ 第二次明显更快（缓存命中）
- ✅ 结果一致

---

### 测试 7: 上下文感知

**输入：**
```typescript
// 文件中已有：
interface User {
  id: string;
  name: string;
}

// 在新函数中：
function getUser|
```

**预期输出：**
```typescript
(id: string): User | null {
  // Implementation
}
```

**验证：**
- ✅ 使用了上下文中的 User 类型
- ✅ 类型安全

---

## 📊 性能基准

| 场景 | 预期响应时间 | Token 使用 |
|------|-------------|-----------|
| 单行补全 | 500-800ms | ~200 tokens |
| 多行补全 | 800-1500ms | ~500 tokens |
| 缓存命中 | <50ms | 0 tokens |

---

## ⚙️ 配置验证

### 检查设置

打开 VS Code 设置，搜索 "CodeYang"，确认：

```json
{
  "codeyang.apiKey": "sk-ant-...",  // 你的 API Key
  "codeyang.enableInlineCompletion": true,
  "codeyang.completionDelay": 300,
  "codeyang.maxCompletionLength": 2000  // 支持更长的多行补全
}
```

---

## 🐛 故障排除

### 问题 1: 没有补全提示

**解决：**
1. 检查 API Key 是否配置
2. 查看开发者控制台（Ctrl+Shift+I）是否有错误
3. 确认扩展已激活（查看状态栏）

### 问题 2: 补全太慢

**解决：**
1. 减少 `completionDelay` 到 200ms
2. 检查网络连接
3. 查看 API 配额

### 问题 3: 多行补全不生效

**解决：**
1. 确保光标后有空行
2. 检查代码上下文是否清晰
3. 尝试手动触发（Ctrl+Shift+Space）

---

## 📈 统计数据

查看补全统计：

```typescript
// 在扩展代码中调用
const stats = completionProvider.getStats();
console.log(stats);
// {
//   requested: 50,
//   accepted: 35,
//   rejected: 15,
//   avgLength: 120
// }
```

**接受率计算：** 35/50 = 70%

---

## ✅ 测试检查清单

完成以下测试：

- [ ] 安装扩展成功
- [ ] API Key 配置正确
- [ ] 单行补全工作正常
- [ ] 多行补全工作正常
- [ ] 函数补全完整
- [ ] 类补全完整
- [ ] 缓存功能正常
- [ ] 上下文感知准确
- [ ] 响应时间符合预期
- [ ] 无明显错误或崩溃

---

## 🎉 新功能亮点

### vs 之前版本

| 功能 | 旧版本 | 新版本 |
|------|--------|--------|
| **补全类型** | 仅单行 | 单行 + 多行 |
| **上下文分析** | 固定 50 行 | 自适应 50-100 行 |
| **意图识别** | 无 | 函数/类/语句/注释 |
| **Token 限制** | 固定 500 | 自适应 500-2000 |
| **缓存策略** | 简单 Map | LRU + 智能 Key |
| **统计跟踪** | 无 | 完整统计 |
| **温度控制** | 默认 | 0.2（更确定） |

---

## 🚀 下一步

测试完成后：

1. **收集反馈** - 记录哪些场景效果好，哪些需要改进
2. **调优参数** - 根据实际使用调整延迟、token 等
3. **扩展功能** - 添加更多智能特性

---

## 📝 反馈模板

```markdown
## 测试场景
[描述你测试的代码场景]

## 实际结果
[粘贴补全结果]

## 预期结果
[描述你期望的补全]

## 评分
补全质量: ⭐⭐⭐⭐⭐ (1-5星)
响应速度: ⭐⭐⭐⭐⭐ (1-5星)

## 建议
[改进建议]
```

---

需要我帮你安装并运行第一个测试吗？
