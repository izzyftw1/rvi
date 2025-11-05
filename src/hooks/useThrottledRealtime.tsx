import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

interface ThrottledRealtimeOptions {
  channelName: string;
  tables: string[];
  onUpdate: () => void;
  throttleMs?: number;
  cacheMs?: number;
}

export const useThrottledRealtime = ({
  channelName,
  tables,
  onUpdate,
  throttleMs = 5000, // 5 seconds default throttle
  cacheMs = 30000, // 30 seconds default cache
}: ThrottledRealtimeOptions) => {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const pendingUpdateRef = useRef<NodeJS.Timeout | null>(null);
  const lastCacheRef = useRef<number>(0);

  const handleUpdate = useCallback(() => {
    const now = Date.now();
    
    // Check if we're still within cache period
    if (now - lastCacheRef.current < cacheMs) {
      return;
    }

    // Clear any pending update
    if (pendingUpdateRef.current) {
      clearTimeout(pendingUpdateRef.current);
      pendingUpdateRef.current = null;
    }

    const timeSinceLastUpdate = now - lastUpdateRef.current;

    if (timeSinceLastUpdate >= throttleMs) {
      // Execute immediately if enough time has passed
      lastUpdateRef.current = now;
      lastCacheRef.current = now;
      onUpdate();
    } else {
      // Schedule update for later (coalesce rapid changes)
      const delay = throttleMs - timeSinceLastUpdate;
      pendingUpdateRef.current = setTimeout(() => {
        lastUpdateRef.current = Date.now();
        lastCacheRef.current = Date.now();
        onUpdate();
        pendingUpdateRef.current = null;
      }, delay);
    }
  }, [onUpdate, throttleMs, cacheMs]);

  const forceUpdate = useCallback(() => {
    // Force update and reset cache
    lastCacheRef.current = 0;
    handleUpdate();
  }, [handleUpdate]);

  useEffect(() => {
    // Create channel with unique name
    const channel = supabase.channel(channelName);

    // Subscribe to all specified tables
    tables.forEach(table => {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: table
        },
        handleUpdate
      );
    });

    channel.subscribe();
    channelRef.current = channel;

    // Cleanup
    return () => {
      if (pendingUpdateRef.current) {
        clearTimeout(pendingUpdateRef.current);
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [channelName, tables, handleUpdate]);

  return { forceUpdate };
};
