/* =========================================================
   modules/admin.js — Audit Trail, Client Validation, Pending
   Decisions, Source Data Audit, Demo Settings
   ========================================================= */
(function () {
  "use strict";
  const U = window.U, UI = window.UI, R = window.Router, M = window.Mod, N = window.Notify;
  const S = () => window.State;
  const STATUSES = [["Confirmed", "confirmed"], ["Pending", "pending"], ["Not Applicable", "na"]];

  /* ---------------- Audit trail ---------------- */
  R.register({
    id: "audit-trail", title: "Audit Trail",
    intro: "Every create, submit, confirm, approve, change and export action performed in this demo, with user, role and time.",
    render(el) {
      el.innerHTML = `${UI.callout("info", "Demo audit trail is kept in browser storage. Production: immutable server-side audit log (proposed security requirement).")}<div class="card" id="auTable"></div>`;
      UI.table(el.querySelector("#auTable"), { id: "audit", exportName: "audit_trail", pageSize: 25, rows: () => S().db.audit, dateKey: (a) => a.at.slice(0, 10), search: (a) => `${a.action} ${a.entity} ${a.ref} ${a.detail} ${a.user}`,
        filters: [{ key: "entity", label: "Module", options: () => U.uniq(S().db.audit.map((a) => a.entity)).sort() }, { key: "role", label: "Role", options: () => U.uniq(S().db.audit.map((a) => a.role)) }],
        columns: [{ key: "at", label: "Time", render: (a) => U.fmtDateTime(a.at) }, { key: "user", label: "User" }, { key: "role", label: "Role" }, { key: "entity", label: "Module" }, { key: "action", label: "Action", render: (a) => `<strong>${U.esc(a.action)}</strong>` }, { key: "ref", label: "Reference", render: (a) => `<span class="mono">${U.esc(a.ref)}</span>` }, { key: "detail", label: "Detail", render: (a) => `<span class="small">${U.esc(a.detail)}</span>` }] });
    }
  });

  /* ---------------- Notifications ---------------- */
  R.register({
    id: "notifications", title: "Notifications",
    intro: "Messages raised by entries in the system — receipts waiting, new requests, stock changes, low stock and approvals.",
    render(el) {
      el.innerHTML = '<div class="card" id="nTable"></div>';
      UI.table(el.querySelector("#nTable"), { id: "notif", exportName: "notifications", rows: () => S().db.notifications, search: (n) => `${n.title} ${n.text}`,
        filters: [{ key: "sev", label: "Type", options: [{ value: "info", label: "Information" }, { value: "success", label: "Done" }, { value: "warning", label: "Attention" }, { value: "danger", label: "Critical" }] },
          { key: "r", label: "Read", options: ["Unread", "Read"], value: (n) => (n.read ? "Read" : "Unread") }],
        columns: [{ key: "at", label: "Time", render: (n) => U.fmtDateTime(n.at) }, { key: "sev", label: "Type", render: (n) => UI.badge({ info: "Information", success: "Done", warning: "Attention", danger: "Critical" }[n.sev] || n.sev, n.sev === "danger" ? "danger" : n.sev === "warning" ? "warning" : n.sev === "success" ? "success" : "info") },
          { key: "title", label: "Title", render: (n) => `<strong>${U.esc(n.title)}</strong>` }, { key: "text", label: "Message" }, { key: "read", label: "Read", render: (n) => (n.read ? "Read" : UI.badge("Unread", "info")), csv: (n) => (n.read ? "Read" : "Unread") }],
        toolbar: '<button class="btn btn-sm" data-tool="all">Mark all read</button>', onTool: { all: () => { S().markNotifications(); N.success("All notifications marked read"); } },
        actions: (n) => (n.read ? "" : UI.act("read", "Mark read")) + (n.link && R.page(n.link) ? UI.act("open", "Open") : ""),
        onAction: { read: (n) => S().markNotifications([n.id]), open: (n) => { S().markNotifications([n.id]); R.go(n.link); } } });
    }
  });

  /* ---------------- Client validation ---------------- */
  const qId = (i) => "Q" + String(i + 1).padStart(2, "0");
  function checklistRows() {
    const st = S();
    return [...st.cfg.clientQuestions.map((q, i) => ({ id: qId(i), kind: "Question", text: q, ...(st.db.validation[qId(i)] || {}) })),
      ...st.cfg.pendingDecisions.map((d) => ({ id: d.id, kind: "Business rule — " + d.area, text: `${d.title}: ${d.detail}`, ...(st.db.validation[d.id] || {}) }))]
      .map((r) => ({ ...r, status: r.status || "Pending" }));
  }
  const exportChecklist = (fmt) => {
    const rows = checklistRows();
    const cols = [{ key: "id", label: "Ref" }, { key: "kind", label: "Type" }, { key: "text", label: "Question / decision" }, { key: "status", label: "Status" }, { key: "note", label: "Client answer / notes" }, { key: "by", label: "Updated by" }];
    window.Reports.exportTable(fmt, "client_discussion_checklist", cols, rows);
  };
  R.register({
    id: "client-validation", title: "Client Validation",
    intro: "Questions the client and IT must confirm before a production build. Nothing is pre-approved — every item starts as Pending.",
    render(el) {
      const st = S(), rows = checklistRows().filter((r) => r.kind === "Question");
      const n = (s) => rows.filter((r) => r.status === s).length;
      el.innerHTML = `${UI.kpis([{ label: "Questions", value: rows.length }, { label: "Confirmed", value: n("Confirmed"), cls: "success" }, { label: "Pending", value: n("Pending"), cls: "warning" }, { label: "Not applicable", value: n("Not Applicable"), cls: "neutral" }])}
        <div class="card"><div class="card-head"><h3>Client discussion checklist</h3><div class="btn-group"><button class="btn btn-sm" data-x="csv">Export CSV</button><button class="btn btn-sm" data-x="xlsx">Export Excel</button><button class="btn btn-sm btn-primary" data-x="pdf">Export PDF</button></div></div>
        <div>${rows.map((r) => `<div class="qa-row"><span class="qa-no">${r.id}</span><div><strong>${U.esc(r.text)}</strong>
            <div class="mt-1"><input type="text" data-note="${r.id}" value="${U.esc(r.note || "")}" placeholder="Record the client's answer / notes…" style="width:100%"></div>${r.by ? `<div class="small muted mt-1">Updated by ${U.esc(r.by)} · ${U.fmtDateTime(r.at)}</div>` : ""}</div>
            <div class="qa-status">${STATUSES.map(([s, c]) => `<button data-q="${r.id}" data-s="${s}" class="${r.status === s ? "on-" + c : ""}">${s}</button>`).join("")}</div></div>`).join("")}</div></div>
        <p class="small muted mt-1">The export also includes the ${st.cfg.pendingDecisions.length} business-rule decisions from <a href="#/pending-decisions">Pending Decisions</a>.</p>`;
      el.addEventListener("click", (e) => {
        const b = e.target.closest("[data-q]"); if (b) { S().setValidation(b.dataset.q, b.dataset.s); N.toast("Checklist updated", `${b.dataset.q} → ${b.dataset.s}`); return; }
        const x = e.target.closest("[data-x]"); if (x) exportChecklist(x.dataset.x);
      });
      el.addEventListener("change", (e) => { const t = e.target.closest("[data-note]"); if (t) { const cur = checklistRows().find((r) => r.id === t.dataset.note); S().setValidation(t.dataset.note, cur.status, t.value); N.toast("Note saved", t.dataset.note); } });
    }
  });

  /* ---------------- Pending decisions ---------------- */
  R.register({
    id: "pending-decisions", title: "Pending Decisions",
    intro: "Business-rule decisions and data issues found while analysing the source files. The prototype uses a documented default for each, clearly marked, until the client decides.",
    render(el) {
      el.innerHTML = '<div class="card" id="pdTable"></div>';
      UI.table(el.querySelector("#pdTable"), { id: "decisions", exportName: "pending_decisions", pageSize: 25, rows: () => checklistRows().filter((r) => r.kind !== "Question").map((r) => ({ ...r, d: S().cfg.pendingDecisions.find((x) => x.id === r.id) })),
        search: (r) => r.text, filters: [{ key: "area", label: "Area", options: () => U.uniq(S().cfg.pendingDecisions.map((d) => d.area)), value: (r) => r.d.area }, { key: "status", label: "Status", options: ["Pending", "Confirmed", "Not Applicable"] }],
        columns: [{ key: "id", label: "Ref", render: (r) => `<strong>${r.id}</strong>` }, { key: "area", label: "Area", render: (r) => U.esc(r.d.area), csv: (r) => r.d.area }, { key: "title", label: "Decision", render: (r) => `<strong>${U.esc(r.d.title)}</strong><div class="small">${U.esc(r.d.detail)}</div>`, csv: (r) => `${r.d.title}: ${r.d.detail}` },
          { key: "impact", label: "Impacts", render: (r) => `<span class="small">${U.esc(r.d.impact)}</span>`, csv: (r) => r.d.impact }, { key: "note", label: "Client decision / notes", render: (r) => `<span class="small">${U.esc(r.note || "—")}</span>` }, { key: "status", label: "Status", render: (r) => UI.status(r.status) }],
        actions: () => UI.act("set", "Update"),
        onAction: { set: (r) => UI.formModal({ title: `${r.id} — ${r.d.title}`, intro: `<p class="small">${U.esc(r.d.detail)}</p>`, values: { status: r.status, note: r.note || "" },
          fields: [{ name: "status", label: "Status", type: "select", required: true, options: STATUSES.map((s) => s[0]), placeholder: false }, { name: "note", label: "Client decision / notes", type: "textarea", span: "span-2" }],
          onSubmit: (v) => S().setValidation(r.id, v.status, v.note), successTitle: "Decision updated" }) } });
    }
  });

  /* ---------------- Source data audit ---------------- */
  const PURPOSE = {
    "CPP Digitalisation Points.xlsx": "14 digitalisation points with priority / status (scope)", "Digital_Lubrication_Management_.docx": "Project request report — objectives, challenges, 3 official phases",
    "Dispose Oil Record.xlsx": "Scrap oil / empty drum dispatch to disposal yard (FY-wise + detailed)", "Lubrication MIS FY-27.xlsx": "Monthly consumption sheets + monthly inventory balance sheets Apr'20 → Oct'26",
    "Mill & Boiler Filteration Schedule.xlsx": "Filtration completion dates by machine / week / equipment", "MOT oil Moisture drain.xlsx": "Moisture drained from Main Oil Tanks — events, daily log, monthly totals",
    "Oil Analysis Report Equipment wise CPP Area.xlsx": "Oil analysis results by equipment with limits (RANGE row)", "Oil Topup & Replacement history w.e.f Apr'23 (1).xlsx": "Older copy of top-up history (no grade row) — reference only",
    "Oil Topup & Replacement history w.e.f Apr'23.xlsx": "Equipment-wise top-up history since Apr'23 + coverage summary (USED)", "Schedule Motor Greasing Apr'26 to March'27.xlsx": "HT/LT motor regreasing schedule FY-27",
    "Schedule Oil sampling Apr'26 to March'27.xlsx": "Oil sampling schedule FY-27 + special samples", "Process flow phase-1.png": "Phase-1 Lube Oil Cell process flow (reproduced in Business Process Workflow)"
  };
  R.register({
    id: "source-audit", title: "Source Data Audit",
    intro: "What was found in each client file, what was loaded into the prototype, and data-quality findings. Source files were read only — never modified.",
    render(el) {
      const st = S(), meta = st.src.meta, c = meta.counts, inv = st.src.inventory;
      el.innerHTML = `${UI.kpis([{ label: "Source files", value: meta.files.length }, { label: "Top-up events loaded", value: U.fmt(c.topupEvents) }, { label: "Analysis results loaded", value: U.fmt(c.analysisResults) }, { label: "MIS months parsed", value: c.inventoryMonths }, { label: "Unparsed values", value: meta.issues.length, cls: "warning" }])}
        ${UI.card({ title: "File inventory", flush: true, body: `<div class="table-wrap"><table class="data"><thead><tr><th>File</th><th>Purpose</th><th class="num">Sheets</th><th>Sheet names</th></tr></thead><tbody>${meta.files.map((f) => `<tr><td><strong>${U.esc(f.file)}</strong></td><td class="small">${U.esc(PURPOSE[f.file] || "")}</td><td class="num">${f.sheetCount ?? "—"}</td><td class="small">${f.sheets ? f.sheets.map(U.esc).join(", ") : "—"}</td></tr>`).join("")}</tbody></table></div>` })}
        <div class="grid grid-2">
          ${UI.card({ title: "Loaded into the prototype", body: `<table class="kv">
            <tr><th>Top-up history</th><td>${U.fmt(c.topupEquipment)} equipment columns, ${U.fmt(c.topupEvents)} events (${Object.entries(c.topupPerSheet).map(([k, v]) => `${U.esc(k)} ${v.equipmentColumns}/${v.events}`).join(", ")})</td></tr>
            <tr><th>MIS monthly sheets (FY-27)</th><td>${Object.entries(c.consumption).map(([k, v]) => `${k}: ${v}`).join(", ")}</td></tr>
            <tr><th>Inventory balance sheets</th><td>${c.inventoryMonths} months, ${inv.grades.length} grades (${inv.grades.filter((g) => !g.active).length} inactive)</td></tr>
            <tr><th>Greasing schedule</th><td>${c.greasingMotors} motors</td></tr><tr><th>Sampling schedule</th><td>${c.samplingRows} rows + ${c.specialSamples} special samples</td></tr>
            <tr><th>Oil analysis</th><td>${c.analysisEquipment} equipment, ${U.fmt(c.analysisResults)} results</td></tr><tr><th>Filtration</th><td>${c.filtrationEquipment} equipment slots, ${c.filtrationRecords} records</td></tr>
            <tr><th>Moisture drain</th><td>${c.moistureEvents} events</td></tr><tr><th>Dispose record</th><td>${c.disposeRecords} dispatch rows</td></tr></table>` })}
          ${UI.card({ title: "Stated coverage vs found", flush: true, body: `<table class="data compact"><thead><tr><th>Area</th><th class="num">Top-up (stated)</th><th class="num">Top-up columns found</th><th class="num">Greasing</th><th class="num">Sampling</th><th class="num">Filtration</th></tr></thead><tbody>${meta.topupSummary.map((r) => {
              const found = Object.entries(c.topupPerSheet).filter(([k]) => k.replace(/\.$/, "").toUpperCase().startsWith(String(r.area).replace(/\.$/, "").toUpperCase().slice(0, 4))).reduce((s, [, v]) => s + v.equipmentColumns, 0);
              return `<tr><td>${U.esc(r.area)}</td><td class="num">${U.fmt(r.oilTopup)}</td><td class="num">${r.area === "Total" ? U.fmt(c.topupEquipment) : found || "—"}</td><td class="num">${U.fmt(r.motorGreasing)}</td><td class="num">${U.fmt(r.oilSampling)}</td><td class="num">${U.fmt(r.filtrationMachines)}</td></tr>`; }).join("")}</tbody></table>
            <div class="card-body small muted">Found counts are approximate per-sheet matches (WB&LRSB columns sit under Boiler&Aux; FWPH under BOP). See D09.</div>` })}
        </div>
        <div class="grid grid-2">
          ${UI.card({ title: `MIS balance-sheet arithmetic exceptions (${inv.reconciliationExceptions.length})`, sub: "Opening + Received − Consumption ≠ Balance", flush: true, body: `<div style="max-height:320px;overflow:auto"><table class="data compact"><thead><tr><th>Month</th><th>Grade</th><th class="num">Sheet balance</th><th class="num">Computed</th><th class="num">Δ</th></tr></thead><tbody>${inv.reconciliationExceptions.slice().reverse().map((x) => `<tr><td>${U.monthLabel(x.month)}</td><td>${U.esc(x.grade)}</td><td class="num">${U.fmt(x.closingInSheet)}</td><td class="num">${U.fmt(x.computed)}</td><td class="num">${U.fmt(x.difference)}</td></tr>`).join("")}</tbody></table></div>` })}
          ${UI.card({ title: `Month-to-month continuity exceptions (${inv.continuityExceptions.length})`, sub: "Opening ≠ previous month's balance", flush: true, body: `<div style="max-height:320px;overflow:auto"><table class="data compact"><thead><tr><th>From → to</th><th>Grade</th><th class="num">Prev. balance</th><th class="num">Next opening</th></tr></thead><tbody>${inv.continuityExceptions.slice().reverse().map((x) => `<tr><td>${U.monthLabel(x.from)} → ${U.monthLabel(x.to)}</td><td>${U.esc(x.grade)}</td><td class="num">${U.fmt(x.closingPrev)}</td><td class="num">${U.fmt(x.openingNext)}</td></tr>`).join("")}</tbody></table></div>` })}
        </div>
        ${UI.card({ title: "Values that could not be parsed (preserved raw)", flush: true, body: `<table class="data compact"><thead><tr><th>File</th><th>Sheet</th><th>Cell</th><th>Problem</th><th>Value</th><th>Handling</th></tr></thead><tbody>${meta.issues.map((i) => `<tr><td class="small">${U.esc(i.source)}</td><td>${U.esc(i.sheet)}</td><td class="mono">${U.esc(i.cell)}</td><td>${U.esc(i.problem)}</td><td class="mono">${U.esc(i.value)}</td><td class="small">${U.esc(i.handling)}</td></tr>`).join("")}</tbody></table>` })}
        ${UI.card({ title: "Top-up workbook versions compared", body: `<ul class="list-plain">${meta.topupComparison.differences.map((d) => `<li>${U.esc(d)}</li>`).join("")}</ul>` })}`;
    }
  });

  /* ---------------- Demo settings ---------------- */
  R.register({
    id: "settings", title: "Settings",
    intro: "Approval rules for the stock process, and data controls.",
    render(el) {
      const st = S(), s = st.db.settings;
      const row = (label, hint, control) => `<div class="settings-row"><div><strong>${label}</strong><div class="small muted">${hint}</div></div><div>${control}</div></div>`;
      const toggle = (k) => `<label class="check"><input type="checkbox" data-set="${k}" ${s[k] ? "checked" : ""}> ${s[k] ? "On" : "Off"}</label>`;
      const num = (k, w = 80) => `<input type="number" min="0" data-set="${k}" value="${s[k]}" style="width:${w}px">`;
      el.innerHTML = `${M.roleNote("*", "change settings")}
        ${UI.card({ title: "Approval rules", sub: "To be finalised with the Lube Cell in-charge", body:
          row("Approval before oil is issued", "When ON, an issue waits for the shift engineer / in-charge before stock is reduced.", toggle("issueApproval"))
          + row("Approval for stock adjustments", "When ON, an adjustment changes stock only after the in-charge approves it.", toggle("adjustmentApproval"))
          + row("Scrap oil already in storage (L)", "Quantity physically present in the scrap area on the start date.", num("scrapOpening", 110)) })}
        ${UI.card({ title: "Data", body: row("Where entries are kept", window.DemoStore.available() ? `In this browser only (about ${U.fmt(Math.round(JSON.stringify(st.db).length / 1024))} KB). The final system will keep them in a central database.` : "Browser storage is blocked — entries will be lost on refresh.", "")
          + row("Reset data", "Removes everything entered here and goes back to the starting figures.", '<button class="btn btn-danger-ghost" data-action="reset-demo">Reset data</button>') })}`;
      el.addEventListener("change", (e) => {
        const k = e.target.dataset.set; if (!k) return;
        const v = e.target.type === "checkbox" ? e.target.checked : e.target.type === "number" ? Math.max(0, +e.target.value || 0) : e.target.value || null;
        if (N.result(S().updateSettings({ [k]: v }), "Setting saved", `${k} = ${v}`)) { if (k === "demoDate") N.toast("As-on date changed", "All due/overdue and compliance figures now use " + U.fmtDate(S().today())); }
        else R.refresh();
      });
      el.addEventListener("click", (e) => { if (e.target.closest("[data-clear-date]")) N.result(S().updateSettings({ demoDate: null }), "As-on date reset to today"); });
    }
  });
})();
