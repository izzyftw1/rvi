import { test, expect } from '@playwright/test';

test.describe('Role-Based Access Control', () => {
  test('Production user cannot see any currency/amount fields', async ({ page }) => {
    // Login as production user (you'll need to create this user in setup)
    await page.goto('/auth');
    await page.fill('input[type="email"]', 'production@example.com');
    await page.fill('input[type="password"]', 'ProductionTest123!');
    await page.click('button:has-text("Sign In")');
    await page.waitForTimeout(2000);
    
    // Navigate to Work Orders
    await page.goto('/work-orders');
    await page.waitForLoadState('networkidle');
    
    // Click on a work order
    const woRow = page.locator('tr:has-text("ISO-")').first();
    await woRow.click();
    
    // Verify financial fields are NOT visible
    await expect(page.locator('text=/price.*per.*pc/i')).not.toBeVisible();
    await expect(page.locator('text=/gross.*weight.*per.*pc/i')).not.toBeVisible();
    await expect(page.locator('text=/net.*weight.*per.*pc/i')).not.toBeVisible();
    await expect(page.locator('text=/\\$|USD|INR|EUR/i')).not.toBeVisible();
    
    // Verify financial_snapshot is not displayed
    await expect(page.locator('text=/financial.*snapshot/i')).not.toBeVisible();
    await expect(page.locator('text=/so.*total/i')).not.toBeVisible();
    await expect(page.locator('text=/payment.*terms/i')).not.toBeVisible();
    
    // Navigate to Sales Orders
    await page.goto('/sales');
    await page.waitForLoadState('networkidle');
    
    // Verify production user cannot access Sales Orders at all
    // Or if they can, verify no pricing is shown
    if (await page.locator('text=Access Denied').isVisible()) {
      // Expected: Production users may not have access to Sales
      await expect(page.locator('text=Access Denied')).toBeVisible();
    } else {
      // If they can view, verify no financial data
      await expect(page.locator('text=/price|amount|total|subtotal/i')).not.toBeVisible();
    }
    
    // Navigate to Finance pages - should be blocked
    await page.goto('/finance/dashboard');
    await expect(page.locator('text=/Access Denied|Unauthorized|Permission/i')).toBeVisible();
    
    await page.goto('/finance/invoices');
    await expect(page.locator('text=/Access Denied|Unauthorized|Permission/i')).toBeVisible();
  });
  
  test('Finance user can see all financial fields', async ({ page }) => {
    // Login as finance admin
    await page.goto('/auth');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button:has-text("Sign In")');
    await page.waitForTimeout(2000);
    
    // Navigate to Admin and assign finance_admin role
    await page.goto('/admin');
    // (Assume user already has finance_admin role from setup)
    
    // Navigate to Work Orders
    await page.goto('/work-orders');
    const woRow = page.locator('tr:has-text("ISO-")').first();
    await woRow.click();
    
    // Verify financial fields ARE visible
    await expect(page.locator('text=/gross.*weight/i')).toBeVisible();
    await expect(page.locator('text=/net.*weight/i')).toBeVisible();
    
    // Navigate to Sales Orders
    await page.goto('/sales');
    
    // Verify pricing columns are visible
    await expect(page.locator('th:has-text("Price")')).toBeVisible();
    await expect(page.locator('th:has-text("Amount")')).toBeVisible();
    
    // Navigate to Finance Dashboard - should work
    await page.goto('/finance/dashboard');
    await expect(page.locator('text=Total AR')).toBeVisible();
    await expect(page.locator('text=/\\$/i')).toBeVisible();
  });
  
  test('Admin can impersonate roles to test permissions', async ({ page }) => {
    // Login as admin
    await page.goto('/auth');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button:has-text("Sign In")');
    await page.waitForTimeout(2000);
    
    // Navigate to Admin page
    await page.goto('/admin');
    
    // Find impersonate test section
    await expect(page.locator('text=Impersonate Test')).toBeVisible();
    
    // Select production role
    await page.selectOption('select[name="impersonate_role"]', 'production');
    
    // Navigate to Work Orders while impersonating
    await page.goto('/work-orders');
    const woRow = page.locator('tr:has-text("ISO-")').first();
    await woRow.click();
    
    // Verify financial fields are hidden (as production user)
    await expect(page.locator('text=/price.*per.*pc/i')).not.toBeVisible();
    
    // Switch back to admin
    await page.goto('/admin');
    await page.selectOption('select[name="impersonate_role"]', 'none');
    
    // Navigate to Work Orders again
    await page.goto('/work-orders');
    await woRow.click();
    
    // Verify financial fields are now visible (as admin)
    await expect(page.locator('text=/gross.*weight/i')).toBeVisible();
  });
});
