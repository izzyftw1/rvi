import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Truck,
  Activity,
  ClipboardCheck,
  DollarSign,
  PackageCheck,
  Users,
  Box,
  Boxes,
  BarChart3,
  Search,
  Package,
  AlertCircle,
  FileSpreadsheet,
  Handshake,
  Menu,
  X
} from "lucide-react";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface NavGroup {
  title: string;
  icon: React.ElementType;
  allowedRoles: string[];
  items: Array<{
    label: string;
    path: string;
    icon: React.ElementType;
  }>;
}

interface NavigationBarProps {
  userRoles: string[];
}

export const NavigationBar = ({ userRoles }: NavigationBarProps) => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Route validation mapping - logs corrections
  const validateAndCorrectRoute = (path: string, label: string): string => {
    const routeMap: Record<string, string> = {
      // Sales & Customers - all valid
      "/sales": "/sales",
      "/customers": "/customers", 
      "/items": "/items",
      
      // Procurement - all valid
      "/purchase/raw-po": "/purchase/raw-po",
      "/material-requirements": "/material-requirements",
      "/purchase/dashboard": "/purchase/dashboard",
      
      // Production - corrected paths
      "/work-orders": "/work-orders",
      "/production-progress": "/production-progress",
      "/cnc-dashboard": "/cnc-dashboard",
      "/floor-dashboard": "/floor-dashboard",
      "/hourly-qc": "/hourly-qc",
      "/tolerance-setup": "/tolerance-setup",
      "/genealogy": "/genealogy",
      
      // QC & Dispatch - corrected paths
      "/qc/incoming": "/qc/incoming",
      "/quality": "/quality",
      "/packing": "/packing",
      "/dispatch": "/dispatch",
      
      // Finance - corrected paths
      "/finance/dashboard": "/finance/dashboard",
      "/reports/reconciliation": "/reports/reconciliation",
      "/finance/reports": "/finance/reports",
      
      // Logistics - corrected paths
      "/materials/inwards": "/materials/inwards",
      "/logistics": "/logistics",
      "/reports/rpo-inventory": "/reports/rpo-inventory",
      
      // External - corrected paths
      "/partners": "/partners",
      "/partner-performance": "/partner-performance"
    };

    const correctedPath = routeMap[path];
    if (correctedPath && correctedPath !== path) {
      console.log(`[Navigation] Route corrected: "${label}" - ${path} → ${correctedPath}`);
    } else if (!correctedPath) {
      console.warn(`[Navigation] Route not found: "${label}" - ${path}. Using fallback.`);
      // Try to extract parent route
      const parentPath = path.split('/').slice(0, -1).join('/') || '/';
      return parentPath;
    }
    return correctedPath || path;
  };

  const navGroups: NavGroup[] = [
    {
      title: "Sales & Customers",
      icon: FileText,
      allowedRoles: ['admin', 'sales'],
      items: [
        { label: "Sales Orders", path: "/sales", icon: FileText },
        { label: "Customers", path: "/customers", icon: Users },
        { label: "Items", path: "/items", icon: Box },
      ]
    },
    {
      title: "Procurement",
      icon: Truck,
      allowedRoles: ['admin', 'procurement', 'purchase'],
      items: [
        { label: "Raw PO", path: "/purchase/raw-po", icon: Truck },
        { label: "Material Requirements", path: "/material-requirements", icon: Boxes },
        { label: "Purchase Dashboard", path: "/purchase/dashboard", icon: BarChart3 },
      ]
    },
    {
      title: "Production",
      icon: Activity,
      allowedRoles: ['admin', 'production', 'ops_manager'],
      items: [
        { label: "Work Orders", path: "/work-orders", icon: Search },
        { label: "Production Log", path: "/production-progress", icon: BarChart3},
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
      allowedRoles: ['admin', 'production', 'quality', 'packing'],
      items: [
        { label: "QC Incoming", path: "/qc/incoming", icon: ClipboardCheck },
        { label: "QC Batch", path: "/quality", icon: ClipboardCheck },
        { label: "Packing", path: "/packing", icon: Package },
        { label: "Dispatch", path: "/dispatch", icon: Truck },
      ]
    },
    {
      title: "Finance",
      icon: DollarSign,
      allowedRoles: ['admin', 'finance', 'finance_admin', 'finance_user', 'accounts', 'sales'],
      items: [
        { label: "Finance Dashboard", path: "/finance/dashboard", icon: DollarSign },
        { label: "Reconciliations", path: "/reports/reconciliation", icon: AlertCircle },
        { label: "All Reports", path: "/finance/reports", icon: FileSpreadsheet },
      ]
    },
    {
      title: "Logistics",
      icon: PackageCheck,
      allowedRoles: ['admin', 'production', 'procurement', 'logistics', 'stores'],
      items: [
        { label: "Goods Inwards", path: "/materials/inwards", icon: Box },
        { label: "Logistics Dashboard", path: "/logistics", icon: PackageCheck },
        { label: "RPO vs Inventory", path: "/reports/rpo-inventory", icon: FileSpreadsheet },
      ]
    },
    {
      title: "External Processes",
      icon: Handshake,
      allowedRoles: ['admin', 'production', 'logistics', 'ops_manager'],
      items: [
        { label: "External Partners", path: "/partners", icon: Handshake },
        { label: "External Moves", path: "/logistics", icon: Truck },
        { label: "Partner Performance", path: "/partner-performance", icon: PackageCheck },
      ]
    }
  ];

  // Filter nav groups based on user roles
  const getVisibleGroups = () => {
    if (userRoles.includes('admin') || userRoles.includes('super_admin')) {
      return navGroups;
    }

    const visibleGroups = navGroups.filter(group =>
      group.allowedRoles.some(role => userRoles.includes(role))
    );

    // Default for users with no matching roles
    if (visibleGroups.length === 0) {
      return navGroups.filter(g =>
        g.title === "Sales & Customers" || g.title === "Production"
      );
    }

    return visibleGroups;
  };

  const visibleGroups = getVisibleGroups();

  const handleNavigate = (path: string, label: string) => {
    const validatedPath = validateAndCorrectRoute(path, label);
    navigate(validatedPath);
    setMobileMenuOpen(false);
  };

  return (
    <>
      {/* Desktop Navigation */}
      <div className="hidden lg:block border-b bg-card">
        <div className="container mx-auto px-4">
          <NavigationMenu className="max-w-full justify-start">
            <NavigationMenuList className="flex-wrap h-12">
              {visibleGroups.map((group) => {
                const GroupIcon = group.icon;
                return (
                  <NavigationMenuItem key={group.title}>
                    <NavigationMenuTrigger className="h-12 gap-2 hover:bg-muted">
                      <GroupIcon className="h-4 w-4" />
                      {group.title}
                    </NavigationMenuTrigger>
                    <NavigationMenuContent className="z-50">
                      <ul className="grid w-56 gap-1 p-2 bg-card">
                        {group.items.map((item) => {
                          const ItemIcon = item.icon;
                          return (
                            <li key={item.path}>
                              <button
                                onClick={() => handleNavigate(item.path, item.label)}
                                className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-primary hover:text-primary-foreground transition-colors text-left"
                              >
                                <ItemIcon className="h-4 w-4" />
                                {item.label}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </NavigationMenuContent>
                  </NavigationMenuItem>
                );
              })}
            </NavigationMenuList>
          </NavigationMenu>
        </div>
      </div>

      {/* Mobile Navigation */}
      <div className="lg:hidden border-b bg-card">
        <div className="container mx-auto px-4 h-12 flex items-center">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <Menu className="h-5 w-5" />
                <span>Menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-0">
              <SheetHeader className="px-4 py-3 border-b">
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <ScrollArea className="h-[calc(100vh-60px)]">
                <div className="px-4 py-2 space-y-4">
                  {visibleGroups.map((group) => {
                    const GroupIcon = group.icon;
                    return (
                      <div key={group.title} className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground px-2">
                          <GroupIcon className="h-4 w-4" />
                          {group.title}
                        </div>
                        <div className="space-y-1">
                          {group.items.map((item) => {
                            const ItemIcon = item.icon;
                            return (
                              <button
                                key={item.path}
                                onClick={() => handleNavigate(item.path, item.label)}
                                className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-primary hover:text-primary-foreground transition-colors text-left"
                              >
                                <ItemIcon className="h-4 w-4" />
                                {item.label}
                              </button>
                            );
                          })}
                        </div>
                        <Separator />
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </>
  );
};
