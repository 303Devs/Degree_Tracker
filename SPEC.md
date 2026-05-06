# Degree Tracker — Product Spec v1

**Owner:** Anthony Merino
**Program:** B.S. Statistics & Data Science + Computer Science Minor — CU Boulder
**Catalog Year:** Fall 2026
**Tech Stack:** Next.js (TypeScript), Tailwind CSS, local JSON data (no database server)

---

## 1. Core Principle: Audit-First

The CU degree audit PDFs are the **single source of truth**. The app starts empty. No pre-seeded data. Anthony uploads audit PDFs and the parser extracts everything — requirement categories, courses, hours, completion status, grades.

**The app does NOT hardcode requirement structures.** Requirements, categories, and course pools are all data — derived from audits, editable through the UI, and reconcilable when new audits are uploaded.

**First-run flow:**
1. App launches with an empty state and a prominent "Upload Audit" prompt
2. Anthony uploads one or more audit PDFs (degree audit, minor audit, etc.)
3. Parser extracts all requirement groups, courses, hours, grades, and status
4. App populates and is ready to use
5. When things change (new minor, BA→BS, etc.) → upload new audit → diff + reconcile

**The audit parser is the core feature, not a secondary import tool.**

---

## 2. Data Model

### 2.1 Courses

```typescript
interface Course {
  id: string;                    // e.g. "STAT-3100"
  number: string;                // e.g. "STAT 3100"
  name: string;                  // e.g. "Applied Probability"
  credits: number;               // e.g. 3
  prereqs: PrereqRule | null;    // see 2.3
  coreqs: PrereqRule | null;     // same structure, different enforcement
  status: "not_started" | "planned" | "in_progress" | "completed";
  grade?: string;                // e.g. "A-", "B+", null if not completed
  semester?: string;             // e.g. "FA26", "SP27" — which semester it's placed in
  gradePoints?: number;          // calculated from grade
  notes?: string;                // free-text
}
```

### 2.2 Requirement Groups

```typescript
interface RequirementGroup {
  id: string;                    // e.g. "major-upper-div"
  name: string;                  // e.g. "Major Upper Division Courses"
  category: string;              // e.g. "Statistics & Data Science Major"
  type: "complete_all" | "pick_n" | "pick_one" | "minimum_hours";
  required?: number;             // for pick_n: how many to choose (e.g. 3)
  requiredHours?: number;        // for minimum_hours: e.g. 12
  coursePool: string[];           // course IDs in this group
  selectedCourses?: string[];    // for pick_n/pick_one: which ones the student chose
  notes?: string;                // e.g. "Grade of C- or better required"
}
```

**Requirement group types:**

| Type | Example | Behavior |
|------|---------|----------|
| `complete_all` | Ancillary Requirements (CSCI 1300, MATH 1300, MATH 2300) | All courses in pool are required |
| `pick_n` | Major UD Electives (choose 3 from ~18) | Student selects N from pool. Only selected courses and their prereqs matter for planning |
| `pick_one` | Calc 3 (APPM 2350 vs APPM 2340 vs MATH 2400) | Student picks one option. Each option may have different prereq chains |
| `minimum_hours` | A&S Natural Sciences (12 hours) | Already satisfied — tracked for completeness |

### 2.3 Prerequisite Rules

Prerequisites can be **compound** (AND/OR combinations) and **alternatives** (different courses that satisfy the same prereq).

```typescript
type PrereqRule =
  | { type: "course"; courseId: string }
  | { type: "and"; rules: PrereqRule[] }
  | { type: "or"; rules: PrereqRule[] };

// Examples:
// STAT 3400 prereqs: (STAT 2600) AND (STAT 3100 OR MATH 4510)
// Coreq: APPM 3310
// APPM 3650 prereqs: (APPM 1650) AND (MATH 2300 OR APPM 1360)
// STAT 4350 prereqs: (STAT 3100 OR APPM 3570) AND (STAT 3400 OR STAT 4520) AND (APPM 4600)
```

### 2.4 Semesters

```typescript
interface Semester {
  id: string;                    // e.g. "FA26"
  label: string;                 // e.g. "Fall 2026"
  type: "fall" | "spring" | "summer";
  year: number;
  status: "completed" | "in_progress" | "planned";
  courses: string[];             // course IDs
}
```

---

## 3. Features

### 3.1 Dashboard (Home)

