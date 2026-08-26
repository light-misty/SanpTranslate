---
name: "karpathy-guidelines"
description: "Behavioral guidelines to reduce common LLM coding mistakes based on Andrej Karpathy's best practices. Invoke when writing code, refactoring, or implementing features to ensure quality and avoid common pitfalls."
---

# Karpathy Guidelines

Behavioral guidelines to reduce common LLM coding mistakes, derived from Andrej Karpathy's observations on LLM coding pitfalls.

**Tradeoff**: These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

**Before implementing:**
- State your assumptions explicitly. If uncertain, ask.
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Reproduce the bug with a test, then fix it"

**Example:**
```
User: "Add rate limiting to the API"

Bad: Immediately implement full rate limiting with Redis, multiple strategies, configuration system, and monitoring in one 300-line commit

Good: 
1. Ask: "What rate limit strategy do you need? (IP-based, user-based, endpoint-specific?)"
2. Implement minimal version
3. Test it
4. Iterate based on feedback
```

## 2. Simplicity First

Minimum code. No speculative features. No premature abstractions.

**Rules:**
- Solve the specific problem in front of you
- Don't build for hypothetical future requirements
- Prefer duplication over wrong abstraction
- Delete code aggressively

**Example:**
```
Bad: Create a generic RateLimiterFactory with strategy pattern for future extensibility

Good: Write a simple function that does exactly what's needed now
```

## 3. Surgical Changes

Touch only what's needed. Don't "improve" unrelated code.

**Guidelines:**
- Match existing style, even if you'd do it differently
- If you notice unrelated dead code, mention it - don't delete it
- When your changes create orphans:
  - Remove imports/variables/functions that YOUR changes made unused
  - Don't remove pre-existing dead code unless asked

**The test**: Every changed line should trace directly to the user's request.

**Example:**
```
User: "Fix the login button color"

Bad: 
- Change button color
- Refactor button component
- Update related styles
- Add new CSS utilities

Good:
- Change button color
- That's it
```

## 4. Goal-Driven Execution

Define success criteria. Loop until verified.

**Transform tasks into verifiable goals:**
- "Add feature X" → "User can do Y, verified by test Z"
- "Fix bug" → "Bug reproduction test passes"
- "Optimize" → "Benchmark shows X% improvement"

**Verification loop:**
1. Define success criteria
2. Implement
3. Verify against criteria
4. If not met, debug and repeat

**Example:**
```
User: "Make the search faster"

Bad: 
- Add caching
- Optimize queries
- Add indexes
- Assume it's faster

Good:
1. Define: "Search should complete in under 200ms for 10k records"
2. Benchmark current performance
3. Identify bottleneck
4. Fix bottleneck
5. Verify improvement
6. Repeat if needed
```

## 5. Incremental Development

Small, verified steps. Not big, unverified leaps.

**Pattern:**
1. Write test
2. Write minimal code to pass test
3. Verify
4. Commit
5. Repeat

**Avoid:**
- Multiple features in one commit
- Unverified code
- "I'll test it later"

## 6. Debugging Strategy

When things go wrong:

1. **Reproduce**: Create minimal reproduction
2. **Isolate**: Binary search / divide and conquer
3. **Verify**: Confirm fix with test
4. **Document**: Add comment if non-obvious

**Don't:**
- Change multiple things hoping one works
- Skip understanding the root cause
- Leave debugging code in

## 7. Code Review Checklist

Before considering code complete:

- [ ] Does every changed line trace to the request?
- [ ] Are assumptions stated and verified?
- [ ] Is there a test for the new behavior?
- [ ] Is the code as simple as possible?
- [ ] Are edge cases handled?
- [ ] Is error handling appropriate?
- [ ] Would a newcomer understand this code?

## Common Anti-Patterns to Avoid

1. **Speculative Generality**: Building abstractions for future needs
2. **Premature Optimization**: Optimizing without profiling
3. **Feature Creep**: Adding "nice to have" features
4. **Gold Plating**: Over-engineering simple solutions
5. **Shotgun Surgery**: Changes scattered across many files
6. **God Objects**: One thing doing too much
7. **Magic Numbers/Strings**: Unnamed constants

## Remember

> "The best code is no code at all. The second best is simple, clear code that solves the problem and nothing more." - Inspired by Karpathy's philosophy
