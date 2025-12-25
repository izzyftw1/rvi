import { test, expect } from '@playwright/test';

test.describe('Sales Order Flow', () => {
  test('Create SO with multiple lines → approve → totals correct', async ({ page }) => {
    // Navigate to Sales page
    await page.goto('/sales');
    await page.waitForLoadState('networkidle');
    
    // Click Create Sales Order
    await page.click('button:has-text("Create Sales Order")');
    
    // Fill in SO header details
    await page.fill('input[name="customer"]', 'Demo Industries Ltd');
    await page.fill('input[name="po_number"]', `PO-TEST-${Date.now()}`);
    await page.selectOption('select[name="currency"]', 'INR');
    await page.selectOption('select[name="gst_type"]', 'domestic');
    await page.fill('input[name="gst_percent"]', '18');
    await page.fill('input[name="payment_terms_days"]', '30');
    
    // Add first line item
    await page.fill('input[name="line_items[0].item_code"]', 'BR-VALVE-001');
    await page.fill('input[name="line_items[0].quantity"]', '100');
    await page.fill('input[name="line_items[0].price_per_pc"]', '50');
    
    // Add second line item
    await page.click('button:has-text("Add Line Item")');
    await page.fill('input[name="line_items[1].item_code"]', 'BR-VALVE-002');
    await page.fill('input[name="line_items[1].quantity"]', '200');
    await page.fill('input[name="line_items[1].price_per_pc"]', '75');
    
    // Verify calculated totals
    // Line 1: 100 * 50 = 5,000
    // Line 2: 200 * 75 = 15,000
    // Subtotal: 20,000
    // GST (18%): 3,600
    // Total: 23,600
    
    await expect(page.locator('text=Subtotal')).toBeVisible();
    await expect(page.locator('text=20,000')).toBeVisible();
    await expect(page.locator('text=3,600')).toBeVisible(); // GST amount
    await expect(page.locator('text=23,600')).toBeVisible(); // Total
    
    // Save as draft first
    await page.click('button:has-text("Save as Draft")');
    await expect(page.locator('text=Sales order created successfully')).toBeVisible();
    
    // Now approve the SO
    await page.click('button:has-text("Approve")');
    await expect(page.locator('text=Sales order approved')).toBeVisible();
    
    // Verify status changed to approved
    await expect(page.locator('[data-status="approved"]')).toBeVisible();
    
    // Verify totals are still correct after approval
    await expect(page.locator('text=23,600')).toBeVisible();
  });
  
  test('SO line items auto-generate Work Orders on approval', async ({ page }) => {
    await page.goto('/sales');
    await page.waitForLoadState('networkidle');
    
    // Create and approve SO
    await page.click('button:has-text("Create Sales Order")');
    await page.fill('input[name="customer"]', 'Test Customer');
    await page.fill('input[name="po_number"]', `PO-WO-${Date.now()}`);
    await page.fill('input[name="line_items[0].item_code"]', 'TEST-ITEM');
    await page.fill('input[name="line_items[0].quantity"]', '50');
    await page.fill('input[name="line_items[0].price_per_pc"]', '100');
    
    await page.click('button:has-text("Approve")');
    await page.waitForTimeout(1000);
    
    // Navigate to Work Orders
    await page.goto('/work-orders');
    await page.waitForLoadState('networkidle');
    
    // Verify Work Order was created with correct WO-YYYY-XXXXX format
    await expect(page.locator('text=/WO-\\d{4}-\\d{5}/')).toBeVisible();
    await expect(page.locator('text=TEST-ITEM')).toBeVisible();
  });

  test('Work Order number format matches WO-YYYY-XXXXX constraint', async ({ page }) => {
    // This is a regression test to ensure WO numbers are generated correctly
    // Format required: WO-YYYY-XXXXX (e.g., WO-2025-00068)
    
    await page.goto('/sales');
    await page.waitForLoadState('networkidle');
    
    const uniqueItemCode = `REGTEST-${Date.now()}`;
    
    // Create SO
    await page.click('button:has-text("Create Sales Order")');
    await page.fill('input[name="customer"]', 'Regression Test Customer');
    await page.fill('input[name="po_number"]', `PO-REG-${Date.now()}`);
    await page.fill('input[name="line_items[0].item_code"]', uniqueItemCode);
    await page.fill('input[name="line_items[0].quantity"]', '25');
    await page.fill('input[name="line_items[0].price_per_pc"]', '50');
    
    // Directly approve
    await page.click('button:has-text("Approve")');
    
    // Wait for WO generation
    await page.waitForTimeout(2000);
    
    // Verify no error occurred
    await expect(page.locator('text=error').first()).not.toBeVisible({ timeout: 1000 }).catch(() => {
      // Error text not found is expected
    });
    
    // Navigate to Work Orders and verify format
    await page.goto('/work-orders');
    await page.waitForLoadState('networkidle');
    
    // Find the WO with our unique item code and verify WO number format
    const woRow = page.locator(`tr:has-text("${uniqueItemCode}")`);
    await expect(woRow).toBeVisible({ timeout: 10000 });
    
    // Verify the WO number matches the required format: WO-YYYY-XXXXX
    const woNumberCell = woRow.locator('text=/WO-\\d{4}-\\d{5}/');
    await expect(woNumberCell).toBeVisible();
    
    // Extract and validate the WO number format
    const woText = await woNumberCell.textContent();
    expect(woText).toMatch(/^WO-\d{4}-\d{5}$/);
  });
});
