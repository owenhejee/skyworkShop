# AI 代码统计 — 漏标自动补救（F-SCM-AUTO-REMEDIATE）

| 字段 | 内容 |
|------|------|
| 状态 | **已实现 / As-Built** |
| 日期 | 2026-08-26 |
| 基线 | `docs/superpowers/specs/2026-08-24-ai-stats-exclude-prune-setup-design.md` §6.2 / §6.4 |
| 方案 | **B + 通道 2**：未 push 时自动 soft reset + 重 commit；挂 `pre-push` + `afterShellExecution` |
| 范围 | `.cursor/hooks/ai-stats/`（仓级 `hook-stdin.cjs` / `block-destructive-ops.cjs` 已移除） |

---

## 1. 目标

在「有 AI 采集证据但 commit message 无 `AI-Authored:`」时，**自动**把 **HEAD** 补成带 trailer 的新提交（改 SHA），减少 SCM / `--no-verify` 漏标。

非目标：

- 不根治 Cursor SCM `hooksPath=devNull`
- 不自动 force push / 不改已上远程的历史
- 不用 archive 做自动补救证据
- 不批量改多条 unpushed
- 不在补救失败时拦截「正常」push（见 §4 对 pre-push 的特殊语义）

---

## 2. 触发门禁（须全部满足）

| # | 条件 |
|---|------|
| 1 | 只处理 **HEAD** 一条 |
| 2 | message **无** `AI-Authored:`（已有 `yes`/`no`/`unknown` 均不碰） |
| 3 | **`active.jsonl`** 存在 `source=agent` 的 trace，且与 HEAD 改动文件（排除后）有 fileKey 交集 |
| 4 | **不**使用 archive 作为自动补救证据 |
| 5 | 存在可统计业务文件（非 staged/HEAD 全 exclude） |
| 6 | HEAD **尚未**被 `@{u}` 包含（`merge-base --is-ancestor HEAD @{u}` 为真 → 不改；无 upstream → 可改） |
| 7 | **非** merge commit |

额外：

- `AI_STATS_NO_AUTO_FIX=1` → 跳过自动补救（仍可 warn）
- 文件锁 `trace/remediating.lock`：持锁中直接跳过

---

## 3. 补救动作

等价于（禁止对空 staged 做 `amend --no-edit`）：

1. 读取 `oldSha`、原 message（`%B`）
2. `git reset --soft HEAD~1`（保留 index）
3. `git -c core.hooksPath=<ai-stats目录> commit -F <msgfile>`（跑 prepare-commit-msg）
4. 校验新 HEAD 含 `AI-Authored:`；失败则尽量恢复（见实现 fail-open）

成功 stderr 示例：

```text
[ai-stats] 已自动补标 7e75c6f→4bdb44d（soft reset + recommit）。
```

---

## 4. 通道与 push 语义

| 通道 | 行为 |
|------|------|
| `afterShellExecution`（matcher `git\s+commit`） | 门禁通过 → 补救；Cursor hook **始终 exit 0** |
| `pre-push` | 先尝试补救；**若本次成功改写了 HEAD** → **exit 1**，文案要求再 `git push` 一次（因 Git 已锁定旧 SHA，同一次 push 无法推送新对象）；若未补救或失败 → **exit 0** + 原有漏标 warn |

说明：这不是「因缺标永久拦截」，而是「补标后需再推一次，避免远程仍收到无 trailer 的旧 SHA」。缺标且无法补救时 push **仍放行**。

---

## 5. 验收（AC）

| ID | 场景 | 期望 |
|----|------|------|
| AC-R1 | 门禁全过 + active 有交集 | soft reset + 新 HEAD 有 `AI-Authored` |
| AC-R2 | 已有 `AI-Authored:` | 不改 SHA |
| AC-R3 | 仅 archive 有证据、active 无 | 不补救 |
| AC-R4 | 全 exclude | 不补救 |
| AC-R5 | HEAD 已在 `@{u}` | 不补救 |
| AC-R6 | merge HEAD | 不补救 |
| AC-R7 | `AI_STATS_NO_AUTO_FIX=1` | 不补救 |
| AC-R8 | pre-push 补救成功 | exit 1 + 提示再 push |
| AC-R9 | pre-push 未补救 | exit 0（可 warn） |
| AC-R10 | afterShell 路径 | 补救后 Cursor 侧 exit 0 |

---

## 6. 文件清单

- Modify: `core.cjs`（`tryAutoRemediateHead` / gates / `runPrePush`）
- Modify: `hooks.cjs`（afterShell 调补救；pre-push 尊重 exitCode）
- Modify: `run-tests.cjs`
- Modify: 提交规范 / QUICKSTART / MAINTENANCE / handoff
- hooks.json / setup：**通常不改**
