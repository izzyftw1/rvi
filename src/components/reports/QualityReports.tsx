import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, ArrowRight } from "lucide-react";

/**
 * QualityReports component - Simplified redirect to full Quality Analytics
 * 
 * This component previously duplicated KPIs that are now consolidated in QualityAnalytics.
 * Per system validation requirements:
 * - Daily Production Log is the single source of truth for production/rejection data
 * - Quality Analytics is the single destination for quality metrics and trends
 * - No duplication of KPIs across pages
 */
const QualityReports = () => {
  const navigate = useNavigate();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Quality Analytics
        </CardTitle>
        <CardDescription>
          Comprehensive quality metrics, trends, and accountability reports
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Quality analytics are available in the dedicated Quality Analytics dashboard, which includes:
        </p>
        <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
          <li>First Pass Yield (FPY) and rejection rates by machine, operator, programmer</li>
          <li>NCR rates, repeat NCR analysis, and aging metrics</li>
          <li><strong>NCR Cost Impact</strong> - Live rejection cost by customer, item, and reason</li>
          <li>IPQC compliance and First Piece Right (FPR) rates</li>
          <li>Supplier defect rates from Incoming QC</li>
          <li>Quality loss indicators (scrap, rework, NCR-linked scrap)</li>
          <li>Daily, weekly, and monthly trend charts</li>
        </ul>
        
        <Button onClick={() => navigate("/quality/analytics")} className="mt-4">
          Open Quality Analytics
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
};

export default QualityReports;
