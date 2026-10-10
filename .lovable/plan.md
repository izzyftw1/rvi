# Workflow Briefing (no code changes)

This is a briefing only. Approving it changes nothing. Each claim is labelled: **[code]** means it's backed by a file or migration, **[data]** means a live database query, and **[inferred]** means it's an inference that hasn't been fully verified.

## Live data snapshot [data]
- 70 sales orders, 44 work orders (WOs), 35 `sales_order_line_items`, 0 `sales_order_items`.
- `material_requirements_v2` has 45 rows. `material_requirements` (v1) has 0.
- Purchase orders: `raw_purchase_orders` has 27, `purchase_orders` has 5, `raw_material_po` has 0.
- Lots: `material_lots` has 21, `inventory_lots` has 22.
- Material issue tables are all empty: `wo_material_issues`, `material_issues` and `work_order_heat_issues` each have 0 rows.
- 26 `production_batches`, 13 shipments and 3 invoices.
- **All 44 WOs have `status = 'pending'`**. Their `current_stage` values: goods_in 21, production 8, mass_production 4, production_planning 3, packing 3, forging 3, plating 1, proforma_sent 1.
- **All 13 shipments have `so_id = NULL`.**
- `sales_order_line_items` has **no price column**. Its columns are: item_code, quantity, alloy, size, cycle time, weights, due_date, status, work_order_id, item_id and drawing_number.
- **Test data:** 41 of the 70 SOs were created before Dec 2025. They include so_id values like 2397232, 111111111, 11111111, 1111123, SO-456, SO-123123 and SO-1234, with PO numbers like 123123, 1234 and 456. These are clearly test entries. Some are approved and two are rejected.

## Step by step

### 1. Customer and item master
- **Pages and roles:** customer and item master pages, used by Sales and Admin.
- **Tables:** `customer_master` (party_code, GST and state live here) and `item_master`.
- **Automation:** none. These are plain data entry.

### 2. Sales order and proforma invoice
- **Page and role:** `src/pages/Sales.tsx`, used by Sales. **Tables:** `sales_orders` and `sales_order_line_items`. `proforma_invoices` is created from the SO.
- **Auto-approval [code]:** `Sales.tsx:352` inserts the SO as `pending`. Lines 396-407 then immediately update the line items and the SO to `approved`. This is frontend logic, not a database rule. There is no real approval step, and it exists only to fire the WO-generation trigger. **Verdict: a convenience shortcut, not a deliberate approval design.**
- **Legacy:** `sales_order_items` is empty and unused. `sales_order_line_items` is current.

### 3. Work order creation
- **Trigger [code]:** `auto_generate_work_order_from_line_item()` (latest version in `20260101112332`). It runs AFTER UPDATE on `sales_order_line_items` when the status changes to `approved` and `work_order_id IS NULL`.
  - It creates one WO with `status = 'pending'` and `current_stage = 'goods_in'`.
  - It fills specs from the line item, then the SO, then `item_master`, in that order.
  - It writes the new WO id back to the line item.
  - `trigger_set_wo_number()` generates the WO number on the server.
- **Retired trigger:** `auto_generate_work_orders()` (the JSON items path) was turned into a no-op in `20251225134417` to stop duplicate WOs.
- **Multiple WOs per SO or line item:**
  - **Per SO:** intended. Each line item gets its own WO.
  - **Per line item:** not a designed feature. It only happens two ways:
    - (a) Manual creation in `src/pages/NewWorkOrder.tsx:232-260`, used by Production or Admin. This is the only route for split runs or re-orders against an existing SO.
    - (b) The line item's `work_order_id` gets cleared and the item is approved again.
  - No "split batch" or "partial release" logic exists at WO level. Partial output is handled through `production_batches`, not extra WOs.

### 4. Material requirements
- **Pages and role:** `/material-requirements-v2` (`MaterialRequirementsDashboard.tsx`), used by Production and Purchase.
- **Tables:** `material_requirements_v2` is current. Migration `20260101112332` backfills it from WOs. v1 `material_requirements` is empty and legacy.

### 5. Raw purchase orders (RPO)
- **Page and role:** `src/pages/RawPurchaseOrders.tsx`, used by Purchase.
- **Tables:** `raw_purchase_orders` is current. `purchase_orders` is an older general PO table, and `raw_material_po` is legacy and empty.
- **Receipts and reconciliation:** `raw_po_receipts` and `raw_po_reconciliations`.

### 6. Gate register and goods inwards
- **Page and roles:** `src/pages/GateRegister.tsx`, used by Security, Stores and Logistics. The goods-in form also writes through `src/lib/gateRegisterUtils.ts`.
- **Table:** `gate_register` is the source of truth for every movement in and out.
- **Triggers:** `gate_register_propagate` and `gate_register_to_inventory` push inward material into lots and inventory and into RPO receipts. `auto_generate_gate_entry_no` assigns the entry number.

