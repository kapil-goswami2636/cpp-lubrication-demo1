/* =====================================================================
   state.js — demo data store + business operations (no DOM code here)

   • Read-only SOURCE data comes from window.CPP_SOURCE (generated from the
     client's Excel files). It is never modified.
   • Mutable DEMO data (transactions, entries, master edits) lives in State.db
     and is persisted to localStorage via DemoStore.
   • Every mutation: validates → changes db → writes audit trail →
     raises a notification → saves → emits "change".
   ===================================================================== */
(function () {
  "use strict";
  const U = window.U, Calc = window.Calc;
  const VERSION = 5;
  const listeners = [];
  const S = { db: null, src: null, cfg: null, idx: {} };

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */
  const AREA_MAP = {
    TGAUX: "TG&Aux", BOILERAUX: "Boiler&Aux", WBLRSB: "Boiler&Aux", MILL: "Mill", BOP: "BOP", FWPH: "BOP", AHP: "AHP",
    ESP: "ESP", CHP: "CHP", WT: "CHP", FGD: "FGD", FILTRATIONMACHINE: "Filtration Machine", BSDG: "BOP", BTG: "BTG",
    MAINCOMPRESSOR: "BOP", TACCOMPRESSOR: "AHP", LUBRICATIONCELL: "Lubrication Cell", WATERSYSTEM: "BOP"
  };
  S.areaOf = (raw) => { if (!raw) return null; const k = String(raw).toUpperCase().replace(/[^A-Z]/g, ""); return AREA_MAP[k] || String(raw).trim(); };
  const DEPT_FIX = (raw) => String(raw || "").trim().replace(/MAINTNENANCE|MAITNENANCE|MAINTANANCE/gi, "MAINTENANCE").replace(/\s+/g, " ");

  S.today = () => (S.db && S.db.settings.demoDate) || U.iso(new Date());
  S.fyStart = () => { const t = S.today(); const y = +t.slice(0, 4), m = +t.slice(5, 7); return `${m >= 4 ? y : y - 1}-04-01`; };
  S.goLive = () => S.src.inventory.latestMonth + "-01";
  S.on = (fn) => listeners.push(fn);
  const emit = (what) => listeners.forEach((fn) => { try { fn(what); } catch (e) { console.error(e); } });

  S.save = () => { const ok = window.DemoStore.set("db", S.db); if (!ok && window.DemoStore.available()) console.warn("Could not persist demo state"); return ok; };

  /* ------------------------------------------------------------------ */
  /* Users / roles                                                       */
  /* ------------------------------------------------------------------ */
  S.role = () => S.cfg.roles.find((r) => r.id === S.db.settings.role) || S.cfg.roles[1];
  S.user = () => S.cfg.users.find((u) => u.role === S.db.settings.role) || S.cfg.users[2];
  S.can = (perm) => { const p = S.role().perms; return p.includes("*") || p.includes(perm); };
  S.setRole = (roleId) => { S.db.settings.role = roleId; audit("Role switched", "Settings", roleId, `Demo role changed to ${S.role().name}`); S.save(); emit("role"); };

  function audit(action, entity, ref, detail) {
    S.db.audit.unshift({ id: U.uid("AUD"), at: new Date().toISOString(), user: S.user().name, role: S.role().name, action, entity, ref: ref || "", detail: detail || "" });
    if (S.db.audit.length > 1500) S.db.audit.length = 1500;
  }
  function notify(title, text, sev = "info", link = null) {
    S.db.notifications.unshift({ id: U.uid("N"), at: new Date().toISOString(), title, text, sev, read: false, link });
    if (S.db.notifications.length > 300) S.db.notifications.length = 300;
  }
  function commit(what, auditArgs, notifyArgs) {
    if (auditArgs) audit(...auditArgs);
    if (notifyArgs) notify(...notifyArgs);
    S.save();
    emit(what);
  }
  const fail = (error) => ({ ok: false, error });

  /* ------------------------------------------------------------------ */
  /* Seed builder — derives the initial demo dataset from SOURCE data    */
  /* ------------------------------------------------------------------ */
  function buildSeed() {
    const src = S.src, cfg = S.cfg;
    const db = {
      version: VERSION, createdAt: new Date().toISOString(),
      settings: { role: "INCHARGE", demoDate: null, issueApproval: false, adjustmentApproval: true, excludeRemarked: false,
        samplingLead: 7, greasingLead: 7, pmLead: 7, filtrationLead: 7, defaultGreasingFreq: 90, scrapOpening: 0 },
      grades: [], equipment: [], departments: [], areas: [], locations: U.clone(cfg.locations), users: U.clone(cfg.users),
      txns: [], requests: [], receiptsMeta: {}, topups: [], greasing: [], motorOverrides: {}, samples: [], analysis: [], filtration: [],
      filtrationMachines: [], spares: U.clone(cfg.filtrationSpares), pm: [], inspections: [], handovers: [],
      scrapGen: [], scrapTransfers: [], scrapDispatch: [], alertStates: {}, validation: {}, audit: [], notifications: []
    };

    /* Grades (Oil / Grease master) — from MIS inventory sheets */
    const fy27 = Object.keys(src.inventory.months).filter((m) => U.fyOf(m + "-01") === "FY-27" && m < src.inventory.latestMonth);
    src.inventory.grades.forEach((g) => {
      const sug = Calc.suggestLevels(src.inventory.months, g.id, fy27);
      db.grades.push({ ...g, minStock: sug ? sug.minStock : null, reorderLevel: sug ? sug.reorderLevel : null,
        levelBasis: sug ? `ILLUSTRATIVE suggestion: avg monthly consumption ${U.fmt(sug.avgMonthly)} ${g.unit} over ${sug.basisMonths} month(s) of FY-27 (min = 50%, reorder = 100%). Pending client approval.` : "No consumption history — levels pending",
        status: g.active ? "Active" : "Inactive" });
    });
    const gradeIds = new Set(db.grades.map((g) => g.id));

    /* Opening balance + monthly receipt for the latest source month (go-live month) */
    const latest = src.inventory.months[src.inventory.latestMonth];
    const goLive = src.inventory.latestMonth + "-01";
    latest.blocks.forEach((b) => b.items.forEach((it) => {
      if (!it.gradeId || !gradeIds.has(it.gradeId)) return;
      const unit = (it.kind || b.kind) === "grease" ? "kg" : "L";
      if (it.opening) db.txns.push({ id: U.uid("T"), no: "OPN-" + it.gradeId, type: "OPENING", status: "CONFIRMED", date: goLive, gradeId: it.gradeId, qty: it.opening, unit,
        remarks: "Opening stock from source — verification pending (Q1)", source: `Lubrication MIS FY-27 › ${latest.sheet} › Opening stock`, createdAt: "0" });
      if (it.receipt) db.txns.push({ id: U.uid("T"), no: U.nextDocNo("RCP", db.txns.map((t) => t.no), goLive), type: "RECEIPT", status: "CONFIRMED", date: goLive,
        gradeId: it.gradeId, qty: it.receipt, unit, supplier: "Control Store", materialType: b.kind === "grease" ? "Grease" : "Oil", batch: null, invoice: null,
        remarks: "Monthly total received from Central Store — individual receipt dates not in source", source: `Lubrication MIS FY-27 › ${latest.sheet} › Stock issued from Central Store`, createdAt: "1" });
    }));

    /* Equipment-wise consumption in the go-live month → ISSUE + linked CONSUMPTION (stock deducted once, at issue) */
    const sec = src.consumption.sections;
    const inMonth = (r) => r.month === src.inventory.latestMonth && r.gradeId && gradeIds.has(r.gradeId);
    const activityOf = (r) => {
      const rem = (r.remarks || "").toLowerCase();
      if (rem.includes("replacement")) return "Replacement";
      if ((r.changeQty || 0) > 0 && (r.topupQty || 0) > 0) return "Oil Change + Top-up";
      if ((r.changeQty || 0) > 0) return "Oil Change";
      return "Top-up";
    };
    const pushIssueConsumption = (r, kind) => {
      const qty = kind === "dept" ? r.qty : r.totalQty;
      if (!qty || qty <= 0) return;
      const unit = r.gradeId.startsWith("GR-") ? "kg" : "L";
      const issueId = U.uid("T");
      const ref = `Lubrication MIS FY-27 › ${r.sheet} › row ${r.row}`;
      db.txns.push({ id: issueId, no: U.nextDocNo("ISS", db.txns.map((t) => t.no), r.date || goLive), type: "ISSUE", status: "ISSUED", date: r.date || goLive,
        gradeId: r.gradeId, qty, unit, dept: kind === "dept" ? DEPT_FIX(r.dept) : "Lubrication Cell (equipment booking)",
        equipment: kind === "dept" ? (r.purpose || null) : r.equipment, area: kind === "dept" ? S.areaOf(r.issuedTo) : S.areaOf(r.area),
        requestedQty: qty, issuedBy: "Source record", remarks: r.remarks || "", source: ref, createdAt: "2" });
      db.txns.push({ id: U.uid("T"), no: U.nextDocNo("CON", db.txns.map((t) => t.no), r.date || goLive), type: "CONSUMPTION", status: "CONFIRMED", date: r.date || goLive, issueId,
        gradeId: r.gradeId, qty, unit, equipment: kind === "dept" ? (r.purpose || "Department issue") : r.equipment, area: kind === "dept" ? S.areaOf(r.issuedTo) : S.areaOf(r.area),
        activity: kind === "grease" ? "Motor Greasing" : kind === "dept" ? "Department issue" : activityOf(r),
        changeQty: kind === "oil" ? (r.changeQty || 0) : 0, topupQty: kind === "oil" ? (r.topupQty || 0) : 0,
        reason: r.remarks || "", remarks: kind === "dept" ? `Issued to ${r.issuedTo || "—"} for ${r.purpose || "—"}` : "", source: ref, createdAt: "3" });
    };
    sec.oilConsumption.filter(inMonth).forEach((r) => pushIssueConsumption(r, "oil"));
    sec.greaseConsumption.filter(inMonth).forEach((r) => pushIssueConsumption(r, "grease"));
    sec.oilDeptIssue.filter(inMonth).forEach((r) => pushIssueConsumption(r, "dept"));
    sec.greaseDeptIssue.filter(inMonth).forEach((r) => pushIssueConsumption(r, "dept"));

    /* Areas */
    const areaNames = ["TG&Aux", "Boiler&Aux", "Mill", "BOP", "AHP", "CHP", "ESP", "FGD", "BTG", "Filtration Machine", "Lubrication Cell"];
    const aliases = { "TG&Aux": ["TG&Aux.", "TG&AUX"], "Boiler&Aux": ["Boiler&Aux.", "BOILER&AUX", "WB&LRSB"], Mill: ["MILL", "Mill Area"], BOP: ["BOP Area", "FWPH", "BSDG", "Water System", "Main Compressor"],
      AHP: ["AHP Area", "TAC Compressor"], CHP: ["WT", "CHP"], FGD: ["FGD Area"], BTG: ["BTG (motor greasing sheet)"], ESP: [], "Filtration Machine": ["FILTRATION MACHINE"], "Lubrication Cell": [] };
    areaNames.forEach((a, i) => db.areas.push({ id: "AR-" + String(i + 1).padStart(2, "0"), name: a, aliases: aliases[a] || [], status: "Active",
      remarks: a === "BTG" ? "Grouping used by the motor greasing schedule (Boiler-Turbine-Generator)" : "" }));

    /* Departments — from the 'issued to department' sections (source spelling preserved) */
    const deptRaw = U.uniq([...sec.oilDeptIssue, ...sec.greaseDeptIssue].map((r) => r.dept));
    const deptMap = {};
    deptRaw.forEach((raw) => { const n = DEPT_FIX(raw); (deptMap[n] = deptMap[n] || []).push(raw); });
    db.departments.push({ id: "DP-00", name: "Lubrication Cell", spellings: [], source: "Process flow phase-1", status: "Active" });
    Object.entries(deptMap).sort().forEach(([n, raws], i) => db.departments.push({ id: "DP-" + String(i + 1).padStart(2, "0"), name: n,
      spellings: raws.filter((r) => r !== n), source: "Lubrication MIS FY-27 › issued-to-department sections", status: "Active" }));

    /* Equipment master */
    buildEquipment(db);

    /* Filtration machines — named in source (top-up sheet) + schedule machine labels */
    const fm = new Map();
    src.topup.equipment.filter((e) => e.sheet === "FILTRATION MACHINE").forEach((e) => fm.set(e.name, { name: e.name, source: "Top-up history › FILTRATION MACHINE" }));
    src.filtration.equipment.forEach((e) => { const k = `${e.sheet} › ${e.machine || "Machine"}`; if (!fm.has(k)) fm.set(k, { name: k, source: "Filtration schedule › " + e.sheet }); });
    let fi = 0;
    fm.forEach((m) => db.filtrationMachines.push({ id: "FM-" + String(++fi).padStart(2, "0"), name: m.name, type: /LVDH|INTEGRATED|ELC|ALFA/i.test(m.name) ? m.name.split(/[- ]/)[0] : "Pending",
      location: null, status: "Active", source: m.source, pmFreqDays: 90, pmFreqSource: "ILLUSTRATIVE (pending OEM/client PM frequency)" }));

    /* ILLUSTRATIVE operational records for optional modules (clearly flagged) */
    const t = U.iso(new Date());

    /* Two open oil requests (process step 3) so the request → issue flow can be shown straight away */
    const eqNamed = (n) => db.equipment.find((e) => e.name.toUpperCase() === n.toUpperCase());
    [["TG MAINTENANCE", "MOT-2", "OIL-PRIME46", 20, "Oil level low (top-up)", "Normal", "Shift engineer, TG"],
     ["MILL MAINTENANCE", "Mill Gearbox-2B", "OIL-MESHSP320", 210, "Oil replacement due", "Urgent", "Mill maintenance in-charge"]].forEach(([dept, eqn, gid, qty, reason, pri, by], i) => {
      const e = eqNamed(eqn), g = db.grades.find((x) => x.id === gid);
      if (!g) return;
      db.requests.push({ id: U.uid("RQ"), no: U.nextDocNo("REQ", db.requests.map((x) => x.no), t), date: t, dept: db.departments.some((d) => d.name === dept) ? dept : "Lubrication Cell",
        equipmentId: e ? e.id : null, equipment: e ? e.name : eqn, area: e ? e.area : null, gradeId: gid, unit: g.unit, qty, reason, priority: pri, requestedBy: by,
        remarks: "", status: "OPEN", createdAt: new Date(Date.now() - (2 - i) * 3600000).toISOString(), createdBy: "Demo Operator A", sample: true });
    });
    db.filtrationMachines.slice(0, 6).forEach((m, i) => db.pm.push({ id: U.uid("PM"), no: `PM-ILL-${i + 1}`, machineId: m.id, date: U.addDays(t, -95 + i * 9), status: "Completed",
      checklist: cfg.pmChecklist.map((c) => ({ item: c, ok: true })), findings: "Routine PM — no abnormality", spares: "", remarks: "", illustrative: true }));
    db.scrapGen.push({ id: U.uid("SG"), no: "SCG-ILL-1", date: U.addDays(t, -9), equipment: "MILL-3E", area: "Mill", activity: "Oil Replacement", drums: 2, qty: 360, status: "Recorded", stored: false, remarks: "ILLUSTRATIVE DEMO DATA", illustrative: true });
    db.scrapGen.push({ id: U.uid("SG"), no: "SCG-ILL-2", date: U.addDays(t, -4), equipment: "BFP-3A", area: "TG&Aux", activity: "Oil Replacement", drums: 1, qty: 150, status: "Recorded", stored: false, remarks: "ILLUSTRATIVE DEMO DATA", illustrative: true });
    db.inspections.push({ id: U.uid("IN"), no: "INS-ILL-1", date: U.addDays(t, -1), equipment: "BFP-1A", area: "TG&Aux", oilLevel: "Normal", leakage: "No", abnormality: "", action: "", status: "Completed", remarks: "ILLUSTRATIVE DEMO DATA", illustrative: true });
    db.inspections.push({ id: U.uid("IN"), no: "INS-ILL-2", date: U.addDays(t, -1), equipment: "PA FAN-2A", area: "Boiler&Aux", oilLevel: "Low", leakage: "Yes", abnormality: "Minor seepage at bearing housing", action: "Top-up requested; maintenance informed", status: "Pending", remarks: "ILLUSTRATIVE DEMO DATA", illustrative: true });
    db.handovers.push({ id: U.uid("HO"), no: "HO-ILL-1", date: U.addDays(t, -1), shift: "B", operator: "Demo Operator A", receiver: "Demo Operator B", completed: "Scheduled motor greasing — TG&Aux CEP motors", pending: "MOT-3 sample to be sent to lab", abnormal: "None", remarks: "ILLUSTRATIVE DEMO DATA", ack: true, ackBy: "Demo Operator B", ackAt: new Date().toISOString(), illustrative: true });

    db.audit.push({ id: U.uid("AUD"), at: new Date().toISOString(), user: "System", role: "System", action: "Demo initialised", entity: "Dataset", ref: "", detail: `Seeded from source workbooks (generated ${src.meta.generatedAt}). Go-live ledger month: ${U.monthLabel(src.inventory.latestMonth)}.` });
    db.notifications.push({ id: U.uid("N"), at: new Date().toISOString(), title: "Demo dataset ready", text: "Source workbooks loaded. Opening stock is taken from the latest MIS inventory sheet and is pending physical verification.", sev: "info", read: false, link: "inventory" });
    return db;
  }

  function buildEquipment(db) {
    const src = S.src;
    const byKey = new Map();
    const add = (e) => { db.equipment.push(e); const k = U.normKey(e.name); if (!byKey.has(k)) byKey.set(k, e); return e; };
    // 1) Oil top-up coverage (primary list)
    src.topup.equipment.forEach((e, i) => {
      if (e.sheet === "FILTRATION MACHINE") return;
      add({ id: "EQ-" + String(i + 1).padStart(5, "0"), name: e.name, area: S.areaOf(e.area), subArea: e.group || (e.sheet !== e.area ? e.sheet : (["WB&LRSB", "FWPH"].includes(e.sheet) ? e.sheet : null)),
        sheet: e.sheet, location: null, department: null, criticality: null, gradeId: e.gradeId, gradeRaw: e.gradeRaw, capacity: null,
        frequency: null, freqSource: null, status: "Active", remarks: "", type: "Equipment", topupIdx: i,
        coverage: { topup: true }, sources: [`Oil Topup & Replacement history › ${e.sheet}`] });
    });
    // 2) Sampling points — link by normalised name or add
    src.sampling.equipment.forEach((s) => {
      const k = U.normKey(s.equipment);
      let e = byKey.get(k);
      if (!e) e = add({ id: "EQ-S" + String(db.equipment.length).padStart(4, "0"), name: s.equipment, area: S.areaOf(s.area), subArea: s.sheet, sheet: s.sheet, location: null, department: null,
        criticality: null, gradeId: null, gradeRaw: null, capacity: null, frequency: null, freqSource: null, status: "Active", remarks: "Added from sampling schedule (no top-up history column)",
        type: "Sampling point", coverage: {}, sources: [] });
      e.coverage.sampling = true; e.frequency = e.frequency || s.frequency; e.freqSource = e.freqSource || `Sampling schedule › ${s.sheet}`;
      e.sources.push(`Oil sampling schedule › ${s.sheet}`); s._eqId = e.id;
    });
    // 3) Motors (greasing)
    src.greasing.motors.forEach((m) => {
      add({ id: `MTR-${m.sheet}-${String(m.sn).padStart(3, "0")}`, name: m.name, area: S.areaOf(m.area) || m.sheet, subArea: m.subArea, sheet: m.sheet, location: null, department: null,
        criticality: null, gradeId: null, gradeRaw: m.grease, capacity: null, frequency: m.freqDays ? `${m.freqDays} days` : null, freqSource: m.freqDays ? `Motor greasing › ${m.sheet}` : null,
        status: "Active", remarks: [m.kw ? `${m.kw} kW` : "", m.speed ? `${m.speed} rpm` : "", m.flc ? `FLC ${m.flc} A` : "", m.htlt || ""].filter(Boolean).join(" · "),
        type: "Motor", coverage: { greasing: true }, sources: [`Motor greasing schedule › ${m.sheet}`] });
    });
    // 4) Flags for filtration / analysis coverage
    src.filtration.equipment.forEach((f) => { const e = byKey.get(U.normKey(f.equipment)); if (e) { e.coverage.filtration = true; } });
    src.analysis.equipment.forEach((a) => { const e = byKey.get(U.normKey(a.equipment)); if (e) { e.coverage.analysis = true; } });
  }

  /* ------------------------------------------------------------------ */
  /* Init / reset                                                        */
  /* ------------------------------------------------------------------ */
  S.init = () => {
    S.src = window.CPP_SOURCE; S.cfg = window.CPP_CONFIG;
    const saved = window.DemoStore.get("db");
    if (saved && saved.version === VERSION && saved.sourceStamp === S.src.meta.generatedAt) { S.db = saved; S.loadedFromStorage = true; }
    else { S.db = buildSeed(); S.db.sourceStamp = S.src.meta.generatedAt; S.loadedFromStorage = false; S.save(); }
    reindex();
  };
  S.reset = () => { window.DemoStore.clearAll(); S.db = buildSeed(); S.db.sourceStamp = S.src.meta.generatedAt; reindex(); S.save(); emit("reset"); };

  function reindex() {
    S.idx.grade = Object.fromEntries(S.db.grades.map((g) => [g.id, g]));
    S.idx.eq = Object.fromEntries(S.db.equipment.map((e) => [e.id, e]));
    S.idx.eqByKey = new Map(); S.db.equipment.forEach((e) => { const k = U.normKey(e.name); if (!S.idx.eqByKey.has(k)) S.idx.eqByKey.set(k, e); });
    // MIS 'Motor Grease Consumption' rows (FY-27) linked to schedule motors by normalised name
    if (!S.idx.misGrease) {
      S.idx.misGrease = new Map();
      S.src.consumption.sections.greaseConsumption.forEach((r) => {
        if (!r.date) return; const k = U.normKey(r.equipment);
        if (!S.idx.misGrease.has(k)) S.idx.misGrease.set(k, []);
        S.idx.misGrease.get(k).push(r);
      });
      const maxDate = (arr) => arr.filter(Boolean).sort().pop() || null;
      S.sourceCutoff = {
        greasingSchedule: maxDate([].concat(...S.src.greasing.motors.map((m) => m.cells.map((c) => c.date)))),
        greasingMIS: maxDate(S.src.consumption.sections.greaseConsumption.map((r) => r.date)),
        sampling: maxDate([].concat(...S.src.sampling.equipment.map((m) => m.cells.map((c) => c.date)))),
        filtration: maxDate(S.src.filtration.records.map((r) => r.date)),
        analysis: maxDate(S.src.analysis.results.map((r) => r.date)),
        consumption: maxDate(S.src.consumption.sections.oilConsumption.map((r) => r.date))
      };
    }
  }
  S.reindex = reindex;
  S.grade = (id) => S.idx.grade[id];
  S.gradeName = (id) => (S.idx.grade[id] ? S.idx.grade[id].name : id || "—");
  S.unitOf = (id) => (S.idx.grade[id] ? S.idx.grade[id].unit : "");
  S.eq = (id) => S.idx.eq[id];
  S.eqByName = (name) => S.idx.eqByKey.get(U.normKey(name));
  S.activeGrades = (type) => S.db.grades.filter((g) => g.status === "Active" && (!type || g.type === type));
  S.selectableEquipment = () => S.db.equipment.filter((e) => e.status === "Active" && e.type !== "Motor");

  /* ------------------------------------------------------------------ */
  /* Stock queries                                                       */
  /* ------------------------------------------------------------------ */
  S.available = (gradeId) => Calc.available(S.db.txns, gradeId);
  S.stockSummary = (from, to) => Calc.stockSummary(S.db.txns, S.db.grades, from, to);
  S.issues = () => S.db.txns.filter((t) => t.type === "ISSUE");
  S.issueBalance = (issue) => Calc.issueBalance(issue, S.db.txns);
  S.openIssues = () => S.issues().filter((i) => i.status === "ISSUED").map((i) => ({ issue: i, bal: S.issueBalance(i) })).filter((x) => x.bal.open > 0.0005);

  /* ------------------------------------------------------------------ */
  /* PHASE-1 OPERATIONS                                                  */
  /* ------------------------------------------------------------------ */
  const docNo = (prefix, date) => U.nextDocNo(prefix, S.db.txns.map((t) => t.no), date);

  /** Stock receipt: draft → submitted → confirmed (only CONFIRMED increases stock). */
  S.saveReceipt = (data, action, existingId) => {
    if (!S.can("receipt.create")) return fail("Your role cannot create receipts");
    const g = S.grade(data.gradeId); if (!g) return fail("Select a valid grade");
    let r = existingId ? S.db.txns.find((t) => t.id === existingId) : null;
    if (r && r.status !== "DRAFT") return fail("Only draft receipts can be edited");
    const status = action === "submit" ? "SUBMITTED" : "DRAFT";
    if (!r) { r = { id: U.uid("T"), type: "RECEIPT", no: docNo("RCP", data.date), createdAt: new Date().toISOString(), createdBy: S.user().name }; S.db.txns.push(r); }
    Object.assign(r, { date: data.date, supplier: data.supplier, materialType: g.type, gradeId: g.id, qty: +data.qty, unit: g.unit, batch: data.batch || null,
      invoice: data.invoice || null, remarks: data.remarks || "", status });
    commit("txns", ["Receipt " + (status === "DRAFT" ? "saved as draft" : "submitted"), "Stock Receipt", r.no, `${U.fmt(r.qty)} ${r.unit} ${g.name}`],
      status === "SUBMITTED" ? ["Receipt awaiting confirmation", `${r.no}: ${U.fmt(r.qty)} ${r.unit} ${g.name}`, "info", "stock-receipt"] : null);
    return { ok: true, record: r };
  };
  S.confirmReceipt = (id) => {
    if (!S.can("receipt.confirm")) return fail("Only Control Store / In-charge roles can confirm receipts");
    const r = S.db.txns.find((t) => t.id === id);
    if (!r || r.status !== "SUBMITTED") return fail("Only submitted receipts can be confirmed");
    const before = S.available(r.gradeId);
    r.status = "CONFIRMED"; r.confirmedBy = S.user().name; r.confirmedAt = new Date().toISOString();
    commit("txns", ["Receipt confirmed", "Stock Receipt", r.no, `Stock ${U.fmt(before)} → ${U.fmt(S.available(r.gradeId))} ${r.unit}`],
      ["Stock increased", `${r.no} confirmed: +${U.fmt(r.qty)} ${r.unit} ${S.gradeName(r.gradeId)}`, "success", "stock-ledger"]);
    return { ok: true, record: r, before, after: S.available(r.gradeId) };
  };
  S.cancelReceipt = (id) => {
    const r = S.db.txns.find((t) => t.id === id);
    if (!r || !["DRAFT", "SUBMITTED"].includes(r.status)) return fail("Only draft or submitted receipts can be cancelled");
    r.status = "CANCELLED";
    commit("txns", ["Receipt cancelled", "Stock Receipt", r.no, ""]);
    return { ok: true };
  };

  /* ---------- Process step 3: oil request from a user department ---------- */
  S.createRequest = (data) => {
    if (!S.can("issue.create") && !S.can("request.create")) return fail("Your role cannot raise requests");
    const g = S.grade(data.gradeId); if (!g) return fail("Select a valid grade");
    const qty = +data.qty; if (!(qty > 0)) return fail("Requested quantity must be greater than zero");
    const r = { id: U.uid("RQ"), no: U.nextDocNo("REQ", S.db.requests.map((x) => x.no), data.date), date: data.date, dept: data.dept, equipmentId: data.equipmentId || null,
      equipment: data.equipmentName || null, area: data.area || null, gradeId: g.id, unit: g.unit, qty, reason: data.reason, priority: data.priority || "Normal",
      requestedBy: data.requestedBy || "", remarks: data.remarks || "", status: "OPEN", createdAt: new Date().toISOString(), createdBy: S.user().name };
    S.db.requests.push(r);
    const avail = S.available(g.id);
    commit("requests", ["Oil request raised", "Oil Request", r.no, `${r.dept}${r.equipment ? " / " + r.equipment : ""}: ${U.fmt(qty)} ${g.unit} ${g.name} — ${r.reason}`],
      ["New oil request", `${r.no}: ${r.equipment || r.dept} needs ${U.fmt(qty)} ${g.unit} ${g.name}`, avail >= qty ? "info" : "warning", "oil-requests"]);
    return { ok: true, record: r, available: avail };
  };
  S.cancelRequest = (id, reason) => {
    const r = S.db.requests.find((x) => x.id === id);
    if (!r || r.status !== "OPEN") return fail("Only open requests can be cancelled");
    r.status = "CANCELLED"; r.cancelReason = reason || "";
    commit("requests", ["Oil request cancelled", "Oil Request", r.no, reason || ""]);
    return { ok: true };
  };

  /** Stock issue from the Lube Cell. Never allows issue > available stock. */
  S.createIssue = (data) => {
    if (!S.can("issue.create")) return fail("Your role cannot issue stock");
    const g = S.grade(data.gradeId); if (!g) return fail("Select a valid grade");
    const qty = +data.qty, avail = S.available(g.id);
    if (!(qty > 0)) return fail("Issued quantity must be greater than zero");
    if (qty > avail + 1e-9) return fail(`Insufficient stock: requested ${U.fmt(qty)} ${g.unit}, available ${U.fmt(avail)} ${g.unit}`);
    const req = data.requestId ? S.db.requests.find((x) => x.id === data.requestId) : null;
    if (data.requestId && (!req || req.status !== "OPEN")) return fail("The selected request is no longer open");
    const needsApproval = !!S.db.settings.issueApproval;
    const r = { id: U.uid("T"), type: "ISSUE", no: docNo("ISS", data.date), date: data.date, gradeId: g.id, qty, unit: g.unit, requestedQty: +data.requestedQty || qty,
      dept: data.dept, equipment: data.equipmentName || null, equipmentId: data.equipmentId || null, area: data.area || null, issuedBy: S.user().name,
      remarks: data.remarks || "", status: needsApproval ? "PENDING_APPROVAL" : "ISSUED", createdAt: new Date().toISOString(),
      requestId: req ? req.id : null, requestNo: req ? req.no : null };
    S.db.txns.push(r);
    if (req) { req.status = "ISSUED"; req.issueId = r.id; req.issueNo = r.no; }
    commit("txns", ["Issue " + (needsApproval ? "requested" : "confirmed"), "Stock Issue", r.no, `${U.fmt(qty)} ${g.unit} ${g.name} to ${r.dept}${r.equipment ? " / " + r.equipment : ""}. Stock ${U.fmt(avail)} → ${U.fmt(S.available(g.id))}`],
      needsApproval ? ["Issue awaiting approval", `${r.no}: ${U.fmt(qty)} ${g.unit} ${g.name}`, "warning", "stock-issue"] : null);
    lowStockCheck(g.id);
    return { ok: true, record: r, before: avail, after: S.available(g.id) };
  };
  S.approveIssue = (id, approve) => {
    if (!S.can("issue.approve")) return fail("Your role cannot approve issues");
    const r = S.db.txns.find((t) => t.id === id);
    if (!r || r.status !== "PENDING_APPROVAL") return fail("Issue is not pending approval");
    if (approve) {
      const avail = S.available(r.gradeId);
      if (r.qty > avail + 1e-9) return fail(`Cannot approve: available stock is only ${U.fmt(avail)} ${r.unit}`);
      r.status = "ISSUED";
    } else {
      r.status = "REJECTED";
      const req = r.requestId ? S.db.requests.find((x) => x.id === r.requestId) : null;
      if (req) { req.status = "OPEN"; req.issueId = null; req.issueNo = null; } // request goes back to the queue
    }
    r.approvedBy = S.user().name; r.approvedAt = new Date().toISOString();
    commit("txns", [approve ? "Issue approved" : "Issue rejected", "Stock Issue", r.no, ""]);
    if (approve) lowStockCheck(r.gradeId);
    return { ok: true };
  };

  /**
   * Equipment-wise consumption against an issue.
   * Rule: consumption ≤ open balance of the issue. Excess is only possible through an
   * explicit EXCEPTION request that an In-charge must approve. Consumption never moves stock.
   */
  S.recordConsumption = (data) => {
    if (!S.can("consumption.create")) return fail("Your role cannot record consumption");
    const issue = S.db.txns.find((t) => t.id === data.issueId && t.type === "ISSUE");
    if (!issue) return fail("Select the stock issue this consumption belongs to");
    if (issue.status !== "ISSUED") return fail("The selected issue is not confirmed");
    const change = +data.changeQty || 0, topup = +data.topupQty || 0, total = U.round(change + topup, 3);
    if (change < 0 || topup < 0) return fail("Quantities cannot be negative");
    if (!(total > 0)) return fail("Enter an oil change and/or top-up quantity");
    const bal = S.issueBalance(issue);
    const exception = total > bal.open + 1e-9;
    if (exception && !data.exceptionReason) return fail(`Total consumption ${U.fmt(total)} exceeds the open issued balance ${U.fmt(bal.open)} ${issue.unit}. Raise an exception with a reason, or record a smaller quantity.`);
    const eq = data.equipmentId ? S.eq(data.equipmentId) : null;
    const r = { id: U.uid("T"), type: "CONSUMPTION", no: docNo("CON", data.date), date: data.date, issueId: issue.id, gradeId: issue.gradeId, qty: total, unit: issue.unit,
      equipmentId: eq ? eq.id : null, equipment: eq ? eq.name : issue.equipment, area: eq ? eq.area : issue.area, activity: data.activity, changeQty: change, topupQty: topup,
      reason: data.reason || "", remarks: data.remarks || "", exceptionReason: exception ? data.exceptionReason : null,
      status: exception ? "PENDING_EXCEPTION" : "CONFIRMED", createdAt: new Date().toISOString(), createdBy: S.user().name };
    S.db.txns.push(r);
    if (eq && ["Top-up", "Replacement", "Oil Change", "Oil Change + Top-up"].includes(r.activity)) {
      S.db.topups.push({ id: U.uid("TU"), eqId: eq.id, date: r.date, qty: total, activity: r.activity, gradeId: r.gradeId, ref: r.no, remarks: r.reason });
    }
    commit("txns", [exception ? "Consumption exception raised" : "Consumption recorded", "Consumption", r.no,
      `${eq ? eq.name : r.equipment}: ${r.activity} ${U.fmt(total)} ${r.unit} against ${issue.no} (open balance before: ${U.fmt(bal.open)})`],
      exception ? ["Consumption exception needs approval", `${r.no}: ${U.fmt(total)} ${r.unit} vs open ${U.fmt(bal.open)}`, "warning", "consumption"] : null);
    return { ok: true, record: r, exception };
  };
  S.decideException = (id, approve) => {
    if (!S.can("*")) return fail("Only the In-charge / Administrator can decide consumption exceptions");
    const r = S.db.txns.find((t) => t.id === id && t.status === "PENDING_EXCEPTION");
    if (!r) return fail("No pending exception found");
    r.status = approve ? "CONFIRMED" : "REJECTED"; r.exceptionDecidedBy = S.user().name;
    commit("txns", [approve ? "Consumption exception approved" : "Consumption exception rejected", "Consumption", r.no, r.exceptionReason]);
    return { ok: true };
  };

  /** Unused oil returned against an issue — a separate RETURN transaction (+stock). */
  S.recordReturn = (data) => {
    if (!S.can("return.create")) return fail("Your role cannot record returns");
    const issue = S.db.txns.find((t) => t.id === data.issueId && t.type === "ISSUE");
    if (!issue || issue.status !== "ISSUED") return fail("Select a confirmed stock issue");
    const qty = +data.qty, bal = S.issueBalance(issue);
    if (!(qty > 0)) return fail("Return quantity must be greater than zero");
    if (qty > bal.open + 1e-9) return fail(`Return ${U.fmt(qty)} exceeds the open balance of ${issue.no} (${U.fmt(bal.open)} ${issue.unit})`);
    const before = S.available(issue.gradeId);
    const r = { id: U.uid("T"), type: "RETURN", no: docNo("RET", data.date), date: data.date, issueId: issue.id, gradeId: issue.gradeId, qty, unit: issue.unit,
      equipment: issue.equipment, area: issue.area, reason: data.reason || "", remarks: data.remarks || "", status: "CONFIRMED", createdAt: new Date().toISOString(), createdBy: S.user().name };
    S.db.txns.push(r);
    commit("txns", ["Unused oil returned", "Stock Return", r.no, `${U.fmt(qty)} ${r.unit} returned against ${issue.no}. Stock ${U.fmt(before)} → ${U.fmt(S.available(issue.gradeId))}`],
      ["Stock returned", `${r.no}: +${U.fmt(qty)} ${r.unit} ${S.gradeName(r.gradeId)}`, "success", "stock-return"]);
    return { ok: true, record: r };
  };

  /** Stock adjustment — signed qty; requires approval (configurable). */
  S.requestAdjustment = (data) => {
    if (!S.can("issue.create") && !S.can("*")) return fail("Your role cannot request adjustments");
    const g = S.grade(data.gradeId); if (!g) return fail("Select a valid grade");
    const qty = (data.direction === "DECREASE" ? -1 : 1) * Math.abs(+data.qty);
    if (!qty) return fail("Quantity must be non-zero");
    const avail = S.available(g.id);
    if (qty < 0 && avail + qty < -1e-9) return fail(`Decrease of ${U.fmt(-qty)} would make stock negative (available ${U.fmt(avail)})`);
    const needs = S.db.settings.adjustmentApproval;
    const r = { id: U.uid("T"), type: "ADJUSTMENT", no: docNo("ADJ", data.date), date: data.date, gradeId: g.id, qty, unit: g.unit, reason: data.reason, remarks: data.remarks || "",
      status: needs ? "PENDING_APPROVAL" : "APPROVED", createdAt: new Date().toISOString(), createdBy: S.user().name };
    S.db.txns.push(r);
    commit("txns", ["Adjustment " + (needs ? "requested" : "applied"), "Stock Adjustment", r.no, `${qty > 0 ? "+" : ""}${U.fmt(qty)} ${g.unit} ${g.name} — ${data.reason}`],
      needs ? ["Adjustment awaiting approval", `${r.no}: ${qty > 0 ? "+" : ""}${U.fmt(qty)} ${g.unit} ${g.name}`, "warning", "stock-adjustment"] : null);
    return { ok: true, record: r };
  };
  S.decideAdjustment = (id, approve) => {
    if (!S.can("*")) return fail("Only the In-charge / Administrator can approve adjustments (pending client confirmation)");
    const r = S.db.txns.find((t) => t.id === id && t.type === "ADJUSTMENT" && t.status === "PENDING_APPROVAL");
    if (!r) return fail("Adjustment is not pending");
    if (approve && r.qty < 0 && S.available(r.gradeId) + r.qty < -1e-9) return fail("Approval would make stock negative");
    r.status = approve ? "APPROVED" : "REJECTED"; r.approvedBy = S.user().name; r.approvedAt = new Date().toISOString();
    commit("txns", [approve ? "Adjustment approved" : "Adjustment rejected", "Stock Adjustment", r.no, ""], approve ? ["Stock adjusted", `${r.no} applied`, "info", "stock-ledger"] : null);
    if (approve) lowStockCheck(r.gradeId);
    return { ok: true };
  };

  function lowStockCheck(gradeId) {
    const g = S.grade(gradeId); if (!g) return;
    const st = Calc.stockStatus(S.available(gradeId), g);
    if (st.key === "CRITICAL" || st.key === "OUT" || st.key === "REORDER") {
      notify(`Low stock: ${g.name}`, `Available ${U.fmt(S.available(gradeId))} ${g.unit} — ${st.label} (levels are illustrative)`, st.cls === "danger" ? "danger" : "warning", "low-stock");
      S.save();
    }
  }

  /* ------------------------------------------------------------------ */
  /* MASTER DATA                                                         */
  /* ------------------------------------------------------------------ */
  S.saveEquipment = (data, id) => {
    if (!S.can("*")) return fail("Only the In-charge / Administrator maintains equipment master (pending client confirmation — Q12)");
    let e = id ? S.eq(id) : null;
    if (!e) {
      const n = S.db.equipment.filter((x) => /^EQ-N/.test(x.id)).length + 1;
      e = { id: data.id && data.id.trim() ? data.id.trim().toUpperCase() : "EQ-N" + String(n).padStart(4, "0"), coverage: {}, sources: ["Created in demo"], type: "Equipment", history: [] };
      if (S.eq(e.id)) return fail(`Equipment ID ${e.id} already exists`);
      S.db.equipment.push(e);
    }
    const before = U.clone(e);
    ["name", "department", "area", "subArea", "location", "criticality", "gradeId", "capacity", "frequency", "status", "remarks"].forEach((k) => { if (k in data) e[k] = data[k] === "" ? null : data[k]; });
    if (e.capacity !== null && e.capacity !== undefined) e.capacity = +e.capacity;
    if (data.frequency) e.freqSource = "Edited in demo";
    e.history = e.history || [];
    const changed = Object.keys(data).filter((k) => String(before[k] ?? "") !== String(e[k] ?? ""));
    e.history.unshift({ at: new Date().toISOString(), by: S.user().name, what: id ? `Updated: ${changed.join(", ") || "no changes"}` : "Created" });
    reindex();
    commit("master", [id ? "Equipment updated" : "Equipment created", "Equipment Master", e.id, id ? changed.join(", ") : e.name]);
    return { ok: true, record: e };
  };
  S.toggleEquipment = (id) => {
    if (!S.can("*")) return fail("Only the In-charge / Administrator can activate or deactivate equipment");
    const e = S.eq(id); if (!e) return fail("Not found");
    e.status = e.status === "Active" ? "Inactive" : "Active";
    (e.history = e.history || []).unshift({ at: new Date().toISOString(), by: S.user().name, what: `Status → ${e.status}` });
    commit("master", ["Equipment " + (e.status === "Active" ? "activated" : "deactivated"), "Equipment Master", e.id, e.name]);
    return { ok: true, record: e };
  };
  S.importEquipment = (rows) => {
    if (!S.can("*")) return fail("Only the In-charge / Administrator can import equipment");
    let added = 0, updated = 0; const errors = [];
    rows.forEach((row, i) => {
      const name = row["Equipment Name"] || row.name; const id = row["Equipment ID"] || row.id;
      if (!name) { errors.push(`Row ${i + 2}: Equipment Name missing`); return; }
      const ex = id ? S.eq(String(id).toUpperCase()) : null;
      const data = { name, area: row.Area || null, subArea: row["Sub-area"] || null, department: row.Department || null, location: row.Location || null,
        criticality: row.Criticality || null, capacity: row["Oil Capacity"] || null, frequency: row["Lubrication Frequency"] || null, status: row["Equipment Status"] || "Active", remarks: row.Remarks || "" };
      const res = S.saveEquipment(id && !ex ? { ...data, id } : data, ex ? ex.id : null);
      if (res.ok) ex ? updated++ : added++; else errors.push(`Row ${i + 2}: ${res.error}`);
    });
    return { ok: true, added, updated, errors };
  };
  S.saveGrade = (id, data) => {
    if (!S.can("*")) return fail("Only the In-charge / Administrator can edit grade master");
    const g = S.grade(id); if (!g) return fail("Grade not found");
    ["minStock", "reorderLevel", "unitPrice"].forEach((k) => { if (k in data) g[k] = data[k] === "" || data[k] === null ? null : +data[k]; });
    if ("status" in data) g.status = data.status;
    if ("itemCode" in data) g.itemCode = data.itemCode || null;
    g.levelBasis = "Edited in demo by " + S.user().name;
    commit("master", ["Grade updated", "Oil/Grease Master", g.name, `Min ${g.minStock}, Reorder ${g.reorderLevel}`]);
    return { ok: true };
  };
  S.saveSimpleMaster = (collection, data, id, label) => {
    if (!S.can("*")) return fail("Only the In-charge / Administrator can maintain master data");
    const list = S.db[collection];
    let r = id ? list.find((x) => x.id === id) : null;
    if (!r) { r = { id: data.id || U.uid(collection.slice(0, 2).toUpperCase()) }; list.push(r); }
    Object.assign(r, data);
    if (collection === "grades") reindex();
    commit("master", [`${label} ${id ? "updated" : "created"}`, label, r.name || r.id, ""]);
    return { ok: true, record: r };
  };

  /* ------------------------------------------------------------------ */
  /* PHASE-2: GREASING / SCRAP                                           */
  /* ------------------------------------------------------------------ */
  S.motors = () => S.src.greasing.motors.map((m) => {
    const id = `MTR-${m.sheet}-${String(m.sn).padStart(3, "0")}`;
    return { ...m, id, override: S.db.motorOverrides[id] || {}, mis: S.idx.misGrease.get(U.normKey(m.name)) || [] };
  });
  /** Greasing status = schedule-sheet dates + MIS monthly greasing rows + system entries; S/D, COH etc. stay remarks. */
  S.motorStatus = (m) => {
    const sys = S.db.greasing.filter((g) => g.motorId === m.id && g.status === "Completed");
    const srcDates = [...m.cells.filter((c) => c.date).map((c) => c.date), ...(m.mis || []).map((r) => r.date)];
    let freqDays = m.override.freqDays || m.freqDays || null, freqSource = m.override.freqDays ? "Edited in demo" : m.freqDays ? "Source (frequency column)" : null;
    if (!freqDays) { const inf = Calc.inferInterval(srcDates); if (inf) { freqDays = inf; freqSource = "Inferred from FY-27 source dates (pending confirmation)"; } }
    if (!freqDays) { freqDays = S.db.settings.defaultGreasingFreq; freqSource = "ILLUSTRATIVE default (pending confirmation)"; }
    const st = Calc.scheduleStatus({ completions: [...srcDates, ...sys.map((g) => g.date)], remarks: m.cells.filter((c) => c.remark).map((c) => ({ month: c.month, remark: c.remark })),
      freqDays, fyStart: S.fyStart(), today: S.today(), leadDays: S.db.settings.greasingLead, excludeRemarked: S.db.settings.excludeRemarked });
    return { ...st, freqDays, freqSource, systemEntries: sys.length };
  };
  S.addGreasing = (data) => {
    if (!S.can("greasing.create")) return fail("Your role cannot record greasing");
    const m = S.motors().find((x) => x.id === data.motorId); if (!m) return fail("Select a motor");
    const g = S.grade(data.gradeId);
    const qty = +data.qty;
    if (!(qty > 0)) return fail("Grease quantity must be greater than zero");
    if (data.issueFromStock && g) {
      const avail = S.available(g.id);
      if (qty > avail + 1e-9) return fail(`Insufficient ${g.name}: available ${U.fmt(avail)} ${g.unit}`);
    }
    const r = { id: U.uid("GR"), no: U.nextDocNo("GRS", S.db.greasing.map((x) => x.no), data.date), motorId: m.id, motor: m.name, sheet: m.sheet, date: data.date, gradeId: g ? g.id : null,
      grease: g ? g.name : data.greaseText || m.grease, qty, scheduled: data.scheduled, status: "Completed", remarks: data.remarks || "", by: S.user().name, at: new Date().toISOString() };
    S.db.greasing.push(r);
    let stockNote = "";
    if (data.issueFromStock && g) {
      // Greasing consumes grease from the Lube Cell: one ISSUE + one linked CONSUMPTION (stock deducted once).
      const iss = { id: U.uid("T"), type: "ISSUE", no: docNo("ISS", data.date), date: data.date, gradeId: g.id, qty, unit: g.unit, dept: "Lubrication Cell (motor greasing)", equipment: m.name,
        area: S.areaOf(m.area), issuedBy: S.user().name, remarks: `Auto-issue for ${r.no}`, status: "ISSUED", createdAt: new Date().toISOString() };
      S.db.txns.push(iss);
      S.db.txns.push({ id: U.uid("T"), type: "CONSUMPTION", no: docNo("CON", data.date), date: data.date, issueId: iss.id, gradeId: g.id, qty, unit: g.unit, equipment: m.name,
        area: S.areaOf(m.area), activity: "Motor Greasing", changeQty: 0, topupQty: qty, reason: data.scheduled, remarks: r.no, status: "CONFIRMED", createdAt: new Date().toISOString() });
      r.issueNo = iss.no; stockNote = ` · stock issue ${iss.no}`;
    }
    commit("greasing", ["Greasing completed", "Motor Greasing", r.no, `${m.name} — ${U.fmt(qty)} ${g ? g.unit : "kg"} ${r.grease}${stockNote}`]);
    return { ok: true, record: r };
  };
  S.setMotorFreq = (motorId, freqDays) => {
    if (!S.can("*")) return fail("Only the In-charge / Administrator can change frequency");
    S.db.motorOverrides[motorId] = { ...(S.db.motorOverrides[motorId] || {}), freqDays: freqDays ? +freqDays : null };
    commit("greasing", ["Greasing frequency changed", "Greasing Schedule", motorId, `${freqDays} days`]);
    return { ok: true };
  };

  S.scrap = () => {
    const src = S.src.scrap.records.map((r, i) => ({ id: "SRC-" + i, no: `${r.fy}/${r.sn}`, date: r.date, dateRaw: r.dateRaw, description: r.description, drums: r.drums, qty: r.qty,
      remarks: r.remarks, fy: r.fy, historical: true, destination: "Disposal Yard", disposal: "As per source record" }));
    const recon = Calc.scrapRecon({ opening: S.db.settings.scrapOpening, gens: S.db.scrapGen, transfers: S.db.scrapTransfers, dispatches: S.db.scrapDispatch, goLive: S.goLive() });
    return { sourceDispatches: src, recon };
  };
  S.addScrapGen = (data) => {
    if (!S.can("scrap.create")) return fail("Your role cannot record scrap");
    const qty = +data.qty; if (!(qty > 0)) return fail("Quantity must be greater than zero");
    const r = { id: U.uid("SG"), no: U.nextDocNo("SCG", S.db.scrapGen.map((x) => x.no), data.date), ...data, qty, drums: +data.drums || 0, status: "Recorded", stored: false, by: S.user().name };
    S.db.scrapGen.push(r);
    commit("scrap", ["Scrap oil generation recorded", "Scrap Generation", r.no, `${U.fmt(qty)} L from ${r.equipment || "—"}`]);
    return { ok: true, record: r };
  };
  S.addScrapTransfer = (data) => {
    if (!S.can("scrap.create")) return fail("Your role cannot record scrap transfers");
    const qty = +data.qty; if (!(qty > 0)) return fail("Quantity must be greater than zero");
    const rc = S.scrap().recon;
    if (qty > rc.atGenerationPoints + 1e-9) return fail(`Only ${U.fmt(rc.atGenerationPoints)} L of generated scrap is pending transfer to storage`);
    const r = { id: U.uid("ST"), no: U.nextDocNo("SCT", S.db.scrapTransfers.map((x) => x.no), data.date), ...data, qty, drums: +data.drums || 0, status: "Received in storage", by: S.user().name };
    S.db.scrapTransfers.push(r);
    commit("scrap", ["Scrap transferred to storage", "Scrap Transfer", r.no, `${U.fmt(qty)} L into ${data.location}`]);
    return { ok: true, record: r };
  };
  S.addScrapDispatch = (data) => {
    if (!S.can("scrap.create")) return fail("Your role cannot record disposal");
    const qty = +data.qty || 0; const drums = +data.drums || 0;
    if (data.description === "Scrap Oil drums" && !(qty > 0)) return fail("Quantity must be greater than zero for scrap oil drums");
    if (!(drums > 0)) return fail("Number of drums must be greater than zero");
    const rc = S.scrap().recon;
    if (qty > rc.inStorage + 1e-9) return fail(`Dispatch ${U.fmt(qty)} L exceeds the scrap balance in storage (${U.fmt(rc.inStorage)} L)`);
    const r = { id: U.uid("SD"), no: U.nextDocNo("SCD", S.db.scrapDispatch.map((x) => x.no), data.date), ...data, qty, drums, fy: U.fyOf(data.date), historical: false, by: S.user().name };
    S.db.scrapDispatch.push(r);
    commit("scrap", ["Scrap dispatched for disposal", "Scrap Disposal", r.no, `${drums} drums / ${U.fmt(qty)} L to ${data.destination}`],
      ["Scrap disposal recorded", `${r.no}: ${U.fmt(qty)} L`, "success", "scrap-reconciliation"]);
    return { ok: true, record: r };
  };

  /* ------------------------------------------------------------------ */
  /* PHASE-3: SAMPLING / ANALYSIS / FILTRATION / PM                      */
  /* ------------------------------------------------------------------ */
  S.samplingPoints = () => S.src.sampling.equipment.map((s) => ({ ...s, id: `SPT-${s.sheet}-${String(s.sn).padStart(3, "0")}` }));
  S.samplingStatus = (p) => {
    const sys = S.db.samples.filter((x) => x.pointId === p.id && x.status !== "CANCELLED");
    const freqDays = Calc.freqToDays(p.frequency);
    const st = Calc.scheduleStatus({ completions: [...p.cells.filter((c) => c.date).map((c) => c.date), ...sys.map((x) => x.date)],
      remarks: p.cells.filter((c) => c.remark).map((c) => ({ month: c.month, remark: c.remark })), freqDays, fyStart: S.fyStart(), today: S.today(),
      leadDays: S.db.settings.samplingLead, excludeRemarked: S.db.settings.excludeRemarked });
    return { ...st, freqDays };
  };
  S.collectSample = (data) => {
    if (!S.can("sampling.create")) return fail("Your role cannot record sample collection");
    const p = S.samplingPoints().find((x) => x.id === data.pointId); if (!p) return fail("Select a sampling point");
    const ymd = data.date.replace(/-/g, "").slice(2);
    const n = S.db.samples.filter((x) => x.sampleId.includes(ymd)).length + 1;
    const r = { id: U.uid("SM"), sampleId: `SMP-${ymd}-${String(n).padStart(3, "0")}`, pointId: p.id, equipment: p.equipment, area: p.area, sheet: p.sheet, date: data.date,
      collectedBy: S.user().name, tests: data.tests || [], status: "COLLECTED", remarks: data.remarks || "", scheduled: data.scheduled || "Scheduled", at: new Date().toISOString() };
    S.db.samples.push(r);
    commit("sampling", ["Sample collected", "Sample Collection", r.sampleId, `${p.equipment} — ${r.tests.join(", ")}`], ["Sample collected", `${r.sampleId} (${p.equipment})`, "success", "sample-collection"]);
    return { ok: true, record: r };
  };
  S.sendSample = (id) => {
    const r = S.db.samples.find((x) => x.id === id); if (!r || r.status !== "COLLECTED") return fail("Only collected samples can be sent");
    r.status = "SENT"; r.sentAt = new Date().toISOString();
    commit("sampling", ["Sample sent for analysis", "Sample Collection", r.sampleId, "Laboratory hand-over (LIMS integration proposed — API validation pending)"]);
    return { ok: true };
  };
  S.analysisEquipment = () => S.src.analysis.equipment.map((e) => ({ ...e, key: e.sheet + "|" + e.equipment }));
  S.addAnalysis = (data) => {
    if (!S.can("sampling.create")) return fail("Your role cannot enter analysis results");
    const eq = S.analysisEquipment().find((e) => e.key === data.eqKey); if (!eq) return fail("Select equipment");
    const params = {}; let abnormal = [];
    Object.keys(eq.params).forEach((p) => {
      const v = data["p_" + p]; if (v === undefined || v === "") return;
      params[p] = isNaN(v) ? v : +v;
      const ev = Calc.evaluate(params[p], eq.params[p].limit);
      if (ev.cls === "danger") abnormal.push(`${p} ${v} (${ev.label}; limit ${eq.params[p].rangeText})`);
    });
    if (!Object.keys(params).length) return fail("Enter at least one parameter result");
    const r = { id: U.uid("AN"), key: eq.key, sheet: eq.sheet, equipment: eq.equipment, date: data.date, sampleId: data.sampleId || null, params, remarks: data.remarks || "",
      abnormal, by: S.user().name, at: new Date().toISOString() };
    S.db.analysis.push(r);
    if (r.sampleId) { const s = S.db.samples.find((x) => x.sampleId === r.sampleId); if (s) s.status = "ANALYSED"; }
    commit("analysis", ["Analysis result entered", "Oil Analysis", r.sampleId || eq.equipment, abnormal.length ? "ABNORMAL: " + abnormal.join("; ") : "All evaluated parameters within limits"],
      abnormal.length ? ["Abnormal oil analysis", `${eq.equipment}: ${abnormal.join("; ")}`, "danger", "oil-analysis"] : null);
    return { ok: true, record: r };
  };
  S.filtrationItems = () => {
    const by = U.groupBy(S.src.filtration.records, (r) => r.sheet + "|" + r.equipment);
    return S.src.filtration.equipment.map((e) => {
      const key = e.sheet + "|" + e.equipment; const recs = by[key] || [];
      const sys = S.db.filtration.filter((f) => f.key === key && f.status === "Completed");
      const dates = [...recs.filter((r) => r.date).map((r) => r.date), ...sys.map((s) => s.endDate || s.date)];
      const inferred = Calc.inferInterval(recs.filter((r) => r.date).map((r) => r.date));
      const st = Calc.scheduleStatus({ completions: dates, remarks: recs.filter((r) => r.remark).map((r) => ({ month: "", remark: r.remark })), freqDays: inferred,
        fyStart: S.fyStart(), today: S.today(), leadDays: S.db.settings.filtrationLead, excludeRemarked: false });
      return { ...e, key, records: recs, sys, freqDays: inferred, freqSource: inferred ? "Inferred from source dates (pending confirmation)" : "Pending", ...st };
    });
  };
  S.addFiltration = (data) => {
    if (!S.can("filtration.create")) return fail("Your role cannot record filtration");
    const it = S.filtrationItems().find((x) => x.key === data.key); if (!it) return fail("Select equipment");
    if (data.endDate && data.endDate < data.date) return fail("End date cannot be before start date");
    if (data.spareId && +data.spareQty > 0) {
      const sp = S.db.spares.find((s) => s.id === data.spareId);
      if (!sp || sp.stock < +data.spareQty) return fail("Insufficient spare stock for the selected spare");
      sp.stock -= +data.spareQty;
    }
    const r = { id: U.uid("FL"), no: U.nextDocNo("FLT", S.db.filtration.map((x) => x.no), data.date), key: it.key, sheet: it.sheet, equipment: it.equipment, machine: data.machine || it.machine,
      date: data.date, endDate: data.endDate || null, status: data.status, spareId: data.spareId || null, spareQty: +data.spareQty || 0, remarks: data.remarks || "", by: S.user().name };
    S.db.filtration.push(r);
    const lowSpares = S.db.spares.filter((s) => s.stock < s.minStock);
    commit("filtration", ["Filtration work recorded", "Oil Filtration", r.no, `${it.equipment} on ${r.machine} — ${r.status}`],
      lowSpares.length ? ["Filtration spare below minimum", lowSpares.map((s) => s.name).join(", "), "warning", "filtration-machines"] : null);
    return { ok: true, record: r };
  };
  S.pmStatus = (m) => {
    const done = S.db.pm.filter((p) => p.machineId === m.id && p.status === "Completed").map((p) => p.date);
    return Calc.scheduleStatus({ completions: done, remarks: [], freqDays: m.pmFreqDays, fyStart: S.fyStart(), today: S.today(), leadDays: S.db.settings.pmLead, excludeRemarked: false });
  };
  S.addPM = (data) => {
    if (!S.can("filtration.create")) return fail("Your role cannot record PM");
    const m = S.db.filtrationMachines.find((x) => x.id === data.machineId); if (!m) return fail("Select a filtration machine");
    const checklist = S.cfg.pmChecklist.map((c, i) => ({ item: c, ok: !!data["chk_" + i] }));
    const allOk = checklist.every((c) => c.ok);
    if (data.status === "Completed" && !allOk && !data.findings) return fail("Record findings for checklist items not completed");
    const r = { id: U.uid("PM"), no: U.nextDocNo("PM", S.db.pm.map((x) => x.no), data.date), machineId: m.id, date: data.date, status: data.status, checklist, findings: data.findings || "", spares: data.spares || "", remarks: data.remarks || "", by: S.user().name };
    S.db.pm.push(r);
    commit("pm", ["PM recorded", "Preventive Maintenance", r.no, `${m.name} — ${r.status}`]);
    return { ok: true, record: r };
  };

  /* ------------------------------------------------------------------ */
  /* OPTIONAL: inspection / handover / alerts / validation               */
  /* ------------------------------------------------------------------ */
  S.addInspection = (data, id) => {
    if (!S.can("inspection.create")) return fail("Your role cannot record inspections");
    if (data.leakage === "Yes" && !data.abnormality) return fail("Describe the abnormality when leakage is observed");
    let r = id ? S.db.inspections.find((x) => x.id === id) : null;
    if (!r) { r = { id: U.uid("IN"), no: U.nextDocNo("INS", S.db.inspections.map((x) => x.no), data.date) }; S.db.inspections.push(r); }
    Object.assign(r, data, { by: S.user().name });
    commit("inspection", [id ? "Inspection updated" : "Inspection recorded", "Daily Inspection", r.no, `${r.equipment}: oil level ${r.oilLevel}, leakage ${r.leakage}`],
      r.leakage === "Yes" || r.oilLevel === "Low" ? ["Inspection abnormality", `${r.equipment}: ${r.abnormality || "Low oil level"}`, "warning", "daily-inspection"] : null);
    return { ok: true, record: r };
  };
  S.addHandover = (data) => {
    if (!S.can("handover.create")) return fail("Your role cannot create handovers");
    const r = { id: U.uid("HO"), no: U.nextDocNo("HO", S.db.handovers.map((x) => x.no), data.date), ...data, operator: S.user().name, ack: false };
    S.db.handovers.push(r);
    commit("handover", ["Shift handover submitted", "Shift Handover", r.no, `Shift ${r.shift} → ${r.receiver}`], ["Handover awaiting acknowledgement", `${r.no} for ${r.receiver}`, "info", "shift-handover"]);
    return { ok: true, record: r };
  };
  S.ackHandover = (id) => {
    const r = S.db.handovers.find((x) => x.id === id); if (!r || r.ack) return fail("Already acknowledged");
    if (r.operator === S.user().name) return fail("The handing-over operator cannot acknowledge their own handover — switch role to the receiver");
    r.ack = true; r.ackBy = S.user().name; r.ackAt = new Date().toISOString();
    commit("handover", ["Shift handover acknowledged", "Shift Handover", r.no, ""]);
    return { ok: true };
  };
  S.setAlertState = (key, status, note) => {
    if (!S.can("alerts.ack") && !S.can("*")) return fail("Your role cannot acknowledge alerts");
    S.db.alertStates[key] = { status, at: new Date().toISOString(), by: S.user().name, note: note || "" };
    commit("alerts", ["Alert " + status.toLowerCase(), "Automatic Alerts", key, note || ""]);
    return { ok: true };
  };
  S.setValidation = (qid, status, note) => {
    S.db.validation[qid] = { status, note: note !== undefined ? note : (S.db.validation[qid] || {}).note || "", at: new Date().toISOString(), by: S.user().name };
    commit("validation", ["Validation item updated", "Client Validation", qid, status]);
    return { ok: true };
  };
  S.updateSettings = (patch) => {
    if (!S.can("*")) return fail("Only the In-charge / Administrator can change demo settings");
    Object.assign(S.db.settings, patch);
    commit("settings", ["Settings changed", "Settings", "", Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(", ")]);
    return { ok: true };
  };
  S.markNotifications = (ids) => { S.db.notifications.forEach((n) => { if (!ids || ids.includes(n.id)) n.read = true; }); S.save(); emit("notifications"); };

  window.State = S;
})();
