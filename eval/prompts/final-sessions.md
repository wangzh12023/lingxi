You are an independent test designer writing the FINAL, frozen end-to-end test sessions for a Chinese-language customer-service assistant (a beauty brand's online customer service). The assistant reads a consumer's whole service history — orders, after-sales tickets (including promises the brand made and whether they were kept) and past contacts — and helps a human agent reply. Your sessions will test whether it uses that history correctly. Its value depends on you NOT knowing how the system works.

## Hard constraints
- Read exactly ONE project file: `D:\Wangzh\p2\projects\olaiya-contest\lingxi\eval\标注规范.md` (the annotation guideline). Use section A for turn labels.
- Do NOT read, list, grep or open anything else under `D:\Wangzh\p2\projects\olaiya-contest\`. Do not search the web.
- All people, orders and events are fictional.

## BE FAST
Write TWO files, one Write call each, without long deliberation in chat:
- `D:\Wangzh\p2\projects\olaiya-contest\lingxi\eval\final\sessions-1.json` (sessions E01–E07)
- `D:\Wangzh\p2\projects\olaiya-contest\lingxi\eval\final\sessions-2.json` (sessions E08–E14)
Each file is a JSON array of session objects.

## The world
"Now" is 2026-10-11 10:00 (Beijing time). Every timestamp must be before it, format `YYYY-MM-DDTHH:MM`.
Products (use these sku ids, names and prices exactly):
- p-aurelle-a-serum · AURELLE 臻颜紧致 A 醇精华 30ml · 680
- p-aurelle-uv · AURELLE 轻透防晒乳 SPF50+ · 320
- p-mistral-b5 · MISTRAL B5 修护舒缓霜 50ml · 268
- p-mistral-cleanser · MISTRAL 氨基酸温和洁面 120ml · 138
- p-luminelle-cushion · LUMINELLE 柔焦持妆气垫 #01 · 420
- p-verdan-hair · VERDAN 头皮养护精华 60ml · 358
- p-aurelle-gift · AURELLE 臻颜礼盒 · 1580
Id formats (must match): customer `E-01`…`E-14`; order `TM`/`JD`/`DY`/`WX` + 8 digits + `-` + 4 digits (e.g. `TM20260930-2201`); ticket `T-` + 4 digits + `-` + 4 digits (e.g. `T-2610-2001`); contact `S-` + anything. Batch codes: two capital letters + 4 digits + one capital letter (e.g. `MS2609C`).

## Session object
```json
{
  "id": "E01",
  "kinds": ["broken_promise", "sarcasm"],
  "customer": {"id": "E-01", "name": "x女士", "tier": "新客|银卡|金卡|黑金", "skinType": "…", "preferredTone": "…", "historySummary": "one sentence"},
  "orders": [{"id": "TM20260930-2201", "sku": "p-mistral-b5", "product": "MISTRAL B5 修护舒缓霜 50ml", "price": 268, "channel": "tmall|jd|douyin|wechat", "paidAt": "…", "status": "待发货|运输中|已签收|已完成|已退款", "signedAt": "… or omit", "batch": "… or omit"}],
  "tickets": [{"id": "T-2610-2001", "orderId": "…", "type": "promise|refund|exchange|complaint|adverse|logistics", "status": "open|processing|closed", "createdAt": "…", "dueAt": "… (promise tickets: the promised date)", "amount": 0, "summary": "what happened / what was promised", "promiseLog": [{"at": "…", "by": "坐席 小禾", "text": "the words the agent used", "dueAt": "…"}]}],
  "contacts": [{"id": "S-E01-1", "at": "…", "channel": "tmall", "orderId": "…", "topic": "…", "resolved": false, "lines": ["what the consumer wrote then"], "evidence": ["破损照片 2 张"]}],
  "turns": [
    {"text": "the consumer's new message", "intents": ["complaint"], "emotions": ["sadness"], "risks": ["churn"],
     "expect": {
       "acknowledge": ["T-2610-2001"],
       "doNotAsk": ["订单号", "照片"],
       "orderRef": "TM20260930-2201",
       "noCommitWithoutTicket": true,
       "note": "one line: what a good reply must do here"
     }}
  ]
}
```
`expect` describes what a GOOD reply to that turn must do, judged from the history you wrote:
- `acknowledge`: promise tickets that are overdue (dueAt passed, status not closed) and that a good reply must own up to; empty if none
- `doNotAsk`: information the consumer has already given or the record already has — only from 订单号, 照片, 批号, 经过 — that a good reply must NOT ask for again
- `orderRef`: the order this turn is really about (important when the consumer has several orders), or null
- `noCommitWithoutTicket`: true when a good reply must not say anything is "已安排/已补寄/已退款" or give a specific delivery time, because nothing has actually been arranged yet in the record

## Coverage (14 sessions, 2–3 turns each, ~35 turns total)
Mix these difficulties across sessions (a session can have several):
- broken_promise — a promise ticket with 1–3 restatements in promiseLog, now overdue (at least 5 sessions)
- kept_promise — same kind of history but the promise ticket is closed/kept: the reply must NOT apologise for a broken promise (at least 2 sessions; label `acknowledge: []`)
- mixed_orders — several orders; the consumer talks about one of them without naming it (at least 3)
- sarcasm, negation, reported_speech (someone else's reaction), implicit (no keywords)
- correction — in a later turn the consumer corrects something they said earlier (wrong product, wrong date)
- new_event — a later turn introduces a new problem (e.g. a skin reaction after an earlier delivery complaint)
- long_message — a turn of 120–250 characters whose decisive cue appears after the 200th character (at least 2 turns)
- calm — sessions where nothing is wrong: the assistant should not invent risk (at least 2)
Label turn intents/emotions/risks per the guideline (1–2 intents, 1–2 emotions, risks possibly empty).

## Finish
After writing, quickly re-read both files once and fix any id-format or timestamp mistakes. No validation script needed.

## Report (three lines)
How many sessions and turns, the count per `kinds` value, and any guideline points that were hard to apply. Do NOT include any session content.
