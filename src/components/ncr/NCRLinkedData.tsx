import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { 
  Package, 
  Factory, 
  Beaker, 
  FileText,
  ExternalLink,
  Layers,
  Cpu,
  User
} from 'lucide-react';
import { format } from 'date-fns';

interface NCRLinkedDataProps {
  ncrId: string;
  workOrderId: string | null;
  qcRecordId: string | null;
  materialLotId: string | null;
  productionLogId: string | null;
  machineId?: string | null;
  raisedFrom: string | null;
}

interface WorkOrderInfo {
  id: string;
  display_id: string | null;
  wo_number: string | null;
  customer: string;
  item_code: string;
  quantity: number;
}

interface MaterialLotInfo {
  id: string;
  lot_id: string;
  alloy: string;
  material_size_mm: string;
  heat_no: string | null;
  qty_kg: number;
}

interface ProductionLogInfo {
  id: string;
  log_date: string;
  plant: string;
  shift: string;
  setup_number: string;
  actual_quantity: number | null;
  ok_quantity: number | null;
  total_rejection_quantity: number | null;
  operator_id: string | null;
  machine_id: string | null;
}

interface MachineInfo {
  id: string;
  machine_id: string;
  name: string;
}

interface OperatorInfo {
  id: string;
  full_name: string;
}

interface QCRecordInfo {
  id: string;
  qc_type: string;
  result: string;
  created_at: string;
  remarks: string | null;
}

