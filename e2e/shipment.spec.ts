import { test, expect } from '@playwright/test';

test.describe('Shipment Flow', () => {
  test('Create shipment → add LR No → mark delivered → visible on SO/WO', async ({ page }) => {
    // First create a Sales Order and Work Order
    await page.goto('/sales');
    await page.waitForLoadState('networkidle');
    
    const poNumber = `PO-SHIP-${Date.now()}`;
    await page.click('button:has-text("Create Sales Order")');
    await page.fill('input[name="customer"]', 'Test Shipping Customer');
    await page.fill('input[name="po_number"]', poNumber);
    await page.fill('input[name="line_items[0].item_code"]', 'SHIP-ITEM-001');
    await page.fill('input[name="line_items[0].quantity"]', '100');
    await page.click('button:has-text("Approve")');
    await page.waitForTimeout(1000);
    
    // Navigate to Logistics/Shipments
    await page.goto('/logistics');
    await page.waitForLoadState('networkidle');
    
    // Create shipment
    await page.click('button:has-text("Create Shipment")');
    
    // Fill shipment details
    await page.selectOption('select[name="wo_id"]', { label: /ISO-.*SHIP-ITEM-001/ });
    await page.fill('input[name="transporter"]', 'XYZ Logistics');
    await page.fill('input[name="lr_no"]', `LR-${Date.now()}`);
    await page.fill('input[name="cartons"]', '5');
    await page.fill('input[name="gross_weight"]', '250');
    await page.fill('input[name="net_weight"]', '240');
    
    // Ship-to address
    await page.fill('input[name="ship_to_address"]', 'Test Address, Mumbai, India');
    
    // Upload documents (simulate)
    await page.setInputFiles('input[type="file"][name="packing_list"]', './e2e/fixtures/sample-doc.pdf');
    
    await page.click('button:has-text("Create Shipment")');
    await expect(page.locator('text=Shipment created')).toBeVisible();
    
    // Verify shipment card shows with LR number
    const shipmentCard = page.locator(`text=/LR-\\d+/`).first();
    await expect(shipmentCard).toBeVisible();
    
    // Update shipment status to "in_transit"
    await shipmentCard.click();
    await page.click('button:has-text("Update Status")');
    await page.selectOption('select[name="status"]', 'in_transit');
    await page.fill('textarea[name="notes"]', 'Shipment picked up');
    await page.click('button:has-text("Save")');
    
    // Mark as delivered
    await page.click('button:has-text("Update Status")');
    await page.selectOption('select[name="status"]', 'delivered');
    await page.fill('input[name="delivered_date"]', new Date().toISOString().split('T')[0]);
    
    // Upload POD
    await page.setInputFiles('input[type="file"][name="pod"]', './e2e/fixtures/sample-pod.jpg');
    await page.click('button:has-text("Save")');
    
    // Verify status badge shows "Delivered"
    await expect(page.locator('[data-status="delivered"]')).toBeVisible();
    
    // Navigate to the Work Order to verify shipment is visible
    await page.goto('/work-orders');
    await page.click('tr:has-text("SHIP-ITEM-001")');
    
    // Verify shipment section shows the shipment
    await expect(page.locator('text=/Shipment.*LR-/i')).toBeVisible();
    await expect(page.locator('text=XYZ Logistics')).toBeVisible();
    await expect(page.locator('text=Delivered')).toBeVisible();
    
    // Navigate to Sales Order to verify shipment is visible there too
    await page.goto('/sales');
    await page.click(`tr:has-text("${poNumber}")`);
    
    // Verify shipment timeline on SO
    await expect(page.locator('text=/Shipment.*delivered/i')).toBeVisible();
  });
  
  test('Shipment timeline events are recorded', async ({ page }) => {
    await page.goto('/logistics');
    await page.waitForLoadState('networkidle');
    
    // Click on a shipment
    const shipmentCard = page.locator('.shipment-card').first();
    await shipmentCard.click();
    
    // Verify timeline section exists
    await expect(page.locator('h3:has-text("Timeline")')).toBeVisible();
    
    // Verify timeline events
    await expect(page.locator('text=Shipment created')).toBeVisible();
    
    // Add a new timeline event
    await page.click('button:has-text("Add Event")');
    await page.selectOption('select[name="event_type"]', 'in_transit');
    await page.fill('textarea[name="notes"]', 'Reached Delhi hub');
    await page.click('button:has-text("Save Event")');
    
    // Verify new event appears in timeline
    await expect(page.locator('text=Reached Delhi hub')).toBeVisible();
  });
});
