/* =====================================================================
   DEMO CONFIGURATION (hand-written — NOT extracted from source files)
   Everything in this file is either:
     • ILLUSTRATIVE DEMO DATA  — placeholder values to make the demo usable, or
     • PENDING CLIENT CONFIRMATION — business rules the client must decide.
   Source-derived data lives in the other data/*.js files.
   ===================================================================== */
window.CPP_CONFIG = {
  appName: "CPP Digital Lubrication Management System",

  /* ---- Roles: ILLUSTRATIVE, pending client confirmation (Q14) ---- */
  roles: [
    { id: "OPERATOR", name: "Lube Cell Operator", perms: ["receipt.create", "issue.create", "consumption.create", "return.create", "greasing.create", "sampling.create", "scrap.create", "inspection.create", "handover.create", "filtration.create"] },
    { id: "INCHARGE", name: "Lube Cell In-charge", perms: ["*"] },
    { id: "STORE", name: "Control Store User", perms: ["receipt.create", "receipt.confirm"] },
    { id: "ENGINEER", name: "Shift Engineer", perms: ["issue.approve", "handover.create", "inspection.create", "alerts.ack"] },
    { id: "MANAGER", name: "Management (view only)", perms: [] },
    { id: "ADMIN", name: "System Administrator", perms: ["*"] }
  ],
  /* Generic demo identities — no real personal names are used */
  users: [
    { id: "U01", name: "Demo Operator A", role: "OPERATOR", dept: "Lubrication Cell", status: "Active" },
    { id: "U02", name: "Demo Operator B", role: "OPERATOR", dept: "Lubrication Cell", status: "Active" },
    { id: "U03", name: "Demo In-charge", role: "INCHARGE", dept: "Lubrication Cell", status: "Active" },
    { id: "U04", name: "Demo Store User", role: "STORE", dept: "Control Store", status: "Active" },
    { id: "U05", name: "Demo Shift Engineer", role: "ENGINEER", dept: "CPP Operations", status: "Active" },
    { id: "U06", name: "Demo Manager", role: "MANAGER", dept: "CPP Management", status: "Active" },
    { id: "U07", name: "Demo Administrator", role: "ADMIN", dept: "IT", status: "Active" }
  ],

  /* ---- Inventory locations (process flow phase-1 + sampling sheet tanks) ---- */
  locations: [
    { id: "LOC-CS", name: "Control Store (Central Store)", type: "Upstream store", source: "Process flow phase-1, step 1", remarks: "Stock is received from here into the Lube Oil Cell sub-inventory." },
    { id: "LOC-LC", name: "Lube Oil Cell — Sub Inventory", type: "Sub inventory (stock-holding)", source: "Process flow phase-1, step 2", remarks: "The only stock-holding location tracked by this demo ledger." },
    { id: "LOC-RC1", name: "HLP-32 TANK (re-condition)", type: "Re-condition oil tank", source: "Oil sampling schedule › Re-condition oil sheet", remarks: "Re-conditioned oil is reported separately from new-oil stock." },
    { id: "LOC-RC2", name: "SERVO PRIME-68 TANK-1", type: "Re-condition oil tank", source: "Oil sampling schedule › Re-condition oil sheet", remarks: "" },
    { id: "LOC-RC3", name: "SERVO PRIME-68 TANK-2", type: "Re-condition oil tank", source: "Oil sampling schedule › Re-condition oil sheet", remarks: "" },
    { id: "LOC-CLN", name: "Clean Oil Tank", type: "Re-condition oil tank", source: "Oil sampling schedule › Re-condition oil sheet", remarks: "" },
    { id: "LOC-DRT", name: "Dirty Oil Tank", type: "Used oil tank", source: "Oil sampling schedule › Re-condition oil sheet", remarks: "" },
    { id: "LOC-SCR", name: "Scrap Oil Drum Storage (Lube Cell)", type: "Scrap storage", source: "Pending Client Confirmation", remarks: "Physical location and drum capacity to be confirmed." },
    { id: "LOC-DY", name: "Disposal Yard", type: "Scrap dispatch destination", source: "Dispose Oil Record › FY wise ('sent to disposal yard')", remarks: "" }
  ],

  /* ---- Illustrative filtration spares (NO spare data exists in source) ---- */
  filtrationSpares: [
    { id: "SP-01", name: "Filter element — fine (ILLUSTRATIVE)", unit: "Nos", stock: 6, minStock: 4 },
    { id: "SP-02", name: "Filter element — coarse (ILLUSTRATIVE)", unit: "Nos", stock: 3, minStock: 4 },
    { id: "SP-03", name: "Gasket kit (ILLUSTRATIVE)", unit: "Set", stock: 2, minStock: 1 },
    { id: "SP-04", name: "Hose assembly (ILLUSTRATIVE)", unit: "Nos", stock: 1, minStock: 2 }
  ],

  /* ---- Filtration machine PM checklist: ILLUSTRATIVE (client to supply OEM checklist) ---- */
  pmChecklist: [
    "Check filter differential pressure / indicator",
    "Inspect hoses and couplings for leakage",
    "Check pump motor current and abnormal noise",
    "Clean strainer / suction filter",
    "Verify heater / vacuum system operation (where fitted)",
    "Check electrical panel, earthing and interlocks",
    "Record running hours"
  ],

  /* ---- Client validation questions (Part 12) ---- */
  clientQuestions: [
    "Is opening stock verified?",
    "Is receipt information available electronically?",
    "How does EKAYAN issue integration work?",
    "Is stock issue approval mandatory?",
    "How are unused oil returns handled?",
    "How is actual consumption confirmed?",
    "How is scrap oil measured?",
    "Who approves stock adjustments?",
    "Are historical records to be migrated?",
    "What are the approved oil-grade-specific limits?",
    "How does LIMS exchange analysis data?",
    "Who maintains equipment master data?",
    "What are the alert frequencies?",
    "What are the user roles?",
    "Where will the application be hosted?",
    "What are the final approved reports?",
    "What are the data retention requirements?"
  ],

  /* ---- Business-rule decisions found during source analysis ---- */
  pendingDecisions: [
    { id: "D01", area: "Inventory", title: "Accounting of 'balance after top-up/replacement'", detail: "Process flow step 6 says leftover oil is 'added in inventory and the previous issued quantity adjusted'. The demo records this as a separate RETURN transaction against the original issue (issue quantity is preserved). Client to confirm this treatment.", impact: "Stock ledger, consumption reports" },
    { id: "D02", area: "Inventory", title: "Source column naming", detail: "MIS inventory sheets call the inflow column 'STOCK ISSUED FROM CENTRAL STORE'. In the Lube Cell sub-inventory this is a RECEIPT. The demo labels it as Receipt (from Control Store).", impact: "Terminology on all stock screens" },
    { id: "D03", area: "Inventory", title: "Issue approval", detail: "No approval step is described in the source. Approval is configurable in Demo Settings (default OFF).", impact: "Stock Issue workflow" },
    { id: "D04", area: "Inventory", title: "Adjustment approval authority", detail: "Demo requires In-charge/Admin approval before an adjustment affects stock. Authority to be confirmed.", impact: "Stock Adjustment" },
    { id: "D05", area: "Inventory", title: "Minimum stock and reorder levels", detail: "Not present in any source workbook. Demo shows a SUGGESTED level (average monthly consumption Apr–Sep'26) labelled illustrative; values are editable in Oil/Grease Master.", impact: "Low stock alerts" },
    { id: "D06", area: "Inventory", title: "Source balance-sheet arithmetic exceptions", detail: "Several monthly inventory sheets do not satisfy Opening + Received − Consumption = Balance, and some month openings differ from the previous month's balance (see Source Data Audit). Opening stock for go-live must be physically verified.", impact: "Opening balances" },
    { id: "D07", area: "Consumption", title: "Activity type in top-up history", detail: "The Top-up & Replacement history workbook does not distinguish top-up from replacement. Monthly MIS sheets use 'Oil flushing' and 'Oil Top Up' columns plus free-text remarks. Activity type list to be confirmed.", impact: "Top-up / Replacement history" },
    { id: "D08", area: "Equipment", title: "Unique equipment codes", detail: "Equipment names differ between workbooks (e.g. 'Mill Gearbox-1A', 'MILL-1A', 'Mill-1A'). The demo generates IDs and matches names approximately. A plant equipment code (SAP/EKAYAN) is required.", impact: "All equipment-linked modules" },
    { id: "D09", area: "Equipment", title: "Coverage counts", detail: "Source Summary sheet states 1,561 top-up equipment; the top-up history sheets contain 1,583 equipment columns (e.g. WB&LRSB/ESP counts differ). Greasing schedule lists 382 motors vs 392 stated. Sampling schedule lists 171 rows (incl. re-condition tanks) vs 141 stated.", impact: "Equipment Master" },
    { id: "D10", area: "Greasing", title: "Greasing frequency per motor", detail: "Only the FGD sheet states frequency (days). For other sheets the demo infers frequency from FY-27 dates or uses an illustrative 90-day default.", impact: "Due dates, compliance" },
    { id: "D11", area: "Greasing / Sampling", title: "Treatment of S/D, COH, AOH, Running, EMPTY", detail: "These remain remarks and are never converted to completion dates. Whether such cycles are excluded from compliance is configurable (default: NOT excluded).", impact: "Compliance %" },
    { id: "D12", area: "Scrap", title: "Scrap generation records", detail: "Source has disposal (dispatch to disposal yard) records only. Generation and drum-storage records do not exist; scrap opening balance is unknown.", impact: "Scrap reconciliation" },
    { id: "D13", area: "Scrap", title: "Final disposal vs dispatch", detail: "Is 'sent to disposal yard' the final disposal event, or should sale/recycler hand-over ('Waste to Wealth') be tracked separately?", impact: "Scrap disposal workflow" },
    { id: "D14", area: "Scrap", title: "FY-27 dispose figure", detail: "FY-wise sheet states FY-27 = 4,860 L 'Till June'26'. MIS sheet also contains a 24.07.2026 dispatch of 720 L (total 5,580 L).", impact: "Scrap MIS" },
    { id: "D15", area: "Analysis", title: "Combined MI/Ferrous limits", detail: "Limits such as '50/10 PPM' in a combined MI/Ferrous column cannot be attributed safely; these are shown as text and not auto-evaluated.", impact: "Abnormal result flags" },
    { id: "D16", area: "Alerts", title: "Alert intervals", detail: "Project report specifies sampling reminders 7 days before, on due date and overdue. Other alert intervals (greasing, PM, filtration, stock) are configurable until approved.", impact: "Automatic alerts" },
    { id: "D17", area: "Filtration", title: "Filtration machine list and spares", detail: "Source states 36 filtration machines but only machine labels from schedules and 12 machines in the top-up sheet are named. No spare-part data exists in the source.", impact: "Filtration Machine Management / PM" }
  ],

  /* ---- Scope mapping between the 14-point workbook and the project report phases ---- */
  scopeMapping: [
    { sn: 1,  phase: "Phase 3", phaseModule: "Equipment Master Database", pages: ["equipment"], note: "" },
    { sn: 2,  phase: "Phase 1", phaseModule: "Stock Entry, Stock Issue, Inventory Dashboard, Inventory Status", pages: ["stock-receipt", "stock-issue", "inventory", "inventory-dashboard"], note: "EKAYAN link mentioned in workbook remarks — integration proposed only." },
    { sn: 3,  phase: "Phase 1 / Phase 2", phaseModule: "Stock Issue (equipment-wise consumption entry) + Oil Top-Up History", pages: ["consumption", "topup-history"], note: "Workbook treats it as one point; report splits entry (Ph-1) and history (Ph-2)." },
    { sn: 4,  phase: "Phase 2", phaseModule: "Motor Greasing History, Greasing Compliance", pages: ["greasing", "greasing-schedule", "greasing-compliance"], note: "" },
    { sn: 5,  phase: "Phase 3", phaseModule: "Oil Sampling Schedule, Auto Alerts – Sampling", pages: ["sampling-schedule", "sample-collection"], note: "" },
    { sn: 6,  phase: "Not explicitly phased", phaseModule: "Oil Sampling Schedule mentions 'oil analysis details'", pages: ["oil-analysis", "analysis-history"], note: "Clarification needed: analysis records are not listed as a separate module in the report. LIMS link mentioned in workbook remarks." },
    { sn: 7,  phase: "Phase 3 (partly)", phaseModule: "Filtration Machine PM", pages: ["oil-filtration", "filtration-schedule", "filtration-machines"], note: "Filtration schedule/work history is not a named report module; PM is." },
    { sn: 8,  phase: "Optional (not phased)", phaseModule: "—", pages: ["daily-inspection"], note: "Workbook status: Optional." },
    { sn: 9,  phase: "Phase 3", phaseModule: "Filtration Machine PM, Auto Alerts – PM", pages: ["filtration-pm", "preventive-maintenance"], note: "Workbook marks Optional, but the report places Filtration Machine PM in Phase 3. Both classifications preserved." },
    { sn: 10, phase: "Phase 2", phaseModule: "Waste to Wealth", pages: ["scrap-generation", "scrap-transfer", "scrap-disposal", "scrap-reconciliation"], note: "" },
    { sn: 11, phase: "Phase 3 (sampling & PM alerts only)", phaseModule: "Auto Alerts – Sampling, Auto Alerts – PM", pages: ["alerts"], note: "Workbook marks Optional; report includes sampling and PM alerts in Phase 3. Both preserved." },
    { sn: 12, phase: "Phase 1", phaseModule: "KPI Monitoring, Trend Analysis", pages: ["mis-dashboard", "dashboard"], note: "" },
    { sn: 13, phase: "Not explicitly phased", phaseModule: "—", pages: ["reports", "stock-reports", "consumption-reports"], note: "Reports implied across phases; final report list pending (Q16)." },
    { sn: 14, phase: "Optional (not phased)", phaseModule: "—", pages: ["shift-handover"], note: "Workbook status: Optional." }
  ]
};