export function NCRLinkedData({
  ncrId,
  workOrderId,
  qcRecordId,
  materialLotId,
  productionLogId,
  machineId,
  raisedFrom
}: NCRLinkedDataProps) {
  const navigate = useNavigate();
  const [workOrder, setWorkOrder] = useState<WorkOrderInfo | null>(null);
  const [materialLot, setMaterialLot] = useState<MaterialLotInfo | null>(null);
  const [productionLog, setProductionLog] = useState<ProductionLogInfo | null>(null);
  const [qcRecord, setQCRecord] = useState<QCRecordInfo | null>(null);
  const [machine, setMachine] = useState<MachineInfo | null>(null);
  const [operator, setOperator] = useState<OperatorInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLinkedData();
  }, [workOrderId, qcRecordId, materialLotId, productionLogId, machineId]);

  const loadLinkedData = async () => {
    try {
      // Load work order
      if (workOrderId) {
        const { data } = await supabase
          .from('work_orders')
          .select('id, display_id, wo_number, customer, item_code, quantity')
          .eq('id', workOrderId)
          .single();
        setWorkOrder(data);
      }

      // Load material lot
      if (materialLotId) {
        const { data } = await supabase
          .from('inventory_lots')
          .select('id, lot_id, alloy, material_size_mm, heat_no, qty_kg')
          .eq('id', materialLotId)
          .single();
        setMaterialLot(data);
      }

      // Load production log
      if (productionLogId) {
        const { data } = await supabase
          .from('daily_production_logs')
          .select('id, log_date, plant, shift, setup_number, actual_quantity, ok_quantity, total_rejection_quantity, operator_id, machine_id')
          .eq('id', productionLogId)
          .single();
        setProductionLog(data);
        
        // Load operator from production log
        if (data?.operator_id) {
          const { data: opData } = await supabase
            .from('people')
            .select('id, full_name')
            .eq('id', data.operator_id)
            .single();
          setOperator(opData);
        }
        
        // Load machine from production log if not directly set
        if (data?.machine_id && !machineId) {
          const { data: machData } = await supabase
            .from('machines')
            .select('id, machine_id, name')
            .eq('id', data.machine_id)
            .single();
          setMachine(machData);
        }
      }

      // Load machine directly if provided
      if (machineId) {
        const { data } = await supabase
          .from('machines')
          .select('id, machine_id, name')
          .eq('id', machineId)
          .single();
        setMachine(data);
      }

      // Load QC record
      if (qcRecordId) {
        const { data } = await supabase
          .from('qc_records')
          .select('id, qc_type, result, created_at, remarks')
          .eq('id', qcRecordId)
          .single();
        setQCRecord(data);
      }
    } catch (error) {
      console.error('Error loading linked data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSourceBadge = (source: string | null) => {
    switch (source) {
      case 'incoming_qc':
        return <Badge className="bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400">Incoming QC</Badge>;
      case 'inprocess_qc':
        return <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">In-Process QC</Badge>;
      case 'final_qc':
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">Final QC</Badge>;
      case 'production':
        return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">Production</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading linked data...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5" />
          Linked Data & Traceability
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Source */}
        {raisedFrom && (
          <div>
            <Label className="text-muted-foreground">Raised From</Label>
            <div className="mt-1">{getSourceBadge(raisedFrom)}</div>
          </div>
        )}

        <Separator />

        {/* Work Order */}
        {workOrder ? (
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <Label className="font-medium">Work Order</Label>
              </div>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={() => navigate(`/work-orders/${workOrder.id}`)}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                View
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">WO#:</span>
                <span className="ml-2 font-medium">{workOrder.display_id || workOrder.wo_number}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Customer:</span>
                <span className="ml-2">{workOrder.customer}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Item:</span>
                <span className="ml-2">{workOrder.item_code}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Qty:</span>
                <span className="ml-2">{workOrder.quantity?.toLocaleString()}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No work order linked</div>
        )}

        {/* QC Record */}
        {qcRecord && (
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Beaker className="h-4 w-4 text-muted-foreground" />
              <Label className="font-medium">QC Record</Label>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Type:</span>
                <span className="ml-2">{qcRecord.qc_type}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Result:</span>
                <Badge 
                  variant="outline"
                  className={qcRecord.result === 'pass' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                  }
                >
                  {qcRecord.result}
                </Badge>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Date:</span>
                <span className="ml-2">{format(new Date(qcRecord.created_at), 'dd MMM yyyy HH:mm')}</span>
              </div>
            </div>
          </div>
        )}

        {/* Material Lot */}
        {materialLot && (
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <Label className="font-medium">Material Lot</Label>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Lot ID:</span>
                <span className="ml-2 font-medium">{materialLot.lot_id}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Heat No:</span>
                <span className="ml-2">{materialLot.heat_no || '-'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Alloy:</span>
                <span className="ml-2">{materialLot.alloy}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Size:</span>
                <span className="ml-2">{materialLot.material_size_mm} mm</span>
              </div>
            </div>
          </div>
        )}

        {/* Production Log */}
        {productionLog && (
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Factory className="h-4 w-4 text-muted-foreground" />
              <Label className="font-medium">Production Log</Label>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Date:</span>
                <span className="ml-2">{format(new Date(productionLog.log_date), 'dd MMM yyyy')}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Shift:</span>
                <span className="ml-2">{productionLog.shift}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Plant:</span>
                <span className="ml-2">{productionLog.plant}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Setup:</span>
                <span className="ml-2">{productionLog.setup_number}</span>
              </div>
              <div>
                <span className="text-muted-foreground">OK Qty:</span>
                <span className="ml-2 text-green-600 font-medium">{productionLog.ok_quantity || 0}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Rejected:</span>
                <span className="ml-2 text-red-600 font-medium">{productionLog.total_rejection_quantity || 0}</span>
              </div>
            </div>
          </div>
        )}

        {/* Machine */}
        {machine && (
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="h-4 w-4 text-muted-foreground" />
              <Label className="font-medium">Machine</Label>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Machine ID:</span>
                <span className="ml-2 font-medium">{machine.machine_id}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Name:</span>
                <span className="ml-2">{machine.name}</span>
              </div>
            </div>
          </div>
        )}

        {/* Operator */}
        {operator && (
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <Label className="font-medium">Operator</Label>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Name:</span>
              <span className="ml-2 font-medium">{operator.full_name}</span>
            </div>
          </div>
        )}

        {!workOrder && !qcRecord && !materialLot && !productionLog && !machine && !operator && (
          <div className="text-center py-4 text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No linked records found</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
