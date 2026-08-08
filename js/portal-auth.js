/**
 * CRF Comps — shared client portal authentication helpers
 *
 * - requireClientSession: redirects to portal-login.html if not signed in.
 * - getClientProfile: fetches /api/portal/profile for the current session.
 * - signOut: signs the client out and redirects to login.
 */

(function () {
  const sb = window.sb;

  async function getSession() {
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async function requireClientSession(redirectTo) {
    const session = await getSession();
    if (!session) {
      const target = redirectTo || window.location.pathname;
      window.location.href = 'portal-login.html?redirect=' + encodeURIComponent(target);
      return null;
    }

    // Verify the session is linked to a client record.
    try {
      const res = await fetch('/api/portal/profile', {
        headers: { 'Authorization': 'Bearer ' + session.access_token }
      });
      if (!res.ok) {
        await sb.auth.signOut();
        window.location.href = 'portal-login.html?reason=not_linked';
        return null;
      }
      const profile = await res.json();
      return { session: session, profile: profile };
    } catch (err) {
      console.error('requireClientSession error:', err);
      await sb.auth.signOut();
      window.location.href = 'portal-login.html?reason=error';
      return null;
    }
  }

  async function getClientProfile() {
    const session = await getSession();
    if (!session) return null;
    const res = await fetch('/api/portal/profile', {
      headers: { 'Authorization': 'Bearer ' + session.access_token }
    });
    if (!res.ok) return null;
    return res.json();
  }

  async function signOut() {
    await sb.auth.signOut();
    window.location.href = 'portal-login.html';
  }

  window.portalAuth = {
    getSession,
    requireClientSession,
    getClientProfile,
    signOut
  };

  // Also expose the most common helpers as globals so templates can call them directly.
  window.requireClientSession = requireClientSession;
  window.getClientProfile = getClientProfile;
  window.signOut = signOut;
})();
