# Harness 维护手册

> 全局唯一维护文档。修改 Skill / Rule / Hook 后按本清单自检。

## 权威源

| 类型 | 权威源 | 说明 |
|------|--------|------|
| Skill 行为 | `.cursor/skills/{name}/SKILL.md` | 唯一行为定义 |
| 元数据索引 | `.cursor/MANIFEST.yml` | Skill/Rule 注册表 |
| 项目入口 | `AGENTS.md` | 技术栈、红线摘要、文件索引 |
| 规则 | `.cursor/rules/*.mdc` | 中文命名，见 MANIFEST |

## 当前 Skills

| Skill | Stage | 路径 |
|-------|:-----:|------|
| `request-analysis` | 1-3 | `.cursor/skills/request-analysis/SKILL.md` |
| `coding-skill` | 4 | `.cursor/skills/coding-skill/SKILL.md` |
| `expert-reviewer` | 6 | `.cursor/skills/expert-reviewer/SKILL.md` |

## 修改 Skill 检查清单

1. 更新 `SKILL.md`（含 `description` 触发词与 `requires` 字段）
2. 更新 `.cursor/MANIFEST.yml` 对应条目
3. 更新 `.cursor/skills/README.md` 表格（如有 Stage/名称变化）
4. 更新 `AGENTS.md` 文件索引（如有路径变化）
5. 更新 `docs/QUICKSTART.md` 提示词（如有调用方式变化）

## 修改 Rule 检查清单

1. 更新对应 `.cursor/rules/{名称}.mdc`
2. 更新 `.cursor/MANIFEST.yml` rules 段（`id` 与 `path` 对应）
3. 检查引用该规则的 `SKILL.md` 与 MANIFEST 的 `requires_rules` 路径一致
4. 红线变更时同步 `AGENTS.md` 摘要（8 条以内）

## 修改安全/权限配置检查清单

以下四处须**联动核对**，改一处时检查其余三处是否仍一致：

| 文件 | 职责 |
|------|------|
| `.cursor/cli.json` | Agent CLI allow/deny（读写路径、危险 Shell） |
| `.cursor/permissions.json` | 终端放行列表 + Auto-review 阻断说明 |
| `.cursor/hooks.json` + `hooks/ai-stats/*.cjs` | ai-stats 采集（stdin 解析内置于 `core.cjs`） |
| `.cursorignore` | Agent 索引/读取忽略（密钥、生产配置） |

## Harness 配置 PR 检查项

变更 `.cursor/`、`AGENTS.md`、`.cursorignore` 时，PR 描述须确认：

- [ ] `MANIFEST.yml` 与相关 `SKILL.md` 已同步
- [ ] 安全四件套（上表）无策略冲突
- [ ] `docs/QUICKSTART.md` 提示词仍可用（如有调用方式变化）
- [ ] 未在 `docs/` 镜像 Skill/Rule 正文
- [ ] `@expert-reviewer` 对 Harness 配置维度可过检

## 修改 Wiki 检查清单

| 变更类型 | 须同步 |
|----------|--------|
| 新增 API | `docs/wiki/接口协议.md` |
| 新增/修改表 | `docs/wiki/数据模型.md` |
| 新增实体/状态 | `docs/wiki/业务模型.md`、`docs/wiki/领域术语.md` |

Wiki 实体字段建议附 `源码：` 链接到对应 Java/TS 文件。

## ai-stats（AI 代码率统计）

### 快速使用（Tech Lead / 开发者）

```text
Agent 改代码 → 终端 git commit（自动写 trailer）→ ai-stats.cjs 读 trailer 出报表
```

| 角色 | 动作 | 命令 |
|------|------|------|
| 开发者（首次） | 一键配置 / 诊断 | `setup-ai-stats.bat` / `.sh` 或 `node .../setup-ai-stats.cjs --setup` |
| 开发者（日常） | **终端**提交 | 禁止 `--no-verify`；勿依赖 SCM 面板 |
| Tech Lead | 看近 7 天 | `node .cursor/hooks/ai-stats/ai-stats.cjs --since 7d` |
| Tech Lead | 出周报 | `node .cursor/hooks/ai-stats/ai-stats.cjs --since 7d --md` |
| Tech Lead | 固定周期 | `node .cursor/hooks/ai-stats/ai-stats.cjs --since 2026-08-01 --until 2026-08-15 --md` |
| Tech Lead | 导出 JSON | `node .cursor/hooks/ai-stats/ai-stats.cjs --since 30d --json` |

**指标：** 有效提交数、AI 提交率、AI 行占比、人工行数、漏标率。排除 merge / CI bot；路径排除见 `ai-stats.exclude.json`。

**采集边界：** Agent `Write`/`StrReplace` 经 `postToolUse` 或 `afterFileEdit` 采集；命中 `excludePaths` 全链路跳过。Tab 补全（`afterTabFileEdit`）**不采集**。

