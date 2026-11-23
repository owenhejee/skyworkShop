---

name: expert-reviewer
description: |
  从架构、红线、领域特定维度评审代码变更；可评审 Harness AI 配置（.cursor/、AGENTS.md）。
  在编码完成后、提交 PR 前、评审 AI 配置、或用户要求代码评审时使用。
requires:
  rules:
    - .cursor/rules/项目红线.mdc
    - .cursor/rules/安全规范.mdc
    - .cursor/rules/编码规范.mdc
  context:
    - AGENTS.md

---

# 专家评审（Stage 6）

> 本 Skill 覆盖领域特定的审查维度；通用维度（性能、格式、SAST）可由 CI 工具补充。

## 评审流程

1. 获取变更范围（`git diff` 或用户指定）
2. 读取规则文件（不超过 3 个）
3. 按下方维度逐项检查
4. 输出分级报告

## 领域审查维度

| 维度               | 检查内容                                            |
| ---------------- | ----------------------------------------------- |
| **架构合规**         | 4 层依赖方向正确；包路径合规；跨模块通过 Service 接口                |
| **红线零违反**        | 对照 `项目红线.mdc` 逐条验证                              |
| **金额安全**         | 所有金额字段 Integer（分），前后端类型对齐，价格服务端快照               |
| **MQ 可靠性**       | Consumer 幂等（去重表/processLog）、重试策略、死信队列           |
| **Redis 一致性**    | Cache Aside 模式、前缀 `skyworkshop:`、TTL 必设         |
| **权限校验**         | 购物车/订单/地址校验 userId 归属                           |
| **Harness 配置合规** | 见下方「AI 配置评审」；变更范围含 `.cursor/` 或 `AGENTS.md` 时必检 |

通用维度（性能热点、SQL 注入、依赖安全、代码格式）可由 CI / SAST 工具覆盖。

## AI 配置评审（Harness）

变更范围含 `.cursor/`、`AGENTS.md`、`.cursorignore` 时，额外检查：

| 检查项            | 标准                                                               |
| -------------- | ---------------------------------------------------------------- |
| MANIFEST 同步    | Skill/Rule 变更后 `MANIFEST.yml` 与 `SKILL.md` 的 `requires` 一致       |
| summary 六项     | `changes/{feat}/summary.md` 含 6 项强制字段（见 `开发流程规范.mdc`）            |
| alwaysApply 合理 | 常驻 Rule 不过载；业务细节用 `globs` 按需加载                                   |
| 安全四件套一致        | `cli.json`、`permissions.json`、`hooks.json`、`.cursorignore` 策略不冲突 |
| 权威源唯一          | Skill 行为以 `SKILL.md` 为准，禁止镜像正文到 `docs/`                          |
| 废弃资产           | 不复活 `MANIFEST.yml` 中 `deprecated_*` 项                            |

## 问题分级

- **阻断（BLOCKER）** — 必须修复，阻塞合并
- **警告（WARNING）** — 建议改进，须人工确认
- **提示（INFO）** — 可选优化

## 输出模板

```markdown
# Review Report — {feat-name}

## Summary
- Files: N | BLOCKER: N | WARNING: N | INFO: N
- Verdict: PASS / NEEDS_FIX

## Architecture
- [ ] Pass / FAIL: {description}

## Redlines
- [ ] Pass / FAIL: {description}

## Domain Security
- [ ] Pass / FAIL: {description}

## Harness Config（范围含 AI 配置时填写，否则 N/A）
- [ ] Pass / FAIL: {description}

## Issues

### BLOCKER: {title}
- File: `path:line`
- Fix: ...

### WARNING: {title}
- File: `path:line`
- Suggestion: ...
```

## 约束

1. 阻断项未清零时，结论必须为 NEEDS_FIX
2. 涉及 `安全规范.mdc` 警告项的代码必须标注 ⚠️ 需人工审查
3. 须覆盖所有变更文件，不可仅抽查
4. 范围含 AI 配置时，须输出 **Harness Config** 段落（无则标 N/A）
