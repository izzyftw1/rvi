import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QCActionDrawer } from "./QCActionDrawer";
import { QCGateStatusBadge } from "@/components/QCGateStatusBadge";
import { ChevronDown, ChevronUp, FlaskConical } from "lucide-react";
import { format } from "date-fns";

interface QCStageCardProps {
  woId: string;
  qcType: 'incoming' | 'first_piece' | 'in_process' | 'final';
  status: string;
  approvedAt?: string;
  approvedByName?: string;
  remarks?: string;
  fileUrl?: string;
  onUpdate: () => void;
  isLocked?: boolean;
}

export const QCStageCard = ({
  woId,
  qcType,
  status,
  approvedAt,
  approvedByName,
  remarks,
  fileUrl,
  onUpdate,
  isLocked = false
}: QCStageCardProps) => {
  const [expanded, setExpanded] = useState(false);

  const stageInfo = {
    'incoming': {
      title: 'Raw Material QC',
      icon: FlaskConical,
      description: 'Material test certificate and chemical composition verification',
      color: 'hsl(200 90% 50%)'
    },
    'first_piece': {
      title: 'First Piece QC',
      icon: FlaskConical,
      description: 'First piece dimensional inspection before production',
      color: 'hsl(280 90% 50%)'
    },
    'in_process': {
      title: 'In-Process QC',
      icon: FlaskConical,
      description: 'Hourly dimensional checks during production',
      color: 'hsl(45 90% 50%)'
    },
    'final': {
      title: 'Final Dispatch QC',
      icon: FlaskConical,
      description: 'Final inspection before packing and dispatch',
      color: 'hsl(142 70% 45%)'
    }
  };

  const info = stageInfo[qcType];
  const Icon = info.icon;

  return (
    <Card className={`transition-all ${isLocked ? 'opacity-60 border-warning' : ''}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div 
              className="p-2 rounded-lg"
              style={{ backgroundColor: `${info.color}20` }}
            >
              <Icon className="h-5 w-5" style={{ color: info.color }} />
            </div>
            <div>
              <CardTitle className="text-base">{info.title}</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">{info.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <QCGateStatusBadge status={status as any} />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {isLocked && (
          <Badge variant="outline" className="mt-2 border-warning text-warning">
            Previous QC stage must be completed first
          </Badge>
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          {/* Approval Details */}
          {approvedAt && (
            <div className="p-3 bg-muted/50 rounded-lg space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Approved At:</span>
                <span className="font-medium">{format(new Date(approvedAt), 'PPp')}</span>
              </div>
              {approvedByName && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Approved By:</span>
                  <span className="font-medium">{approvedByName}</span>
                </div>
              )}
              {remarks && (
                <div className="mt-2">
                  <span className="text-muted-foreground">Remarks:</span>
                  <p className="mt-1 text-foreground">{remarks}</p>
                </div>
              )}
              {fileUrl && (
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1 mt-2"
                >
                  View uploaded document
                </a>
              )}
            </div>
          )}

          {/* QC Action Drawer */}
          {!isLocked && (
            <QCActionDrawer
              woId={woId}
              qcType={qcType}
              currentStatus={status}
              currentRemarks={remarks}
              onUpdate={onUpdate}
            />
          )}
        </CardContent>
      )}
    </Card>
  );
};