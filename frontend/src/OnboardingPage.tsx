import { useState } from 'react';
import { ChevronLeft, ChevronRight, User, Zap, Brain, CheckCircle2 } from 'lucide-react';
import type { Employee } from './lib/types';
import {
  SKILLS_CATALOG, EMPLOYEE_DOMAINS as DOMAINS, LEVELS,
  EMPLOYEE_ROLES as ROLES, LOCATIONS,
} from './lib/catalog';

const DOMAIN_COLORS: Record<string, string> = {
  Search:'#4285F4', Ads:'#FBBC04', YouTube:'#EA4335', Android:'#34A853',
  Cloud:'#1a73e8', 'AI Platform':'#a142f4', Payments:'#0F9D58',
  Infra:'#5f6368', Maps:'#F4B400', Workspace:'#4A90D9', Chrome:'#d93025', Undecided:'#9aa0a6',
};

const DOMAIN_SCENARIOS = [
  { domain: 'Search',       title: 'Search Infrastructure',
    scenario: 'Query latency has spiked 3× at peak traffic. Distributed tracing points to the ranking pipeline. You must diagnose and fix it under SLA pressure.' },
  { domain: 'Ads',          title: 'Ads & Monetisation',
    scenario: 'A new ad format is underperforming its CTR target. You have clickstream data and A/B infrastructure to run ML-driven experiments and iterate fast.' },
  { domain: 'YouTube',      title: 'YouTube & Video Platforms',
    scenario: 'Your recommendation model is creating filter bubbles for a user segment. You must redesign the diversity component without hurting overall watch time.' },
  { domain: 'Android',      title: 'Android Development',
    scenario: 'Users report excessive battery drain from your background sync service on Android 14. You need to profile it and redesign the scheduler using platform APIs.' },
  { domain: 'Cloud',        title: 'Cloud Infrastructure',
    scenario: "A customer's multi-region deployment is experiencing split-brain failures in their managed Kubernetes cluster. You must diagnose and resolve the incident." },
  { domain: 'AI Platform',  title: 'AI & Machine Learning',
    scenario: 'You must cut LLM training time by 40% on TPU v4 pods without degrading quality. The bottleneck is somewhere in the data pipeline and the training loop.' },
  { domain: 'Payments',     title: 'Payments & Financial Systems',
    scenario: "Fraud detection flags 2× more legitimate transactions than last month. Determine whether it's data drift, threshold misconfiguration, or model degradation — under compliance constraints." },
  { domain: 'Infra',        title: 'Infrastructure & SRE',
    scenario: 'A cascading failure is propagating across the service mesh via a misconfigured circuit breaker. You are on-call and must contain the incident and find the root cause.' },
  { domain: 'Maps',         title: 'Maps & Geospatial',
    scenario: 'The routing engine produces suboptimal routes in dense urban areas at peak hours. You suspect the real-time traffic ingestion pipeline is lagging behind the graph computation.' },
  { domain: 'Workspace',    title: 'Workspace & Collaboration',
    scenario: 'Shared documents collapse with 500+ concurrent editors. Trace a suspected conflict in the operational transform layer through the real-time sync stack.' },
  { domain: 'Chrome',       title: 'Chrome & Browser Engineering',
    scenario: 'A researcher reports a speculative execution vulnerability in the JIT compiler. Assess impact, coordinate a patch, and ship a silent update to 3 billion users.' },
];

const BIG_FIVE_ITEMS = [
  { trait: 'personality_openness',          text: 'I enjoy exploring new ideas and technologies even when the outcome is uncertain.' },
  { trait: 'personality_conscientiousness', text: 'I plan my work carefully, pay attention to detail, and follow through on commitments.' },
  { trait: 'personality_extraversion',      text: 'I am energised by collaboration, group discussions, and presenting work to others.' },
  { trait: 'personality_agreeableness',     text: "I prioritise team harmony and adapt my approach to support others' needs." },
  { trait: 'personality_neuroticism',       text: 'I tend to feel anxious or stressed when facing ambiguous or high-pressure situations.' },
  { trait: 'personality_openness',          text: 'I actively seek projects outside my comfort zone to broaden my skill set.' },
  { trait: 'personality_conscientiousness', text: 'I set clear goals and rarely leave tasks partially completed.' },
  { trait: 'personality_extraversion',      text: 'In meetings I naturally take the initiative to drive the discussion forward.' },
  { trait: 'personality_agreeableness',     text: "I find it easy to understand a colleague's perspective and support their point of view." },
  { trait: 'personality_neuroticism',       text: 'I remain calm and focused when deadlines shift or requirements change unexpectedly.' },
];

