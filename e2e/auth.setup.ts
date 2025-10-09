import { test as setup } from '@playwright/test';
import { supabase } from '../src/integrations/supabase/client';

const authFile = 'playwright/.auth/user.json';

setup('authenticate as admin', async ({ page }) => {
  // Navigate to auth page
  await page.goto('/auth');
  
  // Create test user if doesn't exist
  const testEmail = 'test@example.com';
  const testPassword = 'TestPassword123!';
  
  // Try to sign in first
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', testPassword);
  await page.click('button:has-text("Sign In")');
  
  // Wait for navigation or error
  await page.waitForTimeout(2000);
  
  // If still on auth page, user doesn't exist, so sign up
  if (page.url().includes('/auth')) {
    await page.click('button:has-text("Sign Up")');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.fill('input[name="fullName"]', 'Test Admin User');
    await page.click('button:has-text("Create Account")');
    await page.waitForTimeout(2000);
  }
  
  // Save authentication state
  await page.context().storageState({ path: authFile });
});

setup('authenticate as production user', async ({ page }) => {
  // Similar setup for production user
  const testEmail = 'production@example.com';
  const testPassword = 'ProductionTest123!';
  
  await page.goto('/auth');
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', testPassword);
  await page.click('button:has-text("Sign In")');
  await page.waitForTimeout(2000);
  
  if (page.url().includes('/auth')) {
    await page.click('button:has-text("Sign Up")');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.fill('input[name="fullName"]', 'Production Test User');
    await page.click('button:has-text("Create Account")');
    await page.waitForTimeout(2000);
  }
});
