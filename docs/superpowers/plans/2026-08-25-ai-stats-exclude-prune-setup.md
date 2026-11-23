# AI-stats 排除 / prune / setup / 漏标提示 Implementation Plan

> **Status:** **As-Built（已落地）**。冒烟入口为已提交的 `.cursor/hooks/ai-stats/run-tests.cjs`（外层单文件）；`.cursor/hooks/ai-stats/test/` 仍可本地扩展且 gitignore，**勿**再以 `test/run-tests.cjs` 为权威路径。  
> **For agentic workers（历史）：** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.  
> **REQUIRED:** superpowers:test-driven-development for every behavior change.  
> **REQUIRED before done claims:** superpowers:verification-before-completion（先跑命令再断言）。

**Goal:** 按 `docs/superpowers/specs/2026-08-24-ai-stats-exclude-prune-setup-design.md` 落地路径排除、active 清理、一键运维、Windows stdin、漏标提示（不拦截），并同步文档。

**Architecture:** 逻辑仍集中在 `core.cjs`；`hooks.cjs` 只分发 Cursor/Git 事件；`setup-ai-stats.cjs` 替换 `ensure-hooks-path.cjs`；漏标用共享 `warnIfMissingTrailer`，挂 `post-commit` / `pre-push` / `afterShellExecution`。**禁止** `require` ai-stats 目录外业务文件。

**Tech Stack:** Node.js 18+（本机已验证 v24.x 可用）、Git 2.x、Cursor Hooks；**冒烟** `node .cursor/hooks/ai-stats/run-tests.cjs`（已提交）；可选本地 `test/`（gitignore）。

**Spec:** `docs/superpowers/specs/2026-08-24-ai-stats-exclude-prune-setup-design.md`  
**Baseline plan:** `docs/superpowers/plans/2026-06-30-ai-stats.md`（编码/UTF-8 约定继承）

## Global Constraints

- 范围：`.cursor/hooks/ai-stats/` 增量；仓级 `hook-stdin.cjs` / `block-destructive-ops.cjs` **已移除**（勿再恢复）
- fail-open：排除/prune/warn/setup 诊断失败 **不阻断** commit / push / Agent（漏标相关一律 `exit 0`）
- 禁止自动 `amend` / 改写 SHA
- 有 `.husky`：**禁止**强制 `core.hooksPath=ai-stats`
- 漏标文案必须用 spec §6.4 固定模板（简洁、无「拦截/失败」）
- 单测目录 `.cursor/hooks/ai-stats/test/` **不提交**（可选本地）；权威冒烟为外层已提交的 `run-tests.cjs`
- 每次行为改动：**先写失败测试 → 再写最小实现 → 再跑全量本地测试**

---

## 文件清单

| 操作 | 路径 | 说明 |
|------|------|------|
| Create | `.cursor/hooks/ai-stats/setup-ai-stats.cjs` | workspaceOpen + `--setup` |
| Create | `.cursor/hooks/ai-stats/setup-ai-stats.bat` | Windows 入口 |
| Create | `.cursor/hooks/ai-stats/setup-ai-stats.sh` | Unix 入口 |
| Create (local) | `.cursor/hooks/ai-stats/pre-push` | setup 生成 → hooks.cjs |
| Create (local) | `.cursor/hooks/ai-stats/test/unit/exclude*.cjs` 等 | 单测（gitignore） |
| Modify | `.cursor/hooks/ai-stats/core.cjs` | exclude / prune / warn / stdin helpers |
| Modify | `.cursor/hooks/ai-stats/hooks.cjs` | pre-push、afterShellExecution、stdin |
| Modify | `.cursor/hooks/ai-stats/ai-stats.js` | 去掉旧 exclude 字段逻辑 |
| Modify | `.cursor/hooks/ai-stats/ai-stats.exclude.json` | §3.1 默认路径 |
| Modify | `.cursor/hooks.json` | workspaceOpen→setup；afterShellExecution |
| Modify | `.gitignore` | 忽略 `pre-push`（与 prepare/post 一致） |
| Delete | `.cursor/hooks/ai-stats/ensure-hooks-path.cjs` | 由 setup 替换 |
| Modify | `.cursor/rules/提交规范.mdc` | SCM / Husky / 漏标提示 |
| Modify | `docs/QUICKSTART.md` / `docs/MAINTENANCE.md` | 运维与排查 |
| Create/Modify | `docs/superpowers/specs/2026-08-24-ai-stats-handoff.md` | 需求 ID 索引 |

---

## Phase 0 — 开工门禁（每个会话开始都跑）

