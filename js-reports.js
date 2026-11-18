/* =========================================================
   reports.js — export helpers (CSV always works; Excel via
   SheetJS and PDF via jsPDF when the CDN libraries loaded,
   otherwise graceful fallback to CSV / browser print).
   ========================================================= */
(function () {
  "use strict";
  const U = window.U;
  const R = {};
  const stamp = () => U.iso(new Date()).replace(/-/g, "");
  const strip = (html) => { const d = document.createElement("div"); d.innerHTML = String(html ?? ""); return (d.textContent || "").replace(/\s+/g, " ").trim(); };

  /** Convert table columns + rows into a plain matrix using csv() or render() text. */
  R.matrix = (columns, rows) => {
    const cols = columns.filter((c) => !c.noexport);
    const head = cols.map((c) => c.label);
    const body = rows.map((r) => cols.map((c) => {
      if (c.csv) return c.csv(r);
      if (c.render) return strip(c.render(r));
      const v = r[c.key]; return v === null || v === undefined ? "" : v;
    }));
    return { head, body };
  };

  R.download = (filename, content, mime) => {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  R.csv = (name, head, body) => {
    const q = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const text = "﻿" + [head, ...body].map((r) => r.map(q).join(",")).join("\r\n");
    R.download(`${name}_${stamp()}.csv`, text, "text/csv;charset=utf-8");
  };

  R.xlsx = (name, head, body, sheet = "Report") => {
    if (!window.XLSX) { window.Notify.warn("Excel library unavailable", "Exported as CSV instead (opens in Excel)."); return R.csv(name, head, body); }
    const ws = window.XLSX.utils.aoa_to_sheet([["CPP Digital Lubrication Management System — DEMO export (illustrative)"], [], head, ...body]);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 30));
    window.XLSX.writeFile(wb, `${name}_${stamp()}.xlsx`);
  };

  R.pdf = (name, head, body, title) => {
    const jsPDF = window.jspdf && window.jspdf.jsPDF;
    if (jsPDF) {
      const doc = new jsPDF({ orientation: head.length > 6 ? "landscape" : "portrait", unit: "pt", format: "a4" });
      doc.setFontSize(13); doc.text(title || name, 36, 36);
      doc.setFontSize(8); doc.setTextColor(120); doc.text(`DEMO export — illustrative prototype, not connected to plant systems. Generated ${U.fmtDateTime(new Date().toISOString())}`, 36, 50);
      // jsPDF standard fonts do not include the ₹ glyph — replace for PDF output only
      const clean = (v) => String(v ?? "").replace(/₹/g, "Rs.").replace(/[^\x20-\x7E -ÿ]/g, "");
      if (doc.autoTable) doc.autoTable({ head: [head.map(clean)], body: body.map((r) => r.map(clean)), startY: 60, styles: { fontSize: 7.5, cellPadding: 3 }, headStyles: { fillColor: [22, 58, 99] } });
      else body.slice(0, 60).forEach((r, i) => doc.text(r.map(clean).join(" | ").slice(0, 160), 36, 72 + i * 11));
      doc.save(`${name}_${stamp()}.pdf`);
      return;
    }
    // Fallback: printable window (user can "Save as PDF")
    const w = window.open("", "_blank");
    if (!w) { window.Notify.error("PDF export blocked", "Allow pop-ups or use CSV/Excel export."); return; }
    w.document.write(`<!doctype html><title>${U.esc(title || name)}</title><style>body{font:12px Segoe UI,Arial;margin:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px 6px;text-align:left}th{background:#163a63;color:#fff}</style>
      <h2>${U.esc(title || name)}</h2><p>DEMO export — illustrative prototype.</p><table><thead><tr>${head.map((h) => `<th>${U.esc(h)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${U.esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
    w.document.close(); w.focus(); w.print();
  };

  R.exportTable = (fmt, name, columns, rows) => {
    if (!rows.length) { window.Notify.warn("Nothing to export", "No rows match the current filters."); return; }
    const { head, body } = R.matrix(columns, rows);
    const title = name.replace(/[_-]/g, " ");
    if (fmt === "csv") R.csv(name, head, body);
    else if (fmt === "xlsx") R.xlsx(name, head, body, title);
    else R.pdf(name, head, body, title);
    window.Notify.success("Export started", `${rows.length} row(s) → ${fmt.toUpperCase()}`);
    if (window.State) { window.State.db.audit.unshift({ id: U.uid("AUD"), at: new Date().toISOString(), user: window.State.user().name, role: window.State.role().name, action: "Report exported", entity: "Reports", ref: name, detail: `${fmt.toUpperCase()}, ${rows.length} rows` }); window.State.save(); }
  };

  window.Reports = R;
})();
