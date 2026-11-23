# AI 代码统计 — 交接索引（As-Built + 增量）

| 字段 | 内容 |
|------|------|
| 日期 | 2026-08-26（F-SCM-AUTO-REMEDIATE 自动补标） |
| 基线设计 | `docs/superpowers/specs/2026-06-30-ai-stats-design.md` |
| 增量设计 | `docs/superpowers/specs/2026-08-24-ai-stats-exclude-prune-setup-design.md` |
| 自动补救 | `docs/superpowers/specs/2026-08-26-ai-stats-auto-remediate-design.md` |
| 实现计划 | `docs/superpowers/plans/2026-08-25-ai-stats-exclude-prune-setup.md` |
| 用户文档 | `.cursor/rules/提交规范.mdc` · `docs/QUICKSTART.md` §4 · `docs/MAINTENANCE.md` |

---

## 需求 ID 索引

| ID | 主题 | 要点 | Spec |
|----|------|------|------|
| **F-WIN-STDIN** | Windows Cursor hook stdin | 空 stdin / `EOF` 导致 Agent 编辑漏记；采集侧 harden 读入；fail-open | §6.1 |
| **F-SCM-HOOKS** | Cursor SCM 跳过 Git 钩子 | SCM 注入 `hooksPath=devNull`；**与归因无关**；推荐终端提交；未 push 用 `git commit --amend --no-edit`；ai-stats 不能根治 | §6.2 |
| **F-SETUP-HUSKY** | Husky vs 纯 ai-stats | 有 `.husky` 禁止强制 `hooksPath=ai-stats`；Husky → `node hooks.cjs <hook> "$@"`；**禁无后缀硬链**当 ESM 入口；force 时追加调用不整页覆盖 | §6.3 |
| **F-MISSING-TRAILER-WARN** | 漏标提示（不拦截） | 有 AI 痕迹且无 `AI-Authored:` → stderr 提示；`post-commit` / `pre-push` / `afterShellExecution`；一律 `exit 0`；不自动 amend | §6.4 |
| **F-UNTIL-RANGE** | 汇总闭合时间窗 | `ai-stats.cjs --until`；MD/JSON 显示起止；**不合入**旧 author/message 排除 | §6.5 |
| **F-SCM-AUTO-REMEDIATE** | 漏标自动补救 | 7 门禁；仅 `active`；soft reset + recommit；通道 `pre-push` + `afterShellExecution`；已 push 不改；补标成功时 pre-push exit 1 请再 push | `2026-08-26-…-auto-remediate` |

相关能力（无独立 F-ID，见增量设计）：路径排除（§3）、active 7 天 prune（§4）、`setup-ai-stats` 一键运维（§5）。

---

## 运维入口

```bash
node .cursor/hooks/ai-stats/setup-ai-stats.cjs --setup
# 或 setup-ai-stats.bat / setup-ai-stats.sh
```

冒烟：

```bash
node .cursor/hooks/ai-stats/run-tests.cjs
```

`workspaceOpen` / `sessionStart` → 同文件（无 `--setup`）：按 §5.2.1 决策——本机未就绪或最近提交缺 `AI-Authored:` 时跑完整 setup；就绪且有标则跳过；失败一律 `exit 0`。`sessionStart` 兜底 Cursor 不执行 `workspaceOpen` 命令的缺口。显式 `--setup` 失败非 0。原 `ensure-hooks-path.cjs` 已由 setup 承接。

---

## 文档同步检查（AC-Z2 / AC-L3）

```powershell
rg -n "SCM|漏标|setup-ai-stats|AI-Authored|amend --no-edit|无后缀硬链|\"\$@\"" .cursor/rules/提交规范.mdc docs/QUICKSTART.md docs/MAINTENANCE.md
```
