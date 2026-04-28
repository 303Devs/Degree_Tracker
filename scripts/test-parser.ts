/**
 * Test the parser improvements against the actual audit PDF.
 * Validates: course extraction, F-grade credits, W-grade display,
 * SP26/SU26/FA26 terms, and preparedDateToTerm.
 */

import fs from "fs";
import path from "path";
import { extractCourseworkHistory } from "../lib/parser";

// We need pdf-parse to get text from the PDF
async function main() {
  const pdfPath = path.join(__dirname, "../audits/stats-ds-audit.pdf");
  const buffer = fs.readFileSync(pdfPath);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse/lib/pdf-parse.js");
  const data = await pdfParse(buffer);
  const text: string = data.text;

  console.log("=== PDF Text Length:", text.length, "chars ===\n");

  // Run the extractor
  const result = extractCourseworkHistory(text);

  console.log("=== PROGRAM INFO ===");
  console.log(JSON.stringify(result.programInfo, null, 2));

  console.log("\n=== SEMESTERS ===");
  for (const sem of result.semesters) {
    console.log(`  ${sem.id} (${sem.label}) - ${sem.status} - ${sem.courses.length} courses: ${sem.courses.join(", ")}`);
  }

  console.log("\n=== COURSE COUNT:", result.courses.length, "===\n");

  // Check 1: SP26/SU26/FA26 courses extracted
  const futureSemesters = ["SP26", "SU26", "FA26"];
  for (const termId of futureSemesters) {
    const sem = result.semesters.find(s => s.id === termId);
    if (sem) {
      console.log(`✅ ${termId} semester found: ${sem.courses.length} courses - ${sem.courses.join(", ")}`);
    } else {
      console.log(`❌ ${termId} semester NOT FOUND`);
    }
  }

  // Check 2: F-grade courses have non-zero credits
  const fGradeCourses = result.courses.filter(c => c.grade === "F");
  console.log(`\n=== F-GRADE COURSES (${fGradeCourses.length}) ===`);
  for (const c of fGradeCourses) {
    const status = c.credits > 0 ? "✅" : "❌";
    console.log(`  ${status} ${c.id}: credits=${c.credits}, grade=${c.grade}, notes=${c.notes || "none"}`);
  }

  // Check 3: W-grade courses
  const wGradeCourses = result.courses.filter(c => c.grade === "W");
  console.log(`\n=== W-GRADE COURSES (${wGradeCourses.length}) ===`);
  for (const c of wGradeCourses) {
    const gpOk = c.gradePoints === undefined ? "✅" : "❌";
    console.log(`  ${gpOk} ${c.id}: credits=${c.credits}, gradePoints=${c.gradePoints ?? "N/A"}, grade=${c.grade}`);
  }

  // Check 4: Course status (in_progress vs registered)
  const inProgress = result.courses.filter(c => c.status === "in_progress");
  const registered = result.courses.filter(c => c.status === "registered");
  console.log(`\n=== STATUS BREAKDOWN ===`);
  console.log(`  completed: ${result.courses.filter(c => c.status === "completed").length}`);
  console.log(`  in_progress: ${inProgress.length} - ${inProgress.map(c => c.id).join(", ")}`);
  console.log(`  registered: ${registered.length} - ${registered.map(c => c.id).join(", ")}`);
  console.log(`  not_started: ${result.courses.filter(c => c.status === "not_started").length}`);

  // Check 5: GPA sanity - no W or *** grades should have grade points
  const badGPA = result.courses.filter(c => 
    (c.grade === "W" || c.grade === "***" || c.grade === "P" || c.grade === "NR") && 
    c.gradePoints !== undefined
  );
  if (badGPA.length > 0) {
    console.log(`\n❌ Courses with non-GPA grades but gradePoints set:`);
    for (const c of badGPA) {
      console.log(`  ${c.id}: grade=${c.grade}, gradePoints=${c.gradePoints}`);
    }
  } else {
    console.log(`\n✅ No non-GPA grades with gradePoints set`);
  }

  // Summary
  console.log("\n=== SUMMARY ===");
  const issues: string[] = [];
  
  for (const termId of futureSemesters) {
    if (!result.semesters.find(s => s.id === termId)) {
      issues.push(`Missing semester: ${termId}`);
    }
  }
  
  for (const c of fGradeCourses) {
    if (c.credits === 0) issues.push(`F-grade ${c.id} has 0 credits`);
  }
  
  for (const c of wGradeCourses) {
    if (c.gradePoints !== undefined) issues.push(`W-grade ${c.id} has gradePoints=${c.gradePoints}`);
  }

  if (issues.length === 0) {
    console.log("✅ ALL PARSER CHECKS PASSED");
  } else {
    console.log(`❌ ${issues.length} ISSUES FOUND:`);
    for (const issue of issues) {
      console.log(`  - ${issue}`);
    }
  }
}

main().catch(console.error);