- [ ] **Step 0.1: 确认分支与工作区**

```powershell
cd "f:\AI开发\标准项目结构\harness-project-structure"
git status -sb
git branch --show-current
```

Expected: 不在 `main`/`master` 裸改（当前可为 `ai-commit-trailer` 或新建 feature 分支）。若需隔离：用 **using-git-worktrees** 建 worktree 再开发。

- [ ] **Step 0.2: 建议新建实现分支（可选但推荐）**

```powershell
git checkout -b feat/ai-stats-exclude-prune-setup
```

- [ ] **Step 0.3: 基线测试（有则跑；无则记录）**

```powershell
node .cursor/hooks/ai-stats/test/run-tests.cjs
```

Expected: 现有用例全绿，或明确列出已知失败（实现前不得扩大失败面）。

- [ ] **Step 0.4: 记录 hooksPath**

```powershell
git config --local --get core.hooksPath
```

---

## Task 1: 路径排除（§3，AC-E1～E8）

**Files:**
- Modify: `.cursor/hooks/ai-stats/core.cjs`
- Modify: `.cursor/hooks/ai-stats/ai-stats.exclude.json`
- Modify: `.cursor/hooks/ai-stats/ai-stats.js`
- Test: `.cursor/hooks/ai-stats/test/unit/exclude.test.cjs`（本地）

**Produces:** `loadPathExclude()`, `shouldExcludeRelPath(rel)`, 采集/对账共用

- [ ] **Step 1.1: 写失败单测**（后缀、`/lib` 前缀、`*` 不跨目录、`**` 跨目录、空配置、Windows `\` 归一、全排除不写 trailer）

- [ ] **Step 1.2: 跑测确认 RED**

```powershell
node .cursor/hooks/ai-stats/test/run-tests.cjs
```

Expected: 新 exclude 用例 FAIL

- [ ] **Step 1.3: 最小实现** — `core.cjs` 加载 `ai-stats.exclude.json`；采集 pre/post/after 与 `runPrepareCommitMsg` 跳过命中路径；staged 全排除 → 不新写 AI trailer（保留 yes 保护）

- [ ] **Step 1.4: `ai-stats.js` 删除旧 author/message exclude 字段逻辑**

- [ ] **Step 1.5: 跑测 GREEN**

```powershell
node .cursor/hooks/ai-stats/test/run-tests.cjs
```

- [ ] **Step 1.6: Commit**（仅在用户要求或计划约定允许时）

```powershell
git add .cursor/hooks/ai-stats/core.cjs .cursor/hooks/ai-stats/ai-stats.exclude.json .cursor/hooks/ai-stats/ai-stats.js
git commit -m "$(cat <<'EOF'
feat(ai-stats): add path exclude for collection and attribution

