-- Migration: add Flawless Feedback strategy support.
-- Safe to re-run.

-- Expand type enum to include flawless_feedback.
alter table public.marketing_strategies drop constraint if exists marketing_strategies_type_check;
alter table public.marketing_strategies add constraint marketing_strategies_type_check
  check (type in ('giveaway', 'lead_magnet', 'challenge', 'webinar', 'funnel', 'flawless_feedback', 'other'));

-- Add strategy-specific columns for Flawless Feedback.
alter table public.marketing_strategies
  add column if not exists voucher_value numeric not null default 100,
  add column if not exists booking_url text,
  add column if not exists survey_questions jsonb default '[]'::jsonb,
  add column if not exists closing_script text;

-- Sample seed: a default Flawless Feedback strategy.
insert into public.marketing_strategies (
  id, name, type, status, description,
  voucher_value, booking_url, survey_questions, closing_script,
  form_headline, form_subheadline
)
values (
  '00000000-0000-0000-0000-000000000002',
  'Flawless Feedback',
  'flawless_feedback',
  'draft',
  'Gym-floor feedback survey that positions the trainer as representing the gym, captures member insights, and books paid consultations via a $100 voucher.',
  100,
  null,
  '[
    {"section":"gym","question":"How long have you been a member?"},
    {"section":"gym","question":"What would you like to see improved at the club?"},
    {"section":"gym","question":"Are you happy with the service from gym staff?"},
    {"section":"fitness","question":"How often do you come to the gym?"},
    {"section":"fitness","question":"Are you 100% satisfied with your gym journey and results?"},
    {"section":"fitness","question":"If we could help you achieve one goal with your health and fitness, what would it be?"}
  ]'::jsonb,
  'For your voucher, let''s book you in to address your goals. The consultation is fully paid for thanks to your feedback.',
  'Help us improve your gym',
  'Quick feedback survey — claim your coaching voucher'
)
on conflict (id) do update set
  name = excluded.name,
  type = excluded.type,
  status = excluded.status,
  description = excluded.description,
  voucher_value = excluded.voucher_value,
  booking_url = excluded.booking_url,
  survey_questions = excluded.survey_questions,
  closing_script = excluded.closing_script,
  form_headline = excluded.form_headline,
  form_subheadline = excluded.form_subheadline,
  updated_at = now();
