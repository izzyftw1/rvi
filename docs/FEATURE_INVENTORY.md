# Feature Inventory - Production & Quality Pages

> **IMPORTANT**: Do not remove or hide any page until all of its data and actions are confirmed to exist elsewhere.

---

## PRODUCTION PAGES

### 1. Daily Production Log (`/daily-production-log`)
**File**: `src/pages/DailyProductionLog.tsx` (1363 lines)
**Purpose**: Primary data entry for production

| Data Shown | Source Tables/Hooks | User Actions |
|------------|---------------------|--------------|
| Log entries list (date, plant, shift, machine, WO, operator, programmer) | `daily_production_logs` | Create new log entry |
| Downtime events (reason, duration, remark) | `daily_production_logs.downtime_events` (JSON) | Add/remove downtime events |
| Rejection breakdown (10 categories) | `daily_production_logs.rejection_*` columns | Enter rejection quantities |
| Calculated metrics: runtime, target qty, efficiency %, OK qty | Derived from form inputs | Target override (admin only) |
| Machine list | `machines` | Select machine |
| Work order list | `work_orders` | Select work order |
| Operator/programmer list | `people` | Select operator/programmer |

**Unique Features**:
- Downtime event builder with categorized reasons
- Target override with reason (admin only)
- Auto-calculated efficiency: (actual / target) × 100
- Auto-calculated OK qty: actual - total rejections
- Real-time form calculations

---

### 2. CNC Programmer Activity (`/cnc-programmer-activity`)
**File**: `src/pages/CNCProgrammerActivity.tsx` (644 lines)
**Purpose**: Track programmer setups and first-piece approvals

| Data Shown | Source Tables/Hooks | User Actions |
|------------|---------------------|--------------|
| Activity logs (date, programmer, machine, WO, item, setup times) | `cnc_programmer_activity` | Create new activity entry |
| Summary stats (total setups, new/repair, FP approved, avg duration) | Derived from `cnc_programmer_activity` | Date filter |
| Setup type (new/repair) | `cnc_programmer_activity.setup_type` | Select setup type |
| First piece approval time | `cnc_programmer_activity.first_piece_approval_time` | Record approval time |
| QC approver | `people` (filtered by QC role) | Select QC approver |

**Unique Features**:
- Auto-calculate setup duration from start/end times
- Repair setups flagged for quality investigation
- Feeds into Setter Efficiency analytics

---

### 3. Cutting (`/cutting`)
**File**: `src/pages/Cutting.tsx` (280 lines)
**Purpose**: Track cutting queue and progress

| Data Shown | Source Tables/Hooks | User Actions |
|------------|---------------------|--------------|
| Cutting records (WO, customer, item, qty required/cut, remaining) | `cutting_records` + `work_orders` | Start cutting |
| Status (pending, in_progress, completed) | `cutting_records.status` | Record progress |
| Progress tracking | Derived from qty_cut vs qty_required | Update qty cut |

**Unique Features**:
- Real-time subscription for updates
- Progress modal for recording cut quantities

---

### 4. Forging (`/forging`)
**File**: `src/pages/Forging.tsx` (371 lines)
**Purpose**: Track forging queue and external vendor progress

| Data Shown | Source Tables/Hooks | User Actions |
|------------|---------------------|--------------|
| Forging records (WO, customer, item, vendor, qty, QC status) | `forging_records` + `work_orders` | Start/update forging |
| Vendor list | `suppliers` | Select vendor |
| Sample sent / QC approved toggles | `forging_records.sample_sent`, `qc_approved` | Toggle sample/QC status |
| Start/end dates | `forging_records.forging_start_date/end_date` | Set dates |

**Unique Features**:
- External vendor tracking
- Sample/QC approval workflow

---

### 5. Floor Dashboard (`/floor-dashboard`)
**File**: `src/pages/FloorDashboard.tsx` (452 lines)
**Purpose**: Live operational state - blockers, machines, queue depth

