# 5 分钟快速入门

> 复制下方提示词到 **Cursor Agent** 即可开始。Skill 的 `requires` 字段会自动关联规则，通常只需 `@Skill` 即可。

---

## 选场景


| 你的情况               | @ Skill                             | 章节  |
| ------------------ | ----------------------------------- | --- |
| 新功能 / PRD，还没分析     | `@request-analysis`                 | §1  |
| summary 已有，开始写代码   | `@coding-skill`                     | §2  |
| 编码完成，补单测           | `mvn test` / 对话生成                   | —   |
| 提交 MR 前评审          | `@expert-reviewer`                  | §3  |
| 评审 Harness / AI 配置 | `@expert-reviewer`                  | §3  |
| 部署 / 冒烟验证          | `curl http://localhost:8080/health` | —   |
| 查看 AI 代码率 / 提交统计   | 见 §4                                | §4  |


**推荐流水线：**

```text
request-analysis → coding-skill → expert-reviewer
```

---

## §1 需求分析

```markdown
@request-analysis

为【{功能名}】做需求分析，直接输出。

- feat-name：{kebab-case 名称}
- 需求：[粘贴 PRD 或用户故事]
- 输出：docs/changes/{feat-name}/summary.md（含 6 项强制字段 + 任务拆分）
- 模糊项必须列出待澄清，禁止自行假设
```

模板：复制 `docs/changes/TEMPLATE-feature/summary.md` 到 `docs/changes/{feat-name}/`。

---

## §2 编码实现

```markdown
@coding-skill

按 summary 实现【{功能名}】，直接编码。

- summary：docs/changes/{feat-name}/summary.md
- 本批任务：summary 中任务 #1、#2
- 单次改动不超过文件行数 40%，每轮 mvn compile 通过后再继续
```

**仅前端：**

```markdown
@coding-skill

实现【{功能名}】前端页面，直接编码。
- summary：docs/changes/{feat-name}/summary.md
- 范围：types + api + store + views/{module}/
```

---

## §3 专家评审

```markdown
@expert-reviewer

对本次变更做领域维度代码评审，直接输出报告。

- 范围：git diff 或 @指定文件
- feat：{feat-name}
- 阻断项未清零则结论必须为 NEEDS_FIX
```

**评审 Harness / AI 配置：**

```markdown
@expert-reviewer

评审 Harness AI 配置变更，直接输出报告。

- 范围：.cursor/、AGENTS.md、.cursorignore
- 须覆盖：MANIFEST 同步、summary 六项、安全四件套、alwaysApply 合理性
```

---

## §4 AI 代码率统计（ai-stats）

> **你只需正常用 Agent 写代码、用终端 `git commit`** — Hook 自动写入 `AI-*` trailer，无需手写。

### 首次配置（本机）

**推荐（Cursor）：** 打开本仓库后，`workspaceOpen` 或首次 Agent `sessionStart` → 按 §5.2.1：首次（本机未就绪）自动完整 setup；已就绪且最近提交有 `AI-Authored:` 则跳过；缺标再 setup；失败不阻断。若本机 `workspaceOpen` 不执行（Cursor 已知缺口），开一次 Agent 对话即可由 `sessionStart` 补跑。

**一键运维 / 诊断：**

```bash
# Windows
.cursor\hooks\ai-stats\setup-ai-stats.bat
# Mac / Linux
.cursor/hooks/ai-stats/setup-ai-stats.sh
# 或
node .cursor/hooks/ai-stats/setup-ai-stats.cjs --setup
```

- **无 Husky**（本模板）：`--setup` 可将 `core.hooksPath` 指到 `.cursor/hooks/ai-stats`；入口为 thin wrapper（`require('./hooks.cjs')`），**禁止**无后缀硬链当 Git hook
- **有 Husky**：不得强制改指 ai-stats；应由 `.husky/*` 调用 `node .../hooks.cjs <hook> "$@"`（须带 `"$@"`）

（可选）`CURSOR_USER_EMAIL` 与 git 邮箱一致 → 写入 `AI_EMAIL` trailer；设置后重启 Cursor。

```powershell
# Windows
[Environment]::SetEnvironmentVariable("CURSOR_USER_EMAIL", (git config user.email), "User")
```

