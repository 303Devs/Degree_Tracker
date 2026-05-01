# Plan-State Design Documentation

**Version:** 1.0  
**Date:** April 29, 2026  
**Scope:** Task 5 - Plan-State Design Implementation

---

## Overview

This document describes the canonical plan representation and comparison type system for the degree tracker's Phase 3 planning features. The design implements a single-source-of-truth approach that avoids split-brain data models and supports robust plan comparison.

## Core Design Principles

### 1. Single Source of Truth: Semester Assignment Map

The `PlanVariant.semesters` field is the **sole authoritative representation** of a plan:

```typescript
semesters: Record<string, string[]>; // semesterID -> courseIDs
```

**Why this matters:**
- No duplicate data structures to keep in sync
- No "shadow" representations that can drift
- Clear ownership of plan state
- Simplified validation and comparison logic

**What this means:**
- All other plan data is derived from this map
- Credit totals are computed, not stored
- Course sequences are inferred, not maintained separately
- Semester metadata comes from course assignments

### 2. Canonical Data Formats

#### Semester IDs
**Format:** `{Season}{YearSuffix}` (e.g., FA26, SP27, SU27)

**Normalization rules:**
- `Fall 2026` → `FA26`
- `spring_2027` → `SP27`
- `2027-summer` → `SU27`
- `F26` → `FA26`
- `FA26` → `FA26` (pass-through)

#### Course IDs  
**Format:** `{DEPT}-{NUMBER}` (e.g., MATH-2300, CSCI-1300)

**Normalization rules:**
- `MATH 2300` → `MATH-2300`
- `math2300` → `MATH-2300`
- `MATH-2300` → `MATH-2300` (pass-through)

### 3. Comparison Diff Model

Plan comparison produces structured deltas across multiple dimensions:

- **Credit Deltas:** Semester-by-semester credit differences
- **Course Diffs:** Added, removed, and moved courses
- **Semester Diffs:** Per-semester course and credit changes
- **Requirement Deltas:** Requirement group coverage changes
- **Prerequisite Risk Changes:** Prerequisite violation introductions/removals

---

## Architecture

### Type Hierarchy

```
RawPlanData (JSON input)
       ↓
   PlanVariant (normalized)
       ↓
  NormalizedPlan (with derived data)
       ↓
 PlanComparison (diff result)
```

### Data Flow

1. **Loading:** `loadPlansFromFile()` reads JSON and applies normalization
2. **Validation:** ID formats validated, duplicates detected, unknown courses flagged
3. **Derived Data:** `computeDerivedPlanData()` computes derived data (credits, course lists)
4. **Comparison:** `comparePlans()` produces structured diffs (Phase 3 Task 6)

### Error Handling

The system uses structured validation issues instead of exceptions:

```typescript
interface PlanValidationIssue {
  type: 'error' | 'warning' | 'info';
  code: string;              // Machine-readable
  message: string;           // Human-readable
  context?: {...};          // Debugging context
}
```

**Error codes:**
- `INVALID_SEMESTER_ID`: Unparseable semester format
- `INVALID_COURSE_ID`: Unparseable course format  
- `DUPLICATE_COURSE`: Course assigned to multiple semesters
- `SEMESTER_COLLISION`: Two raw semester keys normalize to same canonical
- `UNKNOWN_COURSE`: Course not found in dataset
- `EMPTY_PLAN`: Plan has no semesters
- `NO_SEMESTER_OVERLAP`: Plans have no common semesters

---

## Normalization Approach

### Input Sources

The system handles plan data from multiple input formats:

1. **ml-dl-plans.json** - Primary test data with ML-Efficient and DL-Implementation paths
2. **Future manual plan creation** - User-defined plans via UI
3. **Plan variants** - Alternative arrangements of same degree requirements

### Normalization Process

1. **Load raw JSON** with flexible format support
2. **Normalize semester IDs** to canonical format (FA26, SP27, etc.)
3. **Normalize course IDs** to canonical format (DEPT-NNNN)
4. **Validate course existence** against course dataset (strict by default)
5. **Check for duplicates** within each plan
6. **Detect semester collisions** when different raw keys normalize to same canonical
7. **Compute derived data** (total credits, semester credits) - never store credits

### Validation Rules

#### Critical Validations (Errors)
- **Single assignment:** Each course appears in exactly one semester per plan
- **Valid course IDs:** All courses must exist in course dataset (strict by default)
- **Parseable semester IDs:** Must match supported format patterns
- **No semester collisions:** Different raw semester keys cannot normalize to same canonical

