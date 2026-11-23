---
name: request-analysis
description: |
  将模糊需求转化为清晰的技术任务、影响分析与变更清单。
  在收到新功能需求、变更请求、PRD、用户故事或用户要求需求分析时使用。
  需求分析、PRD、用户故事、summary、任务拆分。
requires:
  rules:
    - .cursor/rules/项目红线.mdc
    - .cursor/rules/工程结构.mdc
    - .cursor/rules/开发流程规范.mdc
  context:
    - AGENTS.md
---
# 需求分析（Stage 1-3）

## 前置条件

- 用户提出需求（模糊/PRD/用户故事均可）
- 模糊项须列出待澄清，禁止自行假设

## 执行步骤

### Step 1：需求解析

- 提取核心功能点与功能边界
- 明确验收标准（可测试、可量化）
- 输出：需求清单 + 验收条件

### Step 2：业务影响分析

- 对照 `工程结构.mdc` 识别受影响模块
- 评估业务流程变化与用户影响
- 输出：受影响模块清单

### Step 3：技术影响分析

- 数据库变更（表/字段/索引/迁移脚本）
- API 变更（新增/修改/废弃的端点）
- Redis/MQ 变更（Key/Topic/Consumer，如适用）
- 前端变更（views/api/stores/types）
- 输出：技术变更 checklist

### Step 4：冲突检测

- 与现有功能的逻辑冲突
- 对照 `项目红线.mdc` 的红线冲突
- 对照 `工程结构.mdc` 的架构冲突
- 输出：冲突报告（阻断 = 必须解决 / 警告 = 需澄清）

### Step 5：输出 summary.md

写入 `docs/changes/{feat-name}/summary.md`，包含 6 项强制字段（见 `开发流程规范.mdc`）：

1. 变更概述 + 验收标准
2. 影响模块
3. 数据库变更（无则写「无」）
4. API 变更
5. Redis/MQ 变更（无则写「无」或「后续优化项」）
6. 关键约束与回滚方案

附带任务拆分（单任务 ≤ 4h，依赖关系明确）。可复制 `docs/changes/TEMPLATE-feature/summary.md`。

## 约束

1. 必须覆盖所有跨模块影响，禁止遗漏
2. 与红线冲突必须明确标注，不可跳过
3. 模糊需求必须请求澄清，禁止自行假设后推进
