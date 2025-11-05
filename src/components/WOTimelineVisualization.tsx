import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, User } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TimelineEntry {
  from_stage: string;
  to_stage: string;
  changed_at: string;
  is_override?: boolean;
  profiles?: { full_name: string };
}

interface WOTimelineVisualizationProps {
  stageHistory: TimelineEntry[];
}

const formatStageName = (stage: string) => {
  return stage
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export function WOTimelineVisualization({ stageHistory }: WOTimelineVisualizationProps) {
  const sortedHistory = [...stageHistory].sort(
    (a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime()
  );

  const calculateDuration = (index: number) => {
    if (index === sortedHistory.length - 1) {
      // Current stage - show duration until now
      return formatDistanceToNow(new Date(sortedHistory[index].changed_at), { addSuffix: false });
    }
    
    const start = new Date(sortedHistory[index].changed_at);
    const end = new Date(sortedHistory[index + 1].changed_at);
    const diffMs = end.getTime() - start.getTime();
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    }
    return `${hours}h`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Stage Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
          
          <div className="space-y-4">
            {sortedHistory.map((entry, index) => {
              const duration = calculateDuration(index);
              const isLatest = index === sortedHistory.length - 1;
              
              return (
                <TooltipProvider key={index}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="relative pl-10 pb-4">
                        {/* Timeline dot */}
                        <div className={`absolute left-2.5 w-3 h-3 rounded-full border-2 ${
                          isLatest 
                            ? 'bg-primary border-primary animate-pulse' 
                            : 'bg-green-500 border-green-500'
                        }`} />
                        
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">
                              {formatStageName(entry.to_stage)}
                            </span>
                            {isLatest && (
                              <Badge variant="default" className="text-xs">Current</Badge>
                            )}
                            {entry.is_override && (
                              <Badge variant="outline" className="text-xs">Manual Override</Badge>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(new Date(entry.changed_at), 'MMM dd, yyyy HH:mm')}
                            </span>
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {entry.profiles?.full_name || 'System'}
                            </span>
                          </div>
                          
                          <div className="text-xs font-medium text-blue-600">
                            Duration: {duration}
                          </div>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <div className="space-y-1">
                        <p className="font-semibold">Stage Transition</p>
                        <p className="text-xs">
                          From: {entry.from_stage ? formatStageName(entry.from_stage) : 'Start'}
                        </p>
                        <p className="text-xs">
                          To: {formatStageName(entry.to_stage)}
                        </p>
                        <p className="text-xs">
                          Changed by: {entry.profiles?.full_name || 'System'}
                        </p>
                        <p className="text-xs">
                          Time in stage: {duration}
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
