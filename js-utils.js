/* =========================================================
   utils.js — small, dependency-free helpers (no DOM state)
   ========================================================= */
(function () {
  "use strict";
  const U = {};

  /** HTML-escape any value for safe insertion into innerHTML. */
  U.esc = (v) => (v === null || v === undefined ? "" : String(v))
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  U.round = (n, d = 2) => (n === null || n === undefined || isNaN(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
  U.sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  U.groupBy = (arr, f) => arr.reduce((m, x) => { const k = typeof f === "function" ? f(x) : x[f]; (m[k] = m[k] || []).push(x); return m; }, {});
  U.uniq = (arr) => Array.from(new Set(arr.filter((x) => x !== null && x !== undefined && x !== "")));
  U.median = (arr) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  U.clone = (o) => JSON.parse(JSON.stringify(o));
  U.debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  U.normKey = (s) => String(s || "").toUpperCase().replace(/GEAR\s*BOX/g, "").replace(/MOTOR/g, "").replace(/UNIT|U#/g, "").replace(/[^A-Z0-9]/g, "");

  /** Number formatting — Indian grouping, trims trailing zeros. */
  U.fmt = (n, d = 2) => {
    if (n === null || n === undefined || n === "" || isNaN(n)) return "—";
    return Number(n).toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: 0 });
  };
  U.fmtQty = (n, unit) => (n === null || n === undefined || isNaN(n) ? "—" : U.fmt(n) + (unit ? " " + unit : ""));
  U.fmtMoney = (n) => (n === null || n === undefined || isNaN(n) ? "—" : "₹ " + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 }));
  U.pct = (n) => (n === null || n === undefined || isNaN(n) ? "—" : U.round(n, 1) + "%");

  /* ---------- Dates (ISO yyyy-mm-dd internally; dd.mm.yyyy on screen, as in source) ---------- */
  U.iso = (d) => { const z = (x) => String(x).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
  U.parseISO = (s) => { if (!s) return null; const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); if (!y || !m || !d) return null; return new Date(y, m - 1, d); };
  U.fmtDate = (s) => { if (!s) return "—"; const p = String(s).slice(0, 10).split("-"); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : U.esc(s); };
  U.fmtDateTime = (s) => { if (!s) return "—"; const d = new Date(s); return isNaN(d) ? s : `${U.fmtDate(U.iso(d))} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  U.addDays = (s, n) => { const d = U.parseISO(s); if (!d) return null; d.setDate(d.getDate() + n); return U.iso(d); };
  U.diffDays = (a, b) => { const x = U.parseISO(a), y = U.parseISO(b); if (!x || !y) return null; return Math.round((x - y) / 86400000); };
  U.monthLabel = (ym) => { if (!ym) return "—"; const [y, m] = ym.split("-"); return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m - 1] + "'" + y.slice(2); };
  /** Indian financial year label: Apr-2026..Mar-2027 => FY-27 (same convention as source). */
  U.fyOf = (s) => { if (!s) return null; const y = +s.slice(0, 4), m = +s.slice(5, 7); const start = m >= 4 ? y : y - 1; return "FY-" + String((start + 1) % 100).padStart(2, "0"); };
  U.inRange = (s, from, to) => (!from || (s && s >= from)) && (!to || (s && s <= to));

  let seq = Date.now() % 100000;
  U.uid = (prefix = "ID") => `${prefix}-${(++seq).toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

  /** Running document number like RCP-2611-0003 (prefix-YYMM-seq) given existing numbers. */
  U.nextDocNo = (prefix, existing, dateIso) => {
    const ym = (dateIso || U.iso(new Date())).slice(2, 7).replace("-", "");
    const re = new RegExp(`^${prefix}-${ym}-(\\d+)$`);
    const max = existing.reduce((m, n) => { const r = re.exec(n || ""); return r ? Math.max(m, +r[1]) : m; }, 0);
    return `${prefix}-${ym}-${String(max + 1).padStart(4, "0")}`;
  };

  window.U = U;
})();
