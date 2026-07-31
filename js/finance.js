/*
 * CRF Comps — Finance page logic
 *
 * Boots the combined Stripe + Weflex revenue view.
 */

(function () {
  const ops = window.operations;

  async function refresh() {
    await ops.loadData();
    if (window.integrations && window.integrations.init) {
      await window.integrations.init('finance');
    }
    if (window.weflexPayments && window.weflexPayments.refresh) {
      await window.weflexPayments.refresh();
    }
  }

  async function init() {
    await refresh();
  }

  window.finance = {
    init,
    refresh
  };
})();
