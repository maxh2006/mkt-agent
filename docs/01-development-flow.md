# 01-development-flow.md

## Session Start Flow

1. Read `WORKLOG.md`
2. Update or add an item in Ongoing Tasks
3. Read `docs/00-architecture.md`
4. Read only the docs needed for the current task
5. Implement the task
6. Test the task
7. Update `WORKLOG.md`
8. Move completed items to Done Tasks with date

---

## Task Selection Rules

### For setup or repo structure
Use:
- `docs/00-architecture.md`
- `docs/02-data-model.md`

### For UI work
Use:
- `docs/00-architecture.md`
- `docs/03-ui-pages.md`

### For automation/rules work
Use:
- `docs/00-architecture.md`
- `docs/04-automations.md`

### For tracking and insights
Use:
- `docs/00-architecture.md`
- `docs/05-tracking-insights.md`

### For permissions/approval flows
Use:
- `docs/00-architecture.md`
- `docs/06-workflows-roles.md`

### For AI generation boundaries
Use:
- `docs/00-architecture.md`
- `docs/07-ai-boundaries.md`

Do not read the entire docs folder unless necessary.

---

## Implementation Rules

- Make small, scoped changes
- Keep naming consistent with docs
- Use enums for statuses
- Prefer structured forms over freeform prompt boxes
- Keep brand-aware filtering everywhere
- Add audit logs for critical actions
