/**
 * Verification tests for REVIEW.md issues.
 * Confirms which issues are fixed vs still present.
 */

import { describe, it, expect } from "vitest";
import { extractCourseworkHistory } from "../lib/parser";
import { calcGPA, gradeToPoints } from "../lib/prereqs";
import type { Course } from "../lib/types";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeAuditText(opts: {
  preparedDate?: string;
  courses?: string[];
}): string {
  const date = opts.preparedDate ?? "04/25/26 - 12:59 AM";
  const header = [
    "109876543",
    `${date}PREPARED:`,
    "20267CATALOG YEAR:",
    "Bachelor of Science in Statistics and Data Science",
    "College of Arts and Sciences",
    "Merino, Anthony",
    "Program: CUBLD, ARSCU, STAT-BA",
    "EARNED:108.0HOURS",
    "IN PROGRESS 43.0HOURS",
    "342.6POINTS2.763GPA",
  ].join("\n");

  return `${header}\nCoursework History\n${(opts.courses ?? []).join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// C1: Hardcoded SP26 as current semester (SHOULD BE FIXED)
// ---------------------------------------------------------------------------

describe("REVIEW C1: semester status derived from prepared date", () => {
  it("spring prepared date → SP is current", () => {
    const text = makeAuditText({
      preparedDate: "04/25/26 - 12:59 AM",
      courses: [
        "FA25STAT31003.0AStats",
        "SP26MATH11504.0***Calc",
        "FA26CSCI13003.0***CS",
      ],
    });
    const result = extractCourseworkHistory(text);
    expect(result.semesters.find((s) => s.id === "FA25")!.status).toBe("completed");
    expect(result.semesters.find((s) => s.id === "SP26")!.status).toBe("in_progress");
    expect(result.semesters.find((s) => s.id === "FA26")!.status).toBe("registered");
  });

  it("fall prepared date → FA is current", () => {
    const text = makeAuditText({
      preparedDate: "10/15/26 - 09:00 AM",
      courses: [
        "SP26STAT31003.0AStats",
        "FA26CSCI13003.0***CS",
        "SP27MATH21003.0***Calc3",
      ],
    });
    const result = extractCourseworkHistory(text);
    expect(result.semesters.find((s) => s.id === "SP26")!.status).toBe("completed");
    expect(result.semesters.find((s) => s.id === "FA26")!.status).toBe("in_progress");
    expect(result.semesters.find((s) => s.id === "SP27")!.status).toBe("registered");
  });

  it("summer prepared date → SU is current", () => {
    const text = makeAuditText({
      preparedDate: "06/01/26 - 10:00 AM",
      courses: [
        "SP26STAT31003.0AStats",
        "SU26GEOG19623.0***Geog",
        "FA26CSCI13003.0***CS",
      ],
    });
    const result = extractCourseworkHistory(text);
    expect(result.semesters.find((s) => s.id === "SP26")!.status).toBe("completed");
    expect(result.semesters.find((s) => s.id === "SU26")!.status).toBe("in_progress");
    expect(result.semesters.find((s) => s.id === "FA26")!.status).toBe("registered");
  });
});

// ---------------------------------------------------------------------------
// W2: gradeToPoints divergence (parser vs prereqs)
// ---------------------------------------------------------------------------

describe("REVIEW W2: grade handling consistency", () => {
  it("parser sets gradePoints=undefined for non-GPA grades (W, HS, ***)", () => {
    const text = makeAuditText({
      courses: [
        "SP04MATH13000.0W",
        "SP00SPAN3.0HSSpanish",
        "SP26STAT26004.0***Data Science",
      ],
    });
    const result = extractCourseworkHistory(text);

    const wCourse = result.courses.find((c) => c.grade === "W");
    expect(wCourse?.gradePoints).toBeUndefined();

    const hsCourse = result.courses.find((c) => c.grade === "HS");
    expect(hsCourse?.gradePoints).toBeUndefined();

    // *** courses have no grade set
    const ipCourse = result.courses.find((c) => c.status === "in_progress");
    expect(ipCourse?.grade).toBeUndefined();
    expect(ipCourse?.gradePoints).toBeUndefined();
  });

  it("calcGPA excludes HS and unknown grades correctly", () => {
    const courses: Course[] = [
      {
        id: "A", number: "A", name: "A", credits: 3, prereqs: null, coreqs: null,
        status: "completed", grade: "A",
      },
      {
        id: "B", number: "B", name: "B", credits: 3, prereqs: null, coreqs: null,
        status: "completed", grade: "HS",
      },
      {
        id: "C", number: "C", name: "C", credits: 3, prereqs: null, coreqs: null,
        status: "completed", grade: "W",
      },
    ];
    // Only course A should count: 12/3 = 4.0
    expect(calcGPA(courses)).toBeCloseTo(4.0, 4);
  });

  it("prereqs gradeToPoints returns -1 for unknown grades", () => {
    expect(gradeToPoints("HS")).toBe(-1);
    expect(gradeToPoints("W")).toBe(-1);
    expect(gradeToPoints("***")).toBe(-1);
    expect(gradeToPoints("NR")).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// F-grade credit recovery
// ---------------------------------------------------------------------------

describe("REVIEW: F-grade credit handling", () => {
  it("F-grade courses excluded from earned hours but included in GPA", () => {
    const text = makeAuditText({
      courses: ["FA03GEOL10104.0FPhysical Geology"],
    });
    const result = extractCourseworkHistory(text);
    const c = result.courses.find((c) => c.id === "GEOL-1010")!;

    expect(c.countsTowardEarnedHours).toBe(false);
    expect(c.countsTowardGPA).not.toBe(false); // true or undefined
    expect(c.gradePoints).toBe(0.0);
  });

  it("F-grade courses with 0 credits get recovered from requirement text", () => {
    // The F course has 0 credits in history, but the requirement section
    // mentions the course with real credits in spaced format
    const text = [
      "109876543",
      "04/25/26 - 12:59 AMPREPARED:",
      "20267CATALOG YEAR:",
      "EARNED:108.0HOURS",
      "342.6POINTS2.763GPA",
      // Requirement section with spaced credit reference
      "Complete GEOL 1010  4.0 credits",
      "Coursework History",
      "FA03GEOL10100.0FPhysical Geology",
      "PROCESSED AS: ERTH1010",
    ].join("\n");

    const result = extractCourseworkHistory(text);
    const fCourse = result.courses.find((c) => c.id === "GEOL-1010");
    expect(fCourse).toBeDefined();
    expect(fCourse!.grade).toBe("F");
    expect(fCourse!.credits).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Grade replacement (>X >N) handling
// ---------------------------------------------------------------------------

describe("REVIEW: grade replacement flags", () => {
  it(">X >N excluded from degree, GPA, and earned hours", () => {
    const text = makeAuditText({
      courses: [
        "SP04CSCI12000.0F>X >N",
        "FA04CSCI12003.0BComputer Science 1",
      ],
    });
    const result = extractCourseworkHistory(text);

    const excluded = result.courses.find((c) => c.id.includes("__SP04"));
    expect(excluded).toBeDefined();
    expect(excluded!.countedTowardDegree).toBe(false);
    expect(excluded!.countsTowardGPA).toBe(false);
    expect(excluded!.countsTowardEarnedHours).toBe(false);

    const counted = result.courses.find((c) => c.id === "CSCI-1200");
    expect(counted).toBeDefined();
    expect(counted!.countedTowardDegree).toBe(true);
    expect(counted!.grade).toBe("B");
  });
});
