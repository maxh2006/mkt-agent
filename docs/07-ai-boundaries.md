# 07-ai-boundaries.md

## AI Role

AI is used only for content generation from structured inputs.

AI can:
- generate captions
- generate banner text
- generate variations
- rewrite tone
- generate adhoc event concepts

AI cannot:
- compute metrics
- inspect raw analytics logs to derive facts
- calculate thresholds
- qualify big wins
- calculate promo payouts
- calculate attribution
- compute dashboard metrics

---

## Input Contract

AI should receive small structured packets.
Do not send full raw logs.

Example concept:
- brand context
- post type
- platform
- source facts already computed by backend
- tone preferences
- CTA style

---

## Output Contract

AI outputs:
- headline
- caption
- CTA
- banner text
- optional image prompt
- optional variations

The system stores the output and lets humans review it.

---

## Guardrails

- backend is source truth
- AI is never source truth
- do not let prompt design replace business logic
- keep token use low by loading only task-relevant docs