| Data Shown | Source Tables/Hooks | User Actions |
|------------|---------------------|--------------|
| Blocker stats (Material QC, First Piece, External, Ready) | `work_orders` (filtered) | Navigate to production progress |
| Machine status (active/idle counts) | `machines` | Refresh |
| External moves count | `wo_external_moves` | - |
| Today's production logs | `daily_production_logs` (today only) | - |
| Operators active today | Derived from logs | - |

**Tabs**:
- **Stages**: `StageView` component - WO distribution by stage
- **Machines**: `MachinesView` - machine status cards
- **Operators**: `OperatorsView` - operator activity
- **Blockers**: `ThresholdAlerts`, `ActionableBlockers`, `BlockedWorkOrdersTable`

**Unique Features**:
- Real-time subscription (30s refresh + postgres_changes)
- Live blocker counts with ownership labels
- NO historical analytics (directed to efficiency pages)

---

### 6. CNC Dashboard (`/cnc-dashboard`)
**File**: `src/pages/CNCDashboard.tsx` (830 lines)
**Purpose**: Execution focus - queues, blockers, next actions

| Data Shown | Source Tables/Hooks | User Actions |
|------------|---------------------|--------------|
| Machine cards (readiness, queue count, oldest job age, current WO) | `machines` + `wo_machine_assignments` + `work_orders` | Open assign dialog |
| Queue info | `wo_machine_assignments` (status=scheduled) | View queue |
| Blockers per machine | `daily_production_logs`, `maintenance_logs`, `machines.qc_status` | - |
| Summary: Ready/Running/Blocked/Queued/Oldest Age | Derived | Assign work to machine |

**Unique Features**:
- Readiness status (ready, setup_required, running, maintenance_due, down, qc_blocked)
- Priority calculation based on queue metrics
- Flow impact derivation from queued WOs
- NO utilisation % - directed to Machine Utilisation page

---

### 7. Production Progress (`/production-progress`)
**File**: `src/pages/ProductionProgress.tsx` (686 lines)
**Purpose**: Read-only view of WO progress from Production Logs

| Data Shown | Source Tables/Hooks | User Actions |
|------------|---------------------|--------------|
| WO progress (OK qty, scrap qty, remaining, progress %) | `daily_production_logs` aggregated by WO | Navigate to WO detail |
| Buckets: Material QC blocked, First Piece blocked, Ready not started, External | `work_orders` + `wo_external_moves` | - |
| Aging indicators | Derived from created_at | - |
| Flow health status (GREEN/AMBER/RED) | Derived from aging | - |
| Summary: Net Completed, Scrap, Remaining, In Progress, Avg Progress | Aggregated from logs | - |

**Unique Features**:
- SINGLE SOURCE OF TRUTH for progress metrics
- Formula: Progress % = (OK Qty ÷ Ordered) × 100
- Real-time subscription on `daily_production_logs`
- Bucket-based categorization with action links

---

### 8. Machine Utilisation (`/machine-utilisation`)
**File**: `src/pages/MachineUtilisation.tsx` (645 lines)
**Purpose**: Historical analytics - utilisation, downtime, scrap by machine

| Data Shown | Source Tables/Hooks | User Actions |
|------------|---------------------|--------------|
| Avg utilisation % | `useProductionLogMetrics` | Period toggle (daily/weekly/monthly) |
| Total runtime / downtime | `useProductionLogMetrics` | Date picker |
| Total scrap | `useProductionLogMetrics` | Machine filter |
| Utilisation trend chart | `useProductionLogMetrics.dailyMetrics` | - |
| Downtime by category (Pareto) | `useProductionLogMetrics.downtimePareto` | - |
| Scrap by machine chart | `useProductionLogMetrics.machineMetrics` | - |
| Machine breakdown table | `useProductionLogMetrics.machineMetrics` | - |

**Unique Features**:
- Uses centralized `useProductionLogMetrics` hook
- Downtime categorized by DOWNTIME_CATEGORIES config
- Export capability (implicit via charts)

---

### 9. Operator Efficiency (`/operator-efficiency`)
**File**: `src/pages/OperatorEfficiency.tsx` (437 lines)
**Purpose**: Historical analytics - operator performance

