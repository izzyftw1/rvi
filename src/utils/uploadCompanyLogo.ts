import { supabase } from "@/integrations/supabase/client";
import rvLogoHighRes from '@/assets/rv-logo-high-res.png';

let uploadAttempted = false;

/**
 * Ensures the company logo is uploaded to storage.
 * Called once on app initialization. Idempotent.
 */
export async function ensureCompanyLogoUploaded(): Promise<void> {
  if (uploadAttempted) return;
  uploadAttempted = true;

  try {
    // Check if logo already exists
    const { data: existing } = await supabase.storage
      .from('company-assets')
      .list('', { limit: 10, search: 'rv-logo' });
    
    if (existing && existing.length > 0) {
      console.log('[Logo] Already exists in storage');
      return;
    }

    console.log('[Logo] Uploading to storage...');
    
    // Fetch the logo from the bundled asset
    const response = await fetch(rvLogoHighRes);
    if (!response.ok) {
      console.error('[Logo] Failed to fetch asset');
      return;
    }
    
    const blob = await response.blob();
    console.log(`[Logo] Fetched blob: ${blob.size} bytes, type: ${blob.type}`);
    
    const { error } = await supabase.storage
      .from('company-assets')
      .upload('rv-logo.png', blob, {
        contentType: 'image/png',
        upsert: true
      });
    
    if (error) {
      console.error('[Logo] Upload failed:', error.message);
    } else {
      console.log('[Logo] Uploaded successfully');
    }
  } catch (err) {
    console.error('[Logo] Error:', err);
  }
}

export async function uploadCompanyLogo(file: File): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from('company-assets')
      .upload('rv-logo.png', file, {
        contentType: 'image/png',
        upsert: true
      });
    
    if (error) {
      console.error('Error uploading logo:', error);
      return null;
    }
    
    // Get the public URL
    const { data: urlData } = supabase.storage
      .from('company-assets')
      .getPublicUrl('rv-logo.png');
    
    return urlData.publicUrl;
  } catch (error) {
    console.error('Error uploading logo:', error);
    return null;
  }
}
