import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, Package, Shield, DollarSign, FileText, Activity } from "lucide-react";
import TraceabilityReports from "@/components/reports/TraceabilityReports";
import QualityReports from "@/components/reports/QualityReports";
import InventoryReports from "@/components/reports/InventoryReports";
import { NavigationHeader } from "@/components/NavigationHeader";
import PackingReports from "@/components/reports/PackingReports";
import SHEReports from "@/components/reports/SHEReports";
import FinanceReports from "@/components/reports/FinanceReports";

const Reports = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("traceability");

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader title="Reports & Analytics" subtitle="Comprehensive insights across all workflows" />
      
      <div className="max-w-7xl mx-auto p-4 md:p-8">

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
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
      </div>
    </div>
  );
};

export default Reports;
