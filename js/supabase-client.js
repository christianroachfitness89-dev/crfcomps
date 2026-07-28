/*
 * CRF Comps — Supabase client configuration
 *
 * Replace the placeholders below with your own Supabase project URL and
 * anon/public key after creating the project (see SETUP.md).
 */

const SUPABASE_URL = 'https://oinsszijbudtcxnedenv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pbnNzemlqYnVkdGN4bmVkZW52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4NDc3MDMsImV4cCI6MjEwMDQyMzcwM30.68z0Arx9DTtAXeK-84DZscAejgEa96IDDT4CvfA4hE8';

let _client = null;

function getSupabaseClient() {
  if (_client) return _client;

  if (typeof supabase === 'undefined' || !supabase.createClient) {
    throw new Error(
      'Supabase client library not loaded. Make sure the CDN script is included before supabase-client.js.'
    );
  }

  if (SUPABASE_URL.includes('YOUR_PROJECT_ID') || SUPABASE_ANON_KEY.includes('YOUR_SUPABASE_ANON_KEY')) {
    console.warn('Supabase credentials are still placeholders - update js/supabase-client.js before deploying.');
  }

  _client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  });

  return _client;
}

window.sb = getSupabaseClient();
