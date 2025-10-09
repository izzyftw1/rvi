# E2E Testing Guide

This project uses Playwright for end-to-end testing.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Install Playwright browsers:
```bash
npx playwright install
```

## Running Tests

### Run all tests:
```bash
npx playwright test
```

### Run specific test file:
```bash
npx playwright test e2e/sales-order.spec.ts
```

### Run tests in headed mode (watch tests execute):
```bash
npx playwright test --headed
```

### Run tests in UI mode (interactive):
```bash
npx playwright test --ui
```

### Debug tests:
```bash
npx playwright test --debug
```

## Test Coverage

### 1. Sales Order Flow (`e2e/sales-order.spec.ts`)
- ✅ Create SO with multiple lines → approve → totals correct
- ✅ Verify auto-generation of Work Orders on SO approval
- ✅ Validate GST calculation (domestic vs export)
- ✅ Test subtotal, GST, and total calculations

### 2. Invoice & Payment Flow (`e2e/invoice-payment.spec.ts`)
- ✅ Create invoice (partial) → post payment → status transitions to part_paid/paid
- ✅ Overdue flag when due_date passes
- ✅ Validate payment amount cannot exceed invoice balance
- ✅ Test invoice status workflow: draft → issued → part_paid → paid

### 3. Shipment Flow (`e2e/shipment.spec.ts`)
- ✅ Create shipment → add LR No → mark delivered → visible on SO/WO
- ✅ Shipment timeline events are recorded
- ✅ Document attachment (Packing List, POD, etc.)
- ✅ Verify shipment visibility on Work Orders and Sales Orders

### 4. Role-Based Access Control (`e2e/permissions.spec.ts`)
- ✅ Production user cannot see any currency/amount fields
- ✅ Finance user can see all financial fields
- ✅ Admin can impersonate roles to test permissions
- ✅ Verify `work_orders_restricted` view hides financial data

## Test Data

### Test Users
- **Admin**: `test@example.com` / `TestPassword123!`
- **Production User**: `production@example.com` / `ProductionTest123!`

### Demo Data
The tests use the demo data seeded in the database migration, including:
- Demo Industries Ltd (customer)
- BR-VALVE-001, BR-VALVE-002 (items)
- Sample invoices and payments

## Best Practices

1. **Isolation**: Each test is independent and creates its own data
2. **Cleanup**: Tests clean up after themselves (or use transaction rollback)
3. **Assertions**: Use explicit `expect()` statements for verification
4. **Waits**: Use `waitForLoadState()` instead of arbitrary timeouts when possible
5. **Selectors**: Prefer test IDs and text selectors over fragile CSS selectors

## Continuous Integration

Add to your CI pipeline (GitHub Actions, etc.):

```yaml
- name: Install dependencies
  run: npm ci

- name: Install Playwright Browsers
  run: npx playwright install --with-deps

- name: Run Playwright tests
  run: npx playwright test

- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

## Debugging Failed Tests

1. Check the HTML report:
```bash
npx playwright show-report
```

2. View screenshots and traces in the report
3. Run failing test in headed mode:
```bash
npx playwright test --headed e2e/sales-order.spec.ts
```

4. Use the Playwright Inspector:
```bash
npx playwright test --debug
```

## Adding New Tests

1. Create a new file in `e2e/` directory
2. Import test utilities: `import { test, expect } from '@playwright/test';`
3. Use describe blocks to group related tests
4. Add explicit assertions for all verifications
5. Update this README with new test coverage

## Known Limitations

- Authentication state is shared between tests (use `auth.setup.ts`)
- Some tests require database seeding (included in migrations)
- File uploads in tests use fixtures from `e2e/fixtures/`
- Tests assume Supabase backend is running and accessible
