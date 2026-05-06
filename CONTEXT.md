# Degree Tracker Context

This is the current working memory for the project after the 2026-05-03 product reset.

## Current Product Direction

Degree Tracker should be a degree-audit parser plus course planner:

1. Upload a degree audit PDF.
2. Parse normalized requirements, courses, grades, semesters, GPA data, and elective pools.
3. Show progress by requirement category.
4. Let the user select electives where categories allow choices.
5. Let the user plan courses into semesters.
6. Warn on unsatisfied prerequisites/corequisites and load issues while planning.
7. Track GPA and support what-if grades.
8. Optionally enrich CU Boulder courses from the local CU catalog scraper.

The app should not be an ML/DL path optimizer, plan comparison demo, or recommendation engine.

## Canonical Paths

- Degree Tracker repo: `/Users/anthony/Agents/.openclaw/workspace/projects/degree-tracker`
- CU catalog scraper: `/Users/anthony/Projects/cu-prereq-scraper`
- Non-canonical duplicate: `/Users/anthony/Projects/degree-tracker`

## Important Implementation Notes

- `.env.local` exists in the repo. Do not read, print, copy, or store secret values.
- `course.semester` is the source of truth for planner assignments; semester course arrays are derived.
- W/NR/IP grades do not satisfy prerequisites and do not count as earned degree credit.
- CU catalog enrichment is optional and local. Use `npm run scrape:cu` after upload/parsing when CU course catalog metadata is needed.

## Work Log

### 2026-05-03 - Product reset and CU catalog enrichment

- Removed ML/DL plan demo assets and the plan-comparison/recommendation/export layer.
- Removed Phase 3/Gilfoyle/Turing task artifacts from the active repo.
- Kept core planner validation for prerequisites, corequisites, requirements, and term load issues.
- Added `scripts/scrape-cu-catalog.js` and `npm run scrape:cu` to drive `/Users/anthony/Projects/cu-prereq-scraper` from the current Degree Tracker course/requirement data.
- Updated CU scraper output to include a best-effort course description when the catalog API provides one.
- Updated enrichment/import code to merge course descriptions into `description` and empty `notes` fields.

### Pre-reset durable decisions

- Audit-first principle from `SPEC.md`: the uploaded degree audit is the source of truth for requirements/course data.
- `REPO_AUTHORITY.md` remains authoritative for path selection.
- The project remains a legacy exception in the OpenClaw workspace unless Anthony explicitly approves migration.