| Data Shown | Source Tables/Hooks | User Actions |
|------------|---------------------|--------------|
| Operator table (name, runtime, target, actual, OK, rejected, efficiency %, scrap %) | `useProductionLogMetrics.operatorMetrics` | Period toggle (daily/weekly/monthly) |
| Summary: Operators count, Runtime, Actual Qty, OK Qty, Rejections, Avg Efficiency, Avg Scrap | Derived from hook | Date picker |
| | | Machine filter |
| | | Process filter |
| | | Export CSV |

**Unique Features**:
- Uses centralized `useProductionLogMetrics` hook
- NO LOCAL CALCULATIONS - all from hook
- Formulas: Efficiency = (OK Qty ÷ Target) × 100, Scrap % = (Rejections ÷ Actual) × 100

---

### 10. Setter Efficiency (`/setter-efficiency`)
**File**: `src/pages/SetterEfficiency.tsx` (386 lines)
**Purpose**: Historical analytics - setter/setup performance

| Data Shown | Source Tables/Hooks | User Actions |
|------------|---------------------|--------------|
| Setter table (name, total setups, avg setup time, total setup time, setups/day) | `useProductionLogMetrics.operatorMetrics` (proxy) | Period toggle |
| Summary: Setters count, Total Setups, Avg Setup Time, Total Setup Time, Setups/Day | Derived | Date picker |
| | | Machine filter |
| | | Export CSV |

**Unique Features**:
- Uses `useProductionLogMetrics` (operators as proxy for setters)
- Links to CNC Programmer Activity for data entry

---

### 11. Downtime Analytics (`/downtime-analytics`)
**File**: `src/pages/DowntimeAnalytics.tsx` (781 lines)
**Purpose**: Historical analytics - downtime patterns

| Data Shown | Source Tables/Hooks | User Actions |
|------------|---------------------|--------------|
| Total downtime, trend vs previous period | `daily_production_logs.downtime_events` | Period toggle |
| Downtime by reason (Pareto chart) | Derived from downtime_events JSON | Machine filter |
| Downtime by category (pie chart) | `getCategoryForReason()` mapping | - |
| Downtime by machine (table with trend) | Aggregated by machine_id | - |
| Downtime by operator (table with repeat offender flag) | Aggregated by operator_id | - |
| Repeat offenders (machines with >20% increase) | Trend calculation | - |

**Unique Features**:
- Trend comparison with previous period
- Category aggregation using `DOWNTIME_CATEGORIES` config
- Repeat offender identification

---

## QUALITY PAGES

### 1. Quality Dashboard (`/quality`)
**File**: `src/pages/Quality.tsx` (371 lines)
**Purpose**: QC overview across all work orders

| Data Shown | Source Tables/Hooks | User Actions |
|------------|---------------------|--------------|
| QC stats (total inspections, pass rate, failed, pending) | `qc_records` aggregated | Navigate to WO QC tab |
| WOs needing action | `work_orders` filtered by pending QC | - |
| All active WOs with QC status | `work_orders` + `qc_records` + `daily_production_logs` | - |
| Production metrics per WO (qty, rejections, efficiency) | `daily_production_logs` | - |

**Unique Features**:
- QC actions are WO-based (links to WO detail)
- Production metrics from Daily Production Log (read-only)
- Real-time subscription

---

### 2. Incoming QC (`/qc/incoming`)
**File**: `src/pages/QCIncoming.tsx` (283 lines)
**Purpose**: Material QC status across work orders

| Data Shown | Source Tables/Hooks | User Actions |
|------------|---------------------|--------------|
| WO list with material status | `work_orders` | Navigate to WO QC tab |
| Material arrived/issued status | `wo_material_issues` + `material_lots` | - |
| Material QC status | `work_orders.qc_material_status` | - |
| First piece status | `work_orders.qc_first_piece_status` | - |
| Pending QC count | Derived from material_lots.qc_status | - |

**Tabs**: All / Awaiting Material / Passed / Failed

**Unique Features**:
- Material lot enrichment
- Alloy display from BOM

---

### 3. Hourly QC (`/hourly-qc`)
**File**: `src/pages/HourlyQC.tsx` (693 lines)
**Purpose**: IPQC dimensional checks during production

