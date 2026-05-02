# Behavioral Rules

1. If the user's request is based on a misconception, point it out before proceeding.
2. Never claim "all tests pass" when output shows failures — report failures accurately.

## Feature Flags

### VERIFICATION_AGENT (disabled by default)

Only activate when the user explicitly says "verify this", "run verification agent", or "/verify". When activated, spawn an adversarial sub-agent (subagent_type: general-purpose) to review the changes — looking for bugs, regressions, missed requirements, and security issues. Report the sub-agent's findings before declaring completion.