#### Advisory Validations (Warnings/Info)
- **Missing course data:** Course ID not found in dataset (when not strict)
- **Empty semesters:** Semesters with no course assignments  
- **No overlap:** Plans with no common semesters or courses

---

## Examples

### Canonical vs Non-Canonical Representations

#### Non-Canonical Input
```json
{
  "plans": {
    "ml-path": {
      "semesters": {
        "Fall 2026": { "courses": ["MATH 2300", "stat 2600"] },
        "spring_2027": { "courses": ["APPM2350", "CSCI 2400"] }
      }
    }
  }
}
```

#### Canonical After Normalization
```typescript
{
  id: "ml-path",
  name: "...",
  semesters: {
    "FA26": ["MATH-2300", "STAT-2600"],
    "SP27": ["APPM-2350", "CSCI-2400"]
  }
}
```

### Comparison Example

Comparing ML-Efficient vs DL-Implementation:

```typescript
// Both plans start the same
FA26: ["MATH-2300", "CSCI-2824", "STAT-2600", "APPM-1650"]

// But diverge in SP27
ML-Efficient SP27: ["APPM-2350", "APPM-3310", "STAT-3100", "CSCI-2400", "CSCI-3155"]
DL-Implementation SP27: ["APPM-2350", "APPM-3310", "STAT-3100", "CSCI-2400", "APPM-4370"]

// Comparison result:
courseDiffs: {
  moved: [
    { course: "CSCI-3155", from: "SP27", to: "SU27" },
    { course: "APPM-4370", from: "??", to: "SP27" }
  ]
}
```

---

## Explicit Non-Goals

### ❌ NOT Implemented in This Phase

1. **UI Components** - No React components, forms, or interactive elements
2. **Recommendation Logic** - No "smart" course suggestions or ML-powered optimization
3. **Export Functionality** - No PDF generation, CSV export, or external format conversion
4. **Drag/Drop Interactions** - No interactive plan editing features
5. **Persistence Layer** - No database integration beyond JSON file loading
6. **GPA Projections** - No grade-based calculations or projections
7. **Real-Time Validation** - No live prerequisite checking or semester validation
8. **Optimization Features** - No "best path" algorithms or automated plan generation

### 🎯 Deliberate Scope Boundaries

This implementation is **design-focused foundation work** for Phase 3 plan comparison. Features explicitly excluded above are intentionally deferred to later phases or tasks.

**Why this scope?**
- Clean types now = easier comparison engine later
- Proven normalization before building complex features
- Solid foundation prevents technical debt
- Clear separation of concerns

---

## Implementation Files

### Core Implementation
- **`lib/plan-types.ts`** - Type definitions and interfaces
- **`lib/plan-normalization.ts`** - Loading and normalization logic
- **`__tests__/plan-state.test.ts`** - Comprehensive test suite

### Test Coverage
- ✅ Semester ID normalization (multiple input formats)
- ✅ Course ID normalization (multiple input formats) 
- ✅ Valid plan JSON loading
- ✅ Duplicate course detection
- ✅ Unknown course validation (strict by default)
- ✅ Semester collision detection
- ✅ Two equivalent plans normalize identically
- ✅ NormalizedPlan immutability
- ✅ Edge cases (empty semesters, malformed data)

### Success Criteria Verification

- [x] All types defined with no shadow credit authority
- [x] Plan normalization handles `ml-dl-plans.json`
- [x] Validation rules implemented with clear error messages
- [x] Single source of truth maintained (no shadow representations)
- [x] Semester collision detection with clear errors
- [x] Course validation strict by default
- [x] Function names match behavior (computeDerivedPlanData)
- [x] NormalizedPlan immutability ensured with deep copy
- [x] Test suite covers specification requirements
- [x] Design documentation explains approach and boundaries

---

## Next Steps (Phase 3 Task 6)

1. **Comparison Engine Implementation**
   - `comparePlans(planA: PlanVariant, planB: PlanVariant): PlanComparison`
   - Pure comparison logic using normalized plans
   - Structured diff generation across all dimensions

2. **Integration Testing**
   - End-to-end tests using `ml-dl-plans.json`
   - Comparison accuracy verification
   - Performance testing with larger plan sets

3. **UI Foundation** (Task 8)
   - Minimal side-by-side comparison view
   - Demo using ML-Efficient vs DL-Implementation
   - No editing, just visualization

---

*This design serves as the foundation for Phase 3 planning intelligence. All future plan comparison, optimization, and recommendation features will build upon these canonical types and normalization processes.*