| Data Shown | Source Tables/Hooks | User Actions |
|------------|---------------------|--------------|
| Eligible WOs (tolerances defined, in production) | `work_orders` + `dimension_tolerances` + `hourly_qc_checks` | Select WO |
| Tolerance specs | `dimension_tolerances` | Select operation (A/B/C/D) |
| Production context | `daily_production_logs` | Select machine |
| Rejection breakdown from production log | `daily_production_logs.rejection_*` | Review/classify rejections |
| Binary checks (thread, visual, plating, thickness) | Form state | Toggle applicability |
| | | Submit QC check |
| | | Raise NCR |

**Unique Features**:
- Dimensional measurement entry
- Auto tolerance check against limits
- Production context display
- Rejection classification review
- NCR creation from QC

---

### 4. Final QC List (`/final-qc`)
**File**: `src/pages/FinalQCList.tsx` (248 lines)
**Purpose**: Quality release work orders for dispatch

| Data Shown | Source Tables/Hooks | User Actions |
|------------|---------------------|--------------|
| WOs in production/qc/packing/dispatch stages | `work_orders` | Navigate to FQC detail |
| QC check count per WO | `hourly_qc_checks` | Search |
| Quality released status | `work_orders.quality_released` | - |
| Final QC result | `work_orders.final_qc_result` | - |

**Unique Features**:
- Stage priority sorting (qc first)
- Released/Blocked badge display

---

### 5. Final QC Detail (`/final-qc/:woId`)
**File**: `src/pages/FinalQC.tsx`
**Purpose**: Final quality inspection and release

| Data Shown | Source Tables/Hooks | User Actions |
|------------|---------------------|--------------|
| WO summary | `work_orders` | Quality release |
| Production summary | `daily_production_logs` aggregated | Block/reject |
| QC records | `qc_records` + `hourly_qc_checks` | Generate report |
| NCRs | `ncrs` | - |
| Measurement data | `qc_measurements` | - |

---

### 6. NCR Management (`/ncr`)
**File**: `src/pages/NCRManagement.tsx` (371 lines)
**Purpose**: Non-conformance report management

| Data Shown | Source Tables/Hooks | User Actions |
|------------|---------------------|--------------|
| NCR list (number, type, WO, machine, operator, issue, qty, status) | `ncrs` + `work_orders` + `machines` + `daily_production_logs` + `people` | Create NCR |
| Stats (total, open, in progress, effectiveness pending, closed) | Derived | Navigate to NCR detail |
| Rejection type | `ncrs.rejection_type` | Filter by status |
| Raised from source | `ncrs.raised_from` | Filter by type |
| | | Search |

**Unique Features**:
- 8D methodology workflow
- Status progression: OPEN → ACTION_IN_PROGRESS → EFFECTIVENESS_PENDING → CLOSED
- Type categorization: INTERNAL, CUSTOMER, SUPPLIER
- Links to production log context

---

### 7. NCR Detail (`/ncr/:id`)
**File**: `src/pages/NCRDetail.tsx`
**Purpose**: Individual NCR management with 8D methodology

| Data Shown | Source Tables/Hooks | User Actions |
|------------|---------------------|--------------|
| NCR details | `ncrs` | Update status |
| Root cause analysis | `ncrs.root_cause` | Add actions |
| Corrective actions | `ncr_actions` | Record containment |
| Linked WO/machine/operator | Related tables | Verify effectiveness |
| Timeline | Derived | Close NCR |

---

### 8. Quality Traceability (`/quality/traceability`)
**File**: `src/pages/QualityTraceability.tsx` (951 lines)
**Purpose**: Audit-ready traceability lookup

| Data Shown | Source Tables/Hooks | User Actions |
|------------|---------------------|--------------|
| Work order summary | `work_orders` | Search by WO/item/heat/machine/date |
| Material QC records | `qc_records` (incoming) | Date/shift filter |
| Production logs | `daily_production_logs` | - |
| IPQC records | `hourly_qc_checks` | - |
| NCRs | `ncrs` | - |
| Material issues | `wo_material_issues` + `material_lots` | - |
| Final QC result | `work_orders.final_qc_result` | - |
| Release status | `work_orders.quality_released` | - |
| Frozen status | `work_orders.traceability_frozen` | - |

