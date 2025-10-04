import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LucideIcon } from "lucide-react";

interface DepartmentCardProps {
  title: string;
  icon: LucideIcon;
  wipPcs: number;
  wipKg: number;
  avgWaitTime: string;
  alerts?: number;
  onClick?: () => void;
}

export const DepartmentCard = ({
  title,
  icon: Icon,
  wipPcs,
  wipKg,
  avgWaitTime,
  alerts = 0,
  onClick,
}: DepartmentCardProps) => {
  return (
    <Card 
      className="hover:shadow-lg transition-all cursor-pointer border-l-4 border-l-primary"
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-2xl font-bold">{wipPcs}</span>
            <span className="text-sm text-muted-foreground">pieces</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xl font-semibold">{wipKg.toFixed(1)} kg</span>
            <span className="text-sm text-muted-foreground">weight</span>
          </div>
          <div className="pt-2 border-t">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Avg wait:</span>
              <span className="font-medium">{avgWaitTime}</span>
            </div>
          </div>
          {alerts > 0 && (
            <Badge variant="destructive" className="w-full justify-center">
              {alerts} Alert{alerts > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
