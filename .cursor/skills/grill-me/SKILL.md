---
name: grill-me
description: TERP 需求澄清：逐项访谈直到与用户达成共识。在新功能、变更需求、PRD 编写前使用；用户说「grill me」「需求澄清」「先把需求问清楚」时触发。澄清完成且用户确认后，下一步为 terp-request-analysis-prd。
requires:
  always:
    - AGENTS.md
  wiki:
    - docs/wiki/领域术语.md
---

# TERP 需求澄清（grill-me）

在编写 PRD 之前，通过逐项提问消除歧义，**所有关键分支决策须与用户达成一致**后再进入 `@terp-request-analysis-prd`。

> Skill 索引见 `.cursor/skills/README.md`。

## 在流水线中的位置

| | |
|--|--|
| **前置** | 用户提出新需求 / 变更（可选：`@terp-new-module` 若全新业务域） |
| **本 Skill** | 澄清范围、角色、规则、边界、异常流、与存量模块差异 |
| **下一步** | 用户确认澄清结论 → `@terp-request-analysis-prd`（引用源文档 + 本次澄清要点） |
| **跳过条件** | 需求已极清晰且用户明确说「直接写 PRD」→ 可跳过，但 PRD 阶段 2 大纲确认仍须执行 |

## 执行方式

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

**Ask the questions one at a time.**

If a question can be answered by exploring the codebase, explore the codebase instead.

## TERP 澄清维度（按需覆盖）

| 维度 | 示例问题 |
|------|----------|
| 业务域 | 属于 item-manage / quality / system 哪条域？是否跨模块？ |
| 角色与权限 | 哪些角色码？只读 vs 读写？菜单挂载位置？ |
| 数据模型 | 新建表 vs 改存量表？附件是否走 `item_file_info`？消息是否走 `msg_push_*`？ |
| 交互 | 列表筛选、弹窗、导出、状态流转 |
| 范围外 | 本期不做什么（移动端、微信发送等） |
| 验收 | 怎样算完成？如何验证？ |

## 产出

- 对话中的**澄清结论**（无需单独文件；重要结论会在 `@terp-request-analysis-prd` 写入 summary 源说明或约束表）
- 用户口头/回复 **「确认，可以写 PRD」** 作为门禁

## 下一步

```
@terp-request-analysis-prd
根据本次澄清结论 + {源文档路径} 生成 docs/changes/{feat}/summary.md
```

可选（用户要求可视化后再 DDL）：

```
@frontend-design
根据 docs/changes/{feat}/summary.md Part A 原型章节生成 HTML 原型
```
