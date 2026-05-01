/**
 * Tests for lib/parser.ts — deterministic coursework history extraction.
 *
 * These test the regex parser (extractCourseworkHistory) with synthetic audit text.
 * No LLM calls, no PDF parsing — pure text → structured data.
 */

import { describe, it, expect } from "vitest";
import { extractCourseworkHistory } from "../lib/parser";

// ---------------------------------------------------------------------------
// Helpers: build synthetic audit text
// ---------------------------------------------------------------------------

function makeAuditText(opts: {
  preparedDate?: string;
  header?: string;
  courses?: string[];
  earnedHours?: number;
  gpa?: number;
}): string {
  const header = opts.header ?? [
    "109876543",
    "04/25/26 - 12:59 AMPREPARED:",
    "20267CATALOG YEAR:",
    "Bachelor of Science in Statistics and Data Science",
    "College of Arts and Sciences",
    "Merino, Anthony",
    "Program: CUBLD, ARSCU, STAT-BA",
    `EARNED:${opts.earnedHours ?? 108}.0HOURS`,
    `IN PROGRESS 43.0HOURS`,
    `342.6POINTS${opts.gpa ?? 2.763}GPA`,
  ].join("\n");

  const courseLines = (opts.courses ?? []).join("\n");

  // Override prepared date if provided
  let headerText = header;
  if (opts.preparedDate) {
    headerText = headerText.replace(
      /[\d/]+ - [\d:]+\s*[AP]MPREPARED:/,
      `${opts.preparedDate}PREPARED:`
    );
  }

  return `${headerText}\nCoursework History\n${courseLines}\n`;
}

// ---------------------------------------------------------------------------
// Program info extraction
// ---------------------------------------------------------------------------

describe("extractCourseworkHistory — program info", () => {
  it("extracts student ID, GPA, earned hours from header", () => {
    const text = makeAuditText({});
    const result = extractCourseworkHistory(text);

    expect(result.programInfo.studentId).toBe("109876543");
    expect(result.programInfo.gpa).toBeCloseTo(2.763, 3);
    expect(result.programInfo.earnedHours).toBe(108);
    expect(result.programInfo.inProgressHours).toBe(43);
    expect(result.programInfo.catalogYear).toBe("2026");
    expect(result.programInfo.college).toBe("College of Arts and Sciences");
    expect(result.programInfo.degreeName).toBe(
      "Bachelor of Science in Statistics and Data Science"
    );
  });

  it("extracts prepared date (compact CU format)", () => {
    const text = makeAuditText({});
    const result = extractCourseworkHistory(text);
    expect(result.programInfo.preparedDate).toBe("04/25/26 - 12:59 AM");
  });
});

// ---------------------------------------------------------------------------
// Course line regex parsing
// ---------------------------------------------------------------------------

