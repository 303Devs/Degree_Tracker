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

## Engineering Policy (standing)

These rules apply to all implementation work on Degree Tracker, effective 2026-05-01.

### TDD / Test Requirements
- Every non-trivial implementation change requires tests before or alongside the code.
- Tests must pass locally (`npm test`) before work is considered done.
- Build must pass locally (`npm run build`) before work is considered done.
- Test-first is preferred for logic changes; at minimum, tests ship with the PR.

### Linear Issue Per Task
- Every implementation task, spec, QA run, or fix must have a corresponding Linear issue.
- Specialists (Gilfoyle, Ive, Nora) must be assigned to a named Linear issue before work starts.
- No implementation work without a tracked Linear issue.

### Turing Review
- All non-trivial implementation/config changes require a Turing QA pass before Bob calls them done.
- Alice review is required for architecture, semantics, school-sensitive decisions, and spec approval.
- A specialist report saying "Turing review required" is a gate flag — Bob owns routing.

### GitHub Actions CI
- A CI workflow exists at `.github/workflows/ci.yml` (runs `npm test` + `npm run build`).
- When a GitHub remote is connected, CI must pass before any implementation is considered complete.
- Do not treat code as done if CI is failing on GitHub, even if local tests pass.
- GitHub remote is not yet connected (as of 2026-05-01). CI workflow is pre-staged.

### Definition of Done (updated)
- Work matches the approved scope and Linear issue.
- `npm test` passes locally.
- `npm run build` passes locally.
- If GitHub remote is active: CI passes on the relevant branch.
- Turing/Alice routing is complete or explicitly documented as pending.
- CONTEXT.md updated with meaningful decisions.

## Review Gates

- Turing QA: required for non-trivial implementation/config changes.
- Alice review: recommended for architecture, product direction, school-sensitive semantics, writing, or planning decisions.
- Anthony approval: required before deploys, uploads, submissions, repo migration, branch pushes, external messages, or destructive cleanup.

## Standing Engineering Policy

Apply this before normal implementation work continues:

- Use TDD-oriented work for non-trivial behavior changes: write/identify the expected test first, verify failure when practical, then implement the smallest safe change.
- Non-trivial code/config changes require tests. Bug fixes should include a regression test when practical.
- Every implementation task must map to a Linear issue before work is treated as active.
- Turing review is required for implementation before Bob/Alice treat code as complete.
- Do not call code complete unless local tests and build pass, or the failure and missing evidence are explicitly documented as a blocker.
- When GitHub is involved, GitHub Actions CI must pass before normal GitHub development continues. CI should run the repo's lint/test/build suite when available.
- Anthony approval remains required before deploys, uploads, submissions, repo migration, branch pushes, or other external actions.

## Verification

Use task-specific verification, typically:

- `npm test`
- `npm run build`
- targeted Vitest tests when available
- manual browser check for user-facing UI changes
- GitHub Actions CI status when work has been pushed or opened as a PR

If verification cannot run, report why and what evidence is missing.

## Done Means

- Work matches the approved scope.
- Canonical repo path was used.
- Existing unrelated changes were preserved.
- A Linear issue exists for the task.
- Required tests were added/updated for non-trivial behavior/config changes.
- Local tests/build passed, or the missing verification is documented as a blocker.
- Turing implementation review is complete for non-trivial implementation.
- GitHub Actions CI passed when GitHub is involved.
- Alice review routing is complete or clearly marked as still needed where appropriate.
- `CONTEXT.md` is updated with meaningful decisions/results.
- Anthony gets a concise completion update.

- Anthony gets a concise completion update.