EOF
)"
```

> Windows PowerShell 若无 HEREDOC：用 `git commit -m "feat(ai-stats): add path exclude for collection and attribution"`。

---

## Task 2: active.jsonl 清理（§4，AC-P1～P4）

**Files:**
- Modify: `.cursor/hooks/ai-stats/core.cjs`
- Test: `.cursor/hooks/ai-stats/test/unit/prune-active.test.cjs`

**Produces:** `pruneActiveTrace({ now?, dryRun? })` → `{ kept, removed }`

- [ ] **Step 2.1: RED 测试** — 超龄孤儿删；超龄但仍 dirty 留；未满 7 天留；命中 exclude 但未超龄仍保留

- [ ] **Step 2.2: 跑测 RED → 实现 → GREEN**

```powershell
node .cursor/hooks/ai-stats/test/run-tests.cjs
```

- [ ] **Step 2.3: 挂接** — `runPostCommit` 在归档/`clearStagedFromActive` **之后**调用 prune（fail-open）

- [ ] **Step 2.4: Commit**

```powershell
git commit -m "feat(ai-stats): prune orphan active traces older than 7 days"
```

---

## Task 3: Windows stdin 可靠读（§6.1，AC-W1～W3）

**Files:**
- Modify: `.cursor/hooks/ai-stats/hooks.cjs` 和/或 `core.cjs`（stdin 解析在 `core.cjs`）
- Test: `.cursor/hooks/ai-stats/test/unit/hook-stdin-win.test.cjs`（本地可选；权威冒烟用外层 `run-tests.cjs`）

- [ ] **Step 3.1: RED** — 空 stdin / EOF 不抛；告警并跳过 `runCursorHook`；仍 exit 0；**禁止**删除 `injectTrailerPreservingYes`

- [ ] **Step 3.2: GREEN + 全量测试**

```powershell
node .cursor/hooks/ai-stats/test/run-tests.cjs
```

- [ ] **Step 3.3: Commit**

```powershell
git commit -m "fix(ai-stats): harden Cursor hook stdin read on Windows"
```

---

## Task 4: setup-ai-stats 一键运维（§5 / §6.2 / §6.3，AC-S* / AC-Z* / AC-L*）

**Files:**
- Create: `setup-ai-stats.cjs` / `.bat` / `.sh`
- Delete: `ensure-hooks-path.cjs`
- Modify: `.cursor/hooks.json`（workspaceOpen 指向 setup）
- Modify: `.gitignore`（`pre-push`）

- [ ] **Step 4.1: RED/契约测试或脚本冒烟** — 无 Husky 可设 hooksPath；有 `.husky` **不**强制覆盖；诊断含 SCM/Husky 文案

- [ ] **Step 4.2: 实现 setup** — 向上找 git 根；补齐 `prepare-commit-msg` / `post-commit` / **`pre-push`** 入口（wrapper，避免 type:module 无后缀硬链）；workspaceOpen 调 prune

- [ ] **Step 4.3: 更新 hooks.json**

```json
"workspaceOpen": [{ "command": "node .cursor/hooks/ai-stats/setup-ai-stats.cjs" }]
```

- [ ] **Step 4.4: 本机验证**

```powershell
node .cursor/hooks/ai-stats/setup-ai-stats.cjs --setup
git config --local --get core.hooksPath
Get-ChildItem .cursor/hooks/ai-stats/prepare-commit-msg, .cursor/hooks/ai-stats/post-commit, .cursor/hooks/ai-stats/pre-push
```

- [ ] **Step 4.5: 删除 ensure-hooks-path.cjs；全量测试；Commit**

```powershell
node .cursor/hooks/ai-stats/test/run-tests.cjs
git add -A .cursor/hooks/ai-stats .cursor/hooks.json .gitignore
git commit -m "feat(ai-stats): replace ensure-hooks-path with setup-ai-stats"
```

---

## Task 5: 漏标提示 F-MISSING-TRAILER-WARN（§6.4，AC-M1～M5）

**Files:**
- Modify: `core.cjs` — `warnIfMissingTrailer({ scope: 'commit'|'push' })`
- Modify: `hooks.cjs` — `post-commit` 末尾、`pre-push`、`afterShellExecution`
- Modify: `.cursor/hooks.json` — `afterShellExecution` matcher `git\s+commit`

- [ ] **Step 5.1: RED 单测**
  - 有 active + 无 `AI-Authored` → 输出含固定文案；函数不抛
  - 全排除合法不写 → **不**警告
  - 检测抛错 → 仍表示成功 / 调用方 exit 0
  - 文案匹配 spec 模板（无「拦截」「失败」）

- [ ] **Step 5.2: 实现共享 warn；三通道挂接；一律 exit 0**

- [ ] **Step 5.3: hooks.json**

```json
"afterShellExecution": [
  {
    "command": "node .cursor/hooks/ai-stats/hooks.cjs",
    "matcher": "git\\s+commit"
  }
]
```

- [ ] **Step 5.4: 手工验收（证据必留）**

终端漏标模拟（在临时脏仓或测试夹具）：

```powershell
# 准备：有 active 记录 + 造一个无 trailer 的 commit 后触发 post-commit/warn
# 或直接单测覆盖 AC-M1/M2/M4/M5；AC-M3：
echo "test" | git push --dry-run 2>&1
# 若有缺标 commit，stderr 应含「推送仍继续」且 push dry-run 不因 hook 失败
```

- [ ] **Step 5.5: 全量测试 + Commit**

```powershell
node .cursor/hooks/ai-stats/test/run-tests.cjs
git commit -m "feat(ai-stats): warn on missing AI trailer without blocking"
```

---

## Task 6: 文档同步（§7，AC-Z2）

**Files:** 提交规范、QUICKSTART、MAINTENANCE、handoff

- [ ] **Step 6.1: 写入** setup 用法、终端提交、SCM 规避、Husky 双模式、漏标提示 + `git commit --amend --no-edit` 含义
- [ ] **Step 6.2: 全文检索**

```powershell
rg -n "SCM|漏标|setup-ai-stats|AI-Authored|amend --no-edit" .cursor/rules/提交规范.mdc docs/QUICKSTART.md docs/MAINTENANCE.md
```

- [ ] **Step 6.3: Commit**

```powershell
git commit -m "docs(ai-stats): document exclude, setup, SCM bypass, missing-trailer warn"
```

---

## Task 7: 汇总 `--until`（§6.5，AC-U1～U4）

**Files:**
- Modify: `.cursor/hooks/ai-stats/ai-stats.js`
- Test: `.cursor/hooks/ai-stats/test/unit/until-range.test.cjs`
- Modify: `docs/QUICKSTART.md` / `docs/MAINTENANCE.md` / handoff（`--until` 示例）

**Produces:** `parseArgs` / `buildGitLogArgs` / `formatMarkdown` 支持 until；**不合入** authorEmailGlobs

- [ ] **Step 7.1: RED 单测** — parseArgs `--until`；无 until 不带参；formatMarkdown 文案；buildGitLogArgs 含 `--until=`
- [ ] **Step 7.2: 实现最小改动（对齐 TERP 仅 until 部分）**
- [ ] **Step 7.3: GREEN + 文档一行示例**
- [ ] **Step 7.4: Commit** `feat(ai-stats): support --until for closed report ranges`

---

## Phase End — 质量门禁（verification-before-completion）

**宣称完成前必须新鲜跑完并贴证据：**

```powershell
# 1) 单元/场景
node .cursor/hooks/ai-stats/test/run-tests.cjs