```bash
# Linux / macOS
export CURSOR_USER_EMAIL="$(git config user.email)"
```

### 日常怎么用

| 步骤 | 你做什么 | 系统自动做什么 |
| --- | --- | --- |
| 1 | 用 Agent 改代码（Write/StrReplace） | 记录行 hash → `trace/active.jsonl`（排除路径跳过） |
| 2 | **终端** `git add` + `git commit` | 对账 → 注入 trailer |
| 3 | 想看团队数据 | 跑下方汇总命令 |

**推荐终端提交**；勿依赖 Cursor SCM 面板（部分版本会跳过 Git 钩子，导致无 `AI-Authored`）。

**禁止** `git commit --no-verify`（会漏统计）。

### 漏标提示与自动补救

门禁满足时（有 `active` AI 采集、无 `AI-Authored`、未 push、非 merge 等），`afterShellExecution` / `pre-push` 会尝试 **soft reset + 重 commit** 自动补标（改 SHA）。

```text
[ai-stats] 已自动补标 7e75c6f→4bdb44d（soft reset + recommit）。
```

若在 **push 时**刚补标成功：本次 push 会失败一次并提示再 `git push`（确保推送新 SHA）。无法补救时 push **仍继续**，仅 warn。

| 现象 | 处理 |
| --- | --- |
| 终端提交有 trailer、SCM 无 | 推荐终端；push 前可自动补 HEAD；或手动 `git reset --soft HEAD~1` 后重提 |
| push 提示「已自动补标…请再次 push」 | 再执行一次 `git push` 即可 |
| 有 Husky 且终端也无 trailer | 检查 `hooksPath` / `"$@"` / 禁无后缀硬链；再 `--setup` |
| 全排除路径提交 | 合法不写 trailer，不自动补救、不漏标提示 |
| 关闭自动补救 | `AI_STATS_NO_AUTO_FIX=1` |

### 快速验证

```bash
# 提交后看 trailer（有 AI 参与时应含 AI-Authored: yes）
git log -1 --format=%B

# 近 7 天摘要
node .cursor/hooks/ai-stats/ai-stats.cjs --since 7d

# 按提交人汇总（git user.email）
node .cursor/hooks/ai-stats/ai-stats.cjs --since 7d --by-author

# 导出 Markdown 报告
node .cursor/hooks/ai-stats/ai-stats.cjs --since 7d --md

# 固定周期（闭合时间窗）
node .cursor/hooks/ai-stats/ai-stats.cjs --since 2026-08-01 --until 2026-08-15 --md
```

| 指标 | 含义 |
| --- | --- |
| 有效提交数 | 带 AI-* trailer 的 commit 数量 |
| AI 提交率 | `AI-Authored: yes` 的 commit 占比 |
| AI 行占比 | AI 增删行 ÷ 总变更行 |
| 人工行数 | 总变更行 − AI 行（报表差集） |
| 漏标率 | `AI-Authored: unknown` 占比 |

路径排除：见 `.cursor/hooks/ai-stats/ai-stats.exclude.json`。细则：`.cursor/rules/提交规范.mdc`。

完整培训手册：`local-doc/AI-STATS.md`（不进 Git）。

---

## MCP 与密钥（可选）

1. 复制 `.env.example` → `.env`，填写 `GITHUB_TOKEN`
2. `.cursor/mcp.json` 已引用 `${GITHUB_TOKEN}`，重启 Cursor 后 GitHub MCP 生效
3. Agent 禁止读写 `.env`（见 `cli.json` / `.cursorignore`）

---

## 验证命令

```bash
# 后端编译 + 测试
cd skyworkshop-backend && mvn -q test

# 前端构建
cd skyworkshop-frontend && npm run build
```

---

## 进一步阅读


| 文档                                 | 用途                          |
| ---------------------------------- | --------------------------- |
| [AGENTS.md](../AGENTS.md)          | 技术栈、红线、文件索引                 |
| [MAINTENANCE.md](./MAINTENANCE.md) | Harness 维护手册（含 ai-stats 维护） |
| `local-doc/AI-STATS.md`            | AI 代码率培训手册（本机）              |
| `.cursor/skills/README.md`         | Skill 索引                    |


