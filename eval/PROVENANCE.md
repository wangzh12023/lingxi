# 评测集的来历

评委要求“记录生成和标注模型、提示词、版本与人工裁决”。这里逐一写清楚。

## 总表

| 集合 | 位置 | 规模 | 谁写、谁标 | 用途 | 能不能拿来调规则 |
|---|---|---|---|---|---|
| 开发集 | `dataset.ts` 的 `DEV`、`REPLIES_DEV` | 44 条消息、20 条回复 | 项目开发代理（Claude Opus 5.5）撰写并标注 | 第一轮调参 | 可以 |
| 第一轮留出集 | `dataset.ts` 的 `TEST`、`REPLIES_TEST`；成绩冻结在 `round1.json` | 66 条消息、30 条回复 | 同上 | 第一轮只测一次；之后并入调参 | 第二轮起可以（其成绩不再作数） |
| 迭代验证集（原“盲测集”） | `blind/`（标注者甲）、`blind-texts/`（标注者乙的复标） | 150 条消息、60 条回复 | 两个独立的子代理（同为 Claude Opus 5.5 实例），见下文提示词 | 规则未依据它调整；**路由依据它的一个汇总数字改过一次**（`router-first.json`），所以不再称“盲测”，改称迭代验证集 | 不可以读题；但已发生过一次基于汇总数字的修改 |
| 最终测试集 | `final/`，哈希冻结在 `final/FROZEN.json` | 120 条消息、40 条回复、14 段多轮会话 | 新的独立子代理（Claude Opus 5.5 实例），没有看过前面任何一个集合 | 只用于最终报告 | **不可以**：冻结后任何修改都会使评测脚本拒绝运行 |

## 需要如实说明的局限

- **所有标注者都是大模型，而且与开发代理是同一个模型**（Claude Opus 5.5 的不同实例）。它们没有读过规则代码，但读的是同一份《标注规范》，彼此的高一致性（意图 κ 0.99）有一部分来自“同一个模型、同一份规范”，不能代表人工业务判断。
- **没有人工裁决**。两位标注者有分歧的条目没有经过人来裁定；报告里把“两位一致的子集”作为附加分析，主结果用完整集合。
- 待补：请 3–5 位人工参与者复核关键业务标签（风险类别、是否拦截、多轮会话的期望行为），记录参与者类别（学生 / 有客服经验者 / 专业客服）、分歧和裁决方式。标注表模板见 `human-review/`。

## 提示词（原文）

以下是派给各标注者的指令全文。两次早期尝试因请求超时中断，重试时只增加了“分块写文件”的要求，其余不变。

### 迭代验证集 · 标注者甲 · 消费者消息（2026-10-12）

> You are acting as an independent annotator who writes a blind evaluation set for a Chinese-language customer-service AI project (a beauty brand's online customer service). Your work will be used to measure how accurately a rule engine and a large language model understand consumer messages. The value of this set depends on you NOT knowing how the systems under test work.
>
> Hard constraints: Read exactly ONE project file: `lingxi/eval/标注规范.md`. Do NOT read, list, grep or open anything else under the project — in particular not `lingxi/src/`, not `lingxi/eval/dataset.ts`, not `lingxi/eval/run.mts`, not any results file. Do not search the web. Do not try to make the items easy or hard for any particular system. Write what real consumers plausibly write.
>
> Produce the 150 messages as FIVE separate files of 30 messages each … Item format: `{"id","text","intents","emotions","risks","kind"}` … Coverage over all 150: each of the 13 intents is the primary intent of at least 8 messages and none more than 18; each of the 8 emotions dominant in at least 8; 45–55 messages with at least one risk, each of safety, pr, legal, churn, minor, fraud in at least 6, privacy in at least 3; kind mix about 55 plain, 25 colloquial, 25 implicit, 10 sarcasm, 12 negation, 13 decoy, 10 multi. … No real brand names, no real people … Avoid near-duplicates.
>
> Report back counts and guideline ambiguities only; do NOT include any of the items.

### 迭代验证集 · 标注者甲 · 坐席回复（2026-10-12）

> … one sentence a human customer-service agent might be about to send … `block`: per the guideline's section B … `why`: for block=true one of diagnosis, medical-claim, absolute, shift-blame, blame-customer, review-for-benefit; for block=false one of clean, warn-only, near-miss … 30 block=true: 5 of each why type; 30 block=false: 14 clean, 6 warn-only, 10 near-miss … Do NOT include any of the items in the report.

### 迭代验证集 · 标注者乙 · 复标（2026-10-12）

> You are the SECOND, independent annotator … Another annotator has already labelled the same messages; your labels will be compared with theirs to measure inter-annotator agreement, so you must label from the guideline alone without seeing their labels. You may read exactly the guideline and `lingxi/eval/blind-texts/messages-*.json` (texts only, labels removed) … Do NOT open `lingxi/eval/blind/` … For every message decide the ONE primary intent, the ONE dominant emotion, and the risks … (回复同理，只判断 block)

### 最终测试集 · 消息与回复（2026-10-14）

> You are an independent annotator writing the FINAL, frozen test set … Earlier sets exist; this one must be new and independent … Read exactly ONE project file: the guideline … not `blind/`, `blind-texts/` … 120 messages (ids f001–f120) including ~10 longer ones of 60–120 characters where the decisive cue comes late (`kind: late_cue`) … 40 replies (ids q001–q040) …

### 最终测试集 · 多轮会话（2026-10-14）

> You are an independent test designer writing the FINAL, frozen end-to-end test sessions … The assistant reads a consumer's whole service history — orders, after-sales tickets (including promises the brand made and whether they were kept) and past contacts … Each session: a customer, orders, tickets with promise logs, contacts, and 2–3 turns, each turn labelled per the guideline plus `expect`: `acknowledge` (overdue promise tickets a good reply must own up to), `doNotAsk` (订单号/照片/批号/经过 already known), `orderRef` (the order the turn is really about), `noCommitWithoutTicket` … difficulties: broken_promise ≥ 5, kept_promise ≥ 2, mixed_orders ≥ 3, sarcasm, negation, reported_speech, implicit, correction, new_event, long_message (cue after the 200th character) ≥ 2 turns, calm ≥ 2 …

（两份最终测试集指令的全文保存在 `prompts/final-*.md`。）
