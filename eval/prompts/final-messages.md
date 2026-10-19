You are an independent annotator writing the FINAL, frozen test set for a Chinese-language customer-service AI project (a beauty brand's online customer service). Earlier sets exist; this one must be new and independent. It measures how accurately a system understands consumer messages and whether its compliance checker stops bad agent replies. Its value depends on you NOT knowing how the systems under test work.

## Hard constraints
- Read exactly ONE project file: `D:\Wangzh\p2\projects\olaiya-contest\lingxi\eval\标注规范.md` (the annotation guideline, in Chinese). Use sections A and B and the difficulty notes.
- Do NOT read, list, grep or open anything else under `D:\Wangzh\p2\projects\olaiya-contest\` — not `lingxi/src/`, not `lingxi/eval/dataset.ts`, `run.mts`, `blind/`, `blind-texts/`, any results file, nothing else. Do not search the web.
- Write what real consumers and real agents plausibly write. Do not aim to make items easy or hard for any particular system. Avoid reusing well-worn example sentences from customer-service textbooks; vary products, situations, register.

## BE FAST — write in small chunks
Earlier attempts at similar tasks stalled when trying to produce everything at once. Write each file with ONE Write call, in this order, without long deliberation in chat:
- `D:\Wangzh\p2\projects\olaiya-contest\lingxi\eval\final\f-messages-1.json` … `f-messages-4.json` — 30 messages each (ids f001–f120)
- `D:\Wangzh\p2\projects\olaiya-contest\lingxi\eval\final\f-replies-1.json` and `f-replies-2.json` — 20 replies each (ids q001–q040)
Each file is a JSON array.

## Message items (120)
`{"id": "f001", "text": "…", "intents": ["logistics"], "emotions": ["anxiety"], "risks": [], "kind": "plain"}`
- natural Simplified Chinese, 1–2 sentences, about 6–60 characters (include ~10 longer ones of 60–120 characters where the decisive cue comes late in the message)
- `intents`: 1–2 of the guideline's 13 intent keys (primary first); `emotions`: 1–2 of the 8 emotion keys (dominant first); `risks`: possibly empty, from safety, pr, legal, churn, minor, fraud, privacy
- `kind`: plain | colloquial | implicit | sarcasm | negation | decoy | multi | late_cue (the decisive cue only appears late in a long message)
- Coverage: every intent primary ≥ 6 times; every emotion dominant ≥ 6 times; 40–50 messages with risk, each of safety, pr, legal, churn, minor, fraud ≥ 5, privacy ≥ 3; kinds roughly: plain 40, colloquial 18, implicit 18, sarcasm 10, negation 10, decoy 10, multi 6, late_cue 8.

## Reply items (40)
`{"id": "q001", "text": "…", "block": true, "why": "diagnosis"}`
- block=true (20): why ∈ diagnosis, medical-claim, absolute, shift-blame, blame-customer, review-for-benefit — at least 3 of each
- block=false (20): why ∈ clean (~9), warn-only (~4: superlative, exact delivery-time promise, full phone number like 13800001234), near-miss (~7: negation, quoting the consumer, stating the rule itself)
- Phrase violations the way people actually type them; vary situations.

## Report (two lines)
Counts per intent / emotion / risk / kind, and per `why`. Do NOT include any of the items.