培训：`local-doc/AI-STATS.md` · 规范：`.cursor/rules/提交规范.mdc` · 增量设计：`docs/superpowers/specs/2026-08-24-ai-stats-exclude-prune-setup-design.md` · 交接：`docs/superpowers/specs/2026-08-24-ai-stats-handoff.md`

### 文件职责

| 文件 | 职责 |
|------|------|
| `.cursor/hooks/ai-stats/core.cjs` | hash、trace、排除、prune、归因、trailer、漏标提示 |
| `.cursor/hooks/ai-stats/hooks.cjs` | Cursor + Git 入口（含 pre-push / afterShellExecution） |
| `.cursor/hooks/ai-stats/setup-ai-stats.cjs` | 唯一运维入口：`workspaceOpen` / `sessionStart` + `--setup`（替换原 `ensure-hooks-path.cjs`） |
| `.cursor/hooks/ai-stats/setup-ai-stats.bat` / `.sh` | Windows / Unix 一键入口 |
| `.cursor/hooks/ai-stats/ai-stats.cjs` | 离线汇总 CLI |
| `.cursor/hooks.json` | 注册 `workspaceOpen`/`sessionStart`→setup、采集事件、`afterShellExecution` |
| `.cursor/hooks/ai-stats/ai-stats.exclude.json` | 路径排除（`excludePaths`） |

### 本机 Git Hook（setup）

打开仓库或新开 Agent 时 `setup-ai-stats.cjs`（无 `--setup`）按 §5.2.1：本机未就绪或最近非 merge 缺 `AI-Authored:` → 完整 setup（force + 诊断 + 冒烟）；就绪且有标 → 跳过；失败一律 `exit 0`。`sessionStart` 兜底部分 Cursor 版本不执行 `workspaceOpen` 命令的缺口。

手动运维：

```bash
node .cursor/hooks/ai-stats/setup-ai-stats.cjs --setup
```

| 仓类型 | 期望 `core.hooksPath` |
|--------|------------------------|
| 无 Husky | `.cursor/hooks/ai-stats` |
| 有 `.husky` | `.husky/_`；**禁止**强制改为 ai-stats；`.husky/*` 须 `node .../hooks.cjs <hook> "$@"`；**禁止**无后缀硬链入口 |

### 现场问题速查

| 问题 | 处理 |
|------|------|
| SCM 提交无 `AI-Authored`、终端有 | Cursor `hooksPath=devNull`；改用终端；未 push 可由 `pre-push`/`afterShell` 自动 soft-reset 补标（见 F-SCM-AUTO-REMEDIATE） |
| push 因「已自动补标」失败一次 | 预期：再 `git push` 推送新 SHA |
| 有 Husky 且 hooksPath 误指 ai-stats | `git config --local core.hooksPath .husky/_` → 重装 husky → `--setup` |
| Husky 脚本无 trailer | 确认调用含 `"$@"`；勿用无后缀硬链；`--setup` 对已有脚本**追加**调用行 |
| 漏标 warn 且未自动补 | 查门禁（active / exclude / 已 push / merge）；或设 `AI_STATS_NO_AUTO_FIX` |
| Windows 采集偏少 | 见 handoff `F-WIN-STDIN`；确认 hooks 使用可靠 stdin 读入 |

### 修改 ai-stats 检查清单

1. 改 `core.cjs` 后必跑：`node .cursor/hooks/ai-stats/run-tests.cjs`
2. 改采集事件时同步 `.cursor/hooks.json` 与 `local-doc/AI-STATS.md` 采集边界说明
3. 改 trailer / 漏标文案时同步 `.cursor/rules/提交规范.mdc` 与 `docs/QUICKSTART.md` §4
4. 改 CLI / setup 时同步本文件与 handoff
5. `trace/`、`reports/`、`test/`、本地 hook 入口已在 `.gitignore`；冒烟入口为已提交的 `run-tests.cjs`（单文件）

## 已废弃的 Harness 资产

| 原 Harness 资产 | 说明 |
|-----------------|------|
| `unit-test-write` Skill | 已由对话生成或 `mvn test` 替代 |
| `unit-test-ci` Skill | 已由 CI 质量门禁替代 |
| `deploy-verify` Skill | 已由健康检查命令替代 |
| `code-reviewer` Agent | 已由 `expert-reviewer` Skill 替代（`@expert-reviewer`） |
| `test-writer` Agent | 已由 `mvn test` / 对话生成替代 |

## 团队治理（最小集）

- 分支策略：`main` + `feature/*`
- Harness 配置变更须 PR，至少 1 人 Review
- 季度检查：最近 5 个 PR 中红线是否被执行

## 文档漂移预防

- 禁止在 `docs/skills/*/OPERATIONS.md` 等镜像文档中重复 SKILL 正文
- 提示词以 `docs/QUICKSTART.md` 为准
