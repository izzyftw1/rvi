import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Clock, User } from "lucide-react";
import { format } from "date-fns";

interface StageHistoryEntry {
  id: string;
  from_stage: string | null;
  to_stage: string;
  changed_at: string;
  is_override: boolean;
  reason?: string;
  profiles?: { full_name: string };
}

interface RoutingStep {
  id: string;
  name: string;
  status: string;
  actual_start?: string;
  actual_end?: string;
  departments?: { name: string };
}

interface EnhancedStageHistoryProps {
  stageHistory: StageHistoryEntry[];
  routingSteps: RoutingStep[];
}

export function EnhancedStageHistory({ stageHistory, routingSteps }: EnhancedStageHistoryProps) {
  const formatStageName = (stage: string) => {
    return stage
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="space-y-4">
      {/* Stage Transitions */}
      <Card>
        <CardHeader>
          <CardTitle>Stage Transition Log</CardTitle>
        </CardHeader>
        <CardContent>
          {stageHistory.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No stage transitions recorded
            </p>
          ) : (
            <div className="space-y-4">
              {stageHistory.map((entry, index) => (
                <div
                  key={entry.id}
                  className={`p-4 rounded-lg border ${
                    index === 0 
                      ? 'border-primary bg-primary/5' 
                      : 'bg-secondary/50'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Timeline indicator */}
                    <div className="flex flex-col items-center">
                      <div className={`w-3 h-3 rounded-full ${
                        index === 0 ? 'bg-primary' : 'bg-muted-foreground'
                      }`} />
                      {index < stageHistory.length - 1 && (
                        <div className="w-0.5 h-12 bg-border mt-1" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {entry.from_stage && (
                          <>
                            <Badge variant="outline">
                              {formatStageName(entry.from_stage)}
                            </Badge>
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          </>
                        )}
                        <Badge className="bg-primary">
                          {formatStageName(entry.to_stage)}
                        </Badge>
                        {entry.is_override && (
                          <Badge variant="destructive" className="text-xs">
                            MANUAL OVERRIDE
                          </Badge>
                        )}
                        {index === 0 && (
                          <Badge variant="secondary" className="text-xs">
                            CURRENT
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <span>{entry.profiles?.full_name || 'System'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>
                            {format(new Date(entry.changed_at), 'dd MMM yyyy, hh:mm a')}
                          </span>
                        </div>
                      </div>

                      {entry.reason && (
                        <div className="mt-2 p-2 bg-background rounded text-sm">
                          <span className="text-muted-foreground">Remarks:</span>{' '}
                          <span className="italic">{entry.reason}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Routing Steps (Merged) */}
      {routingSteps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Routing Steps</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {routingSteps.map((step, index) => (
                <div
                  key={step.id}
                  className="flex items-start gap-3 p-3 border rounded-lg"
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    step.status === 'completed' 
                      ? 'bg-green-500 text-white' 
                      : step.status === 'in_progress'
                      ? 'bg-blue-500 text-white'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{step.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {step.departments?.name || 'Unassigned'}
                        </p>
                      </div>
                      <Badge variant={
                        step.status === 'completed' ? 'default' : 
                        step.status === 'in_progress' ? 'secondary' : 
                        'outline'
                      }>
                        {step.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    {step.actual_start && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Started: {format(new Date(step.actual_start), 'dd MMM yyyy, hh:mm a')}
                      </p>
                    )}
                    {step.actual_end && (
                      <p className="text-xs text-muted-foreground">
                        Completed: {format(new Date(step.actual_end), 'dd MMM yyyy, hh:mm a')}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
