import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, Package, Shield, DollarSign, FileText, Activity } from "lucide-react";
import TraceabilityReports from "@/components/reports/TraceabilityReports";
import QualityReports from "@/components/reports/QualityReports";
import InventoryReports from "@/components/reports/InventoryReports";
import { PageHeader, PageContainer } from "@/components/ui/page-header";
import PackingReports from "@/components/reports/PackingReports";
import SHEReports from "@/components/reports/SHEReports";
import FinanceReports from "@/components/reports/FinanceReports";

const Reports = () => {
  const [activeTab, setActiveTab] = useState("traceability");

  return (
    <PageContainer maxWidth="2xl">
      <PageHeader 
        title="Reports & Analytics" 
        description="Comprehensive insights across all workflows"
        icon={<Activity className="h-5 w-5" />}
      />
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 mt-6">
          <TabsList className="grid w-full grid-cols-6 lg:w-auto">
            <TabsTrigger value="traceability" className="gap-2">
              <Activity className="h-4 w-4" />
              <span className="hidden md:inline">Traceability</span>
            </TabsTrigger>
            <TabsTrigger value="quality" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden md:inline">Quality</span>
            </TabsTrigger>
            <TabsTrigger value="inventory" className="gap-2">
              <Package className="h-4 w-4" />
              <span className="hidden md:inline">Inventory</span>
            </TabsTrigger>
            <TabsTrigger value="packing" className="gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden md:inline">Packing</span>
            </TabsTrigger>
            <TabsTrigger value="she" className="gap-2">
              <Shield className="h-4 w-4" />
              <span className="hidden md:inline">SHE</span>
            </TabsTrigger>
            <TabsTrigger value="finance" className="gap-2">
              <DollarSign className="h-4 w-4" />
              <span className="hidden md:inline">Finance</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="traceability">
            <TraceabilityReports />
          </TabsContent>

          <TabsContent value="quality">
            <QualityReports />
          </TabsContent>

          <TabsContent value="inventory">
            <InventoryReports />
          </TabsContent>

          <TabsContent value="packing">
            <PackingReports />
          </TabsContent>

          <TabsContent value="she">
            <SHEReports />
          </TabsContent>

          <TabsContent value="finance">
            <FinanceReports />
          </TabsContent>
        </Tabs>
    </PageContainer>
  );
};

export default Reports;
