/**
 * MathExplain — Middle school math concept reference with examples.
 * Covers: algebra, geometry, functions, statistics, probability.
 */
export function executeMathExplain(topic?: string): string {
  const lines: string[] = [];
  lines.push('## 初中数学知识库\n');

  if (!topic) {
    lines.push('Available topics:');
    lines.push('');
    for (const t of TOPICS) {
      lines.push(`- **${t.name}** — ${t.desc}`);
    }
    lines.push(`\nUse \`MathExplain <topic>\` for detailed reference.`);
    return lines.join('\n');
  }

  const t = topic.toLowerCase().trim();
  for (const entry of TOPICS) {
    if (entry.name.toLowerCase() === t || entry.aliases.some((a) => a === t)) {
      return buildTopicDetail(entry);
    }
  }

  return `Unknown topic: "${topic}". Use \`MathExplain\` without arguments to see available topics.`;
}

function buildTopicDetail(topic: TopicEntry): string {
  const lines: string[] = [];
  lines.push(`## ${topic.nameEmoji}  ${topic.name}`);
  lines.push('');
  lines.push(topic.content);
  lines.push('');
  if (topic.example) {
    lines.push('### 例题');
    lines.push(topic.example);
  }
  if (topic.tips) {
    lines.push('');
    lines.push('### 易错提醒');
    lines.push(topic.tips);
  }
  return lines.join('\n');
}

// ─── Knowledge Base ──────────────────────────────────────────────────────────

interface TopicEntry {
  name: string;
  nameEmoji: string;
  desc: string;
  aliases: string[];
  content: string;
  example: string;
  tips: string;
}

