/* =========================================================
   modules/receipt.js — Stock Receipt (Control Store → Lube Cell)
   Draft → Submitted → Confirmed. Only CONFIRMED adds stock.
   ========================================================= */
(function () {
  "use strict";
  const U = window.U, UI = window.UI, R = window.Router, M = window.Mod, N = window.Notify;
  const S = () => window.State;

  const receiptFields = (rec) => [
    { name: "no", label: "Receipt Number", type: "readonly", hint: rec ? "" : "Assigned when saved" },
    { name: "date", label: "Receipt Date", type: "date", required: true, requiredForDraft: true, notFuture: true },
    { name: "supplier", label: "Supplier / From", type: "select", required: true, options: ["Control Store", "Direct supplier (pending process)"], placeholder: false },
    { name: "materialType", label: "Material Type", type: "select", required: true, requiredForDraft: true, options: ["Oil", "Grease"] },
    { name: "gradeId", label: "Oil / Grease Grade", type: "select", required: true, requiredForDraft: true, options: (v) => M.gradeOptions(v.materialType || undefined) },
    { name: "qty", label: "Quantity", type: "number", required: true, gt: 0 },
    { name: "unit", label: "Unit", type: "readonly" },
    { name: "batch", label: "Batch Number", hint: "As printed on the barrel / store slip" },
    { name: "invoice", label: "Invoice / Store Issue Ref." },
    { name: "remarks", label: "Remarks", type: "textarea", span: "span-2" }
  ];

  /** openReceiptForm — new receipt or edit of a DRAFT receipt. */
  function openReceiptForm(rec, prefill = {}) {
    const vals = rec ? { ...rec } : { date: M.today(), supplier: "Control Store", materialType: "Oil", ...prefill };
    if (vals.gradeId) vals.unit = S().unitOf(vals.gradeId);
    UI.formModal({
      title: rec ? `Edit draft receipt ${rec.no}` : "New Stock Receipt", size: "lg", fields: receiptFields(rec), values: vals,
      intro: M.roleNote("receipt.create", "create receipts") + `<div class="stepper"><div class="st done">Control Store</div><div class="st current">Receipt entry</div><div class="st">Validation</div><div class="st">Confirmation</div><div class="st">Stock ledger</div><div class="st">Dashboard</div></div>`,
      buttons: [{ label: "Cancel", close: true, cls: "btn-ghost" }, { label: "Save Draft", act: "draft" }, { label: "Submit for confirmation", act: "submit", cls: "btn-primary" }],
      onChange: (name, v, m) => {
        // Dropdown dependency: grade list follows material type; unit follows grade
        if (name === "materialType") return { rerender: true, values: { gradeId: "", unit: "" } };
        if (name === "gradeId" || name === null) { const u = m.body.querySelector('[name="unit"]'); if (u) u.value = v.gradeId ? S().unitOf(v.gradeId) : ""; }
        return null;
      },
      onSubmit: (v, act) => S().saveReceipt(v, act === "submit" ? "submit" : "draft", rec ? rec.id : null),
      successTitle: (r, act) => (act === "submit" ? "Receipt submitted" : "Draft saved"),
      successText: (r, act) => `${r.record.no} — ${act === "submit" ? "awaiting confirmation. Stock is NOT increased until confirmed." : "stock not affected."}`
    });
  }

  function viewReceipt(r) {
    UI.modal({ title: `Receipt ${r.no}`, body: `<table class="kv">
        <tr><th>Status</th><td>${UI.status(r.status)}</td></tr><tr><th>Date</th><td>${U.fmtDate(r.date)}</td></tr><tr><th>Supplier</th><td>${U.esc(r.supplier || "—")}</td></tr>
        <tr><th>Grade</th><td>${U.esc(S().gradeName(r.gradeId))} (${U.esc(r.materialType || S().grade(r.gradeId).type)})</td></tr><tr><th>Quantity</th><td>${U.fmtQty(r.qty, r.unit)}</td></tr>
        <tr><th>Batch</th><td>${UI.val(r.batch)}</td></tr><tr><th>Invoice</th><td>${U.esc(r.invoice || "—")}</td></tr><tr><th>Remarks</th><td>${U.esc(r.remarks || "—")}</td></tr>
        <tr><th>Created</th><td>${U.esc(r.createdBy || "—")} ${r.createdAt && r.createdAt.length > 2 ? U.fmtDateTime(r.createdAt) : ""}</td></tr>
        ${r.confirmedBy ? `<tr><th>Confirmed</th><td>${U.esc(r.confirmedBy)} ${U.fmtDateTime(r.confirmedAt)}</td></tr>` : ""}
        ${r.source ? `<tr><th>Source</th><td>${UI.src(r.source)}</td></tr>` : ""}
        <tr><th>Stock effect</th><td>${r.status === "CONFIRMED" ? `+${U.fmtQty(r.qty, r.unit)} added to Lube Cell stock` : "None until confirmed"}</td></tr></table>`,
      buttons: [
        ...(r.status === "SUBMITTED" ? [{ label: "Confirm receipt", act: "confirm", cls: "btn-success", left: true }] : []),
        ...(r.status === "DRAFT" ? [{ label: "Edit draft", act: "edit", left: true }] : []),
        { label: "Close", close: true, cls: "btn-primary" }],
      onAction: (a, m) => { m.close(); if (a === "confirm") confirmReceipt(r); if (a === "edit") openReceiptForm(r); } });
  }

  async function confirmReceipt(r) {
    const before = S().available(r.gradeId);
    if (!(await UI.confirm({ title: "Confirm receipt?", text: `Confirming <strong>${U.esc(r.no)}</strong> adds <strong>${U.fmtQty(r.qty, r.unit)}</strong> of ${U.esc(S().gradeName(r.gradeId))} to Lube Cell stock (${U.fmt(before)} → ${U.fmt(before + r.qty)} ${r.unit}).`, okLabel: "Confirm & update stock" }))) return;
    const res = S().confirmReceipt(r.id);
    N.result(res, "Receipt confirmed — stock updated", res.ok ? `${S().gradeName(r.gradeId)}: ${U.fmt(res.before)} → ${U.fmt(res.after)} ${r.unit}` : "");
  }

  R.register({
    id: "stock-receipt", title: "Stock Receipt",
    intro: "Steps 1–2 of the process flow: lube oil / grease issued from Control Store is received into the Lube Oil Cell sub-inventory.",
    render(el, params) {
      const recs = () => S().db.txns.filter((t) => t.type === "RECEIPT");
      const all = recs();
      el.innerHTML = `
        ${UI.flow([{ t: "Control Store", d: "Material issued to Lube Cell" }, { t: "Receipt entry", d: "Save draft or submit", cls: "system" }, { t: "Validation", d: "Grade, quantity > 0, date not in future", cls: "system" },
          { t: "Receipt confirmation", d: "Store / In-charge confirms", cls: "decision" }, { t: "Stock ledger", d: "+ quantity", cls: "output", link: "stock-ledger" }, { t: "Inventory dashboard", cls: "output", link: "inventory-dashboard" }])}
        <div class="mt-2">${UI.kpis([
          { label: "Drafts", value: all.filter((r) => r.status === "DRAFT").length, cls: "neutral" },
          { label: "Awaiting confirmation", value: all.filter((r) => r.status === "SUBMITTED").length, cls: "warning" },
          { label: "Confirmed receipts", value: all.filter((r) => r.status === "CONFIRMED").length, cls: "success", sub: `${U.fmt(U.sum(all.filter((r) => r.status === "CONFIRMED" && r.unit === "L"), (r) => r.qty))} L · ${U.fmt(U.sum(all.filter((r) => r.status === "CONFIRMED" && r.unit === "kg"), (r) => r.qty))} kg` }
        ])}</div>
        ${M.sourceNote(`Seeded receipts are the <em>monthly totals</em> in column "STOCK ISSUED FROM CENTRAL STORE" of ${U.esc(S().src.inventory.months[S().src.inventory.latestMonth].sheet)} (a receipt for the Lube Cell). Individual receipt dates, batch and invoice numbers are not in the source.`)}
        <div class="card" id="rcTable"></div>`;
      UI.table(el.querySelector("#rcTable"), {
        id: "receipts", exportName: "stock_receipts", rows: () => recs().slice().reverse(), dateKey: "date", dateLabel: "Receipt date",
        search: (r) => `${r.no} ${S().gradeName(r.gradeId)} ${r.batch || ""} ${r.invoice || ""} ${r.supplier || ""}`,
        filters: [{ key: "status", label: "Status", options: ["DRAFT", "SUBMITTED", "CONFIRMED", "CANCELLED"] }, { key: "mt", label: "Material", options: ["Oil", "Grease"], value: (r) => (S().grade(r.gradeId) || {}).type }],
        columns: [{ key: "no", label: "Receipt No.", render: (r) => `<span class="mono">${U.esc(r.no)}</span>` }, { key: "date", label: "Date", render: (r) => U.fmtDate(r.date) },
          { key: "supplier", label: "Supplier" }, { key: "grade", label: "Grade", sortVal: (r) => S().gradeName(r.gradeId), render: (r) => U.esc(S().gradeName(r.gradeId)) },
          { key: "qty", label: "Quantity", num: true, render: (r) => U.fmtQty(r.qty, r.unit) }, { key: "batch", label: "Batch", render: (r) => U.esc(r.batch || "—") },
          { key: "invoice", label: "Invoice", render: (r) => U.esc(r.invoice || "—") }, { key: "status", label: "Status", render: (r) => UI.status(r.status) + (r.source ? " " + UI.badge("Source", "outline") : "") }],
        toolbar: `<button class="btn btn-sm btn-primary" data-tool="add">+ Add Receipt</button>`, onTool: { add: () => openReceiptForm(null) },
        actions: (r) => UI.act("view", "View") + (r.status === "DRAFT" ? UI.act("edit", "Edit Draft") + UI.act("submit", "Submit") : "") + (r.status === "SUBMITTED" ? UI.act("confirm", "Confirm", "btn-xs btn-success") : "") + (["DRAFT", "SUBMITTED"].includes(r.status) ? UI.act("cancel", "Cancel", "btn-xs btn-danger-ghost") : ""),
        onAction: {
          view: viewReceipt, edit: openReceiptForm, confirm: confirmReceipt,
          submit: (r) => N.result(S().saveReceipt({ ...r }, "submit", r.id), "Receipt submitted", `${r.no} awaiting confirmation`),
          cancel: async (r) => { if (await UI.confirm({ title: "Cancel receipt?", text: `${U.esc(r.no)} will be cancelled. Stock is not affected.`, okLabel: "Cancel receipt", danger: true })) N.result(S().cancelReceipt(r.id), "Receipt cancelled", r.no); }
        },
        rowClass: (r) => (r.status === "SUBMITTED" ? "row-warning" : r.status === "CONFIRMED" ? "row-success" : "")
      });
      if (R.consume(params, "new")) setTimeout(() => openReceiptForm(null), 0);
    }
  });
  window.ReceiptUI = { openReceiptForm };
})();
