/*
 * CRF Comps — shared authentication helpers (admin only)
 */

(function () {
  const client = window.sb;

  async function signIn(email, password) {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }

  async function getSession() {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async function getUser() {
    const session = await getSession();
    return session?.user || null;
  }

  async function getProfile(userId) {
    if (!userId) {
      const user = await getUser();
      if (!user) return null;
      userId = user.id;
    }
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) {
      console.error('getProfile error:', error);
      return null;
    }
    return data;
  }

  async function requireAuth(redirectTo) {
    const session = await getSession();
    if (!session) {
      const target = redirectTo || window.location.pathname;
      window.location.href = 'login.html?redirect=' + encodeURIComponent(target);
      return null;
    }
    return session.user;
  }

  async function requireAdmin() {
    const user = await requireAuth('admin.html');
    if (!user) return null;
    const profile = await getProfile(user.id);
    if (!profile || !profile.is_admin) {
      window.location.href = 'index.html';
      return null;
    }
    return { user, profile };
  }

  window.auth = {
    signIn,
    signOut,
    getSession,
    getUser,
    getProfile,
    requireAuth,
    requireAdmin
  };
})();
