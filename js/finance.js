/*
 * CRF Comps — Finance page logic
 *
 * Finance is now read-only from Stripe. This file just bootstraps the page
 * and refreshes the Stripe widget rendered by js/integrations.js.
 */

(function () {
  const ops = window.operations;

  async function refresh() {
    await ops.loadData();
    if (window.integrations && window.integrations.init) {
      await window.integrations.init('finance');
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
