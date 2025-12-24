import { useTdsCalculation } from '@/hooks/useTdsCalculation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { IndianRupee, Percent, Building2, Globe } from 'lucide-react';

interface TdsPreviewProps {
  customerId: string | null;
  grossAmount: number;
  currency?: string;
}

/**
 * Component to show TDS preview when recording receipts
 * This is for internal tracking only - not shown on invoices
 */
export function TdsPreview({ customerId, grossAmount, currency = 'INR' }: TdsPreviewProps) {
  const { calculation, loading } = useTdsCalculation(customerId, grossAmount);

  if (loading) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="py-3 text-sm text-muted-foreground">
          Loading TDS calculation...
        </CardContent>
      </Card>
    );
  }

  if (!customerId || grossAmount <= 0) {
    return null;
  }

  if (!calculation) {
    return null;
  }

  // Export customers have no TDS
  if (calculation.isExport) {
    return (
      <Card className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
        <CardContent className="py-3">
          <div className="flex items-center gap-2 text-sm">
            <Globe className="h-4 w-4 text-green-600" />
            <span className="text-green-700 dark:text-green-400 font-medium">
              Export Customer - No TDS applicable
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // No PAN - cannot calculate TDS
  if (!calculation.pan) {
    return (
      <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
        <CardContent className="py-3">
          <div className="flex items-center gap-2 text-sm">
            <Building2 className="h-4 w-4 text-amber-600" />
            <span className="text-amber-700 dark:text-amber-400">
              No PAN on file - TDS tracking not possible
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
      <CardContent className="py-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              TDS Tracking (Internal)
            </span>
            <Badge variant="outline" className="text-xs">
              {calculation.entityType}
            </Badge>
          </div>
          
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">TDS Rate</div>
              <div className="font-semibold flex items-center gap-1">
                <Percent className="h-3 w-3" />
                {calculation.tdsRate}%
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Expected TDS</div>
              <div className="font-semibold text-blue-600 flex items-center gap-1">
                <IndianRupee className="h-3 w-3" />
                {calculation.tdsAmount.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Net Expected</div>
              <div className="font-semibold text-green-600 flex items-center gap-1">
                <IndianRupee className="h-3 w-3" />
                {calculation.netAmount.toLocaleString()}
              </div>
            </div>
          </div>

          <div className="text-xs text-muted-foreground pt-1 border-t space-y-1">
            <div>PAN: {calculation.pan} • This explains the difference between invoice amount and bank receipt</div>
            <div className="text-amber-600 dark:text-amber-400 font-medium">⚠️ TDS is for internal tracking only and never appears on invoice PDFs</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
