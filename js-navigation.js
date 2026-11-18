/* =========================================================
   navigation.js — sidebar structure (single source of truth
   for menu order + breadcrumbs), global search, top bar.
   ========================================================= */
(function () {
  "use strict";
  const U = window.U;
  const Nav = {};

  /* Menu follows the "Key System Modules" of the Lube Oil Cell process flow (Phase-1). */
  Nav.groups = [
    { id: "home", label: "Home", items: [["dashboard", "Dashboard"]] },
    { id: "master", label: "Master Data", items: [["equipment", "Equipment"], ["oil-master", "Oil Types"], ["grease-master", "Grease Types"], ["department-master", "Departments"], ["area-master", "Areas"], ["location-master", "Store Locations"]] },
    { id: "inv", label: "Inventory Management", items: [["stock-receipt", "Stock In"], ["inventory", "Stock Balance"], ["stock-ledger", "Stock Movements"], ["stock-adjustment", "Adjustments"], ["low-stock", "Reorder Alerts"]] },
    { id: "issue", label: "Issue Management", items: [["oil-requests", "Raise Request"], ["stock-issue", "Issue Oil"], ["consumption", "Consumption Booking"]] },
    { id: "repl", label: "Oil Replacement & Top-up", items: [["replacement-history", "Replacement"], ["topup-history", "Top-up"], ["stock-return", "Balance Handling"]] },
    { id: "scrap", label: "Scrap Oil Management", items: [["scrap-generation", "Scrap Entry"], ["scrap-transfer", "Scrap Storage"], ["scrap-disposal", "Disposal"], ["scrap-reconciliation", "Scrap Records"]] },
    { id: "reports", label: "Reports & Analytics", items: [["reports", "MIS Reports"], ["mis-dashboard", "MIS Dashboard"], ["inventory-dashboard", "Inventory Dashboard"], ["consumption-history", "Consumption History"], ["stock-reports", "Stock Reports"], ["consumption-reports", "Consumption Reports"]] },
    { id: "admin", label: "System Administration", items: [["users", "User Roles & Permissions"], ["audit-trail", "Audit Trail"], ["notifications", "Notifications"], ["settings", "Settings"]] }
  ];
  const index = {};
  Nav.groups.forEach((g) => g.items.forEach(([id, label]) => (index[id] = { id, label, group: g })));
  Nav.labelOf = (id) => (index[id] ? index[id].label : id);
  Nav.crumbsFor = (id) => (index[id] ? (index[id].group.id === "home" ? [{ id, label: index[id].label }] : [{ label: index[id].group.label }, { id, label: index[id].label }]) : [{ id, label: (window.Router.page(id) || {}).title || id }]);
  const collapsed = () => window.DemoStore.get("navCollapsed", {});

  Nav.render = () => {
    const c = collapsed();
    document.getElementById("nav").innerHTML = Nav.groups.map((g) => `
      <div class="nav-group ${c[g.id] ? "collapsed" : ""}" data-group="${g.id}">
        <button class="nav-group-btn" data-toggle-group="${g.id}" aria-expanded="${!c[g.id]}"><span>${U.esc(g.label)}</span>
          <span style="display:flex;gap:6px;align-items:center">${g.tag ? `<span class="nav-group-tag">${g.tag}</span>` : ""}<span class="chev">${window.UI.icon("chev").replace("<svg", '<svg width="14" height="14"')}</span></span></button>
        <ul class="nav-items">${g.items.map(([id, label, opt]) => `<li><a class="nav-link" href="#/${id}" data-page="${id}">${U.esc(label)}${opt ? '<span class="opt">Optional</span>' : ""}</a></li>`).join("")}</ul>
      </div>`).join("");
  };
  Nav.setActive = (id) => {
    document.querySelectorAll(".nav-link").forEach((a) => a.classList.toggle("active", a.dataset.page === id));
    const a = document.querySelector(`.nav-link[data-page="${id}"]`);
    if (a) { const g = a.closest(".nav-group"); if (g.classList.contains("collapsed")) { g.classList.remove("collapsed"); } }
    document.getElementById("app").classList.remove("sidebar-open");
  };
  Nav.filter = (q) => {
    q = q.trim().toLowerCase();
    document.querySelectorAll(".nav-group").forEach((g) => {
      let any = false;
      g.querySelectorAll(".nav-link").forEach((a) => { const show = !q || a.textContent.toLowerCase().includes(q); a.parentElement.style.display = show ? "" : "none"; any = any || show; });
      g.style.display = any ? "" : "none";
      if (q) g.classList.remove("collapsed");
    });
  };

  /* ---------- Global search: pages, equipment, grades, documents ---------- */
  Nav.search = (q) => {
    const box = document.getElementById("searchResults");
    q = q.trim().toLowerCase();
    if (q.length < 2) { box.hidden = true; return; }
    const pagesHit = Object.values(index).filter((p) => p.label.toLowerCase().includes(q)).slice(0, 6);
    const eqHit = window.State.db.equipment.filter((e) => (e.name + " " + e.id).toLowerCase().includes(q)).slice(0, 8);
    const grHit = window.State.db.grades.filter((g) => g.name.toLowerCase().includes(q)).slice(0, 5);
    const docHit = window.State.db.txns.filter((t) => (t.no || "").toLowerCase().includes(q)).slice(0, 5);
    const sec = (title, arr, fn) => (arr.length ? `<div class="sr-group">${title}</div>${arr.map(fn).join("")}` : "");
    box.innerHTML = sec("Pages", pagesHit, (p) => `<button data-go="${p.id}">${U.esc(p.label)}<small>${U.esc(p.group.label)}</small></button>`)
      + sec("Equipment", eqHit, (e) => `<button data-eq="${e.id}">${U.esc(e.name)}<small>${U.esc(e.id)} · ${U.esc(e.area || "")}${e.subArea ? " · " + U.esc(e.subArea) : ""}</small></button>`)
      + sec("Oil / grease grades", grHit, (g) => `<button data-go="${g.type === "Grease" ? "grease-master" : "oil-master"}">${U.esc(g.name)}<small>${g.type}</small></button>`)
      + sec("Documents", docHit, (t) => `<button data-go="stock-ledger" data-q="${U.esc(t.no)}">${U.esc(t.no)}<small>${t.type} · ${U.fmtDate(t.date)}</small></button>`)
      || `<div class="empty small">No results for “${U.esc(q)}”</div>`;
    box.hidden = false;
  };

  Nav.init = () => {
    Nav.render();
    document.getElementById("sidebarToggle").innerHTML = window.UI.icon("menu");
    document.getElementById("notifBtn").insertAdjacentHTML("afterbegin", window.UI.icon("bell"));
    const app = document.getElementById("app");
    document.getElementById("nav").addEventListener("click", (e) => {
      const b = e.target.closest("[data-toggle-group]"); if (!b) return;
      const g = b.closest(".nav-group"); g.classList.toggle("collapsed");
      const c = collapsed(); c[b.dataset.toggleGroup] = g.classList.contains("collapsed"); window.DemoStore.set("navCollapsed", c);
      b.setAttribute("aria-expanded", !g.classList.contains("collapsed"));
    });
    document.getElementById("navFilter").addEventListener("input", (e) => Nav.filter(e.target.value));
    document.getElementById("sidebarToggle").addEventListener("click", () => {
      if (window.matchMedia("(max-width: 1024px)").matches) app.classList.toggle("sidebar-open");
      else app.classList.toggle("sidebar-collapsed");
    });
    document.getElementById("sidebarScrim").addEventListener("click", () => app.classList.remove("sidebar-open"));

    const gs = document.getElementById("globalSearch"), box = document.getElementById("searchResults");
    gs.addEventListener("input", U.debounce((e) => Nav.search(e.target.value), 150));
    gs.addEventListener("keydown", (e) => {
      const btns = Array.from(box.querySelectorAll("button")); if (!btns.length) return;
      let i = btns.findIndex((b) => b.classList.contains("focus"));
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); btns.forEach((b) => b.classList.remove("focus")); i = e.key === "ArrowDown" ? Math.min(btns.length - 1, i + 1) : Math.max(0, i - 1); btns[i].classList.add("focus"); }
      else if (e.key === "Enter") { e.preventDefault(); (btns[i] || btns[0]).click(); }
      else if (e.key === "Escape") box.hidden = true;
    });
    box.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      box.hidden = true; gs.value = "";
      if (b.dataset.eq) window.Router.go("equipment", { view: b.dataset.eq });
      else { if (b.dataset.q) window.UI.presetTable("ledger", { q: b.dataset.q }); window.Router.go(b.dataset.go); }
    });
    document.addEventListener("click", (e) => { if (!e.target.closest(".global-search")) box.hidden = true; });

    // Profile / role switcher
    const pBtn = document.getElementById("profileBtn"), menu = document.getElementById("profileMenu"), sel = document.getElementById("roleSelect");
    sel.innerHTML = window.State.cfg.roles.map((r) => `<option value="${r.id}">${U.esc(r.name)}</option>`).join("");
    pBtn.addEventListener("click", () => { menu.hidden = !menu.hidden; pBtn.setAttribute("aria-expanded", !menu.hidden); });
    document.addEventListener("click", (e) => { if (!e.target.closest(".profile")) menu.hidden = true; });
    sel.addEventListener("change", () => { window.State.setRole(sel.value); Nav.renderProfile(); window.Notify.toast("Role switched", `Now acting as ${window.State.role().name} (illustrative permissions).`); });
    Nav.renderProfile();
  };
  Nav.renderProfile = () => {
    const u = window.State.user(), r = window.State.role();
    document.getElementById("profileName").textContent = u.name;
    document.getElementById("profileRole").textContent = r.name;
    document.getElementById("avatar").textContent = u.name.split(" ").map((x) => x[0]).join("").slice(-2).toUpperCase();
    document.getElementById("roleSelect").value = r.id;
  };

  window.Nav = Nav;
})();
