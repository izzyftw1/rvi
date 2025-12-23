# Consolidation Verification Checklist

**Run this checklist after EVERY merge or consolidation.**

---

## 1. Excel Parity Verification

Compare current ERP fields against known Production Excel structures:

### Reference Excel Reports
| Report | Key Fields |
|--------|------------|
| Daily Production Report | Date, Shift, Machine, Operator, WO#, Item Code, Target Qty, Actual Qty, OK Qty, Rejections by type, Downtime events |
| Daily Machine Runtime Report | Machine ID, Date, Planned Minutes, Actual Run Minutes, Downtime Minutes, Utilization % |
| Daily Worker Efficiency Report | Operator, Date, Target vs Actual, Efficiency %, Scrap % |
| Programmer Activity Report | Programmer, Date, Setup Type, Setup Duration, First-off Approval Time, Machine, WO# |

### Verification Questions
- [ ] Is every metric previously captured in Excel either:
  - a) Explicitly visible in the ERP, OR
  - b) Intentionally consolidated into a derived metric with **no data loss**

### If a field is NOT visible, document:
| Missing Field | Data Source | Exposing Page | Access Path |
|---------------|-------------|---------------|-------------|
| (field name) | (table/hook) | (page URL) | (navigation) |

---

## 2. Workflow Integrity

Confirm no workflow is blocked:

- [ ] **Production Entry**: Can operators log production data?
- [ ] **QC Approval**: Can QC approve/reject inspections?
- [ ] **First Piece Approval**: Is first-off QC flow intact?
- [ ] **External Processing**: Can send/receive external moves?
- [ ] **Dispatch Release**: Can release completed WOs for dispatch?
- [ ] **NCR Creation**: Can create/edit/close NCRs?

### All actions previously possible must still be possible:
| Action | Was Available | Still Available | Page |
|--------|---------------|-----------------|------|
| Log production | ✓ | ✓ / ✗ | |
| Approve QC | ✓ | ✓ / ✗ | |
| Create NCR | ✓ | ✓ / ✗ | |
| (add others) | | | |

---

## 3. Role & Permission Check

Verify role access is preserved:

| Role | Previous Access | Current Access | Status |
|------|-----------------|----------------|--------|
| Operator | Production logs, own metrics | | ✓ / ✗ |
| Supervisor | All production, approvals | | ✓ / ✗ |
| QC | QC records, inspections, NCRs | | ✓ / ✗ |
| Management | Analytics, dashboards, reports | | ✓ / ✗ |
| Admin | Full access | | ✓ / ✗ |

- [ ] No role loses visibility due to merges
- [ ] No role loses action capability due to merges

---

## 4. Navigation Verification

- [ ] Removed pages remain accessible by URL (temporary)
- [ ] Deprecated pages are marked clearly
- [ ] Links from dashboards to detail pages work
- [ ] No dead-end navigation paths

---

## 5. Rollback Rule

**If ANY of the following is true, IMMEDIATELY ROLLBACK:**

- [ ] Excel-equivalent metric is lost or inaccessible
- [ ] Workflow action is blocked
- [ ] Role loses required visibility
- [ ] Data cannot be retrieved that was previously available

### Rollback Actions:
1. **Do NOT remove or hide the original page**
2. **Flag the missing parity explicitly** in this document
3. **Document what failed** and why
4. **Notify before retrying** the consolidation

---

## Verification Sign-off

| Merge/Consolidation | Date | Verified By | Excel Parity | Workflows | Roles | Status |
|---------------------|------|-------------|--------------|-----------|-------|--------|
| CNC → Setter Efficiency | 2025-12-23 | System | ✓ | ✓ | ✓ | PASS |
| NCR Count → Quality Analytics | 2025-12-23 | System | ✓ | ✓ | ✓ | PASS |
| (next merge) | | | | | | |

---

## Shared Hooks Reference

| Hook | Source Table(s) | Metrics Exposed |
|------|-----------------|-----------------|
| `useProductionLogMetrics` | `daily_production_logs` | Output, rejections, efficiency, downtime |
| `useSetterEfficiencyMetrics` | `cnc_programmer_activity` | Setup duration, first-off delay, repeat faults |

---

*Do not proceed with further merges until this checklist PASSES.*
