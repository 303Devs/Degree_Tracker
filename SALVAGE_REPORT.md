# SALVAGE REPORT - Non-Canonical Repo

**Date:** 2026-04-29  
**Source:** `/Users/anthony/Projects/degree-tracker`  
**Target:** `/Users/anthony/agents/.openclaw/workspace/projects/degree-tracker`

## Triage Decisions

### 1. IMPROVEMENT_PLAN.md
**Decision:** Extract useful parts only  
**Reason:** Contains valuable ML/DL integration ideas but based on outdated Phase 3 assumptions  
**Action:** Mined for scope ideas, archived as reference. Fresh canonical Phase 3 plan needed.

### 2. PHASE1_CHECKLIST.md  
**Decision:** Discard as stale  
**Reason:** Validation checklist based on wrong repo, outdated assumptions  
**Action:** Concepts integrated into proper Phase 2.x gap documentation

### 3. ml-dl-plans.json
**Decision:** Adopt as-is  
**Reason:** Well-structured course plan data with metadata, exactly what Phase 3 needs for comparison features  
**Action:** **COPIED** - This data is gold for plan comparison implementation

### 4. scripts/validate-reqs.js
**Decision:** Adopt as-is  
**Reason:** Data validation script that identifies requirement/course integrity issues  
**Action:** **COPIED** - Moved to canonical repo as support script for gap identification

## Files Adopted

✅ **ml-dl-plans.json** → Provides structured plan data for Phase 3 comparison engine  
✅ **scripts/validate-reqs.js** → Data validation tool for identifying the "three known gaps"

## Files Archived (Reference Only)

📁 **IMPROVEMENT_PLAN.md** → Contains ML/DL integration concepts, not implementation-ready  
🗑️ **PHASE1_CHECKLIST.md** → Outdated validation steps

## Next Actions

1. Run `scripts/validate-reqs.js` to identify specific Phase 2.x gaps
2. Use `ml-dl-plans.json` structure as foundation for Phase 3 plan comparison
3. Reference IMPROVEMENT_PLAN concepts when scoping fresh Phase 3 plan

---
*Salvage complete. Non-canonical repo remains FROZEN for new work.*