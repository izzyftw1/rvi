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
  const [openDesktopMenu, setOpenDesktopMenu] = useState<string | null>(null);
  const closeTimeoutRef = useState<NodeJS.Timeout | null>(null)[0];

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
      
      // Production - execution & scheduling only
      "/work-orders": "/work-orders",
      "/production-progress": "/production-progress",
      "/cnc-dashboard": "/cnc-dashboard",
      "/floor-dashboard": "/floor-dashboard",
      
      // Quality - inspection, approval, tolerances, compliance
      "/qc/incoming": "/qc/incoming",
      "/quality": "/quality",
      "/hourly-qc": "/hourly-qc",
      "/tolerance-setup": "/tolerance-setup",
      "/dispatch-qc-report": "/dispatch-qc-report",
      "/instrument-management": "/instrument-management",
      
      // Logistics - packing, dispatch, goods inwards
      "/packing": "/packing",
      "/dispatch": "/dispatch",
      "/materials/inwards": "/materials/inwards",
      "/logistics": "/logistics",
      "/reports/rpo-inventory": "/reports/rpo-inventory",
      
      // Finance - corrected paths
      "/finance/dashboard": "/finance/dashboard",
      "/reports/reconciliation": "/reports/reconciliation",
      "/finance/reports": "/finance/reports",
      
      // External - corrected paths
      "/partners": "/partners",
      "/partner-performance": "/partner-performance",
      
      // Admin
      "/admin": "/admin",
      "/factory-calendar": "/factory-calendar"
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
        { label: "Production Log", path: "/production-progress", icon: BarChart3 },
        { label: "Floor Dashboard", path: "/floor-dashboard", icon: Activity },
        { label: "CNC Dashboard", path: "/cnc-dashboard", icon: Activity },
      ]
    },
    {
      title: "Quality",
      icon: ClipboardCheck,
      allowedRoles: ['admin', 'production', 'quality'],
      items: [
        { label: "Material QC", path: "/qc/incoming", icon: ClipboardCheck },
        { label: "First Piece QC", path: "/quality", icon: ClipboardCheck },
        { label: "Hourly QC", path: "/hourly-qc", icon: ClipboardCheck },
        { label: "Final QC & Dispatch", path: "/dispatch-qc-report", icon: ClipboardCheck },
        { label: "Tolerances", path: "/tolerance-setup", icon: ClipboardCheck },
        { label: "Instrument Management", path: "/instrument-management", icon: ClipboardCheck },
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
      allowedRoles: ['admin', 'production', 'procurement', 'logistics', 'stores', 'packing'],
      items: [
        { label: "Goods Inwards", path: "/materials/inwards", icon: Box },
        { label: "Logistics Dashboard", path: "/logistics", icon: PackageCheck },
        { label: "Packing", path: "/packing", icon: Package },
        { label: "Dispatch", path: "/dispatch", icon: Truck },
        { label: "RPO vs Inventory", path: "/reports/rpo-inventory", icon: FileSpreadsheet },
      ]
    },
    {
      title: "Admin",
      icon: AlertCircle,
      allowedRoles: ['admin'],
      items: [
        { label: "User Management", path: "/admin", icon: Users },
        { label: "Site Settings", path: "/admin", icon: Box },
        { label: "Factory Calendar", path: "/factory-calendar", icon: FileText },
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
    setOpenDesktopMenu(null);
  };

  const handleMenuOpen = (menuTitle: string) => {
    if (closeTimeoutRef) {
      clearTimeout(closeTimeoutRef);
    }
    setOpenDesktopMenu(menuTitle);
  };

  const handleMenuClose = () => {
    const timeout = setTimeout(() => {
      setOpenDesktopMenu(null);
    }, 150);
    if (closeTimeoutRef !== null) {
      clearTimeout(closeTimeoutRef);
    }
  };

  const toggleMenu = (menuTitle: string) => {
    setOpenDesktopMenu(prev => prev === menuTitle ? null : menuTitle);
  };

  return (
    <>
      {/* Desktop Navigation */}
      <div className="hidden lg:block border-t bg-card">
        <div className="container mx-auto px-4">
          <NavigationMenu 
            className="max-w-full justify-start"
            onValueChange={(value) => {
              if (!value) handleMenuClose();
            }}
          >
            <NavigationMenuList className="flex-wrap h-12">
              {visibleGroups.map((group) => {
                const GroupIcon = group.icon;
                const isOpen = openDesktopMenu === group.title;
                return (
                  <NavigationMenuItem 
                    key={group.title}
                    value={group.title}
                    onMouseEnter={() => handleMenuOpen(group.title)}
                    onMouseLeave={handleMenuClose}
                  >
                    <NavigationMenuTrigger 
                      className="h-12 gap-2 hover:bg-muted transition-all duration-200"
                      onClick={() => toggleMenu(group.title)}
                    >
                      <GroupIcon className="h-4 w-4" />
                      {group.title}
                    </NavigationMenuTrigger>
                    <NavigationMenuContent 
                      className="z-50"
                      onMouseEnter={() => handleMenuOpen(group.title)}
                      onMouseLeave={handleMenuClose}
                    >
                      <ul className="grid w-56 gap-1 p-2 bg-card">
                        {group.items.map((item) => {
                          const ItemIcon = item.icon;
                          return (
                            <li key={item.path}>
                              <button
                                onClick={() => handleNavigate(item.path, item.label)}
                                className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-primary hover:text-primary-foreground transition-all duration-150 text-left"
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
      <div className="lg:hidden border-t bg-card">
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
