/* =========================================================
   validation.js — declarative field validation
   schema field: { name, label, required, type:'number'|'date'|'text',
                   min, max, gt, integer, unique:{list, key, except}, custom(v, all) }
   Returns { ok, errors: {fieldName: message} }
   ========================================================= */
(function () {
  "use strict";
  const V = {};

  V.validate = (values, fields) => {
    const errors = {};
    fields.forEach((f) => {
      if (!f.name || f.type === "section" || f.type === "note" || f.readonly) return;
      let v = values[f.name];
      const empty = v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && !v.length);
      if (f.required && empty) { errors[f.name] = `${f.label || f.name} is required`; return; }
      if (empty) return;
      if (f.type === "number") {
        const n = Number(v);
        if (isNaN(n)) { errors[f.name] = "Enter a valid number"; return; }
        if (f.integer && !Number.isInteger(n)) { errors[f.name] = "Enter a whole number"; return; }
        if (f.gt !== undefined && !(n > f.gt)) { errors[f.name] = `Must be greater than ${f.gt}`; return; }
        if (f.min !== undefined && n < f.min) { errors[f.name] = `Must be at least ${f.min}`; return; }
        const max = typeof f.max === "function" ? f.max(values) : f.max;
        if (max !== undefined && max !== null && n > max + 1e-9) { errors[f.name] = f.maxMsg ? f.maxMsg(max) : `Cannot exceed ${window.U.fmt(max)}`; return; }
      }
      if (f.type === "date") {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { errors[f.name] = "Enter a valid date"; return; }
        if (f.notFuture && v > window.State.today()) { errors[f.name] = "Date cannot be in the future"; return; }
      }
      if (f.unique) {
        const { list, key, except } = f.unique;
        const norm = (x) => String(x).trim().toUpperCase();
        if (list().some((x) => norm(x[key]) === norm(v) && x.id !== except)) { errors[f.name] = `${f.label} must be unique — "${v}" already exists`; return; }
      }
      if (f.custom) { const msg = f.custom(v, values); if (msg) errors[f.name] = msg; }
    });
    return { ok: Object.keys(errors).length === 0, errors };
  };

  window.Validation = V;
})();
