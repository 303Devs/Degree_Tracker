/**
 * Tests for course provenance (source tracking).
 * Task 4: Verify that courses carry their source origin.
 */

import { describe, it, expect } from "vitest";
import { extractCourseworkHistory } from "../lib/parser";

function makeAuditText(courses: string[]): string {
  const header = [
    "109876543",
    "04/25/26 - 12:59 AMPREPARED:",
    "20267CATALOG YEAR:",
    "Bachelor of Science in Statistics and Data Science",
    "College of Arts and Sciences",
    "Merino, Anthony",
    "Program: CUBLD, ARSCU, STAT-BA",
    "EARNED:108.0HOURS",
    "IN PROGRESS 43.0HOURS",
    "342.6POINTS2.763GPA",
  ].join("\n");

  return `${header}\nCoursework History\n${courses.join("\n")}\n`;
}

describe("course provenance", () => {
  it("audit-parsed courses have source='audit'", () => {
    const text = makeAuditText([
      "FA03ASTR11103.0CGen Astronomy-Solar Sys",
      "SP26STAT26004.0***Intro to Data Science",
    ]);
    const result = extractCourseworkHistory(text);

    for (const course of result.courses) {
      expect(course.source).toBe("audit");
    }
  });

  it("excluded (>X >N) courses also have source='audit'", () => {
    const text = makeAuditText([
      "SP04CSCI12000.0F>X >N",
      "FA04CSCI12003.0BComputer Science 1",
    ]);
    const result = extractCourseworkHistory(text);

    const excluded = result.courses.find((c) => c.id.includes("__SP04"));
    expect(excluded?.source).toBe("audit");

    const counted = result.courses.find((c) => c.id === "CSCI-1200");
    expect(counted?.source).toBe("audit");
  });

  it("HS transfer courses have source='audit'", () => {
    const text = makeAuditText(["SP00SPAN3.0HSSpanish"]);
    const result = extractCourseworkHistory(text);

    const hs = result.courses.find((c) => c.id === "SPAN-HS");
    expect(hs?.source).toBe("audit");
  });
});