describe("extractCourseworkHistory — course parsing", () => {
  it("parses a standard completed course line", () => {
    const text = makeAuditText({
      courses: ["FA03ASTR11103.0CGen Astronomy-Solar Sys"],
    });
    const result = extractCourseworkHistory(text);
    const c = result.courses.find((c) => c.id === "ASTR-1110");

    expect(c).toBeDefined();
    expect(c!.number).toBe("ASTR 1110");
    expect(c!.name).toBe("Gen Astronomy-Solar Sys");
    expect(c!.credits).toBe(3);
    expect(c!.grade).toBe("C");
    expect(c!.gradePoints).toBe(2.0);
    expect(c!.status).toBe("completed");
    expect(c!.semester).toBe("FA03");
  });

  it("parses grade modifiers (A-, B+, C-, D+)", () => {
    const text = makeAuditText({
      courses: [
        "FA03WRTG11503.0B+1st Yr Writing/Rhetoric",
        "SP04MATH13004.0A-Analytic Geometry/Calc 1",
        "FA04PHYS11104.0C-Gen Physics 1",
        "SP05CHEM11133.0D+Gen Chem Lab 1",
      ],
    });
    const result = extractCourseworkHistory(text);

    expect(result.courses.find((c) => c.id === "WRTG-1150")!.grade).toBe("B+");
    expect(result.courses.find((c) => c.id === "MATH-1300")!.grade).toBe("A-");
    expect(result.courses.find((c) => c.id === "PHYS-1110")!.grade).toBe("C-");
    expect(result.courses.find((c) => c.id === "CHEM-1113")!.grade).toBe("D+");
  });

  it("parses in-progress courses (*** grade)", () => {
    const text = makeAuditText({
      preparedDate: "04/25/26 - 12:59 AMPREPARED:",
      courses: ["SP26STAT26004.0***Intro to Data Science"],
    });
    const result = extractCourseworkHistory(text);
    const c = result.courses.find((c) => c.id === "STAT-2600");

    expect(c).toBeDefined();
    expect(c!.status).toBe("in_progress");
    expect(c!.grade).toBeUndefined();
    expect(c!.semester).toBe("SP26");
  });

  it("parses registered courses (*** grade, future term)", () => {
    const text = makeAuditText({
      preparedDate: "04/25/26 - 12:59 AMPREPARED:",
      courses: [
        "SU26GEOG19623.0***Geographies of Change",
        "FA26APPM16504.0***Python for Math + Data",
      ],
    });
    const result = extractCourseworkHistory(text);

    expect(result.courses.find((c) => c.id === "GEOG-1962")!.status).toBe(
      "registered"
    );
    expect(result.courses.find((c) => c.id === "APPM-1650")!.status).toBe(
      "registered"
    );
  });

  it("handles grade replacement flags (>X >N)", () => {
    const text = makeAuditText({
      courses: [
        "SP04CSCI12000.0F>X >N",
        "FA04CSCI12003.0BComputer Science 1",
      ],
    });
    const result = extractCourseworkHistory(text);

    // The excluded attempt gets a term-suffixed ID
    const excluded = result.courses.find((c) => c.id === "CSCI-1200__SP04");
    expect(excluded).toBeDefined();
    expect(excluded!.countedTowardDegree).toBe(false);
    expect(excluded!.countsTowardGPA).toBe(false);
    expect(excluded!.countsTowardEarnedHours).toBe(false);
    expect(excluded!.excludeReason).toContain(">X >N");

    // The counted attempt keeps the base ID
    const counted = result.courses.find((c) => c.id === "CSCI-1200");
    expect(counted).toBeDefined();
    expect(counted!.countedTowardDegree).toBe(true);
    expect(counted!.grade).toBe("B");
  });

  it("handles F grades (count toward GPA, not earned hours)", () => {
    const text = makeAuditText({
      // F with 0 credits — parser should recover credits from elsewhere
      courses: ["FA03GEOL10104.0FPhysical Geology"],
    });
    const result = extractCourseworkHistory(text);
    const c = result.courses.find((c) => c.id === "GEOL-1010");

    expect(c).toBeDefined();
    expect(c!.countsTowardEarnedHours).toBe(false);
    expect(c!.countsTowardGPA).not.toBe(false);
    expect(c!.gradePoints).toBe(0.0);
  });

  it("handles W (withdrawn) grades", () => {
    const text = makeAuditText({
      courses: ["SP04MATH13000.0W"],
    });
    const result = extractCourseworkHistory(text);
    // W course — find by base id or term-suffixed
    const wCourses = result.courses.filter(
      (c) => c.id.startsWith("MATH-1300") && c.grade === "W"
    );
    expect(wCourses.length).toBeGreaterThanOrEqual(1);
    const c = wCourses[0];
    expect(c.countsTowardGPA).toBe(false);
    expect(c.countsTowardEarnedHours).toBe(false);
    expect(c.gradePoints).toBeUndefined();
  });

  it("handles HS (high school) transfer courses", () => {
    const text = makeAuditText({
      courses: ["SP00SPAN3.0HSSpanish"],
    });
    const result = extractCourseworkHistory(text);
    const c = result.courses.find((c) => c.id === "SPAN-HS");

    expect(c).toBeDefined();
    expect(c!.grade).toBe("HS");
    expect(c!.credits).toBe(3);
    expect(c!.name).toBe("Spanish");
  });

  it("handles PROCESSED AS annotation", () => {
    const text = makeAuditText({
      courses: [
        "FA03GEOL10104.0FPhysical Geology",
        "PROCESSED AS: ERTH1010",
      ],
    });
    const result = extractCourseworkHistory(text);
    const c = result.courses.find((c) => c.id === "GEOL-1010");
    expect(c).toBeDefined();
    expect(c!.notes).toContain("Processed as: ERTH1010");
  });

  it("handles course with flags and title on next line", () => {
    const text = makeAuditText({
      courses: [
        "SP04CSCI12000.0F>X >N",
        "Computer Science 1",
      ],
    });
    const result = extractCourseworkHistory(text);
    // The excluded course should pick up the continuation title
    const c = result.courses.find((c) => c.id === "CSCI-1200__SP04");
    expect(c).toBeDefined();
    expect(c!.name).toBe("Computer Science 1");
  });
});

// ---------------------------------------------------------------------------
// Semester derivation
// ---------------------------------------------------------------------------