const TOPICS: TopicEntry[] = [
  {
    name: '一元一次方程',
    nameEmoji: '',
    desc: 'Linear equations with one variable',
    aliases: ['linear', '一次方程', '方程'],
    content: `### 一元一次方程 \\(ax + b = 0\\)

**定义**: 只含一个未知数, 未知数最高次数为 1 的等式。

**解法步骤**:
1. **移项** — 将含未知数的项移到等号左边, 常数项移到右边
2. **合并** — 合并同类项
3. **化系数为 1** — 两边同时除以系数

**标准形式**: \\(x = -\\frac{b}{a}\\) (当 a ≠ 0 时)

**三种情况**:
- a ≠ 0: 有唯一解
- a = 0, b ≠ 0: 无解 (0x = b, 矛盾)
- a = 0, b = 0: 无穷多解 (0x = 0, 恒等式)`,
    example: `解方程: 3x + 5 = 20

解: 3x = 20 - 5 = 15
    x = 15 ÷ 3 = **5**

检验: 3 × 5 + 5 = 20 ✓`,
    tips: `- 移项要**变号**: + 变 -, - 变 +
- 化系数时注意**正负号**
- 有分母时先**去分母** (两边同乘最小公倍数)
- 有括号时先**去括号** (注意分配律)`,
  },
  {
    name: '一元二次方程',
    nameEmoji: '',
    desc: 'Quadratic equations',
    aliases: ['quadratic', '二次方程'],
    content: `### 一元二次方程 \\(ax^2 + bx + c = 0\\) (a ≠ 0)

**解法**:

**1. 求根公式法** (万能):
\\[x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}\\]

**判别式** Δ = b² - 4ac:
- Δ > 0: 两个不等实数根
- Δ = 0: 两个相等实数根
- Δ < 0: 无实数根

**2. 因式分解法** (当判别式为完全平方数):
\\(x^2 + 5x + 6 = (x+2)(x+3) = 0\\) → x = -2 或 x = -3

**3. 配方法**:
\\(x^2 + 6x + 5 = 0\\) → \\((x+3)^2 - 4 = 0\\) → x = -1 或 x = -5`,
    example: `解方程: x² + 3x - 4 = 0

a = 1, b = 3, c = -4
Δ = 3² - 4×1×(-4) = 9 + 16 = 25

x = (-3 ± √25) / 2 = (-3 ± 5) / 2
x₁ = (-3 + 5) / 2 = **1**
x₂ = (-3 - 5) / 2 = **-4**

检验: 1² + 3(1) - 4 = 0 ✓
     (-4)² + 3(-4) - 4 = 16 - 12 - 4 = 0 ✓`,
    tips: `- 不要忘记 a ≠ 0 的前提
- Δ < 0 时说"无实数根", 不是"无解"
- 注意根与系数的关系: x₁+x₂ = -b/a, x₁x₂ = c/a
- 因式分解优先于公式法 (更快更准)`,
  },
  {
    name: '勾股定理',
    nameEmoji: '',
    desc: 'Pythagorean theorem',
    aliases: ['pythagorean', '勾股', '直角三角形'],
    content: `### 勾股定理 \\(a^2 + b^2 = c^2\\)

**描述**: 直角三角形中, 两条直角边的平方和等于斜边的平方。

- a, b: 直角边 (legs)
- c: 斜边 (hypotenuse, 最长边)

**逆定理**: 如果三角形三边满足 a² + b² = c², 则该三角形是直角三角形。

**常用勾股数**:
| a | b | c |
|---|---|---|
| 3 | 4 | 5 |
| 5 | 12 | 13 |
| 6 | 8 | 10 |
| 8 | 15 | 17 |
| 7 | 24 | 25 |`,
    example: `已知直角三角形两直角边为 3 和 4, 求斜边。

解: c² = 3² + 4² = 9 + 16 = 25
    c = √25 = **5**`,
    tips: `- 先判断哪条边是斜边 (最长边对面)
- c 一定是最大数!
- 30°-60°-90° 三角形: 短边:长边:斜边 = 1:√3:2
- 45°-45°-90° 三角形: 直角边:直角边:斜边 = 1:1:√2`,
  },
  {
    name: '一次函数',
    nameEmoji: '',
    desc: 'Linear functions y = kx + b',
    aliases: ['function', '函数', '一次函数', '线性函数'],
    content: `### 一次函数 \\(y = kx + b\\)

**定义**: 形如 y = kx + b (k ≠ 0) 的函数。

**图像**: 一条直线。

**参数含义**:
- k (斜率): k > 0 直线向上倾斜, k < 0 直线向下倾斜, |k| 越大越陡
- b (截距): 直线与 y 轴交点的纵坐标

**特殊形式**:
- b = 0: 正比例函数 y = kx (过原点)
- k = 0: 常函数 y = b (水平线, 不是一次函数)

**求解析式** (待定系数法):
1. 找两个点的坐标 (x₁, y₁) 和 (x₂, y₂)
2. k = (y₂ - y₁) / (x₂ - x₁)
3. 代入一点求 b`,
    example: `已知直线过点 A(1, 3) 和 B(3, 7), 求解析式。

解: k = (7-3)/(3-1) = 4/2 = 2
    y = 2x + b, 代入 (1,3): 3 = 2(1) + b → b = 1
    解析式: **y = 2x + 1**`,
    tips: `- k 值计算: (y₂-y₁)/(x₂-x₁), 注意顺序一致
- 两条直线平行: k₁ = k₂
- 两条直线垂直: k₁ × k₂ = -1
- 一次函数与方程的联系: 交点即方程的解`,
  },
  {
    name: '二次函数',
    nameEmoji: '',
    desc: 'Quadratic functions y = ax² + bx + c',
    aliases: ['quadfunc', '二次函数', '抛物线'],
    content: `### 二次函数 \\(y = ax^2 + bx + c\\) (a ≠ 0)

**图像**: 抛物线 (parabola)

**参数含义**:
- a > 0: 开口向上 (有最小值), a < 0: 开口向下 (有最大值)
- |a| 越大开口越窄

**顶点公式**:
\\[x = -\\frac{b}{2a}, \\quad y = \\frac{4ac - b^2}{4a}\\]

**对称轴**: x = -b/(2a)

**与 x 轴交点** (解 ax² + bx + c = 0):
- Δ > 0: 两个交点
- Δ = 0: 一个交点 (顶点在 x 轴上)
- Δ < 0: 无交点`,
    example: `求 y = x² - 4x + 3 的顶点。

解: a = 1, b = -4, c = 3
    顶点 x = -(-4)/(2×1) = 2
    y = 2² - 4(2) + 3 = 4 - 8 + 3 = -1
    顶点: **(2, -1)**
    开口向上 (a > 0)`,
    tips: `- 画图时先找: 开口方向→顶点→与轴交点
- 配方法求顶点: y = a(x-h)² + k → 顶点 (h, k)
- 最大值/最小值 = 顶点的 y 坐标
- 二次函数在顶点处取极值`,
  },
  {
    name: '圆',
    nameEmoji: '',
    desc: 'Circle geometry',
    aliases: ['circle', 'circle'],
    content: `### 圆的基本公式

**周长**: C = 2πr = πd
**面积**: S = πr²

**扇形** (圆心角 n°):
- 弧长: \\[l = \\frac{n}{360} \\times 2\\pi r\\]
- 面积: \\[S = \\frac{n}{360} \\times \\pi r^2\\]

**圆周角定理**: 同弧所对的圆周角等于圆心角的一半。

**直径所对的圆周角**: 90° (直角)

**切线的判定**: 过半径外端且垂直于半径的直线是圆的切线。`,
    example: `已知圆半径 r = 5cm, 求周长和面积。

周长 C = 2π × 5 = 10π ≈ **31.42 cm**
面积 S = π × 5² = 25π ≈ **78.54 cm²**`,
    tips: `- π 保留到 3.14 或保持 π 形式
- 注意半径和直径的区别 (d = 2r)
- 扇形公式中 n 是圆心角度数, 不是弧度`,
  },
  {
    name: '统计',
    nameEmoji: '',
    desc: 'Basic statistics',
    aliases: ['stats', '统计', '统计量'],
    content: `### 基本统计量

**平均数** (mean): \\(\\bar{x} = \\frac{x_1 + x_2 + ... + x_n}{n}\\)

**中位数** (median): 将数据从小到大排列, 中间位置的数。
- 奇数个: 第 (n+1)/2 个
- 偶数个: 中间两个的平均数

**众数** (mode): 出现次数最多的数。可能多个, 也可能没有。

**极差** (range): 最大值 - 最小值

**方差** (variance): \\(s^2 = \\frac{1}{n}\\sum(x_i - \\bar{x})^2\\)`,
    example: `数据: [2, 5, 5, 8, 10]

平均数 = (2+5+5+8+10)/5 = 6
中位数 = 5 (排序后第 3 个)
众数 = 5 (出现 2 次)
极差 = 10 - 2 = 8`,
    tips: `- 平均数受极端值影响大
- 中位数不受极端值影响 (更稳健)
- 众数不一定唯一
- 先排序再找中位数`,
  },
  {
    name: '概率',
    nameEmoji: '',
    desc: 'Basic probability',
    aliases: ['probability', '概率'],
    content: `### 概率基础

**定义**: P(A) = 事件 A 的可能结果数 / 所有可能结果数

**取值范围**: 0 ≤ P(A) ≤ 1
- P = 0: 不可能事件
- P = 1: 必然事件

**等可能事件**: 每个结果发生可能性相同。

**列举法**:
- 列表法 (适用于两步实验)
- 树状图 (适用于多步实验)

**用频率估计概率**: 大量重复实验中, 频率趋于概率。`,
    example: `掷一枚骰子, 求掷出偶数的概率。

解: 所有可能: {1,2,3,4,5,6} (6种)
    偶数: {2,4,6} (3种)
    P(偶数) = 3/6 = **1/2**`,
    tips: `- "至少一个"问题用补集: P = 1 - P(一个都没有)
- 注意"放回"和"不放回"的区别
- 概率用分数表示 (不用约小数)
- 两个独立事件同时发生: P(AB) = P(A) × P(B)`,
  },
];