### 7. Incoming material QC
- **Pages and role:** QC pages and the WO Detail QC tab, used by QC.
- **Table:** `qc_records` with `qc_type = incoming`.
- **Triggers:** `notify_qc_on_material_receipt`, `auto_create_qc_incoming_on_wo` and `auto_create_qc_for_work_order` create the pending QC tasks. The QC result is meant to gate production release.

### 8. Material issue to a work order
- **Intended design [inferred from docs/FEATURE_INVENTORY.md]:** stores issue a heat/lot from `material_lots` to a WO.
  - `wo_material_issues` and `work_order_heat_issues` link WO, lot, heat number and quantity. `log_material_issue` keeps the audit trail.
  - Heat traceability is meant to run: gate entry → lot (heat no) → issue → batch → carton → dispatch.
- **Reality [data]:** all three issue tables are empty. **Material is never formally issued today, so heat traceability is broken at this link.** Lots exist, but nothing ties them to WOs.
- **Lot tables:** `material_lots` is the documented source of truth. `inventory_lots` overlaps and is used for goods-in staging. Where one ends and the other begins is not cleanly defined.

### 9. Production
- **Pages and role:** WO Detail and the production pages, used by Production. Supporting tables:
  - `cutting_records` and `forging_records`, auto-created by `auto_create_cutting_forging_records`.
  - `wo_machine_assignments`.
  - `daily_production_logs`, which feed `log_production_entry` and the operator and machine metrics.
- **Release gate:** `ProductionReleaseSection.tsx:76` sets `current_stage = 'production'` once material QC and first-piece QC pass.
- **First piece QC:** stored in `qc_records` as first_piece.
- **Hourly QC:** `hourly_qc_checks`. By your decision, nothing enforces a check every hour.
- **Quantity source of truth [code + doc]:** `docs/PRODUCTION_BATCHES_SSOT.md` (2025-12-25, marked Implemented) says the following:
  - Produced, QC-approved, rejected, packed and dispatched quantities come from `production_batches`, `cartons` and `dispatches`.
  - `daily_production_logs` is analytics only.
  - Batches are created by `get_or_create_production_batch` and read through the `useBatchQuantities` hook.

### 10. External processing
- **Pages and roles:** `SendToExternalDialog.tsx` and the receive dialogs, used by Production and Logistics.
- **Tables:** `wo_external_moves` and `wo_external_receipts` are current. `external_movements` is the older table. `external_partners` holds vendor data.
- **Visibility:** each move creates a gate OUT entry, and each receipt creates a gate IN entry.
- **Stage changes [code]:** `SendToExternalDialog.tsx:320` sets `current_stage` to the process stage (plating, forging and so on).
- **Post-external QC:** `auto_create_post_external_qc` creates it.

### 11. Final and dispatch QC
- **Page and role:** `src/pages/DispatchQC.tsx`, used by QC.
- **Tables:** `dispatch_qc_batches`, with IDs from `generate_dispatch_qc_batch_id`, plus `qc_final_reports`.
- **On pass [code]:** lines 309 and 421 set `current_stage = 'packing'`.

### 12. Packing
- **Pages and role:** the Packing and Cartons pages, used by Packing.
- **Tables:** `cartons`, `pallets` and `pallet_cartons`.
- **Limits:** `get_batch_packable_qty` caps packing at the QC-approved quantity. `log_carton_build` keeps the audit trail.

### 13. Dispatch, shipments and dispatch notes
- **Page and role:** `src/pages/Dispatch.tsx`, used by Logistics.
- **Tables:**
  - `dispatches` is per batch and is the quantity source of truth.
  - `dispatch_notes` carries commercial data: `unit_rate`, `work_order_id` and `sales_order_id`.
  - `shipments` groups pallets into a consignment and has events in `shipment_events`.
- **Triggers:** `audit_dispatch_creation`, plus the dispatch-driven WO auto-complete trigger (`auto_complete_wo_on_dispatch`).
- **Why shipments have no SO link:** the column `shipments.so_id` exists, but it's null on all 13 rows. A shipment can carry cartons from several WOs or SOs, so the commercial link was put on `dispatch_notes` instead. **Verdict: the SO link on shipments is left unused rather than designed out.** Invoices should pick up the customer through `dispatch_notes.sales_order_id` → `sales_orders.customer_id` → `customer_master`. `CreateInvoices.tsx:99-112` still tries the shipment → SO route, which yields nothing today.

