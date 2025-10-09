import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { 
  FileText, Truck, Box, ClipboardCheck, Package, BarChart3, 
  DollarSign, PackageCheck, Boxes, Activity, FileSpreadsheet,
  AlertCircle, Shield, Users, QrCode, Search
} from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ActionModule {
  title: string;
  icon: React.ElementType;
  color: string;
  actions: Array<{
    label: string;
    path: string;
    icon: React.ElementType;
  }>;
}

export const QuickActionsAccordion = () => {
  const navigate = useNavigate();

  const modules: ActionModule[] = [
    {
      title: "Sales & Customers",
      icon: FileText,
      color: "text-blue-600",
      actions: [
        { label: "Sales Orders", path: "/sales", icon: FileText },
        { label: "Customers", path: "/customers", icon: Users },
        { label: "Items", path: "/items", icon: Box },
      ]
    },
    {
      title: "Procurement",
      icon: Truck,
      color: "text-purple-600",
      actions: [
        { label: "Raw PO", path: "/purchase/raw-po", icon: Truck },
        { label: "Material Requirements", path: "/material-requirements", icon: Boxes },
        { label: "Purchase Dashboard", path: "/purchase/dashboard", icon: BarChart3 },
      ]
    },
    {
      title: "Production",
      icon: Activity,
      color: "text-orange-600",
      actions: [
        { label: "Work Orders", path: "/work-orders", icon: Search },
        { label: "Production Log", path: "/production-progress", icon: BarChart3 },
        { label: "CNC Dashboard", path: "/cnc-dashboard", icon: Activity },
        { label: "Floor Dashboard", path: "/floor-dashboard", icon: Activity },
        { label: "Hourly QC", path: "/hourly-qc", icon: ClipboardCheck },
        { label: "Tolerances", path: "/tolerance-setup", icon: ClipboardCheck },
        { label: "Genealogy", path: "/genealogy", icon: BarChart3 },
      ]
    },
    {
      title: "QC & Dispatch",
      icon: ClipboardCheck,
      color: "text-green-600",
      actions: [
        { label: "QC Incoming", path: "/qc/incoming", icon: ClipboardCheck },
        { label: "QC Batch", path: "/quality", icon: ClipboardCheck },
        { label: "Packing", path: "/packing", icon: Package },
        { label: "Dispatch", path: "/dispatch", icon: Truck },
      ]
    },
    {
      title: "Finance",
      icon: DollarSign,
      color: "text-green-700",
      actions: [
        { label: "Finance Dashboard", path: "/finance/dashboard", icon: DollarSign },
        { label: "Reconciliations", path: "/reports/reconciliation", icon: AlertCircle },
        { label: "All Reports", path: "/reports", icon: FileSpreadsheet },
      ]
    },
    {
      title: "Logistics",
      icon: PackageCheck,
      color: "text-indigo-600",
      actions: [
        { label: "Goods Inwards", path: "/materials/inwards", icon: Box },
        { label: "Logistics", path: "/logistics", icon: PackageCheck },
        { label: "RPO vs Inventory", path: "/reports/rpo-inventory", icon: FileSpreadsheet },
      ]
    }
  ];

  return (
    <Accordion type="multiple" className="w-full space-y-2" defaultValue={["sales"]}>
      {modules.map((module, idx) => {
        const ModuleIcon = module.icon;
        return (
          <AccordionItem key={idx} value={module.title.toLowerCase().replace(/\s+/g, '-')} className="border rounded-lg bg-card">
            <AccordionTrigger className="px-4 hover:no-underline">
              <div className="flex items-center gap-3">
                <ModuleIcon className={`h-5 w-5 ${module.color}`} />
                <span className="font-semibold">{module.title}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-3">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mt-2">
                {module.actions.map((action, aidx) => {
                  const ActionIcon = action.icon;
                  return (
                    <Button
                      key={aidx}
                      variant="ghost"
                      className="h-auto py-3 justify-start text-left"
                      onClick={() => navigate(action.path)}
                    >
                      <ActionIcon className="h-4 w-4 mr-2 text-muted-foreground" />
                      <span className="text-sm">{action.label}</span>
                    </Button>
                  );
                })}
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
};