- **Overall progress ring** — X of Y total hours completed
- **Progress bars by category:**
  - A&S General Education (Skills + Distribution) — mostly done
  - Statistics & Data Science Major (Lower Div + Upper Div)
  - Major Ancillary (Required + Electives/CS Minor)
  - CS Minor
  - Prerequisites
  - Overall Upper Division hours (45 required, 24 remaining — the bottleneck)
  - A&S Upper Division hours (30 required, 21 remaining)
- **Current semester** highlighted with in-progress courses
- **GPA display** — cumulative, major, what-if
- **Alerts panel** — prereq conflicts, missing requirements, credit load warnings

### 3.2 Semester Planner

**The core interactive feature.**

- **Timeline view** — horizontal or vertical layout of semesters (past → current → planned)
- **Drag and drop** courses between planned semesters
- **Course cards** show: number, name, credits, status badge, prereq satisfaction indicator
- **Credit load per semester** visible (warn if >18 hours or <12 hours for full-time)

**Prereq enforcement on move:**
- When a course is dropped into a semester, validate:
  1. All prereqs are completed OR planned in an earlier semester
  2. All coreqs are completed OR planned in the same semester or earlier
  3. The course isn't creating a circular dependency
- **If validation fails → modal:**
  - "STAT 4400 requires STAT 3400 (Applied Regression) and STAT 4520 (Intro to Mathematical Statistics). STAT 3400 is planned for SP28 but you're trying to place STAT 4400 in SP28. Move STAT 3400 to an earlier semester or move STAT 4400 later."
  - Show the specific prereqs that are unsatisfied and where they currently are
- **Cascade warnings:**
  - If you move a prereq course LATER, flag every downstream course that now has a broken chain
  - "Moving STAT 3100 to SP28 would break prereqs for: STAT 4520, STAT 3400, STAT 4100, STAT 4350"

### 3.3 Course Catalog

- **Searchable/filterable list** of all courses in the system
- Filter by: requirement group, status, semester, credit hours
- Each course expands to show:
  - Full name and number
  - Credit hours
  - Which requirement group(s) it satisfies
  - Prereq tree (visual — what do I need before I can take this?)
  - Dependent courses (what does this unlock?)
  - Current status and planned semester
- **"Pick" UI for elective groups:**
  - For `pick_n` groups: show the full pool, let Anthony select which ones to include in the plan
  - When selection changes: prereq chains update, semester planner re-validates

### 3.4 GPA Calculator

- **Actual GPA** — calculated from completed courses with grades
- **Cumulative:** all graded courses
- **Major GPA:** only courses counting toward the Stats & DS major
- **What-If mode:**
  - Enter hypothetical grades for planned/in-progress courses
  - See projected cumulative and major GPA in real time
  - "What grade do I need in X to get a 3.0 major GPA?" solver
- **Grade scale:** A=4.0, A-=3.7, B+=3.3, B=3.0, B-=2.7, C+=2.3, C=2.0, C-=1.7, D+=1.3, D=1.0, D-=0.7, F=0.0

### 3.5 Requirement Checklist

- **Expandable tree** of all requirement categories
- Each requirement shows: required hours, completed hours, remaining
- Courses under each requirement with status checkmarks
- For `pick_n` groups: show selected vs. available with swap UI
- Color coding: ✅ complete, 🔄 in progress, ⬜ not started, ⚠️ conflict

### 3.6 Audit Import / Update (Core Feature)

This is how data gets into the app. No manual entry required for initial setup.

**First upload (empty state):**
- Upload one or more audit PDFs
- Parser extracts:
  - Program info (degree, major, minor, catalog year)
  - Requirement categories with hours needed
  - All courses — completed (with grades), in-progress, and remaining
  - Which requirement each course satisfies
  - Completion status per requirement group
- App populates all views from extracted data
- Anthony reviews the parsed output, corrects any parser mistakes, confirms

**Subsequent uploads (update flow):**
- Upload a new audit PDF (e.g., after adding CS Minor, switching BA→BS)
- Parser extracts the new state
- **Diff view:** "Here's what changed since your last audit"
  - New requirement categories added
  - Requirements removed or restructured
  - Courses that moved categories
  - Credit hour changes
  - New courses appeared / old ones dropped
- **Confirm to apply** — preserves semester plans, what-if grades, and manual edits (prereqs, elective selections). Only updates the requirement structure.
- Can also manually edit requirements and courses through the UI after import

**Parser requirements:**
- Must handle CU's audit PDF format (the messy multi-page layout with sub-groups, matched courses, etc.)
- Should identify: requirement group names, required hours, earned hours, course numbers, course names, grades, in-progress markers
- Tolerance for format variations — audits change slightly between runs
- When parser confidence is low on a field, flag it for manual review rather than guessing

