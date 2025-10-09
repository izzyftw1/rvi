import { test, expect } from '@playwright/test';

test.describe('Invoice and Payment Flow', () => {
  test('Create invoice (partial) → post payment → status transitions', async ({ page }) => {
    // First, ensure we have an approved SO to invoice
    await page.goto('/sales');
    await page.waitForLoadState('networkidle');
    
    // Create and approve a Sales Order
    await page.click('button:has-text("Create Sales Order")');
    const poNumber = `PO-INV-${Date.now()}`;
    
    await page.fill('input[name="customer"]', 'Demo Industries Ltd');
    await page.fill('input[name="po_number"]', poNumber);
    await page.selectOption('select[name="currency"]', 'INR');
    await page.selectOption('select[name="gst_type"]', 'domestic');
    await page.fill('input[name="gst_percent"]', '18');
    
    await page.fill('input[name="line_items[0].item_code"]', 'BR-VALVE-001');
    await page.fill('input[name="line_items[0].quantity"]', '1000');
    await page.fill('input[name="line_items[0].price_per_pc"]', '100');
    
    await page.click('button:has-text("Approve")');
    await page.waitForTimeout(1000);
    
    // Navigate to Invoices
    await page.goto('/finance/invoices');
    await page.waitForLoadState('networkidle');
    
    // Create invoice
    await page.click('button:has-text("Create Invoice")');
    
    // Select the SO we just created
    await page.selectOption('select[name="so_id"]', { label: poNumber });
    
    // For partial invoice: select only 500 of 1000 quantity
    await page.fill('input[name="line_items[0].quantity"]', '500');
    
    // Invoice total should be: 500 * 100 = 50,000 + 18% GST = 59,000
    await expect(page.locator('text=50,000')).toBeVisible(); // Subtotal
    await expect(page.locator('text=9,000')).toBeVisible(); // GST
    await expect(page.locator('text=59,000')).toBeVisible(); // Total
    
    // Save and issue invoice
    await page.click('button:has-text("Issue Invoice")');
    await expect(page.locator('text=Invoice created')).toBeVisible();
    
    // Verify status is "issued"
    await expect(page.locator('[data-status="issued"]')).toBeVisible();
    
    // Record a partial payment (30,000)
    const invoiceRow = page.locator('tr:has-text("INV-")').first();
    await invoiceRow.click();
    
    // On invoice detail page
    await page.click('button:has-text("Record Payment")');
    await page.fill('input[name="amount"]', '30000');
    await page.selectOption('select[name="method"]', 'bank_transfer');
    await page.fill('input[name="reference"]', 'TEST-REF-001');
    await page.click('button:has-text("Save Payment")');
    
    // Verify status changed to "part_paid"
    await expect(page.locator('[data-status="part_paid"]')).toBeVisible();
    await expect(page.locator('text=Balance: 29,000')).toBeVisible();
    
    // Record remaining payment
    await page.click('button:has-text("Record Payment")');
    await page.fill('input[name="amount"]', '29000');
    await page.selectOption('select[name="method"]', 'bank_transfer');
    await page.fill('input[name="reference"]', 'TEST-REF-002');
    await page.click('button:has-text("Save Payment")');
    
    // Verify status changed to "paid"
    await expect(page.locator('[data-status="paid"]')).toBeVisible();
    await expect(page.locator('text=Balance: 0')).toBeVisible();
  });
  
  test('Overdue flag when due_date passes', async ({ page }) => {
    // Navigate to Invoices
    await page.goto('/finance/invoices');
    await page.waitForLoadState('networkidle');
    
    // Filter for overdue invoices
    await page.selectOption('select[name="status_filter"]', 'overdue');
    
    // Verify overdue badge is displayed
    await expect(page.locator('[data-status="overdue"]')).toBeVisible();
    
    // Check for "DAYS LATE" indicator
    await expect(page.locator('text=/\\d+ days late/i')).toBeVisible();
    
    // Verify overdue invoices show in red or with warning styling
    const overdueRow = page.locator('tr:has([data-status="overdue"])').first();
    await expect(overdueRow).toHaveClass(/overdue|destructive|text-red/);
  });
  
  test('Invoice validation: amount cannot exceed balance', async ({ page }) => {
    await page.goto('/finance/invoices');
    await page.waitForLoadState('networkidle');
    
    // Click on an invoice with outstanding balance
    const invoiceRow = page.locator('tr:has-text("part_paid")').first();
    await invoiceRow.click();
    
    // Try to record payment exceeding balance
    await page.click('button:has-text("Record Payment")');
    
    // Get the current balance
    const balanceText = await page.locator('text=/Balance.*\\d+/').textContent();
    const balance = parseInt(balanceText?.match(/\d+/)?.[0] || '0');
    
    // Try to pay more than balance
    await page.fill('input[name="amount"]', String(balance + 10000));
    await page.click('button:has-text("Save Payment")');
    
    // Verify error message
    await expect(page.locator('text=/cannot exceed.*balance/i')).toBeVisible();
  });
});
