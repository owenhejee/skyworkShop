# AI 代码统计 — 路径排除 / active 清理 / 一键运维（设计）


| 字段   | 内容                                                                                 |
| ---- | ---------------------------------------------------------------------------------- |
| 状态   | **已实现 / As-Built**（实现计划见 `docs/superpowers/plans/2026-08-25-ai-stats-exclude-prune-setup.md`；冒烟：`node .cursor/hooks/ai-stats/run-tests.cjs`） |
| 日期   | 2026-08-24（2026-08-25 增补 §6.4 漏标提示、§6.5 `--until`）                            |
| 基线   | `docs/superpowers/specs/2026-08-24-ai-stats-handoff.md`（As-Built）                  |
| 澄清   | grill-me + 小潘现场版对比 + 周灵/吕祥 + 漏标提示 + TERP `--until` 闭合时间窗（F-UNTIL-RANGE） |
| 范围   | `.cursor/hooks/ai-stats/` 内增量（仓级 `hook-stdin.cjs` / `block-destructive-ops.cjs` 已移除） |
| 现场参考 | `F:\AI开发\数字平台项目\AI统计问题收集\`：`小潘-*.cjs`、`周灵-cursor_git_submission_ai_statistics.md`、`吕祥-cursor_ai_stats_hooks_issue.md`（仅需求提炼，**不**直接覆盖标准项目） |


---

## 1. 目标

在现有 ai-stats（采集 → trailer → 汇总）上增加：

1. **路径排除**：按后缀 / 目录 / glob 不纳入 AI 统计（模板默认排除非业务目录；可改）
2. **active 清理**：孤儿 trace 超过 7 天且不在待提交集合则删除（**不**因新 exclude 回溯删除旧记录）
3. **一键运维**：Windows `.bat` + Mac/Linux `.sh`，可重复执行；配置（可覆盖）+ 诊断 + 验证；唯一 Node 入口为 `setup-ai-stats.cjs`（承接并替换现有 `ensure-hooks-path.cjs`）
4. **Windows Cursor hook stdin 可靠采集**：避免部分 Windows 环境空 stdin / `EOF` 导致 Agent 编辑漏记 trace（见 §6.1）
5. **Cursor SCM 跳过 Git 钩子可观测与规避**（周灵现场，见 §6.2）
6. **Husky 仓正确安装链路**（吕祥现场，见 §6.3）：setup 不得把有 Husky 的仓强制指到 ai-stats
7. **漏标提示（不拦截）**：有 AI 采集 / Agent 改动痕迹，但 commit message 未写入 `AI-Authored` 时提醒用户（见 §6.4）
8. **汇总闭合时间窗**：`ai-stats.cjs` 支持 `--until`，可统计固定周期（见 §6.5；来源 TERP 现场能力）

非目标：

- 不恢复 / 不保留旧的 `authorEmailGlobs`、`commitMessageRegexExclude`（确认未使用，直接移除；**不**从 TERP 回带这两项）
- 不引入中央服务；失败仍 fail-open，不阻断 commit / Agent / push
- 不修改 Cursor 其它 hook（如 destructive 拦截）
- **不**采纳小潘版「去掉 `injectTrailerPreservingYes`」（标准项目保留 yes 不降级，F-16）
- **不能**在 ai-stats 内根治 Cursor SCM `hooksPath=devNull`（属 Cursor 产品 Bug；仅规避 + 诊断 + §6.4 在 push 兜底提示）
- **不**在提示流程中自动 `amend` / 改写 SHA
- 实现以 `docs/superpowers/plans/2026-08-25-ai-stats-exclude-prune-setup.md` 为准（TDD + 验收门禁）

---



## 2. 已确认产品口径（含 grill-me）


| 议题                              | 决定                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| exclude 文件语义                    | **替换**为路径排除；去掉作者/提交信息排除字段                                                                        |
| 排除对 trailer（混有业务文件）             | **全排除**：排除路径不采集、不计 `Lines`/`Files`、不参与 AI 归因                                                     |
| staged **全部**为排除路径              | **不写任何 AI- trailer**（该提交不进汇总分母）                                                                  |
| 全排除 + `commit --amend` 仍带旧 AI 标 | **保留旧 trailer**（不剥离、不覆盖）；排除文件一般不随意 amend                                                         |
| 采集侧跳过粒度                         | **全链路跳过**：`preToolUse` 不写 snapshot；post/after 不 diff、不写 trace                                    |
| active 与新 exclude               | **不因 exclude 回溯清除**已有 active 记录；仍只走 7 天 + dirty 规则                                               |
| active 清理「待提交」                  | `git status` dirty/untracked 仍命中则**保留**（即使 >7 天）                                                 |
| glob                            | `*` / `?` **不跨** `/`；递归显式用 `**` |
| 默认 `excludePaths`               | 见 §3.1（多仓通用非业务目录；**不含** `src/components`） |
| hooksPath 覆盖                    | **无 Husky**：完整 setup（含首次 workspaceOpen）可强制指到 ai-stats；**有 Husky**：禁止强制覆盖，走 §6.3；日常就绪且最近有标则跳过（§5.2.1） |
| workspaceOpen prune             | **要做** |
| Node 入口                         | 唯一文件 `setup-ai-stats.cjs`（workspaceOpen + `--setup`；实现时替换 `ensure-hooks-path.cjs`） |
| Windows 入口                      | `setup-ai-stats.bat`（不用 `.ps1`） |
| `--setup` 工作目录                  | **自动向上找仓库根** |
| 完整 setup 单测                   | 外层单文件 `run-tests.cjs`（无 `test/`）；不存在则跳过；`--setup` 失败非 0；`workspaceOpen` 失败仍 0 |
| `workspaceOpen` 策略              | §5.2.1：未就绪或最近缺标 → 完整 setup；就绪且有标 → 跳过 |
| Windows stdin 漏采（小潘）            | 见 §6.1 / F-WIN-STDIN |
| Cursor SCM 无 trailer（周灵）       | 见 §6.2 / F-SCM-HOOKS：**与归因代码无关**；规避 + 诊断 |
| Husky 被顶掉 / ESM 硬链失败（吕祥）       | 见 §6.3 / F-SETUP-HUSKY：**改安装脚本与文档**，非改归因算法 |
| 有 AI 痕迹但 message 无 trailer     | 见 §6.4 / F-MISSING-TRAILER-WARN：**只提示、不拦截**；文案简洁 |
| 汇总要固定起止日期（TERP）           | 见 §6.5 / F-UNTIL-RANGE：仅合入 `--until`，不合入旧 author/message 排除 |
| 仓级 hook 脚本                       | 已移除 `hook-stdin.cjs`、`block-destructive-ops.cjs`；stdin 由 `core.cjs` 自包含解析 |


---



## 3. 路径排除



### 3.1 配置与模板默认值

文件：`.cursor/hooks/ai-stats/ai-stats.exclude.json`

对照项目清单多仓（TERP / ZSK / pas-app-parent / pas-app-web / tc-cpas-web）目录后的**通用默认**（以文件夹为主，去掉非业务噪声；**不**排除业务 `src/components`）：

```json
{
  "excludePaths": "/.cursor,/.claude,/.agents,/.trae,/.husky,/.vscode,/.idea,/docs,/doc,/ai,/terp-prototype,**/node_modules/**,**/dist/**,**/target/**,**/build/**,**/coverage/**,**/vendor/**,**/public/lib/**,**/static/vendor/**,**/sql/**,**/mock/**,**/tests/**,**/test/**"
}
```


| 类别     | 规则意图                                                                                                            |
| ------ | --------------------------------------------------------------------------------------------------------------- |
| AI/IDE | `/.cursor`、`/.claude`、`/.agents`、`/.trae`、`/.husky`、`/.vscode`、`/.idea`                                         |
| 文档/原型  | `/docs`、`/doc`、`/ai`、`/terp-prototype`                                                                          |
| 构建依赖   | `**/node_modules/**`、`**/dist/**`、`**/target/**`、`**/build/**`、`**/coverage/**`（多模块 Java 的嵌套 `target` 必须用 `**`） |
| 第三方组件包 | `**/vendor/**`、`**/public/lib/**`、`**/static/vendor/**`（不是业务 Vue `components`）                                  |
| 辅料     | `**/sql/**`、`**/mock/**`、`**/tests/**`、`**/test/**`                                                             |


说明：某仓没有对应目录时规则不命中，无副作用。团队可按仓裁剪该字符串。


| 条件                                    | 行为                 |
| ------------------------------------- | ------------------ |
| 文件不存在 / JSON 缺字段 / `excludePaths` 为空串 | 不排除任何路径            |
| 非空                                    | 按 `,` 分割、trim、忽略空段 |


路径相对**仓库根**；配置与匹配统一把 `\` 归一为 `/`。前导 `/` 可选（`/lib` ≡ `lib`）。

仍支持后缀写法（如 `.map`）：以 `.` 开头且不含 `/` 时按后缀匹配；模板默认**不**用后缀排除。

### 3.2 单条规则判定（按优先级）

对相对路径 `rel`（已归一）：

1. **后缀**：条目以 `.` 开头且不含 `/`（例 `.map`）
  → `rel` 的文件名以该后缀结尾（大小写不敏感）
2. **glob**：条目含 `*`、`?` 或 `**`
  - `*` / `?`：**不跨**路径段 `/`  
  - `**`：可跨零或多级目录（例 `**/vendor/**`、`**/target/**`）  
  - 例：`/assets/font/*.svg` 匹配 `assets/font/a.svg`，**不**匹配 `assets/font/sub/a.svg`
3. **目录前缀**：其余（例 `lib`、`build`、`/.cursor`）
  → `rel === dir` 或 `rel` 以 `dir + '/'` 开头



### 3.3 生效位置


| 层                                  | 行为                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| 采集 `preToolUse`                    | 命中则**不写** snapshot                                                                |
| 采集 `postToolUse` / `afterFileEdit` | 命中则不 diff、不写 `active.jsonl`                                                       |
| 对账 `prepare-commit-msg`            | staged 命中文件不计入 `Lines`/`Files`，不参与 `attributeDiff`                                |
| 对账：staged **全部**命中排除               | **不注入、不修改** AI- trailer（含 amend 时保留 message 里已有 AI 块）                             |
| 汇总 `ai-stats.cjs`                   | 删除对 `authorEmailGlobs` / `commitMessageRegexExclude` 的读取；**保留**硬编码 merge / bot 排除 |
| active 已有记录                        | **不**因路径命中当前 exclude 而删除（见 §4）                                                    |


说明：历史已写入的 trailer 不回溯改写；排除从「新采集 / 新对账」起生效。

### 3.4 实现落点（建议，待实现时）

- `core.cjs`：`loadPathExclude()`、`shouldExcludeRelPath(rel)`；采集与对账共用
- `ai-stats.cjs`：去掉旧 exclude 字段逻辑；路径排除不在汇总层重算（trailer 已是真源）
- 单测：后缀、目录前缀、`*` 不跨目录、`**` 跨目录、空配置、Windows 路径归一、全排除不写 trailer

---



## 4. active.jsonl 清理



### 4.1 规则

对 `trace/active.jsonl` 每条记录：

1. `ts` 无法解析 → **保留**
2. `now - ts < 7 天` → **保留**
3. 路径仍属于**待提交集合** → **保留**
4. 否则 → **删除**

**明确不做：** 不因记录路径命中**当前** `excludePaths` 而提前删除。  
旧规则下写入的 active 行，即使后来才配置了 exclude，仍只按上述 1–4 处理（或随正常 commit 的 `clearStagedFromActive` 清掉）。

待提交集合：仓库根 `git status --porcelain` 解析出的路径（已改 / 删除 / 未跟踪等），相对根归一后与 trace 的 `file` / `fileKey` 匹配（与对账同源匹配逻辑）。

### 4.2 触发


| 入口                                     | 时机                                  |
| -------------------------------------- | ----------------------------------- |
| `post-commit`                          | 归档 + `clearStagedFromActive` **之后** |
| `workspaceOpen` / `sessionStart` → `setup-ai-stats.cjs` | 打开工作区或新开 Agent 会话（fail-open）；`sessionStart` 兜底 Cursor 不 spawn `workspaceOpen` 的缺口 |
| 人工 `--setup`                           | 配置/诊断流程内执行，并打印删除条数                  |




### 4.3 实现注意

- 整文件重写 active（与现有 `clearStagedFromActive` 一致）
- fail-open：失败只日志，不阻断 commit / 开仓
- 单测：超龄孤儿删；超龄但仍 dirty 留；未满 7 天留；**命中 exclude 但未超龄 → 仍保留**

---



## 5. 一键运维（`setup-ai-stats.cjs`）



### 5.1 文件

```text
.cursor/hooks/ai-stats/
├── setup-ai-stats.cjs      # 唯一 Node：workspaceOpen + --setup（替换原 ensure-hooks-path.cjs）
├── setup-ai-stats.bat      # Windows
└── setup-ai-stats.sh       # Mac / Linux
```

实现时删除（或不再保留）`ensure-hooks-path.cjs`，避免双入口。

`.bat` / `.sh`：以脚本自身目录为锚点调用 Node，并把退出码返回给用户：

```text
node setup-ai-stats.cjs --setup
```

`--setup` **自动向上查找含** `.git` **的仓库根**（双击 `.bat` 或 cwd 在 `ai-stats/` 下也可）；找不到则报错并给出处理方法。可重复执行。

### 5.2 模式对比

| | workspaceOpen（默认 / 无 `--setup`） | `--setup`（.bat / .sh） |
|--|--------------------------------------|-------------------------|
| 触发策略 | 见 **§5.2.1**（首次 / 最近提交异常 → 完整 setup；正常 → 跳过） | 用户显式执行，**始终**完整 setup |
| `core.hooksPath`（**无 Husky**） | 进入完整 setup 时与 `--setup` 相同：**强制覆盖**为 ai-stats | **强制覆盖**为 ai-stats；打印旧值 |
| `core.hooksPath`（**有 `.husky`**） | 同 `--setup`：**不**强制覆盖；Husky → `hooks.cjs`；误指 ai-stats → 告警 | 同左 |
| hook 入口（无 Husky） | 进入完整 setup 时：**强制重建** wrapper | **强制重建** |
| prune | 进入完整 setup 时执行 | 是 |
| 诊断报告 | 进入完整 setup 时：完整清单 + 处理方法（§6.2 / §6.3） | 完整清单 + 处理方法 |
| 冒烟验证 | 进入完整 setup 时：跑外层 `run-tests.cjs`（无则跳过） | 同左 |
| 失败退出码 | **一律 `exit 0`**（fail-open，不阻断 Cursor 打开仓库） | 诊断/冒烟失败 → **非 0** |

### 5.2.1 `workspaceOpen` / `sessionStart` 决策（本机首次 vs 日常）

> 目标：首次打开做完整 `--setup`；之后用「最近一次非 merge 提交是否含 `AI-Authored:`」做轻量健康信号；异常再跑完整 setup；**任何诊断/冒烟失败不得影响打开**。
>
> **Cursor 缺口兜底：** 部分版本会 `Hook step requested: workspaceOpen` 却不真正执行命令（[Forum #163244](https://forum.cursor.com/t/workspaceopen-hook-is-registered-and-requested-but-the-command-script-never-runs-linux-3-7-27/163244)）。`hooks.json` 同时注册 **`sessionStart`**，跑同一 `setup-ai-stats.cjs`；§5.2.1 决策幂等，已就绪则跳过，不会每次对话都全量冒烟。

**本机就绪（`locallyReady`）** — 须同时满足：

| 仓类型 | 条件 |
|--------|------|
| **无 Husky** | `core.hooksPath` 指向 `.cursor/hooks/ai-stats`；且 `prepare-commit-msg` / `post-commit` / `pre-push` 存在且为 `require('./hooks.cjs')` wrapper |
| **有 `.husky`** | hooksPath **未**长期指向 ai-stats；且上述三个 `.husky/*` 脚本调用 `node .../hooks.cjs` |

**最近提交信号：**

| 情况 | 视为 |
|------|------|
| 最近 1 次非 merge commit **含** `AI-Authored:` | 正常 |
| 含 commit 但 **缺** `AI-Authored:` | 异常（可能 SCM 绕过 §6.2 或 hooksPath 错 §6.3） |
| 仓库尚无 commit | 跳过提交检查（不单独因此触发 setup；若本机未就绪仍走首次 setup） |
| `git log` 检查抛错 | 异常 → 触发完整 setup |

**决策表：**

| `locallyReady` | 最近提交 | `workspaceOpen` 动作 |
|:---:|:---|:---|
| 否 | （任意） | **完整 setup**（等同 `--setup` 内容：force 安装 + §5.3 诊断 + §5.4 冒烟） |
| 是 | 正常 / 无 commit | **跳过**（仅简要 stderr：ready / skip） |
| 是 | 异常（缺标或检查失败） | **完整 setup**（再修配置并打印 §6.2 指引） |

边界（实现与文档须一致）：

1. **首次**以本机配置缺失为准，**不能**仅用远端历史里已有 `AI-Authored:` 判定「已配置」（clone 后 hooksPath 仍是本机空的）。
2. 合法全排除提交可不写 trailer → 可能被当成异常而多跑一次 setup（可接受；不因此拦截打开）。
3. 缺标时再 setup **不能根治** Cursor SCM `hooksPath=devNull`；仍须终端提交 / amend（§6.2）。
4. `workspaceOpen` 路径：**诊断或冒烟失败只打日志，`process.exit(0)`**。

### 5.3 诊断项（完整 setup）

每项输出：状态 / 问题说明 / 处理方法。示例：


| 检查                                             | 失败时处理方法（文案级）                             |
| ---------------------------------------------- | ---------------------------------------- |
| `node` 可用                                      | 安装 Node 18+ 并加入 PATH                     |
| 能解析到 git 仓库根                                   | 将脚本放在仓内 `.cursor/hooks/ai-stats/` 或从仓内执行 |
| `hooks.cjs` / `core.cjs` 存在                    | 确认仓库含 ai-stats，或拉取最新                     |
| `core.hooksPath` 与仓类型匹配 | 无 Husky 应指向 ai-stats；有 Husky 应为 `.husky/_`（或 `.husky`），**不得**长期指 ai-stats |
| 最近 1 次非 merge commit 有无 `AI-Authored` | 无 → 提示可能 SCM 绕过（§6.2）或 hooksPath 配错（§6.3）；给出终端提交 / amend / 改 hooksPath 步骤 |
| `prepare-commit-msg` / `post-commit` 可执行且指向本链路 | 无 Husky：重建入口；有 Husky：检查 `.husky/prepare-commit-msg` 是否 `node .../hooks.cjs` |
| 无后缀硬链 + `"type":"module"` | 若检测到 → 告警 ESM 风险，改为 wrapper 或经 Husky 调 `hooks.cjs`（§6.3） |
| `ai-stats.exclude.json` 可解析                    | 修正 JSON / `excludePaths` 字符串             |
| `trace/` 可写                                    | 检查权限与磁盘                                  |
| 外层 `run-tests.cjs`（单文件含全部冒烟用例） | **不存在 → 跳过并提示**；存在则执行；`--setup` 失败非 0；`workspaceOpen` 失败仍 exit 0 |




### 5.4 冒烟验证（完整 setup）

1. 若存在外层 `run-tests.cjs` → 执行；不存在则跳过（不算配置失败）
2. 校验 hooksPath + hook 入口内容（含在 §5.3）
3. 模块可加载：`require('./core.cjs')` 关键导出
4. **不**伪造完整 Cursor Agent 会话；端到端仍靠 Agent 改业务文件 + 终端 `git commit` + `git log -1`
5. 退出码：显式 `--setup` 时冒烟/诊断失败 → 非 0；`workspaceOpen` 触发的完整 setup → **始终 0**



### 5.5 与 hooks.json

`workspaceOpen` 改为：

```text
node .cursor/hooks/ai-stats/setup-ai-stats.cjs
```

（实现时同步改 `.cursor/hooks.json`；行为按 §5.2，含 prune。）

---



## 6. 现场问题 → 需求（小潘 / 周灵 / 吕祥）

> 共性：表象都是「提交没有 AI 统计」。须先分清是 **采集层**、**提交钩子未跑**，还是 **安装配错**。三者都**不是** `attributeDiff` 归因公式写错。

### 6.1 小潘 — Windows Cursor hook stdin 漏采

#### 现象

Agent 编辑后 commit 漏采（无 agent trace → `AI-Authored: no` / 行数偏少），hook 仍 `exit 0`。

#### 根因（采集入参读取；非归因算法）

| 现象 | 原因 | 小潘现场改动（参考，勿整文件覆盖） |
|------|------|----------------------------------|
| `afterFileEdit` 静默无 trace | `fs.readFileSync(0)` 读管道抛 `EOF` 或空缓冲 | `readHookStdinBuffer()` |
| 偶发「空跑成功」 | Cursor 未写入 JSON；仍当成功 | 空 payload 告警并跳过 `runCursorHook` |

小潘版另删 `injectTrailerPreservingYes` → **不采纳**（保留 F-16）。

#### 需求 ID：F-WIN-STDIN

| 子项 | 要求 |
|------|------|
| R1 | 稳健读 stdin（兼容 Windows 管道 EOF） |
| R2 | 空/无关键字段 payload：stderr 告警，跳过采集，仍 exit 0 |
| R3 | **禁止**删除 `injectTrailerPreservingYes` |
| R4 | 单测或可重复验证说明 |

验收：AC-W1～AC-W3。

---

### 6.2 周灵 — Cursor Source Control 提交跳过 Git 钩子

#### 现象

- 一段时间内大量 commit **完全没有** `AI-Authored`（连 `unknown` 都没有）→ 报表直接跳过
- 同机 **终端** `git commit` 有 trailer；**SCM 面板提交**没有
- `active.jsonl` 常有采集记录，但 commit 无 trailer；`post-commit` 也不跑 → trace 残留
- `git config core.hooksPath` 仍显示 `.husky/_`，**无报错**

#### 根因（与 ai-stats / Husky **代码无关**）

Cursor ≥3.15.6（含当时验证的 3.17.8）在 SCM 发起的 git 进程环境中注入：

`core.hooksPath = \\.\nul`（Unix：`/dev/null`）

钩子目录为空设备 → `prepare-commit-msg` / `post-commit` **根本不执行**。属 **Cursor 产品 Bug**；升级到 3.17.x **不能默认视为已修**，须本机 SCM 提交实测。

参考：[Forum #167719](https://forum.cursor.com/t/git-hooks-silently-skipped-for-all-source-control-operations-since-3-15-6-git-extension-forces-core-hookspath-dev-null/167719)

#### 解决方案

| 层级 | 做法 | 说明 |
|------|------|------|
| **根治** | 等 Cursor 发版去掉对 `commit` 注入 `hooksPath=devNull` | 唯一真正修复；ai-stats **无法**在钩子未启动时自愈 |
| **日常规避（推荐）** | 用**集成终端**提交：`git add` + `git commit -m "..."` | 终端不继承该环境注入 |
| **误用 SCM 且未 push** | 终端 `git commit --amend --no-edit`，再 `git log -1 --format="%B"` 确认有 `AI-Authored:` | 补跑钩子；active 已丢时可能为 `no`，但至少进分母 |
| **运维/文档** | 无 trailer + 若用了 SCM → 提示本问题；对比「终端有 / SCM 无」 | 避免误判为「统计坏了」 |
| **可选** | 业务仓提供终端封装提交脚本 | 降低误点 SCM 概率 |
| **不推荐作默认** | 降级 Cursor 到 3.14.27 | 论坛有人验证有效，体验倒退 |

#### 需求 ID：F-SCM-HOOKS

| 子项 | 要求 |
|------|------|
| R1 | `--setup` / 文档：检查最近非 merge commit 是否含 `AI-Authored`；缺失时打印上表解决方案 |
| R2 | **不**通过修改 `core.cjs` 归因逻辑「修复」本问题 |
| R3 | 提交规范 / QUICKSTART：Cursor Bug 未修前勿依赖 SCM 面板提交做 AI 统计 |

验收：AC-Z1～AC-Z2。

---

### 6.3 吕祥 — `hooksPath` 误指 ai-stats + ESM 无后缀硬链

#### 现象

- 本机多次提交无 trailer；**同事同仓有 trailer**
- **终端提交也会失败或无注入**（与周灵「仅 SCM 坏」不同）
- 直接跑入口可能报：`require is not defined in ES module scope`

#### 根因（与归因算法无关；与**安装/执行脚本**有关）

1. 本机 `core.hooksPath` **长期**设为 `.cursor/hooks/ai-stats`，**顶掉** `.husky/_`
2. 错误 bat 做无后缀硬链 `prepare-commit-msg` → `hooks.cjs`；`"type":"module"` 仓按 ESM 加载 → `require` 失败
3. 错误文档曾写「hooksPath 指到 ai-stats」，与「Husky 管 Git」冲突

正确链路（有 Husky 的业务仓）：

```text
core.hooksPath = .husky/_
  → .husky/prepare-commit-msg
  → node .cursor/hooks/ai-stats/hooks.cjs prepare-commit-msg "$@"
```

#### 解决方案

| 层级 | 做法 |
|------|------|
| **本机恢复（立刻）** | `git config --unset core.hooksPath` 或设回 `.husky/_` → 重装 husky → 确认 `git config --get core.hooksPath` |
| **改错误安装脚本** | 删除/改写把 hooksPath 指到 ai-stats、以及无后缀硬链的 bat；改为只确保 `.husky/*` 调用 `node .../hooks.cjs <hook> "$@"`；已有自定义 hook 时**追加**调用，不整文件覆盖 |
| **改文档** | 有 Husky：**禁止** `hooksPath=.cursor/hooks/ai-stats`；禁止无后缀硬链当 Git 入口；须转发 `"$@"` |
| **标准项目 `setup-ai-stats`** | 检测到 `.husky`：**禁止**强制覆盖为 ai-stats；校验 Husky 调用；误指 ai-stats → 告警 + 改回命令；升级旧脚本补 `"$@"` |
| **无 Husky 的 Harness 模板** | 仍可 hooksPath→ai-stats；入口用 wrapper，避免 `type:module` + 无后缀硬链 |

#### 需求 ID：F-SETUP-HUSKY

| 子项 | 要求 |
|------|------|
| R1 | `--setup` 区分纯 ai-stats 仓与 Husky 仓；Husky 仓不强制 `hooksPath=ai-stats` |
| R2 | 诊断检出误指 ai-stats（且存在 `.husky`）时输出恢复步骤 |
| R3 | 禁止推广「无后缀硬链 hooks.cjs 当 Git hook」于 `type:module` 仓；Husky 调用必须带 `"$@"` |
| R4 | 业务仓错误 bat/规范由各仓维护者按上表改；标准模板文档写清双模式；force 安装对已有 `.husky/*` **追加**而非整页替换 |

验收：AC-L1～AC-L3。

---

### 6.4 漏标提示 — 有 AI 痕迹但 message 无 trailer（不拦截）

#### 现象

- Agent 改过文件，或 `active.jsonl` 里已有采集记录
- 但最终 commit message **没有** `AI-Authored:`（常见于 SCM 跳过钩子、inject 失败、`--no-verify`）
- 用户无感知 → 报表漏计 / 分母缺失

#### 目标

在 **不阻断** `commit` / `push` / Agent 的前提下，用**简短 stderr** 提醒用户补标或改用终端提交。

#### 需求 ID：F-MISSING-TRAILER-WARN

| 子项 | 要求 |
|------|------|
| R1 | **永远 fail-open**：相关 hook 一律 `exit 0`；禁止 deny / 非 0 拦提交或推送；禁止自动 amend |
| R2 | **三通道**（实现期一并落地）：① Git `post-commit`；② Cursor `afterShellExecution`（matcher 含 `git commit`）；③ Git `pre-push`（警告后仍放行） |
| R3 | **触发条件**（须同时满足）：message 无 `AI-Authored:` **且** 存在 AI 痕迹（见下）**且** 非「合法不写」 |
| R4 | **合法不写 → 不提示**：本次提交文件全部命中 `excludePaths`（与 AC-E6 一致） |
| R5 | 文案**简洁**（固定模板，见下）；可附 1 条补救命令；不贴长文档 |
| R6 | 检测或打印失败：吞掉异常，仍 `exit 0`，不影响用户流程 |
| R7 | **不**根治 SCM `hooksPath=devNull`；SCM 当下无提示时，依赖 **pre-push** 兜底 |

#### AI 痕迹（满足任一即可）

| 通道 | 判定 |
|------|------|
| `post-commit` / `afterShellExecution` | HEAD 所改文件与 `active.jsonl`（或 prepare 缓存的 staged 列表）存在 agent trace 交集；或 inject 路径留下「本应写入却失败」的本地标记 |
| `pre-push` | 待推送非 merge commit 中：message 无 `AI-Authored:`，且该 commit 触及文件在近期 `active` / `archive` 中有 agent 记录（启发式；误报优先少提示） |

#### 用户可见文案（必须简洁）

**提交后**（`post-commit` / `afterShellExecution`）：

```text
[ai-stats] 本次提交缺少 AI 统计标记（检测到 AI 改动）。
补救：git commit --amend --no-edit
建议：用终端提交，不要用 SCM 面板。
```

**推送前**（`pre-push`，可列最多 5 个 short hash）：

```text
[ai-stats] 以下提交缺少 AI 统计标记，推送仍继续：
  abc1234 feat(xxx): ...
补救（未推送可改）：git commit --amend --no-edit
建议：以后用终端 git commit。
```

语气约束：不说「失败」「拦截」「必须」；不输出大段论坛/设计链接。

#### 覆盖边界

| 场景 | 提交时提示 | push 时提示 |
|------|:----------:|:-----------:|
| 终端 commit 漏标 | ✅ | ✅（若仍缺） |
| Agent 终端 `git commit` 漏标 | ✅ | ✅ |
| SCM Commit 漏标 | ❌（钩子未跑） | ✅ |
| 全排除合法不写 trailer | ❌ | ❌ |
| SCM 提交后从不 push | ❌ | ❌ |
| 已 push 的历史缺标 | — | —（不改历史；靠 `--setup` / 报表） |

#### 实现要点（实现期）

- `ensure-hooks-path` / `setup-ai-stats`：无 Husky 时补齐 `pre-push` 入口；有 Husky 时确保 `.husky/pre-push` 调用 `node .../hooks.cjs pre-push`（或等价）
- `.cursor/hooks.json`：增加 `afterShellExecution` → `hooks.cjs`（matcher 收窄到 `git\s+commit`，避免每条 shell 都跑）
- 共享函数如 `warnIfMissingTrailer({ scope: 'commit'|'push' })`，禁止复制三份文案逻辑

验收：AC-M1～AC-M5。

---

### 6.5 汇总 `--until` 闭合时间窗（TERP）

#### 现象 / 需求

- 仅有 `--since` 时，报表只能到「现在」，无法输出固定周期（上周、某迭代、某自然月）
- TERP 已在 `ai-stats.cjs` 增加 `--until`；标准仓应对齐该能力
- **明确不合入** TERP 仍保留的 `authorEmailGlobs` / `commitMessageRegexExclude`（与 §2 / 非目标一致）

#### 需求 ID：F-UNTIL-RANGE

| 子项 | 要求 |
|------|------|
| R1 | `parseArgs` 支持 `--until <date-or-rel>`（原样传给 `git log --until=`，不做强制格式校验） |
| R2 | 未传 `--until` 时行为与现网一致（仅 `--since` … 至今） |
| R3 | `git log` 在传入 until 时追加 `--until=`；JSON 输出含 `until` 字段（未传可为 `undefined`/省略） |
| R4 | Markdown 报告：有 until → `统计范围: {since} ~ {until}`；无 until → `{since} 至今` |
| R5 | 单测覆盖：parseArgs、git 参数组装、formatMarkdown 文案；**不**恢复 author/message 排除 |

示例：

```bash
node .cursor/hooks/ai-stats/ai-stats.cjs --since 2026-08-01 --until 2026-08-15 --md
node .cursor/hooks/ai-stats/ai-stats.cjs --since 7d --until 2026-08-20 --json
```

验收：AC-U1～AC-U4。

---

## 7. 文档与规范同步

**实现阶段**再更新：

- `.cursor/rules/提交规范.mdc` — setup 入口；exclude；**SCM 规避（§6.2）**；**Husky vs 纯 ai-stats（§6.3）**；**漏标提示（§6.4）**
- `docs/QUICKSTART.md` / `docs/MAINTENANCE.md` — 现场问题排查 + 漏标提示说明 + **`--until` 示例（§6.5）**
- `docs/superpowers/specs/2026-08-24-ai-stats-handoff.md` — F-WIN-STDIN / F-SCM-HOOKS / F-SETUP-HUSKY / F-MISSING-TRAILER-WARN / **F-UNTIL-RANGE**

---

## 8. 验收标准（AC）

| ID | 场景 | 期望 |
|----|------|------|
| AC-E1 | `excludePaths` 空串 | 路径全纳入 |
| AC-E2 | 默认含 `/.cursor` | 该路径不采集、不计 Lines |
| AC-E3 | 目录前缀 `/lib` | `lib/foo.js` 排除；`src/lib.js` 不排除 |
| AC-E4 | glob `*` | 仅单层 |
| AC-E5 | glob `**` | 匹配嵌套 `target` |
| AC-E6 | staged 全排除 | 不新写 AI trailer |
| AC-E7 | amend + 全排除且旧有 AI 标 | 保留旧 trailer |
| AC-E8 | 不排除 `src/components` | 业务组件仍可统计 |
| AC-P1～P4 | active 清理 | 见 §4；含「命中 exclude 不回溯删」 |
| AC-S1 | **无 Husky** + `--setup` | 可覆盖为 ai-stats |
| AC-S2 | `workspaceOpen` + 本机已就绪 + 最近提交有 `AI-Authored:` | **跳过**完整 setup |
| AC-S2b | `workspaceOpen` + 本机未就绪（首次） | 完整 setup（force + 诊断 + 冒烟）；失败仍 exit 0 |
| AC-S2c | `workspaceOpen` + 本机就绪 + 最近提交缺 `AI-Authored:` | 再跑完整 setup；失败仍 exit 0 |
| AC-S3～S6 | setup 健壮性 | 见 §5 |
| AC-W1～W3 | F-WIN-STDIN | 见 §6.1 |
| AC-Z1 | 最近 commit 无 `AI-Authored` | `--setup` 输出 §6.2 方案（终端/amend/Cursor Bug） |
| AC-Z2 | 文档含 SCM 规避 | 提交规范或 QUICKSTART 可检索 |
| AC-L1 | 存在 `.husky` 时 `--setup` | **不**强制 hooksPath=ai-stats |
| AC-L2 | 误指 ai-stats + 有 `.husky` | 告警 + 改回 `.husky/_` 命令 |
| AC-L3 | 文档/脚本 | Husky → `node hooks.cjs … "$@"`；禁无后缀硬链入口；force 追加不覆盖 |
| AC-M1 | 有 active + HEAD 无 `AI-Authored` + `post-commit` | stderr 含简洁漏标文案；commit 已成功；exit 0 |
| AC-M2 | 全排除提交（合法不写） | **不**打印漏标警告 |
| AC-M3 | `pre-push` 发现未推送缺标 commit | 打印简短列表；**push 成功**；exit 0 |
| AC-M4 | 检测逻辑抛错 | 仍 exit 0；不阻断 commit/push |
| AC-M5 | 文案 | 不超过约定模板；含 amend 一行；无「拦截/失败」措辞 |
| AC-U1 | `--until 2026-08-15` | parseArgs 得到 until；git log 含 `--until=2026-08-15` |
| AC-U2 | 不传 `--until` | 无 `--until=`；MD 为「至今」 |
| AC-U3 | `--md` + until | 报告含 `since ~ until` |
| AC-U4 | `--json` + until | JSON 含 `until` 字段 |

---

## 9. 风险与回滚

| 风险 | 缓解 |
|------|------|
| 强制覆盖挤掉其它 hooks | 有 Husky 禁止强制覆盖（§6.3）；无 Husky 时打印旧值 |
| 默认排除过宽 | 各仓可改 `excludePaths` |
| 以为升级 Cursor 即修周灵问题 | 要求本机 SCM 实测；默认推荐终端提交；§6.4 push 兜底提示 |
| 标准 setup 在 Husky 仓重现吕祥问题 | F-SETUP-HUSKY / AC-L1 |
| 照搬小潘整文件 | 只合入 §6.1；禁止删 yes 保护 |
| 漏标误报打扰用户 | 全排除豁免；痕迹判定偏严；文案短 |
| 用户以为警告会拦 push | 文案写明「推送仍继续」；AC-M3 |

回滚：`git checkout` 相关文件；`git config --local core.hooksPath <旧值>`。

---

## 10. 实现顺序（**已完成**）

> 落地目录：`.cursor/hooks/ai-stats/`；外层冒烟 `run-tests.cjs`（已提交）。本地可选 `test/` 仍 gitignore。

1. 路径排除 + 单测  
2. active prune + 单测  
3. F-WIN-STDIN（§6.1）  
4. `setup-ai-stats.cjs` + `.bat`/`.sh`：含 F-SETUP-HUSKY + F-SCM-HOOKS 诊断；删 `ensure-hooks-path.cjs`；改 `hooks.json`  
5. **F-MISSING-TRAILER-WARN（§6.4）**：共享 warn 函数 + `post-commit` / `pre-push` / `afterShellExecution` + AC-M1～M5  
6. 同步文档（§6.2 / §6.3 / §6.4 写入提交规范与 QUICKSTART）  
7. **F-UNTIL-RANGE（§6.5）**：`ai-stats.cjs` `--until` + AC-U1～U4；文档示例；**不合入**旧 author/message 排除  
8. Husky 入口转发 `"$@"`；force 时**追加** ai-stats 调用（不整文件覆盖自定义 hook）  

---

## 11. Spec 自检

- [x] grill-me 与排除/清理/运维口径齐全
- [x] 小潘 §6.1 / F-WIN-STDIN
- [x] 周灵 §6.2 / F-SCM-HOOKS + 解决方案（与代码无关、ai-stats 不能根治）
- [x] 吕祥 §6.3 / F-SETUP-HUSKY + 解决方案（改安装脚本、setup 双模式）
- [x] 漏标提示 §6.4 / F-MISSING-TRAILER-WARN（只提示不拦截；文案简洁；AC-M1～M5）
- [x] 汇总 `--until` §6.5 / F-UNTIL-RANGE（TERP；不合入旧排除字段）
