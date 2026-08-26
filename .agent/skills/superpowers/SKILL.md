---
name: superpowers
description: "Complete software development workflow framework. Invoke when starting any creative work, implementing features, debugging issues, or before claiming completion. Enforces TDD, systematic debugging, and verification."
---

# Superpowers - AI Programming Skills Framework

## Overview

Superpowers is a complete software development workflow for coding agents, built on top of a set of composable "skills" that ensure disciplined engineering practices.

**Core Philosophy:**
- Test-Driven Development - Write tests first, always
- Systematic over ad-hoc - Process over guessing
- Complexity reduction - Simplicity as primary goal
- Evidence over claims - Verify before declaring success

## When to Use

**ALWAYS invoke this skill when:**
- Starting any creative work (creating features, building components, adding functionality)
- Implementing any feature or bugfix
- Encountering any bug, test failure, or unexpected behavior
- About to claim work is complete, fixed, or passing
- User asks for planning, debugging, or code review

## The Basic Workflow

```
1. brainstorming -> Design exploration (questions, alternatives, validation)
2. writing-plans -> Create bite-sized tasks (2-5 min each, TDD-structured)
3. subagent-driven-development -> Fresh subagent per task + two-stage review
4. test-driven-development -> RED-GREEN-REFACTOR cycle
5. verification-before-completion -> Evidence before claims
```

---

## Skill 1: Brainstorming

**Purpose:** Turn ideas into fully formed designs through collaborative dialogue.

### Process

**Understanding the idea:**
- Check current project state first (files, docs, recent commits)
- Ask questions one at a time to refine the idea
- Prefer multiple choice questions when possible
- Focus on: purpose, constraints, success criteria

**Exploring approaches:**
- Propose 2-3 different approaches with trade-offs
- Present options with recommendation and reasoning

**Presenting the design:**
- Break into sections of 200-300 words
- Ask after each section whether it looks right
- Cover: architecture, components, data flow, error handling, testing

### After Design

- Write validated design to `docs/plans/YYYY-MM-DD-<topic>-design.md`
- Commit the design document to git
- Ask: "Ready to set up for implementation?"

### Key Principles

- One question at a time
- Multiple choice preferred
- YAGNI ruthlessly - remove unnecessary features
- Explore alternatives before settling
- Incremental validation

---

## Skill 2: Test-Driven Development (TDD)

**Purpose:** Write the test first. Watch it fail. Write minimal code to pass.

### The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Write code before the test? Delete it. Start over.

### Red-Green-Refactor Cycle

**RED - Write Failing Test:**
- One minimal test showing what should happen
- Clear name, tests real behavior, one thing

**Verify RED - Watch It Fail (MANDATORY):**
```bash
npm test path/to/test.test.ts
```
- Confirm test fails (not errors)
- Failure message is expected
- Fails because feature missing (not typos)

**GREEN - Minimal Code:**
- Write simplest code to pass the test
- Don't add features, refactor other code, or "improve" beyond the test

**Verify GREEN - Watch It Pass (MANDATORY):**
```bash
npm test path/to/test.test.ts
```
- Test passes
- Other tests still pass
- Output pristine (no errors, warnings)

**REFACTOR - Clean Up:**
- Remove duplication
- Improve names
- Extract helpers
- Keep tests green, don't add behavior

### Good Tests

| Quality | Good | Bad |
|---------|------|-----|
| Minimal | One thing. "and" in name? Split it. | `test('validates email and domain and whitespace')` |
| Clear | Name describes behavior | `test('test1')` |
| Shows intent | Demonstrates desired API | Obscures what code should do |

### Red Flags - STOP and Start Over

- Code before test
- Test after implementation
- Test passes immediately
- Can't explain why test failed
- Rationalizing "just this once"

---

## Skill 3: Writing Plans

**Purpose:** Create comprehensive implementation plans with bite-sized tasks.

### Task Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code" - step
- "Run the tests" - step
- "Commit" - step

### Plan Document Header

```markdown
# [Feature Name] Implementation Plan

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---
```

### Task Structure

```markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

**Step 1: Write the failing test**
[Complete test code]

**Step 2: Run test to verify it fails**
Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

**Step 3: Write minimal implementation**
[Complete implementation code]

**Step 4: Run test to verify it passes**
Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

**Step 5: Commit**
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```

### Remember
- Exact file paths always
- Complete code in plan (not "add validation")
- Exact commands with expected output
- DRY, YAGNI, TDD, frequent commits

---

## Skill 4: Systematic Debugging

**Purpose:** Find root cause before attempting fixes. Symptom fixes are failure.

### The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

### The Four Phases

**Phase 1: Root Cause Investigation**

1. Read Error Messages Carefully
   - Don't skip past errors or warnings
   - Read stack traces completely
   - Note line numbers, file paths, error codes

2. Reproduce Consistently
   - Can you trigger it reliably?
   - What are the exact steps?

3. Check Recent Changes
   - Git diff, recent commits
   - New dependencies, config changes

4. Gather Evidence in Multi-Component Systems
   - Log what data enters/exits each component
   - Verify environment/config propagation

5. Trace Data Flow
   - Where does bad value originate?
   - Keep tracing up until you find the source

**Phase 2: Pattern Analysis**

1. Find Working Examples
2. Compare Against References
3. Identify Differences
4. Understand Dependencies

**Phase 3: Hypothesis and Testing**

1. Form Single Hypothesis: "I think X is the root cause because Y"
2. Test Minimally - one variable at a time
3. Verify Before Continuing
4. When You Don't Know - say "I don't understand X"

**Phase 4: Implementation**

1. Create Failing Test Case
2. Implement Single Fix
3. Verify Fix
4. If Fix Doesn't Work - return to Phase 1

### Red Flags - STOP

- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- Proposing solutions before tracing data flow
- "One more fix attempt" (when already tried 2+)

---

## Skill 5: Verification Before Completion

**Purpose:** Evidence before claims, always.

### The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

### The Gate Function

```
BEFORE claiming any status:

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
5. ONLY THEN: Make the claim
```

### Common Failures

| Claim | Requires | Not Sufficient |
|-------|----------|----------------|
| Tests pass | Test command output: 0 failures | Previous run, "should pass" |
| Build succeeds | Build command: exit 0 | Linter passing, logs look good |
| Bug fixed | Test original symptom: passes | Code changed, assumed fixed |

### Red Flags - STOP

- Using "should", "probably", "seems to"
- Expressing satisfaction before verification
- About to commit/push/PR without verification
- Trusting agent success reports

---

## Skill 6: Subagent-Driven Development

**Purpose:** Execute plan by dispatching fresh subagent per task, with two-stage review.

### The Process

```
1. Read plan, extract all tasks with full text
2. Create TodoWrite with all tasks
3. For each task:
   a. Dispatch implementer subagent
   b. Dispatch spec reviewer subagent
   c. Dispatch code quality reviewer subagent
   d. Mark task complete
4. Dispatch final code reviewer
5. Use finishing-a-development-branch
```

### Two-Stage Review

1. **Spec Compliance Review** - Does code match spec?
2. **Code Quality Review** - Is implementation well-built?

### Red Flags

- Start implementation on main/master without consent
- Skip reviews
- Proceed with unfixed issues
- Accept "close enough" on spec compliance
- Start code quality review before spec compliance is approved

---

## Quick Reference

| Skill | When to Use | Key Principle |
|-------|-------------|---------------|
| brainstorming | Before any creative work | One question at a time |
| test-driven-development | Before writing implementation | No code without failing test |
| writing-plans | With spec/requirements | Bite-sized tasks (2-5 min) |
| systematic-debugging | Any bug/failure | Root cause before fix |
| verification-before-completion | Before claiming done | Evidence before claims |
| subagent-driven-development | Executing plans | Fresh subagent per task |

## Final Rules

1. **Invoke relevant skills BEFORE any response or action**
2. **User instructions always take precedence over skills**
3. **If you think there's even a 1% chance a skill might apply, invoke it**
4. **No shortcuts for verification - run the command, read the output, then claim**
