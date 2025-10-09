import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";

import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
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
import FloorDashboard from "./pages/FloorDashboard";
import MachineStatus from "./pages/MachineStatus";
import CNCDashboard from "./pages/CNCDashboard";
import Scan from "./pages/Scan";
import ScanConsole from "./pages/ScanConsole";
import Reports from "./pages/Reports";
import HourlyQC from "./pages/HourlyQC";
import ToleranceSetup from "./pages/ToleranceSetup";
import Purchase from "./pages/Purchase";
import Sales from "./pages/Sales";
import CustomerMaster from "./pages/CustomerMaster";
import ItemMaster from "./pages/ItemMaster";
import NotFound from "./pages/NotFound";
import DepartmentDetail from "./pages/DepartmentDetail";
import MaterialRequirements from "./pages/MaterialRequirements";
import StageDetailView from "./pages/StageDetailView";
import Maintenance from "./pages/Maintenance";
import Admin from "./pages/Admin";
import FactoryCalendar from "./pages/FactoryCalendar";
import ProductionProgress from "./pages/ProductionProgress";
import RawPurchaseOrders from "./pages/RawPurchaseOrders";


const App = () => (
  <>
    <Toaster />
    <Sonner />
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/scan" element={<ProtectedRoute><Scan /></ProtectedRoute>} />
        <Route path="/scan-console" element={<ProtectedRoute><ScanConsole /></ProtectedRoute>} />
        <Route path="/sales" element={<ProtectedRoute><Sales /></ProtectedRoute>} />
        <Route path="/customers" element={<ProtectedRoute><CustomerMaster /></ProtectedRoute>} />
        <Route path="/items" element={<ProtectedRoute><ItemMaster /></ProtectedRoute>} />
        <Route path="/purchase" element={<ProtectedRoute><Purchase /></ProtectedRoute>} />
        <Route path="/purchase/raw-po" element={<ProtectedRoute><RawPurchaseOrders /></ProtectedRoute>} />
        <Route path="/materials/inwards" element={<ProtectedRoute><MaterialInwards /></ProtectedRoute>} />
        <Route path="/qc/incoming" element={<ProtectedRoute><QCIncoming /></ProtectedRoute>} />
        <Route path="/work-orders" element={<ProtectedRoute><WorkOrders /></ProtectedRoute>} />
        <Route path="/work-orders/new" element={<ProtectedRoute><NewWorkOrder /></ProtectedRoute>} />
        <Route path="/work-orders/:id" element={<ProtectedRoute><WorkOrderDetail /></ProtectedRoute>} />
        <Route path="/quality" element={<ProtectedRoute><Quality /></ProtectedRoute>} />
        <Route path="/packing" element={<ProtectedRoute><Packing /></ProtectedRoute>} />
        <Route path="/dispatch" element={<ProtectedRoute><Dispatch /></ProtectedRoute>} />
          <Route path="/genealogy" element={<ProtectedRoute><Genealogy /></ProtectedRoute>} />
          <Route path="/floor-dashboard" element={<ProtectedRoute><FloorDashboard /></ProtectedRoute>} />
          <Route path="/machine-status" element={<ProtectedRoute><MachineStatus /></ProtectedRoute>} />
          <Route path="/cnc-dashboard" element={<ProtectedRoute><CNCDashboard /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
        <Route path="/tolerance-setup" element={<ProtectedRoute><ToleranceSetup /></ProtectedRoute>} />
        <Route path="/hourly-qc" element={<ProtectedRoute><HourlyQC /></ProtectedRoute>} />
        <Route path="/dispatch-qc-report/:woId" element={<ProtectedRoute><DispatchQCReport /></ProtectedRoute>} />
        <Route path="/department/:departmentName" element={<ProtectedRoute><DepartmentDetail /></ProtectedRoute>} />
        <Route path="/material-requirements" element={<ProtectedRoute><MaterialRequirements /></ProtectedRoute>} />
        <Route path="/stage/:stage" element={<ProtectedRoute><StageDetailView /></ProtectedRoute>} />
        <Route path="/maintenance" element={<ProtectedRoute><Maintenance /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
        <Route path="/factory-calendar" element={<ProtectedRoute><FactoryCalendar /></ProtectedRoute>} />
        <Route path="/production-progress" element={<ProtectedRoute><ProductionProgress /></ProtectedRoute>} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </>
);

export default App;
