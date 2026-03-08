/**
 * Audit Logging Hook
 * 
 * Logs security-relevant events to audit_logs table.
 * Events: page_view, data_export, access_denied, sensitive_action
 */
import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type AuditEventType = 
  | 'page_view'
  | 'data_export'
  | 'access_denied'
  | 'sensitive_action'
  | 'login'
  | 'logout';

export const useAuditLog = () => {
  const log = useCallback(async (
    eventType: AuditEventType,
    action: string,
    details?: Record<string, any>
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('audit_logs').insert({
        table_name: 'system',
        record_id: user?.id || 'anonymous',
        action,
        changed_by: user?.id || null,
        event_type: eventType,
        new_data: details || null,
      });
    } catch (e) {
      // Silent fail - audit logging should never break the app
      console.warn('Audit log failed:', e);
    }
  }, []);

  const logPageView = useCallback((pagePath: string) => {
    log('page_view', `Viewed ${pagePath}`, { path: pagePath });
  }, [log]);

  const logExport = useCallback((exportType: string, details?: Record<string, any>) => {
    log('data_export', `Exported ${exportType}`, details);
  }, [log]);

  const logAccessDenied = useCallback((route: string) => {
    log('access_denied', `Access denied to ${route}`, { route });
  }, [log]);

  return { log, logPageView, logExport, logAccessDenied };
};
