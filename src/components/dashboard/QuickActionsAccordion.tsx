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
  allowedRoles: string[]; // roles that can see this module
}

interface QuickActionsAccordionProps {
  userRoles: string[];
}

export const QuickActionsAccordion = ({ userRoles }: QuickActionsAccordionProps) => {
  const navigate = useNavigate();

  const modules: ActionModule[] = [
    {
      title: "Sales & Customers",
      icon: FileText,
      color: "text-blue-600",
      allowedRoles: ['admin', 'sales'],
      actions: [
        { label: "Sales Orders", path: "/sales-orders", icon: FileText },
        { label: "Customers", path: "/customers", icon: Users },
        { label: "Items", path: "/items", icon: Box },
      ]
    },
    {
      title: "Procurement",
      icon: Truck,
      color: "text-purple-600",
      allowedRoles: ['admin', 'procurement'],
      actions: [
        { label: "Raw PO", path: "/raw-po", icon: Truck },
        { label: "Material Requirements", path: "/material-requirements", icon: Boxes },
        { label: "Purchase Dashboard", path: "/purchase-dashboard", icon: BarChart3 },
      ]
    },
    {
      title: "Production",
      icon: Activity,
      color: "text-orange-600",
      allowedRoles: ['admin', 'production'],
      actions: [
        { label: "Work Orders", path: "/work-orders", icon: Search },
        { label: "Production Log", path: "/production-log", icon: BarChart3 },
        { label: "CNC Dashboard", path: "/cnc-dashboard", icon: Activity },
        { label: "Floor Dashboard", path: "/floor-dashboard", icon: Activity },
        { label: "Hourly QC", path: "/hourly-qc", icon: ClipboardCheck },
        { label: "Tolerances", path: "/tolerances", icon: ClipboardCheck },
        { label: "Genealogy", path: "/genealogy", icon: BarChart3 },
      ]
    },
    {
      title: "QC & Dispatch",
      icon: ClipboardCheck,
      color: "text-green-600",
      allowedRoles: ['admin', 'production', 'quality'],
      actions: [
        { label: "QC Incoming", path: "/qc-incoming", icon: ClipboardCheck },
        { label: "QC Batch", path: "/qc-batch", icon: ClipboardCheck },
        { label: "Packing", path: "/packing", icon: Package },
        { label: "Dispatch", path: "/dispatch", icon: Truck },
      ]
    },
    {
      title: "Finance",
      icon: DollarSign,
      color: "text-green-700",
      allowedRoles: ['admin', 'finance', 'sales'],
      actions: [
        { label: "Finance Dashboard", path: "/finance-dashboard", icon: DollarSign },
        { label: "Reconciliations", path: "/reconciliations", icon: AlertCircle },
        { label: "All Reports", path: "/reports", icon: FileSpreadsheet },
      ]
    },
    {
      title: "Logistics",
      icon: PackageCheck,
      color: "text-indigo-600",
      allowedRoles: ['admin', 'production', 'procurement', 'logistics'],
      actions: [
        { label: "Goods Inwards", path: "/goods-inwards", icon: Box },
        { label: "Logistics", path: "/logistics", icon: PackageCheck },
        { label: "RPO vs Inventory", path: "/rpo-vs-inventory", icon: FileSpreadsheet },
      ]
    }
  ];

  // Determine which modules to show based on user roles
  const getVisibleModules = () => {
    // Admin sees everything
    if (userRoles.includes('admin')) {
      return modules;
    }

    // Filter modules based on role permissions
    const visibleModules = modules.filter(module => 
      module.allowedRoles.some(role => userRoles.includes(role))
    );

    // If user has no matching roles, show default modules (Sales & Production)
    if (visibleModules.length === 0) {
      return modules.filter(m => 
        m.title === "Sales & Customers" || m.title === "Production"
      );
    }

    return visibleModules;
  };

  const visibleModules = getVisibleModules();

  return (
    <Accordion type="multiple" className="w-full space-y-2" defaultValue={["sales"]}>
      {visibleModules.map((module, idx) => {
        const ModuleIcon = module.icon;
        return (
          <AccordionItem key={idx} value={module.title.toLowerCase().replace(/\s+/g, '-')} className="border rounded-lg bg-muted/30">
            <AccordionTrigger className="px-4 hover:no-underline">
              <div className="flex items-center gap-3">
                <ModuleIcon className="h-5 w-5 text-primary" />
                <span className="font-semibold text-foreground">{module.title}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                {module.actions.map((action, aidx) => {
                  const ActionIcon = action.icon;
                  return (
                    <Button
                      key={aidx}
                      variant="outline"
                      className="h-auto py-3 justify-start text-left border-border hover:border-primary transition-colors"
                      onClick={() => navigate(action.path)}
                    >
                      <ActionIcon className="h-5 w-5 mr-3 text-muted-foreground" />
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
