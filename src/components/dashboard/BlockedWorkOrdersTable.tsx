/**
 * BlockedWorkOrdersTable - Action-Focused Table
 * 
 * Displays blocked work orders with:
 * - What is blocked
 * - Why it's blocked  
 * - Who can unblock it
 * - Next Action (single primary action per row)
 */
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Wrench,
  CheckCircle,
  Package,
  Phone,
  ArrowRight,
  AlertTriangle,
  Clock,
  User,
  LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { differenceInHours, parseISO, differenceInDays } from "date-fns";

interface BlockedOrder {
  id: string;
  display_id: string;
  item_code: string;
  customer: string;
  blockReason: string;
  blockType: 'material_qc' | 'first_piece_qc' | 'machine_needed' | 'external' | 'maintenance' | 'material_issue';
  blockAge: string;
  blockAgeHours: number;
  owner: string;
  nextAction: {
    label: string;
    icon: LucideIcon;
    path: string;
    variant: 'default' | 'destructive' | 'outline';
  };
  urgency: 'critical' | 'high' | 'medium';
}

interface BlockedWorkOrdersTableProps {
  workOrders: any[];
  externalMoves?: any[];
  machines?: any[];
}

// Map block types to owners and actions
const BLOCK_CONFIG = {
  material_qc: {
    owner: 'Quality',
    action: { label: 'Approve QC', icon: CheckCircle, variant: 'default' as const },
    getPath: (woId: string) => `/qc/incoming?wo=${woId}`
  },
  first_piece_qc: {
    owner: 'QC / Production',
    action: { label: 'Approve QC', icon: CheckCircle, variant: 'default' as const },
    getPath: (woId: string) => `/work-orders/${woId}?tab=qc`
  },
  machine_needed: {
    owner: 'Production Planning',
    action: { label: 'Assign Machine', icon: Wrench, variant: 'default' as const },
    getPath: (woId: string) => `/work-orders/${woId}?action=assign`
  },
  external: {
    owner: 'External Ops',
    action: { label: 'Check Status', icon: Phone, variant: 'outline' as const },
    getPath: (woId: string) => `/work-orders/${woId}?tab=external`
  },
  maintenance: {
    owner: 'Maintenance',
    action: { label: 'Call Maintenance', icon: Phone, variant: 'destructive' as const },
    getPath: (woId: string) => `/work-orders/${woId}`
  },
  material_issue: {
    owner: 'Procurement',
    action: { label: 'Issue Material', icon: Package, variant: 'default' as const },
    getPath: (woId: string) => `/work-orders/${woId}?tab=material`
  }
};

