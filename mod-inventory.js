/* =========================================================
   modules/inventory.js — Inventory Management, Stock Ledger,
   Stock Adjustment, Stock Return, Low Stock / Reorder,
   Stock Reports. All numbers from Calc.stockSummary().
   ========================================================= */
(function () {
  "use strict";
  const U = window.U, UI = window.UI, R = window.Router, C = window.Calc, M = window.Mod, N = window.Notify;
  const S = () => window.State;
  const TYPES = ["OPENING", "RECEIPT", "ISSUE", "CONSUMPTION", "RETURN", "ADJUSTMENT"];

  /** calculateClosingStock rows for a period (single computation used by every inventory screen). */
  const stockRows = (from, to) => {
    const st = S(), sum = st.stockSummary(from, to);
    return st.db.grades.map((g) => { const r = sum[g.id]; return { g, ...r, status: C.stockStatus(r.closing, g), value: C.stockValue(r.closing, g.unitPrice) }; });
  };
  const totalsFoot = (rows, keys) => ["L", "kg"].map((u) => { const rs = rows.filter((r) => r.g.unit === u); if (!rs.length) return ""; return `<tr><td>Total (${u})</td>${keys.map((k) => (k ? `<td class="num">${U.fmt(U.sum(rs, (r) => r[k]))}</td>` : "<td></td>")).join("")}</tr>`; }).join("");

  /* ---------------- Inventory Management ---------------- */
  R.register({
    id: "inventory", title: "Inventory Management",
    intro: "Grade-wise and material-type-wise inventory of the Lube Oil Cell sub-inventory. Closing Stock = Opening + Receipts + Returns − Issues + Adjustments.",
    render(el) {
      const st = S();
      const p = UI.tableState["inv:period"] = UI.tableState["inv:period"] || { from: st.goLive(), to: st.today() };
      const host = document.createElement("div"); el.appendChild(host);
      UI.tabs(host, [
        { id: "live", label: "Live inventory (demo ledger)", render: (b) => {
          const rows = stockRows(p.from, p.to);
          b.innerHTML = `
            <div class="card"><div class="table-toolbar"><label class="filter"><span>Period from</span><input type="date" data-p="from" value="${p.from}"></label><label class="filter"><span>to</span><input type="date" data-p="to" value="${p.to}"></label>
              <span class="grow"></span><span class="small muted">Opening = all movements before the start date. Ledger starts ${U.fmtDate(st.goLive())} with the source opening balance.</span></div></div>
            ${UI.callout("info", "<strong>Consumption is reported separately</strong> — stock is deducted once at ISSUE; the Consumption column is equipment usage booked against those issues and is not subtracted again.")}
            <div class="card" id="invTable"></div>`;
          b.querySelectorAll("[data-p]").forEach((i) => i.addEventListener("change", () => { p[i.dataset.p] = i.value; R.render(); }));
          UI.table(b.querySelector("#invTable"), {
            id: "inventory", exportName: "inventory_" + p.from + "_" + p.to, pageSize: 50, rows: () => rows, search: (r) => r.g.name,
            filters: [{ key: "type", label: "Material type", options: ["Oil", "Grease"], value: (r) => r.g.type }, { key: "status", label: "Grade status", options: ["Active", "Inactive"], value: (r) => r.g.status },
              { key: "st", label: "Stock status", options: ["Healthy", "Reorder", "Below minimum", "Out of stock", "Levels pending"], value: (r) => r.status.label }],
            columns: [{ key: "g", label: "Grade", sortVal: (r) => r.g.name, render: (r) => `<strong>${U.esc(r.g.name)}</strong><div class="small muted">${r.g.type}</div>`, csv: (r) => r.g.name },
              { key: "unit", label: "Unit", render: (r) => r.g.unit, csv: (r) => r.g.unit }, { key: "opening", label: "Opening", num: true, render: (r) => U.fmt(r.opening) }, { key: "receipts", label: "+ Receipt", num: true, render: (r) => U.fmt(r.receipts) },
              { key: "returns", label: "+ Return", num: true, render: (r) => U.fmt(r.returns) }, { key: "issues", label: "− Issue", num: true, render: (r) => U.fmt(r.issues) },
              { key: "adjustments", label: "± Adjust", num: true, render: (r) => U.fmt(r.adjustments) }, { key: "closing", label: "= Closing", num: true, render: (r) => `<strong>${U.fmt(r.closing)}</strong>` },
              { key: "consumption", label: "Consumption (memo)", num: true, render: (r) => `<span class="muted">${U.fmt(r.consumption)}</span>` },
              { key: "min", label: "Min", num: true, sortVal: (r) => r.g.minStock, render: (r) => U.fmt(r.g.minStock) }, { key: "rol", label: "Reorder", num: true, sortVal: (r) => r.g.reorderLevel, render: (r) => U.fmt(r.g.reorderLevel) },
              { key: "price", label: "Unit price", num: true, sortVal: (r) => r.g.unitPrice, render: (r) => (r.g.unitPrice ? U.fmt(r.g.unitPrice) : "—") }, { key: "value", label: "Stock value", num: true, render: (r) => U.fmtMoney(r.value) },
              { key: "status", label: "Status", sortVal: (r) => r.status.label, render: (r) => UI.badge(r.status.label, r.status.cls), csv: (r) => r.status.label }],
            footer: (rs) => totalsFoot(rs, [null, "opening", "receipts", "returns", "issues", "adjustments", "closing", "consumption", null, null, null, "value", null]),
            actions: () => UI.act("ledger", "Ledger"), onAction: { ledger: (r) => { UI.presetTable("ledger", { f: { gradeId: r.g.id } }); R.go("stock-ledger"); } },
            rowClass: (r) => (r.status.cls === "danger" ? "row-danger" : r.status.cls === "warning" ? "row-warning" : "")
          });
        } },
        { id: "source", label: "Source monthly balance sheets (MIS)", render: (b) => {
          const months = Object.keys(st.src.inventory.months).sort().reverse();
          const sel = UI.tableState["inv:srcMonth"] = UI.tableState["inv:srcMonth"] || months[0];
          const m = st.src.inventory.months[sel];
          const rows = [].concat(...m.blocks.map((bl) => bl.items.map((it) => ({ ...it, kind: it.kind || bl.kind, calc: U.round((it.opening || 0) + (it.receipt || 0) - (it.consumption || 0), 3) }))));
          b.innerHTML = `<div class="card"><div class="table-toolbar"><label class="filter"><span>Source month</span><select data-m>${months.map((x) => `<option value="${x}" ${x === sel ? "selected" : ""}>${U.monthLabel(x)} — ${U.esc(st.src.inventory.months[x].sheet)}</option>`).join("")}</select></label>
            <span class="grow"></span><span class="small muted">${months.length} monthly inventory sheets parsed (duplicate "${U.esc(st.src.inventory.duplicateSheets.join(", "))}" excluded).</span></div>
            <div class="table-wrap"><table class="data compact"><thead><tr><th>Grade (source spelling)</th><th>Type</th><th class="num">Opening</th><th class="num">Received from Central Store</th><th class="num">Consumption</th><th class="num">Balance (sheet)</th><th class="num">Opening+Rcvd−Cons</th><th>Check</th><th class="num">Unit price</th></tr></thead>
            <tbody>${rows.map((r) => { const ok = r.closing === null || Math.abs(r.closing - r.calc) < 0.05; return `<tr class="${ok ? "" : "row-warning"}"><td>${U.esc(r.grade)}</td><td>${r.kind}</td><td class="num">${U.fmt(r.opening)}</td><td class="num">${U.fmt(r.receipt)}</td><td class="num">${U.fmt(r.consumption)}</td><td class="num">${U.fmt(r.closing)}</td><td class="num">${U.fmt(r.calc)}</td><td>${ok ? UI.badge("OK", "success") : UI.badge("Δ " + U.fmt(r.closing - r.calc), "warning")}</td><td class="num">${U.fmt(r.price)}</td></tr>`; }).join("")}</tbody></table></div></div>
            ${M.sourceNote(`Lubrication MIS FY-27 › ${U.esc(m.sheet)}. Read-only view of the client's monthly balance sheet with an arithmetic check (Δ = sheet balance − computed balance).`)}`;
          b.querySelector("[data-m]").addEventListener("change", (e) => { UI.tableState["inv:srcMonth"] = e.target.value; R.render(); });
        } }
      ], "inventory");
    }
  });

  /* ---------------- Stock Ledger ---------------- */
  R.register({
    id: "stock-ledger", title: "Stock Ledger",
    intro: "Every stock movement with its signed effect. Select a grade to see the running balance.",
    render(el) {
      const st = S();
      el.innerHTML = `${UI.callout("info", "Effect column: RECEIPT/RETURN add, ISSUE subtracts, ADJUSTMENT ± after approval, CONSUMPTION 0 (memo). Pending, draft, rejected and cancelled entries have zero effect.")}<div class="card" id="ldTable"></div>`;
      const tstate = UI.tableState.ledger;
      const rows = () => { const g = (UI.tableState.ledger || tstate || { f: {} }).f.gradeId; return C.runningLedger(S().db.txns, g || null).reverse(); };
      UI.table(el.querySelector("#ldTable"), {
        id: "ledger", exportName: "stock_ledger", pageSize: 25, rows, dateKey: "date",
        search: (t) => `${t.no} ${t.equipment || ""} ${t.dept || ""} ${t.remarks || ""} ${t.reason || ""}`,
        filters: [{ key: "gradeId", label: "Grade (for running balance)", options: () => st.db.grades.map((g) => ({ value: g.id, label: g.name })) }, { key: "type", label: "Type", options: TYPES },
          { key: "status", label: "Status", options: () => U.uniq(st.db.txns.map((t) => t.status)) }],
        columns: [{ key: "no", label: "Doc No.", render: (t) => `<span class="mono">${U.esc(t.no)}</span>` }, { key: "date", label: "Date", render: (t) => U.fmtDate(t.date) },
          { key: "type", label: "Type", render: (t) => `<strong>${t.type}</strong>` }, { key: "grade", label: "Grade", sortVal: (t) => S().gradeName(t.gradeId), render: (t) => U.esc(S().gradeName(t.gradeId)) },
          { key: "qty", label: "Qty", num: true, render: (t) => U.fmtQty(t.qty, t.unit) },
          { key: "effect", label: "Stock effect", num: true, render: (t) => (t.effect > 0 ? `<span class="text-success">+${U.fmt(t.effect)}</span>` : t.effect < 0 ? `<span class="text-danger">${U.fmt(t.effect)}</span>` : '<span class="muted">0</span>') },
          { key: "balance", label: "Balance", num: true, render: (t) => (t.balance === null ? '<span class="muted small">select grade</span>' : `<strong>${U.fmt(t.balance)}</strong>`), csv: (t) => (t.balance === null ? "" : t.balance) },
          { key: "ref", label: "Reference", nosort: true, render: (t) => `<span class="small">${U.esc([t.dept, t.equipment, t.supplier, t.reason].filter(Boolean).join(" · ") || "—")}</span>` },
          { key: "status", label: "Status", render: (t) => UI.status(t.status) + (t.source ? " " + UI.badge("Source", "outline") : "") }],
        actions: () => UI.act("view", "View"),
        onAction: { view: (t) => UI.view(`${t.type} ${t.no}`, Object.entries(t).filter(([k, v]) => v !== null && v !== "" && !["id", "createdAt"].includes(k) && typeof v !== "object").map(([k, v]) => [k, k === "gradeId" ? U.esc(S().gradeName(v)) : k === "issueId" ? U.esc((S().db.txns.find((x) => x.id === v) || {}).no || v) : U.esc(v)])) }
      });
    }
  });

  /* ---------------- Stock Adjustment ---------------- */
  function openAdjustmentForm() {
    const needs = S().db.settings.adjustmentApproval;
    UI.formModal({
      title: "Request Stock Adjustment", size: "lg", intro: M.roleNote("issue.create", "request adjustments"),
      fields: [{ name: "date", label: "Date", type: "date", required: true, notFuture: true }, { name: "gradeId", label: "Grade", type: "select", required: true, options: () => M.gradeOptions(undefined, true) },
        { name: "available", label: "Book stock", type: "readonly" }, { name: "direction", label: "Direction", type: "select", required: true, options: [{ value: "INCREASE", label: "Increase (+)" }, { value: "DECREASE", label: "Decrease (−)" }] },
        { name: "qty", label: "Quantity", type: "number", required: true, gt: 0, custom: (v, a) => (a.direction === "DECREASE" && a.gradeId && +v > S().available(a.gradeId) + 1e-9 ? `Cannot decrease below zero (book stock ${U.fmt(S().available(a.gradeId))})` : null) },
        { name: "reason", label: "Reason", type: "select", required: true, options: ["Physical stock verification difference", "Spillage / leakage loss", "Measurement / unit correction", "Data entry correction", "Other (describe in remarks)"] },
        { name: "remarks", label: "Remarks", type: "textarea", span: "span-2", custom: (v, a) => ((a.reason || "").startsWith("Other") && !v ? "Describe the reason" : null) },
        { type: "note", cls: "warn", label: needs ? "Approval required: the adjustment affects stock only after In-charge / Administrator approval." : "Approval disabled in Demo Settings: adjustment will apply immediately." },
        { type: "note", label: "Leftover oil after a top-up/replacement should normally be recorded as a RETURN against the original issue (Stock Return), not as an adjustment." }],
      values: { date: M.today() },
      onChange: (name, v, m) => { if (name === "gradeId" || name === null) { const x = m.body.querySelector('[name="available"]'); if (x) x.value = v.gradeId ? `${U.fmt(S().available(v.gradeId))} ${S().unitOf(v.gradeId)}` : ""; } return null; },
      onSubmit: (v) => S().requestAdjustment(v), successTitle: (r) => (r.record.status === "APPROVED" ? "Adjustment applied" : "Adjustment submitted for approval"), successText: (r) => r.record.no
    });
  }
  R.register({
    id: "stock-adjustment", title: "Stock Adjustment",
    intro: "Corrections after physical verification or losses. Adjustments are separate transactions, approved before they affect stock.",
    render(el) {
      const adj = () => S().db.txns.filter((t) => t.type === "ADJUSTMENT").slice().reverse();
      el.innerHTML = `${UI.kpis([{ label: "Pending approval", value: adj().filter((a) => a.status === "PENDING_APPROVAL").length, cls: "warning" }, { label: "Approved", value: adj().filter((a) => a.status === "APPROVED").length, cls: "success" }, { label: "Rejected", value: adj().filter((a) => a.status === "REJECTED").length, cls: "neutral" }])}
        <div class="card" id="adjTable"></div>`;
      UI.table(el.querySelector("#adjTable"), {
        id: "adjustments", exportName: "adjustment_log", rows: adj, dateKey: "date", search: (a) => `${a.no} ${S().gradeName(a.gradeId)} ${a.reason} ${a.remarks}`,
        filters: [{ key: "status", label: "Status", options: ["PENDING_APPROVAL", "APPROVED", "REJECTED"] }],
        columns: [{ key: "no", label: "Adj. No.", render: (a) => `<span class="mono">${U.esc(a.no)}</span>` }, { key: "date", label: "Date", render: (a) => U.fmtDate(a.date) },
          { key: "grade", label: "Grade", render: (a) => U.esc(S().gradeName(a.gradeId)) }, { key: "qty", label: "Qty (±)", num: true, render: (a) => `${a.qty > 0 ? "+" : ""}${U.fmtQty(a.qty, a.unit)}` },
          { key: "reason", label: "Reason" }, { key: "createdBy", label: "Requested by" }, { key: "approvedBy", label: "Decided by", render: (a) => U.esc(a.approvedBy || "—") }, { key: "status", label: "Status", render: (a) => UI.status(a.status) }],
        toolbar: `<button class="btn btn-sm btn-primary" data-tool="add">+ New Adjustment</button>`, onTool: { add: openAdjustmentForm },
        actions: (a) => UI.act("view", "View") + (a.status === "PENDING_APPROVAL" ? UI.act("ok", "Approve", "btn-xs btn-success") + UI.act("no", "Reject", "btn-xs btn-danger-ghost") : ""),
        onAction: { view: (a) => UI.view(a.no, [["Grade", U.esc(S().gradeName(a.gradeId))], ["Quantity", U.fmtQty(a.qty, a.unit)], ["Reason", U.esc(a.reason)], ["Remarks", U.esc(a.remarks)], ["Status", UI.status(a.status)], ["Requested by", U.esc(a.createdBy)], ["Decided by", U.esc(a.approvedBy || "—")]]),
          ok: (a) => N.result(S().decideAdjustment(a.id, true), "Adjustment approved — stock updated", a.no), no: (a) => N.result(S().decideAdjustment(a.id, false), "Adjustment rejected", a.no) },
        rowClass: (a) => (a.status === "PENDING_APPROVAL" ? "row-warning" : "")
      });
    }
  });

  /* ---------------- Stock Return ---------------- */
  function openReturnForm(issue) {
    const opts = () => S().openIssues().map((x) => ({ value: x.issue.id, label: `${x.issue.no} · ${x.issue.equipment || x.issue.dept} · ${S().gradeName(x.issue.gradeId)} · open ${U.fmt(x.bal.open)} ${x.issue.unit}` }));
    if (!opts().length) { M.noOpenIssues("A return"); return; }
    const balOf = (id) => { const i = S().db.txns.find((t) => t.id === id); return i ? S().issueBalance(i) : null; };
    UI.formModal({
      title: "Return unused oil to Lube Cell", size: "lg", intro: M.roleNote("return.create", "record returns"),
      fields: [{ name: "issueId", label: "Against issue", type: "select", required: true, options: opts, span: "span-2" }, { name: "balance", label: "Open balance of issue", type: "readonly" },
        { name: "date", label: "Return date", type: "date", required: true, notFuture: true },
        { name: "qty", label: "Return quantity", type: "number", required: true, gt: 0, max: (v) => (balOf(v.issueId) || {}).open, maxMsg: (m) => `Cannot exceed the open balance (${U.fmt(m)})` },
        { name: "reason", label: "Reason", type: "select", required: true, options: ["Balance after top-up", "Balance after replacement", "Excess issue", "Work cancelled"] },
        { name: "remarks", label: "Remarks", type: "textarea", span: "span-2" },
        { type: "note", label: "Process step 6: balance remaining after top-up/replacement is added back to inventory. The original issue quantity is preserved; the return is a separate transaction." }],
      values: { issueId: issue ? issue.id : "", date: M.today(), reason: "Balance after top-up" },
      onChange: (name, v, m) => { const b = balOf(v.issueId); const x = m.body.querySelector('[name="balance"]'); if (x) x.value = b ? `${U.fmt(b.open)} (issued ${U.fmt(b.issued)}, consumed ${U.fmt(b.consumed)}, returned ${U.fmt(b.returned)})` : ""; return null; },
      onSubmit: (v) => S().recordReturn(v), successTitle: "Return recorded — stock increased", successText: (r) => `${r.record.no}: +${U.fmtQty(r.record.qty, r.record.unit)}`
    });
  }
  R.register({
    id: "stock-return", title: "Stock Return",
    intro: "Unused oil returned to the Lube Cell against the original issue (process flow step 6: 'oil balance after top-up / replacement').",
    render(el) {
      const rets = () => S().db.txns.filter((t) => t.type === "RETURN").slice().reverse();
      el.innerHTML = `${UI.flow([{ t: "Issue", d: "e.g. 30 L issued" }, { t: "Consumption", d: "e.g. 25 L used", cls: "system" }, { t: "Balance?", d: "Issued − consumed − returned", cls: "decision" }, { t: "Return", d: "e.g. 5 L back to stock", cls: "special" }, { t: "Issue reconciled", d: "Open balance 0", cls: "output" }])}
        <div class="mt-2">${UI.kpis([{ label: "Returns recorded", value: rets().length }, { label: "Open issues with balance", value: S().openIssues().length, cls: "info", link: "stock-issue" }])}</div><div class="card" id="retTable"></div>`;
      UI.table(el.querySelector("#retTable"), {
        id: "returns", exportName: "stock_returns", rows: rets, dateKey: "date", empty: "Use “+ Record Return” to return an unused balance.",
        columns: [{ key: "no", label: "Return No.", render: (t) => `<span class="mono">${t.no}</span>` }, { key: "date", label: "Date", render: (t) => U.fmtDate(t.date) },
          { key: "issue", label: "Against issue", render: (t) => U.esc((S().db.txns.find((x) => x.id === t.issueId) || {}).no || "—") }, { key: "equipment", label: "Equipment", render: (t) => U.esc(t.equipment || "—") },
          { key: "grade", label: "Grade", render: (t) => U.esc(S().gradeName(t.gradeId)) }, { key: "qty", label: "Returned", num: true, render: (t) => U.fmtQty(t.qty, t.unit) }, { key: "reason", label: "Reason" }, { key: "status", label: "Status", render: (t) => UI.status(t.status) }],
        toolbar: `<button class="btn btn-sm btn-primary" data-tool="add">+ Record Return</button>`, onTool: { add: () => openReturnForm(null) },
        actions: () => UI.act("issue", "View issue"), onAction: { issue: (t) => window.IssueUI.viewIssue(S().db.txns.find((x) => x.id === t.issueId)) }
      });
    }
  });

  /* ---------------- Low stock / reorder ---------------- */
  R.register({
    id: "low-stock", title: "Low Stock / Reorder Alert",
    intro: "Active grades at or below the reorder level or below minimum stock.",
    render(el) {
      const rows = stockRows().filter((r) => r.g.status === "Active");
      const alerts = rows.filter((r) => ["CRITICAL", "OUT", "REORDER"].includes(r.status.key));
      el.innerHTML = `${UI.kpis([{ label: "Out of stock", value: alerts.filter((r) => r.status.key === "OUT").length, cls: "danger" }, { label: "Below minimum", value: alerts.filter((r) => r.status.key === "CRITICAL").length, cls: "danger" },
        { label: "At reorder level", value: alerts.filter((r) => r.status.key === "REORDER").length, cls: "warning" }, { label: "Levels pending", value: rows.filter((r) => r.status.key === "UNDEFINED").length, cls: "neutral", link: "oil-master" }])}
        ${UI.callout("illus", "Levels are ILLUSTRATIVE (50% / 100% of average FY-27 monthly consumption). Edit them in Oil / Grease Master. Final levels to be agreed with the plant.")}
        <div class="card" id="lsTable"></div>`;
      UI.table(el.querySelector("#lsTable"), {
        id: "lowstock", exportName: "reorder_list", rows: alerts, emptyTitle: "No grades below reorder level", empty: "All active grades are above their reorder levels.",
        columns: [{ key: "g", label: "Grade", sortVal: (r) => r.g.name, render: (r) => `<strong>${U.esc(r.g.name)}</strong>`, csv: (r) => r.g.name }, { key: "closing", label: "Available", num: true, render: (r) => U.fmtQty(r.closing, r.g.unit) },
          { key: "min", label: "Minimum", num: true, render: (r) => U.fmt(r.g.minStock), csv: (r) => r.g.minStock }, { key: "rol", label: "Reorder level", num: true, render: (r) => U.fmt(r.g.reorderLevel), csv: (r) => r.g.reorderLevel },
          { key: "short", label: "Suggested order qty", num: true, sortVal: (r) => r.g.reorderLevel * 2 - r.closing, render: (r) => U.fmtQty(Math.max(0, Math.ceil(r.g.reorderLevel * 2 - r.closing)), r.g.unit), csv: (r) => Math.max(0, Math.ceil(r.g.reorderLevel * 2 - r.closing)) },
          { key: "status", label: "Status", render: (r) => UI.badge(r.status.label, r.status.cls), csv: (r) => r.status.label }],
        actions: () => UI.act("rcv", "Raise receipt", "btn-xs btn-primary") + UI.act("edit", "Edit levels"),
        onAction: { rcv: (r) => window.ReceiptUI.openReceiptForm(null, { materialType: r.g.type, gradeId: r.g.id, unit: r.g.unit }), edit: () => R.go("oil-master") },
        rowClass: (r) => (r.status.cls === "danger" ? "row-danger" : "row-warning")
      });
    }
  });

  /* ---------------- Stock Reports ---------------- */
  R.register({
    id: "stock-reports", title: "Stock Reports",
    intro: "Stock summary, receipt register, issue register (department-wise) and adjustment log with period filters and export.",
    render(el) {
      const st = S();
      const host = document.createElement("div"); el.appendChild(host);
      UI.tabs(host, [
        { id: "summary", label: "Stock summary", render: (b) => { b.innerHTML = '<div class="card" id="t"></div>';
          UI.table(b.querySelector("#t"), { id: "rep-stock", exportName: "stock_summary", pageSize: 50, rows: () => stockRows(st.goLive(), st.today()).filter((r) => r.g.status === "Active"),
            filters: [{ key: "type", label: "Material", options: ["Oil", "Grease"], value: (r) => r.g.type }],
            columns: [{ key: "g", label: "Grade", sortVal: (r) => r.g.name, render: (r) => U.esc(r.g.name), csv: (r) => r.g.name }, { key: "u", label: "Unit", render: (r) => r.g.unit, csv: (r) => r.g.unit },
              ...["opening", "receipts", "returns", "issues", "adjustments", "closing", "consumption"].map((k) => ({ key: k, label: k[0].toUpperCase() + k.slice(1), num: true, render: (r) => U.fmt(r[k]) })),
              { key: "value", label: "Value", num: true, render: (r) => U.fmtMoney(r.value) }],
            footer: (rs) => totalsFoot(rs, [null, "opening", "receipts", "returns", "issues", "adjustments", "closing", "consumption", "value"]) }); } },
        { id: "receipts", label: "Receipt register", render: (b) => { b.innerHTML = '<div class="card" id="t"></div>';
          UI.table(b.querySelector("#t"), { id: "rep-rcp", exportName: "receipt_register", dateKey: "date", rows: () => st.db.txns.filter((t) => t.type === "RECEIPT"),
            filters: [{ key: "status", label: "Status", options: ["DRAFT", "SUBMITTED", "CONFIRMED", "CANCELLED"] }],
            columns: [{ key: "no", label: "No." }, { key: "date", label: "Date", render: (t) => U.fmtDate(t.date) }, { key: "g", label: "Grade", render: (t) => U.esc(st.gradeName(t.gradeId)) }, { key: "qty", label: "Qty", num: true, render: (t) => U.fmtQty(t.qty, t.unit) }, { key: "batch", label: "Batch" }, { key: "invoice", label: "Invoice" }, { key: "status", label: "Status" }] }); } },
        { id: "issues", label: "Issue register (department-wise)", render: (b) => {
          const iss = st.issues().filter((i) => i.status === "ISSUED");
          const byDept = C.totalsBy(iss, (i) => i.dept + " | " + st.unitOf(i.gradeId));
          b.innerHTML = `${UI.card({ title: "Issued quantity by department", body: UI.barList(byDept.slice(0, 12).map((x) => ({ label: x.key.split(" | ")[0], value: x.qty, display: `${U.fmt(x.qty)} ${x.key.split(" | ")[1]}` })), "") })}<div class="card mt-2" id="t"></div>`;
          UI.table(b.querySelector("#t"), { id: "rep-iss", exportName: "issue_register", dateKey: "date", rows: () => st.issues(),
            filters: [{ key: "dept", label: "Department", options: () => U.uniq(st.issues().map((i) => i.dept)).sort() }, { key: "gradeId", label: "Grade", options: () => U.uniq(st.issues().map((i) => i.gradeId)).map((g) => ({ value: g, label: st.gradeName(g) })) }],
            columns: [{ key: "no", label: "No." }, { key: "date", label: "Date", render: (t) => U.fmtDate(t.date) }, { key: "dept", label: "Department" }, { key: "equipment", label: "Equipment" }, { key: "g", label: "Grade", render: (t) => U.esc(st.gradeName(t.gradeId)) }, { key: "qty", label: "Qty", num: true, render: (t) => U.fmtQty(t.qty, t.unit) }, { key: "status", label: "Status" }] }); } },
        { id: "adj", label: "Adjustment log", render: (b) => { b.innerHTML = '<div class="card" id="t"></div>';
          UI.table(b.querySelector("#t"), { id: "rep-adj", exportName: "adjustment_log", dateKey: "date", rows: () => st.db.txns.filter((t) => t.type === "ADJUSTMENT"), empty: "No adjustments recorded yet.",
            columns: [{ key: "no", label: "No." }, { key: "date", label: "Date", render: (t) => U.fmtDate(t.date) }, { key: "g", label: "Grade", render: (t) => U.esc(st.gradeName(t.gradeId)) }, { key: "qty", label: "Qty ±", num: true }, { key: "reason", label: "Reason" }, { key: "createdBy", label: "Requested by" }, { key: "approvedBy", label: "Approved by" }, { key: "status", label: "Status" }] }); } }
      ], "stockreports");
    }
  });

  window.InventoryUI = { openReturnForm, openAdjustmentForm, stockRows };
})();
