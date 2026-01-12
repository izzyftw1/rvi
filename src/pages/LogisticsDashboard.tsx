import { useState, useCallback } from "react";
import { PageHeader, PageContainer } from "@/components/ui/page-header";
import { Truck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useLogisticsData, LogisticsFilters } from "@/hooks/useLogisticsData";
import { ExecutiveSnapshot } from "@/components/logistics/ExecutiveSnapshot";
import { OperationalPipeline } from "@/components/logistics/OperationalPipeline";
import { AgeingRiskPanel } from "@/components/logistics/AgeingRiskPanel";
import { DispatchHistoryTable } from "@/components/logistics/DispatchHistoryTable";
import { FinishedGoodsVisibility } from "@/components/logistics/FinishedGoodsVisibility";
import { LogisticsFiltersBar } from "@/components/logistics/LogisticsFiltersBar";
import { Skeleton } from "@/components/ui/skeleton";

const LogisticsDashboard = () => {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<LogisticsFilters>({
    dateRange: { from: null, to: null },
    customer: "",
    workOrder: "",
    itemCode: "",
    dispatchStatus: "",
  });

  const { 
    dispatches, 
    finishedGoods, 
    loading, 
    metrics, 
    pipeline, 
    ageingBuckets, 
    customers, 
    workOrders,
    refresh 
  } = useLogisticsData(filters);

  const handleFilterChange = useCallback((newFilters: Partial<LogisticsFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  const handleKPIClick = useCallback((kpi: string) => {
    if (kpi === "packed" || kpi === "packed-stock") {
      navigate("/dispatch");
    } else if (kpi === "fg-inventory") {
      navigate("/finished-goods");
    }
  }, [navigate]);

  const handleStageClick = useCallback((stage: string) => {
    if (stage === "ready" || stage === "partial") {
      navigate("/dispatch");
    } else if (stage === "awaiting-qc") {
      navigate("/dispatch-qc-list");
    }
  }, [navigate]);

  if (loading) {
    return (
      <PageContainer maxWidth="2xl">
        <PageHeader 
          title="Logistics Control Tower" 
          description="Loading..."
          icon={<Truck className="h-5 w-5" />}
        />
        <div className="space-y-4 mt-6">
          <div className="grid grid-cols-6 gap-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-32" />
          <Skeleton className="h-40" />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="2xl">
      <div className="flex items-center justify-between mb-6">
        <PageHeader 
          title="Logistics Control Tower" 
          description="Management-grade overview of dispatch, inventory & risk"
          icon={<Truck className="h-5 w-5" />}
        />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <Button onClick={() => navigate("/dispatch")}>
            Go to Dispatch
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Global Filters */}
        <LogisticsFiltersBar
          filters={filters}
          onFilterChange={handleFilterChange}
          customers={customers}
          workOrders={workOrders}
        />

        {/* Executive Snapshot KPIs */}
        <ExecutiveSnapshot metrics={metrics} onKPIClick={handleKPIClick} />

        {/* Operational Pipeline */}
        <OperationalPipeline pipeline={pipeline} onStageClick={handleStageClick} />

        {/* Ageing & Risk */}
        <AgeingRiskPanel buckets={ageingBuckets} />

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Dispatch History */}
          <DispatchHistoryTable dispatches={dispatches} />

          {/* Finished Goods Visibility */}
          <FinishedGoodsVisibility items={finishedGoods} />
        </div>
      </div>
    </PageContainer>
  );
};

export default LogisticsDashboard;
