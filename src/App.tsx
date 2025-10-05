import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import WorkOrders from "./pages/WorkOrders";
import NewWorkOrder from "./pages/NewWorkOrder";
import WorkOrderDetail from "./pages/WorkOrderDetail";
import MaterialInwards from "./pages/MaterialInwards";
import QCIncoming from "./pages/QCIncoming";
import Quality from "./pages/Quality";
import Packing from "./pages/Packing";
import Dispatch from "./pages/Dispatch";
import DispatchQCReport from "./pages/DispatchQCReport";
import Genealogy from "./pages/Genealogy";
import Scan from "./pages/Scan";
import ScanConsole from "./pages/ScanConsole";
import Reports from "./pages/Reports";
import HourlyQC from "./pages/HourlyQC";
import ToleranceSetup from "./pages/ToleranceSetup";
import Purchase from "./pages/Purchase";
import Sales from "./pages/Sales";
import NotFound from "./pages/NotFound";
import DepartmentDetail from "./pages/DepartmentDetail";
import MaterialRequirements from "./pages/MaterialRequirements";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/scan" element={<Scan />} />
          <Route path="/scan-console" element={<ScanConsole />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/purchase" element={<Purchase />} />
          <Route path="/materials/inwards" element={<MaterialInwards />} />
          <Route path="/qc/incoming" element={<QCIncoming />} />
          <Route path="/work-orders" element={<WorkOrders />} />
          <Route path="/work-orders/new" element={<NewWorkOrder />} />
          <Route path="/work-orders/:id" element={<WorkOrderDetail />} />
          <Route path="/quality" element={<Quality />} />
          <Route path="/packing" element={<Packing />} />
          <Route path="/dispatch" element={<Dispatch />} />
          <Route path="/genealogy" element={<Genealogy />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/tolerance-setup" element={<ToleranceSetup />} />
          <Route path="/hourly-qc" element={<HourlyQC />} />
          <Route path="/dispatch-qc-report/:woId" element={<DispatchQCReport />} />
          <Route path="/department/:departmentName" element={<DepartmentDetail />} />
          <Route path="/material-requirements" element={<MaterialRequirements />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
