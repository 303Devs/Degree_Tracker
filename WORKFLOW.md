# Degree Tracker Workflow

## Before Starting

- Read `PROJECT.md`.
- Read `CONTEXT.md`.
- Read `REPO_AUTHORITY.md`.
- Read relevant spec/phase docs before implementation, usually `SPEC.md` and `PHASE_3_PLAN.md`.
- Run or inspect `git status --short --branch` before assigning work.
- Confirm the task packet names the canonical repo path:

```txt
/Users/anthony/Agents/.openclaw/workspace/projects/degree-tracker
```

## Source And Notes

- Project control folder: `/Users/anthony/Agents/.openclaw/workspace/projects/degree-tracker`
- Source repo: `/Users/anthony/Agents/.openclaw/workspace/projects/degree-tracker`
- Non-canonical duplicate: `/Users/anthony/Projects/degree-tracker`
- Branch/worktree: current branch by default; use a feature branch or worktree for larger implementation.
- Legacy exception: yes. Do not migrate or switch to `/Users/anthony/Projects/degree-tracker` without Anthony approval.

## Agent Rules

- Stay inside assigned files and the canonical repo path.
- Preserve unrelated user or agent changes.
- Do not read, print, copy, or store secrets from `.env.local`.
- Do not deploy, upload, publish, submit, or message externally without Anthony approval.
- Do not use the duplicate repo as source of truth.
- Do not claim sandboxing unless the runtime is actually sandboxed.

## Execution Mode

- Default: direct live repo in the canonical legacy path.
- Use git worktree or feature branch for large/risky changes.
- Use tool sandbox only for risky/untrusted dependency or command experiments.

## Model Policy

- Default model tier: Tier B / Sonnet 4.6 for Bob-side implementation and QA.
- Escalation conditions: architecture-critical, security-critical, repeated-failure, release-blocking, or high-stakes school/planning decisions.
- Cost-sensitive tasks: simple formatting, summaries, and extraction should not use frontier escalation without a reason.

## Review Gates

- Turing QA: required for non-trivial implementation/config changes.
- Alice review: recommended for architecture, product direction, school-sensitive semantics, writing, or planning decisions.
- Anthony approval: required before deploys, uploads, submissions, repo migration, branch pushes, external messages, or destructive cleanup.

## Verification

Use task-specific verification, typically:

- `npm test`
- `npm run build`
- targeted Vitest tests when available
- manual browser check for user-facing UI changes

If verification cannot run, report why and what evidence is missing.

## Done Means

- Work matches the approved scope.
- Canonical repo path was used.
- Existing unrelated changes were preserved.
- Verification was run or the reason it could not run is documented.
- Turing/Alice review routing is complete or clearly marked as still needed.
- `CONTEXT.md` is updated with meaningful decisions/results.
- Anthony gets a concise completion update.
