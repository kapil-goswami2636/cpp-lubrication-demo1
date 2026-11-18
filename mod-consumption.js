/* =========================================================
   modules/consumption.js — Equipment-wise Consumption entry,
   Consumption History, Oil Top-up History, Oil Replacement
   History, Consumption Reports
   ========================================================= */
(function () {
  "use strict";
  const U = window.U, UI = window.UI, R = window.Router, C = window.Calc, M = window.Mod, N = window.Notify;
  const S = () => window.State;
  const ACTIVITIES = ["Top-up", "Replacement", "Oil Change", "Oil Change + Top-up", "Other (subject to client confirmation)"];

  /** recordConsumption — consumption must be booked against an issue; excess needs an approved exception. */
  function recordConsumption(issue) {
    const open = S().openIssues();
    if (!open.length && !issue) { M.noOpenIssues("Consumption"); return; }
    const opts = () => S().openIssues().map((x) => ({ value: x.issue.id, label: `${x.issue.no} · ${x.issue.equipment || x.issue.dept} · ${S().gradeName(x.issue.gradeId)} · open ${U.fmt(x.bal.open)} ${x.issue.unit}` }));
    const issueOf = (id) => S().db.txns.find((t) => t.id === id);
    const pre = issue ? { issueId: issue.id, equipment: issue.equipmentId && S().eq(issue.equipmentId) ? M.eqLabel(S().eq(issue.equipmentId)) : (S().eqByName(issue.equipment || "") ? M.eqLabel(S().eqByName(issue.equipment)) : issue.equipment || "") } : {};
    UI.formModal({
      title: "Record equipment-wise consumption", size: "lg", intro: M.roleNote("consumption.create", "record consumption") + `<div class="stepper"><div class="st done">Select equipment</div><div class="st done">Oil grade (from issue)</div><div class="st current">Activity details</div><div class="st">Validate</div><div class="st">Save → history & reports</div></div>`,
      fields: [
        { name: "issueId", label: "Against stock issue", type: "select", required: true, options: opts, span: "span-2" },
        M.eqField("equipment", "Equipment", true),
        { name: "grade", label: "Oil grade (from issue)", type: "readonly" }, { name: "open", label: "Open issued balance", type: "readonly" },
        { name: "date", label: "Date", type: "date", required: true, notFuture: true },
        { name: "activity", label: "Activity type", type: "select", required: true, options: ACTIVITIES },
        { name: "changeQty", label: "Oil change quantity", type: "number", min: 0, default: 0 }, { name: "topupQty", label: "Top-up quantity", type: "number", min: 0, default: 0 },
        { name: "total", label: "Total consumption", type: "readonly" },
        { name: "reason", label: "Reason", type: "select", options: ["Low oil level", "Oil service life over", "Oil contamination / analysis abnormal", "Leakage", "Operational consumption (evaporation)", "Overhaul / PM", "Other"] },
        { name: "remarks", label: "Remarks", type: "textarea" },
        { name: "exceptionReason", label: "Exception reason (only if total exceeds open balance)", type: "textarea", hint: "Excess over the issued balance is held as PENDING EXCEPTION until In-charge approval." },
        { type: "note", name: "calc", label: "" }
      ],
      values: { date: M.today(), activity: "Top-up", changeQty: 0, topupQty: 0, ...pre },
      onChange: (name, v, m) => {
        const i = issueOf(v.issueId);
        const set = (n, val) => { const x = m.body.querySelector(`[name="${n}"]`); if (x) x.value = val; };
        if (name === "issueId" && i) { const e = i.equipmentId ? S().eq(i.equipmentId) : S().eqByName(i.equipment || ""); set("equipment", e ? M.eqLabel(e) : i.equipment || ""); }
        const b = i ? S().issueBalance(i) : null, total = U.round((+v.changeQty || 0) + (+v.topupQty || 0), 3);
        set("grade", i ? S().gradeName(i.gradeId) : ""); set("open", b ? `${U.fmt(b.open)} ${i.unit}` : ""); set("total", i ? `${U.fmt(total)} ${i.unit}` : U.fmt(total));
        const note = m.body.querySelector('[data-note="calc"]');
        if (note && b) {
          const left = U.round(b.open - total, 3);
          note.className = "form-note " + (left < 0 ? "danger" : "");
          note.innerHTML = left < 0 ? `Total ${U.fmt(total)} exceeds open balance ${U.fmt(b.open)} by ${U.fmt(-left)} ${i.unit}. Enter an exception reason to raise an exception for approval, or reduce the quantity.`
            : `After saving: issue ${i.no} open balance = ${U.fmt(left)} ${i.unit}. ${left > 0 ? "If this oil is not needed, return it via <strong>Stock Return</strong> (process step 6)." : "Issue will be fully reconciled."} Stock is <strong>not</strong> deducted again.`;
        }
        return null;
      },
      onSubmit: (v) => { const e = M.eqFromInput(v.equipment); return S().recordConsumption({ ...v, equipmentId: e ? e.id : null }); },
      successTitle: (r) => (r.exception ? "Exception raised for approval" : "Consumption recorded"),
      successText: (r) => `${r.record.no}: ${r.record.equipment} — ${r.record.activity} ${U.fmt(r.record.qty)} ${r.record.unit}. Equipment history and reports updated.`
    });
  }

  /* ---------------- Equipment-wise Consumption ---------------- */
  R.register({
    id: "consumption", title: "Equipment-wise Consumption",
    intro: "Step 5: record what each equipment actually consumed (oil change / top-up) against the stock issue. Updates equipment history, consumption history and reports.",
    render(el, params) {
      const st = S(), live = () => st.db.txns.filter((t) => t.type === "CONSUMPTION").slice().reverse();
      const open = st.openIssues(), pend = live().filter((t) => t.status === "PENDING_EXCEPTION");
      el.innerHTML = `
        ${UI.flow([{ t: "Select equipment" }, { t: "Select oil grade", d: "Taken from the issue" }, { t: "Enter activity details", d: "Oil change / top-up qty" }, { t: "Validate", d: "≤ open issued balance", cls: "decision" }, { t: "Save", cls: "system" }, { t: "Equipment history", cls: "output", link: "equipment" }, { t: "Reports", cls: "output", link: "consumption-reports" }])}
        <div class="mt-2">${UI.kpis([
          { label: "Open issues awaiting consumption", value: open.length, sub: `${U.fmt(U.sum(open, (x) => x.bal.open))} open qty`, cls: "info" },
          { label: "Consumption entries (ledger)", value: live().length, sub: `From ${U.monthLabel(st.src.inventory.latestMonth)} onward` },
          { label: "Pending exceptions", value: pend.length, cls: pend.length ? "warning" : "success" },
          { label: "FY-27 rows incl. source", value: U.fmt(M.consumptionRecords().filter((r) => U.fyOf(r.date) === "FY-27").length), link: "consumption-history" }
        ])}</div>
        <div class="grid grid-2">
          <div class="card"><div class="card-head"><h3>Open issues — book consumption</h3></div><div id="openTable"></div></div>
          <div class="card"><div class="card-head"><h3>Business rules</h3></div><div class="card-body small"><ul class="list-plain">
            <li>Consumption must reference an issue; quantity cannot exceed the issue's open balance (Issued − Consumed − Returned).</li>
            <li>Excess consumption is only accepted through an <strong>exception</strong> with a reason, approved by the In-charge.</li>
            <li>Consumption never changes stock (stock was deducted at issue). Unused balance → <a href="#/stock-return">Stock Return</a>.</li>
            <li>Activity types: ${ACTIVITIES.map(U.esc).join(", ")}.</li></ul></div></div>
        </div>
        <div class="card mt-2"><div class="card-head"><h3>Consumption entries</h3><div class="small muted">Filter by equipment (search) and date to see matching records only</div></div><div id="conTable"></div></div>`;
      UI.table(el.querySelector("#openTable"), { id: "openissues", pageSize: 5, rows: () => S().openIssues(), search: (x) => `${x.issue.no} ${x.issue.equipment} ${x.issue.dept}`,
        columns: [{ key: "no", label: "Issue", render: (x) => `<span class="mono">${x.issue.no}</span>`, sortVal: (x) => x.issue.no }, { key: "eq", label: "Equipment / Dept", render: (x) => U.esc(x.issue.equipment || x.issue.dept) },
          { key: "g", label: "Grade", render: (x) => U.esc(S().gradeName(x.issue.gradeId)) }, { key: "open", label: "Open", num: true, sortVal: (x) => x.bal.open, render: (x) => U.fmtQty(x.bal.open, x.issue.unit) }],
        empty: "Issue stock first from Stock Issue.", actions: () => UI.act("cons", "Record", "btn-xs btn-primary") + UI.act("ret", "Return", "btn-xs btn-ghost"),
        onAction: { cons: (x) => recordConsumption(x.issue), ret: (x) => window.InventoryUI.openReturnForm(x.issue) } });
      UI.table(el.querySelector("#conTable"), {
        id: "consumption", exportName: "equipment_consumption", rows: live, dateKey: "date", searchPlaceholder: "Equipment, issue no., reason…",
        search: (t) => `${t.no} ${t.equipment} ${t.reason} ${t.remarks} ${(st.db.txns.find((x) => x.id === t.issueId) || {}).no || ""}`,
        filters: [{ key: "activity", label: "Activity", options: () => U.uniq(live().map((t) => t.activity)) }, { key: "area", label: "Area", options: () => U.uniq(live().map((t) => t.area)).sort() },
          { key: "gradeId", label: "Grade", options: () => U.uniq(live().map((t) => t.gradeId)).map((g) => ({ value: g, label: S().gradeName(g) })) }, { key: "status", label: "Status", options: ["CONFIRMED", "PENDING_EXCEPTION", "REJECTED"] }],
        columns: [{ key: "no", label: "No.", render: (t) => `<span class="mono">${t.no}</span>` }, { key: "date", label: "Date", render: (t) => U.fmtDate(t.date) }, { key: "equipment", label: "Equipment", render: (t) => `<strong>${U.esc(t.equipment || "—")}</strong>` },
          { key: "area", label: "Area" }, { key: "grade", label: "Oil grade", render: (t) => U.esc(S().gradeName(t.gradeId)) }, { key: "activity", label: "Activity" },
          { key: "changeQty", label: "Oil change", num: true, render: (t) => U.fmt(t.changeQty) }, { key: "topupQty", label: "Top-up", num: true, render: (t) => U.fmt(t.topupQty) },
          { key: "qty", label: "Total", num: true, render: (t) => `<strong>${U.fmtQty(t.qty, t.unit)}</strong>` }, { key: "reason", label: "Reason", render: (t) => `<span class="small">${U.esc(t.reason || "—")}</span>` },
          { key: "status", label: "Status", render: (t) => UI.status(t.status) + (t.source ? " " + UI.badge("Source", "outline") : "") }],
        toolbar: `<button class="btn btn-sm btn-primary" data-tool="add">+ Record Consumption</button>`, onTool: { add: () => recordConsumption(null) },
        actions: (t) => UI.act("issue", "Issue") + (t.status === "PENDING_EXCEPTION" ? UI.act("ok", "Approve", "btn-xs btn-success") + UI.act("no", "Reject", "btn-xs btn-danger-ghost") : ""),
        onAction: { issue: (t) => window.IssueUI.viewIssue(st.db.txns.find((x) => x.id === t.issueId)), ok: (t) => N.result(S().decideException(t.id, true), "Exception approved", t.no), no: (t) => N.result(S().decideException(t.id, false), "Exception rejected", t.no) },
        rowClass: (t) => (t.status === "PENDING_EXCEPTION" ? "row-warning" : "")
      });
      if (R.consume(params, "new")) setTimeout(() => recordConsumption(null), 0);
    }
  });

  /* ---------------- Consumption History ---------------- */
  const histColumns = [{ key: "date", label: "Date", render: (r) => U.fmtDate(r.date) }, { key: "equipment", label: "Equipment", render: (r) => `<strong>${U.esc(r.equipment || "—")}</strong>` }, { key: "area", label: "Area" },
    { key: "grade", label: "Grade", render: (r) => U.esc(r.gradeId ? S().gradeName(r.gradeId) : r.grade || "—") }, { key: "activity", label: "Activity" },
    { key: "changeQty", label: "Oil change", num: true, render: (r) => U.fmt(r.changeQty) }, { key: "topupQty", label: "Top-up", num: true, render: (r) => U.fmt(r.topupQty) },
    { key: "qty", label: "Total", num: true, render: (r) => U.fmtQty(r.qty, r.unit) }, { key: "reason", label: "Reason / remarks", render: (r) => `<span class="small">${U.esc(r.reason || "—")}</span>` },
    { key: "origin", label: "Origin", render: (r) => `<span class="tag-src" title="${U.esc(r.source)}">${U.esc(r.origin)}</span>` }];
  R.register({
    id: "consumption-history", title: "Consumption History",
    intro: "All equipment-wise oil and grease consumption for FY-27: source MIS monthly sheets plus entries recorded in the system.",
    render(el) {
      const recs = M.consumptionRecords();
      const oil = recs.filter((r) => r.unit === "L"), gr = recs.filter((r) => r.unit === "kg");
      el.innerHTML = `${UI.kpis([{ label: "Records", value: U.fmt(recs.length) }, { label: "Oil consumption", value: `${U.fmt(U.sum(oil, (r) => r.qty), 0)} <small>L</small>` }, { label: "Grease consumption", value: `${U.fmt(U.sum(gr, (r) => r.qty), 0)} <small>kg</small>` }, { label: "Equipment", value: U.fmt(U.uniq(recs.map((r) => r.equipment)).length) }])}
        ${M.sourceNote(`Months before ${U.monthLabel(S().src.inventory.latestMonth)}: <em>Lubrication MIS FY-27</em> monthly sheets (New Oil Consumption, Motor Grease Consumption, issued-to-department sections). From ${U.monthLabel(S().src.inventory.latestMonth)}: the demo ledger (the go-live month's source rows were loaded as ledger entries, so nothing is counted twice). Activity type is derived from the source quantity columns and remark text.`)}
        <div class="card" id="chTable"></div>`;
      UI.table(el.querySelector("#chTable"), {
        id: "conhist", exportName: "consumption_history", pageSize: 25, rows: () => M.consumptionRecords(), dateKey: "date",
        search: (r) => `${r.equipment} ${r.grade} ${r.reason} ${r.area}`, searchPlaceholder: "Search equipment, grade, remark…",
        filters: [{ key: "month", label: "Month", options: () => U.uniq(M.consumptionRecords().map((r) => r.month)).sort().reverse().map((m) => ({ value: m, label: U.monthLabel(m) })) },
          { key: "area", label: "Area", options: () => U.uniq(M.consumptionRecords().map((r) => r.area)).sort() }, { key: "activity", label: "Activity", options: () => U.uniq(M.consumptionRecords().map((r) => r.activity)) },
          { key: "unit", label: "Material", options: [{ value: "L", label: "Oil (L)" }, { value: "kg", label: "Grease (kg)" }] }, { key: "origin", label: "Origin", options: ["Source", "Source (seeded ledger)", "System"] }],
        columns: histColumns,
        footer: (rs) => ["L", "kg"].map((u) => { const x = rs.filter((r) => r.unit === u); return x.length ? `<tr><td colspan="7">Total ${u === "L" ? "oil" : "grease"} (filtered)</td><td class="num">${U.fmt(U.sum(x, (r) => r.qty))} ${u}</td><td colspan="2"></td></tr>` : ""; }).join("")
      });
    }
  });

  /* ---------------- Oil Top-up History ---------------- */
  let tuRows = null;
  const topupRows = () => {
    const st = S();
    if (!tuRows) {
      const eqs = st.src.topup.equipment;
      const eqIdByIdx = new Map(st.db.equipment.filter((e) => e.topupIdx !== undefined).map((e) => [e.topupIdx, e.id]));
      tuRows = st.src.topup.events.map((ev, i) => { const e = eqs[ev[0]]; return { id: "TU" + i, eqIdx: ev[0], eqId: eqIdByIdx.get(ev[0]), equipment: e.name, group: e.group, sheet: e.sheet, area: st.areaOf(e.area),
        grade: e.gradeRaw, date: ev[1], dateRaw: ev[3], qty: ev[2], qtyRaw: ev[4], origin: "Source" }; });
    }
    const sys = st.db.topups.map((t) => { const e = st.eq(t.eqId) || {}; return { id: t.id, eqId: t.eqId, equipment: e.name, group: e.subArea, sheet: e.sheet || "—", area: e.area, grade: st.gradeName(t.gradeId), date: t.date, qty: t.qty, activity: t.activity, ref: t.ref, origin: "System" }; });
    return sys.concat(tuRows);
  };
  R.register({
    id: "topup-history", title: "Oil Top-up History",
    intro: "Equipment-wise oil top-up and replacement history since Apr'23 from the area-wise history workbook, plus top-ups recorded in the system.",
    render(el) {
      const st = S(), rows = topupRows(), cmp = st.src.meta.topupComparison;
      const dated = rows.filter((r) => r.date).map((r) => r.date).sort();
      el.innerHTML = `${UI.kpis([{ label: "Top-up events", value: U.fmt(rows.length) }, { label: "Equipment with history", value: U.fmt(U.uniq(rows.map((r) => r.sheet + r.group + r.equipment)).length) },
          { label: "Total quantity", value: `${U.fmt(U.sum(rows, (r) => r.qty), 0)} <small>L</small>` }, { label: "Period", value: `${U.fmtDate(dated[0])}`, sub: `to ${U.fmtDate(dated[dated.length - 1])}` }])}
        ${M.sourceNote(`<em>${U.esc(cmp.primary.file)}</em> (${cmp.primary.sheets.length} sheets) chosen over the ${cmp.alternate.sheets.length}-sheet copy because it carries the oil grade per equipment. ${cmp.differences.slice(0, 2).map(U.esc).join(" ")} The source does not distinguish top-up from replacement.`)}
        <div class="grid grid-2"><div class="card"><div class="card-head"><h3>Monthly top-up quantity (L) — all areas</h3></div><div class="card-body"><div class="chart-box short" id="tuChart"></div></div></div>
          <div class="card"><div class="card-head"><h3>Top equipment by quantity (filtered)</h3></div><div class="card-body" id="tuTop"></div></div></div>
        <div class="card mt-2" id="tuTable"></div>`;
      const byM = C.totalsBy(rows.filter((r) => r.date), (r) => r.date.slice(0, 7)).sort((a, b) => a.key.localeCompare(b.key));
      UI.chart(el.querySelector("#tuChart"), { type: "bar", unit: "L", data: { labels: byM.map((x) => U.monthLabel(x.key)), datasets: [{ label: "Top-up (L)", data: byM.map((x) => x.qty) }] } });
      const t = UI.table(el.querySelector("#tuTable"), {
        id: "topup", exportName: "oil_topup_history", pageSize: 25, rows: topupRows, dateKey: "date", searchPlaceholder: "Search equipment…",
        search: (r) => `${r.equipment} ${r.group || ""} ${r.grade || ""}`,
        filters: [{ key: "sheet", label: "Area sheet", options: () => U.uniq(topupRows().map((r) => r.sheet)) }, { key: "grade", label: "Grade (source spelling)", options: () => U.uniq(topupRows().map((r) => r.grade)).sort() },
          { key: "fy", label: "FY", options: ["FY-24", "FY-25", "FY-26", "FY-27"], value: (r) => U.fyOf(r.date) }, { key: "origin", label: "Origin", options: ["Source", "System"] }],
        columns: [{ key: "date", label: "Date", render: (r) => (r.date ? U.fmtDate(r.date) : `<span class="text-warning">${U.esc(r.dateRaw)}</span>`) }, { key: "equipment", label: "Equipment", render: (r) => `<strong>${U.esc(r.equipment)}</strong>` },
          { key: "group", label: "Unit / group", render: (r) => U.esc(r.group || "—") }, { key: "sheet", label: "Area sheet" }, { key: "grade", label: "Grade of oil", render: (r) => U.esc(r.grade || "—") },
          { key: "qty", label: "Qty (L)", num: true, render: (r) => (r.qty !== null ? U.fmt(r.qty) : `<span class="text-warning">${U.esc(r.qtyRaw || "—")}</span>`) },
          { key: "origin", label: "Origin", render: (r) => `<span class="tag-src">${r.origin}${r.ref ? " · " + U.esc(r.ref) : ""}</span>` }],
        actions: (r) => (r.eqId ? UI.act("hist", "Equipment history") : ""), onAction: { hist: (r) => window.EquipmentUI.viewEquipmentHistory(S().eq(r.eqId)) }
      });
      const drawTop = () => { const top = C.totalsBy(t.rows(), (r) => `${r.equipment}${r.group ? " (" + r.group + ")" : ""}`).slice(0, 10); el.querySelector("#tuTop").innerHTML = top.length ? UI.barList(top.map((x) => ({ label: x.key, value: x.qty })), "L") : '<div class="empty">No rows</div>'; };
      drawTop();
      el.querySelector("#tuTable").addEventListener("change", () => setTimeout(drawTop, 0));
      el.querySelector("#tuTable").addEventListener("input", U.debounce(drawTop, 300));
    }
  });

  /* ---------------- Oil Replacement History ---------------- */
  R.register({
    id: "replacement-history", title: "Oil Replacement History",
    intro: "Oil changes / replacements (with flushing quantity or replacement remark) from the FY-27 MIS sheets and system entries.",
    render(el) {
      const isRep = (r) => r.unit === "L" && (r.activity === "Replacement" || (r.changeQty || 0) > 0 || /replac/i.test(r.reason || ""));
      const rows = () => M.consumptionRecords().filter(isRep);
      el.innerHTML = `${UI.kpis([{ label: "Replacement / oil change events", value: rows().length }, { label: "Quantity", value: `${U.fmt(U.sum(rows(), (r) => r.qty), 0)} <small>L</small>` }, { label: "Equipment", value: U.uniq(rows().map((r) => r.equipment)).length }])}
        ${UI.callout("warn", "The Top-up & Replacement history workbook does <strong>not</strong> mark which events were replacements, so it is not used here (no inference from quantity). Events below are classified from the MIS 'Oil flushing Qty' column or remarks containing 'replacement'. Scrap generated by each replacement should be recorded in <a href=\"#/scrap-generation\">Scrap Oil Generation</a>.")}
        <div class="card" id="rpTable"></div>`;
      UI.table(el.querySelector("#rpTable"), { id: "replace", exportName: "oil_replacement_history", rows, dateKey: "date", search: (r) => `${r.equipment} ${r.reason}`,
        filters: [{ key: "area", label: "Area", options: () => U.uniq(rows().map((r) => r.area)).sort() }], columns: histColumns,
        actions: () => UI.act("scrap", "Record scrap"), onAction: { scrap: (r) => window.ScrapUI.openGenForm({ equipment: r.equipment, area: r.area, activity: "Oil Replacement" }) } });
    }
  });

  /* ---------------- Consumption Reports ---------------- */
  R.register({
    id: "consumption-reports", title: "Consumption Reports",
    intro: "Equipment-wise, area-wise, grade-wise (monthly) and department-wise consumption with filters and export.",
    render(el) {
      const host = document.createElement("div"); el.appendChild(host);
      const recs = () => M.consumptionRecords();
      const fyF = { key: "fy", label: "FY", options: () => U.uniq(recs().map((r) => U.fyOf(r.date))).sort(), value: (r) => U.fyOf(r.date) };
      const matF = { key: "unit", label: "Material", options: [{ value: "L", label: "Oil (L)" }, { value: "kg", label: "Grease (kg)" }] };
      const agg = (keyFn, base) => { const g = U.groupBy(base, (r) => keyFn(r) + "||" + r.unit); return Object.entries(g).map(([k, rs]) => ({ key: k.split("||")[0], unit: rs[0].unit, area: rs[0].area, qty: U.round(U.sum(rs, (r) => r.qty), 3), n: rs.length, last: rs.map((r) => r.date).sort().pop() })); };
      // Aggregate tables filter the raw records first, then group — so filters apply before totals.
      const aggTable = (b, id, keyLabel, keyFn, extraFilters = []) => {
        const f = UI.tableState["agg:" + id] = UI.tableState["agg:" + id] || { fy: "FY-27", unit: "L", area: "" };
        const areas = U.uniq(recs().map((r) => r.area)).sort();
        b.innerHTML = `<div class="card"><div class="table-toolbar"><label class="filter"><span>FY</span><select data-a="fy">${U.uniq(recs().map((r) => U.fyOf(r.date))).sort().map((y) => `<option>${y}</option>`).join("")}</select></label>
          <label class="filter"><span>Material</span><select data-a="unit"><option value="L">Oil (L)</option><option value="kg">Grease (kg)</option></select></label>
          <label class="filter"><span>Area</span><select data-a="area"><option value="">All</option>${areas.map((a) => `<option>${U.esc(a)}</option>`).join("")}</select></label></div><div id="t"></div></div>`;
        b.querySelectorAll("[data-a]").forEach((s) => { s.value = f[s.dataset.a]; s.addEventListener("change", () => { f[s.dataset.a] = s.value; aggTable(b, id, keyLabel, keyFn, extraFilters); }); });
        const base = recs().filter((r) => U.fyOf(r.date) === f.fy && r.unit === f.unit && (!f.area || r.area === f.area));
        UI.table(b.querySelector("#t"), { id: "rep-" + id, exportName: `consumption_by_${id}_${f.fy}`, pageSize: 25, rows: agg(keyFn, base), search: (r) => r.key, defaultSort: { key: "qty", dir: "desc" },
          columns: [{ key: "key", label: keyLabel, render: (r) => `<strong>${U.esc(r.key)}</strong>` }, ...(id === "equipment" ? [{ key: "area", label: "Area" }] : []), { key: "n", label: "Entries", num: true },
            { key: "qty", label: "Consumption", num: true, render: (r) => U.fmtQty(r.qty, r.unit) }, { key: "last", label: "Last entry", render: (r) => U.fmtDate(r.last) }],
          footer: (rs) => `<tr><td colspan="${id === "equipment" ? 3 : 2}">Total</td><td class="num">${U.fmt(U.sum(rs, (r) => r.qty))} ${f.unit}</td><td></td></tr>` });
      };
      UI.tabs(host, [
        { id: "eq", label: "Equipment-wise", render: (b) => aggTable(b, "equipment", "Equipment", (r) => r.equipment || "—") },
        { id: "area", label: "Area-wise", render: (b) => aggTable(b, "area", "Area", (r) => r.area || "—") },
        { id: "grade", label: "Grade-wise monthly", render: (b) => {
          const months = U.uniq(recs().map((r) => r.month)).sort();
          const byG = U.groupBy(recs(), (r) => (r.gradeId ? S().gradeName(r.gradeId) : r.grade) + "||" + r.unit);
          const rows = Object.entries(byG).map(([k, rs]) => { const o = { key: k.split("||")[0], unit: rs[0].unit, total: U.round(U.sum(rs, (r) => r.qty), 2) }; months.forEach((m) => (o[m] = U.round(U.sum(rs.filter((r) => r.month === m), (r) => r.qty), 2))); return o; });
          b.innerHTML = '<div class="card" id="t"></div>';
          UI.table(b.querySelector("#t"), { id: "rep-grade", exportName: "consumption_grade_monthly", pageSize: 50, rows, search: (r) => r.key, filters: [matF], defaultSort: { key: "total", dir: "desc" },
            columns: [{ key: "key", label: "Grade" }, { key: "unit", label: "Unit" }, ...months.map((m) => ({ key: m, label: U.monthLabel(m), num: true, render: (r) => (r[m] ? U.fmt(r[m]) : "—") })), { key: "total", label: "Total", num: true, render: (r) => `<strong>${U.fmt(r.total)}</strong>` }] });
        } },
        { id: "dept", label: "Department issues", render: (b) => { b.innerHTML = '<div class="card" id="t"></div>';
          UI.table(b.querySelector("#t"), { id: "rep-dept", exportName: "department_issues", rows: () => recs().filter((r) => r.activity === "Department issue"), dateKey: "date", search: (r) => `${r.equipment} ${r.dept || ""}`, filters: [fyF, matF],
            columns: [{ key: "date", label: "Date", render: (r) => U.fmtDate(r.date) }, { key: "dept", label: "Department", render: (r) => U.esc(r.dept || "—") }, { key: "area", label: "Issued to" }, { key: "equipment", label: "Purpose" }, { key: "grade", label: "Grade", render: (r) => U.esc(r.grade) }, { key: "qty", label: "Qty", num: true, render: (r) => U.fmtQty(r.qty, r.unit) }, { key: "reason", label: "Remarks" }] }); } }
      ], "conreports");
    }
  });

  window.ConsumptionUI = { recordConsumption, topupRows };
})();
