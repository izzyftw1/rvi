import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { ChevronDown, ChevronRight, Shield, Loader2, Info, Check, X, Minus } from 'lucide-react';
import { PAGE_KEYS } from '@/hooks/useDepartmentPermissions';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface UserPermissionOverridesProps {
  userId: string;
  userDepartmentType: string | null;
  isAdminOrFinance: boolean;
  onSaved?: () => void;
}

interface Override {
  page_key: string;
  can_view: boolean | null;
  can_access_route: boolean | null;
  can_mutate: boolean | null;
}

interface DepartmentDefault {
  page_key: string;
  can_view: boolean;
  can_access_route: boolean;
  can_mutate: boolean;
}

// Group pages by category - must match PAGE_KEYS in useDepartmentPermissions
const PAGE_GROUPS: Record<string, string[]> = {
  'Sales & Customers': ['sales-orders', 'customers', 'items'],
  'Procurement': ['raw-po', 'material-requirements', 'purchase-dashboard'],
  'Production': ['work-orders', 'daily-production-log', 'floor-dashboard', 'cnc-dashboard', 'production-progress', 'machine-utilisation', 'operator-efficiency', 'setter-efficiency', 'downtime-analytics'],
  'Quality': ['quality-dashboard', 'qc-incoming', 'hourly-qc', 'final-qc', 'ncr', 'traceability', 'quality-documents', 'quality-analytics', 'tolerances', 'instruments'],
  'Finance': ['finance-dashboard', 'invoices', 'receipts', 'supplier-payments', 'adjustments', 'tds-report', 'aging', 'reconciliations', 'finance-reports', 'finance-settings'],
  'Logistics': ['gate-register', 'logistics-dashboard', 'finished-goods', 'packing', 'dispatch'],
  'External': ['partner-dashboard', 'external-analytics'],
  'Admin': ['admin-panel', 'factory-calendar'],
};

