/*
 * CRF Comps — Supabase client configuration
 *
 * Replace the placeholders below with your own Supabase project URL and
 * anon/public key after creating the project (see SETUP.md).
 */

const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

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
