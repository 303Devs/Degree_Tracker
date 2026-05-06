#!/usr/bin/env node

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const scraperRoot = path.join(os.homedir(), "Projects", "cu-prereq-scraper");
const coursesPath = path.join(projectRoot, "data", "courses.json");
const requirementsPath = path.join(projectRoot, "data", "requirements.json");
const scraperInputPath = path.join(scraperRoot, "courses-to-scrape.json");
const scraperOutputPath = path.join(scraperRoot, "prereqs.json");

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function dashToSpace(id) {
  return id.replace(/-/g, " ");
}

function spaceToDash(id) {
  return id.trim().replace(/\s+/g, "-");
}

function isStubName(name, number) {
  if (!name) return true;
  const trimmed = name.trim();
  return trimmed === number || trimmed === spaceToDash(number) || /^[A-Z]+[\s-]\d+[A-Z]?$/.test(trimmed);
}

function convertRuleCourseIds(rule) {
  if (!rule) return null;
  if (rule.type === "course") return { type: "course", courseId: spaceToDash(rule.courseId) };
  return { ...rule, rules: rule.rules.map(convertRuleCourseIds).filter(Boolean) };
}

function collectCourseNumbers(courses, requirements) {
  const ids = new Set();
  for (const course of courses) ids.add(course.number || dashToSpace(course.id));
  for (const requirement of requirements) {
    for (const courseId of requirement.coursePool || []) ids.add(dashToSpace(courseId));
    for (const courseId of requirement.selectedCourses || []) ids.add(dashToSpace(courseId));
  }
  return [...ids]
    .map((id) => id.trim().replace(/\s+/g, " "))
    .filter((id) => /^[A-Z]{2,5}\s+\d{4}[A-Z]?$/.test(id))
    .sort();
}

function mergeScraperOutput(courses, scraperOutput) {
  const scraperMap = new Map();
  for (const [key, entry] of Object.entries(scraperOutput)) {
    scraperMap.set(spaceToDash(key), entry);
  }

  let enriched = 0;
  let missing = 0;

  for (const course of courses) {
    const entry = scraperMap.get(course.id);
    if (!entry) {
      missing++;
      continue;
    }

    let changed = false;

    if (entry.name && isStubName(course.name, course.number)) {
      course.name = entry.name;
      changed = true;
    }

    if (entry.credits && course.credits === 0) {
      course.credits = entry.credits;
      changed = true;
    }

    if (entry.description && !course.description) {
      course.description = entry.description;
      changed = true;
    }

    if (entry.description && !course.notes) {
      course.notes = entry.description;
      changed = true;
    }

    const prereqs = convertRuleCourseIds(entry.prereqs);
    if (prereqs && !course.prereqs) {
      course.prereqs = prereqs;
      changed = true;
    }

    const coreqs = convertRuleCourseIds(entry.coreqs);
    if (coreqs && !course.coreqs) {
      course.coreqs = coreqs;
      changed = true;
    }

    if (changed) {
      if (course.source === "stub" || !course.source) course.source = "enriched";
      enriched++;
    }
  }

  return { enriched, missing };
}

function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help") || args.has("-h")) {
    console.log(`Usage: npm run scrape:cu -- [--dry-run]

Reads data/courses.json and data/requirements.json, writes the discovered CU-style
course numbers to /Users/anthony/Projects/cu-prereq-scraper/courses-to-scrape.json,
runs the scraper, then merges prereqs/coreqs/names/credits/descriptions back into
data/courses.json.

Options:
  --dry-run   Only write the scraper input list; do not run Playwright or merge data.
  --help      Show this help text.`);
    return;
  }

  if (!fs.existsSync(scraperRoot)) {
    throw new Error(`CU scraper not found at ${scraperRoot}`);
  }

  const courses = readJson(coursesPath, []);
  const requirements = readJson(requirementsPath, []);
  const courseNumbers = collectCourseNumbers(courses, requirements);

  if (courseNumbers.length === 0) {
    throw new Error("No CU-style course numbers found in data/courses.json or data/requirements.json");
  }

  writeJson(scraperInputPath, courseNumbers);
  console.log(`Wrote ${courseNumbers.length} course(s) to ${scraperInputPath}`);

  if (args.has("--dry-run")) {
    console.log("Dry run complete. Scraper was not started.");
    return;
  }

  execFileSync("npm", ["run", "scrape"], {
    cwd: scraperRoot,
    stdio: "inherit",
  });

  const scraperOutput = readJson(scraperOutputPath, {});
  const result = mergeScraperOutput(courses, scraperOutput);
  writeJson(coursesPath, courses);

  console.log(`Merged CU catalog data: ${result.enriched} course(s) updated, ${result.missing} course(s) had no scraper output.`);
}

main();