describe("extractCourseworkHistory — semesters", () => {
  it("creates semester objects from course terms", () => {
    const text = makeAuditText({
      courses: [
        "FA03ASTR11103.0CGen Astronomy",
        "FA03WRTG11503.0B+Writing",
        "SP04MATH13004.0A-Calculus",
      ],
    });
    const result = extractCourseworkHistory(text);

    const fa03 = result.semesters.find((s) => s.id === "FA03");
    expect(fa03).toBeDefined();
    expect(fa03!.label).toBe("Fall 2003");
    expect(fa03!.type).toBe("fall");
    expect(fa03!.year).toBe(2003);
    expect(fa03!.courses).toContain("ASTR-1110");
    expect(fa03!.courses).toContain("WRTG-1150");

    const sp04 = result.semesters.find((s) => s.id === "SP04");
    expect(sp04).toBeDefined();
    expect(sp04!.label).toBe("Spring 2004");
    expect(sp04!.type).toBe("spring");
  });

  it("sorts semesters chronologically", () => {
    const text = makeAuditText({
      courses: [
        "SP04MATH13004.0A-Calc",
        "FA03ASTR11103.0CGen Astronomy",
        "SU04PHYS11104.0BPhysics",
      ],
    });
    const result = extractCourseworkHistory(text);
    const ids = result.semesters.map((s) => s.id);

    expect(ids.indexOf("FA03")).toBeLessThan(ids.indexOf("SP04"));
    expect(ids.indexOf("SP04")).toBeLessThan(ids.indexOf("SU04"));
  });

  it("derives semester status from prepared date (not hardcoded)", () => {
    // Prepared in April 2026 → current term is SP26
    const text = makeAuditText({
      preparedDate: "04/25/26 - 12:59 AMPREPARED:",
      courses: [
        "FA25STAT31003.0AStats",
        "SP26STAT26004.0***Intro to Data Science",
        "SU26GEOG19623.0***Geographies of Change",
        "FA26APPM16504.0***Python",
      ],
    });
    const result = extractCourseworkHistory(text);

    expect(result.semesters.find((s) => s.id === "FA25")!.status).toBe("completed");
    expect(result.semesters.find((s) => s.id === "SP26")!.status).toBe("in_progress");
    expect(result.semesters.find((s) => s.id === "SU26")!.status).toBe("registered");
    expect(result.semesters.find((s) => s.id === "FA26")!.status).toBe("registered");
  });

  it("handles prepared date in fall → FA is current", () => {
    const text = makeAuditText({
      header: [
        "109876543",
        "09/15/26 - 10:00 AMPREPARED:",
        "20267CATALOG YEAR:",
        "Bachelor of Science in Statistics and Data Science",
        "College of Arts and Sciences",
        "Merino, Anthony",
        "Program: CUBLD, ARSCU, STAT-BA",
        "EARNED:120.0HOURS",
        "IN PROGRESS 15.0HOURS",
        "400.0POINTS3.333GPA",
      ].join("\n"),
      courses: [
        "SP26STAT31003.0AStats",
        "SU26GEOG19623.0BGeog",
        "FA26APPM16504.0***Python",
        "SP27MATH31004.0***Linear Algebra",
      ],
    });
    const result = extractCourseworkHistory(text);

    expect(result.semesters.find((s) => s.id === "SP26")!.status).toBe("completed");
    expect(result.semesters.find((s) => s.id === "SU26")!.status).toBe("completed");
    expect(result.semesters.find((s) => s.id === "FA26")!.status).toBe("in_progress");
    expect(result.semesters.find((s) => s.id === "SP27")!.status).toBe("registered");
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("extractCourseworkHistory — edge cases", () => {
  it("handles empty text gracefully", () => {
    const result = extractCourseworkHistory("");
    expect(result.courses).toEqual([]);
    expect(result.semesters).toEqual([]);
  });

  it("handles text with no Coursework History section", () => {
    const result = extractCourseworkHistory("Some random text\nNo courses here\n");
    expect(result.courses).toEqual([]);
    expect(result.semesters).toEqual([]);
  });

  it("deduplicates course IDs (latest attempt wins for counted courses)", () => {
    const text = makeAuditText({
      courses: [
        "FA03CSCI12003.0CComputer Science 1",
        "SP04CSCI12003.0AComputer Science 1",
      ],
    });
    const result = extractCourseworkHistory(text);
    // Only one counted version of CSCI-1200
    const counted = result.courses.filter((c) => c.id === "CSCI-1200");
    expect(counted.length).toBe(1);
    // The richer/later one should win
    expect(counted[0].semester).toBe("SP04");
  });

  it("course with suffix letter in number (e.g., 1300A)", () => {
    const text = makeAuditText({
      courses: ["FA03MATH1300A3.0BCalc Recitation"],
    });
    const result = extractCourseworkHistory(text);
    const c = result.courses.find((c) => c.id === "MATH-1300A");
    expect(c).toBeDefined();
    expect(c!.number).toBe("MATH 1300A");
  });
});
