import { supabase } from "@/integrations/supabase/client";

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

// Function to upload logo from a URL (for initialization)
export async function uploadLogoFromUrl(imageUrl: string): Promise<string | null> {
  try {
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const file = new File([blob], 'rv-logo.png', { type: 'image/png' });
    return uploadCompanyLogo(file);
  } catch (error) {
    console.error('Error uploading logo from URL:', error);
    return null;
  }
}
