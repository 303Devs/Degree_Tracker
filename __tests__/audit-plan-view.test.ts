import { describe, expect, it } from "vitest";
import {
  buildAuditRequirementViewModels,
  filterAuditRequirementViewModels,
  type AuditCourseBucket,
} from "../lib/audit-plan-view";
import type { Course, RequirementGroup, Semester } from "../lib/types";

function makeCourse(overrides: Partial<Course> & { id: string }): Course {
  return {
    id: overrides.id,
    number: overrides.id.replace("-", " "),
    name: `Course ${overrides.id}`,
    credits: 3,
    prereqs: null,
    coreqs: null,
    status: "not_started",
    ...overrides,
  };
}

function makeGroup(overrides: Partial<RequirementGroup> & { id: string }): RequirementGroup {
  return {
    id: overrides.id,
    name: overrides.id,
    category: "Test",
    type: "complete_all",
    coursePool: [],
    ...overrides,
  };
}

function makeSemester(overrides: Partial<Semester> & { id: string }): Semester {
  return {
    id: overrides.id,
    label: overrides.id === "FA26" ? "Fall 2026" : "Spring 2026",
    type: overrides.id.startsWith("FA") ? "fall" : "spring",
    year: 2026,
    status: "planned",
    courses: [],
    ...overrides,
  };
}

function bucketIds(view: ReturnType<typeof buildAuditRequirementViewModels>[number], bucket: AuditCourseBucket): string[] {
  return view.buckets[bucket].map((item) => item.courseId);
}

