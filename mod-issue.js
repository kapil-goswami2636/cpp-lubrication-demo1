/* =========================================================
   modules/issue.js — Stock Issue from Lube Oil Cell
   Request → stock validation → (optional approval) → issue
   Issue quantity can never exceed available stock.
   ========================================================= */
(function () {
  "use strict";
  const U = window.U, UI = window.UI, R = window.Router, M = window.Mod, N = window.Notify;
  const S = () => window.State;

  /** validateStockAvailability — used live in the form and again in State.createIssue. */
  const validateStockAvailability = (gradeId, qty) => {
    if (!gradeId) return null;
    const avail = S().available(gradeId), unit = S().unitOf(gradeId);
    if (+qty > avail + 1e-9) return `Insufficient stock — available ${U.fmt(avail)} ${unit}`;
    return null;
  };

  function openIssueForm(prefill = {}) {
    const approval = S().db.settings.issueApproval;
    const req = prefill.requestId ? S().db.requests.find((r) => r.id === prefill.requestId) : null;
    const fields = [
      ...(req ? [{ type: "note", label: `Issuing against request ${req.no} — ${req.equipment || req.dept}, ${U.fmt(req.qty)} ${req.unit} (${req.reason}). The request closes automatically when the oil is issued.` }] : []),
      { name: "date", label: "Issue Date", type: "date", required: true, notFuture: true },
      { name: "dept", label: "Department", type: "select", required: true, options: () => M.deptOptions() },
      M.eqField("equipment", "Equipment (if booked to equipment)", false),
      { name: "materialType", label: "Material Type", type: "select", options: ["Oil", "Grease"], placeholder: "All" },
      { name: "gradeId", label: "Oil / Grease Grade", type: "select", required: true, options: (v) => M.gradeOptions(v.materialType || undefined, true) },
      { name: "available", label: "Available Stock", type: "readonly" },
      { name: "requestedQty", label: "Requested Quantity", type: "number", required: true, gt: 0 },
      { name: "qty", label: "Issued Quantity", type: "number", required: true, gt: 0, custom: (v, all) => validateStockAvailability(all.gradeId, v) || (all.requestedQty && +v > +all.requestedQty ? "Issued quantity cannot exceed the requested quantity" : null) },
      { name: "unit", label: "Unit", type: "readonly" },
      { name: "issuedBy", label: "Issued By", type: "readonly" },
      { name: "remarks", label: "Remarks / Purpose", type: "textarea", span: "span-2" },
      { type: "note", cls: approval ? "warn" : "", label: approval ? "Approval is ON (Demo Settings): the issue will wait for Shift Engineer / In-charge approval before stock is deducted." : "Approval is OFF (Demo Settings): stock is deducted immediately on issue. Whether approval is mandatory is pending client confirmation (Q4)." }
    ];
    UI.formModal({
      title: "New Stock Issue", size: "lg", fields, values: { date: M.today(), issuedBy: S().user().name, ...prefill }, submitLabel: approval ? "Submit for approval" : "Issue stock",
      intro: M.roleNote("issue.create", "issue stock"),
      onChange: (name, v, m) => {
        if (name === "materialType") return { rerender: true, values: { gradeId: "", available: "", unit: "" } };
        if (name === "equipment" && v.equipment) {
          const e = M.eqFromInput(v.equipment);
          if (e && e.gradeId && !v.gradeId) return { rerender: true, values: { gradeId: e.gradeId, materialType: "", available: `${U.fmt(S().available(e.gradeId))} ${S().unitOf(e.gradeId)}`, unit: S().unitOf(e.gradeId) } };
        }
        if (name === "gradeId" || name === null || name === "qty") {
          const set = (n, val) => { const x = m.body.querySelector(`[name="${n}"]`); if (x) x.value = val; };
          if (v.gradeId) { set("available", `${U.fmt(S().available(v.gradeId))} ${S().unitOf(v.gradeId)}`); set("unit", S().unitOf(v.gradeId)); }
          const err = validateStockAvailability(v.gradeId, v.qty);
          UI.showErrors(m.body, err ? { qty: err } : {});
        }
        return null;
      },
      onSubmit: (v) => {
        const e = M.eqFromInput(v.equipment);
        return S().createIssue({ ...v, requestId: req ? req.id : null, equipmentId: e ? e.id : null, equipmentName: e ? e.name : v.equipment || null, area: e ? e.area : null });
      },
      successTitle: (r) => (r.record.status === "ISSUED" ? "Stock issued" : "Issue submitted for approval"),
      successText: (r) => (r.record.status === "ISSUED" ? `${r.record.no}: ${S().gradeName(r.record.gradeId)} ${U.fmt(r.before)} → ${U.fmt(r.after)} ${r.record.unit}` : `${r.record.no} — stock not deducted until approved`)
    });
  }

  function viewIssue(i) {
    const b = S().issueBalance(i);
    const linked = S().db.txns.filter((t) => t.issueId === i.id);
    UI.modal({ title: `Issue ${i.no}`, size: "lg", body: `<div class="split"><table class="kv">
        <tr><th>Status</th><td>${UI.status(i.status)}</td></tr><tr><th>Date</th><td>${U.fmtDate(i.date)}</td></tr><tr><th>Department</th><td>${U.esc(i.dept || "—")}</td></tr>
        <tr><th>Equipment</th><td>${U.esc(i.equipment || "—")}</td></tr><tr><th>Grade</th><td>${U.esc(S().gradeName(i.gradeId))}</td></tr>
        <tr><th>Requested / Issued</th><td>${U.fmt(i.requestedQty)} / <strong>${U.fmtQty(i.qty, i.unit)}</strong></td></tr><tr><th>Issued by</th><td>${U.esc(i.issuedBy || "—")}</td></tr>
        <tr><th>Remarks</th><td>${U.esc(i.remarks || "—")}</td></tr>${i.source ? `<tr><th>Source</th><td>${UI.src(i.source)}</td></tr>` : ""}</table>
        <div><h3>Issue reconciliation</h3><table class="kv"><tr><th>Issued</th><td class="num">${U.fmtQty(b.issued, i.unit)}</td></tr><tr><th>− Consumed</th><td class="num">${U.fmtQty(b.consumed, i.unit)}</td></tr>
        <tr><th>− Returned</th><td class="num">${U.fmtQty(b.returned, i.unit)}</td></tr><tr><th>= Open balance</th><td class="num"><strong>${U.fmtQty(b.open, i.unit)}</strong> ${b.reconciled ? UI.badge("Reconciled", "success") : b.issued ? UI.badge("Open", "warning") : ""}</td></tr></table>
        <p class="small muted">Stock was deducted once at issue. Consumption does not deduct again; returns add the unused balance back.</p></div></div>
        <h3 class="mt-2">Linked transactions</h3>${linked.length ? `<table class="data compact"><thead><tr><th>No.</th><th>Type</th><th>Date</th><th>Equipment</th><th class="num">Qty</th><th>Status</th></tr></thead><tbody>${linked.map((t) => `<tr><td class="mono">${U.esc(t.no)}</td><td>${t.type}</td><td>${U.fmtDate(t.date)}</td><td>${U.esc(t.equipment || "—")}</td><td class="num">${U.fmtQty(t.qty, t.unit)}</td><td>${UI.status(t.status)}</td></tr>`).join("")}</tbody></table>` : '<div class="empty">No consumption or return recorded yet.</div>'}`,
      buttons: [
        ...(i.status === "ISSUED" && b.open > 0 ? [{ label: "Record consumption", act: "cons", cls: "btn-primary", left: true }, { label: "Return balance", act: "ret", left: true }] : []),
        ...(i.status === "PENDING_APPROVAL" ? [{ label: "Approve", act: "approve", cls: "btn-success", left: true }, { label: "Reject", act: "reject", cls: "btn-danger-ghost", left: true }] : []),
        { label: "Close", close: true, cls: "btn-ghost" }],
      onAction: (a, m) => {
        m.close();
        if (a === "cons") window.ConsumptionUI.recordConsumption(i);
        if (a === "ret") window.InventoryUI.openReturnForm(i);
        if (a === "approve" || a === "reject") N.result(S().approveIssue(i.id, a === "approve"), a === "approve" ? "Issue approved — stock deducted" : "Issue rejected", i.no);
      } });
  }

  R.register({
    id: "stock-issue", title: "Stock Issue",
    intro: "Steps 3–4: a department requests oil (low level or replacement) and the Lube Oil Cell issues it. Department-wise and equipment-wise issue tracking.",
    render(el, params) {
      const st = S(), issues = () => st.issues().slice().reverse();
      const open = st.openIssues();
      el.innerHTML = `
        ${UI.flow([{ t: "Request", d: "Department / equipment need", link: "oil-requests" }, { t: "Stock validation", d: "Issued ≤ available", cls: "system" }, { t: "Approval (if enabled)", d: `Currently <strong>${st.db.settings.issueApproval ? "ON" : "OFF"}</strong> — <a href="#/settings">change</a>`, cls: "decision" },
          { t: "Issue confirmation", d: "Stock − issued qty", cls: "system" }, { t: "Stock ledger", cls: "output", link: "stock-ledger" }, { t: "Consumption / return", d: "Against this issue", cls: "special", link: "consumption" }])}
        <div class="mt-2">${UI.kpis([
          { label: "Issues", value: st.issues().length, sub: `${st.issues().filter((i) => i.source).length} seeded from ${U.monthLabel(st.src.inventory.latestMonth)} MIS` },
          { label: "Pending approval", value: st.issues().filter((i) => i.status === "PENDING_APPROVAL").length, cls: "warning" },
          { label: "Open (unreconciled) issues", value: open.length, sub: `${U.fmt(U.sum(open, (x) => x.bal.open))} open qty`, cls: open.length ? "info" : "success", link: "consumption" },
          { label: "Rejected", value: st.issues().filter((i) => i.status === "REJECTED").length, cls: "neutral" }
        ])}</div>
        <div class="card mb-2"><div class="card-head"><div><h3>Open requests from departments</h3><div class="small muted">Process step 3 → 4: issue oil against a request</div></div><button class="btn btn-sm" data-nav="oil-requests">All requests ›</button></div><div id="rqOpen"></div></div>
        <div class="card" id="isTable"></div>`;
      UI.table(el.querySelector("#rqOpen"), { id: "rqopen", pageSize: 5, rows: () => S().db.requests.filter((r) => r.status === "OPEN").slice().reverse(),
        emptyTitle: "No open requests", empty: "Requests raised under Issue Management › Raise Request appear here.",
        columns: [{ key: "no", label: "Request", render: (r) => `<span class="mono">${r.no}</span>` }, { key: "date", label: "Date", render: (r) => U.fmtDate(r.date) }, { key: "eq", label: "Equipment / Dept", render: (r) => U.esc(r.equipment || r.dept) },
          { key: "g", label: "Grade", render: (r) => U.esc(S().gradeName(r.gradeId)) }, { key: "qty", label: "Asked", num: true, render: (r) => U.fmtQty(r.qty, r.unit) },
          { key: "av", label: "In stock", num: true, render: (r) => { const a = S().available(r.gradeId); return `<span class="${a >= r.qty ? "text-success" : "text-danger"}">${U.fmt(a)}</span>`; } }, { key: "priority", label: "Priority" }],
        actions: () => UI.act("iss", "Issue oil", "btn-xs btn-primary"), onAction: { iss: (r) => window.RequestUI.issueAgainst(r) } });
      UI.table(el.querySelector("#isTable"), {
        id: "issues", exportName: "issue_register", rows: issues, dateKey: "date", dateLabel: "Issue date",
        search: (i) => `${i.no} ${i.dept} ${i.equipment || ""} ${S().gradeName(i.gradeId)} ${i.remarks || ""}`,
        filters: [{ key: "status", label: "Status", options: ["ISSUED", "PENDING_APPROVAL", "REJECTED"] }, { key: "dept", label: "Department", options: () => U.uniq(S().issues().map((i) => i.dept)).sort() },
          { key: "gradeId", label: "Grade", options: () => U.uniq(S().issues().map((i) => i.gradeId)).map((g) => ({ value: g, label: S().gradeName(g) })) },
          { key: "rec", label: "Reconciliation", options: ["Open", "Reconciled"], value: (i) => (S().issueBalance(i).reconciled ? "Reconciled" : "Open") }],
        columns: [{ key: "no", label: "Issue No.", render: (i) => `<span class="mono">${U.esc(i.no)}</span>` }, { key: "date", label: "Date", render: (i) => U.fmtDate(i.date) },
          { key: "dept", label: "Department", render: (i) => `<span class="small">${U.esc(i.dept)}</span>` }, { key: "equipment", label: "Equipment", render: (i) => U.esc(i.equipment || "—") },
          { key: "grade", label: "Grade", sortVal: (i) => S().gradeName(i.gradeId), render: (i) => U.esc(S().gradeName(i.gradeId)) },
          { key: "qty", label: "Issued", num: true, render: (i) => U.fmtQty(i.qty, i.unit) },
          { key: "open", label: "Open bal.", num: true, sortVal: (i) => S().issueBalance(i).open, render: (i) => { const b = S().issueBalance(i); return i.status === "ISSUED" ? (b.open > 0 ? `<strong>${U.fmt(b.open)}</strong>` : "0") : "—"; }, csv: (i) => S().issueBalance(i).open },
          { key: "status", label: "Status", render: (i) => UI.status(i.status) }],
        toolbar: `<button class="btn btn-sm btn-primary" data-tool="add">+ New Issue</button>`, onTool: { add: () => openIssueForm() },
        actions: (i) => UI.act("view", "View") + (i.status === "ISSUED" && S().issueBalance(i).open > 0 ? UI.act("cons", "Consumption") + UI.act("ret", "Return", "btn-xs btn-ghost") : "") + (i.status === "PENDING_APPROVAL" ? UI.act("approve", "Approve", "btn-xs btn-success") + UI.act("reject", "Reject", "btn-xs btn-danger-ghost") : ""),
        onAction: { view: viewIssue, cons: (i) => window.ConsumptionUI.recordConsumption(i), ret: (i) => window.InventoryUI.openReturnForm(i),
          approve: (i) => N.result(S().approveIssue(i.id, true), "Issue approved — stock deducted", i.no), reject: (i) => N.result(S().approveIssue(i.id, false), "Issue rejected", i.no) },
        rowClass: (i) => (i.status === "PENDING_APPROVAL" ? "row-warning" : i.status === "REJECTED" ? "row-danger" : "")
      });
      if (R.consume(params, "new")) setTimeout(() => openIssueForm(), 0);
    }
  });
  window.IssueUI = { openIssueForm, viewIssue };
})();