### 14. Invoicing, receipts and finance
- **Page and role:** `src/pages/finance/CreateInvoices.tsx`, used by Finance.
- **Tables:** `invoices` and `invoice_items` (totals computed by `calculate_invoice_totals`), then `customer_receipts` and `receipt_allocations` (handled by `handle_receipt_allocation`).
- **Other finance tables:** `payments`, `customer_credit_adjustments`, `tds_records` and `finance_period_locks` (enforced by `check_period_lock`).
- **GST [code]:** decided in the frontend at `CreateInvoices.tsx:321-331`. Export is 0%. Otherwise 18%, split into CGST/SGST or IGST by comparing the customer's state from `customer_master`.
- **Unit rate:** see the price gap below.

### 15. NCR
- **Tables:** `ncrs` and `ncr_actions`, plus `capa`. Raised from QC failures at any stage.
- **Triggers:** `generate_ncr_number`, `auto_link_ncr_material_lot` and `calculate_ncr_cost_impact`.
- **Effect:** an open NCR is meant to block the WO; the QC Control Tower reads this.

## Answers to your specific questions

**Status vs stage.** `work_orders.status` effectively only changes from `pending` to `completed`. That happens through `mark_wo_complete` or `auto_complete_wo_on_dispatch`. `current_stage` is the real progress field, written by the frontend at each step. The `wo_stage` enum started with 5 values (goods_in, production, qc, packing, dispatch). Later migrations (`20251105045411`, `20251105081226`) added granular stages: cutting_*, forging_*, raw_material_*, first_piece_qc, mass_production, plating, buffing, blasting, proforma_sent and production_planning. **Canonical set used today:** goods_in → production_planning → (cutting / forging) → production / mass_production → (external process stages) → qc → packing → dispatch. Status is not formally deprecated, but it works as an open/closed flag only. `sync_wo_status_to_so` marks the SO fulfilled only when every WO's status is `completed`, so a lagging status keeps SOs open. Quantities come from `production_batches`.

**production_batches as the quantity source of truth.** Yes, by explicit decision in `docs/PRODUCTION_BATCHES_SSOT.md`.

**Null price_per_pc.** Both WO triggers (`20251225134417` and `20260101112332`) hardcode `'price_per_pc', NULL` in `financial_snapshot`. Line items also have no price column. The rate lives only in the SO's items JSON, or on proforma and line data entered in `Sales.tsx`. `Dispatch.tsx:480,652` reads the snapshot price, falls back to `|| 0`, and copies it into `dispatch_notes.unit_rate`. `CreateInvoices.tsx` then uses that value. **Result: invoice rates default to 0.** The intended source should be the SO line price, through `dispatch_notes` → SO. This looks like a gap, not a deliberate design.

**Permission model.**
- **Department (main mechanism):** `profiles.department_id` → `departments.type`. That feeds `role_permissions` for the default page access, `user_permission_overrides` for per-user exceptions, `action_permissions` for button-level actions, and `get_effective_permission`.
- **`user_roles` / `app_role` (privilege flags only):** used for admin, super_admin and finance roles through `has_role`, `is_admin_user` and `is_finance_role`.
- **Why Finance and Admin bypass the checks:** `can_access_page` (`20251231103513:36-76`) returns true straight away for admin, super_admin, finance_admin and accounts. The intent is that these roles see everything, including unmasked customer and financial fields (`work_orders_restricted`, `can_view_financial_fields`).
- **Inconsistency:** `finance_user` counts as finance for unmasking (`is_finance_role`) but is **not** on the page-bypass list.

**Test data.** Yes. About 41 SOs from Oct and Nov 2025 have placeholder IDs and PO numbers (SO-1234, 11111111, 111111111, 1111123, 2397232 and others). Some WOs, batches and the 13 shipments may come from them too. Nothing marks them as test data.

## Current vs legacy summary

```text
Current                      Legacy / unused
sales_order_line_items       sales_order_items (0 rows)
material_requirements_v2     material_requirements (0 rows)
raw_purchase_orders          purchase_orders (5), raw_material_po (0)
material_lots (traceability) inventory_lots (overlapping goods-in staging)
wo_external_moves/receipts   external_movements
production_batches (qty)     daily_production_logs aggregation (analytics only)
current_stage (progress)     status (open/closed flag only)
dispatch_notes (commercial)  shipments.so_id (never populated)
```

## Gaps this briefing surfaced (not fixed)
1. Material is never issued to WOs, so heat traceability is broken.
2. Price is not carried from the SO to the WO and dispatch, so invoice rates become 0.
3. The shipment → SO link is empty, so the invoice customer lookup relies on fallbacks.
4. SO auto-approval skips any real approval step.
5. A WO's status stays pending until completion, so SOs never show as fulfilled until then.
6. `finance_user` is treated differently for page access than for data visibility.
7. Test data is mixed in with production data.
