import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Scan from "./pages/Scan";
import MaterialInwards from "./pages/MaterialInwards";
import WorkOrders from "./pages/WorkOrders";
import NewWorkOrder from "./pages/NewWorkOrder";
import WorkOrderDetail from "./pages/WorkOrderDetail";
import Quality from "./pages/Quality";
import Packing from "./pages/Packing";
import NotFound from "./pages/NotFound";

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
          <Route path="/materials/inwards" element={<MaterialInwards />} />
          <Route path="/work-orders" element={<WorkOrders />} />
          <Route path="/work-orders/new" element={<NewWorkOrder />} />
          <Route path="/work-orders/:id" element={<WorkOrderDetail />} />
          <Route path="/quality" element={<Quality />} />
          <Route path="/packing" element={<Packing />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
