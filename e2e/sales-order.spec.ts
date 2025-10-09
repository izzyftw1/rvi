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
    
    // Verify Work Order was created
    await expect(page.locator('text=ISO-')).toBeVisible();
    await expect(page.locator('text=TEST-ITEM')).toBeVisible();
  });
});