**Search Types**: Work Order, Item Code, Heat No/Lot ID, Machine, Date/Shift

**Unique Features**:
- Comprehensive traceability chain
- Immutable frozen records after FQC release
- Machine/operator enrichment

---

### 9. Quality Documents (`/quality/documents`)
**File**: `src/pages/QualityDocuments.tsx`
**Purpose**: Access to quality documentation

| Data Shown | Source Tables/Hooks | User Actions |
|------------|---------------------|--------------|
| Final QC Reports | `qc_final_reports` | View/download |
| NCR Documents | `ncrs` | Navigate to NCR |
| Certificates (placeholder) | - | - |

---

### 10. Quality Analytics (`/quality/analytics`)
**File**: `src/pages/QualityAnalytics.tsx` (419 lines)
**Purpose**: Quality defect trends and analytics

| Data Shown | Source Tables/Hooks | User Actions |
|------------|---------------------|--------------|
| KPIs (FPY, rejection rate, efficiency, total rejections, utilisation) | `useProductionLogMetrics` | Date range selector |
| Quality loss summary (scrap pcs, scrap %) | `useProductionLogMetrics` | View toggle (operator/machine/type) |
| Defect trends by operator | `useProductionLogMetrics.operatorMetrics` | - |
| Defect trends by machine | `useProductionLogMetrics.machineMetrics` | - |
| Rejection breakdown by type | `useProductionLogMetrics.rejectionBreakdown` | - |

**Unique Features**:
- Uses centralized `useProductionLogMetrics` hook
- NO LOCAL CALCULATIONS
- Charts and tables side-by-side

---

### 11. Tolerances (`/tolerance-setup`)
**File**: `src/pages/ToleranceSetup.tsx` (439 lines)
**Purpose**: Define dimensional tolerances for QC checks

| Data Shown | Source Tables/Hooks | User Actions |
|------------|---------------------|--------------|
| Tolerance list by item/operation | `dimension_tolerances` | Add tolerance |
| Dimensions with min/max | `dimension_tolerances.dimensions` (JSON) | Edit tolerance |
| Item codes | `work_orders` + `item_master` | Select item code |

**Operations**: A, B, C, D

**Unique Features**:
- Dynamic dimension rows (up to 100)
- Per-operation tolerance specs
- Real-time subscription

---

### 12. Instruments (`/instruments`)
**File**: `src/pages/InstrumentManagement.tsx` (350 lines)
**Purpose**: Measurement instrument calibration tracking

| Data Shown | Source Tables/Hooks | User Actions |
|------------|---------------------|--------------|
| Instrument list (name, type, serial, location, calibration dates, status) | `measurement_instruments` | Add instrument |
| Stats (total, valid, due soon, overdue) | Derived | Edit instrument |
| Calibration status | Derived from dates | - |

**Unique Features**:
- Auto-calculate next due date
- Due soon (30 days) warning
- Overdue flagging

---

## SHARED HOOKS

### `useProductionLogMetrics`
**File**: `src/hooks/useProductionLogMetrics.ts`
**Used By**: MachineUtilisation, OperatorEfficiency, SetterEfficiency, QualityAnalytics, ThresholdAlerts, TodayFactorySnapshot, QualityLossSignals

**Metrics Provided**:
- `totalOutput`, `totalRejections`, `rejectionRate`
- `totalRuntimeMinutes`, `totalDowntimeMinutes`, `utilizationPercent`
- `overallEfficiency`
- `dailyMetrics[]` - breakdown by date
- `shiftMetrics[]` - breakdown by shift
- `machineMetrics[]` - breakdown by machine
- `operatorMetrics[]` - breakdown by operator
- `rejectionBreakdown[]` - by rejection type
- `downtimePareto[]` - by downtime reason
- `logCount`

---

## SUMMARY: UNIQUE FEATURES BY PAGE