const APTITUDE_LABELS = ['No exposure', 'Some familiarity', 'Hands-on exp.', 'Led projects', 'Domain expert'];
const LIKERT_LABELS   = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];

const STEPS = [
  { key: 'profile',     label: 'Profile',            icon: User },
  { key: 'aptitude',    label: 'Tech Aptitude',      icon: Zap },
  { key: 'personality', label: 'Working Style',      icon: Brain },
  { key: 'review',      label: 'Review & Submit',    icon: CheckCircle2 },
];

const field = 'mt-1 w-full rounded-lg border border-[#dadce0] bg-white px-3 py-2.5 text-sm text-[#202124] outline-none transition focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]';
const lbl   = 'text-xs font-medium text-[#5f6368]';

function RatingRow({ value, onChange, labels }: { value: number; onChange: (v: number) => void; labels: string[] }) {
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`flex flex-1 flex-col items-center rounded-lg border px-1 py-2 text-center transition ${
            value === n
              ? 'border-[#1a73e8] bg-[#1a73e8] text-white'
              : 'border-[#dadce0] bg-white text-[#5f6368] hover:border-[#1a73e8] hover:text-[#1a73e8]'
          }`}
          title={labels[n - 1]}
        >
          <span className="text-sm font-bold leading-tight">{n}</span>
          <span className="mt-0.5 hidden text-[9px] leading-tight sm:block">{labels[n - 1]}</span>
        </button>
      ))}
    </div>
  );
}

interface ProfileData {
  name: string; level: string; role_category: string; primary_domain: string;
  years_experience: number; skills: string[]; primary_location: string;
}
type AptitudeData    = Record<string, number>;
type PersonalityData = Record<number, number>;

export interface NewHireResult {
  employee: Employee;
  domainAffinities: Record<string, number>;
}

interface Props {
  onSubmit: (result: NewHireResult) => void;
  onCancel: () => void;
}

