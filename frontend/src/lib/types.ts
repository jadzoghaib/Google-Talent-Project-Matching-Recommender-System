export interface Employee {
  employee_id: string;
  name: string;
  level: string;
  role_category: string;
  years_experience: number;
  primary_domain: string | null;
  skills: Array<{ skill: string; proficiency: number }>;
  tech_tags: string[];
  personality_openness: number;
  personality_conscientiousness: number;
  personality_extraversion: number;
  personality_agreeableness: number;
  personality_neuroticism: number;
  education: { degree: string; field: string; university: string };
  previous_companies: string[];
  past_projects_count: number;
  avg_past_performance: number;
  primary_location: string;
  timezone_offset: number;
  can_work_across_timezones: boolean;
  current_staffed: boolean;
  available_from: string;
  diversity_group: string;
}

export interface Project {
  project_id: string;
  title: string;
  description: string;
  domain: string;
  priority: number;
  required_team_size_min: number;
  required_team_size_max: number;
  required_team_size_target: number;
  required_roles: Array<{ role: string; min_level: string; count: number }>;
  required_skills: Array<{ skill: string; min_proficiency: number; weight: number }>;
  tech_requirements: string[];
  duration_weeks: number;
  target_start_date: string;
  status: string;
  current_staffing_count?: number;   // size of the active project's current team
  current_staffed_ids?: string[];    // employee_ids currently on an active project
}

export interface Assignment {
  employee_id: string;
  project_id: string;
  pm_review: number;
  peer_collaboration_avg: number;
  delivery_score: number;
  true_effectiveness?: number; // stored ground truth, used for honest evaluation
}

export interface MatchScore {
  employee_id: string;
  project_id: string;
  score: number;
  breakdown: {
    skill: number;
    history: number;
    personality: number;
    level: number;
    novelty?: number;
  };
  segment: 'exploration' | 'exploitation' | 'balanced';
  usedMF: boolean;       // true when MF model was used; false means historical-avg fallback
  mfRawPred?: number;    // raw MF prediction on 1–5 scale (only set when usedMF is true)
}

export interface TeamAssignment {
  project_id: string;
  employees: string[]; // employee_ids
  teamScore: number;
  cohesion: number;
  individualScores: Record<string, number>;
}

export type UserSegment = 'exploration' | 'exploitation' | 'balanced';

// A request to add extra people to an already-active project (gap-fill hiring).
// At recommender time each open seat becomes a single-/few-slot pseudo-project
// so the same portfolio optimizer staffs it from the free talent pool.
export interface OpenSeat {
  id: string;
  projectId: string;     // the active project this seat belongs to
  projectTitle: string;
  domain: string;
  role: string;
  minLevel: string;
  skills: string[];      // emphasis skills (proficiency defaulted at staffing time)
  seats: number;         // how many extra people are needed
}