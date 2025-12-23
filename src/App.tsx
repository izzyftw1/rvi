/**
 * IMPORTANT: When adding new routes, also update src/config/navigationConfig.ts
 * to make them accessible in the navigation menu!
 */
import { Toaster } from "@/components/ui/toaster";
import PartnerPerformance from "@/pages/PartnerPerformance";
import { Toaster as Sonner } from "@/components/ui/sonner";

import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { MainLayout } from "@/components/MainLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import WorkOrders from "./pages/WorkOrders";
import NewWorkOrder from "./pages/NewWorkOrder";
import WorkOrderDetail from "./pages/WorkOrderDetail";
import MaterialInwards from "./pages/MaterialInwards";
import QCIncoming from "./pages/QCIncoming";
import Quality from "./pages/Quality";
import Packing from "./pages/Packing";
import Dispatch from "./pages/Dispatch";
import Logistics from "./pages/Logistics";
import LogisticsDashboard from "./pages/LogisticsDashboard";
import Partners from "./pages/Partners";
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
import CustomerDetail from "./pages/CustomerDetail";
import CustomerReports from "./pages/CustomerReports";
import ItemMaster from "./pages/ItemMaster";
import NotFound from "./pages/NotFound";
import DepartmentDetail from "./pages/DepartmentDetail";
import MaterialRequirements from "./pages/MaterialRequirements";
import MaterialRequirementsDashboard from "./pages/MaterialRequirementsDashboard";
import StageDetailView from "./pages/StageDetailView";
import ExternalProcessingDetail from "./pages/ExternalProcessingDetail";
import Admin from "./pages/Admin";
import FactoryCalendar from "./pages/FactoryCalendar";
import ProductionProgress from "./pages/ProductionProgress";
import RawPurchaseOrders from "./pages/RawPurchaseOrders";
import SupplierLedger from "./pages/SupplierLedger";
import PurchaseSettings from "./pages/PurchaseSettings";
import MaterialProcurementDashboard from "./pages/MaterialProcurementDashboard";
import ProcurementDashboard from "./pages/ProcurementDashboard";
import InventoryProcurementControlCenter from "./pages/InventoryProcurementControlCenter";
import RPOInventoryReport from "./pages/RPOInventoryReport";
import ReconciliationReport from "./pages/ReconciliationReport";
import FinanceDashboard from "./pages/finance/FinanceDashboard";
import Invoices from "./pages/finance/Invoices";
import InvoiceDetail from "./pages/finance/InvoiceDetail";
import Payments from "./pages/finance/Payments";
import Aging from "./pages/finance/Aging";
import FinanceSettings from "./pages/finance/FinanceSettings";
import FinanceReports from "./pages/finance/FinanceReports";
import CreateInvoices from "./pages/finance/CreateInvoices";
import MachineRuntime from "./pages/reports/MachineRuntime";
import WorkerEfficiency from "./pages/reports/WorkerEfficiency";
import Cutting from "./pages/Cutting";
import Forging from "./pages/Forging";
import NCRManagement from "./pages/NCRManagement";
import NCRDetail from "./pages/NCRDetail";
import InstrumentManagement from "./pages/InstrumentManagement";
import DailyProductionLog from "./pages/DailyProductionLog";
import MachineUtilisation from "./pages/MachineUtilisation";
import OperatorEfficiency from "./pages/OperatorEfficiency";
import SetterEfficiency from "./pages/SetterEfficiency";
import CNCProgrammerActivity from "./pages/CNCProgrammerActivity";
import FinalQCList from "./pages/FinalQCList";
import FinalQC from "./pages/FinalQC";
import QualityTraceability from "./pages/QualityTraceability";
import QualityDocuments from "./pages/QualityDocuments";
import QualityAnalytics from "./pages/QualityAnalytics";
import DowntimeAnalytics from "./pages/DowntimeAnalytics";
import ExternalEfficiency from "./pages/ExternalEfficiency";