export function UserPermissionOverrides({ 
  userId, 
  userDepartmentType, 
  isAdminOrFinance,
  onSaved 
}: UserPermissionOverridesProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [departmentDefaults, setDepartmentDefaults] = useState<DepartmentDefault[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && userId) {
      loadData();
    }
  }, [isOpen, userId, userDepartmentType]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load existing overrides for this user
      const { data: overridesData } = await supabase
        .from('user_permission_overrides')
        .select('page_key, can_view, can_access_route, can_mutate')
        .eq('user_id', userId);
      
      setOverrides(overridesData || []);

      // Load department defaults for comparison
      if (userDepartmentType) {
        const { data: defaultsData } = await supabase
          .from('department_defaults')
          .select('page_key, can_view, can_access_route, can_mutate')
          .eq('department_type', userDepartmentType);
        
        setDepartmentDefaults(defaultsData || []);
      } else {
        setDepartmentDefaults([]);
      }
    } catch (error) {
      console.error('Error loading permission data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDefaultForPage = (pageKey: string): DepartmentDefault | undefined => {
    return departmentDefaults.find(d => d.page_key === pageKey);
  };

  const getOverrideForPage = (pageKey: string): Override | undefined => {
    return overrides.find(o => o.page_key === pageKey);
  };

  const getEffectivePermission = (pageKey: string, field: 'can_view' | 'can_access_route' | 'can_mutate'): boolean => {
    if (isAdminOrFinance) return true;
    const override = getOverrideForPage(pageKey);
    const def = getDefaultForPage(pageKey);
    return override?.[field] ?? def?.[field] ?? false;
  };

  const handleToggleOverride = (pageKey: string, field: 'can_view' | 'can_access_route' | 'can_mutate') => {
    const existingOverride = getOverrideForPage(pageKey);
    const defaultValue = getDefaultForPage(pageKey)?.[field] ?? false;
    
    let newValue: boolean | null;
    
    if (existingOverride?.[field] === null || existingOverride?.[field] === undefined) {
      // No override exists - toggle opposite of default
      newValue = !defaultValue;
    } else if (existingOverride[field] === !defaultValue) {
      // Override exists and is opposite of default - remove override (set to null)
      newValue = null;
    } else {
      // Override exists and matches default - toggle to opposite
      newValue = !defaultValue;
    }

    setOverrides(prev => {
      const existing = prev.find(o => o.page_key === pageKey);
      if (existing) {
        return prev.map(o => 
          o.page_key === pageKey 
            ? { ...o, [field]: newValue }
            : o
        );
      } else {
        return [...prev, { 
          page_key: pageKey, 
          can_view: field === 'can_view' ? newValue : null,
          can_access_route: field === 'can_access_route' ? newValue : null,
          can_mutate: field === 'can_mutate' ? newValue : null,
        }];
      }
    });
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Filter out overrides where all values are null (no override)
      const validOverrides = overrides.filter(o => 
        o.can_view !== null || o.can_access_route !== null || o.can_mutate !== null
      );

      // Delete all existing overrides for this user
      await supabase
        .from('user_permission_overrides')
        .delete()
        .eq('user_id', userId);

      // Insert new overrides
      if (validOverrides.length > 0) {
        const { error } = await supabase
          .from('user_permission_overrides')
          .insert(validOverrides.map(o => ({
            user_id: userId,
            page_key: o.page_key,
            can_view: o.can_view,
            can_access_route: o.can_access_route,
            can_mutate: o.can_mutate,
          })));

        if (error) throw error;
      }

      toast({
        title: 'Success',
        description: 'Permission overrides saved. Changes take effect immediately.',
      });
      
      setHasChanges(false);
      onSaved?.();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save permission overrides',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const overrideCount = useMemo(() => {
    return overrides.filter(o => 
      o.can_view !== null || o.can_access_route !== null || o.can_mutate !== null
    ).length;
  }, [overrides]);

  if (isAdminOrFinance) {
    return (
      <div className="p-4 bg-muted/50 rounded-lg border">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Shield className="h-4 w-4" />
          <span>This user has Admin/Finance role - full access to all pages (overrides not applicable)</span>
        </div>
      </div>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button 
          variant="outline" 
          className="w-full justify-between"
        >
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span>Page Access Overrides</span>
            {overrideCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {overrideCount} override{overrideCount !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="mt-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
              <Info className="h-4 w-4 flex-shrink-0" />
              <span>
                Override department defaults for this user. 
                <Check className="h-3 w-3 inline text-green-500 mx-1" /> = allowed,
                <X className="h-3 w-3 inline text-red-500 mx-1" /> = denied,
                <Minus className="h-3 w-3 inline text-muted-foreground mx-1" /> = use department default
              </span>
            </div>

            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {Object.entries(PAGE_GROUPS).map(([groupName, pageKeys]) => (
                  <div key={groupName} className="space-y-2">
                    <h4 className="text-sm font-semibold text-muted-foreground">{groupName}</h4>
                    <div className="space-y-1">
                      {pageKeys.map(pageKey => {
                        const def = getDefaultForPage(pageKey);
                        const override = getOverrideForPage(pageKey);
                        const hasOverride = override?.can_view !== null || 
                                           override?.can_access_route !== null || 
                                           override?.can_mutate !== null;
                        
                        return (
                          <div 
                            key={pageKey} 
                            className={`flex items-center justify-between p-2 rounded-md hover:bg-muted/50 ${hasOverride ? 'bg-primary/5' : ''}`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{PAGE_KEYS[pageKey] || pageKey}</span>
                              {def && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Badge variant="outline" className="text-xs">
                                        Dept: {def.can_access_route ? '✓' : '✗'}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <div className="text-xs">
                                        <div>Department default:</div>
                                        <div>View: {def.can_view ? 'Yes' : 'No'}</div>
                                        <div>Access: {def.can_access_route ? 'Yes' : 'No'}</div>
                                        <div>Mutate: {def.can_mutate ? 'Yes' : 'No'}</div>
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-4">
                              <TooltipProvider>
                                <div className="flex items-center gap-1">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        onClick={() => handleToggleOverride(pageKey, 'can_access_route')}
                                        className={`p-1.5 rounded-md transition-colors ${
                                          override?.can_access_route === true 
                                            ? 'bg-green-100 text-green-600 dark:bg-green-900/30' 
                                            : override?.can_access_route === false 
                                              ? 'bg-red-100 text-red-600 dark:bg-red-900/30'
                                              : 'bg-muted text-muted-foreground'
                                        }`}
                                      >
                                        {override?.can_access_route === true ? (
                                          <Check className="h-4 w-4" />
                                        ) : override?.can_access_route === false ? (
                                          <X className="h-4 w-4" />
                                        ) : (
                                          <Minus className="h-4 w-4" />
                                        )}
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <span>Access Route Override</span>
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                              </TooltipProvider>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {hasChanges && (
              <div className="flex justify-end pt-2 border-t">
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Overrides
                </Button>
              </div>
            )}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
