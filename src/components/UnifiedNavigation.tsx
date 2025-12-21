import { useState, useEffect } from "react";
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
  LogOut,
  Settings,
  Shield,
  UserCog,
  ChevronDown,
  Factory,
  Wrench,
  Calendar,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GlobalSearch } from "./GlobalSearch";
import { supabase } from "@/integrations/supabase/client";
import { useSiteContext } from "@/hooks/useSiteContext";
import rvLogo from "@/assets/rv-logo.jpg";

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
}

interface NavGroup {
  title: string;
  icon: React.ElementType;
  allowedRoles: string[];
  items: NavItem[];
}

interface UnifiedNavigationProps {
  userRoles: string[];
}

export const UnifiedNavigation = ({ userRoles }: UnifiedNavigationProps) => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hoveredMenu, setHoveredMenu] = useState<string | null>(null);
  const { currentSite, setCurrentSite, availableSites, loading: sitesLoading } = useSiteContext();

  const isAdmin = userRoles.includes('admin') || userRoles.includes('super_admin');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (data) {
        setProfile(data);
      }
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
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
      title: "Quality",
      icon: ClipboardCheck,
      allowedRoles: ['admin', 'production', 'quality'],
      items: [
        { label: "Quality Dashboard", path: "/quality", icon: ClipboardCheck },
        { label: "Incoming QC", path: "/qc/incoming", icon: ClipboardCheck },
        { label: "First Piece QC", path: "/hourly-qc", icon: ClipboardCheck },
        { label: "In-Process / Hourly QC", path: "/hourly-qc", icon: ClipboardCheck },
        { label: "Final Inspection", path: "/quality", icon: ClipboardCheck },
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

  const getVisibleGroups = () => {
    if (isAdmin) return navGroups;
    
    const visibleGroups = navGroups.filter(group =>
      group.allowedRoles.some(role => userRoles.includes(role))
    );

    if (visibleGroups.length === 0) {
      return navGroups.filter(g =>
        g.title === "Sales & Customers" || g.title === "Production"
      );
    }

    return visibleGroups;
  };

  const visibleGroups = getVisibleGroups();

  const handleNavigate = (path: string) => {
    navigate(path);
    setMobileMenuOpen(false);
    setHoveredMenu(null);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <header className="sticky top-0 z-50 bg-background border-b shadow-sm">
      <div className="w-full px-3 sm:px-4">
        <div className="flex items-center justify-between h-14 sm:h-16 gap-2 sm:gap-4">
          {/* Left: Logo + Mobile Menu */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* Mobile Menu Toggle */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild className="lg:hidden">
                <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 p-0">
                <SheetHeader className="px-4 py-4 border-b">
                  <SheetTitle>Navigation Menu</SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-[calc(100vh-70px)]">
                  <div className="px-4 py-3 space-y-4">
                    {/* Mobile: Global Search */}
                    <GlobalSearch />

                    <Separator />

                    {/* Mobile: Site Selector */}
                    {!sitesLoading && availableSites.length > 0 && (
                      <>
                        <div className="flex items-center gap-2">
                          <Factory className="h-4 w-4 text-muted-foreground" />
                          <Select
                            value={currentSite?.id || ""}
                            onValueChange={(value) => {
                              const site = availableSites.find(s => s.id === value);
                              if (site) setCurrentSite(site);
                            }}
                          >
                            <SelectTrigger className="w-full h-9">
                              <SelectValue placeholder="Select site" />
                            </SelectTrigger>
                            <SelectContent className="z-[100]">
                              {availableSites.map((site) => (
                                <SelectItem key={site.id} value={site.id}>
                                  {site.name} ({site.code})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Separator />
                      </>
                    )}

                    {/* Mobile: Navigation Groups */}
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
                                  onClick={() => handleNavigate(item.path)}
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

                    {/* Mobile: Admin Menu */}
                    {isAdmin && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground px-2">
                          <Shield className="h-4 w-4" />
                          Admin
                        </div>
                        <div className="space-y-1">
                          <button
                            onClick={() => handleNavigate("/admin")}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-primary hover:text-primary-foreground transition-colors text-left"
                          >
                            <Users className="h-4 w-4" />
                            Users
                          </button>
                          <button
                            onClick={() => handleNavigate("/admin")}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-primary hover:text-primary-foreground transition-colors text-left"
                          >
                            <UserCog className="h-4 w-4" />
                            Roles & Permissions
                          </button>
                          <div className="px-2 py-1 text-xs text-muted-foreground">Factory Tools</div>
                          <button
                            onClick={() => handleNavigate("/maintenance")}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-primary hover:text-primary-foreground transition-colors text-left"
                          >
                            <Wrench className="h-4 w-4" />
                            Maintenance
                          </button>
                          <button
                            onClick={() => handleNavigate("/factory-calendar")}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-primary hover:text-primary-foreground transition-colors text-left"
                          >
                            <Calendar className="h-4 w-4" />
                            Factory Calendar
                          </button>
                          <button
                            onClick={() => handleNavigate("/admin")}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-primary hover:text-primary-foreground transition-colors text-left"
                          >
                            <Settings className="h-4 w-4" />
                            Settings
                          </button>
                        </div>
                        <Separator />
                      </div>
                    )}

                    {/* Mobile: User Info & Logout */}
                    <div className="space-y-2 pt-2">
                      <div className="px-2 py-2 bg-muted rounded-md">
                        <p className="text-sm font-medium">{profile?.full_name || 'User'}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {profile?.role?.replace('_', ' ') || 'Role'}
                        </p>
                      </div>
                      <Button
                        onClick={handleLogout}
                        variant="destructive"
                        className="w-full gap-2"
                      >
                        <LogOut className="h-4 w-4" />
                        Logout
                      </Button>
                    </div>
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>

            {/* Logo */}
            <div 
              className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" 
              onClick={() => navigate("/")}
            >
              <img 
                src={rvLogo} 
                alt="RV Industries" 
                className="h-8 sm:h-10 object-contain"
              />
              <div className="hidden md:block">
                <h1 className="text-sm sm:text-base font-bold leading-tight">R.V. Industries</h1>
                <p className="text-[10px] text-muted-foreground hidden sm:block">Manufacturing Control Center</p>
              </div>
            </div>
          </div>

          {/* Center: Desktop Navigation Menus - Compact */}
          <nav className="hidden lg:flex items-center gap-1 overflow-x-auto scrollbar-hide">
            {visibleGroups.map((group) => {
              const GroupIcon = group.icon;
              return (
                <DropdownMenu key={group.title}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="gap-1.5 h-9 px-2.5 hover:bg-muted flex-shrink-0 text-xs"
                      onMouseEnter={() => setHoveredMenu(group.title)}
                    >
                      <GroupIcon className="h-3.5 w-3.5" />
                      <span className="hidden xl:inline">{group.title}</span>
                      <ChevronDown className="h-3 w-3 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent 
                    align="start" 
                    className="w-56 bg-popover shadow-lg border z-[100]"
                    onMouseLeave={() => setHoveredMenu(null)}
                  >
                    {group.items.map((item) => {
                      const ItemIcon = item.icon;
                      return (
                        <DropdownMenuItem
                          key={item.path}
                          onClick={() => handleNavigate(item.path)}
                          className="gap-3 cursor-pointer"
                        >
                          <ItemIcon className="h-4 w-4" />
                          {item.label}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })}

            {/* Admin Menu */}
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="gap-1.5 h-9 px-2.5 hover:bg-muted flex-shrink-0 text-xs"
                  >
                    <Shield className="h-3.5 w-3.5" />
                    <span className="hidden xl:inline">Admin</span>
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 bg-popover shadow-lg border z-[100]">
                  <DropdownMenuItem onClick={() => handleNavigate("/admin")} className="gap-3">
                    <Users className="h-4 w-4" />
                    Users
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleNavigate("/admin")} className="gap-3">
                    <UserCog className="h-4 w-4" />
                    Roles & Permissions
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Factory Tools</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => handleNavigate("/maintenance")} className="gap-3">
                    <Wrench className="h-4 w-4" />
                    Maintenance
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleNavigate("/factory-calendar")} className="gap-3">
                    <Calendar className="h-4 w-4" />
                    Factory Calendar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleNavigate("/admin")} className="gap-3">
                    <Settings className="h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </nav>

          {/* Right: Search, Site Selector (compact), User Menu */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0">
            {/* Global Search - Desktop */}
            <div className="hidden lg:block">
              <GlobalSearch />
            </div>

            {/* Site Selector - Compact for Desktop */}
            {!sitesLoading && availableSites.length > 0 && (
              <div className="hidden lg:block">
                <Select
                  value={currentSite?.id || ""}
                  onValueChange={(value) => {
                    const site = availableSites.find(s => s.id === value);
                    if (site) setCurrentSite(site);
                  }}
                >
                  <SelectTrigger className="w-[140px] h-9 text-xs">
                    <Factory className="h-3.5 w-3.5 mr-1.5" />
                    <SelectValue placeholder="Site" />
                  </SelectTrigger>
                  <SelectContent className="z-[100]">
                    {availableSites.map((site) => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* User Avatar Menu - Desktop */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild className="hidden lg:flex flex-shrink-0">
                <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {profile?.full_name ? getInitials(profile.full_name) : 'U'}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-popover shadow-lg border z-[100]">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{profile?.full_name || 'User'}</p>
                    <p className="text-xs leading-none text-muted-foreground capitalize">
                      {profile?.role?.replace('_', ' ') || 'Role'}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="gap-2 text-destructive focus:text-destructive cursor-pointer">
                  <LogOut className="h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
};