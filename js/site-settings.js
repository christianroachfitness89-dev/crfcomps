/*
 * CRF Comps — shared site settings + active competition loader
 */

(function () {
  const client = window.sb;

  async function loadSiteSettings() {
    try {
      const { data, error } = await client
        .from('site_settings')
        .select('*')
        .single();
      if (error) throw error;
      return data || null;
    } catch (err) {
      console.error('loadSiteSettings error:', err);
      return null;
    }
  }

  async function loadActiveCompetition() {
    try {
      const { data, error } = await client
        .from('competitions')
        .select('*')
        .eq('status', 'active')
        .order('starts_at', { ascending: false })
        .limit(1)
        .single();
      if (error) throw error;
      return data || null;
    } catch (err) {
      console.error('loadActiveCompetition error:', err);
      return null;
    }
  }

  async function loadAllCompetitions() {
    try {
      const { data, error } = await client
        .from('competitions')
        .select('*')
        .order('starts_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('loadAllCompetitions error:', err);
      return [];
    }
  }

  async function loadStrategies() {
    try {
      const { data, error } = await client
        .from('marketing_strategies')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('loadStrategies error:', err);
      return [];
    }
  }

  async function loadActiveStrategies() {
    try {
      const { data, error } = await client
        .from('marketing_strategies')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('loadActiveStrategies error:', err);
      return [];
    }
  }

  function formatCurrency(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) return '$0';
    return '$' + Number(amount).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function fmtDate(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
    });
  }

  window.siteSettings = {
    loadSiteSettings,
    loadActiveCompetition,
    loadAllCompetitions,
    loadStrategies,
    loadActiveStrategies,
    formatCurrency,
    fmtDate
  };

  window.formatCurrency = formatCurrency;
  window.fmtDate = fmtDate;
})();
