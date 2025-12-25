# Production Batches: Single Source of Truth (SSOT)

**Date:** 2025-12-25  
**Status:** Implemented

## Overview

All UI quantity displays across the application now derive values exclusively from **`production_batches`**, **`cartons`**, and **`dispatches`** tables—never from `daily_production_logs` aggregation.

## What Changed

### Before
- `WorkOrders.tsx` aggregated `ok_quantity` and `total_rejection_quantity` from `daily_production_logs`
- `ProductionProgress.tsx` computed progress from log-derived "QC approved" (which was actually batch-level)
- Inconsistent sources led to WOs showing 0% despite having production

### After
- **`useBatchQuantities.ts`** is the canonical hook for batch-derived quantities
- **`fetchBatchQuantitiesMultiple`** is used for bulk loading on list pages (chunked to avoid URL length limits)
- All pages now use batch-level `produced_qty`, `qc_approved_qty`, `qc_rejected_qty`

## Source of Truth Mapping

| Display Field          | Source Table               | Column(s)                                      |
|------------------------|----------------------------|------------------------------------------------|
| **Produced Qty**       | `production_batches`       | `produced_qty`                                 |
| **QC Approved Qty**    | `production_batches`       | `qc_approved_qty`                              |
| **QC Rejected Qty**    | `production_batches`       | `qc_rejected_qty`                              |
| **Packed Qty**         | `cartons`                  | `SUM(quantity)`                                |
| **Dispatched Qty**     | `dispatches` / `cartons`   | `SUM(quantity)` where dispatched               |
| **In Production**      | `production_batches`       | `stage_type = 'production'`                    |
| **At External**        | `production_batches`       | `stage_type = 'external'` + `external_process_type` |

## What `daily_production_logs` Is For

`daily_production_logs` is **analytics only**:
- Shift-level output vs. target
- Machine utilization %
- Operator efficiency %
- Rejection Pareto (by reason)
- Downtime breakdown

It is **NOT** used for:
- WO progress %
- Dispatch eligibility
- Packing availability
- Any quantity that gates workflow

## Hooks & Functions

| Hook / Function                   | Purpose                                      |
|-----------------------------------|----------------------------------------------|
| `useBatchQuantities`              | Single-WO batch quantities (with realtime)   |
| `fetchBatchQuantitiesMultiple`    | Bulk fetch for list pages                    |
| `useWOBatchQuantities`            | Detailed breakdown with external split       |
| `useWOBatchStages`                | Stage-wise batch distribution                |
| `useProductionLogMetrics`         | Analytics only (efficiency, downtime, etc.)  |

## Validation Checklist

- [x] WO with produced_qty > 0 shows non-zero progress on Work Orders list
- [x] WO detail page shows correct produced/QC/packed/dispatched
- [x] Packing page shows batches with QC-approved quantities
- [x] Dispatch page shows cartons ready for dispatch
- [x] All quantities reconcile when summed from batches
- [x] No trigger-based sync overwrites batch-derived values

## Real-time Updates

All batch-based hooks subscribe to:
- `production_batches` (INSERT/UPDATE)
- `cartons` (INSERT/UPDATE)
- `dispatches` (INSERT/UPDATE)

This ensures quantities update live without manual refresh.
