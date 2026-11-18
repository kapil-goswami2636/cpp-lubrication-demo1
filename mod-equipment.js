/* =========================================================
   modules/equipment.js — Equipment Master (Phase 3 per report)
   Add / edit / view / history / activate-deactivate /
   import Excel / export Excel
   ========================================================= */
(function () {
  "use strict";
  const U = window.U, UI = window.UI, R = window.Router, M = window.Mod, N = window.Notify;
  const S = () => window.State;
  const PEND = "Pending Client Confirmation";
  const CRIT = ["Critical", "Semi-critical", "Non-critical"];
  const COV = { topup: "Top-up", greasing: "Greasing", sampling: "Sampling", filtration: "Filtration", analysis: "Analysis" };

  const fields = (isNew) => [
    { name: "id", label: "Equipment ID", type: isNew ? "text" : "readonly", required: false, hint: isNew ? "Leave blank to auto-generate." : "IDs are system-generated in the demo",
      unique: isNew ? { list: () => S().db.equipment, key: "id" } : undefined },
    { name: "name", label: "Equipment Name", required: true },
    { name: "department", label: "Department", type: "select", options: () => M.deptOptions(), hint: "Owning department — not in source" },
    { name: "area", label: "Area", type: "select", required: true, options: () => M.areaOptions() },
    { name: "subArea", label: "Sub-area", hint: "e.g. U#1, WB&LRSB, FWPH" },
    { name: "location", label: "Location", hint: "Not in source" },
    { name: "criticality", label: "Criticality", type: "select", options: CRIT, hint: "Classification not in source — pending" },
    { name: "gradeId", label: "Recommended Oil Grade", type: "select", options: () => M.allGradeOptions() },
    { name: "capacity", label: "Oil Capacity (L)", type: "number", min: 0, hint: "Tank / sump capacity — not in source" },
    { name: "frequency", label: "Lubrication Frequency", hint: "e.g. Monthly, Quarterly, 90 days" },
    { name: "status", label: "Equipment Status", type: "select", required: true, options: ["Active", "Inactive"], default: "Active", placeholder: false },
    { name: "remarks", label: "Remarks", type: "textarea", span: "span-2" }
  ];

  function openEquipmentForm(e) {
    const isNew = !e;
    UI.formModal({
      title: isNew ? "Add Equipment" : `Edit Equipment — ${e.name}`, size: "lg", fields: fields(isNew), values: e ? { ...e } : { status: "Active" }, submitLabel: "Save Equipment",
      intro: M.roleNote("*", "maintain equipment master"),
      onSubmit: (v) => S().saveEquipment(isNew ? v : (delete v.id, v), isNew ? null : e.id),
      successTitle: isNew ? "Equipment added" : "Equipment updated", successText: (r) => `${r.record.id} — ${r.record.name}`
    });
  }

  /** viewEquipmentHistory — consolidated history across all modules. */
  function viewEquipmentHistory(e) {
    const st = S();
    const tu = e.topupIdx !== undefined ? M.topupEvents(e.topupIdx) : [];
    const sysTu = st.db.topups.filter((t) => t.eqId === e.id);
    const cons = M.consumptionRecords().filter((r) => r.equipment && U.normKey(r.equipment) === U.normKey(e.name));
    const sampling = st.samplingPoints().filter((p) => U.normKey(p.equipment) === U.normKey(e.name));
    const analysis = st.analysisEquipment().filter((a) => U.normKey(a.equipment) === U.normKey(e.name));
    const lastRes = analysis.length ? st.src.analysis.results.filter((r) => r.sheet === analysis[0].sheet && r.equipment === analysis[0].equipment).sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0] : null;
    const motor = e.type === "Motor" ? st.motors().find((m) => m.id === e.id) : null;
    const ms = motor ? st.motorStatus(motor) : null;
    const timeline = [
      ...tu.map((x) => ({ date: x.date, what: `Top-up / replacement ${U.fmt(x.qty)} L`, src: "Top-up history (source)" })),
      ...sysTu.map((x) => ({ date: x.date, what: `${x.activity} ${U.fmt(x.qty)} — ${x.ref}`, src: "System" })),
      ...cons.filter((c) => !c.issueId || c.origin !== "System").slice(0, 50).map((c) => ({ date: c.date, what: `${c.activity}: ${U.fmt(c.qty)} ${c.unit} ${c.grade || ""} ${c.reason ? "— " + c.reason : ""}`, src: c.origin === "Source" ? "MIS monthly sheet" : c.origin })),
      ...(motor ? motor.cells.map((c) => ({ date: c.date || c.month + "-01", what: c.date ? "Greasing done (schedule sheet)" : `Schedule remark: ${c.remark}`, src: "Greasing schedule" })) : []),
      ...st.db.greasing.filter((g) => g.motorId === e.id).map((g) => ({ date: g.date, what: `Greasing ${U.fmt(g.qty)} kg ${g.grease} (${g.no})`, src: "System" })),
      ...(e.history || []).map((h) => ({ date: h.at.slice(0, 10), what: h.what + " by " + h.by, src: "Master data change" }))
    ].filter((x) => x.date).sort((a, b) => b.date.localeCompare(a.date));
    const tuTotal = U.sum(tu, (x) => x.qty);
    UI.modal({
      title: `${e.name} — Equipment details & history`, size: "lg",
      body: `<div class="split">
        <table class="kv">
          <tr><th>Equipment ID</th><td class="mono">${U.esc(e.id)}</td></tr><tr><th>Name</th><td><strong>${U.esc(e.name)}</strong></td></tr>
          <tr><th>Type</th><td>${U.esc(e.type)}</td></tr><tr><th>Department</th><td>${UI.val(e.department)}</td></tr>
          <tr><th>Area / Sub-area</th><td>${U.esc(e.area || "—")} ${e.subArea ? "/ " + U.esc(e.subArea) : ""}</td></tr><tr><th>Location</th><td>${UI.val(e.location)}</td></tr>
          <tr><th>Criticality</th><td>${UI.val(e.criticality)}</td></tr>
          <tr><th>Recommended grade</th><td>${e.gradeId ? U.esc(st.gradeName(e.gradeId)) : e.gradeRaw ? U.esc(e.gradeRaw) : UI.pending()} ${e.gradeRaw && e.gradeId ? `<div class="small muted">Source spelling: ${U.esc(e.gradeRaw)}</div>` : ""}</td></tr>
          <tr><th>Oil capacity</th><td>${UI.val(e.capacity, "L")}</td></tr>
          <tr><th>Lubrication frequency</th><td>${UI.val(e.frequency)} ${e.freqSource ? `<div class="small muted">${U.esc(e.freqSource)}</div>` : ""}</td></tr>
          <tr><th>Status</th><td>${UI.status(e.status)}</td></tr><tr><th>Remarks</th><td>${U.esc(e.remarks || "—")}</td></tr>
          <tr><th>Source(s)</th><td class="small">${e.sources.map(U.esc).join("<br>")}</td></tr>
        </table>
        <div>
          ${UI.kpis([{ label: "Historical top-ups", value: tu.length, sub: `${U.fmt(tuTotal)} L since Apr'23` }, { label: "FY-27 consumption rows", value: cons.length, sub: U.fmt(U.sum(cons, (c) => c.qty)) + " total" }])}
          ${ms ? `<p><strong>Greasing:</strong> last ${U.fmtDate(ms.last)}, next due ${U.fmtDate(ms.nextDue)} ${UI.badge(ms.due.label, ms.due.cls)}</p>` : ""}
          ${sampling.length ? `<p><strong>Sampling:</strong> ${sampling.map((p) => `${U.esc(p.sheet)} — ${U.esc(p.frequency)}`).join("; ")}</p>` : ""}
          ${lastRes ? `<p><strong>Latest oil analysis (${U.fmtDate(lastRes.date)}):</strong> ${Object.entries(lastRes.params).map(([k, v]) => `${U.esc(k)} ${U.esc(v)}`).join(" · ")}</p>` : ""}
          <div class="chips">${Object.entries(COV).map(([k, l]) => `<span class="chip ${e.coverage[k] ? "active" : ""}">${l}</span>`).join("")}</div>
        </div></div>
        <h3 class="mt-2">Equipment history (${timeline.length})</h3>
        ${timeline.length ? `<div style="max-height:320px;overflow:auto"><table class="data compact"><thead><tr><th>Date</th><th>Event</th><th>Source</th></tr></thead><tbody>${timeline.slice(0, 300).map((t) => `<tr><td class="nowrap">${U.fmtDate(t.date)}</td><td>${U.esc(t.what)}</td><td class="small muted">${U.esc(t.src)}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">No history records found for this equipment.</div>'}`,
      buttons: [{ label: "Edit", act: "edit", cls: "btn-ghost", left: true }, { label: "Close", close: true, cls: "btn-primary" }],
      onAction: (a, m) => { if (a === "edit") { m.close(); openEquipmentForm(e); } }
    });
  }

  function importExcel() {
    UI.modal({
      title: "Import Equipment from Excel / CSV", size: "lg",
      body: `${M.roleNote("*", "import equipment")}
        <p>Upload an <strong>.xlsx</strong> or <strong>.csv</strong> file with columns: <code>Equipment ID, Equipment Name, Department, Area, Sub-area, Location, Criticality, Oil Capacity, Lubrication Frequency, Equipment Status, Remarks</code>. Existing IDs are updated; new rows are added.</p>
        <div class="btn-group mb-2"><button class="btn btn-sm" data-mact="template">Download template</button></div>
        <input type="file" accept=".xlsx,.xls,.csv" data-file>
        <div data-preview class="mt-2"></div>`,
      buttons: [{ label: "Cancel", close: true, cls: "btn-ghost" }, { label: "Import rows", act: "import", cls: "btn-primary" }],
      onOpen: (m) => {
        m.rows = [];
        m.body.querySelector("[data-file]").addEventListener("change", (ev) => {
          const file = ev.target.files[0]; if (!file) return;
          const show = (rows) => {
            m.rows = rows;
            const p = m.body.querySelector("[data-preview]");
            if (!rows.length) { p.innerHTML = '<div class="callout danger">No data rows found.</div>'; return; }
            const cols = Object.keys(rows[0]);
            p.innerHTML = `<div class="callout info">${rows.length} row(s) ready. Preview of first 5:</div><div class="table-wrap"><table class="data compact"><thead><tr>${cols.map((c) => `<th>${U.esc(c)}</th>`).join("")}</tr></thead><tbody>${rows.slice(0, 5).map((r) => `<tr>${cols.map((c) => `<td>${U.esc(r[c])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
          };
          const reader = new FileReader();
          if (/\.csv$/i.test(file.name)) { reader.onload = () => show(M.parseCSV(reader.result)); reader.readAsText(file); }
          else if (window.XLSX) { reader.onload = () => { const wb = window.XLSX.read(reader.result, { type: "array" }); show(window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" })); }; reader.readAsArrayBuffer(file); }
          else N.error("Excel library unavailable", "Save the file as CSV and import again.");
        });
      },
      onAction: (a, m) => {
        if (a === "template") { window.Reports.csv("equipment_import_template", ["Equipment ID", "Equipment Name", "Department", "Area", "Sub-area", "Location", "Criticality", "Oil Capacity", "Lubrication Frequency", "Equipment Status", "Remarks"], [["", "Example Pump-1", "BOP MAINTENANCE", "BOP", "", "", "Critical", "50", "Quarterly", "Active", "ILLUSTRATIVE row — delete"]]); return; }
        if (a === "import") {
          if (!m.rows.length) { N.error("Choose a file first"); return; }
          const res = S().importEquipment(m.rows);
          if (!res.ok) { N.error("Import failed", res.error); return; }
          m.close();
          N.success("Import complete", `${res.added} added, ${res.updated} updated${res.errors.length ? `, ${res.errors.length} error(s)` : ""}`);
          if (res.errors.length) UI.view("Import errors", res.errors.slice(0, 50).map((x, i) => [`#${i + 1}`, U.esc(x)]));
        }
      }
    });
  }

  R.register({
    id: "equipment", title: "Equipment Master",
    intro: "Centralised master for CPP equipment: name, area, criticality, lubricant grade, tank capacity and lubrication frequency. Seeded from the top-up history, greasing, sampling and filtration workbooks.",
    render(el, params) {
      const st = S(), eqs = st.db.equipment, cov = st.src.meta.topupSummary.find((r) => r.area === "Total") || {};
      const c = (k) => eqs.filter((e) => e.coverage[k]).length;
      el.innerHTML = `
        ${UI.kpis([
          { label: "Equipment records", value: U.fmt(eqs.length), sub: `${eqs.filter((e) => e.status === "Active").length} active` },
          { label: "Top-up coverage", value: U.fmt(c("topup")), sub: `Source states ${U.fmt(cov.oilTopup)}`, cls: "info" },
          { label: "Motors (greasing)", value: U.fmt(c("greasing")), sub: `Source states ${U.fmt(cov.motorGreasing)}`, cls: "info" },
          { label: "Sampling points", value: U.fmt(c("sampling")), sub: `Source states ${U.fmt(cov.oilSampling)}`, cls: "info" },
          { label: "Criticality defined", value: eqs.filter((e) => e.criticality).length, sub: PEND, cls: "warning" }
        ])}
        ${UI.callout("warn", `Counts differ from the source-stated coverage: names vary between workbooks and some sheets contain more columns than their summary. Department, location, criticality and capacity are <span class="pending-text">${PEND}</span> — they are not in any source file.`)}
        <div class="card" id="eqTable"></div>`;
      UI.table(el.querySelector("#eqTable"), {
        id: "equipment", exportName: "equipment_master", pageSize: 25, searchPlaceholder: "Search name, ID, grade…",
        rows: () => S().db.equipment, search: (e) => `${e.id} ${e.name} ${e.subArea || ""} ${e.gradeRaw || ""} ${e.area}`,
        filters: [{ key: "area", label: "Area", options: () => U.uniq(S().db.equipment.map((e) => e.area)).sort() }, { key: "type", label: "Type", options: ["Equipment", "Motor", "Sampling point"] },
          { key: "status", label: "Status", options: ["Active", "Inactive"] }, { key: "cov", label: "Coverage", options: Object.entries(COV).map(([value, label]) => ({ value, label })), value: (e) => Object.keys(e.coverage).filter((k) => e.coverage[k]).join(",") }],
        columns: [
          { key: "id", label: "Equipment ID", render: (e) => `<span class="mono">${U.esc(e.id)}</span>` },
          { key: "name", label: "Equipment Name", render: (e) => `<strong>${U.esc(e.name)}</strong>${e.remarks && e.type === "Motor" ? `<div class="small muted">${U.esc(e.remarks)}</div>` : ""}` },
          { key: "area", label: "Area" }, { key: "subArea", label: "Sub-area", render: (e) => U.esc(e.subArea || "—") },
          { key: "grade", label: "Grade", sortVal: (e) => e.gradeRaw || "", render: (e) => U.esc(e.gradeId ? S().gradeName(e.gradeId) : e.gradeRaw || "—"), csv: (e) => (e.gradeId ? S().gradeName(e.gradeId) : e.gradeRaw || "") },
          { key: "criticality", label: "Criticality", render: (e) => (e.criticality ? U.esc(e.criticality) : '<span class="pending-text">Pending</span>'), csv: (e) => e.criticality || PEND },
          { key: "capacity", label: "Capacity", num: true, render: (e) => (e.capacity ? U.fmt(e.capacity) + " L" : '<span class="pending-text">Pending</span>'), csv: (e) => e.capacity || PEND },
          { key: "frequency", label: "Frequency", render: (e) => U.esc(e.frequency || "—") },
          { key: "coverage", label: "Coverage", nosort: true, render: (e) => Object.keys(e.coverage).filter((k) => e.coverage[k]).map((k) => `<span class="badge outline">${COV[k]}</span>`).join(" "), csv: (e) => Object.keys(e.coverage).filter((k) => e.coverage[k]).join("; ") },
          { key: "status", label: "Status", render: (e) => UI.status(e.status) }
        ],
        toolbar: `<button class="btn btn-sm btn-primary" data-tool="add">+ Add Equipment</button><button class="btn btn-sm" data-tool="import">Import Excel</button>`,
        onTool: { add: () => openEquipmentForm(null), import: importExcel },
        actions: (e) => UI.act("view", "View") + UI.act("edit", "Edit") + UI.act("toggle", e.status === "Active" ? "Deactivate" : "Activate", "btn-xs btn-ghost"),
        onAction: {
          view: viewEquipmentHistory, edit: openEquipmentForm,
          toggle: async (e) => {
            if (!(await UI.confirm({ title: `${e.status === "Active" ? "Deactivate" : "Activate"} equipment?`, text: `${U.esc(e.name)} (${U.esc(e.id)}) will ${e.status === "Active" ? "no longer be selectable in consumption and maintenance entries" : "become selectable again"}.` }))) return;
            N.result(S().toggleEquipment(e.id), "Status changed", `${e.name}`);
          }
        },
        rowClass: (e) => (e.status !== "Active" ? "row-warning" : "")
      });
      const v = R.consume(params, "view");
      if (v && S().eq(v)) setTimeout(() => viewEquipmentHistory(S().eq(v)), 0);
    }
  });

  window.EquipmentUI = { viewEquipmentHistory, openEquipmentForm };
})();
