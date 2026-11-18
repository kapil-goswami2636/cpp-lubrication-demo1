/* =========================================================
   modules/scrap.js — Scrap Oil Generation, Transfer,
   Disposal and Reconciliation ("Waste to Wealth").
   Generation → storage → dispatch are separate events.
   ========================================================= */
(function () {
  "use strict";
  const U = window.U, UI = window.UI, R = window.Router, C = window.Calc, M = window.Mod, N = window.Notify;
  const S = () => window.State;

  const flow = (active) => UI.flow([{ t: "Scrap generation", d: "During oil replacement / drain", cls: "special", link: "scrap-generation", active: active === 1 },
    { t: "Storage", d: "Drums in Lube Cell scrap area", cls: "system", link: "scrap-transfer", active: active === 2 },
    { t: "Dispatch / disposal", d: "Sent to disposal yard", cls: "system", link: "scrap-disposal", active: active === 3 },
    { t: "Reconciliation", d: "Generated vs stored vs disposed", cls: "output", link: "scrap-reconciliation", active: active === 4 }]);

  function openGenForm(prefill = {}) {
    UI.formModal({
      title: "Record scrap oil generation", size: "lg", intro: M.roleNote("scrap.create", "record scrap"),
      fields: [{ name: "date", label: "Date", type: "date", required: true, notFuture: true }, M.eqField("equipment", "Equipment / source", true),
        { name: "activity", label: "Generated during", type: "select", required: true, options: ["Oil Replacement", "Oil Flushing", "Tank drain / cleaning", "Filtration reject", "Other"] },
        { name: "drums", label: "Number of drums", type: "number", min: 0, integer: true }, { name: "qty", label: "Quantity (L)", type: "number", required: true, gt: 0 },
        { name: "method", label: "Measurement method", type: "select", options: ["Drum count × standard drum volume", "Dip / level measurement", "Flow meter", "Estimated"], hint: "How scrap is measured is pending client confirmation (Q7)" },
        { name: "remarks", label: "Remarks", type: "textarea", span: "span-2" },
        { type: "note", label: "Generation increases the scrap ledger only. It does not change disposal quantities or new-oil stock." }],
      values: { date: M.today(), activity: "Oil Replacement", drums: 1, ...prefill, equipment: prefill.equipment ? (S().eqByName(prefill.equipment) ? M.eqLabel(S().eqByName(prefill.equipment)) : prefill.equipment) : "" },
      onSubmit: (v) => { const e = M.eqFromInput(v.equipment); return S().addScrapGen({ ...v, equipment: e ? e.name : v.equipment, eqId: e ? e.id : null, area: e ? e.area : prefill.area || null }); },
      successTitle: "Scrap generation recorded", successText: (r) => `${r.record.no}: ${U.fmt(r.record.qty)} L — pending transfer to storage`
    });
  }

  R.register({
    id: "scrap-generation", title: "Scrap Oil Generation",
    intro: "Process step 5: scrap oil generated during oil replacement is recorded at source (equipment-wise).",
    render(el) {
      const st = S(), rc = st.scrap().recon;
      el.innerHTML = `${flow(1)}<div class="mt-2">${UI.kpis([{ label: "Generated (live)", value: `${U.fmt(rc.generated)} <small>L</small>` }, { label: "Awaiting transfer to storage", value: `${U.fmt(rc.atGenerationPoints)} <small>L</small>`, cls: rc.atGenerationPoints ? "warning" : "success", link: "scrap-transfer" }, { label: "Generation entries", value: st.db.scrapGen.length }])}</div>
        ${UI.callout("warn", "The source workbooks contain <strong>no scrap generation records</strong> — only dispatches to the disposal yard. Seeded entries marked ILLUSTRATIVE show how generation would be captured.")}
        <div class="card" id="sgTable"></div>`;
      UI.table(el.querySelector("#sgTable"), { id: "scrapgen", exportName: "scrap_generation", rows: () => S().db.scrapGen.slice().reverse(), dateKey: "date", search: (r) => `${r.no} ${r.equipment} ${r.remarks}`,
        filters: [{ key: "activity", label: "Activity", options: () => U.uniq(S().db.scrapGen.map((r) => r.activity)) }],
        columns: [{ key: "no", label: "No.", render: (r) => `<span class="mono">${r.no}</span>` }, { key: "date", label: "Date", render: (r) => U.fmtDate(r.date) }, { key: "equipment", label: "Equipment", render: (r) => `<strong>${U.esc(r.equipment)}</strong>` }, { key: "area", label: "Area" },
          { key: "activity", label: "During" }, { key: "drums", label: "Drums", num: true }, { key: "qty", label: "Qty (L)", num: true, render: (r) => U.fmt(r.qty) }, { key: "method", label: "Measured by", render: (r) => U.esc(r.method || "—") },
          { key: "remarks", label: "Remarks", render: (r) => (r.illustrative ? UI.illus() : `<span class="small">${U.esc(r.remarks || "")}</span>`) }],
        toolbar: `<button class="btn btn-sm btn-primary" data-tool="add">+ Record Generation</button>`, onTool: { add: () => openGenForm() } });
    }
  });

  R.register({
    id: "scrap-transfer", title: "Scrap Oil Transfer",
    intro: "Movement of generated scrap (drums) from the equipment into the Lube Cell scrap storage.",
    render(el) {
      const st = S(), rc = st.scrap().recon;
      el.innerHTML = `${flow(2)}<div class="mt-2">${UI.kpis([{ label: "Awaiting transfer", value: `${U.fmt(rc.atGenerationPoints)} <small>L</small>`, cls: "warning" }, { label: "Transferred to storage", value: `${U.fmt(rc.toStorage)} <small>L</small>` }, { label: "Currently in storage", value: `${U.fmt(rc.inStorage)} <small>L</small>`, cls: "info" }])}</div><div class="card" id="stTable"></div>`;
      UI.table(el.querySelector("#stTable"), { id: "scraptr", exportName: "scrap_transfers", rows: () => S().db.scrapTransfers.slice().reverse(), dateKey: "date", empty: "Use “+ Transfer to storage” after recording generation.",
        columns: [{ key: "no", label: "No.", render: (r) => `<span class="mono">${r.no}</span>` }, { key: "date", label: "Date", render: (r) => U.fmtDate(r.date) }, { key: "location", label: "To location" }, { key: "drums", label: "Drums", num: true }, { key: "qty", label: "Qty (L)", num: true, render: (r) => U.fmt(r.qty) }, { key: "status", label: "Status", render: (r) => UI.status(r.status) }, { key: "remarks", label: "Remarks" }],
        toolbar: `<button class="btn btn-sm btn-primary" data-tool="add">+ Transfer to storage</button>`,
        onTool: { add: () => UI.formModal({ title: "Transfer scrap to storage", intro: M.roleNote("scrap.create", "record transfers"),
          fields: [{ name: "date", label: "Date", type: "date", required: true, notFuture: true }, { name: "location", label: "To storage location", type: "select", required: true, options: () => S().db.locations.filter((l) => l.type === "Scrap storage").map((l) => l.name), placeholder: false },
            { name: "drums", label: "Drums", type: "number", min: 0, integer: true }, { name: "qty", label: `Quantity (L) — max ${U.fmt(S().scrap().recon.atGenerationPoints)}`, type: "number", required: true, gt: 0, max: () => S().scrap().recon.atGenerationPoints, maxMsg: (m) => `Only ${U.fmt(m)} L generated scrap is awaiting transfer` }, { name: "remarks", label: "Remarks", type: "textarea", span: "span-2" }],
          values: { date: M.today(), qty: S().scrap().recon.atGenerationPoints || "" }, onSubmit: (v) => S().addScrapTransfer(v), successTitle: "Scrap moved to storage" }) } });
    }
  });

  const sourceDispatchCols = [{ key: "fy", label: "FY" }, { key: "date", label: "Date", render: (r) => (r.date ? U.fmtDate(r.date) : U.esc(r.dateRaw || "—")) }, { key: "description", label: "Description" },
    { key: "drums", label: "No. of drums", num: true }, { key: "qty", label: "Qty (L)", num: true, render: (r) => U.fmt(r.qty) }, { key: "destination", label: "Transfer to" }, { key: "disposal", label: "Disposal details", render: (r) => U.esc(r.disposal || "—") },
    { key: "remarks", label: "Remarks", render: (r) => U.esc(r.remarks || "") }, { key: "origin", label: "Origin", render: (r) => `<span class="tag-src">${r.historical ? "Dispose Oil Record › MIS" : "System " + r.no}</span>`, csv: (r) => (r.historical ? "Source" : "System") }];
  R.register({
    id: "scrap-disposal", title: "Scrap Oil Disposal",
    intro: "Scrap oil and empty drums dispatched to the disposal yard — historical record FY-21 → FY-27 from the Dispose Oil Record, plus dispatches entered in the system.",
    render(el) {
      const st = S(), all = () => [...st.db.scrapDispatch.slice().reverse(), ...st.scrap().sourceDispatches];
      const src = st.scrap().sourceDispatches, rc = st.scrap().recon;
      el.innerHTML = `${flow(3)}<div class="mt-2">${UI.kpis([{ label: "Historical scrap dispatched", value: `${U.fmt(U.sum(src, (r) => r.qty), 0)} <small>L</small>`, sub: `${src.length} entries FY-21→FY-27` },
          { label: "Scrap oil drums (hist.)", value: U.fmt(U.sum(src.filter((r) => /scrap/i.test(r.description)), (r) => r.drums)) }, { label: "Empty drums (hist.)", value: U.fmt(U.sum(src.filter((r) => /empty/i.test(r.description)), (r) => r.drums)) },
          { label: "Available to dispatch (storage)", value: `${U.fmt(rc.inStorage)} <small>L</small>`, cls: "info" }])}</div>
        ${M.sourceNote("Dispose Oil Record.xlsx › MIS sheet (dates, description, drums, quantity preserved). Historical dispatches are shown for MIS and are not part of the live storage balance because their generation was never recorded. Final disposal (sale / recycler) details are pending.")}
        <div class="card" id="sdTable"></div>`;
      UI.table(el.querySelector("#sdTable"), { id: "scrapdisp", exportName: "scrap_disposal", pageSize: 25, rows: all, dateKey: "date", search: (r) => `${r.description} ${r.remarks || ""} ${r.no}`,
        filters: [{ key: "fy", label: "FY", options: () => U.uniq(all().map((r) => r.fy)).sort() }, { key: "description", label: "Description", options: ["Scrap Oil drums", "Empty oil drums"] }, { key: "h", label: "Origin", options: ["Source", "System"], value: (r) => (r.historical ? "Source" : "System") }],
        columns: sourceDispatchCols, footer: (rs) => `<tr><td colspan="3">Total (filtered)</td><td class="num">${U.fmt(U.sum(rs, (r) => r.drums))}</td><td class="num">${U.fmt(U.sum(rs, (r) => r.qty))}</td><td colspan="4"></td></tr>`,
        toolbar: `<button class="btn btn-sm btn-primary" data-tool="add">+ Record Disposal</button>`,
        onTool: { add: () => UI.formModal({ title: "Record dispatch to disposal yard", size: "lg", intro: M.roleNote("scrap.create", "record disposal"),
          fields: [{ name: "date", label: "Date", type: "date", required: true, notFuture: true }, { name: "description", label: "Description", type: "select", required: true, options: ["Scrap Oil drums", "Empty oil drums"], placeholder: false },
            { name: "drums", label: "No. of drums", type: "number", required: true, gt: 0, integer: true },
            { name: "qty", label: `Quantity in litres (storage balance ${U.fmt(S().scrap().recon.inStorage)} L)`, type: "number", min: 0, custom: (v, a) => (a.description === "Scrap Oil drums" && !(+v > 0) ? "Enter quantity for scrap oil drums" : +v > S().scrap().recon.inStorage + 1e-9 ? `Exceeds storage balance (${U.fmt(S().scrap().recon.inStorage)} L)` : null) },
            { name: "destination", label: "Transfer to", type: "select", required: true, options: ["Disposal Yard"], placeholder: false }, { name: "disposal", label: "Disposal details (gate pass / vendor)", hint: "Pending client process" },
            { name: "remarks", label: "Remarks", type: "textarea", span: "span-2" }],
          values: { date: M.today(), description: "Scrap Oil drums", destination: "Disposal Yard" },
          onChange: (n, v, m) => { if (n === "description" && v.description === "Empty oil drums") { const q = m.body.querySelector('[name="qty"]'); if (q) q.value = 0; } return null; },
          onSubmit: (v) => S().addScrapDispatch(v), successTitle: "Disposal recorded", successText: (r) => `${r.record.no}: ${r.record.drums} drums, ${U.fmt(r.record.qty)} L` }) } });
    }
  });

  R.register({
    id: "scrap-reconciliation", title: "Scrap Oil Reconciliation",
    intro: "Reconciles generated, stored and dispatched scrap oil, and checks the source FY summary against its detailed records.",
    render(el) {
      const st = S(), sc = st.scrap(), rc = sc.recon;
      const fyDetail = U.groupBy(sc.sourceDispatches, (r) => r.fy);
      const fyRows = Object.keys(fyDetail).sort().map((fy) => { const s = st.src.scrap.fySummary.find((x) => x.fy === fy); const det = U.sum(fyDetail[fy], (r) => r.qty);
        return { fy, detail: det, subtotal: st.src.scrap.fyTotalsInSheet[fy], summary: s ? s.qty : null, note: s ? s.remarks : null, drums: U.sum(fyDetail[fy].filter((r) => /scrap/i.test(r.description)), (r) => r.drums) }; });
      el.innerHTML = `${flow(4)}
        <div class="grid grid-2 mt-2">
          ${UI.card({ title: "Live scrap ledger (from go-live)", body: `<table class="kv">
            <tr><th>Opening balance in storage</th><td class="num">${U.fmt(rc.opening)} L <span class="pending-text">(unknown — pending)</span></td></tr>
            <tr><th>+ Generated</th><td class="num">${U.fmt(rc.generated)} L</td></tr><tr><th>− Still at generation points</th><td class="num">${U.fmt(rc.atGenerationPoints)} L</td></tr>
            <tr><th>= Transferred to storage</th><td class="num">${U.fmt(rc.toStorage)} L</td></tr><tr><th>− Dispatched to disposal yard</th><td class="num">${U.fmt(rc.dispatched)} L</td></tr>
            <tr><th><strong>Balance in storage</strong></th><td class="num"><strong>${U.fmt(rc.inStorage)} L</strong></td></tr><tr><th>Total not yet disposed</th><td class="num">${U.fmt(rc.totalUnDisposed)} L</td></tr></table>
            <p class="small muted mt-1">Balance in storage = Opening + Transferred − Dispatched. Generation and disposal are separate events — recording generation never changes disposed quantity.</p>` })}
          ${UI.card({ title: "Scrap quantity by stage", body: '<div class="chart-box short" id="scChart"></div>' })}
        </div>
        ${UI.card({ title: "Source check — FY-wise summary vs detailed MIS records", flush: true, body: `<div class="table-wrap"><table class="data"><thead><tr><th>FY</th><th class="num">Scrap drums</th><th class="num">Sum of detail rows (L)</th><th class="num">Sub-total in MIS sheet</th><th class="num">'FY wise' sheet</th><th>Check</th></tr></thead><tbody>
          ${fyRows.map((r) => { const ok = r.summary === null || Math.abs(r.summary - r.detail) < 0.5; return `<tr class="${ok ? "" : "row-warning"}"><td><strong>${r.fy}</strong></td><td class="num">${U.fmt(r.drums)}</td><td class="num">${U.fmt(r.detail)}</td><td class="num">${U.fmt(r.subtotal)}</td><td class="num">${r.summary === null ? "—" : U.fmt(r.summary)} ${r.note ? `<span class="small muted">(${U.esc(r.note)})</span>` : ""}</td><td>${r.summary === null ? UI.badge("Not in FY sheet") : ok ? UI.badge("Matches", "success") : UI.badge("Differs by " + U.fmt(r.detail - r.summary) + " L", "warning")}</td></tr>`; }).join("")}
          </tbody><tfoot><tr><td>Total</td><td class="num">${U.fmt(U.sum(fyRows, (r) => r.drums))}</td><td class="num">${U.fmt(U.sum(fyRows, (r) => r.detail))}</td><td class="num">${U.fmt(st.src.scrap.fyTotalsInSheet.GRAND)} (grand total)</td><td></td><td></td></tr></tfoot></table></div>` })}`;
      UI.chart(el.querySelector("#scChart"), { type: "bar", unit: "L", data: { labels: ["Generated", "At generation points", "In storage", "Dispatched"], datasets: [{ label: "Scrap (L)", data: [rc.generated, rc.atGenerationPoints, rc.inStorage, rc.dispatched], color: "#1baf7a" }] } });
    }
  });

  window.ScrapUI = { openGenForm };
})();
