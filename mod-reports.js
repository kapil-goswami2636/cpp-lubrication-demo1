/* =========================================================
   modules/reports.js — Reports & Analytics (9 standard reports)
   Every report: date range + relevant filters + CSV/Excel/PDF.
   ========================================================= */
(function () {
  "use strict";
  const U = window.U, UI = window.UI, R = window.Router, C = window.Calc, M = window.Mod;
  const S = () => window.State;
  const areaF = (rows) => ({ key: "area", label: "Area", options: () => U.uniq(rows().map((r) => r.area)).sort() });
  const gradeF = (rows) => ({ key: "gradeId", label: "Grade", options: () => U.uniq(rows().map((r) => r.gradeId)).map((g) => ({ value: g, label: S().gradeName(g) })) });

  const REPORTS = [
    { id: "stock", t: "Stock Summary", d: "Grade-wise opening, receipts, returns, issues, adjustments, closing and value.", cfg: () => {
      const rows = () => window.InventoryUI.stockRows(S().goLive(), S().today()).filter((r) => r.g.status === "Active").map((r) => ({ ...r, grade: r.g.name, unit: r.g.unit, type: r.g.type }));
      return { rows, search: (r) => r.grade, filters: [{ key: "type", label: "Material", options: ["Oil", "Grease"] }],
        columns: [{ key: "grade", label: "Grade" }, { key: "unit", label: "Unit" }, ...["opening", "receipts", "returns", "issues", "adjustments", "closing", "consumption"].map((k) => ({ key: k, label: k[0].toUpperCase() + k.slice(1), num: true, render: (r) => U.fmt(r[k]) })), { key: "value", label: "Value", num: true, render: (r) => U.fmtMoney(r.value) }, { key: "st", label: "Status", render: (r) => UI.badge(r.status.label, r.status.cls), csv: (r) => r.status.label }] }; } },
    { id: "consumption", t: "Consumption Report", d: "Equipment-wise oil / grease consumption with area, grade, activity and date filters.", cfg: () => {
      const rows = () => M.consumptionRecords();
      return { rows, dateKey: "date", search: (r) => `${r.equipment} ${r.reason}`, filters: [areaF(rows), gradeF(rows), { key: "activity", label: "Activity", options: () => U.uniq(rows().map((r) => r.activity)) }, { key: "unit", label: "Material", options: [{ value: "L", label: "Oil" }, { value: "kg", label: "Grease" }] }],
        columns: [{ key: "date", label: "Date", render: (r) => U.fmtDate(r.date) }, { key: "equipment", label: "Equipment" }, { key: "area", label: "Area" }, { key: "grade", label: "Grade", render: (r) => U.esc(r.gradeId ? S().gradeName(r.gradeId) : r.grade) }, { key: "activity", label: "Activity" }, { key: "qty", label: "Qty", num: true, render: (r) => U.fmtQty(r.qty, r.unit) }, { key: "reason", label: "Reason" }, { key: "origin", label: "Origin" }],
        footer: (rs) => ["L", "kg"].map((u) => { const x = rs.filter((r) => r.unit === u); return x.length ? `<tr><td colspan="5">Total ${u}</td><td class="num">${U.fmt(U.sum(x, (r) => r.qty))}</td><td colspan="2"></td></tr>` : ""; }).join("") }; } },
    { id: "scrap", t: "Scrap Oil Report", d: "Scrap generation, storage transfers and disposal dispatches (source + system).", cfg: () => {
      const st = S();
      const rows = () => [...st.db.scrapGen.map((r) => ({ date: r.date, stage: "Generation", ref: r.no, desc: `${r.equipment} — ${r.activity}`, drums: r.drums, qty: r.qty, fy: U.fyOf(r.date), origin: r.illustrative ? "Illustrative" : "System" })),
        ...st.db.scrapTransfers.map((r) => ({ date: r.date, stage: "Transfer to storage", ref: r.no, desc: r.location, drums: r.drums, qty: r.qty, fy: U.fyOf(r.date), origin: "System" })),
        ...st.scrap().sourceDispatches.map((r) => ({ date: r.date, stage: "Dispatch to disposal yard", ref: r.no, desc: r.description, drums: r.drums, qty: r.qty, fy: r.fy, origin: "Source" })),
        ...st.db.scrapDispatch.map((r) => ({ date: r.date, stage: "Dispatch to disposal yard", ref: r.no, desc: r.description, drums: r.drums, qty: r.qty, fy: r.fy, origin: "System" }))].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      return { rows, dateKey: "date", search: (r) => r.desc, filters: [{ key: "stage", label: "Stage", options: ["Generation", "Transfer to storage", "Dispatch to disposal yard"] }, { key: "fy", label: "FY", options: () => U.uniq(rows().map((r) => r.fy)).sort() }, { key: "origin", label: "Origin", options: ["Source", "System", "Illustrative"] }],
        columns: [{ key: "date", label: "Date", render: (r) => U.fmtDate(r.date) }, { key: "fy", label: "FY" }, { key: "stage", label: "Stage" }, { key: "ref", label: "Ref." }, { key: "desc", label: "Description" }, { key: "drums", label: "Drums", num: true }, { key: "qty", label: "Qty (L)", num: true, render: (r) => U.fmt(r.qty) }, { key: "origin", label: "Origin" }],
        footer: (rs) => `<tr><td colspan="5">Total (filtered)</td><td class="num">${U.fmt(U.sum(rs, (r) => r.drums))}</td><td class="num">${U.fmt(U.sum(rs, (r) => r.qty))}</td><td></td></tr>` }; } },
    { id: "issues", t: "Issue Register", d: "All stock issues with department, equipment, grade and reconciliation status.", cfg: () => {
      const rows = () => S().issues().map((i) => ({ ...i, bal: S().issueBalance(i) }));
      return { rows, dateKey: "date", search: (i) => `${i.no} ${i.equipment || ""}`, filters: [{ key: "dept", label: "Department", options: () => U.uniq(rows().map((r) => r.dept)).sort() }, areaF(rows), gradeF(rows), { key: "status", label: "Status", options: ["ISSUED", "PENDING_APPROVAL", "REJECTED"] }],
        columns: [{ key: "no", label: "Issue No." }, { key: "date", label: "Date", render: (i) => U.fmtDate(i.date) }, { key: "dept", label: "Department" }, { key: "equipment", label: "Equipment" }, { key: "g", label: "Grade", render: (i) => U.esc(S().gradeName(i.gradeId)) },
          { key: "qty", label: "Issued", num: true, render: (i) => U.fmtQty(i.qty, i.unit) }, { key: "c", label: "Consumed", num: true, render: (i) => U.fmt(i.bal.consumed), csv: (i) => i.bal.consumed }, { key: "r", label: "Returned", num: true, render: (i) => U.fmt(i.bal.returned), csv: (i) => i.bal.returned }, { key: "o", label: "Open", num: true, render: (i) => U.fmt(i.bal.open), csv: (i) => i.bal.open }, { key: "status", label: "Status" }] }; } },
    { id: "adjust", t: "Adjustment Log", d: "Stock adjustments with reason, requester, approver and status.", cfg: () => ({ rows: () => S().db.txns.filter((t) => t.type === "ADJUSTMENT"), dateKey: "date", filters: [{ key: "status", label: "Status", options: ["PENDING_APPROVAL", "APPROVED", "REJECTED"] }], empty: "No adjustments recorded yet — use Stock Adjustment.",
      columns: [{ key: "no", label: "No." }, { key: "date", label: "Date", render: (t) => U.fmtDate(t.date) }, { key: "g", label: "Grade", render: (t) => U.esc(S().gradeName(t.gradeId)) }, { key: "qty", label: "Qty ±", num: true }, { key: "unit", label: "Unit" }, { key: "reason", label: "Reason" }, { key: "createdBy", label: "Requested by" }, { key: "approvedBy", label: "Approved by" }, { key: "status", label: "Status" }] }) },
    { id: "eqhist", t: "Equipment-wise History", d: "Top-up history (since Apr'23) and FY-27 consumption for one or more equipment.", cfg: () => {
      const rows = () => [...window.ConsumptionUI.topupRows().map((r) => ({ date: r.date, equipment: r.equipment + (r.group ? ` (${r.group})` : ""), area: r.area, grade: r.grade, activity: r.activity || "Top-up / replacement", qty: r.qty, unit: "L", origin: "Top-up history" })),
        ...M.consumptionRecords().map((r) => ({ date: r.date, equipment: r.equipment, area: r.area, grade: r.gradeId ? S().gradeName(r.gradeId) : r.grade, activity: r.activity, qty: r.qty, unit: r.unit, origin: "Consumption " + r.origin }))];
      return { rows, dateKey: "date", search: (r) => r.equipment, searchPlaceholder: "Type equipment name (e.g. MOT-1, BFP-1A)…", filters: [areaF(rows), { key: "origin", label: "Source", options: () => U.uniq(rows().map((r) => r.origin)) }],
        columns: [{ key: "date", label: "Date", render: (r) => U.fmtDate(r.date) }, { key: "equipment", label: "Equipment" }, { key: "area", label: "Area" }, { key: "grade", label: "Grade" }, { key: "activity", label: "Activity" }, { key: "qty", label: "Qty", num: true, render: (r) => U.fmtQty(r.qty, r.unit) }, { key: "origin", label: "Source" }] }; } },
    { id: "greasing", t: "Greasing Compliance", d: "Motor-wise last greasing, next due and compliance status.", cfg: () => {
      const rows = () => S().motors().map((m) => ({ ...m, s: S().motorStatus(m) }));
      return { rows, search: (m) => m.name, filters: [{ key: "sheet", label: "Sheet", options: S().src.greasing.sheets }, { key: "c", label: "Compliance", options: ["Compliant", "Overdue", "Excluded"], value: (m) => (m.s.excluded ? "Excluded" : m.s.compliant ? "Compliant" : "Overdue") }],
        columns: [{ key: "name", label: "Motor" }, { key: "sheet", label: "Sheet" }, { key: "f", label: "Freq (d)", num: true, render: (m) => m.s.freqDays, csv: (m) => m.s.freqDays }, { key: "l", label: "Last", render: (m) => U.fmtDate(m.s.last), csv: (m) => m.s.last }, { key: "n", label: "Next due", render: (m) => U.fmtDate(m.s.nextDue), csv: (m) => m.s.nextDue }, { key: "c", label: "Status", render: (m) => UI.badge(m.s.excluded ? "Excluded" : m.s.compliant ? "Compliant" : "Overdue", m.s.compliant ? "success" : "danger"), csv: (m) => (m.s.excluded ? "Excluded" : m.s.compliant ? "Compliant" : "Overdue") }],
        footer: (rs) => { const c = C.compliance(rs.map((m) => m.s)); return `<tr><td colspan="5">Compliance (filtered): ${c.compliant}/${c.eligible}</td><td>${U.pct(c.pct)}</td></tr>`; } }; } },
    { id: "sampling", t: "Sampling Compliance", d: "Sampling point-wise last sample, next due and compliance status.", cfg: () => {
      const rows = () => S().samplingPoints().map((p) => ({ ...p, s: S().samplingStatus(p) }));
      return { rows, search: (p) => p.equipment, filters: [{ key: "sheet", label: "Sheet", options: S().src.sampling.sheets.filter((x) => !/special/i.test(x)) }, areaF(rows), { key: "c", label: "Compliance", options: ["Compliant", "Overdue"], value: (p) => (p.s.compliant ? "Compliant" : "Overdue") }],
        columns: [{ key: "equipment", label: "Equipment" }, { key: "sheet", label: "Sheet" }, { key: "area", label: "Area" }, { key: "frequency", label: "Frequency" }, { key: "l", label: "Last sample", render: (p) => U.fmtDate(p.s.last), csv: (p) => p.s.last }, { key: "n", label: "Next due", render: (p) => U.fmtDate(p.s.nextDue), csv: (p) => p.s.nextDue }, { key: "c", label: "Status", render: (p) => UI.badge(p.s.compliant ? "Compliant" : "Overdue", p.s.compliant ? "success" : "danger"), csv: (p) => (p.s.compliant ? "Compliant" : "Overdue") }],
        footer: (rs) => { const c = C.compliance(rs.map((p) => p.s)); return `<tr><td colspan="6">Compliance (filtered): ${c.compliant}/${c.eligible}</td><td>${U.pct(c.pct)}</td></tr>`; } }; } },
    { id: "filtration", t: "Filtration History", d: "Completed filtration dates from the source schedule plus work recorded in the system.", cfg: () => {
      const st = S();
      const rows = () => [...st.src.filtration.records.map((r) => ({ date: r.date, equipment: r.equipment, sheet: r.sheet, machine: r.machine, status: r.date ? "Completed" : "Remark: " + r.remark, origin: "Source" })),
        ...st.db.filtration.map((f) => ({ date: f.date, equipment: f.equipment, sheet: f.sheet, machine: f.machine, status: f.status, origin: "System " + f.no }))].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      return { rows, dateKey: "date", search: (r) => `${r.equipment} ${r.machine}`, filters: [{ key: "sheet", label: "Sheet", options: st.src.filtration.sheets }],
        columns: [{ key: "date", label: "Date", render: (r) => U.fmtDate(r.date) }, { key: "equipment", label: "Equipment" }, { key: "sheet", label: "Sheet" }, { key: "machine", label: "Machine" }, { key: "status", label: "Status" }, { key: "origin", label: "Origin" }] }; } }
  ];

  // Only the reports of the Lube Oil Cell process flow (greasing / sampling / filtration are out of scope for now)
  const SHOWN = REPORTS.filter((r) => !["greasing", "sampling", "filtration"].includes(r.id));

  R.register({
    id: "reports", title: "MIS Reports",
    intro: "Stock summary, consumption, scrap oil, issue register, adjustment log and equipment history. Pick a report, filter it, and export to Excel, PDF or CSV.",
    render(el) {
      const cur = UI.tableState["rep:sel"] || "stock";
      const rep = SHOWN.find((r) => r.id === cur) || SHOWN[0];
      el.innerHTML = `<div class="report-layout"><div class="card"><div class="card-body" style="padding:8px">${SHOWN.map((r) => `<button class="btn ${r.id === rep.id ? "btn-primary" : "btn-ghost"} w-100 mb-1" style="justify-content:flex-start;white-space:normal;text-align:left" data-rep="${r.id}">${U.esc(r.t)}</button>`).join("")}
</div></div>
        <div><div class="card"><div class="card-head"><div><h3>${U.esc(rep.t)}</h3><div class="small muted">${U.esc(rep.d)}</div></div></div><div id="repT"></div></div></div></div>`;
      el.querySelectorAll("[data-rep]").forEach((b) => b.addEventListener("click", () => { UI.tableState["rep:sel"] = b.dataset.rep; R.render(); }));
      const cfg = rep.cfg();
      UI.table(el.querySelector("#repT"), { id: "report-" + rep.id, exportName: rep.t.toLowerCase().replace(/[^a-z0-9]+/g, "_"), pageSize: 25, ...cfg });
    }
  });
})();
