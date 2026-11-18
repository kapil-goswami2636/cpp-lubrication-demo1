/* =========================================================
   app.js — bootstrap + global (delegated) event handling.
   Scripts are loaded with `defer`, so they execute in order
   after the DOM is parsed; this file runs last.
   ========================================================= */
(function () {
  "use strict";
  const U = window.U;

  function fatal(msg) {
    document.getElementById("loadingVeil").innerHTML = `<div class="callout danger" style="max-width:560px"><strong>Demo could not start.</strong> ${U.esc(msg)}</div>`;
  }

  /** Global actions triggered by [data-action] anywhere in the document. */
  const ACTIONS = {
    "notif-close": () => window.Notify.togglePanel(false),
    "notif-read-all": () => { window.State.markNotifications(); window.Notify.renderPanel(); },
    "reset-demo": async () => {
      const ok = await window.UI.confirm({ title: "Reset data?", text: "Everything entered in this browser (receipts, requests, issues, consumption, returns, scrap, settings) will be removed and the starting figures restored.", okLabel: "Reset data", danger: true });
      if (!ok) return;
      window.State.reset(); window.Nav.renderProfile();
      window.Notify.success("Data reset", "Starting figures restored.");
      window.Router.go("dashboard");
    }
  };

  function onGlobalClick(e) {
    const nav = e.target.closest("[data-nav]");
    if (nav) {
      e.preventDefault();
      let params = {};
      if (nav.dataset.params) { try { params = JSON.parse(nav.dataset.params); } catch (err) { /* ignore */ } }
      document.getElementById("profileMenu").hidden = true;
      window.Notify.togglePanel(false);
      window.UI.closeAllModals();
      window.Router.go(nav.dataset.nav, params);
      return;
    }
    const act = e.target.closest("[data-action]");
    if (act && ACTIONS[act.dataset.action]) { e.preventDefault(); ACTIONS[act.dataset.action](act); return; }
    const ni = e.target.closest(".notif-item");
    if (ni) {
      window.State.markNotifications([ni.dataset.notif]);
      window.Notify.togglePanel(false);
      if (ni.dataset.link) window.Router.go(ni.dataset.link);
    }
  }

  function init() {
    if (!window.CPP_SOURCE || !window.CPP_SOURCE.inventory || !window.CPP_CONFIG) return fatal("Source data files in /data did not load. Serve the folder over HTTP or open index.html from the project root.");
    try { window.State.init(); }
    catch (err) { console.error(err); return fatal("Demo data could not be initialised: " + err.message); }

    window.Nav.init();
    document.addEventListener("click", onGlobalClick);
    document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches(".kpi[data-nav]")) e.target.click(); });
    document.getElementById("notifBtn").addEventListener("click", (e) => { e.stopPropagation(); window.Notify.togglePanel(); });
    document.addEventListener("click", (e) => { if (!e.target.closest("#notifPanel, #notifBtn")) window.Notify.togglePanel(false); });

    // Any data change refreshes the current page + notification badge
    window.State.on(() => { window.Notify.renderPanel(); window.Router.refresh(); });

    window.Notify.renderPanel();
    window.Router.render();
    document.getElementById("loadingVeil").classList.add("done");

    if (window.State.loadedFromStorage) window.Notify.toast("Welcome back", "Your earlier entries have been loaded.");
    if (!window.DemoStore.available()) window.Notify.warn("Browser storage unavailable", "The demo works, but entries will not persist after refresh.");
    window.addEventListener("load", () => { if (!window.Chart) console.info("Chart.js not loaded — charts fall back to tables."); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
