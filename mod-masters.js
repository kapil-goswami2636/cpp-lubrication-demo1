/* =========================================================
   modules/masters.js — Oil / Grease / Department / Area /
   Inventory Location masters and User & Role management
   ========================================================= */
(function () {
  "use strict";
  const U = window.U, UI = window.UI, R = window.Router, M = window.Mod, N = window.Notify;
  const S = () => window.State;

  /* ---------------- Oil & Grease master (shared renderer) ---------------- */
  function gradePage(type) {
    return function (el) {
      const st = S();
      const rows = () => st.db.grades.filter((g) => g.type === type).map((g) => ({ ...g, stock: st.available(g.id) }));
      const unit = type === "Oil" ? "L" : "kg";
      el.innerHTML = `
        ${UI.kpis([
          { label: `${type} grades`, value: rows().length, sub: `${rows().filter((g) => g.status === "Active").length} active` },
          { label: "With item code", value: rows().filter((g) => g.itemCode).length, sub: "From MIS 'Sheet1' item codes" },
          { label: "With unit price", value: rows().filter((g) => g.unitPrice).length, sub: "Updated unit price (MIS)" },
          { label: `Total stock`, value: `${U.fmt(U.sum(rows(), (g) => g.stock), 0)} <small>${unit}</small>`, link: "inventory" }
        ])}
        ${M.sourceNote(`Grade names, units and unit prices from <em>Lubrication MIS FY-27 › ${U.esc(st.src.inventory.months[st.src.inventory.latestMonth].sheet)}</em>; grades seen only in older sheets are kept as <strong>Inactive</strong> so history still resolves. Min / reorder levels are ILLUSTRATIVE suggestions.`)}
        <div class="card" id="grTable"></div>`;
      UI.table(el.querySelector("#grTable"), {
        id: "grades-" + type, exportName: type.toLowerCase() + "_master", rows, search: (g) => `${g.name} ${g.itemCode || ""}`,
        filters: [{ key: "status", label: "Status", options: ["Active", "Inactive"] }],
        columns: [
          { key: "name", label: "Grade", render: (g) => `<strong>${U.esc(g.name)}</strong>` }, { key: "itemCode", label: "Item code", render: (g) => (g.itemCode ? `<span class="mono">${U.esc(g.itemCode)}</span>` : "—") },
          { key: "unit", label: "Unit" }, { key: "unitPrice", label: "Unit price", num: true, render: (g) => (g.unitPrice ? U.fmtMoney(g.unitPrice) : "—") },
          { key: "stock", label: "Current stock", num: true, render: (g) => U.fmtQty(g.stock, g.unit) },
          { key: "minStock", label: "Min stock", num: true, render: (g) => (g.minStock === null ? '<span class="pending-text">Pending</span>' : U.fmt(g.minStock)) },
          { key: "reorderLevel", label: "Reorder level", num: true, render: (g) => (g.reorderLevel === null ? '<span class="pending-text">Pending</span>' : U.fmt(g.reorderLevel)) },
          { key: "status", label: "Status", render: (g) => UI.status(g.status) }
        ],
        toolbar: `<button class="btn btn-sm btn-primary" data-tool="add">+ Add ${type} Grade</button>`,
        onTool: { add: () => addGrade(type) },
        actions: () => UI.act("view", "View") + UI.act("edit", "Edit"),
        onAction: {
          view: (g) => UI.view(g.name, [["Grade ID", `<span class="mono">${U.esc(g.id)}</span>`], ["Type", g.type], ["Unit", g.unit], ["Item code", U.esc(g.itemCode || "—")], ["Unit price", g.unitPrice ? U.fmtMoney(g.unitPrice) + " / " + g.unit : "—"],
            ["Current stock", U.fmtQty(g.stock, g.unit)], ["Minimum stock", U.fmt(g.minStock)], ["Reorder level", U.fmt(g.reorderLevel)], ["Level basis", `<span class="small">${U.esc(g.levelBasis || "")}</span>`], ["Last seen in source", U.esc(g.lastSeenSheet || "Created in demo")], ["Status", UI.status(g.status)]]),
          edit: (g) => UI.formModal({ title: `Edit grade — ${g.name}`, values: g, intro: M.roleNote("*", "edit grade master"),
            fields: [{ name: "itemCode", label: "Item code" }, { name: "unitPrice", label: `Unit price (₹ / ${g.unit})`, type: "number", min: 0 },
              { name: "minStock", label: `Minimum stock (${g.unit})`, type: "number", min: 0, hint: "ILLUSTRATIVE until approved" },
              { name: "reorderLevel", label: `Reorder level (${g.unit})`, type: "number", min: 0, custom: (v, all) => (all.minStock !== "" && v !== "" && +v < +all.minStock ? "Reorder level should not be below minimum stock" : null) },
              { name: "status", label: "Status", type: "select", options: ["Active", "Inactive"], placeholder: false }],
            onSubmit: (v) => S().saveGrade(g.id, v), successTitle: "Grade updated", successText: g.name })
        }
      });
    };
  }
  function addGrade(type) {
    const unit = type === "Oil" ? "L" : "kg";
    UI.formModal({ title: `Add ${type} grade`, intro: M.roleNote("*", "add grades"),
      fields: [{ name: "name", label: "Grade name", required: true, unique: { list: () => S().db.grades, key: "name" } }, { name: "itemCode", label: "Item code" },
        { name: "unitPrice", label: `Unit price (₹ / ${unit})`, type: "number", min: 0 }, { name: "minStock", label: "Minimum stock", type: "number", min: 0 }, { name: "reorderLevel", label: "Reorder level", type: "number", min: 0 }],
      onSubmit: (v) => S().saveSimpleMaster("grades", { id: (type === "Oil" ? "OIL-" : "GR-") + v.name.toUpperCase().replace(/[^A-Z0-9]/g, ""), name: v.name, itemCode: v.itemCode || null, type, unit,
        unitPrice: v.unitPrice ? +v.unitPrice : null, minStock: v.minStock ? +v.minStock : null, reorderLevel: v.reorderLevel ? +v.reorderLevel : null, status: "Active", active: true, levelBasis: "Entered in demo", lastSeenSheet: null }, null, "Grade"),
      successTitle: "Grade added" });
  }
  R.register({ id: "oil-master", title: "Oil Master", intro: "Lube oil grades handled by the Lube Oil Cell with unit, item code, price and stock levels.", render: gradePage("Oil") });
  R.register({ id: "grease-master", title: "Grease Master", intro: "Grease grades with unit (kg), price and stock levels.", render: gradePage("Grease") });

  /* ---------------- Simple masters ---------------- */
  function simpleMaster({ id, collection, label, columns, fields, intro, note }) {
    R.register({
      id, title: label + " Master", intro,
      render(el) {
        el.innerHTML = `${note || ""}<div class="card" id="smTable"></div>`;
        const form = (r) => UI.formModal({ title: `${r ? "Edit" : "Add"} ${label}`, values: r || { status: "Active" }, fields, intro: M.roleNote("*", "maintain master data"),
          onSubmit: (v) => S().saveSimpleMaster(collection, v, r ? r.id : null, label), successTitle: `${label} saved` });
        UI.table(el.querySelector("#smTable"), {
          id: "sm-" + id, exportName: id, rows: () => S().db[collection], columns,
          filters: [{ key: "status", label: "Status", options: ["Active", "Inactive"] }],
          toolbar: `<button class="btn btn-sm btn-primary" data-tool="add">+ Add ${label}</button>`, onTool: { add: () => form(null) },
          actions: () => UI.act("view", "View") + UI.act("edit", "Edit"),
          onAction: { edit: form, view: (r) => UI.view(`${label}: ${r.name}`, columns.map((c) => [c.label, c.render ? c.render(r) : U.esc(r[c.key] ?? "—")])) }
        });
      }
    });
  }
  const statusField = { name: "status", label: "Status", type: "select", options: ["Active", "Inactive"], placeholder: false };
  simpleMaster({ id: "department-master", collection: "departments", label: "Department", intro: "Departments that request / receive oil and grease.",
    note: M.sourceNote("Department names from the 'New oil / grease issued to department' sections of the FY-27 MIS sheets. Spelling variants found in the source (e.g. MAINTNENANCE) are preserved in the <em>Source spellings</em> column."),
    columns: [{ key: "id", label: "ID", render: (r) => `<span class="mono">${U.esc(r.id)}</span>` }, { key: "name", label: "Department", render: (r) => `<strong>${U.esc(r.name)}</strong>` },
      { key: "spellings", label: "Source spellings", render: (r) => U.esc((r.spellings || []).join(", ") || "—"), csv: (r) => (r.spellings || []).join("; ") }, { key: "source", label: "Source", render: (r) => `<span class="small">${U.esc(r.source || "Created in demo")}</span>` }, { key: "status", label: "Status", render: (r) => UI.status(r.status) }],
    fields: [{ name: "name", label: "Department name", required: true, unique: { list: () => S().db.departments, key: "name" } }, statusField] });
  simpleMaster({ id: "area-master", collection: "areas", label: "Area", intro: "Plant areas and sub-areas used across the lubrication workbooks.",
    note: M.sourceNote("Areas from top-up history sheet names, sampling sheet 'Area' columns and greasing sheet names. Aliases show the different spellings used in the sources."),
    columns: [{ key: "id", label: "ID", render: (r) => `<span class="mono">${U.esc(r.id)}</span>` }, { key: "name", label: "Area", render: (r) => `<strong>${U.esc(r.name)}</strong>` },
      { key: "aliases", label: "Aliases / sub-areas in source", render: (r) => U.esc((r.aliases || []).join(", ") || "—"), csv: (r) => (r.aliases || []).join("; ") },
      { key: "eq", label: "Equipment", num: true, nosort: true, render: (r) => U.fmt(S().db.equipment.filter((e) => e.area === r.name).length), csv: (r) => S().db.equipment.filter((e) => e.area === r.name).length },
      { key: "remarks", label: "Remarks", render: (r) => `<span class="small">${U.esc(r.remarks || "")}</span>` }, { key: "status", label: "Status", render: (r) => UI.status(r.status) }],
    fields: [{ name: "name", label: "Area name", required: true, unique: { list: () => S().db.areas, key: "name" } }, { name: "remarks", label: "Remarks" }, statusField] });
  simpleMaster({ id: "location-master", collection: "locations", label: "Inventory Location", intro: "Stock-holding and scrap locations in the lubrication process.",
    note: M.sourceNote("Control Store and Lube Oil Cell sub-inventory from the process flow; re-condition tanks from the sampling schedule; disposal yard from the Dispose Oil Record. Only the Lube Oil Cell sub-inventory carries a stock ledger in this demo."),
    columns: [{ key: "id", label: "ID", render: (r) => `<span class="mono">${U.esc(r.id)}</span>` }, { key: "name", label: "Location", render: (r) => `<strong>${U.esc(r.name)}</strong>` }, { key: "type", label: "Type" },
      { key: "source", label: "Source", render: (r) => (r.source === "Pending Client Confirmation" ? UI.pending() : `<span class="small">${U.esc(r.source || "Created in demo")}</span>`) }, { key: "remarks", label: "Remarks", render: (r) => `<span class="small">${U.esc(r.remarks || "")}</span>` }],
    fields: [{ name: "name", label: "Location name", required: true }, { name: "type", label: "Type", type: "select", required: true, options: ["Upstream store", "Sub inventory (stock-holding)", "Re-condition oil tank", "Used oil tank", "Scrap storage", "Scrap dispatch destination"] }, { name: "remarks", label: "Remarks" }] });

  /* ---------------- Users & roles ---------------- */
  const PERMS = [["receipt.create", "Create receipts"], ["receipt.confirm", "Confirm receipts"], ["issue.create", "Issue stock / request adjustment"], ["issue.approve", "Approve issues"], ["consumption.create", "Record consumption"],
    ["return.create", "Record returns"], ["greasing.create", "Record greasing"], ["sampling.create", "Sampling & analysis entry"], ["scrap.create", "Scrap entries"], ["filtration.create", "Filtration & PM"], ["inspection.create", "Daily inspection"], ["handover.create", "Shift handover"], ["alerts.ack", "Acknowledge alerts"], ["*", "Approve adjustments / exceptions, maintain masters, settings"]];
  R.register({
    id: "users", title: "User & Role Management",
    intro: "Demo identities and role permissions. Switch the active role from the profile menu to see permission checks in action.",
    render(el) {
      const st = S();
      el.innerHTML = `${UI.callout("illus", "<strong>ILLUSTRATIVE:</strong> roles, permissions and users are placeholders (no real names). Final roles are a client decision. Production would use plant authentication / SSO (proposed).")}
        <div class="card" id="usrTable"></div>
        ${UI.card({ title: "Role permission matrix", flush: true, body: `<div class="table-wrap"><table class="data compact"><thead><tr><th>Permission</th>${st.cfg.roles.map((r) => `<th class="num">${U.esc(r.name)}</th>`).join("")}</tr></thead><tbody>
          ${PERMS.map(([p, l]) => `<tr><td>${l}</td>${st.cfg.roles.map((r) => `<td class="num">${r.perms.includes("*") || r.perms.includes(p) ? "✔" : "—"}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` })}`;
      const roleName = (id) => (st.cfg.roles.find((r) => r.id === id) || {}).name || id;
      UI.table(el.querySelector("#usrTable"), {
        id: "users", exportName: "users", rows: () => S().db.users,
        filters: [{ key: "role", label: "Role", options: st.cfg.roles.map((r) => ({ value: r.id, label: r.name })) }],
        columns: [{ key: "id", label: "User ID", render: (u) => `<span class="mono">${u.id}</span>` }, { key: "name", label: "Name", render: (u) => `<strong>${U.esc(u.name)}</strong>` }, { key: "role", label: "Role", render: (u) => U.esc(roleName(u.role)) },
          { key: "dept", label: "Department" }, { key: "status", label: "Status", render: (u) => UI.status(u.status) }],
        toolbar: `<button class="btn btn-sm btn-primary" data-tool="add">+ Add User</button>`,
        onTool: { add: () => userForm(null) },
        actions: (u) => UI.act("edit", "Edit") + UI.act("as", "Act as this role", "btn-xs btn-ghost"),
        onAction: { edit: (u) => userForm(u), as: (u) => { S().setRole(u.role); window.Nav.renderProfile(); N.toast("Role switched", `Now acting as ${roleName(u.role)}.`); } }
      });
      function userForm(u) {
        UI.formModal({ title: u ? "Edit user" : "Add user", values: u || { status: "Active" }, intro: M.roleNote("*", "manage users"),
          fields: [{ name: "name", label: "Display name", required: true }, { name: "role", label: "Role", type: "select", required: true, options: st.cfg.roles.map((r) => ({ value: r.id, label: r.name })) },
            { name: "dept", label: "Department", type: "select", options: () => M.deptOptions().concat(["Control Store", "CPP Operations", "CPP Management", "IT"]) }, statusField],
          onSubmit: (v) => S().saveSimpleMaster("users", v, u ? u.id : null, "User"), successTitle: "User saved" });
      }
    }
  });
})();
