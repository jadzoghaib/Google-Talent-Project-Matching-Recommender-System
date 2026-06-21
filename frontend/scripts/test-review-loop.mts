// Headless check for the Phase 3 peer-review history loop.
// Proves that recording PM/peer/delivery reviews (a) feeds the history signal so
// a cold-start new hire's CF score moves, and (b) warms up their track record
// (mirror of App.submitReviews). Run: npx tsx scripts/test-review-loop.mts
import type { Employee, Project, Assignment } from '../src/lib/types';
import { computeMatchScore } from '../src/lib/scorer';

const today = '2026-06-21';

// A fresh new hire: no work history, no MF affinity → pure cold-start.
const newHire: Employee = {
  employee_id: 'EMP-NEW-TEST', name: 'Taylor New', level: 'L4', role_category: 'Mid',
  years_experience: 2, primary_domain: 'Cloud',
  skills: [{ skill: 'Cloud (GCP/AWS)', proficiency: 4 }, { skill: 'Kubernetes', proficiency: 4 }, { skill: 'Go', proficiency: 3 }],
  tech_tags: [], personality_openness: 4, personality_conscientiousness: 4, personality_extraversion: 3,
  personality_agreeableness: 4, personality_neuroticism: 2, education: { degree: 'MS', field: 'Computer Science', university: 'MIT' },
  previous_companies: ['Startup'], past_projects_count: 0, avg_past_performance: 3.5,
  primary_location: 'US-West', timezone_offset: 0, can_work_across_timezones: true,
  current_staffed: false, available_from: today, diversity_group: 'A',
};

const targetProject: Project = {
  project_id: 'PROJ-TARGET', title: 'Cloud Autoscaler', description: '', domain: 'Cloud', priority: 2,
  required_team_size_min: 3, required_team_size_max: 6, required_team_size_target: 4,
  required_roles: [{ role: 'Software Engineer', min_level: 'L4', count: 4 }],
  required_skills: [{ skill: 'Cloud (GCP/AWS)', min_proficiency: 3, weight: 1 }, { skill: 'Kubernetes', min_proficiency: 3, weight: 1 }],
  tech_requirements: [], duration_weeks: 16, target_start_date: today, status: 'pipeline',
};

// Domain map: the previously-delivered project is also in Cloud, so the
// domain-scoped history average will pick it up.
const domainMap: Record<string, string> = { 'PROJ-TARGET': 'Cloud', 'PROJ-DONE': 'Cloud' };

// No MF affinity for this employee → CF falls back to the history signal.
const noAffinity = {};

// BEFORE any reviews: no history → neutral 0.5 CF signal (cold-start fallback).
const before = computeMatchScore(newHire, targetProject, [], domainMap, noAffinity);

// Simulate App.submitReviews on a completed Cloud project: strong reviews.
const reviewRows = [{ pm_review: 5, peer_collaboration_avg: 5, delivery_score: 4 }];
const newHistory: Assignment[] = reviewRows.map(r => ({
  employee_id: newHire.employee_id, project_id: 'PROJ-DONE',
  pm_review: r.pm_review, peer_collaboration_avg: r.peer_collaboration_avg, delivery_score: r.delivery_score,
}));

// Warm-up math (mirror of App.submitReviews)
const composite = (reviewRows[0].pm_review + reviewRows[0].peer_collaboration_avg + reviewRows[0].delivery_score) / 3;
const warmedCount = newHire.past_projects_count + 1;
const warmedAvg = Math.round(((newHire.avg_past_performance * newHire.past_projects_count + composite) / warmedCount) * 100) / 100;
const warmedHire: Employee = { ...newHire, past_projects_count: warmedCount, avg_past_performance: warmedAvg };

// AFTER reviews: the history signal should reflect the strong delivered project.
const after = computeMatchScore(warmedHire, targetProject, newHistory, domainMap, noAffinity);

console.log('Cold-start new hire — "Cloud Autoscaler" match');
console.log(`  usedMF: ${before.usedMF} (expected false — no MF affinity)`);
console.log(`  CF/history signal:  before ${before.breakdown.history}  →  after ${after.breakdown.history}`);
console.log(`  overall score:      before ${before.score}  →  after ${after.score}`);
console.log(`  track record:       past_projects ${newHire.past_projects_count} → ${warmedHire.past_projects_count}, avg perf ${newHire.avg_past_performance} → ${warmedHire.avg_past_performance}`);

const checks: Array<[string, boolean, string]> = [
  ['cold-start uses history fallback, not MF', before.usedMF === false, `usedMF=${before.usedMF}`],
  ['history signal neutral before reviews', before.breakdown.history === 0.5, `${before.breakdown.history}`],
  ['reviews raise the CF/history signal', after.breakdown.history > before.breakdown.history, `${before.breakdown.history} → ${after.breakdown.history}`],
  ['overall match score increases', after.score > before.score, `${before.score} → ${after.score}`],
  ['past projects warmed +1', warmedHire.past_projects_count === 1, `${warmedHire.past_projects_count}`],
  ['avg performance blended upward', warmedHire.avg_past_performance > newHire.avg_past_performance, `${newHire.avg_past_performance} → ${warmedHire.avg_past_performance}`],
];

console.log('\nChecks:');
let allPass = true;
for (const [name, pass, detail] of checks) { console.log(`  ${pass ? 'PASS' : 'FAIL'} — ${name}  (${detail})`); if (!pass) allPass = false; }
console.log(`\n${allPass ? 'ALL CHECKS PASSED ✓' : 'SOME CHECKS FAILED ✗'}`);
process.exit(allPass ? 0 : 1);