export function OnboardingPage({ onSubmit, onCancel }: Props) {
  const [step, setStep]       = useState(0);
  const [profile, setProfile] = useState<ProfileData>({
    name: '', level: 'L4', role_category: 'Mid', primary_domain: 'Undecided',
    years_experience: 2, skills: [], primary_location: 'US-West',
  });
  const [aptitude,     setAptitude]     = useState<AptitudeData>({});
  const [personality,  setPersonality]  = useState<PersonalityData>({});
  const [error,        setError]        = useState<string | null>(null);

  function validateStep(): string | null {
    if (step === 0) {
      if (!profile.name.trim()) return 'Full name is required.';
      if (profile.skills.length === 0) return 'Select at least one skill.';
    }
    if (step === 1) {
      const missing = DOMAIN_SCENARIOS.filter(s => !aptitude[s.domain]);
      if (missing.length) return `Rate your aptitude for: ${missing.map(s => s.domain).join(', ')}.`;
    }
    if (step === 2) {
      const missing = BIG_FIVE_ITEMS.map((_, i) => i).filter(i => personality[i] == null);
      if (missing.length) return `Answer all ${BIG_FIVE_ITEMS.length} working-style statements.`;
    }
    return null;
  }

  function next()  { const e = validateStep(); if (e) { setError(e); return; } setError(null); setStep(s => s + 1); }
  function back()  { setError(null); setStep(s => s - 1); }

  function computeBigFive(): Record<string, number> {
    const sums: Record<string, number[]> = {};
    BIG_FIVE_ITEMS.forEach((item, i) => {
      if (!sums[item.trait]) sums[item.trait] = [];
      sums[item.trait].push(personality[i] ?? 3);
    });
    const out: Record<string, number> = {};
    for (const [trait, vals] of Object.entries(sums)) {
      if (trait === 'personality_neuroticism') {
        // item 4 (index 4): positively keyed ("I feel anxious") → high = high N
        // item 9 (index 9): negatively keyed ("I remain calm") → invert before averaging
        const pos = vals[0] ?? 3;
        const neg = 6 - (vals[1] ?? 3);
        out[trait] = Math.round((pos + neg) / 2);
      } else {
        out[trait] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
      }
    }
    return out;
  }

  function handleSubmit() {
    const e = validateStep();
    if (e) { setError(e); return; }
    const bigFive = computeBigFive();
    const empId   = `EMP-NEW-${Date.now()}`;
    const today   = new Date().toISOString().split('T')[0];

    const employee: Employee = {
      employee_id: empId,
      name: profile.name.trim(),
      level: profile.level,
      role_category: profile.role_category,
      years_experience: profile.years_experience,
      primary_domain: profile.primary_domain === 'Undecided' ? null : profile.primary_domain,
      skills: profile.skills.map(s => ({ skill: s, proficiency: 3 })),
      tech_tags: [],
      personality_openness:          bigFive['personality_openness']          ?? 3,
      personality_conscientiousness: bigFive['personality_conscientiousness'] ?? 3,
      personality_extraversion:      bigFive['personality_extraversion']      ?? 3,
      personality_agreeableness:     bigFive['personality_agreeableness']     ?? 3,
      personality_neuroticism:       bigFive['personality_neuroticism']       ?? 3,
      education: { degree: 'BSc', field: 'Computer Science', university: 'Other Top School' },
      previous_companies: [],
      past_projects_count: 0,
      avg_past_performance: 3.5,
      primary_location: profile.primary_location,
      timezone_offset: 0,
      can_work_across_timezones: true,
      current_staffed: false,
      available_from: today,
      diversity_group: 'Not specified',
    };

    onSubmit({ employee, domainAffinities: aptitude });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6">
      <div>
        <h2 className="text-[24px] font-normal tracking-tight text-[#202124]">Employee Onboarding</h2>
        <p className="mt-1 text-sm text-[#5f6368]">
          Captures the technical and behavioural profile needed to recommend projects from day one — solving the cold-start problem without any work history.
        </p>
      </div>

      {/* Progress bar */}
      <div className="flex items-center">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done = i < step, cur = i === step;
          return (
            <div key={s.key} className="flex flex-1 items-center">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                done ? 'bg-[#34A853] text-white' : cur ? 'bg-[#1a73e8] text-white' : 'bg-[#e8eaed] text-[#9aa0a6]'
              }`}>
                {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-3.5 w-3.5" />}
              </div>
              <span className={`mx-2 hidden text-[11px] font-medium sm:block ${cur ? 'text-[#202124]' : 'text-[#9aa0a6]'}`}>{s.label}</span>
              {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 ${i < step ? 'bg-[#34A853]' : 'bg-[#e8eaed]'}`} />}
            </div>
          );
        })}
      </div>

      {/* Card */}
      <div className="rounded-2xl border border-[#dadce0] bg-white p-6 shadow-[0_1px_3px_rgba(60,64,67,0.10)]">

        {/* Step 0 — Profile */}
        {step === 0 && (
          <div className="space-y-4">
            <h3 className="flex items-center gap-2 text-base font-medium text-[#202124]">
              <User className="h-4 w-4 text-[#1a73e8]" /> Your profile
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 block">
                <span className={lbl}>Full name</span>
                <input value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })}
                  className={field} placeholder="e.g. Priya Wang" />
              </label>
              <label className="block">
                <span className={lbl}>Level</span>
                <select value={profile.level} onChange={e => setProfile({ ...profile, level: e.target.value })} className={field}>
                  {LEVELS.map(l => <option key={l}>{l}</option>)}
                </select>
              </label>
              <label className="block">
                <span className={lbl}>Role</span>
                <select value={profile.role_category} onChange={e => setProfile({ ...profile, role_category: e.target.value })} className={field}>
                  {ROLES.map(r => <option key={r}>{r}</option>)}
                </select>
              </label>
              <label className="block">
                <span className={lbl}>Primary domain</span>
                <select value={profile.primary_domain} onChange={e => setProfile({ ...profile, primary_domain: e.target.value })} className={field}>
                  {DOMAINS.map(d => <option key={d}>{d}</option>)}
                </select>
              </label>
              <label className="block">
                <span className={lbl}>Years of experience</span>
                <input type="number" min={0} max={40} value={profile.years_experience}
                  onChange={e => setProfile({ ...profile, years_experience: parseInt(e.target.value) || 0 })} className={field} />
              </label>
              <label className="block">
                <span className={lbl}>Location</span>
                <select value={profile.primary_location} onChange={e => setProfile({ ...profile, primary_location: e.target.value })} className={field}>
                  {LOCATIONS.map(l => <option key={l}>{l}</option>)}
                </select>
              </label>
              <div className="col-span-2">
                <span className={lbl}>Skills <span className="text-[#9aa0a6]">· tap to select from the catalog</span></span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {SKILLS_CATALOG.map(s => {
                    const on = profile.skills.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setProfile({
                          ...profile,
                          skills: on ? profile.skills.filter(x => x !== s) : [...profile.skills, s],
                        })}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                          on
                            ? 'border-[#1a73e8] bg-[#1a73e8] text-white'
                            : 'border-[#dadce0] bg-white text-[#5f6368] hover:border-[#1a73e8] hover:text-[#1a73e8]'
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 1 — Domain aptitude */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h3 className="flex items-center gap-2 text-base font-medium text-[#202124]">
                <Zap className="h-4 w-4 text-[#1a73e8]" /> Technical aptitude
              </h3>
              <p className="mt-1 text-[12px] text-[#5f6368]">
                Rate your experience with each scenario. These 11 scores become your domain affinity profile — used directly as the CF signal in the recommender, bypassing cold-start.
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#80868b]">
                {APTITUDE_LABELS.map((l, i) => (
                  <span key={i}><span className="font-semibold text-[#5f6368]">{i + 1}</span> = {l}</span>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              {DOMAIN_SCENARIOS.map(({ domain, title, scenario }) => (
                <div key={domain} className="rounded-xl border border-[#e8eaed] p-3.5">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: DOMAIN_COLORS[domain] }} />
                    <span className="text-[12px] font-semibold text-[#202124]">{title}</span>
                    {aptitude[domain] != null && (
                      <span className="ml-auto rounded-full bg-[#e8f0fe] px-2 py-0.5 text-[10px] font-semibold text-[#1967d2]">
                        {aptitude[domain]}/5
                      </span>
                    )}
                  </div>
                  <p className="mb-3 text-[11px] leading-relaxed text-[#5f6368]">{scenario}</p>
                  <RatingRow value={aptitude[domain] ?? 0} onChange={v => setAptitude(a => ({ ...a, [domain]: v }))} labels={APTITUDE_LABELS} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2 — Working style */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h3 className="flex items-center gap-2 text-base font-medium text-[#202124]">
                <Brain className="h-4 w-4 text-[#1a73e8]" /> Working style
              </h3>
              <p className="mt-1 text-[12px] text-[#5f6368]">
                Rate how accurately each statement describes you. These calibrate the Big Five model used for team cohesion and chemistry scoring.
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#80868b]">
                {LIKERT_LABELS.map((l, i) => (
                  <span key={i}><span className="font-semibold text-[#5f6368]">{i + 1}</span> = {l}</span>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              {BIG_FIVE_ITEMS.map((item, i) => (
                <div key={i} className="rounded-xl border border-[#e8eaed] p-3.5">
                  <p className="mb-3 text-[12px] font-medium leading-relaxed text-[#202124]">
                    <span className="mr-2 text-[10px] text-[#9aa0a6]">{i + 1}.</span>{item.text}
                  </p>
                  <RatingRow value={personality[i] ?? 0} onChange={v => setPersonality(p => ({ ...p, [i]: v }))} labels={LIKERT_LABELS} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3 — Review */}
        {step === 3 && (() => {
          const bigFive  = computeBigFive();
          const skillList = profile.skills;
          return (
            <div className="space-y-5">
              <h3 className="flex items-center gap-2 text-base font-medium text-[#202124]">
                <CheckCircle2 className="h-4 w-4 text-[#34A853]" /> Review & confirm
              </h3>

              <div className="rounded-xl border border-[#e8eaed] p-4">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#5f6368]">Profile</div>
                <div className="text-[15px] font-semibold text-[#202124]">{profile.name}</div>
                <div className="mt-0.5 text-[12px] text-[#5f6368]">
                  {profile.level} · {profile.role_category} · {profile.primary_domain} · {profile.years_experience}y exp · {profile.primary_location}
                </div>
                {skillList.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {skillList.map(s => <span key={s} className="rounded-full bg-[#f1f3f4] px-2 py-0.5 text-[10px] text-[#5f6368]">{s}</span>)}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-[#e8eaed] p-4">
                <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[#5f6368]">
                  Domain affinity profile — injected as cold-start CF signal
                </div>
                <div className="space-y-2">
                  {DOMAIN_SCENARIOS.map(({ domain }) => {
                    const v = aptitude[domain] ?? 0;
                    return (
                      <div key={domain} className="flex items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: DOMAIN_COLORS[domain] }} />
                        <span className="w-28 shrink-0 text-[11px] text-[#202124]">{domain}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#e8eaed]">
                          <div className="h-full rounded-full bg-[#4285F4]" style={{ width: `${(v / 5) * 100}%` }} />
                        </div>
                        <span className="w-8 text-right font-mono text-[11px] font-semibold text-[#5f6368]">{v}/5</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-[#e8eaed] p-4">
                <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[#5f6368]">Big Five (calibrated from assessment)</div>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { key: 'personality_openness',          short: 'O', name: 'Openness' },
                    { key: 'personality_conscientiousness', short: 'C', name: 'Conscient.' },
                    { key: 'personality_extraversion',      short: 'E', name: 'Extravers.' },
                    { key: 'personality_agreeableness',     short: 'A', name: 'Agreeable.' },
                    { key: 'personality_neuroticism',       short: 'N', name: 'Neuroticism' },
                  ].map(({ key, short, name }) => (
                    <div key={key} className="rounded-lg bg-[#f8f9fa] p-2 text-center">
                      <div className="text-[10px] text-[#9aa0a6]">{name}</div>
                      <div className="font-mono text-xl font-semibold text-[#202124]">{bigFive[key] ?? 3}</div>
                      <div className="text-[10px] font-bold text-[#5f6368]">{short}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-[#ceead6] bg-[#e6f4ea] p-3 text-[12px] text-[#137333]">
                <strong>{profile.name}</strong> will be added to the live talent pool immediately. The domain affinity profile above
                replaces the MF model output for this employee — full recommender coverage from day one.
              </div>
            </div>
          );
        })()}

        {error && (
          <div className="mt-4 rounded-lg border border-[#f6c4c0] bg-[#fce8e6] px-3 py-2 text-[12px] text-[#c5221f]">{error}</div>
        )}
      </div>

      {/* Nav buttons */}
      <div className="flex items-center justify-between">
        <button onClick={step === 0 ? onCancel : back}
          className="flex items-center gap-1.5 rounded-full border border-[#dadce0] px-5 py-2.5 text-sm font-medium text-[#5f6368] transition hover:bg-[#f1f3f4]">
          <ChevronLeft className="h-4 w-4" />{step === 0 ? 'Cancel' : 'Back'}
        </button>
        {step < STEPS.length - 1 ? (
          <button onClick={next}
            className="flex items-center gap-1.5 rounded-full bg-[#1a73e8] px-6 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#1b66c9]">
            Next <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button onClick={handleSubmit}
            className="flex items-center gap-1.5 rounded-full bg-[#34A853] px-6 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#2d9147]">
            <CheckCircle2 className="h-4 w-4" /> Add to talent pool
          </button>
        )}
      </div>
    </div>
  );
}
