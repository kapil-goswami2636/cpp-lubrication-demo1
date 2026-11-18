/* =========================================================
   modules/requests.js — Raise Request
   A user department calls the Lube Oil Cell (oil level low /
   replacement due). The request is then issued from Issue Oil,
   which closes it automatically.
   ========================================================= */
(function () {
  "use strict";
  const U = window.U, UI = window.UI, R = window.Router, M = window.Mod;
  const S = () => window.State;

  function openRequestForm(prefill = {}) {
    UI.formModal({
      title: "Raise oil request", size: "lg", intro: M.roleNote("issue.create", "raise requests"),
      fields: [{ name: "date", label: "Request date", type: "date", required: true, notFuture: true },
        { name: "dept", label: "Requesting department", type: "select", required: true, options: () => M.deptOptions() },
        M.eqField("equipment", "Equipment", true),
        { name: "gradeId", label: "Oil / grease grade", type: "select", required: true, options: () => M.gradeOptions(undefined, true), hint: "Filled from the equipment's recommended grade where known" },
        { name: "available", label: "Available in Lube Cell", type: "readonly" },
        { name: "qty", label: "Quantity required", type: "number", required: true, gt: 0 },
        { name: "reason", label: "Reason", type: "select", required: true, options: ["Oil level low (top-up)", "Oil replacement due", "Leakage", "Overhaul / PM work", "Other"] },
        { name: "priority", label: "Priority", type: "select", required: true, options: ["Normal", "Urgent"], placeholder: false },
        { name: "requestedBy", label: "Requested by (designation / phone ext.)" },
        { name: "remarks", label: "Remarks", type: "textarea", span: "span-2" }],
      values: { date: M.today(), priority: "Normal", ...prefill },
      onChange: (name, v, m) => {
        const set = (n, val) => { const x = m.body.querySelector(`[name="${n}"]`); if (x) x.value = val; };
        if (name === "equipment") {
          const e = M.eqFromInput(v.equipment);
          if (e && e.gradeId && S().grade(e.gradeId) && S().grade(e.gradeId).status === "Active") { set("gradeId", e.gradeId); v.gradeId = e.gradeId; }
        }
        set("available", v.gradeId ? `${U.fmt(S().available(v.gradeId))} ${S().unitOf(v.gradeId)}` : "");
        return null;
      },
      onSubmit: (v) => { const e = M.eqFromInput(v.equipment); return S().createRequest({ ...v, equipmentId: e ? e.id : null, equipmentName: e ? e.name : v.equipment, area: e ? e.area : null }); },
      submitLabel: "Raise request", successTitle: "Request raised",
      successText: (r) => `${r.record.no}: ${U.fmt(r.record.qty)} ${r.record.unit} for ${r.record.equipment}. ${r.available >= r.record.qty ? "Stock is available — ready to issue." : "Not enough stock — needs Stock In first."}`
    });
  }

  /** Open the Issue form pre-filled from a request (issue closes the request). */
  function issueAgainst(r) {
    const e = r.equipmentId ? S().eq(r.equipmentId) : null;
    const avail = S().available(r.gradeId);
    window.IssueUI.openIssueForm({ requestId: r.id, dept: r.dept, equipment: e ? M.eqLabel(e) : r.equipment, gradeId: r.gradeId,
      available: `${U.fmt(avail)} ${r.unit}`, unit: r.unit, requestedQty: r.qty, qty: Math.max(0, Math.min(r.qty, avail)), remarks: `Against ${r.no} — ${r.reason}` });
  }

  R.register({
    id: "oil-requests", title: "Raise Request",
    intro: "A user department calls the Lube Oil Cell when an equipment's oil level is low or oil replacement is due. The request is then issued from Issue Oil.",
    render(el) {
      const st = S(), rq = () => st.db.requests.slice().reverse();
      const n = (s) => st.db.requests.filter((r) => r.status === s).length;
      el.innerHTML = `${UI.flow([{ t: "Call from department", d: "Oil level low / replacement" }, { t: "Raise request", d: "Equipment, grade, quantity", cls: "system" }, { t: "Stock check", d: "Available vs required", cls: "decision" },
          { t: "Issue oil", d: "Against the request", cls: "system", link: "stock-issue" }, { t: "Request closed", d: "Linked to issue no.", cls: "output" }])}
        <div class="mt-2">${UI.kpis([{ label: "Open requests", value: n("OPEN"), cls: n("OPEN") ? "warning" : "success" }, { label: "Issued", value: n("ISSUED"), cls: "success" }, { label: "Cancelled", value: n("CANCELLED"), cls: "neutral" },
          { label: "Urgent & open", value: st.db.requests.filter((r) => r.status === "OPEN" && r.priority === "Urgent").length, cls: "danger" }])}</div>
        <div class="card" id="rqTable"></div>`;
      UI.table(el.querySelector("#rqTable"), {
        id: "requests", exportName: "oil_requests", rows: rq, dateKey: "date", search: (r) => `${r.no} ${r.equipment} ${r.dept} ${r.reason}`,
        emptyTitle: "No requests yet", empty: "Click “+ Raise Request” when a department calls for oil.",
        filters: [{ key: "status", label: "Status", options: ["OPEN", "ISSUED", "CANCELLED"] }, { key: "dept", label: "Department", options: () => U.uniq(st.db.requests.map((r) => r.dept)).sort() }, { key: "priority", label: "Priority", options: ["Normal", "Urgent"] }],
        columns: [{ key: "no", label: "Request No.", render: (r) => `<span class="mono">${r.no}</span>` }, { key: "date", label: "Date", render: (r) => U.fmtDate(r.date) }, { key: "dept", label: "Department", render: (r) => `<span class="small">${U.esc(r.dept)}</span>` },
          { key: "equipment", label: "Equipment", render: (r) => `<strong>${U.esc(r.equipment || "—")}</strong>` }, { key: "g", label: "Grade", render: (r) => U.esc(st.gradeName(r.gradeId)), csv: (r) => st.gradeName(r.gradeId) },
          { key: "qty", label: "Required", num: true, render: (r) => U.fmtQty(r.qty, r.unit) }, { key: "reason", label: "Reason" },
          { key: "priority", label: "Priority", render: (r) => (r.priority === "Urgent" ? UI.badge("Urgent", "danger") : "Normal") },
          { key: "status", label: "Status", render: (r) => UI.badge(r.status === "OPEN" ? "Open" : r.status === "ISSUED" ? "Issued" : "Cancelled", r.status === "OPEN" ? "warning" : r.status === "ISSUED" ? "success" : "") + (r.issueNo ? `<div class="small muted">${r.issueNo}</div>` : ""), csv: (r) => r.status }],
        toolbar: `<button class="btn btn-sm btn-primary" data-tool="add">+ Raise Request</button>`, onTool: { add: () => openRequestForm() },
        actions: (r) => (r.status === "OPEN" ? UI.act("iss", "Issue oil", "btn-xs btn-primary") + UI.act("cancel", "Cancel", "btn-xs btn-danger-ghost") : r.issueId ? UI.act("view", "View issue") : ""),
        onAction: { iss: issueAgainst, view: (r) => window.IssueUI.viewIssue(st.db.txns.find((t) => t.id === r.issueId)),
          cancel: (r) => UI.formModal({ title: `Cancel ${r.no}`, fields: [{ name: "reason", label: "Reason for cancelling", type: "textarea", required: true, span: "span-2" }], onSubmit: (v) => S().cancelRequest(r.id, v.reason), successTitle: "Request cancelled" }) },
        rowClass: (r) => (r.status === "OPEN" ? (r.priority === "Urgent" ? "row-danger" : "row-warning") : "")
      });
    }
  });

  window.RequestUI = { openRequestForm, issueAgainst };
})();
