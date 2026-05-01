const fs = require('fs');
const courses = JSON.parse(fs.readFileSync('./data/courses.json', 'utf8'));
const reqs = JSON.parse(fs.readFileSync('./data/requirements.json', 'utf8'));
const courseIds = new Set(courses.map(function(c) { return c.id; }));

console.log('Total courses:', courses.length);
console.log('Total requirement groups:', reqs.length);
console.log('');

var allOk = true;

reqs.forEach(function(r) {
  var issues = [];
  var emptyPool = r.coursePool.length === 0;
  var missing = r.coursePool.filter(function(id) { return courseIds.has(id) === false; });

  if (emptyPool) {
    issues.push('coursePool is EMPTY');
  }
  if (missing.length > 0) {
    issues.push('IDs missing from courses.json: ' + missing.join(', '));
  }
  // pick_n must have a required count
  if (r.type === 'pick_n' && (r.required == null || r.required <= 0)) {
    issues.push('pick_n missing required count');
  }
  // minimum_hours must have requiredHours
  if (r.type === 'minimum_hours' && (r.requiredHours == null || r.requiredHours <= 0)) {
    issues.push('minimum_hours missing requiredHours');
  }
  // complete_all with empty pool: total=0, pct=0 — ProgressBar correctly shows not-done
  // (ProgressBar uses total > 0 && completed >= total, so 0/0 is NOT done)
  // This is still a tracker gap — flagged for awareness but not a UI bug.

  if (issues.length > 0) {
    allOk = false;
    console.log('ISSUE [' + r.id + ']');
    console.log('  name:', r.name);
    console.log('  type:', r.type, '| pool:', r.coursePool.length);
    issues.forEach(function(i) { console.log('  -', i); });
    console.log('');
  }
});

if (allOk) {
  console.log('All requirement groups OK.');
} else {
  console.log('Validation FAILED — see issues above.');
  process.exit(1);
}
