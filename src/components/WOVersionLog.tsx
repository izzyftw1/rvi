import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileEdit, User, Clock } from "lucide-react";
import { format } from "date-fns";

interface VersionEntry {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  old_data: any;
  new_data: any;
  changed_by: string | null;
  changed_at: string;
  profiles?: { full_name: string };
}

interface WOVersionLogProps {
  woId: string;
}

export function WOVersionLog({ woId }: WOVersionLogProps) {
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadVersions();
  }, [woId]);

  const loadVersions = async () => {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('record_id', woId)
        .eq('table_name', 'work_orders')
        .order('changed_at', { ascending: false });

      if (error) throw error;

      // Enrich with user names
      const userIds = Array.from(new Set(data?.map(v => v.changed_by).filter(Boolean)));
      const { data: profiles } = userIds.length > 0 ? await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds as string[]) : { data: [] };

      const enriched = (data || []).map(v => ({
        ...v,
        profiles: v.changed_by ? profiles?.find(p => p.id === v.changed_by) : null
      }));

      setVersions(enriched as any);
    } catch (error: any) {
      console.error('Error loading version log:', error);
    } finally {
      setLoading(false);
    }
  };

  const getChangedFields = (oldData: any, newData: any) => {
    if (!oldData || !newData) return [];
    
    const changes: { field: string; before: any; after: any }[] = [];
    const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

    allKeys.forEach(key => {
      // Skip system fields
      if (['id', 'created_at', 'updated_at', 'wo_id'].includes(key)) return;
      
      const oldValue = oldData[key];
      const newValue = newData[key];

      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes.push({
          field: key,
          before: oldValue,
          after: newValue
        });
      }
    });

    return changes;
  };

  const formatValue = (value: any) => {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };

  const formatFieldName = (field: string) => {
    return field
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  if (loading) {
    return <div className="p-4">Loading version history...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileEdit className="h-5 w-5" />
          Work Order Version Log
        </CardTitle>
      </CardHeader>
      <CardContent>
        {versions.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            No edit history available
          </p>
        ) : (
          <div className="space-y-4">
            {versions.map((version, index) => {
              const changes = getChangedFields(version.old_data, version.new_data);

              return (
                <div
                  key={version.id}
                  className="p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    {/* Timeline indicator */}
                    <div className="flex flex-col items-center">
                      <div className={`w-3 h-3 rounded-full ${
                        index === 0 ? 'bg-primary' : 'bg-muted-foreground'
                      }`} />
                      {index < versions.length - 1 && (
                        <div className="w-0.5 h-16 bg-border mt-1" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        <Badge variant={
                          version.action === 'INSERT' ? 'default' :
                          version.action === 'UPDATE' ? 'secondary' :
                          'destructive'
                        }>
                          {version.action}
                        </Badge>
                        {index === 0 && (
                          <Badge variant="outline" className="text-xs">LATEST</Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <span>{version.profiles?.full_name || 'System'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>
                            {format(new Date(version.changed_at), 'dd MMM yyyy, hh:mm a')}
                          </span>
                        </div>
                      </div>

                      {/* Show changes */}
                      {changes.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {changes.map((change, idx) => (
                            <div
                              key={idx}
                              className="p-3 bg-secondary rounded-lg text-sm"
                            >
                              <p className="font-medium text-foreground mb-2">
                                {formatFieldName(change.field)}
                              </p>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <span className="text-muted-foreground text-xs">Before:</span>
                                  <p className="font-mono text-xs mt-1 p-2 bg-background rounded">
                                    {formatValue(change.before)}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground text-xs">After:</span>
                                  <p className="font-mono text-xs mt-1 p-2 bg-background rounded text-green-600">
                                    {formatValue(change.after)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
