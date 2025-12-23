# Analytics Page Governance Rules

## Purpose
Ensure consistency, prevent duplication, and maintain feature parity during analytics consolidation.

---

## Rules

### 1. Ownership Definition Required
**No new analytics page without ownership definition.**

Before creating any analytics page:
- [ ] Define the owning module/feature (e.g., Quality, Production, Finance)
- [ ] Identify the responsible team/role
- [ ] Document the primary data source (hook, table, API)

### 2. No Duplicate Metric Calculations
**All metrics must derive from a single source.**

- Use shared hooks (e.g., `useProductionLogMetrics`, `useSetterEfficiencyMetrics`)
- Do NOT calculate the same metric in multiple locations
- If a metric is needed in multiple pages, extract to shared hook

### 3. Feature Parity Before Deletion
**No page deletion without feature parity confirmation.**

Before removing any page:
- [ ] Verify all functionality exists in replacement page
- [ ] Confirm all data fields are preserved
- [ ] Validate filters/drill-downs work equivalently
- [ ] Mark old page as deprecated (keep URL accessible temporarily)

---

## Dashboard Guidelines

Dashboards may ONLY show:
- Summary indicators
- KPI widgets
- Links to detailed pages

Dashboards must NOT:
- Replace analytics pages
- Hide drill-down paths
- Remove widgets without providing navigation links

---

## Navigation Changes

Before updating navigation:
- [ ] Validate new structure with stakeholders
- [ ] Keep removed pages accessible by URL (temporary)
- [ ] Mark deprecated pages clearly
- [ ] Ensure no workflow breaks

---

## Enforcement

All changes must be reviewed against these rules before deployment.

| Change Type | Required Checks |
|-------------|-----------------|
| New analytics page | Ownership + source definition |
| Metric addition | Verify no duplicate exists |
| Page removal | Feature parity confirmation |
| Navigation update | URL accessibility + deprecation marking |

---

## Reference: Shared Hooks

| Hook | Owner | Purpose |
|------|-------|---------|
| `useProductionLogMetrics` | Production | Runtime, output, rejection metrics |
| `useSetterEfficiencyMetrics` | CNC/Setup | Setup duration, first-off delay, repeat faults |

---

*Last updated: 2025-12-23*
