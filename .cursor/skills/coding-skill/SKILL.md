---

name: coding-skill
description: |
  按四层架构与项目红线实现前后端功能编码。
  在编写或修改 Java/Vue 代码、实现功能、修复业务逻辑或用户要求编码实现时使用。
  编码、实现、开发、写代码、Controller、Service、Mapper。
requires:
  rules:
    - .cursor/rules/项目红线.mdc
    - .cursor/rules/工程结构.mdc
    - .cursor/rules/编码规范.mdc
  context:
    - AGENTS.md

---

# 编码实现（Stage 4）

## 前置条件

- `request-analysis` 已完成（`docs/changes/{feat-name}/summary.md` 存在）

## 上下文准备

Agent 按需读取，**合计不超过 3 个**，优先级：

1. `docs/changes/{feat-name}/summary.md`（本功能约束，有则必读）
2. `.cursor/rules/项目红线.mdc`（不可违反）
3. `.cursor/rules/编码规范.mdc` 或 `.cursor/rules/工程结构.mdc`（按任务选其一）

禁止为凑数同时加载 Wiki 与上述 Rule；Wiki 仅在 summary 指向具体接口/表时按需读取。

## 后端编码（Spring Boot）

按顺序实现，每层完成后编译校验：

| Step | 层          | 要点                                                        |
| ---- | ---------- | --------------------------------------------------------- |
| 1    | Model      | Entity / DTO / VO；金额 Integer（分）                           |
| 2    | Repository | 继承 `BaseMapper<T>`；`LambdaQueryWrapper` — 禁止硬编码字段名        |
| 3    | Service    | 接口 + Impl；`@Transactional(rollbackFor = Exception.class)` |
| 4    | MQ（如需）     | Consumer 必须幂等（去重表 / processLog）                           |
| 5    | Controller | `@RequiredArgsConstructor`；`Result<T>`；`@Valid`           |
| 6    | Config（如需） | Redis Key 前缀 `skyworkshop:`；Topic 命名规范                    |

## 前端编码（Vue 3）

| Step | 层          | 要点                                        |
| ---- | ---------- | ----------------------------------------- |
| 1    | Types      | 与后端 DTO/VO 对齐；金额 number（分）                |
| 2    | API        | `src/api/{module}.ts`；统一 axios 实例         |
| 3    | Store      | Pinia `use{Module}Store`                  |
| 4    | Composable | `use{Feature}` 纯逻辑复用                      |
| 5    | Component  | `<script setup lang="ts">`；Props/Emits 类型 |
| 6    | View       | 页面组合 + 路由配置                               |

## 自检清单

每轮改动后逐项确认：

| #   | 检查项    | 标准                                              |
| --- | ------ | ----------------------------------------------- |
| 1   | 编译     | 0 error                                         |
| 2   | 金额字段   | Integer（分），命名 `*InCents`                        |
| 3   | 注入方式   | `@RequiredArgsConstructor`，禁止 `@Autowired`      |
| 4   | 事务     | `@Transactional(rollbackFor = Exception.class)` |
| 5   | 异常     | `BusinessException` + `ErrorCode`               |
| 6   | API    | `Result<T>` 封装                                  |
| 7   | Vue    | `<script setup lang="ts">`                      |
| 8   | MQ（如有） | Consumer 幂等                                     |

## 约束

1. 单次改动不超过目标文件行数 40%（见 `开发流程规范.mdc`）
2. 禁止 Controller 直接访问 Repository；禁止组件内直接 axios
3. 包根 `com.skyworkshop`；文件按 `工程结构.mdc` 放置
4. 复杂 Service 逻辑须同步规划单元测试
