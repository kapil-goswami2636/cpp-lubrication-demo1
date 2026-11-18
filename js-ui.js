/* =====================================================================
   ui.js — reusable rendering components (DOM only; no business rules)
     UI.table      searchable / filterable / sortable / paginated table
     UI.modal      generic modal;   UI.formModal  validated form in a modal
     UI.confirm    promise-based confirmation
     UI.kpis, UI.card, UI.badge, UI.flow, UI.tabs, UI.chart, UI.barList
   Event handling uses delegation on each component's root element.
   ===================================================================== */
(function () {
  "use strict";
  const U = window.U;
  const UI = {};
  UI.tableState = {};
  const PENDING = "Pending Client Confirmation";

  UI.$ = (sel, root = document) => root.querySelector(sel);
  UI.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  UI.html = (str) => { const t = document.createElement("template"); t.innerHTML = str.trim(); return t.content.firstElementChild; };

  /* ---------------- small pieces ---------------- */
  const ICONS = {
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>', bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    chev: '<path d="m6 9 6 6 6-6"/>'
  };
  UI.icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ""}</svg>`;
  UI.badge = (text, cls = "") => `<span class="badge ${cls}">${U.esc(text)}</span>`;
  UI.pending = (t = PENDING) => `<span class="pending-text">${U.esc(t)}</span>`;
  UI.val = (v, unit) => (v === null || v === undefined || v === "" ? UI.pending() : U.esc(v) + (unit ? " " + U.esc(unit) : ""));
  UI.illus = () => UI.badge("ILLUSTRATIVE DEMO DATA", "illus");
  UI.src = (t) => `<span class="tag-src" title="Source reference">${U.esc(t)}</span>`;

  const STATUS_CLS = {
    CONFIRMED: "success", ISSUED: "success", APPROVED: "success", COMPLETED: "success", Completed: "success", Active: "success", ANALYSED: "success", Resolved: "success", RESOLVED: "success", Confirmed: "success", Acknowledged: "info", ACKNOWLEDGED: "info", Healthy: "success",
    SUBMITTED: "info", SENT: "info", COLLECTED: "info", "Received in storage": "info", Recorded: "info", Scheduled: "success",
    DRAFT: "", Pending: "warning", PENDING: "warning", PENDING_APPROVAL: "warning", PENDING_EXCEPTION: "warning", "In Progress": "info", UPCOMING: "info", DUE: "warning",
    CANCELLED: "", REJECTED: "danger", OVERDUE: "danger", Inactive: "", "Not Applicable": ""
  };
  UI.status = (s) => UI.badge(String(s || "—").replace(/_/g, " "), STATUS_CLS[s] !== undefined ? STATUS_CLS[s] : "");

  UI.kpis = (items) => `<div class="kpis">${items.map((k) => `
    <div class="kpi ${k.cls || ""} ${k.link ? "clickable" : ""}" ${k.link ? `data-nav="${k.link}" role="link" tabindex="0"` : ""}>
      <div class="kpi-label">${U.esc(k.label)}</div>
      <div class="kpi-value">${k.value}</div>
      ${k.sub ? `<div class="kpi-sub">${k.sub}</div>` : ""}
    </div>`).join("")}</div>`;

  UI.card = ({ title, sub, actions = "", body = "", flush = false, id = "" }) => `
    <section class="card" ${id ? `id="${id}"` : ""}>
      ${title ? `<div class="card-head"><div><h3>${title}</h3>${sub ? `<div class="small muted">${sub}</div>` : ""}</div><div class="btn-group">${actions}</div></div>` : ""}
      <div class="card-body ${flush ? "flush" : ""}">${body}</div>
    </section>`;

  UI.callout = (cls, html) => `<div class="callout ${cls}">${html}</div>`;

  /** Workflow diagram. steps: [{t, d, cls:'system'|'special'|'decision'|'output'|'end', link, active}] */
  UI.flow = (steps) => `<div class="flow">${steps.map((s, i) => `
    ${i ? '<span class="flow-arrow" aria-hidden="true">→</span>' : ""}
    <div class="flow-step ${s.cls || ""} ${s.active ? "active" : ""}">
      <div class="fs-no">${s.no !== undefined ? s.no : "STEP " + (i + 1)}</div><strong>${U.esc(s.t)}</strong>
      ${s.d ? `<div class="muted">${s.d}</div>` : ""}
      ${s.link ? `<button class="btn-link fs-link" data-nav="${s.link}">Open screen ›</button>` : ""}
    </div>`).join("")}</div>`;

  UI.barList = (items, unit = "", max) => {
    const m = max || Math.max(1, ...items.map((i) => i.value || 0));
    return `<div class="bar-list">${items.map((i) => `
      <div class="bar-row" title="${U.esc(i.label)}: ${U.fmt(i.value)} ${unit}">
        <span class="bar-label">${U.esc(i.label)}</span>
        <span class="bar-track"><span class="bar-fill ${i.cls || ""}" style="width:${Math.max(1, (100 * (i.value || 0)) / m)}%"></span></span>
        <span class="num">${i.display !== undefined ? i.display : U.fmt(i.value) + " " + unit}</span>
      </div>`).join("")}</div>`;
  };
  UI.meter = (pct) => { const c = pct === null ? "" : pct < 60 ? "danger" : pct < 85 ? "warning" : ""; return `<div class="meter"><span class="${c}" style="width:${pct || 0}%"></span></div>`; };

  /* ---------------- tabs ---------------- */
  UI.tabs = (host, tabs, key, initial) => {
    const st = UI.tableState["tabs:" + key] || initial || tabs[0].id;
    host.innerHTML = `<div class="tabs" role="tablist">${tabs.map((t) => `<button role="tab" data-tab="${t.id}" class="${t.id === st ? "active" : ""}">${U.esc(t.label)}</button>`).join("")}</div><div class="tab-body"></div>`;
    const body = host.querySelector(".tab-body");
    const show = (id) => {
      UI.tableState["tabs:" + key] = id;
      host.querySelectorAll(":scope > .tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === id));
      body.innerHTML = ""; (tabs.find((t) => t.id === id) || tabs[0]).render(body);
    };
    host.querySelector(".tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) show(b.dataset.tab); });
    show(tabs.some((t) => t.id === st) ? st : tabs[0].id);
  };

  /* ---------------- charts (Chart.js optional) ---------------- */
  UI.charts = [];
  UI.destroyCharts = () => { UI.charts.forEach((c) => { try { c.destroy(); } catch (e) { /* */ } }); UI.charts = []; };
  // Validated categorical order (dataviz reference palette) — assigned in fixed order, never cycled by rank.
  const PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
  UI.chart = (host, cfg) => {
    host.innerHTML = '<canvas aria-label="chart" role="img"></canvas>';
    if (!window.Chart) {
      // Graceful fallback: show the numbers as a list
      const ds = cfg.data.datasets;
      host.innerHTML = `<div class="chart-fallback"><em>Chart library unavailable — showing values.</em><table class="data compact"><thead><tr><th>Label</th>${ds.map((d) => `<th class="num">${U.esc(d.label || "")}</th>`).join("")}</tr></thead><tbody>${cfg.data.labels.map((l, i) => `<tr><td>${U.esc(l)}</td>${ds.map((d) => `<td class="num">${U.fmt(d.data[i])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      return null;
    }
    cfg.data.datasets.forEach((d, i) => {
      const c = d.color || PALETTE[i % PALETTE.length];
      if (cfg.type === "doughnut" || cfg.type === "pie") d.backgroundColor = d.backgroundColor || cfg.data.labels.map((_, j) => PALETTE[j % PALETTE.length]);
      else { d.backgroundColor = d.backgroundColor || (cfg.type === "line" ? c + "22" : c); d.borderColor = d.borderColor || c; }
      d.borderWidth = d.borderWidth ?? (cfg.type === "line" ? 2 : 0); d.pointRadius = d.pointRadius ?? 0; d.pointHoverRadius = 5; d.tension = 0.25; d.maxBarThickness = 28;
      if (cfg.type === "bar") { d.borderRadius = 4; d.borderSkipped = "start"; }
      if (cfg.type === "doughnut") { d.borderWidth = 2; d.borderColor = "#ffffff"; }
    });
    const chart = new window.Chart(host.querySelector("canvas"), {
      type: cfg.type, data: cfg.data,
      options: Object.assign({ responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: cfg.type === "line" ? "index" : "nearest", intersect: cfg.type !== "line" },
        plugins: { legend: { display: cfg.data.datasets.length > 1 || cfg.type === "doughnut", position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label ? c.dataset.label + ": " : ""}${U.fmt(c.parsed.y !== undefined ? c.parsed.y : c.parsed)}${cfg.unit ? " " + cfg.unit : ""}` } } },
        scales: cfg.type === "doughnut" ? {} : { x: { grid: { display: false }, ticks: { font: { size: 11 }, maxRotation: 50, autoSkip: true }, stacked: !!cfg.stacked },
          y: { beginAtZero: true, grid: { color: "#eef1f5" }, ticks: { font: { size: 11 }, callback: (v) => U.fmt(v, 0) }, stacked: !!cfg.stacked, title: cfg.yTitle ? { display: true, text: cfg.yTitle, font: { size: 11 } } : undefined } } }, cfg.options || {})
    });
    UI.charts.push(chart);
    return chart;
  };

  /* ---------------- data table ---------------- */
  /**
   * cfg: { id, columns:[{key,label,render,num,sortVal,csv,nosort}], rows:Array|fn,
   *        search:(row)=>string, filters:[{key,label,options:[]|fn,value:(row)=>val}],
   *        dateKey, dateLabel, pageSize, actions:(row)=>html, onAction:{act:(row,el)=>{}},
   *        toolbar:html, onTool:{tool:()=>{}}, exportName, rowClass, empty, footer:(rows)=>html, defaultSort }
   */
  UI.table = (host, cfg) => {
    const st = UI.tableState[cfg.id] = UI.tableState[cfg.id] || { q: "", f: {}, from: "", to: "", page: 1, size: cfg.pageSize || 10, sort: cfg.defaultSort || null };
    const opts = (f) => (typeof f.options === "function" ? f.options() : f.options);
    host.innerHTML = `
      <div class="table-toolbar">
        <input type="search" data-role="q" placeholder="${U.esc(cfg.searchPlaceholder || "Search…")}" value="${U.esc(st.q)}" aria-label="Search table">
        ${(cfg.filters || []).map((f) => `<label class="filter"><span>${U.esc(f.label)}</span><select data-filter="${f.key}"><option value="">All</option>
          ${opts(f).map((o) => { const v = typeof o === "object" ? o.value : o, l = typeof o === "object" ? o.label : o; return `<option value="${U.esc(v)}" ${String(st.f[f.key] || "") === String(v) ? "selected" : ""}>${U.esc(l)}</option>`; }).join("")}</select></label>`).join("")}
        ${cfg.dateKey ? `<label class="filter"><span>${U.esc(cfg.dateLabel || "Date")} from</span><input type="date" data-role="from" value="${st.from}"></label>
          <label class="filter"><span>to</span><input type="date" data-role="to" value="${st.to}"></label>` : ""}
        <span class="grow"></span>
        ${cfg.toolbar || ""}
        ${cfg.exportName ? `<div class="btn-group"><button class="btn btn-sm" data-export="csv" title="Export filtered rows to CSV">CSV</button><button class="btn btn-sm" data-export="xlsx" title="Export filtered rows to Excel">Excel</button><button class="btn btn-sm" data-export="pdf" title="Export filtered rows to PDF">PDF</button></div>` : ""}
        <button class="btn btn-sm btn-ghost" data-role="clear" title="Clear search and filters">Clear</button>
      </div>
      <div class="table-wrap" data-role="body"></div>
      <div class="table-foot" data-role="foot"></div>`;
    const body = host.querySelector('[data-role="body"]'), foot = host.querySelector('[data-role="foot"]');
    let current = [];

    const filtered = () => {
      let rows = typeof cfg.rows === "function" ? cfg.rows() : cfg.rows;
      const q = st.q.trim().toLowerCase();
      if (q) { const terms = q.split(/\s+/); rows = rows.filter((r) => { const s = (cfg.search ? cfg.search(r) : Object.values(r).join(" ")).toLowerCase(); return terms.every((t) => s.includes(t)); }); }
      (cfg.filters || []).forEach((f) => { const v = st.f[f.key]; if (v !== undefined && v !== "") rows = rows.filter((r) => String(f.value ? f.value(r) : r[f.key]) === String(v)); });
      if (cfg.dateKey && (st.from || st.to)) rows = rows.filter((r) => U.inRange((typeof cfg.dateKey === "function" ? cfg.dateKey(r) : r[cfg.dateKey]) || "", st.from, st.to));
      if (st.sort) {
        const col = cfg.columns.find((c) => c.key === st.sort.key);
        if (col) {
          const val = (r) => (col.sortVal ? col.sortVal(r) : r[col.key]);
          rows = rows.slice().sort((a, b) => { const x = val(a), y = val(b); const nx = typeof x === "number", ny = typeof y === "number";
            const c = nx && ny ? x - y : String(x ?? "").localeCompare(String(y ?? ""), undefined, { numeric: true }); return st.sort.dir === "desc" ? -c : c; });
        }
      }
      return rows;
    };
    const draw = () => {
      current = filtered();
      const pages = Math.max(1, Math.ceil(current.length / st.size));
      if (st.page > pages) st.page = pages;
      const slice = current.slice((st.page - 1) * st.size, st.page * st.size);
      if (!current.length) {
        body.innerHTML = `<div class="empty"><strong>${U.esc(cfg.emptyTitle || "No matching records")}</strong>${U.esc(cfg.empty || "Try clearing search or filters.")}</div>`;
      } else {
        body.innerHTML = `<table class="data"><thead><tr>${cfg.columns.map((c) => `<th class="${c.num ? "num" : ""} ${c.nosort ? "" : "sortable"}" ${c.nosort ? "" : `data-sort="${c.key}"`} scope="col">${U.esc(c.label)}${st.sort && st.sort.key === c.key ? `<span class="sort">${st.sort.dir === "asc" ? "▲" : "▼"}</span>` : ""}</th>`).join("")}${cfg.actions ? '<th class="num">Actions</th>' : ""}</tr></thead>
          <tbody>${slice.map((r, i) => `<tr class="${cfg.rowClass ? cfg.rowClass(r) || "" : ""}" data-row="${(st.page - 1) * st.size + i}">${cfg.columns.map((c) => `<td class="${c.num ? "num" : ""}">${c.render ? c.render(r) : U.esc(r[c.key] ?? "—")}</td>`).join("")}${cfg.actions ? `<td class="actions"><div class="row-actions">${cfg.actions(r)}</div></td>` : ""}</tr>`).join("")}</tbody>
          ${cfg.footer ? `<tfoot>${cfg.footer(current)}</tfoot>` : ""}</table>`;
      }
      const from = current.length ? (st.page - 1) * st.size + 1 : 0, to = Math.min(st.page * st.size, current.length);
      const pg = []; const win = 2;
      for (let p = 1; p <= pages; p++) if (p === 1 || p === pages || Math.abs(p - st.page) <= win) pg.push(p); else if (pg[pg.length - 1] !== "…") pg.push("…");
      foot.innerHTML = `<span>Showing ${U.fmt(from)}–${U.fmt(to)} of ${U.fmt(current.length)} record(s)</span>
        <label class="small">Rows per page <select data-role="size">${[10, 25, 50, 100].map((n) => `<option ${n === st.size ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <div class="pager"><button data-page="prev" ${st.page <= 1 ? "disabled" : ""} aria-label="Previous page">‹</button>
        ${pg.map((p) => (p === "…" ? '<span class="muted">…</span>' : `<button data-page="${p}" class="${p === st.page ? "active" : ""}">${p}</button>`)).join("")}
        <button data-page="next" ${st.page >= pages ? "disabled" : ""} aria-label="Next page">›</button></div>`;
    };
    const rowOf = (el) => { const tr = el.closest("tr[data-row]"); return tr ? current[+tr.dataset.row] : null; };
    host.addEventListener("input", U.debounce((e) => { if (e.target.dataset.role === "q") { st.q = e.target.value; st.page = 1; draw(); } }, 180));
    host.addEventListener("change", (e) => {
      const t = e.target;
      if (t.dataset.filter) { st.f[t.dataset.filter] = t.value; st.page = 1; draw(); }
      else if (t.dataset.role === "from" || t.dataset.role === "to") { st[t.dataset.role] = t.value; st.page = 1; draw(); }
      else if (t.dataset.role === "size") { st.size = +t.value; st.page = 1; draw(); }
    });
    host.addEventListener("click", (e) => {
      const t = e.target.closest("button, th[data-sort]"); if (!t) return;
      if (t.dataset.page) { const pages = Math.max(1, Math.ceil(current.length / st.size)); st.page = t.dataset.page === "prev" ? Math.max(1, st.page - 1) : t.dataset.page === "next" ? Math.min(pages, st.page + 1) : +t.dataset.page; draw(); return; }
      if (t.dataset.sort) { st.sort = st.sort && st.sort.key === t.dataset.sort ? { key: t.dataset.sort, dir: st.sort.dir === "asc" ? "desc" : "asc" } : { key: t.dataset.sort, dir: "asc" }; draw(); return; }
      if (t.dataset.role === "clear") {
        st.q = ""; st.f = {}; st.from = ""; st.to = ""; st.page = 1;
        host.querySelectorAll('.table-toolbar input[type="search"], .table-toolbar input[type="date"], .table-toolbar select').forEach((el) => { el.value = ""; });
        draw(); return;
      }
      if (t.dataset.export) { window.Reports.exportTable(t.dataset.export, cfg.exportName, cfg.columns, current); return; }
      if (t.dataset.act && cfg.onAction && cfg.onAction[t.dataset.act]) { cfg.onAction[t.dataset.act](rowOf(t), t); return; }
      if (t.dataset.tool && cfg.onTool && cfg.onTool[t.dataset.tool]) { cfg.onTool[t.dataset.tool](current, t); }
    });
    draw();
    return { redraw: draw, rows: () => current, state: st };
  };
  /** Pre-set a table's search/filters before navigating to it (e.g. drill-down links). */
  UI.presetTable = (id, patch) => {
    UI.tableState[id] = Object.assign({ q: "", f: {}, from: "", to: "", page: 1, size: 10, sort: null }, UI.tableState[id] || {}, patch, { page: 1 });
  };
  UI.act = (act, label, cls = "btn-xs", extra = "") => `<button class="btn ${cls}" data-act="${act}" ${extra}>${U.esc(label)}</button>`;

  /* ---------------- modal ---------------- */
  UI.modal = ({ title, body, size = "", buttons = [], onAction, onOpen, onClose }) => {
    const root = document.getElementById("modalRoot");
    const prevFocus = document.activeElement;
    const wrap = UI.html(`<div class="modal-backdrop"><div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${U.esc(title)}">
      <div class="modal-head"><h2>${U.esc(title)}</h2><button class="icon-btn sm" data-close aria-label="Close">×</button></div>
      <div class="modal-body">${body}</div>
      ${buttons.length ? `<div class="modal-foot">${buttons.map((b) => `<button class="btn ${b.cls || ""} ${b.left ? "left" : ""}" data-mact="${b.act || ""}" ${b.close ? "data-close" : ""} ${b.disabled ? "disabled" : ""} ${b.title ? `title="${U.esc(b.title)}"` : ""}>${U.esc(b.label)}</button>`).join("")}</div>` : ""}
    </div></div>`);
    root.appendChild(wrap);
    const api = {
      el: wrap, body: wrap.querySelector(".modal-body"),
      close: () => { wrap.remove(); document.removeEventListener("keydown", onKey); if (onClose) onClose(); if (prevFocus && prevFocus.focus) prevFocus.focus(); }
    };
    const onKey = (e) => { if (e.key === "Escape" && root.lastElementChild === wrap) api.close(); };
    document.addEventListener("keydown", onKey);
    wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) api.close(); });
    wrap.addEventListener("click", (e) => {
      const b = e.target.closest("[data-mact],[data-close]"); if (!b) return;
      if (b.dataset.mact && onAction) onAction(b.dataset.mact, api, b);
      else if (b.hasAttribute("data-close")) api.close();
    });
    if (onOpen) onOpen(api);
    const first = wrap.querySelector("input:not([type=hidden]):not([readonly]), select, textarea, .modal-foot .btn");
    if (first) setTimeout(() => first.focus(), 30);
    return api;
  };
  UI.closeAllModals = () => { document.getElementById("modalRoot").innerHTML = ""; };

  UI.confirm = ({ title = "Please confirm", text, okLabel = "Confirm", danger = false }) => new Promise((resolve) => {
    let done = false;
    UI.modal({ title, size: "sm", body: `<p>${text}</p>`, buttons: [{ label: "Cancel", close: true, cls: "btn-ghost" }, { label: okLabel, act: "ok", cls: danger ? "btn-danger" : "btn-primary" }],
      onAction: (a, m) => { if (a === "ok") { done = true; m.close(); resolve(true); } }, onClose: () => { if (!done) resolve(false); } });
  });

  UI.view = (title, rows, extra = "", size = "") => UI.modal({ title, size, body: `<table class="kv">${rows.filter(Boolean).map(([k, v]) => `<tr><th>${U.esc(k)}</th><td>${v === null || v === undefined || v === "" ? "—" : v}</td></tr>`).join("")}</table>${extra}`,
    buttons: [{ label: "Close", close: true, cls: "btn-primary" }] });

  /* ---------------- forms ---------------- */
  const optionsOf = (f, values) => (typeof f.options === "function" ? f.options(values) : f.options || []);
  UI.formHtml = (fields, values = {}) => `<form class="form-grid ${fields.cols3 ? "cols-3" : ""}" novalidate>${fields.map((f) => {
    if (f.type === "section") return `<div class="form-section-title">${U.esc(f.label)}</div>`;
    if (f.type === "note") return `<div class="form-note ${f.cls || ""}" ${f.name ? `data-note="${f.name}"` : ""}>${f.html || U.esc(f.label)}</div>`;
    if (f.type === "html") return `<div class="field ${f.span || "span-all"}" ${f.name ? `data-html="${f.name}"` : ""}>${f.html}</div>`;
    const v = values[f.name] !== undefined && values[f.name] !== null ? values[f.name] : f.default !== undefined ? f.default : "";
    const id = "f_" + f.name + "_" + Math.random().toString(36).slice(2, 6);
    const req = f.required ? '<span class="req">*</span>' : "";
    let input;
    if (f.type === "select") input = `<select id="${id}" name="${f.name}" ${f.readonly ? "disabled" : ""}>${f.placeholder !== false ? `<option value="">${U.esc(f.placeholder || "— Select —")}</option>` : ""}${optionsOf(f, values).map((o) => { const ov = typeof o === "object" ? o.value : o, ol = typeof o === "object" ? o.label : o; return `<option value="${U.esc(ov)}" ${String(ov) === String(v) ? "selected" : ""}>${U.esc(ol)}</option>`; }).join("")}</select>`;
    else if (f.type === "textarea") input = `<textarea id="${id}" name="${f.name}" ${f.readonly ? "readonly" : ""} rows="${f.rows || 3}">${U.esc(v)}</textarea>`;
    else if (f.type === "checkbox") return `<div class="field ${f.span || ""}"><label class="check"><input type="checkbox" name="${f.name}" ${v ? "checked" : ""}> ${U.esc(f.label)}</label>${f.hint ? `<span class="hint">${f.hint}</span>` : ""}</div>`;
    else if (f.type === "datalist") input = `<input id="${id}" name="${f.name}" list="${id}_dl" value="${U.esc(v)}" autocomplete="off" placeholder="${U.esc(f.placeholder || "Type to search…")}"><datalist id="${id}_dl">${optionsOf(f, values).map((o) => `<option value="${U.esc(typeof o === "object" ? o.label : o)}"></option>`).join("")}</datalist>`;
    else input = `<input id="${id}" type="${f.type === "readonly" ? "text" : f.type || "text"}" name="${f.name}" value="${U.esc(v)}" ${f.readonly || f.type === "readonly" ? "readonly" : ""} ${f.step ? `step="${f.step}"` : f.type === "number" ? 'step="any"' : ""} ${f.min !== undefined && typeof f.min !== "function" ? `min="${f.min}"` : ""} ${f.placeholder ? `placeholder="${U.esc(f.placeholder)}"` : ""}>`;
    return `<div class="field ${f.span || ""}" data-field="${f.name}"><label for="${id}">${U.esc(f.label)}${req}</label>${input}${f.hint ? `<span class="hint">${f.hint}</span>` : ""}<span class="err"></span></div>`;
  }).join("")}</form>`;

  UI.readForm = (root) => {
    const out = {};
    root.querySelectorAll("input[name], select[name], textarea[name]").forEach((el) => {
      if (el.type === "checkbox") out[el.name] = el.checked;
      else out[el.name] = el.value.trim ? el.value.trim() : el.value;
    });
    return out;
  };
  UI.showErrors = (root, errors) => {
    root.querySelectorAll(".field").forEach((f) => { f.classList.remove("invalid"); const e = f.querySelector(".err"); if (e) e.textContent = ""; });
    Object.entries(errors || {}).forEach(([k, msg]) => {
      const f = root.querySelector(`[data-field="${k}"]`);
      if (f) { f.classList.add("invalid"); f.querySelector(".err").textContent = msg; }
    });
    const firstBad = root.querySelector(".field.invalid input, .field.invalid select, .field.invalid textarea");
    if (firstBad) firstBad.focus();
  };

  /**
   * Validated form modal.
   * onSubmit(values, action) must return a State result {ok, error}. Buttons with
   * act other than 'submit' are passed through as action (e.g. 'draft').
   */
  UI.formModal = ({ title, fields, values = {}, size = "", submitLabel = "Save", buttons, onSubmit, onChange, successTitle, successText, intro = "" }) => {
    const btns = buttons || [{ label: "Cancel", close: true, cls: "btn-ghost" }, { label: submitLabel, act: "submit", cls: "btn-primary" }];
    const render = (vals) => intro + UI.formHtml(fields, vals);
    return UI.modal({
      title, size, body: render(values), buttons: btns,
      onOpen: (m) => {
        const handler = (e) => {
          if (!onChange) return;
          const vals = UI.readForm(m.body);
          const res = onChange(e.target.name, vals, m);
          if (res && res.rerender) { m.body.innerHTML = render(Object.assign(vals, res.values || {})); }
        };
        m.body.addEventListener("change", handler);
        if (onChange) onChange(null, UI.readForm(m.body), m);
      },
      onAction: (act, m) => {
        const vals = UI.readForm(m.body);
        const relevant = act === "draft" ? fields.map((f) => ({ ...f, required: f.requiredForDraft || false })) : fields;
        const v = window.Validation.validate(vals, relevant);
        UI.showErrors(m.body, v.errors);
        if (!v.ok) { window.Notify.error("Please correct the highlighted fields", Object.values(v.errors)[0]); return; }
        const res = onSubmit(vals, act);
        if (res && res.ok) {
          m.close();
          window.Notify.success(typeof successTitle === "function" ? successTitle(res, act) : successTitle || "Saved", typeof successText === "function" ? successText(res, act) : successText || "");
        } else if (res && res.error) {
          window.Notify.error("Not saved", res.error);
          const note = m.body.querySelector(".form-note.danger[data-note='server']");
          if (note) note.remove();
          m.body.insertAdjacentHTML("afterbegin", `<div class="form-note danger" data-note="server" style="margin-bottom:12px">${U.esc(res.error)}</div>`);
        }
      }
    });
  };

  window.UI = UI;
})();