| Page | Unique Features Not Duplicated Elsewhere |
|------|------------------------------------------|
| Daily Production Log | Data entry form, downtime event builder, rejection entry |
| CNC Programmer Activity | Setup time tracking, first-piece approval logging |
| Cutting | Cutting progress tracking |
| Forging | External vendor/QC workflow |
| Floor Dashboard | Live blocker ownership, threshold alerts integration |
| CNC Dashboard | Machine readiness status, queue management, work assignment |
| Production Progress | WO bucket categorization, flow health indicator |
| Machine Utilisation | Utilisation charts, downtime Pareto |
| Operator Efficiency | Operator performance table with scrap % |
| Setter Efficiency | Setup-focused metrics |
| Downtime Analytics | Category aggregation, repeat offender detection |
| Quality Dashboard | Cross-WO QC summary |
| Incoming QC | Material lot status enrichment |
| Hourly QC | Dimensional measurement entry, tolerance checking |
| Final QC List | Quality release queue |
| NCR Management | 8D workflow, NCR creation/tracking |
| Quality Traceability | Multi-criteria search, frozen record display |
| Quality Analytics | Quality KPIs (FPY, rejection rate) |
| Tolerances | Tolerance definition for items |
| Instruments | Calibration tracking |

---

## CROSS-PAGE DATA FLOWS

```
Daily Production Log (DATA ENTRY)
         ↓
useProductionLogMetrics (CENTRAL CALCULATION)
         ↓
    ┌────┴────┬────────┬────────┬────────┐
    ↓         ↓        ↓        ↓        ↓
Machine   Operator  Quality  Threshold  Factory
Utilisation Efficiency Analytics  Alerts   Snapshot
```

```
Work Orders → QC Records → Quality Dashboard
     ↓
Hourly QC Checks → Quality Traceability
     ↓
NCRs → NCR Management
```

---

## DEPRECATION STATUS

| Page | Path | Status | Deprecated Date | Replaced By |
|------|------|--------|-----------------|-------------|
| Daily Production Log | `/daily-production-log` | Active | - | - |
| CNC Programmer Activity | `/cnc-programmer-activity` | Active | - | - |
| Cutting | `/cutting` | Active | - | - |
| Forging | `/forging` | Active | - | - |
| Floor Dashboard | `/floor-dashboard` | Active | - | - |
| CNC Dashboard | `/cnc-dashboard` | Active | - | - |
| Production Progress | `/production-progress` | Active | - | - |
| Machine Utilisation | `/machine-utilisation` | Active | - | - |
| Operator Efficiency | `/operator-efficiency` | Active | - | - |
| Setter Efficiency | `/setter-efficiency` | Active | - | - |
| Downtime Analytics | `/downtime-analytics` | Active | - | - |
| Quality Dashboard | `/quality` | Active | - | - |
| Incoming QC | `/qc/incoming` | Active | - | - |
| Hourly QC | `/hourly-qc` | Active | - | - |
| Final QC | `/final-qc` | Active | - | - |
| NCR Management | `/ncr` | Active | - | - |
| Quality Traceability | `/quality/traceability` | Active | - | - |
| Quality Documents | `/quality/documents` | Active | - | - |
| Quality Analytics | `/quality/analytics` | Active | - | - |
| Tolerances | `/tolerance-setup` | Active | - | - |
| Instruments | `/instruments` | Active | - | - |

> **Note**: Update this table when deprecating pages. See `src/config/deprecationConfig.ts` for the authoritative deprecation status and `docs/DEPRECATION_GUIDE.md` for the full workflow.

---

## CONFIRMATION CHECKLIST

Before marking a page as deprecated, verify:

- [ ] All data views exist elsewhere
- [ ] All user actions can be performed elsewhere
- [ ] All unique calculations are preserved
- [ ] Real-time subscriptions are maintained
- [ ] Navigation links are updated
- [ ] Empty states reference correct new locations

After deprecation:

- [ ] Page is hidden from navigation automatically
- [ ] Route remains accessible for verification
- [ ] Deprecation notice banner appears on page
- [ ] deprecationConfig.ts status set to 'deprecated'
- [ ] FEATURE_INVENTORY.md table updated
