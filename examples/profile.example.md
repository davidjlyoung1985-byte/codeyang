# CodeYang 用户配置文件
# 将此文件复制到 ~/.codeyang/profile.md 并修改为你自己的偏好
# Agent 启动时会自动加载此文件，无需额外配置

## 关于我

- 我是前端/后端/全栈工程师
- 主要技术栈：React, TypeScript, Node.js, Tailwind CSS
- 工作项目基于 Next.js 14 + Prisma + PostgreSQL

## 代码风格偏好

- 使用 TypeScript strict 模式，禁止 `any` 类型
- 命名规范：组件用 PascalCase，函数用 camelCase，常量用 UPPER_SNAKE_CASE
- 使用 ESM 模块（import/export），而不是 CommonJS
- 测试框架用 Vitest，不用 Jest
- 排序：import 按 "node builtin → 第三方 → 内部模块" 分组

## 项目约定

- 组件文件放在 `src/components/`，页面在 `src/app/`
- API 路由在 `src/app/api/`
- 工具函数在 `src/lib/`
- 类型定义在 `src/types/`

## 常用命令

- 开发：`npm run dev`
- 构建：`npm run build`
- 测试：`npm test`
- Lint：`npm run lint`
- 类型检查：`npm run type-check`

## 加分行为

- 每次修改文件后告诉我改了什么
- 大型重构前先问我的意见
- 如果有多方案，优先选择性能更好的那个
- 提交信息用中文写
