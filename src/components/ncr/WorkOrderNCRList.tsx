import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, AlertTriangle, CheckCircle, Clock, FileWarning } from 'lucide-react';
import { format } from 'date-fns';
import { NCRFormDialog } from './NCRFormDialog';

interface NCR {
  id: string;
  ncr_number: string;
  ncr_type: 'INTERNAL' | 'CUSTOMER' | 'SUPPLIER';
  issue_description: string;
  quantity_affected: number;
  unit: string;
  status: 'OPEN' | 'ACTION_IN_PROGRESS' | 'EFFECTIVENESS_PENDING' | 'CLOSED';
  created_at: string;
}

interface WorkOrderNCRListProps {
  workOrderId: string;
}

const STATUS_CONFIG = {
  OPEN: { label: 'Open', icon: AlertTriangle, color: 'bg-red-100 text-red-800' },
  ACTION_IN_PROGRESS: { label: 'In Progress', icon: Clock, color: 'bg-yellow-100 text-yellow-800' },
  EFFECTIVENESS_PENDING: { label: 'Pending', icon: FileWarning, color: 'bg-blue-100 text-blue-800' },
  CLOSED: { label: 'Closed', icon: CheckCircle, color: 'bg-green-100 text-green-800' },
};

export function WorkOrderNCRList({ workOrderId }: WorkOrderNCRListProps) {
  const navigate = useNavigate();
  const [ncrs, setNCRs] = useState<NCR[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    loadNCRs();
  }, [workOrderId]);

  const loadNCRs = async () => {
    try {
      const { data, error } = await supabase
        .from('ncrs')
        .select('*')
        .eq('work_order_id', workOrderId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNCRs(data || []);
    } catch (error) {
      console.error('Error loading NCRs:', error);
    } finally {
      setLoading(false);
    }
  };

  const openCount = ncrs.filter(n => n.status !== 'CLOSED').length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            Non-Conformance Reports
            {openCount > 0 && (
              <Badge variant="destructive">{openCount} Open</Badge>
            )}
          </CardTitle>
        </div>
        <Button size="sm" onClick={() => setShowDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add NCR
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : ncrs.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">No NCRs linked to this work order</p>
        ) : (
          <div className="space-y-2">
            {ncrs.map(ncr => {
              const config = STATUS_CONFIG[ncr.status];
              const Icon = config.icon;
              
              return (
                <div 
                  key={ncr.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                  onClick={() => navigate(`/ncr/${ncr.id}`)}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{ncr.ncr_number}</span>
                      <Badge variant="outline">{ncr.ncr_type}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate max-w-md">
                      {ncr.issue_description}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm">{ncr.quantity_affected} {ncr.unit}</span>
                    <Badge className={config.color}>
                      <Icon className="h-3 w-3 mr-1" />
                      {config.label}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
      
      <NCRFormDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        onSuccess={() => {
          loadNCRs();
          setShowDialog(false);
        }}
        prefillData={{ workOrderId }}
      />
    </Card>
  );
}
