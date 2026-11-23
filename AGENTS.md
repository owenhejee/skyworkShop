# harness-project-structure

## 技术栈

| 层级 | 示例项目（当前可运行） | 目标生产栈 |
|------|------------------------|-----------|
| 前端 | Vue 3 + TypeScript + Pinia + Vite + Element Plus | 同左 |
| 后端 | Spring Boot 3.x + MyBatis-Plus + **H2 内存库** | MySQL + Redis + RocketMQ |
| 已实现 | `product`、`cart` | `order`、`mq` 等见 `工程结构.mdc` |

启动：`skyworkshop-backend/`（8080）、`skyworkshop-frontend/`（5173）

## 红线（不可违反）

1. **价格字段使用 Integer（分为单位）** — 禁止 Float/Double/BigDecimal
2. **Redis Key 前缀 `skyworkshop:`**
3. **RocketMQ Consumer 必须幂等**
4. **异常使用 BusinessException + ErrorCode 体系**
5. **Controller 构造器注入** — 禁止 @Autowired 字段注入
6. **@Transactional 必须声明 rollbackFor**
7. **Vue 3 使用 `<script setup lang="ts">`** — 禁止 Options API
8. **API 响应格式 `{code, message, data}`**

细则见 `.cursor/rules/项目红线.mdc`，每条含验证命令。

## 文件索引

| 文件 | 用途 | 团队动作 |
|------|------|----------|
| `AGENTS.md` | 技术栈、红线、文件索引 | **填空**（15-30min） |
| `docs/QUICKSTART.md` | 5 分钟入门与提示词 | 新人必读 |
| `docs/MAINTENANCE.md` | Harness 维护手册 | Tech Lead 维护 |
| `.cursor/MANIFEST.yml` | Skill/Rule 元数据权威源 | 新增 Skill 时更新 |
| `.cursor/rules/项目红线.mdc` | 项目红线，每条可验证 | **填空**（30-45min） |
| `.cursor/rules/工程结构.mdc` | 包结构、模块边界、命名 | **填空**（15-20min） |
| `.cursor/rules/编码规范.mdc` | 业务特定编码规则 | **填空**（10-15min） |
| `.cursor/rules/安全规范.mdc` | 业务特定安全规则 | **填空**（15-20min） |
| `.cursor/rules/开发流程规范.mdc` | 十阶段流水线、变更管理 | **通用可用** |
| `.cursor/rules/提交规范.mdc` | Conventional Commits 规范 | **通用可用** |
| `.cursor/rules/Java最佳实践.mdc` | Java 通用最佳实践 | **通用可用** |
| `.cursor/skills/request-analysis/SKILL.md` | Stage 1-3：需求 → summary.md | **通用可用** |
| `.cursor/skills/coding-skill/SKILL.md` | Stage 4：编码实现 | 调整红线引用 |
| `.cursor/skills/expert-reviewer/SKILL.md` | Stage 6：领域特定评审 | 调整审查维度 |
| `docs/changes/TEMPLATE-feature/summary.md` | 黄金样本模板 | 复制使用 |
| `docs/wiki/领域术语.md` | 领域术语 | **填空**（20-30min） |
| `docs/wiki/接口协议.md` | API 协议 | **填空**（15-20min） |
| `docs/wiki/数据模型.md` | 数据模型 | **填空**（30-60min） |
| `docs/wiki/业务模型.md` | 业务模型 | **填空**（30-60min） |
| `.cursor/hooks.json` | Hooks 注册 | 内置 |
| `.cursor/hooks/ai-stats/` | AI 代码率采集与 trailer | 见 `提交规范.mdc` |
| `.cursor/mcp.json` | MCP 服务器 | 填入 Token |
| `skyworkshop-backend/` + `skyworkshop-frontend/` | 可运行参考实现 | 参考 |

## 快速开始

```bash
# 1. 启动后端（JDK 17+）
cd skyworkshop-backend && mvn package -Dmaven.test.skip=true
java -jar target/skyworkshop-backend-1.0.0-exec.jar

# 2. 启动前端
cd skyworkshop-frontend && npm install && npm run dev

# 3. 验证
curl http://localhost:8080/health
# 浏览器打开 http://localhost:5173
```

新人上手：阅读 `docs/QUICKSTART.md`（约 5 分钟）。

## 首次落地清单

Fork 本模板后，按序完成以下项即视为 Harness 就绪（无需新增文件）：

- [ ] `项目红线.mdc` — 替换为团队可验证红线（≥ 5 条）
- [ ] `工程结构.mdc` — 对齐实际模块与目录
- [ ] `编码规范.mdc` / `安全规范.mdc` — 填入业务特有规则
- [ ] `docs/wiki/*.md` — 术语、接口、数据模型、业务模型
- [ ] `AGENTS.md` — 更新技术栈与文件索引，移除「填空」标记
- [ ] `.env` — 从 `.env.example` 复制，填写 `GITHUB_TOKEN`（启用 GitHub MCP 时）
- [ ] `.cursor/mcp.json` — 按需启用 MCP 服务器
- [ ] 跑通 `docs/QUICKSTART.md` 三场景提示词

Stage 5/7–10 无专属 Skill，责任方见 `开发流程规范.mdc` §七。