---

## 4. Parser Reference Data

**This data is NOT to be hardcoded into the app.** It exists here as reference material for building and testing the audit parser. The parser should be able to extract all of this from the audit PDFs automatically.

### 4.1 Completed Courses (Prior to Returning)

Example of what the parser should extract from completed course sections:

| Course | Name | Credits | Grade | Satisfies |
|--------|------|---------|-------|-----------|
| WRTG 1150 | First Year Writing/Rhetoric | 3 | B+ | Written Comm. LD |
| ENGL 3060 | Mod/Contemp Lit Nonmajors | 3 | A- | Arts & Humanities |
| RLST 2700 | Amer Indian Relig Traditions | 3 | D+ | Arts & Humanities |
| HIST 1025 | American History since 1865 | 3 | A | Arts & Humanities, US Perspective |
| MUEL 2852 | Music-Rock Era | 3 | A | Arts & Humanities |
| PHIL 1100 | Ethics | 3 | A | Arts & Humanities |
| PSYC 1001 | General Psychology | 4 | C | Natural Sciences |
| ASTR 1110 | Gen Astronomy-Solar Sys | 3 | C | Natural Sciences |
| IPHY 2420 | Nutrition for Health & Perform | 3 | A | Natural Sciences |
| KAPH 1010 | Intro to Kinesiology | 3 | D+ | Natural Sciences |
| SOCY 1001 | Intro to Sociology | 3 | A- | Social Sciences |
| ANTH 2200 | Archaeology of Human History | 3 | A | Social Sciences |
| ECON 2010 | Prin of Microeconomics | 4 | B | Social Sciences, QRMS |
| ECON 2020 | Prin of Macroeconomics | 4 | A | Social Sciences |
| ECON 3403 | International Economics and Policy | 3 | A | Social Sciences, Global Perspective |
| ORGN 3030 | Critical Leadership Skills | 3 | A- | — |
| ORGN 3010 | Negotiation & Conflict Mgmt | 3 | A- | — |
| EDUC 4161 | Children's Literature | 3 | D | — |
| ESBM 3100 | Intro to Entrepreneurship | 3 | A | — |
| QRMS 1010 | Quant Reasoning/Math Skills | 3 | B+ | QRMS |

### 4.2 Current / In-Progress (Spring 2026)

Example of in-progress course extraction:

| Course | Name | Credits | Satisfies |
|--------|------|---------|-----------|
| CSCI 1300 | Starting Computing (C++) | 4 | Ancillary Required, CS Minor overlap |
| ENGL 3016 | Writing in the Age of AI | 3 | Written Comm. UD |
| GEOG 1001 | Our Planet: Climate/Vegetation | 4 | Natural Sciences w/ Lab |
| MATH 2300 | Calculus 2 | 5 | Ancillary Required, CS Minor Math Req |

*Note: MATH 1150 (Precalculus, 4hrs) and MATH 1300 (Calculus 1, 5hrs) already completed — listed as ancillary required completed in audit.*

### 4.3 Semester Plans

Semester plans are **user-created, not audit-derived.** The audit tells us what's completed and in-progress. Anthony builds the future plan in the semester planner UI by dragging courses into future semesters. The audit only provides:
- Which courses are completed (with semester/grade)
- Which courses are currently in-progress (with current semester)
- What's remaining (unplanned — goes into an "Unplanned" pool for the user to assign)

### 4.4 Remaining Courses Needed

**Prerequisites (Major):**
| Course | Name | Credits | Prereqs | Status |
|--------|------|---------|---------|--------|
| MATH 1150 | Precalculus Mathematics | 4 | None | ✅ Completed |
| APPM 1650 | Python for Math & Data Science | 4 | None listed | Not started |
| APPM 4600 | Numerical Methods & Sci. Computing | 4 | TBD | Not started (possible prereq) |
| APPM 2360 | Intro to Diff Eq w/ Linear Algebra | 4 | TBD | Not started (possible prereq) |

**Major Lower Division:**
| Course | Name | Credits | Prereqs |
|--------|------|---------|---------|
| STAT 2600 | Introduction to Data Science | 4 | Calc 1 (MATH 1300 or APPM 1350 or APPM 1345) |
| APPM 2350 | Calculus 3 for Engineers | 4 | Calc 2 (MATH 2300 or APPM 1360) |

