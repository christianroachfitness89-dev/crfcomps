-- Create the temporary SMS queue table used by the Apple Shortcuts / Mac script integration.
-- Run this in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.sms_queues (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  items JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS sms_queues_expires_idx ON public.sms_queues(expires_at);
CREATE INDEX IF NOT EXISTS sms_queues_user_id_idx ON public.sms_queues(user_id);

ALTER TABLE public.sms_queues ENABLE ROW LEVEL SECURITY;
