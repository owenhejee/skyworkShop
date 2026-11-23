# 项目 Cursor Skills

| Skill | 用途 | 流水线 Stage |
|-------|------|:------------:|
| `request-analysis` | 模糊需求 → 影响分析 → summary.md | 1-3 |
| `coding-skill` | 四层架构前后端编码实现 | 4 |
| `expert-reviewer` | 领域代码评审 + Harness 配置评审 | 6 |

> Stage 5/7–10 无专属 Skill，由 `mvn test`、curl、CI/人工负责。详见 `开发流程规范.mdc` §七。

## 推荐调用顺序

```
request-analysis → coding-skill → expert-reviewer
```

## 规范入口

| 文档 | 说明 |
|------|------|
| `AGENTS.md` | 技术栈、红线、文件索引 |
| `.cursor/rules/项目红线.mdc` | 不可违反的约束 |
| `.cursor/rules/工程结构.mdc` | 模块架构与命名 |
| `.cursor/rules/编码规范.mdc` | 业务特有编码规范 |
| `.cursor/rules/安全规范.mdc` | 业务特有安全规则 |
| `.cursor/rules/开发流程规范.mdc` | 十阶段流水线与变更管理 |
| `docs/QUICKSTART.md` | 5 分钟入门与提示词 |

## 使用方式

- **显式调用**：对话中 `@request-analysis`、`@coding-skill`、`@expert-reviewer`
- **隐式匹配**：Cursor 根据各 Skill 的 `description` 自动选用
- **变更产物**：需求分析输出写入 `docs/changes/{feat-name}/`（含 summary、迁移脚本等工作流产物，非纯 AI 配置）

## 废弃资产迁移

| 原资产 | 替代 |
|--------|------|
| `code-reviewer` Agent | `@expert-reviewer` |
| `unit-test-write` / `test-writer` | `mvn test` 或对话生成 |
| `deploy-verify` | `curl http://localhost:8080/health` |

## 目录结构

```
.cursor/skills/
├── README.md                 # 本文件
├── request-analysis/SKILL.md
├── coding-skill/SKILL.md
└── expert-reviewer/SKILL.md
```

元数据权威源：`.cursor/MANIFEST.yml`