describe("buildAuditRequirementViewModels", () => {
  it("buckets completed, in-progress, planned, remaining, and unknown options with deterministic precedence", () => {
    const requirements = [makeGroup({
      id: "stats-core",
      coursePool: ["STAT-3100", "STAT-4520", "STAT-4000", "STAT-5000", "UNKNOWN-1000"],
    })];
    const courses = [
      makeCourse({ id: "STAT-3100", status: "completed", grade: "A", semester: "SP26" }),
      makeCourse({ id: "STAT-4520", status: "registered", semester: "FA26" }),
      makeCourse({ id: "STAT-4000", status: "planned" }),
      makeCourse({ id: "STAT-5000", status: "not_started" }),
    ];

    const [view] = buildAuditRequirementViewModels({ courses, requirements });

    expect(bucketIds(view, "completed")).toEqual(["STAT-3100"]);
    expect(bucketIds(view, "in_progress")).toEqual(["STAT-4520"]);
    expect(bucketIds(view, "planned")).toEqual(["STAT-4000"]);
    expect(bucketIds(view, "remaining")).toEqual(["STAT-5000"]);
    expect(bucketIds(view, "unknown")).toEqual(["UNKNOWN-1000"]);
    expect(view.counts).toMatchObject({ completed: 1, inProgress: 1, planned: 1, remaining: 1, unknown: 1 });
  });

  it("keeps planned display counts separate from calcProgress completion semantics", () => {
    const requirements = [makeGroup({ id: "math-core", coursePool: ["MATH-1300", "MATH-2300"] })];
    const courses = [
      makeCourse({ id: "MATH-1300", status: "completed", grade: "B" }),
      makeCourse({ id: "MATH-2300", status: "planned", semester: "FA26" }),
    ];

    const [view] = buildAuditRequirementViewModels({ courses, requirements });

    expect(view.counts.completed).toBe(1);
    expect(view.counts.planned).toBe(1);
    expect(view.progress.completed).toBe(1);
    expect(view.progress.total).toBe(2);
    expect(view.progress.pct).toBe(0.5);
  });

  it("labels pick groups without claiming unselected completed options satisfy the requirement", () => {
    const requirements = [makeGroup({
      id: "pick-one-elective",
      type: "pick_one",
      coursePool: ["CSCI-3022", "STAT-4000"],
      selectedCourses: ["CSCI-3022"],
    })];
    const courses = [
      makeCourse({ id: "CSCI-3022", status: "planned", semester: "FA26" }),
      makeCourse({ id: "STAT-4000", status: "completed", grade: "A" }),
    ];

    const [view] = buildAuditRequirementViewModels({ courses, requirements });
    const selected = view.courseOptions.find((option) => option.courseId === "CSCI-3022");
    const unselectedCompleted = view.courseOptions.find((option) => option.courseId === "STAT-4000");

    expect(view.displayRule).toBe("Choose one eligible option");
    expect(selected?.selectionState).toBe("selected");
    expect(selected?.usage.currentRequirement).toBe("pick-one-elective");
    expect(unselectedCompleted?.selectionState).toBe("eligible");
    expect(unselectedCompleted?.usage.currentlyCountsFor).not.toContain("pick-one-elective");
    expect(view.progress.completed).toBe(0);
  });

  it("labels pick-N requirements by the required option count", () => {
    const requirements = [makeGroup({
      id: "stats-electives",
      type: "pick_n",
      required: 2,
      coursePool: ["STAT-4000", "STAT-4520", "CSCI-3022"],
    })];

    const [view] = buildAuditRequirementViewModels({ courses: [], requirements });

    expect(view.displayRule).toBe("Choose 2 eligible options");
    expect(view.progress.total).toBe(2);
  });

  it("uses hour-based progress for minimum-hours requirements without inventing missing course counts", () => {
    const requirements = [makeGroup({
      id: "ancillary-hours",
      type: "minimum_hours",
      requiredHours: 6,
      coursePool: ["CSCI-1300", "CSCI-2270"],
    })];
    const courses = [
      makeCourse({ id: "CSCI-1300", status: "completed", credits: 3, grade: "A" }),
      makeCourse({ id: "CSCI-2270", status: "not_started", credits: 4 }),
    ];

    const [view] = buildAuditRequirementViewModels({ courses, requirements });

    expect(view.progress.unit).toBe("hours");
    expect(view.progress.completed).toBe(3);
    expect(view.progress.total).toBe(6);
    expect(view.remainingLabel).toBe("3 hours remaining");
    expect(view.counts.plannedCredits).toBe(0);
    expect(view.counts.remaining).toBe(1);
  });

  it("tracks planned credits separately for minimum-hours display without changing completion progress", () => {
    const requirements = [makeGroup({
      id: "ancillary-hours",
      type: "minimum_hours",
      requiredHours: 6,
      coursePool: ["CSCI-1300", "CSCI-2270"],
    })];
    const courses = [
      makeCourse({ id: "CSCI-1300", status: "completed", credits: 3, grade: "A" }),
      makeCourse({ id: "CSCI-2270", status: "planned", credits: 4, semester: "FA26" }),
    ];

    const [view] = buildAuditRequirementViewModels({ courses, requirements });

    expect(view.progress.unit).toBe("hours");
    expect(view.progress.completed).toBe(3);
    expect(view.progress.total).toBe(6);
    expect(view.progress.pct).toBe(0.5);
    expect(view.counts.planned).toBe(1);
    expect(view.counts.plannedCredits).toBe(4);
  });

  it("adds planned prereq/coreq warning metadata in requirement context while keeping unplanned prereqs neutral", () => {
    const requirements = [makeGroup({ id: "calc-sequence", coursePool: ["MATH-1300", "MATH-2300"] })];
    const semesters = [makeSemester({ id: "SP26" }), makeSemester({ id: "FA26" })];
    const courses = [
      makeCourse({ id: "MATH-1300", status: "not_started", prereqs: { type: "course", courseId: "MATH-1011" } }),
      makeCourse({
        id: "MATH-2300",
        status: "planned",
        semester: "SP26",
        prereqs: { type: "course", courseId: "MATH-1300" },
      }),
    ];

    const [view] = buildAuditRequirementViewModels({ courses, requirements, semesters });
    const unplanned = view.courseOptions.find((option) => option.courseId === "MATH-1300");
    const planned = view.courseOptions.find((option) => option.courseId === "MATH-2300");

    expect(unplanned?.warning?.severity).toBe("info");
    expect(unplanned?.warning?.message).toContain("Prereqs required");
    expect(planned?.warning?.severity).toBe("warning");
    expect(planned?.warning?.message).toContain("Prereq missing");
    expect(planned?.warning?.missingCourseIds).toContain("MATH-1300");
  });

  it("sorts semester context before evaluating requirement-level prereq warnings", () => {
    const requirements = [makeGroup({ id: "calc-sequence", coursePool: ["MATH-1300", "MATH-2300"] })];
    const semesters = [
      makeSemester({ id: "FA26", label: "Fall 2026", type: "fall", year: 2026, courses: ["MATH-2300"] }),
      makeSemester({ id: "SP26", label: "Spring 2026", type: "spring", year: 2026, courses: ["MATH-1300"] }),
    ];
    const courses = [
      makeCourse({ id: "MATH-1300", status: "planned" }),
      makeCourse({ id: "MATH-2300", status: "planned", prereqs: { type: "course", courseId: "MATH-1300" } }),
    ];

    const [view] = buildAuditRequirementViewModels({ courses, requirements, semesters });
    const planned = view.courseOptions.find((option) => option.courseId === "MATH-2300");

    expect(planned?.semester).toBe("FA26");
    expect(planned?.warning?.severity).toBe("success");
  });

  it("filters audit rows by course number, course name, and requirement text without losing matched options", () => {
    const requirements = [
      makeGroup({ id: "stats-core", name: "Statistics Core", category: "Major", coursePool: ["STAT-3100", "STAT-4520"] }),
      makeGroup({ id: "writing", name: "Writing Requirement", category: "Gen Ed", coursePool: ["WRTG-3030"] }),
    ];
    const courses = [
      makeCourse({ id: "STAT-3100", number: "STAT 3100", name: "Applied Regression", status: "completed" }),
      makeCourse({ id: "STAT-4520", number: "STAT 4520", name: "Bayesian Data Analysis", status: "planned" }),
      makeCourse({ id: "WRTG-3030", number: "WRTG 3030", name: "Technical Writing", status: "not_started" }),
    ];
    const views = buildAuditRequirementViewModels({ courses, requirements });

    const byCourseName = filterAuditRequirementViewModels(views, "bayesian");
    expect(byCourseName).toHaveLength(1);
    expect(byCourseName[0].group.id).toBe("stats-core");
    expect(byCourseName[0].courseOptions.map((option) => option.courseId)).toEqual(["STAT-4520"]);

    const byRequirement = filterAuditRequirementViewModels(views, "writing requirement");
    expect(byRequirement.map((view) => view.group.id)).toEqual(["writing"]);
    expect(byRequirement[0].courseOptions.map((option) => option.courseId)).toEqual(["WRTG-3030"]);
  });

  it("can narrow option scanning to a status bucket", () => {
    const requirements = [makeGroup({ id: "stats-core", coursePool: ["STAT-3100", "STAT-4520", "STAT-5000"] })];
    const courses = [
      makeCourse({ id: "STAT-3100", status: "completed" }),
      makeCourse({ id: "STAT-4520", status: "planned" }),
      makeCourse({ id: "STAT-5000", status: "not_started" }),
    ];
    const views = buildAuditRequirementViewModels({ courses, requirements });

    const plannedOnly = filterAuditRequirementViewModels(views, "stat", "planned");

    expect(plannedOnly).toHaveLength(1);
    expect(plannedOnly[0].courseOptions.map((option) => option.courseId)).toEqual(["STAT-4520"]);
    expect(plannedOnly[0].buckets.planned.map((option) => option.courseId)).toEqual(["STAT-4520"]);
    expect(plannedOnly[0].buckets.completed).toEqual([]);
  });
});
