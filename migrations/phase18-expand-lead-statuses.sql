-- Migration: expand lead status pipeline to include booked, no-show, callback, etc.
-- Safe to re-run.

alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check
  check (status in ('entered', 'called', 'no_answer', 'sms_sent', 'email_sent', 'follow_up', 'callback_requested', 'booked', 'no_show', 'converted', 'not_interested', 'not_qualified', 'wrong_number', 'winner', 'runner_up', 'runner_up_2', 'contact_later', 'disqualified'));