export const BlockedWorkOrdersTable = ({ 
  workOrders, 
  externalMoves = [],
  machines = []
}: BlockedWorkOrdersTableProps) => {
  const navigate = useNavigate();

  // Build external moves map
  const externalMap = new Map<string, any>();
  externalMoves.forEach(m => {
    if (m.work_order_id) {
      externalMap.set(m.work_order_id, m);
    }
  });

  // Identify blocked orders with reasons
  const blockedOrders: BlockedOrder[] = workOrders
    .filter(wo => wo.status !== 'completed' && wo.status !== 'shipped')
    .map(wo => {
      const now = new Date();
      const dueDate = wo.due_date ? parseISO(wo.due_date) : null;
      const daysUntilDue = dueDate ? differenceInDays(dueDate, now) : 999;
      
      let blockType: BlockedOrder['blockType'] | null = null;
      let blockReason = '';

      // Determine block type priority
      if (!wo.qc_material_passed) {
        blockType = 'material_qc';
        blockReason = 'Material QC pending';
      } else if (!wo.qc_first_piece_passed) {
        blockType = 'first_piece_qc';
        blockReason = 'First Piece inspection needed';
      } else if (externalMap.has(wo.id)) {
        const ext = externalMap.get(wo.id);
        blockType = 'external';
        blockReason = `At external: ${ext.process || 'Processing'}`;
      } else if (wo.current_stage === 'production' && !wo.machine_id) {
        blockType = 'machine_needed';
        blockReason = 'No machine assigned';
      } else if (['goods_in', 'cutting_queue'].includes(wo.current_stage) && wo.qc_material_passed && wo.qc_first_piece_passed) {
        blockType = 'material_issue';
        blockReason = 'Material ready, awaiting issue';
      }

      if (!blockType) return null;

      const stageEnteredAt = wo.stage_entered_at || wo.created_at;
      const blockAgeHours = stageEnteredAt ? differenceInHours(now, parseISO(stageEnteredAt)) : 0;
      const blockAge = blockAgeHours < 24 
        ? `${blockAgeHours}h` 
        : `${Math.floor(blockAgeHours / 24)}d ${blockAgeHours % 24}h`;

      const config = BLOCK_CONFIG[blockType];
      const urgency: BlockedOrder['urgency'] = 
        daysUntilDue <= 0 ? 'critical' : 
        daysUntilDue <= 3 ? 'high' : 'medium';

      return {
        id: wo.id,
        display_id: wo.display_id || wo.wo_id || 'N/A',
        item_code: wo.item_code || '-',
        customer: wo.customer || '-',
        blockReason,
        blockType,
        blockAge,
        blockAgeHours,
        owner: config.owner,
        nextAction: {
          label: config.action.label,
          icon: config.action.icon,
          path: config.getPath(wo.id),
          variant: config.action.variant
        },
        urgency
      };
    })
    .filter((item): item is BlockedOrder => item !== null)
    .sort((a, b) => {
      // Sort by urgency first, then by block age
      const urgencyOrder = { critical: 0, high: 1, medium: 2 };
      if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
        return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      }
      return b.blockAgeHours - a.blockAgeHours;
    });

  if (blockedOrders.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
        <p className="text-sm font-medium">No blocked work orders</p>
        <p className="text-xs">All orders are progressing normally</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">WO ID</TableHead>
            <TableHead>Item</TableHead>
            <TableHead>Blocked Reason</TableHead>
            <TableHead className="text-center">Block Age</TableHead>
            <TableHead className="text-center">Owner</TableHead>
            <TableHead className="text-right">Next Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {blockedOrders.map((order) => {
            const ActionIcon = order.nextAction.icon;
            return (
              <TableRow 
                key={order.id}
                className={cn(
                  "cursor-pointer hover:bg-muted/50",
                  order.urgency === 'critical' && "bg-destructive/5"
                )}
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {order.urgency === 'critical' && (
                      <AlertTriangle className="h-3 w-3 text-destructive" />
                    )}
                    <span 
                      className="hover:underline cursor-pointer"
                      onClick={() => navigate(`/work-orders/${order.id}`)}
                    >
                      {order.display_id}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{order.item_code}</div>
                  <div className="text-xs text-muted-foreground truncate max-w-[150px]">
                    {order.customer}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-xs",
                      order.blockType === 'material_qc' && "border-amber-500 text-amber-700 dark:text-amber-400",
                      order.blockType === 'first_piece_qc' && "border-amber-500 text-amber-700 dark:text-amber-400",
                      order.blockType === 'machine_needed' && "border-blue-500 text-blue-700 dark:text-blue-400",
                      order.blockType === 'external' && "border-purple-500 text-purple-700 dark:text-purple-400",
                      order.blockType === 'material_issue' && "border-green-500 text-green-700 dark:text-green-400"
                    )}
                  >
                    {order.blockReason}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  <div className={cn(
                    "flex items-center justify-center gap-1 text-xs",
                    order.blockAgeHours > 48 && "text-destructive font-semibold",
                    order.blockAgeHours > 24 && order.blockAgeHours <= 48 && "text-amber-600 dark:text-amber-400"
                  )}>
                    <Clock className="h-3 w-3" />
                    {order.blockAge}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="secondary" className="text-[10px]">
                    <User className="h-2.5 w-2.5 mr-1" />
                    {order.owner}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant={order.nextAction.variant}
                    className="gap-1.5 text-xs h-7"
                    onClick={() => navigate(order.nextAction.path)}
                  >
                    <ActionIcon className="h-3 w-3" />
                    {order.nextAction.label}
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