**Major Upper Division (Required — complete all):**
| Course | Name | Credits | Prereqs |
|--------|------|---------|---------|
| APPM 3310 | Matrix Methods and Applications | 3 | Calc 3 (APPM 2350/2340/MATH 2400) OR APPM 2360 |
| APPM 3650 | Algorithms & Data Structures in Python | 3 | APPM 1650 AND Calc 2 (MATH 2300/APPM 1360) |
| STAT 3100 | Applied Probability | 3 | Co/Pre: Calc 3 (APPM 2350/2340/MATH 2400) |
| STAT 4520 | Intro to Mathematical Statistics | 3 | STAT 3100 or APPM 3570 or MATH 4510 |
| STAT 3400 | Applied Regression | 3 | (STAT 2600) AND (STAT 3100 or MATH 4510); Coreq: APPM 3310 |
| STAT 4400 | Advanced Statistical Modeling | 3 | (STAT 3400) AND (STAT 4520 or STAT 5010) |
| STAT 4100 | Markov Processes, Queues, Monte Carlo | 3 | STAT 3100 or APPM 3570 or MATH 4510 |
| STAT 4610 | Statistical Learning | 3 | STAT 3400 |
| STAT 4350 | Applied Deep Learning | 3 | (STAT 3100 or APPM 3570) AND (STAT 3400 or STAT 4520) AND APPM 4600 |
| STAT 4640 | Capstone in Statistics & Data Science | 3 | STAT 4400 or STAT 4610 |

**Major Upper Division (Electives — pick from pool, need enough to reach required hours):**

These are the elective options. Anthony needs to choose courses from this pool to fill remaining upper-division hours. Each has its own prereq chain that becomes active only when selected.

| Course | Name | Credits | Prereqs |
|--------|------|---------|---------|
| STAT 4360 | Applied Deep Learning 2 | 3 | STAT 4350 |
| STAT 4680 | Statistics & Data Science Collaboration | 3 | TBD |
| STAT 4250 | Data Assimilation in High Dim Dynamical Systems | 3 | TBD |
| STAT 4430 | Spatial Statistics | 3 | TBD |
| STAT 4540 | Introduction to Time Series | 3 | TBD |
| STAT 4630 | Computational Bayesian Statistics | 3 | TBD |
| STAT 4700 | Philosophical & Ethical Issues in Statistics | 3 | TBD |
| APPM 4120 | Introduction to Operations Research | 3 | TBD |
| APPM 4320 | Introduction to Dynamics on Networks | 3 | TBD |
| APPM 4370 | Computational Neuroscience | 3 | TBD |
| APPM 4440 | Undergraduate Applied Analysis 1 | 3 | (APPM 2350 or MATH 2400) AND APPM 2360; Coreq: APPM 3310 |
| APPM 4450 | Undergraduate Applied Analysis 2 | 3 | APPM 4440 |
| APPM 4490 | Theory of Machine Learning | 3 | APPM 4440; Recommended: CSCI 5622 |
| APPM 4515 | High-Dimensional Probability for Data Science | 3 | TBD |
| APPM 4530 | Stochastic Analysis for Finance | 3 | TBD |
| APPM 4565 | Random Graphs | 3 | TBD |
| APPM 4600 | Numerical Methods & Scientific Computing | 4 | TBD |

**Ancillary Required (complete all — ✅ all done):**
| Course | Name | Credits | Status |
|--------|------|---------|--------|
| CSCI 1300 | Starting Computing | 4 | In progress (SP26) |
| MATH 1300 | Calculus 1 | 5 | ✅ Completed |
| MATH 2300 | Calculus 2 | 4-5 | In progress (SP26) |

**Ancillary Electives / CS Minor (pick_n — need 18 hours total):**
| Course | Name | Credits | Prereqs | Status |
|--------|------|---------|---------|--------|
| CSCI 2270 | Data Structures | 4 | CSCI 1300 | Planned SU26 (CSPB 2270) |
| CSCI 2400 | Computer Systems | 4 | CSCI 2270 | Not started |
| CSCI 2824 | Discrete Structures | 3 | CSCI 1300 (or equivalent) | Planned FA26 |
| CSCI 3104 | Algorithms | 4 | CSCI 2270, CSCI 2824 | Not started |
| CSCI 4622 | Machine Learning | 3 | TBD (likely CSCI 3104, STAT/APPM probability) | Not started |

*Plus the full CS Minor elective pool from the audit (upper-division CSCI courses).*

---

## 5. Prereq Graph (from Sheet 2)

The second sheet of the spreadsheet contains the full prerequisite dependency tree for the S&DS major. This is the authoritative prereq data. Key chains:

