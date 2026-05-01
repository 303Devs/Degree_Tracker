/**
 * Real ML-DL Plans Validation Test
 * Verifies Sue's critical issues are resolved against real data
 */

import { normalizePlansFromJson } from '../lib/plan-normalization';
import { RawPlanData } from '../lib/plan-types';
import { Course } from '../lib/types';
import fs from 'fs/promises';
import path from 'path';

describe('Real ML-DL Plans Validation', () => {
  let mlPlansData: RawPlanData;
  let coursesData: Course[];

  beforeAll(async () => {
    // Load real ml-dl-plans.json
    const mlPlansPath = path.join(__dirname, '..', 'ml-dl-plans.json');
    const mlPlansRaw = await fs.readFile(mlPlansPath, 'utf-8');
    mlPlansData = JSON.parse(mlPlansRaw);

    // Load real courses.json
    const coursesPath = path.join(__dirname, '..', 'data', 'courses.json');
    const coursesRaw = await fs.readFile(coursesPath, 'utf-8');
    coursesData = JSON.parse(coursesRaw);
  });

  test('all courses are resolved with no unknown course errors', async () => {
    // Call without explicit config - should default to strict
    const result = await normalizePlansFromJson(mlPlansData, coursesData);
    
    // Should have no unknown course errors now that CSCI-2400 and CSCI-3155 are included
    const unknownCourseErrors = result.issues.filter(issue => issue.code === 'UNKNOWN_COURSE');
    
    expect(unknownCourseErrors.length).toBe(0);
    
    // Verify the previously unknown courses are now properly included
    const allCourseIds = coursesData.map(c => c.id);
    expect(allCourseIds).toContain('CSCI-2400');
    expect(allCourseIds).toContain('CSCI-3155');
  });

  test('stored credit fields are ignored with warnings', async () => {
    const result = await normalizePlansFromJson(mlPlansData, coursesData);
    
    // Should have warnings about ignoring stored credits
    const storedCreditWarnings = result.issues.filter(issue => issue.code === 'IGNORED_STORED_CREDITS');
    
    expect(storedCreditWarnings.length).toBeGreaterThan(0);
    
    // Should have warnings for both plan-level and semester-level stored credits
    const planLevelWarnings = storedCreditWarnings.filter(w => w.message.includes('totalCredits'));
    const semesterLevelWarnings = storedCreditWarnings.filter(w => w.message.includes('semester credits'));
    
    expect(planLevelWarnings.length).toBeGreaterThan(0);
    expect(semesterLevelWarnings.length).toBeGreaterThan(0);
    
    // All stored credit issues should be warnings, not errors
    storedCreditWarnings.forEach(warning => {
      expect(warning.type).toBe('warning');
    });
  });

  test('plans load successfully despite stored credits and unknown courses', async () => {
    const result = await normalizePlansFromJson(mlPlansData, coursesData);
    
    // Should still successfully load plan data
    expect(result.plans.length).toBe(2); // ml-efficient and dl-implementation
    
    // Verify plan structure is correct
    const mlEfficient = result.plans.find(p => p.id === 'ml-efficient');
    const dlImplementation = result.plans.find(p => p.id === 'dl-implementation');
    
    expect(mlEfficient).toBeDefined();
    expect(dlImplementation).toBeDefined();
    
    // Verify semester normalization worked
    expect(mlEfficient!.semesters['FA26']).toBeDefined();
    expect(mlEfficient!.semesters['SP27']).toBeDefined();
    expect(dlImplementation!.semesters['FA26']).toBeDefined();
    expect(dlImplementation!.semesters['SP27']).toBeDefined();
  });
});