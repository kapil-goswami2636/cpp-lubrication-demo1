/* =========================================================
   modules/common.js — helpers shared by feature modules
   (option lists, equipment pickers, source notes)
   ========================================================= */
(function () {
  "use strict";
  const U = window.U;
  const M = {};
  const S = () => window.State;

  M.gradeOptions = (type, withStock) => S().activeGrades(type).map((g) => ({ value: g.id, label: withStock ? `${g.name} — avail. ${U.fmt(S().available(g.id))} ${g.unit}` : `${g.name} (${g.unit})` }));
  M.allGradeOptions = () => S().db.grades.map((g) => ({ value: g.id, label: g.name + (g.status !== "Active" ? " (inactive)" : "") }));
  M.deptOptions = () => S().db.departments.filter((d) => d.status === "Active").map((d) => d.name);
  M.areaOptions = () => S().db.areas.filter((a) => a.status === "Active").map((a) => a.name);
  M.eqLabel = (e) => `${e.name}${e.subArea ? " · " + e.subArea : ""} [${e.id}]`;
  M.eqOptions = () => S().selectableEquipment().map((e) => ({ value: e.id, label: M.eqLabel(e) }));
  /** Resolve the text of an equipment datalist input back to an equipment record. */
  M.eqFromInput = (txt) => {
    if (!txt) return null;
    const m = /\[([^\]]+)\]\s*$/.exec(txt);
    if (m && S().eq(m[1])) return S().eq(m[1]);
    return S().eqByName(txt) || null;
  };
  M.eqField = (name = "equipment", label = "Equipment", required = true) => ({ name, label, type: "datalist", required, options: M.eqOptions, span: "span-2",
    hint: "Type part of the name and pick from the list", custom: (v) => (v && !M.eqFromInput(v) ? "Select an equipment from the list" : null) });

  M.sourceNote = (text) => `<div class="callout info"><strong>Source:</strong> ${text}</div>`;
  M.illusNote = (text) => `<div class="callout illus"><strong>ILLUSTRATIVE DEMO DATA:</strong> ${text}</div>`;
  M.cutoffNote = (label, date) => (date ? `<div class="callout warn"><strong>Data currency:</strong> the latest ${U.esc(label)} recorded in the source workbook is <strong>${U.fmtDate(date)}</strong>. Activities after that date were not in the source and therefore show as due/overdue as on <strong>${U.fmtDate(S().today())}</strong>. Use <a href="#/settings">Demo Settings › As-on date</a> to review status as on an earlier date.</div>` : "");
  M.roleNote = (perm, what) => (S().can(perm) ? "" : `<div class="callout warn">Your current demo role (<strong>${U.esc(S().role().name)}</strong>) cannot ${U.esc(what)}. Switch role from the profile menu (top-right).</div>`);
  M.today = () => S().today();
  M.monthsFY27 = () => { const out = []; for (let i = 0; i < 12; i++) { const d = new Date(2026, 3 + i, 1); out.push(U.iso(d).slice(0, 7)); } return out; };

  /**
   * Unified equipment-wise consumption records:
   *  • FY-27 source months BEFORE the go-live month → read from MIS monthly sheets
   *  • go-live month onward → CONSUMPTION transactions in the demo ledger
   * (the go-live month's source rows were seeded as transactions, so nothing is counted twice)
   */
  let cache = null, cacheKey = "";
  M.consumptionRecords = () => {
    const st = S(), live = st.db.txns.filter((t) => t.type === "CONSUMPTION");
    const key = live.length + "|" + (live.length ? live[live.length - 1].id : "") + "|" + live.filter((t) => t.status !== "CONFIRMED").length + "|" + st.db.createdAt;
    if (cache && cacheKey === key) return cache;
    const lm = st.src.inventory.latestMonth, sec = st.src.consumption.sections, out = [];
    const push = (r, kind) => {
      if (r.month >= lm) return;
      const qty = kind === "dept" ? r.qty : r.totalQty; if (!qty) return;
      const rem = (r.remarks || "").toLowerCase();
      const activity = kind === "grease" ? "Motor Greasing" : kind === "dept" ? "Department issue" : rem.includes("replacement") ? "Replacement" : (r.changeQty || 0) > 0 ? ((r.topupQty || 0) > 0 ? "Oil Change + Top-up" : "Oil Change") : "Top-up";
      out.push({ id: `${r.sheet}#${r.row}`, date: r.date, month: r.month, equipment: kind === "dept" ? r.purpose || "Department issue" : r.equipment, area: st.areaOf(kind === "dept" ? r.issuedTo : r.area),
        gradeId: r.gradeId, grade: r.gradeRaw, unit: kind === "grease" || (r.gradeId || "").startsWith("GR-") ? "kg" : "L", activity, changeQty: r.changeQty || 0, topupQty: r.topupQty || (kind === "dept" ? 0 : 0),
        qty, reason: r.remarks || "", dept: kind === "dept" ? r.dept : null, source: `MIS › ${r.sheet} › row ${r.row}`, origin: "Source" });
    };
    sec.oilConsumption.forEach((r) => push(r, "oil"));
    sec.greaseConsumption.forEach((r) => push(r, "grease"));
    sec.oilDeptIssue.forEach((r) => push(r, "dept"));
    sec.greaseDeptIssue.forEach((r) => push(r, "dept"));
    live.filter((t) => t.status === "CONFIRMED").forEach((t) => out.push({ id: t.id, no: t.no, date: t.date, month: t.date.slice(0, 7), equipment: t.equipment, area: t.area, gradeId: t.gradeId,
      grade: st.gradeName(t.gradeId), unit: t.unit, activity: t.activity, changeQty: t.changeQty, topupQty: t.topupQty, qty: t.qty, reason: t.reason, issueId: t.issueId,
      source: t.source || "Entered in system", origin: t.source ? "Source (seeded ledger)" : "System" }));
    cache = out.sort((a, b) => (b.date || "").localeCompare(a.date || "")); cacheKey = key;
    return cache;
  };

  /** Historical top-up events (source workbook) grouped by top-up column index. */
  let tuMap = null;
  M.topupEvents = (idx) => {
    if (!tuMap) { tuMap = new Map(); S().src.topup.events.forEach((e) => { if (!tuMap.has(e[0])) tuMap.set(e[0], []); tuMap.get(e[0]).push({ date: e[1], qty: e[2], dateRaw: e[3], qtyRaw: e[4] }); }); }
    return tuMap.get(idx) || [];
  };

  /** Simple CSV parser (fallback when SheetJS is unavailable). */
  M.parseCSV = (text) => {
    const rows = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
      else if (ch === '"') q = true; else if (ch === ",") { row.push(cell); cell = ""; } else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const head = (rows.shift() || []).map((h) => h.replace(/^﻿/, "").trim());
    return rows.filter((r) => r.some((c) => c.trim())).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || "").trim()])));
  };

  /** Shown when consumption / return is attempted but no issue has an open balance. */
  M.noOpenIssues = (what) => window.UI.modal({
    title: "No oil issued yet", size: "sm",
    body: `<p>${U.esc(what)} is always recorded <strong>against an oil issue</strong>, and right now every issue is fully used or returned.</p><p class="muted">Issue oil first — then come back to this step.</p>`,
    buttons: [{ label: "Close", close: true, cls: "btn-ghost" }, { label: "Issue oil now", act: "issue", cls: "btn-primary" }],
    onAction: (a, m) => { if (a === "issue") { m.close(); window.IssueUI.openIssueForm(); } }
  });

  window.Mod = M;
})();
