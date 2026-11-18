/* =====================================================================
   calculations.js — the ONLY place where business numbers are computed.
   Pure functions: they receive data and return results; no DOM, no state.

   STOCK MODEL (Lube Oil Cell sub-inventory)
   ------------------------------------------------------------------
   Transaction types are kept separate and only some move stock:
     OPENING      +qty   verified opening balance at go-live
     RECEIPT      +qty   only when status = CONFIRMED
     ISSUE        −qty   only when status = ISSUED (not pending/rejected/cancelled)
     RETURN       +qty   unused oil returned against an issue (CONFIRMED)
     ADJUSTMENT   ±qty   only when status = APPROVED
     CONSUMPTION   0     memo record of what the equipment actually used.
                         Stock was already deducted at ISSUE, so consumption
                         is NEVER deducted again (no double deduction).
   Closing = Opening + Receipts + Returns − Issues + Adjustments
   Per issue: Open balance = Issued − Consumed − Returned (must be ≥ 0)

   Scrap oil uses its own ledger (it is not saleable lube stock):
     generated  → stored in Lube Cell drums → dispatched to disposal yard
   ===================================================================== */
(function () {
  "use strict";
  const C = {};
  const r3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;

  /* ---------------- Stock ledger ---------------- */
  C.STOCK_TYPES = ["OPENING", "RECEIPT", "ISSUE", "RETURN", "ADJUSTMENT", "CONSUMPTION"];

  /** Signed effect of one ledger transaction on store stock. */
  C.stockEffect = (t) => {
    switch (t.type) {
      case "OPENING": return t.status === "CONFIRMED" ? +t.qty : 0;
      case "RECEIPT": return t.status === "CONFIRMED" ? +t.qty : 0;
      case "ISSUE": return t.status === "ISSUED" ? -t.qty : 0;
      case "RETURN": return t.status === "CONFIRMED" ? +t.qty : 0;
      case "ADJUSTMENT": return t.status === "APPROVED" ? +t.qty : 0; // qty is signed for adjustments
      default: return 0; // CONSUMPTION and anything else never moves stock
    }
  };

  /** Available (book) stock for one grade, optionally as on a date (inclusive). */
  C.available = (txns, gradeId, asOn) =>
    r3(txns.reduce((s, t) => (t.gradeId === gradeId && (!asOn || t.date <= asOn) ? s + C.stockEffect(t) : s), 0));

  /**
   * Grade-wise stock movement summary for a period [from, to].
   * Opening = all stock effects dated before `from`.
   */
  C.stockSummary = (txns, grades, from, to) => {
    const out = {};
    grades.forEach((g) => { out[g.id] = { gradeId: g.id, opening: 0, receipts: 0, issues: 0, returns: 0, adjustments: 0, consumption: 0, closing: 0 }; });
    txns.forEach((t) => {
      const row = out[t.gradeId];
      if (!row) return;
      const eff = C.stockEffect(t);
      if (from && t.date < from) { row.opening += eff; return; }
      if (to && t.date > to) return;
      if (t.type === "OPENING") row.opening += eff;
      else if (t.type === "RECEIPT") row.receipts += eff;
      else if (t.type === "ISSUE") row.issues += -eff;
      else if (t.type === "RETURN") row.returns += eff;
      else if (t.type === "ADJUSTMENT") row.adjustments += eff;
      else if (t.type === "CONSUMPTION" && t.status !== "REJECTED" && t.status !== "PENDING_EXCEPTION") row.consumption += +t.qty;
    });
    Object.values(out).forEach((r) => {
      ["opening", "receipts", "issues", "returns", "adjustments", "consumption"].forEach((k) => (r[k] = r3(r[k])));
      r.closing = C.closingStock(r);
    });
    return out;
  };

  /** Closing Stock = Opening + Receipts + Returns − Issues + Adjustments */
  C.closingStock = ({ opening, receipts, returns, issues, adjustments }) =>
    r3((opening || 0) + (receipts || 0) + (returns || 0) - (issues || 0) + (adjustments || 0));

  /** Running ledger with balance after each movement (for the Stock Ledger page). */
  C.runningLedger = (txns, gradeId) => {
    let bal = 0;
    return txns.filter((t) => !gradeId || t.gradeId === gradeId)
      .slice().sort((a, b) => (a.date + (a.createdAt || "")).localeCompare(b.date + (b.createdAt || "")))
      .map((t) => { const eff = C.stockEffect(t); bal = gradeId ? r3(bal + eff) : null; return { ...t, effect: r3(eff), balance: bal }; });
  };

  /** Issue reconciliation: issued vs consumed vs returned (consumption & returns linked by issueId). */
  C.issueBalance = (issue, txns) => {
    const linked = txns.filter((t) => t.issueId === issue.id);
    const consumed = r3(linked.filter((t) => t.type === "CONSUMPTION" && t.status !== "REJECTED" && t.status !== "PENDING_EXCEPTION").reduce((s, t) => s + t.qty, 0));
    const returned = r3(linked.filter((t) => t.type === "RETURN" && t.status === "CONFIRMED").reduce((s, t) => s + t.qty, 0));
    const issued = issue.status === "ISSUED" ? +issue.qty : 0;
    const open = r3(issued - consumed - returned);
    return { issued, consumed, returned, open, reconciled: issue.status === "ISSUED" && Math.abs(open) < 0.0005 };
  };

  /** Stock value where a unit price exists in the source. */
  C.stockValue = (qty, price) => (price === null || price === undefined || isNaN(price) ? null : r3(qty * price));

  /** Stock criticality vs min / reorder level. */
  C.stockStatus = (closing, grade) => {
    const min = grade.minStock, rol = grade.reorderLevel;
    if (min === null || min === undefined || rol === null || rol === undefined) return { key: "UNDEFINED", label: "Levels pending", cls: "" };
    if (closing <= 0) return { key: "OUT", label: "Out of stock", cls: "danger" };
    if (closing < min) return { key: "CRITICAL", label: "Below minimum", cls: "danger" };
    if (closing <= rol) return { key: "REORDER", label: "Reorder", cls: "warning" };
    return { key: "OK", label: "Healthy", cls: "success" };
  };

  /* ---------------- Consumption analytics ---------------- */

  /**
   * Monthly consumption series. Months up to the last closed source month use the
   * source MIS inventory sheets ('CONSUMPTION FOR THE month'); later months use live
   * CONSUMPTION transactions entered in the system.
   */
  C.monthlyConsumption = (sourceMonths, txns, gradesById) => {
    const res = {};
    Object.entries(sourceMonths).forEach(([ym, m]) => {
      let oil = 0, grease = 0, has = false;
      // Classify per row (it.kind): sheets before Apr'26 hold oil and grease in ONE combined table.
      m.blocks.forEach((b) => b.items.forEach((it) => {
        if (it.consumption !== null && it.consumption !== undefined) { has = true; if ((it.kind || b.kind) === "grease") grease += it.consumption; else oil += it.consumption; }
      }));
      if (has) res[ym] = { month: ym, oil: r3(oil), grease: r3(grease), source: "MIS sheet: " + m.sheet };
    });
    txns.filter((t) => t.type === "CONSUMPTION" && t.status !== "REJECTED" && t.status !== "PENDING_EXCEPTION").forEach((t) => {
      const ym = t.date.slice(0, 7);
      if (res[ym] && res[ym].source.startsWith("MIS")) return; // never double count a closed source month
      res[ym] = res[ym] || { month: ym, oil: 0, grease: 0, source: "System transactions" };
      const g = gradesById[t.gradeId];
      if (g && g.type === "Grease") res[ym].grease = r3(res[ym].grease + t.qty); else res[ym].oil = r3(res[ym].oil + t.qty);
    });
    return Object.values(res).sort((a, b) => a.month.localeCompare(b.month));
  };

  C.fyConsumption = (monthly) => {
    const fy = {};
    monthly.forEach((m) => {
      const k = window.U.fyOf(m.month + "-01");
      fy[k] = fy[k] || { fy: k, oil: 0, grease: 0, months: 0 };
      fy[k].oil = r3(fy[k].oil + m.oil); fy[k].grease = r3(fy[k].grease + m.grease); fy[k].months++;
    });
    return Object.values(fy).sort((a, b) => a.fy.localeCompare(b.fy));
  };

  /** Totals by any key (equipment, area, grade) over consumption-like records with `qty`. */
  C.totalsBy = (records, keyFn, qtyFn = (r) => r.qty) => {
    const m = {};
    records.forEach((r) => { const k = keyFn(r) || "—"; m[k] = r3((m[k] || 0) + (Number(qtyFn(r)) || 0)); });
    return Object.entries(m).map(([key, qty]) => ({ key, qty })).sort((a, b) => b.qty - a.qty);
  };

  /** Suggested min / reorder from average monthly consumption (ILLUSTRATIVE rule, pending approval). */
  C.suggestLevels = (sourceMonths, gradeId, months) => {
    const vals = months.map((ym) => {
      const m = sourceMonths[ym]; if (!m) return null;
      let v = null; m.blocks.forEach((b) => b.items.forEach((it) => { if (it.gradeId === gradeId && it.consumption !== null) v = (v || 0) + it.consumption; }));
      return v;
    }).filter((v) => v !== null);
    if (!vals.length) return null;
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    return { avgMonthly: r3(avg), minStock: Math.round(avg * 0.5), reorderLevel: Math.round(avg), basisMonths: vals.length };
  };

  /* ---------------- Scheduling (greasing / sampling / filtration / PM) ---------------- */
  C.FREQ_DAYS = { FORTNIGHTLY: 15, MONTHLY: 30, QUARTERLY: 90, QUARTELY: 90, QTRLY: 90, "HALF YEARLY": 180, YEARLY: 365, WEEKLY: 7 };
  C.freqToDays = (f) => { if (f === null || f === undefined || f === "") return null; if (!isNaN(f)) return +f; return C.FREQ_DAYS[String(f).trim().toUpperCase()] || null; };

  /** Median interval between consecutive dates, rounded to nearest 15 days (used only when the source has no frequency). */
  C.inferInterval = (dates) => {
    const d = window.U.uniq(dates).sort();
    if (d.length < 2) return null;
    const gaps = []; for (let i = 1; i < d.length; i++) gaps.push(window.U.diffDays(d[i], d[i - 1]));
    const med = window.U.median(gaps.filter((g) => g > 3));
    return med ? Math.max(15, Math.round(med / 15) * 15) : null;
  };

  /**
   * Due status from next-due date.
   *   OVERDUE  : today > next due
   *   DUE      : today == next due
   *   UPCOMING : within `leadDays` before due (project report: 7 days for sampling)
   *   OK       : later than the lead window
   */
  C.dueStatus = (nextDue, today, leadDays = 7) => {
    if (!nextDue) return { key: "UNKNOWN", label: "Frequency pending", cls: "" };
    const d = window.U.diffDays(nextDue, today);
    if (d < 0) return { key: "OVERDUE", label: `Overdue ${-d}d`, cls: "danger", days: d };
    if (d === 0) return { key: "DUE", label: "Due today", cls: "warning", days: 0 };
    if (d <= leadDays) return { key: "UPCOMING", label: `Due in ${d}d`, cls: "info", days: d };
    return { key: "OK", label: "Scheduled", cls: "success", days: d };
  };

  /**
   * Generic schedule status for an item.
   *  completions : ISO dates of completed activities (source dates + system entries)
   *  remarks     : [{date|month, remark}] — S/D, COH, AOH… kept as remarks, never completions
   */
  C.scheduleStatus = ({ completions, remarks, freqDays, fyStart, today, leadDays, excludeRemarked }) => {
    const done = window.U.uniq(completions || []).filter((d) => d <= today).sort();
    const last = done.length ? done[done.length - 1] : null;
    const lastRemark = (remarks || []).slice().sort((a, b) => (a.month || "").localeCompare(b.month || "")).pop() || null;
    const nextDue = freqDays ? window.U.addDays(last || fyStart, last ? freqDays : 0) : null;
    const due = C.dueStatus(nextDue, today, leadDays);
    // A remark newer than the last completion (e.g. S/D in the current month) may exclude the item — only if the client approves that rule.
    const remarkIsLatest = lastRemark && (!last || (lastRemark.month || "") > last.slice(0, 7));
    const excluded = !!(excludeRemarked && remarkIsLatest);
    const eligible = !!freqDays && !excluded;
    return { last, nextDue, due, lastRemark: remarkIsLatest ? lastRemark.remark : null, excluded, eligible, compliant: eligible && due.key !== "OVERDUE", count: done.length };
  };

  /** Compliance % = compliant eligible items / eligible items × 100 */
  C.compliance = (statuses) => {
    const eligible = statuses.filter((s) => s.eligible);
    const ok = eligible.filter((s) => s.compliant).length;
    return { eligible: eligible.length, compliant: ok, overdue: eligible.length - ok, pct: eligible.length ? r3((ok / eligible.length) * 100) : null };
  };

  /* ---------------- Oil analysis ---------------- */
  /** Evaluate a result against the equipment-specific limit from the source RANGE row. */
  C.evaluate = (value, limit) => {
    if (value === null || value === undefined || value === "" || isNaN(value)) return { key: "NA", label: "Not numeric", cls: "" };
    if (!limit) return { key: "NO_LIMIT", label: "No machine-readable limit", cls: "" };
    const v = +value;
    if (limit.max !== undefined && v > limit.max) return { key: "HIGH", label: "Above limit", cls: "danger" };
    if (limit.min !== undefined && v < limit.min) return { key: "LOW", label: "Below limit", cls: "danger" };
    return { key: "OK", label: "Within limit", cls: "success" };
  };
  C.limitText = (l) => (!l ? "—" : l.min !== undefined ? `${l.min} – ${l.max}` : `≤ ${l.max}`);

  /* ---------------- Scrap oil reconciliation ---------------- */
  /**
   * Balance in Lube Cell scrap storage = opening + generated − dispatched.
   * Generation and dispatch are different events and are never netted at entry time.
   * Source dispatch records dated before go-live are historical and excluded from
   * the live balance (generation was not recorded for that period).
   */
  C.scrapRecon = ({ opening, gens, transfers, dispatches, goLive }) => {
    const live = (r) => !goLive || (r.date && r.date >= goLive);
    const generated = r3(gens.filter((g) => g.status !== "CANCELLED").reduce((s, g) => s + g.qty, 0));
    const toStorage = r3(transfers.filter((t) => t.status !== "CANCELLED").reduce((s, t) => s + t.qty, 0));
    const dispatched = r3(dispatches.filter((d) => live(d) && !d.historical).reduce((s, d) => s + (d.qty || 0), 0));
    const atGenerationPoints = r3(generated - toStorage);
    const inStorage = r3((opening || 0) + toStorage - dispatched);
    return { opening: opening || 0, generated, toStorage, atGenerationPoints, dispatched, inStorage, totalUnDisposed: r3(atGenerationPoints + inStorage) };
  };

  window.Calc = C;
})();