const App = () => (
  <>
    <Toaster />
    <Sonner />
    <BrowserRouter>
      <Routes>
        {/* Public routes without layout */}
        <Route path="/auth" element={<Auth />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        {/* All protected routes with MainLayout */}
        <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
          <Route path="/" element={<Index />} />
          <Route path="/scan" element={<Scan />} />
          <Route path="/scan-console" element={<ScanConsole />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/customers" element={<CustomerMaster />} />
          <Route path="/customers/:id" element={<CustomerDetail />} />
          <Route path="/customers/reports" element={<CustomerReports />} />
          <Route path="/items" element={<ItemMaster />} />
          <Route path="/purchase" element={<Purchase />} />
          <Route path="/purchase/raw-po" element={<RawPurchaseOrders />} />
          <Route path="/purchase/settings" element={<PurchaseSettings />} />
          <Route path="/purchase/dashboard" element={<MaterialProcurementDashboard />} />
          <Route path="/procurement" element={<ProcurementDashboard />} />
          <Route path="/inventory-procurement" element={<InventoryProcurementControlCenter />} />
          <Route path="/reports/rpo-inventory" element={<RPOInventoryReport />} />
          <Route path="/reports/reconciliation" element={<ReconciliationReport />} />
          <Route path="/suppliers/:id/ledger" element={<SupplierLedger />} />
          <Route path="/materials/inwards" element={<MaterialInwards />} />
          <Route path="/qc/incoming" element={<QCIncoming />} />
          <Route path="/work-orders" element={<WorkOrders />} />
          <Route path="/work-orders/new" element={<NewWorkOrder />} />
          <Route path="/work-orders/:id" element={<WorkOrderDetail />} />
          <Route path="/quality" element={<Quality />} />
          <Route path="/packing" element={<Packing />} />
          <Route path="/dispatch" element={<Dispatch />} />
          <Route path="/genealogy" element={<Genealogy />} />
          <Route path="/floor-dashboard" element={<FloorDashboard />} />
          <Route path="/machine-status" element={<MachineStatus />} />
          <Route path="/cnc-dashboard" element={<CNCDashboard />} />
          <Route path="/cutting" element={<Cutting />} />
          <Route path="/forging" element={<Forging />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/tolerance-setup" element={<ToleranceSetup />} />
          <Route path="/hourly-qc" element={<HourlyQC />} />
          <Route path="/final-qc" element={<FinalQCList />} />
          <Route path="/final-qc/:woId" element={<FinalQC />} />
          <Route path="/quality/traceability" element={<QualityTraceability />} />
          <Route path="/quality/documents" element={<QualityDocuments />} />
          <Route path="/quality/analytics" element={<QualityAnalytics />} />
          <Route path="/dispatch-qc-report/:woId" element={<DispatchQCReport />} />
          <Route path="/department/:departmentName" element={<DepartmentDetail />} />
          <Route path="/material-requirements" element={<MaterialRequirements />} />
          <Route path="/material-requirements-v2" element={<MaterialRequirementsDashboard />} />
          <Route path="/stage/:stage" element={<StageDetailView />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/factory-calendar" element={<FactoryCalendar />} />
          <Route path="/production-progress" element={<ProductionProgress />} />
          <Route path="/daily-production-log" element={<DailyProductionLog />} />
          <Route path="/machine-utilisation" element={<MachineUtilisation />} />
          <Route path="/operator-efficiency" element={<OperatorEfficiency />} />
          <Route path="/setter-efficiency" element={<SetterEfficiency />} />
          <Route path="/cnc-programmer-activity" element={<CNCProgrammerActivity />} />
          <Route path="/downtime-analytics" element={<DowntimeAnalytics />} />
          
          <Route path="/finance/dashboard" element={<FinanceDashboard />} />
          <Route path="/finance/invoices" element={<Invoices />} />
          <Route path="/finance/invoices/create" element={<CreateInvoices />} />
          <Route path="/finance/invoices/:id" element={<InvoiceDetail />} />
          <Route path="/finance/payments" element={<Payments />} />
          <Route path="/finance/aging" element={<Aging />} />
          <Route path="/finance/reports" element={<FinanceReports />} />
          <Route path="/reports/machine-runtime" element={<MachineRuntime />} />
          <Route path="/reports/worker-efficiency" element={<WorkerEfficiency />} />
          <Route path="/finance/settings" element={<FinanceSettings />} />
          <Route path="/logistics" element={<Logistics />} />
          <Route path="/logistics-dashboard" element={<LogisticsDashboard />} />
          <Route path="/partners" element={<Partners />} />
          <Route path="/partner-performance" element={<PartnerPerformance />} />
          <Route path="/external-efficiency" element={<ExternalEfficiency />} />
          <Route path="/external-processing/:processName" element={<ExternalProcessingDetail />} />
          <Route path="/ncr" element={<NCRManagement />} />
          <Route path="/ncr/:id" element={<NCRDetail />} />
          <Route path="/instruments" element={<InstrumentManagement />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </>
);

export default App;
