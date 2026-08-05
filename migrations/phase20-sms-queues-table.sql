-- Create the temporary SMS queue table used by the Apple Shortcuts integration.
create table if not exists public.sms_queues (
  id text primary key,
  user_id uuid references auth.users on delete cascade not null,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index if not exists sms_queues_expires_idx on public.sms_queues(expires_at);
create index if not exists sms_queues_user_id_idx on public.sms_queues(user_id);

-- Enable RLS so the API can use the service role to manage queues.
alter table public.sms_queues enable row level security;
