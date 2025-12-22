import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Package, 
  Hash, 
  Layers, 
  AlertTriangle, 
  CheckCircle2, 
  Lock,
  Truck,
  FlaskConical,
  Factory,
  PackageCheck,
  Warehouse
} from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkOrderSummaryProps {
  workOrder: {
    wo_number?: string;
    display_id?: string;
    wo_id?: string;
    id?: string;
    item_code?: string;
    customer?: string;
    quantity?: number;
    current_stage?: string;
    production_release_status?: string;
    production_release_notes?: string;
    status?: string;
  };
}

const STAGE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  goods_in: { label: 'Goods In', icon: Warehouse, color: 'bg-blue-500' },
  material_prep: { label: 'Material Prep', icon: Package, color: 'bg-indigo-500' },
  production: { label: 'Production', icon: Factory, color: 'bg-amber-500' },
  external: { label: 'External', icon: Truck, color: 'bg-purple-500' },
  qc: { label: 'Quality Control', icon: FlaskConical, color: 'bg-cyan-500' },
  packing: { label: 'Packing', icon: PackageCheck, color: 'bg-emerald-500' },
  dispatch: { label: 'Dispatch', icon: Truck, color: 'bg-green-600' },
};

const ALL_STAGES = ['goods_in', 'material_prep', 'production', 'external', 'qc', 'packing', 'dispatch'];

export function WorkOrderSummary({ workOrder }: WorkOrderSummaryProps) {
  const humanReadableRef = workOrder.wo_number || workOrder.display_id || `WO-${workOrder.id?.slice(0, 8)}`;
  const systemId = workOrder.id;
  
  const currentStage = workOrder.current_stage || 'goods_in';
  const stageConfig = STAGE_CONFIG[currentStage] || STAGE_CONFIG.goods_in;
  const StageIcon = stageConfig.icon;
  
  const isReleased = workOrder.production_release_status === 'RELEASED';
  const releaseReason = workOrder.production_release_notes;

  const currentStageIndex = ALL_STAGES.indexOf(currentStage);

  return (
    <Card className="border-2">
      <CardContent className="py-5">
        <div className="space-y-4">
          {/* Primary Reference & Status */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight">{humanReadableRef}</h1>
                <Badge 
                  variant={workOrder.status === 'completed' ? 'default' : 'secondary'}
                  className="text-xs"
                >
                  {workOrder.status?.replace('_', ' ').toUpperCase() || 'PENDING'}
                </Badge>
              </div>
              {systemId && systemId !== humanReadableRef && (
                <p className="text-xs text-muted-foreground font-mono">
                  System ID: {systemId}
                </p>
              )}
            </div>

            {/* Production Release Status - Prominent */}
            <div className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg border",
              isReleased 
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400" 
                : "bg-destructive/10 border-destructive/30 text-destructive"
            )}>
              {isReleased ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <Lock className="h-5 w-5" />
              )}
              <div>
                <p className="font-semibold text-sm">
                  {isReleased ? 'Released for Production' : 'Production Blocked'}
                </p>
                {!isReleased && releaseReason && (
                  <p className="text-xs opacity-80">{releaseReason}</p>
                )}
              </div>
            </div>
          </div>

          {/* Item & Quantity Info */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3 border-y border-border/50">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-sm font-medium">{workOrder.item_code || '—'}</span>
                {workOrder.customer && (
                  <span className="text-xs text-muted-foreground ml-2">for {workOrder.customer}</span>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                <span className="font-bold text-lg">{workOrder.quantity?.toLocaleString() || '—'}</span>
                <span className="text-muted-foreground ml-1">pcs ordered</span>
              </span>
            </div>
          </div>

          {/* Stage Progress Indicator */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Current Stage</span>
            </div>
            
            <div className="flex items-center gap-1">
              {ALL_STAGES.map((stage, idx) => {
                const config = STAGE_CONFIG[stage];
                const isActive = stage === currentStage;
                const isPast = idx < currentStageIndex;
                const Icon = config.icon;
                
                return (
                  <div key={stage} className="flex items-center">
                    <div
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all",
                        isActive && "bg-primary text-primary-foreground shadow-sm",
                        isPast && "bg-muted text-muted-foreground",
                        !isActive && !isPast && "bg-muted/50 text-muted-foreground/50"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{config.label}</span>
                    </div>
                    {idx < ALL_STAGES.length - 1 && (
                      <div className={cn(
                        "w-2 h-0.5 mx-0.5",
                        idx < currentStageIndex ? "bg-muted-foreground/40" : "bg-muted/50"
                      )} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
