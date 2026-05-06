# Degree Tracker

## Status

- State: Product reset in progress; source currently lives in the OpenClaw project workspace.
- Product focus: upload a degree audit, parse requirements/courses, enrich course catalog data, track GPA, and plan semesters with prerequisite/corequisite warnings.
- Owner: Anthony; implementation work should stay scoped to the product described here.
- Last updated: 2026-05-03

## Goal

Degree Tracker is a local Next.js app for turning a degree audit into a usable course-planning workspace.

The app should help a student answer:

- What requirements are complete, partial, or missing?
- Which electives can satisfy each category?
- What happens to GPA under what-if grades?
- Which future semesters contain which courses?
- Which planned courses have missing prerequisites or corequisites?
- Which course catalog records still need enrichment?

The parser should stay school-agnostic where possible. CU Boulder catalog enrichment is a local optional integration because Anthony's current audit is CU Boulder.

## Current Scope

- In scope: audit upload/parsing, normalized requirements/courses, elective selection, GPA and what-if views, semester planner, prereq/coreq validation, CU catalog enrichment, and simple local JSON storage.
- Out of scope: ML/DL path optimization, plan comparison demos, recommendation engines, advisor-style claims, deploys, public releases, school submission, account changes, or migration to another repo path without Anthony approval.

## Repos / Paths

- Canonical working repo: `/Users/anthony/Agents/.openclaw/workspace/projects/degree-tracker`
- CU catalog scraper: `/Users/anthony/Projects/cu-prereq-scraper`
- Duplicate non-canonical repo: `/Users/anthony/Projects/degree-tracker`
- Related authority doc: `REPO_AUTHORITY.md`
- Product spec: `SPEC.md`
- Related tools: Next.js, TypeScript, Vitest, local JSON data, optional Playwright scraper

## Local Workflows

- `npm test` - run unit tests.
- `npm run build` - production build/type check.
- `npm run scrape:cu` - write current course list to the CU scraper, run it, and merge names/credits/descriptions/prereqs/coreqs back into `data/courses.json`.
- `npm run enrich` - merge an existing `/Users/anthony/Projects/cu-prereq-scraper/prereqs.json` file without running the scraper.

## Next Actions

- [ ] Keep the app centered on audit upload, requirement progress, elective choices, GPA what-if, and semester planning.
- [ ] Strengthen generic audit parsing with fixtures from more than one school/program.
- [ ] Keep CU-specific catalog scraping as optional enrichment, not a hard product dependency.
- [ ] Require tests for non-trivial parser, data model, GPA, requirement, and planner validation changes.
- [ ] Remove any feature/docs that reintroduce ML/DL path optimization or recommendation-engine framing.

## Blockers

- No active blocker recorded. Agents must still inspect git status before editing and must not overwrite unrelated user/agent work.
