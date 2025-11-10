import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Activity } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { MachineHealthTab } from "@/components/cnc/MachineHealthTab";
import { MachineLogsTab } from "@/components/cnc/MachineLogsTab";
import { MachineUtilizationDashboard } from "@/components/MachineUtilizationDashboard";

const CNCDashboard = () => {
  const navigate = useNavigate();

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" onClick={() => navigate('/floor-dashboard')} className="mb-2">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Floor Dashboard
          </Button>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="h-8 w-8" />
            CNC Machine Dashboard
          </h1>
          <p className="text-muted-foreground">
            Live production metrics, machine health, and maintenance tracking
          </p>
        </div>
      </div>

      {/* Tabbed Interface */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="health">Health & Maintenance</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Production Metrics & OEE</CardTitle>
            </CardHeader>
            <CardContent>
              <MachineUtilizationDashboard />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="health" className="mt-6">
          <MachineHealthTab />
        </TabsContent>

        <TabsContent value="logs" className="mt-6">
          <MachineLogsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CNCDashboard;