```
MATH 1150 (Precalc)
  → MATH 1300 (Calc 1)
    → MATH 2300 (Calc 2)
      → APPM 2350 (Calc 3 for Engineers)
        → APPM 3310 (Matrix Methods)
        → STAT 3100 (Applied Probability) [co/pre]
    → STAT 2600 (Intro to Data Science)

APPM 1650 (Python for Math & DS)
  + MATH 2300 (Calc 2)
    → APPM 3650 (Algorithms & DS in Python)

STAT 3100 (Applied Probability)
  → STAT 4520 (Intro to Math Stats)
  → STAT 4100 (Markov Processes)
  → STAT 4350 (Applied Deep Learning) [+ STAT 3400 + APPM 4600]

STAT 2600 + STAT 3100 → STAT 3400 (Applied Regression) [coreq: APPM 3310]
  → STAT 4610 (Statistical Learning)
  → STAT 4400 (Advanced Statistical Modeling) [+ STAT 4520]
    → STAT 4640 (Capstone)

STAT 4350 → STAT 4360 (Applied Deep Learning 2)
APPM 4440 → APPM 4490 (Theory of Machine Learning)
```

The full graph with OR alternatives belongs in structured `PrereqRule` objects.

---

## 6. UI/UX Notes

- **Dark theme** — consistent with Anthony's other projects
- **No auth** — personal tool, localhost only
- **Responsive** but desktop-primary (this is a planning tool, not mobile-first)
- **No markdown tables on export** — if we ever push summaries to Discord
- Sidebar navigation: Dashboard, Semester Planner, Course Catalog, Requirements, GPA Calculator, Settings
- Settings page: manage semesters, import audits, edit courses manually

---

## 7. Tech Details

- **Next.js 15+** with App Router
- **TypeScript** throughout
- **Tailwind CSS** for styling
- **Data storage:** JSON files in a `data/` directory (courses.json, requirements.json, semesters.json, grades.json)
  - No database server. Read/write JSON via API routes.
  - Could migrate to SQLite later if needed, but JSON is fine for this scale (~50 courses, ~10 semesters)
- **Drag and drop:** `@dnd-kit/core` or similar lightweight library
- **PDF parsing:** `pdf-parse` or similar for audit import (can be rough — audits have messy formatting)
- **Prereq data:** imported from a JSON file generated by a separate scraper project (`~/Projects/cu-prereq-scraper`). The scraper hits `classes.colorado.edu` and outputs prereqs for every course found in the audits. Degree-tracker reads this JSON — it does not scrape directly.
- **No other external APIs**

---

## 8. Resolved Questions

1. **Prereq data source:** Scrape from `classes.colorado.edu`. This is a **separate project** (`~/Projects/cu-prereq-scraper`) that outputs a JSON file of prereqs for every course that appears in the audits. Degree-tracker imports that JSON. Scraper can be re-run when courses change.

2. **Elective pools:** Show the **full pool** from the audit — all options visible. The whole point is seeing what's available. This applies to CS Minor electives, major UD electives, and any other pick-from-pool groups.

3. **Grade minimum tracking:** Yes. Flag grades below the requirement group minimum (e.g., C- for CS Minor).

4. **Course availability by semester:** Stretch goal — scraper could pull this from `classes.colorado.edu` too. Not blocking v1.

5. **Requirement category names:** Use the **exact category names from the audit PDFs** (e.g., "Computer Science Minor: Math Requirements", "A&S General Education Distribution Requirement", etc.). Do not rename or restructure them.

---

## 9. Out of Scope (v1)

- Mobile app
- Multi-user / sharing
- Integration with CU systems (Canvas, MyCUInfo)
- Automated schedule building (suggesting optimal semester plans)
- Course availability by semester (which courses are offered when)

*These could be v2 features if the tool proves useful.*

---

## 10. Definition of Done

- [ ] Audit PDF parser that extracts requirements, courses, grades, hours, and status from CU degree audit format
- [ ] Empty-state first-run experience with audit upload prompt
- [ ] Diff/reconcile flow for subsequent audit uploads
- [ ] Prereq graph support with AND/OR logic (manually editable per course)
- [ ] Dashboard with progress bars and GPA display
- [ ] Semester planner with drag-and-drop and prereq validation
- [ ] Course catalog with search, filter, and prereq tree view
- [ ] GPA calculator with what-if mode
- [ ] Requirement checklist with completion tracking
- [ ] Elective picker for `pick_n` groups
- [ ] Audit PDF upload + diff (can be basic for v1)
- [ ] Runs on localhost, looks good, feels good to use
