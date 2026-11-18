/* =========================================================
   modules/dashboard.js — Dashboard, Inventory Dashboard,
   MIS Dashboard (all figures from calculations.js)
   ========================================================= */
(function () {
  "use strict";
  const U = window.U, UI = window.UI, R = window.Router, C = window.Calc, M = window.Mod;
  const S = () => window.State;

  /** Shared KPI computation so every dashboard shows identical numbers. */
  const kpi = () => {
    const st = S(), sum = st.stockSummary();
    const rows = st.db.grades.map((g) => ({ g, ...sum[g.id], status: C.stockStatus(sum[g.id].closing, g), value: C.stockValue(sum[g.id].closing, g.unitPrice) }));
    const oil = rows.filter((r) => r.g.type === "Oil"), gr = rows.filter((r) => r.g.type === "Grease");
    const openIssues = st.openIssues();
    return { rows, oil, gr, oilQty: U.sum(oil, (r) => r.closing), grQty: U.sum(gr, (r) => r.closing), value: U.sum(rows, (r) => r.value || 0),
      low: rows.filter((r) => ["CRITICAL", "OUT", "REORDER"].includes(r.status.key) && r.g.status === "Active"), scrap: st.scrap(),
      reqOpen: st.db.requests.filter((r) => r.status === "OPEN").length, openIssues,
      pendingApprovals: st.db.txns.filter((t) => ["PENDING_APPROVAL", "PENDING_EXCEPTION", "SUBMITTED"].includes(t.status)).length };
  };
  const monthly = () => C.monthlyConsumption(S().src.inventory.months, S().db.txns, S().idx.grade);

  /* ---------------- Dashboard ---------------- */
  R.register({
    id: "dashboard", title: "Dashboard",
    intro: "Day-to-day view of the Lube Oil Cell: stock, requests, open issues, scrap and consumption.",
    render(el) {
      const k = kpi(), m = monthly().slice(-12);
      el.innerHTML = `
        <div class="card mb-2"><div class="table-toolbar" style="border:0">
          <strong style="margin-right:6px">Quick entry</strong>
          <button class="btn btn-sm btn-primary" data-q="rcv">+ Stock In</button>
          <button class="btn btn-sm btn-primary" data-q="req">+ Raise Request</button>
          <button class="btn btn-sm btn-primary" data-q="iss">+ Issue Oil</button>
          <button class="btn btn-sm" data-q="con">+ Book Consumption</button>
          <button class="btn btn-sm" data-q="ret">+ Return Balance</button>
          <button class="btn btn-sm" data-q="scr">+ Scrap Entry</button>
        </div></div>
        ${UI.kpis([
          { label: "Oil stock (all grades)", value: `${U.fmt(k.oilQty, 0)} <small>L</small>`, sub: `${k.oil.filter((r) => r.g.status === "Active").length} active grades`, link: "inventory" },
          { label: "Grease stock", value: `${U.fmt(k.grQty, 0)} <small>kg</small>`, sub: `${k.gr.filter((r) => r.g.status === "Active").length} active grades`, link: "inventory" },
          { label: "Stock value", value: U.fmtMoney(k.value), sub: "At current unit prices", link: "stock-reports" },
          { label: "Reorder alerts", value: k.low.length, sub: "Grades at / below reorder level", cls: k.low.length ? "warning" : "success", link: "low-stock" },
          { label: "Open requests", value: k.reqOpen, sub: "Waiting to be issued", cls: k.reqOpen ? "warning" : "success", link: "oil-requests" },
          { label: "Issues with balance", value: k.openIssues.length, sub: `${U.fmt(U.sum(k.openIssues, (x) => x.bal.open))} not yet used / returned`, cls: k.openIssues.length ? "info" : "success", link: "consumption" },
          { label: "Scrap not yet disposed", value: `${U.fmt(k.scrap.recon.totalUnDisposed, 0)} <small>L</small>`, sub: `${U.fmt(k.scrap.recon.inStorage, 0)} L in storage`, link: "scrap-reconciliation" },
          { label: "Pending approvals", value: k.pendingApprovals, sub: "Receipts, issues, adjustments", cls: k.pendingApprovals ? "warning" : "neutral", link: "stock-ledger" }
        ])}
        <div class="grid grid-2">
          ${UI.card({ title: "Monthly consumption — last 12 months", sub: "Oil (L) and grease (kg) shown separately", body: '<div class="grid grid-2"><div class="chart-box short" id="dOil"></div><div class="chart-box short" id="dGr"></div></div>', actions: '<button class="btn btn-sm" data-nav="mis-dashboard">MIS ›</button>' })}
          ${UI.card({ title: "Stock by grade", sub: "Top oil grades; colour shows reorder status", body: `<div id="dStat"></div>`, actions: '<button class="btn btn-sm" data-nav="low-stock">Reorder list ›</button>' })}
        </div>
        <div class="grid grid-2">
          ${UI.card({ title: "Scrap oil", body: `<table class="kv"><tr><th>Generated</th><td class="num">${U.fmt(k.scrap.recon.generated)} L</td></tr><tr><th>In Lube Cell storage</th><td class="num">${U.fmt(k.scrap.recon.inStorage)} L</td></tr><tr><th>Sent to disposal yard</th><td class="num">${U.fmt(k.scrap.recon.dispatched)} L</td></tr><tr><th>Disposal record FY-21 → FY-27</th><td class="num">${U.fmt(U.sum(k.scrap.sourceDispatches, (d) => d.qty))} L</td></tr></table>`, actions: '<button class="btn btn-sm" data-nav="scrap-reconciliation">Scrap records ›</button>' })}
          ${UI.card({ title: "Recent activity", body: `<ul class="timeline">${S().db.audit.slice(0, 6).map((a) => `<li><time>${U.fmtDateTime(a.at)}</time><strong>${U.esc(a.action)}</strong> <span class="muted">${U.esc(a.ref)}</span></li>`).join("")}</ul>`, actions: '<button class="btn btn-sm" data-nav="audit-trail">Audit trail ›</button>' })}
        </div>`;
      UI.chart(el.querySelector("#dOil"), { type: "bar", unit: "L", data: { labels: m.map((x) => U.monthLabel(x.month)), datasets: [{ label: "Oil (L)", data: m.map((x) => x.oil) }] } });
      UI.chart(el.querySelector("#dGr"), { type: "bar", unit: "kg", data: { labels: m.map((x) => U.monthLabel(x.month)), datasets: [{ label: "Grease (kg)", data: m.map((x) => x.grease), color: "#eb6834" }] } });
      const act = k.rows.filter((r) => r.g.status === "Active" && r.g.type === "Oil").sort((a, b) => b.closing - a.closing).slice(0, 12);
      el.addEventListener("click", (e) => {
        const b = e.target.closest("[data-q]"); if (!b) return;
        ({ rcv: () => window.ReceiptUI.openReceiptForm(null), req: () => window.RequestUI.openRequestForm(), iss: () => window.IssueUI.openIssueForm(),
           con: () => window.ConsumptionUI.recordConsumption(null), ret: () => window.InventoryUI.openReturnForm(null), scr: () => window.ScrapUI.openGenForm() })[b.dataset.q]();
      });
      el.querySelector("#dStat").innerHTML = UI.barList(act.map((r) => ({ label: r.g.name, value: r.closing, cls: r.status.cls, display: `${U.fmt(r.closing, 0)} L ${r.status.key !== "OK" && r.status.key !== "UNDEFINED" ? `· ${r.status.label}` : ""}` })), "L");
    }
  });

  /* ---------------- Inventory Dashboard ---------------- */
  R.register({
    id: "inventory-dashboard", title: "Inventory Dashboard",
    intro: "Current stock, consumption rate, minimum stock level and reorder alerts.",
    render(el) {
      const k = kpi(), st = S();
      const months = Object.keys(st.src.inventory.months).sort().filter((m) => m < st.src.inventory.latestMonth).slice(-3);
      const rate = {}; months.forEach((ym) => st.src.inventory.months[ym].blocks.forEach((b) => b.items.forEach((it) => { if (it.gradeId) rate[it.gradeId] = (rate[it.gradeId] || 0) + (it.consumption || 0) / months.length; })));
      const rows = k.rows.filter((r) => r.g.status === "Active").map((r) => ({ ...r, rate: rate[r.g.id] || 0, cover: rate[r.g.id] ? r.closing / rate[r.g.id] : null }));
      el.innerHTML = `
        ${UI.kpis([
          { label: "Current oil stock", value: `${U.fmt(k.oilQty, 0)} <small>L</small>`, link: "inventory" },
          { label: "Current grease stock", value: `${U.fmt(k.grQty, 0)} <small>kg</small>`, link: "inventory" },
          { label: "Below minimum", value: rows.filter((r) => ["CRITICAL", "OUT"].includes(r.status.key)).length, cls: "danger", link: "low-stock" },
          { label: "At reorder level", value: rows.filter((r) => r.status.key === "REORDER").length, cls: "warning", link: "low-stock" },
          { label: "Stock value", value: U.fmtMoney(k.value) }
        ])}
        <div class="grid grid-2">
          ${UI.card({ title: "Stock cover (months) at current consumption", sub: `Rate = average of ${months.map(U.monthLabel).join(", ")}`, body: '<div class="chart-box tall" id="idCover"></div>' })}
          ${UI.card({ title: "Grades in stock", body: '<div class="chart-box tall" id="idType"></div>' })}
        </div>
        <div class="card mt-2" id="idTable"></div>`;
      const cov = rows.filter((r) => r.cover !== null).sort((a, b) => a.cover - b.cover).slice(0, 15);
      UI.chart(el.querySelector("#idCover"), { type: "bar", unit: "months", data: { labels: cov.map((r) => r.g.name), datasets: [{ label: "Months of cover", data: cov.map((r) => U.round(r.cover, 1)) }] }, options: { indexAxis: "y" } });
      UI.chart(el.querySelector("#idType"), { type: "doughnut", data: { labels: ["Oil grades in stock", "Grease grades in stock", "Grades at zero"], datasets: [{ data: [rows.filter((r) => r.g.type === "Oil" && r.closing > 0).length, rows.filter((r) => r.g.type === "Grease" && r.closing > 0).length, rows.filter((r) => r.closing <= 0).length] }] } });
      UI.table(el.querySelector("#idTable"), { id: "invdash", exportName: "inventory_dashboard", rows, search: (r) => r.g.name,
        filters: [{ key: "type", label: "Material", options: ["Oil", "Grease"], value: (r) => r.g.type }, { key: "st", label: "Status", options: ["Healthy", "Reorder", "Below minimum", "Out of stock", "Levels pending"], value: (r) => r.status.label }],
        columns: [{ key: "g", label: "Grade", render: (r) => `<strong>${U.esc(r.g.name)}</strong>`, sortVal: (r) => r.g.name, csv: (r) => r.g.name },
          { key: "closing", label: "Current stock", num: true, render: (r) => U.fmtQty(r.closing, r.g.unit) }, { key: "rate", label: "Avg monthly consumption", num: true, render: (r) => U.fmtQty(U.round(r.rate), r.g.unit) },
          { key: "cover", label: "Cover (months)", num: true, render: (r) => (r.cover === null ? "—" : U.fmt(r.cover, 1)) }, { key: "min", label: "Min", num: true, sortVal: (r) => r.g.minStock, render: (r) => U.fmt(r.g.minStock) },
          { key: "rol", label: "Reorder", num: true, sortVal: (r) => r.g.reorderLevel, render: (r) => U.fmt(r.g.reorderLevel) }, { key: "status", label: "Status", sortVal: (r) => r.status.label, render: (r) => UI.badge(r.status.label, r.status.cls), csv: (r) => r.status.label }],
        rowClass: (r) => (r.status.cls === "danger" ? "row-danger" : r.status.cls === "warning" ? "row-warning" : ""), defaultSort: { key: "cover", dir: "asc" } });
    }
  });

  /* ---------------- MIS Dashboard ---------------- */
  R.register({
    id: "mis-dashboard", title: "MIS Dashboard",
    intro: "Management view: stock, monthly and FY-wise consumption, equipment-wise and area-wise consumption, and scrap oil.",
    render(el) {
      const k = kpi(), st = S();
      const f = UI.tableState["mis:f"] = UI.tableState["mis:f"] || { range: "24", mat: "Oil", area: "", fy: "FY-27" };
      const all = monthly(), recs = M.consumptionRecords();
      const fys = U.uniq(recs.map((r) => U.fyOf(r.date))).sort();
      el.innerHTML = `
        ${UI.kpis([
          { label: "Current oil stock", value: `${U.fmt(k.oilQty, 0)} <small>L</small>`, link: "inventory" },
          { label: "Current grease stock", value: `${U.fmt(k.grQty, 0)} <small>kg</small>`, link: "inventory" },
          { label: "Reorder alerts", value: k.low.length, cls: k.low.length ? "warning" : "success", link: "low-stock" },
          { label: "Open requests", value: k.reqOpen, cls: k.reqOpen ? "warning" : "success", link: "oil-requests" },
          { label: "Scrap in storage", value: `${U.fmt(k.scrap.recon.inStorage)} <small>L</small>`, link: "scrap-reconciliation" }
        ])}
        <div class="card"><div class="table-toolbar">
          <label class="filter"><span>Trend range</span><select data-mf="range"><option value="12">Last 12 months</option><option value="24">Last 24 months</option><option value="all">All (since ${U.monthLabel(all[0] ? all[0].month : "")})</option></select></label>
          <label class="filter"><span>Material</span><select data-mf="mat"><option>Oil</option><option>Grease</option></select></label>
          <label class="filter"><span>Financial year</span><select data-mf="fy">${fys.map((y) => `<option>${y}</option>`).join("")}</select></label>
          <label class="filter"><span>Area</span><select data-mf="area"><option value="">All areas</option>${U.uniq(recs.map((r) => r.area)).sort().map((a) => `<option>${U.esc(a)}</option>`).join("")}</select></label>
        </div></div>
        <div class="grid grid-2 mt-2">
          ${UI.card({ title: "Monthly oil consumption (L)", body: '<div class="chart-box" id="mOil"></div>' })}
          ${UI.card({ title: "Monthly grease consumption (kg)", body: '<div class="chart-box" id="mGr"></div>' })}
        </div>
        <div class="grid grid-2">
          ${UI.card({ title: "FY-wise lube oil consumption (L)", sub: "Part years show the month count", body: '<div class="chart-box short" id="mFyO"></div>' })}
          ${UI.card({ title: "FY-wise grease consumption (kg)", body: '<div class="chart-box short" id="mFyG"></div>' })}
        </div>
        <div class="grid grid-2">
          ${UI.card({ title: `Top 15 equipment — ${U.esc(f.mat.toLowerCase())}, ${f.fy}${f.area ? " · " + U.esc(f.area) : ""}`, body: '<div class="chart-box tall" id="mEq"></div>', actions: '<button class="btn btn-sm" data-nav="consumption-reports">Report ›</button>' })}
          ${UI.card({ title: `Area-wise ${U.esc(f.mat.toLowerCase())} consumption, ${f.fy}`, body: '<div class="chart-box tall" id="mArea"></div>' })}
        </div>
        ${UI.card({ title: "Scrap oil sent to disposal yard by FY (L)", body: '<div class="chart-box short" id="mScrap"></div>', actions: '<button class="btn btn-sm" data-nav="scrap-disposal">Disposal ›</button>' })}`;
      el.querySelectorAll("[data-mf]").forEach((s) => { s.value = f[s.dataset.mf]; s.addEventListener("change", () => { f[s.dataset.mf] = s.value; R.render(); }); });
      const series = f.range === "all" ? all : all.slice(-+f.range);
      UI.chart(el.querySelector("#mOil"), { type: "line", unit: "L", data: { labels: series.map((x) => U.monthLabel(x.month)), datasets: [{ label: "Oil (L)", data: series.map((x) => x.oil), fill: true }] } });
      UI.chart(el.querySelector("#mGr"), { type: "line", unit: "kg", data: { labels: series.map((x) => U.monthLabel(x.month)), datasets: [{ label: "Grease (kg)", data: series.map((x) => x.grease), color: "#eb6834", fill: true }] } });
      const fy = C.fyConsumption(all), fyl = fy.map((x) => x.fy + (x.months < 12 ? ` (${x.months}m)` : ""));
      UI.chart(el.querySelector("#mFyO"), { type: "bar", unit: "L", data: { labels: fyl, datasets: [{ label: "Oil (L)", data: fy.map((x) => x.oil) }] } });
      UI.chart(el.querySelector("#mFyG"), { type: "bar", unit: "kg", data: { labels: fyl, datasets: [{ label: "Grease (kg)", data: fy.map((x) => x.grease), color: "#eb6834" }] } });
      const isMat = (r) => (f.mat === "Grease" ? r.unit === "kg" : r.unit === "L");
      const top = C.totalsBy(recs.filter((r) => U.fyOf(r.date) === f.fy && isMat(r) && (!f.area || r.area === f.area)), (r) => r.equipment).slice(0, 15);
      UI.chart(el.querySelector("#mEq"), { type: "bar", unit: f.mat === "Grease" ? "kg" : "L", data: { labels: top.map((x) => x.key), datasets: [{ label: f.mat, data: top.map((x) => x.qty), color: f.mat === "Grease" ? "#eb6834" : undefined }] }, options: { indexAxis: "y" } });
      const ar = C.totalsBy(recs.filter((r) => U.fyOf(r.date) === f.fy && isMat(r)), (r) => r.area);
      UI.chart(el.querySelector("#mArea"), { type: "bar", unit: f.mat === "Grease" ? "kg" : "L", data: { labels: ar.map((x) => x.key), datasets: [{ label: f.mat, data: ar.map((x) => x.qty), color: f.mat === "Grease" ? "#eb6834" : undefined }] } });
      const sf = st.src.scrap.fyTotalsInSheet, fyKeys = Object.keys(sf).filter((x) => x !== "GRAND");
      const fy27 = U.sum(st.src.scrap.records.filter((r) => r.fy === "FY-27"), (r) => r.qty);
      UI.chart(el.querySelector("#mScrap"), { type: "bar", unit: "L", data: { labels: [...fyKeys, "FY-27 (to date)"], datasets: [{ label: "Scrap oil (L)", data: [...fyKeys.map((x) => sf[x]), fy27], color: "#1baf7a" }] } });
    }
  });
})();
