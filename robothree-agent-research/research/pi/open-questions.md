# Open Questions — Pi Agent

> npm v0.80.7 / commit `c9715af` | Items requiring further evidence or investigation

## 1. Git Clone Blocked

| # | Question | Impact | How to Close |
|---|---|---|---|
| Q1 | Exact commit SHA for npm v0.80.7? | HIGH — citation accuracy | `git clone` → `git log --oneline -1` or check npm dist-tags |
| Q2 | Exact line numbers for key symbols? | MEDIUM — evidence precision | `git clone` → grep for `agentLoop`, `Agent.prompt`, `createTurnState` |
| Q3 | Are there sub-packages not visible in npm? | MEDIUM — completeness | `git clone` → list `packages/*/` |
| Q4 | What's the test coverage like? | MEDIUM — quality assessment | `git clone` → `npm test` or check CI config |

## 2. Runtime Behavior (Not Verified)

| # | Question | Impact | How to Close |
|---|---|---|---|
| Q5 | How does parallel tool execution handle tool A failing while tool B succeeds? | HIGH — error semantics | Run test with a tool that throws + a tool that succeeds in same batch |
| Q6 | What happens when steering is called during tool execution (not at turn boundary)? | MEDIUM — steering semantics | Runtime test: steer() during long-running tool |
| Q7 | How does abort interact with streaming? Is partial message preserved? | MEDIUM — abort semantics | Runtime test: abort() during LLM stream |
| Q8 | What's the actual latency overhead of turn snapshots? | LOW — perf | Benchmark with and without snapshots |

## 3. Edge Cases

| # | Question | Impact | How to Close |
|---|---|---|---|
| Q9 | How does the tree handle cycles (accidental or malicious parentId pointing to descendant)? | HIGH — data integrity | Code review of `buildSessionContext()` cycle detection |
| Q10 | What happens when JSONL file is truncated mid-write (crash during append)? | MEDIUM — crash recovery | Code review of append atomicity guarantees |
| Q11 | How does compaction interact with forked sessions? Does compacting the parent affect the fork? | MEDIUM — data model | Code review + test: compact parent, check fork |
| Q12 | Can an extension's `setActiveTools` conflict with another extension? | MEDIUM — multi-extension | Code review of tool activation resolution |

## 4. Design Decisions (No Public Rationale)

| # | Question | Impact | How to Close |
|---|---|---|---|
| Q13 | Why was jiti chosen over ts-node, tsx, or esbuild-kit? | LOW — historical | Git history of extension loader introduction |
| Q14 | Why are there exactly 5 AgentHarness phases? Could "compaction" and "branch_summary" be merged? | LOW — API design | Design doc or issue discussion |
| Q15 | Was the three-layer API designed upfront or extracted from an existing monolith? | LOW — architecture evolution | Git history analysis |

## 5. RoboThree-Specific

| # | Question | Impact | How to Close |
|---|---|---|---|
| Q16 | Does RoboThree need tree-structured sessions, or are linear sessions sufficient for MVP? | HIGH — scope | Product decision based on MVP use cases |
| Q17 | What's the right extension isolation boundary for RoboThree: WASM, Worker threads, or separate processes? | HIGH — architecture | Benchmark isolation overhead vs security requirements |
| Q18 | Should RoboThree's permission model be capability-based (tokens) or policy-based (rules)? | HIGH — security design | Evaluate against target use cases (single-user vs multi-tenant) |
| Q19 | What language will RoboThree extensions be written in? | MEDIUM — SDK design | Product decision based on target developer audience |

## 6. Unresolved from Pi Analysis

| # | Question | Impact | How to Close |
|---|---|---|---|
| Q20 | Pi has ~4,932 commits and 244 releases. What's the release cadence and stability guarantee? | LOW — adoption risk | Check CHANGELOG.md and release notes |
| Q21 | Is there an official deprecation policy for ExtensionAPI changes? | LOW — extension stability | Check if SEMVER is followed for API changes |
| Q22 | How does Pi handle model context window limits that vary by provider? | MEDIUM — context engineering | Code review of `contextWindow` configuration per provider |
