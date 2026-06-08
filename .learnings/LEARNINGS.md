# Learnings

Corrections, insights, and knowledge gaps captured during development.

**Categories**: correction | insight | knowledge_gap | best_practice

---

## 2026-06-07: Skills 全局路径配置

- **type**: best_practice
- **context**: opencode 技能安装
- **detail**: 以后所有 `npx skills add` 安装的技能都会自动对 opencode 可用。opencode.json 中配置了 `"paths": [".opencode/skills", "../.agents/skills"]`，`.agents/skills` 为全局 skills 路径。不需要为 opencode 单独安装技能。
