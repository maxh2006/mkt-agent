# 05-tracking-insights.md

## Purpose

The Insights page is a lightweight internal reporting page.
It is not a full native social analytics suite.

Do not rely on Facebook or TikTok analytics APIs for MVP.

---

## What We Track

Metrics we control:
- posts generated
- posts approved
- posts rejected
- posts published
- tracked clicks
- signups from tracked links
- deposits from tracked links
- revenue/GGR from tracked links

---

## Attribution Model

Use tracked links with a unique `tracking_id` per post.

Flow:
post -> click -> signup -> deposit -> revenue

Use last-click attribution for MVP.

Bitly can still be used, but internal tracking params are required in the destination URL.

---

## Data Handling

Backend code computes all analytics.

Use:
- raw event tables for source truth
- rollup tables for dashboard display

Recommended:
- event-driven inserts for raw events
- scheduled rollups for dashboard speed

Do not use AI to compute analytics.

---

## Insights Page Sections

### Operational Metrics
- posts generated
- approval rate
- rejection rate
- published count

### Attribution Metrics
- clicks
- signups
- depositors
- total deposit
- total GGR

### Top Content
- top posts by clicks
- top posts by deposit
- top posts by GGR

Keep this page lean in MVP.
