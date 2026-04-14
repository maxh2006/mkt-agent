










# 06-workflows-roles.md

## Core Workflows

### Promo Post Flow
1. backend detects schedule
2. structured packet is created
3. AI generates draft
4. draft enters queue
5. operator reviews and approves
6. post is scheduled or published

### Big Win Flow
1. backend qualifies event
2. structured packet is created
3. AI generates draft
4. operator reviews
5. operator approves and publishes

### Adhoc Event Flow
1. operator creates event form
2. AI generates concepts or copy
3. operator selects and edits
4. content enters queue
5. operator schedules or publishes

### Educational Flow
1. topic is selected or scheduled
2. AI generates draft
3. operator reviews
4. operator schedules or publishes

---

## Roles

### Admin
- all brand access
- can create and manage brands (Brand Management module)
- can manage users, channels, automations, templates, and rules across all brands

### Brand Manager
- brand-scoped access
- can approve, schedule, edit posts
- can manage channels, automations, and templates for their brand
- cannot create new brands or edit brand identity/integration settings

### Operator
- brand-scoped access
- can create drafts, events, review content, edit copy

### Viewer
- read-only access

---

## Approval Rules

- human approval required in MVP before publish
- keep approval actions fast
- audit all critical changes
- always show source data in preview when relevant
