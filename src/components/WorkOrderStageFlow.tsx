import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Clock } from "lucide-react";

interface StageFlowProps {
  currentStage: string;
  stageHistory?: Array<{
    from_stage: string;
    to_stage: string;
    changed_at: string;
  }>;
}

const WORKFLOW_STAGES = [
  { key: 'production_planning', label: 'Production Planning' },
  { key: 'proforma_sent', label: 'Proforma Sent' },
  { key: 'raw_material_check', label: 'Raw Material Check' },
  { key: 'raw_material_order', label: 'Raw Material Order' },
  { key: 'raw_material_inwards', label: 'Raw Material Inwards' },
  { key: 'raw_material_qc', label: 'Raw Material QC' },
  { key: 'cutting', label: 'Cutting' },
  { key: 'forging', label: 'Forging' },
  { key: 'cnc_production', label: 'CNC Production' },
  { key: 'first_piece_qc', label: 'First Piece QC' },
  { key: 'mass_production', label: 'Mass Production' },
  { key: 'buffing', label: 'Buffing' },
  { key: 'plating', label: 'Plating' },
  { key: 'blasting', label: 'Blasting' },
  { key: 'packing', label: 'Packing' },
  { key: 'dispatch', label: 'Dispatch' },
];

export function WorkOrderStageFlow({ currentStage, stageHistory = [] }: StageFlowProps) {
  const currentIndex = WORKFLOW_STAGES.findIndex(s => s.key === currentStage);
  
  const getStageStatus = (index: number): 'done' | 'active' | 'pending' => {
    if (index < currentIndex) return 'done';
    if (index === currentIndex) return 'active';
    return 'pending';
  };

  const getStageIcon = (status: string) => {
    switch (status) {
      case 'done':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'active':
        return <Clock className="w-4 h-4 text-blue-500 animate-pulse" />;
      default:
        return <Circle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStageBadgeVariant = (status: string) => {
    switch (status) {
      case 'done':
        return 'default' as const;
      case 'active':
        return 'secondary' as const;
      default:
        return 'outline' as const;
    }
  };

  return (
    <div className="w-full overflow-x-auto pb-4">
      <div className="flex items-center gap-2 min-w-max px-4">
        {WORKFLOW_STAGES.map((stage, index) => {
          const status = getStageStatus(index);
          const isLast = index === WORKFLOW_STAGES.length - 1;

          return (
            <div key={stage.key} className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-2">
                  {getStageIcon(status)}
                  <Badge 
                    variant={getStageBadgeVariant(status)}
                    className={status === 'active' ? 'bg-blue-500 text-white' : ''}
                  >
                    {stage.label}
                  </Badge>
                </div>
                {status === 'active' && (
                  <span className="text-xs text-muted-foreground">Current</span>
                )}
              </div>
              {!isLast && (
                <div className={`h-px w-8 ${status === 'done' ? 'bg-green-500' : 'bg-border'}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
