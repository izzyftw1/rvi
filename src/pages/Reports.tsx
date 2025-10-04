import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, BarChart3, TrendingUp, Package, Shield, DollarSign, FileText, Activity } from "lucide-react";
import TraceabilityReports from "@/components/reports/TraceabilityReports";
import ProductionReports from "@/components/reports/ProductionReports";
import QualityReports from "@/components/reports/QualityReports";
import InventoryReports from "@/components/reports/InventoryReports";
import PackingReports from "@/components/reports/PackingReports";
import SHEReports from "@/components/reports/SHEReports";
import FinanceReports from "@/components/reports/FinanceReports";

const Reports = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("traceability");

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Reports & Analytics</h1>
            <p className="text-muted-foreground">Comprehensive insights across all workflows</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-7 lg:w-auto">
            <TabsTrigger value="traceability" className="gap-2">
              <Activity className="h-4 w-4" />
              <span className="hidden md:inline">Traceability</span>
            </TabsTrigger>
            <TabsTrigger value="production" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden md:inline">Production</span>
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

          <TabsContent value="production">
            <ProductionReports />
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
      </div>
    </div>
  );
};

export default Reports;
