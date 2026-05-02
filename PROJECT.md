# Degree Tracker

## Status

- State: Active legacy exception; source currently lives in the OpenClaw project workspace.
- Phase status: P3-B Optimization Helpers complete; next phase not started.
- Owner: Bob for execution; Alice for review/judgment when strategic, architectural, or school-sensitive.
- Last updated: 2026-05-01

## Goal

Degree Tracker is a Next.js app for CU Boulder degree audit upload/parsing, requirements tracking, semester planning, GPA/progress views, prerequisite validation, and plan comparison.

The current product direction is audit-first: CU degree audit PDFs are the source of truth, and planning features should remain explainable from parsed audit/course/requirement data.

## Current Scope

- In scope: local app implementation, parser/data model improvements, progress semantics, planner validation, plan comparison, tests, and project documentation.
- Out of scope: deploys, public releases, external uploads, school submission, account changes, or migration to another repo path without Anthony approval.

## Repos / Paths

- Project control folder: `/Users/anthony/Agents/.openclaw/workspace/projects/degree-tracker`
- Source repo: `/Users/anthony/Agents/.openclaw/workspace/projects/degree-tracker`
- Duplicate non-canonical repo: `/Users/anthony/Projects/degree-tracker`
- Related authority doc: `REPO_AUTHORITY.md`
- Related spec: `SPEC.md`
- Current phase plan: `PHASE_3_PLAN.md`
- Related tools: Next.js, TypeScript, Vitest, local JSON data
- Legacy exception: yes. The active working repo currently lives in the OpenClaw project workspace. Do not switch to `/Users/anthony/Projects/degree-tracker` unless Anthony explicitly approves migration.

## Execution Mode

- Direct live repo / git worktree / tool sandbox: direct live repo in the legacy OpenClaw workspace path.
- Branch or worktree: current branch unless Bob/Anthony approve branch/worktree use for a larger task.
- Sandbox required: no by default. Use sandbox only for risky/untrusted dependency or command experiments.

## Repo Authority

Canonical working repo:

```txt
/Users/anthony/Agents/.openclaw/workspace/projects/degree-tracker
```

Non-canonical duplicate:

```txt
/Users/anthony/Projects/degree-tracker
```

Agents must not treat the duplicate as current source of truth. Files in the duplicate are salvage candidates only.

## Next Actions

- [ ] Preserve this repo authority in every future task packet.
- [ ] Define explicit next phase scope before starting P3-C or any follow-on work.
- [ ] Route non-trivial code/config changes through Turing before Bob calls them done.
- [ ] Ask Alice/Ada to review architecture or school-sensitive planning decisions when needed.

## Blockers

- No active blocker recorded after P3-B completion. Agents must still inspect git status before assigning implementation and must not overwrite unrelated user/agent work.
