# 04-automations.md

## Automation Scope

MVP automations:
- Running Promotions
- Big Win Posts
- Educational Posts

Later:
- Hot Games
- Engagement Posts

---

## Automation Card Requirements

Each card can support:
- enabled toggle
- thresholds
- cooldowns
- approval requirement
- auto-post toggle
- timing settings when relevant

---

## Value Display Rules

Operators may adjust the public display value used in content.

Important:
- do not overwrite source truth
- store source value and display value separately

Each automation can include:
- source metric
- display mode
- adjustment type
- adjustment value
- max allowed adjustment
- approval required if adjusted
- preview of source value vs display value

### Example display modes
- exact value
- rounded value
- threshold headline
- range headline
- adjusted display value
- composite marketing value

Keep this UI simple and explicit.

---

## Automation Notes

### Running Promotions
Used for scheduled promo content.

### Big Win Posts
Triggered from backend-qualified win records.

### Educational Posts
Can be scheduled or manually initiated.

Do not let AI determine whether source facts are valid.
