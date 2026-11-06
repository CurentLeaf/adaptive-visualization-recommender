-- Cedar Watch pilot response storage. The study protocol is currently a draft;
-- keep these tables unavailable to anonymous/authenticated clients until a
-- reviewed collection path and access policy are configured.

create table public.cedar_watch_pilot_sessions (
  session_id text primary key check (length(session_id) between 1 and 80),
  participant_id text not null check (length(participant_id) between 1 and 80),
  response_schema_version integer not null check (response_schema_version = 1),
  protocol_version text not null check (length(protocol_version) between 1 and 80),
  ui_version text check (ui_version is null or length(ui_version) <= 80),
  consent_accepted boolean not null default true check (consent_accepted),
  source_commit text not null check (length(source_commit) <= 80),
  stimulus_seed integer not null,
  stimulus_version text not null check (length(stimulus_version) between 1 and 80),
  counterbalance_group smallint not null check (counterbalance_group between 0 and 3),
  assigned_order jsonb not null
    check (jsonb_typeof(assigned_order) = 'array' and jsonb_array_length(assigned_order) = 10),
  status text not null check (status in ('in_progress', 'complete')),
  evidence_clarity smallint check (evidence_clarity between 1 and 5),
  condition_preference text check (condition_preference in ('baseline', 'recommended', 'no-preference')),
  easier_condition text check (easier_condition in ('baseline', 'recommended', 'no-difference')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cedar_watch_pilot_sessions_complete_survey check (
    status <> 'complete' or (
      evidence_clarity is not null and
      condition_preference is not null and
      easier_condition is not null
    )
  )
);

create index cedar_watch_pilot_sessions_participant_id_idx
  on public.cedar_watch_pilot_sessions (participant_id);
create index cedar_watch_pilot_sessions_status_idx
  on public.cedar_watch_pilot_sessions (status);

create table public.cedar_watch_pilot_trials (
  session_id text not null references public.cedar_watch_pilot_sessions(session_id) on delete cascade,
  trial_id text not null check (length(trial_id) between 1 and 120),
  trial_index smallint not null check (trial_index between 0 and 9),
  scenario_family text not null check (scenario_family in ('corroboration', 'conflict', 'uncertain', 'quality', 'anomaly')),
  task_variant text not null check (task_variant in ('A', 'B')),
  condition text not null check (condition in ('baseline', 'recommended')),
  recommended_visualization text check (recommended_visualization is null or length(recommended_visualization) <= 120),
  selected_visualization text not null check (length(selected_visualization) between 1 and 120),
  selected_reports text[] not null default '{}',
  answer_kind text not null check (answer_kind in ('choice', 'unknown')),
  answer_id text check (answer_id is null or length(answer_id) <= 120),
  confidence smallint not null check (confidence between 1 and 5),
  perceived_difficulty smallint not null check (perceived_difficulty between 1 and 5),
  active_trial_time_ms bigint not null check (active_trial_time_ms >= 0),
  visibility_interruptions integer not null check (visibility_interruptions >= 0),
  created_at timestamptz not null default now(),
  primary key (session_id, trial_id),
  unique (session_id, trial_index),
  constraint cedar_watch_pilot_trials_answer_shape check (
    (answer_kind = 'unknown' and answer_id is null) or
    (answer_kind = 'choice' and answer_id is not null)
  )
);

create index cedar_watch_pilot_trials_scenario_condition_idx
  on public.cedar_watch_pilot_trials (scenario_family, condition);

create table public.cedar_watch_pilot_trial_interactions (
  session_id text not null,
  trial_id text not null,
  interaction_index integer not null check (interaction_index >= 0),
  interaction_type text not null check (interaction_type in ('report_select', 'visualization_select')),
  value text not null check (length(value) <= 120),
  elapsed_ms bigint not null check (elapsed_ms >= 0),
  primary key (session_id, trial_id, interaction_index),
  foreign key (session_id, trial_id)
    references public.cedar_watch_pilot_trials(session_id, trial_id) on delete cascade
);

-- No participant facing access is enabled by this schema migration.
alter table public.cedar_watch_pilot_sessions enable row level security;
alter table public.cedar_watch_pilot_trials enable row level security;
alter table public.cedar_watch_pilot_trial_interactions enable row level security;

revoke all on public.cedar_watch_pilot_sessions,
  public.cedar_watch_pilot_trials,
  public.cedar_watch_pilot_trial_interactions from anon, authenticated;
grant all on public.cedar_watch_pilot_sessions,
  public.cedar_watch_pilot_trials,
  public.cedar_watch_pilot_trial_interactions to service_role;

comment on table public.cedar_watch_pilot_sessions is
  'Consent-accepted Cedar Watch study sessions; excludes names, contact details, and device metadata.';
comment on table public.cedar_watch_pilot_trials is
  'Submitted trial responses only; answer keys and correctness are intentionally not stored.';
comment on table public.cedar_watch_pilot_trial_interactions is
  'Ordered report and visualization selections submitted with each trial.';