# 2) setup 诊断
node .cursor/hooks/ai-stats/setup-ai-stats.cjs --setup

# 3) Spec AC 勾选对照（人工）
# AC-E1～E8, AC-P*, AC-W*, AC-S*, AC-Z*, AC-L*, AC-M1～M5

# 4) 端到端（推荐）
# Agent 或手工改业务文件 → 终端 git commit → git log -1 --format="%B" 见 AI-Authored
# 故意无 trailer 的 commit → 见漏标 stderr；git push 仍成功
```

然后用 **requesting-code-review** / **expert-reviewer** 做一次配置+代码评审；再用 **finishing-a-development-branch** 决定 merge / PR / 清理。

---

## Superpowers 会话怎么跑（给人 / Agent 的操作顺序）

| 顺序 | Skill | 你要说/做的 |
|------|--------|-------------|
| 1 | （已完成）brainstorming + spec | 设计已定稿 |
| 2 | **writing-plans** | 本文即产物 |
| 3 | **using-git-worktrees**（推荐） | 隔离分支再改 |
| 4 | **subagent-driven-development**（推荐）或 **executing-plans** | 按 Task 1→6 执行 |
| 5 | 每个 Task 内嵌 **test-driven-development** | RED→GREEN→重构 |
| 6 | Task 之间 **verification-before-completion** | 无证据不说「完成」 |
| 7 | 全部完成后 **requesting-code-review** | 对照 AC |
| 8 | **finishing-a-development-branch** | PR / merge 选项 |

**推荐开场提示词（复制到新 Agent 会话）：**

```text
使用 superpowers:subagent-driven-development 执行计划：
docs/superpowers/plans/2026-08-25-ai-stats-exclude-prune-setup.md
严格 TDD；仓级 hook-stdin / block-destructive-ops 已移除勿恢复；
漏标只提示不拦截；每完成一个 Task 跑 node .cursor/hooks/ai-stats/run-tests.cjs
并报告证据。从 Task 1 开始。
```

**若本会话内联执行：**

```text
使用 superpowers:executing-plans 执行
docs/superpowers/plans/2026-08-25-ai-stats-exclude-prune-setup.md
从 Phase 0 开始，有检查点暂停让我确认。
```

---

## Spec 覆盖自检

| Spec 块 | Plan Task |
|---------|-----------|
| §3 路径排除 | Task 1 |
| §4 active prune | Task 2 |
| §6.1 F-WIN-STDIN | Task 3 |
| §5 / §6.2 / §6.3 setup | Task 4 |
| §6.4 F-MISSING-TRAILER-WARN | Task 5 |
| §6.5 F-UNTIL-RANGE | Task 7 |
| §7 文档 | Task 6 / Task 7 文档行 |
| §8 全部 AC | Phase End |
| 不引用 ai-stats 外代码 | Global Constraints |

---

## 风险提醒

- 当前工作区已有未提交改动（hooks.json、提交规范、MAINTENANCE、QUICKSTART、ensure-hooks-path、设计文档）。开工前先 **stash / 提交 / 理清**，避免和 Task 4/6 冲突。
- `test/` 不进 Git：换机器要重新有测试或从本机拷贝；CI 若无 test 则依赖 `--setup` 跳过单测的约定。
