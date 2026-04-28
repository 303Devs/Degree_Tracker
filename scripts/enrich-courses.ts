/**
 * Manual enrichment script: reads ~/Projects/cu-prereq-scraper/prereqs.json
 * and enriches data/courses.json with real names, credits, and prereq trees.
 *
 * Run with: npm run enrich
 */

import { enrichCoursesFromScraper } from "../lib/data";

const { enriched } = enrichCoursesFromScraper();
console.log(`Enrichment complete: ${enriched} courses enriched`);
