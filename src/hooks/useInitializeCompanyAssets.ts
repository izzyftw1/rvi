import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
// Import the high-res RV logo
import rvLogoHighRes from '@/assets/rv-logo-high-res.png';

export function useInitializeCompanyAssets() {
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function initializeAssets() {
      try {
        // Check if logo already exists in storage
        const { data: existingLogo } = await supabase.storage
          .from('company-assets')
          .list('', { search: 'rv-logo' });

        if (existingLogo && existingLogo.length > 0) {
          console.log('Company logo already exists in storage');
          setInitialized(true);
          return;
        }

        // Try to upload the logo from the assets folder
        console.log('Uploading company logo to storage...');
        
        // Fetch the logo from the assets
        const response = await fetch(rvLogoHighRes);
        const blob = await response.blob();
        
        const { error: uploadError } = await supabase.storage
          .from('company-assets')
          .upload('rv-logo.png', blob, {
            contentType: 'image/png',
            upsert: true
          });

        if (uploadError) {
          console.error('Error uploading logo:', uploadError);
          setError(uploadError.message);
        } else {
          console.log('Company logo uploaded successfully');
        }
        
        setInitialized(true);
      } catch (err) {
        console.error('Error initializing company assets:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setInitialized(true);
      }
    }

    initializeAssets();
  }, []);

  return { initialized, error };
}
