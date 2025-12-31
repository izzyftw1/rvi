import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Menu,
  LogOut,
  Shield,
  ChevronDown,
  Factory,
  Calendar,
  MoreHorizontal,
  Users,
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
import { useDepartmentPermissions } from "@/hooks/useDepartmentPermissions";
import { cn } from "@/lib/utils";
import rvLogo from "@/assets/rv-logo.jpg";
import { getActiveNavigationGroups, type NavGroup } from "@/config/navigationConfig";

interface UnifiedNavigationProps {
  userRoles: string[];
}

export const UnifiedNavigation = ({ userRoles }: UnifiedNavigationProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState<any>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hoveredMenu, setHoveredMenu] = useState<string | null>(null);
  const { currentSite, setCurrentSite, availableSites, loading: sitesLoading } = useSiteContext();
  const { isBypassUser, canViewPage, loading: permissionsLoading } = useDepartmentPermissions();
  
  const navContainerRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState<number>(10);

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

  // Use centralized navigation config - filters out deprecated pages automatically
  const navGroups = getActiveNavigationGroups();

  // Filter navigation based on department permissions
  const visibleGroups = useMemo(() => {
    if (permissionsLoading) return [];
    
    // Admin/Finance bypass - show all groups
    if (isBypassUser) return navGroups;
    
    // Filter groups to only show items user has permission to view
    return navGroups
      .map(group => ({
        ...group,
        items: group.items.filter(item => canViewPage(item.pageKey))
      }))
      .filter(group => group.items.length > 0);
  }, [navGroups, isBypassUser, canViewPage, permissionsLoading]);
  
  // Calculate how many items can fit in the nav container
  const calculateVisibleItems = useCallback(() => {
    if (!navContainerRef.current) return;
    
    const containerWidth = navContainerRef.current.offsetWidth;
    // Approximate width per nav item (button with icon + text + chevron + gap)
    // On XL screens: ~140px per item, on smaller: ~80px (icon only)
    const isXL = window.innerWidth >= 1280;
    const itemWidth = isXL ? 140 : 85;
    const moreButtonWidth = 85; // Width for "More" button
    const adminButtonWidth = isXL ? 100 : 85; // Width for admin button
    
    const availableWidth = containerWidth - (isAdmin ? adminButtonWidth : 0) - moreButtonWidth - 20;
    const count = Math.max(1, Math.floor(availableWidth / itemWidth));
    
    setVisibleCount(count);
  }, [isAdmin]);
  
  useEffect(() => {
    calculateVisibleItems();
    
    const handleResize = () => {
      calculateVisibleItems();
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [calculateVisibleItems, visibleGroups.length]);

  // Split navigation into visible and overflow
  const primaryGroups = visibleGroups.slice(0, visibleCount);
  const overflowGroups = visibleGroups.slice(visibleCount);
  const hasOverflow = overflowGroups.length > 0;

  // Check if a group contains the current active route
  const isGroupActive = (group: NavGroup) => {
    const currentPath = location.pathname;
    return group.items.some(item => {
      // Exact match or starts with the path (for nested routes)
      if (item.path === currentPath) return true;
      if (item.path !== '/' && currentPath.startsWith(item.path)) return true;
      return false;
    });
  };
  
  // Check if overflow contains active route
  const isOverflowActive = () => {
    return overflowGroups.some(group => isGroupActive(group));
  };

  // Check if a specific nav item is active
  const isItemActive = (path: string) => {
    const currentPath = location.pathname;
    if (path === currentPath) return true;
    if (path !== '/' && currentPath.startsWith(path)) return true;
    return false;
  };

  // Check if admin section is active
  const isAdminActive = () => {
    const adminPaths = ['/admin', '/factory-calendar'];
    return adminPaths.some(p => location.pathname.startsWith(p));
  };

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
                              const isActive = isItemActive(item.path);
                              return (
                                <button
                                  key={item.path}
                                  onClick={() => handleNavigate(item.path)}
                                  className={cn(
                                    "w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors text-left",
                                    isActive 
                                      ? "bg-primary text-primary-foreground font-medium"
                                      : "hover:bg-muted"
                                  )}
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

                    {/* Mobile: Admin Menu - matches desktop Admin menu */}
                    {isAdmin && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground px-2">
                          <Shield className="h-4 w-4" />
                          Admin
                        </div>
                        <div className="space-y-1">
                          <button
                            onClick={() => handleNavigate("/admin")}
                            className={cn(
                              "w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors text-left",
                              location.pathname === '/admin'
                                ? "bg-primary text-primary-foreground font-medium"
                                : "hover:bg-muted"
                            )}
                          >
                            <Users className="h-4 w-4" />
                            Admin Panel
                          </button>
                          <div className="px-2 py-1 text-xs text-muted-foreground">Factory Tools</div>
                          <button
                            onClick={() => handleNavigate("/factory-calendar")}
                            className={cn(
                              "w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors text-left",
                              location.pathname === '/factory-calendar'
                                ? "bg-primary text-primary-foreground font-medium"
                                : "hover:bg-muted"
                            )}
                          >
                            <Calendar className="h-4 w-4" />
                            Factory Calendar
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

          {/* Center: Desktop Navigation Menus - Responsive with overflow */}
          <nav ref={navContainerRef} className="hidden lg:flex items-center gap-1 flex-1 min-w-0">
            {/* Primary visible groups */}
            {primaryGroups.map((group) => {
              const GroupIcon = group.icon;
              const groupActive = isGroupActive(group);
              return (
                <DropdownMenu key={group.title}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant={groupActive ? "default" : "ghost"}
                      className={cn(
                        "gap-1.5 h-9 px-2.5 flex-shrink-0 text-xs transition-all",
                        groupActive 
                          ? "bg-primary text-primary-foreground shadow-sm" 
                          : "hover:bg-muted"
                      )}
                      onMouseEnter={() => setHoveredMenu(group.title)}
                    >
                      <GroupIcon className="h-3.5 w-3.5" />
                      <span className="hidden xl:inline">{group.title}</span>
                      <ChevronDown className={cn("h-3 w-3", groupActive ? "opacity-80" : "opacity-50")} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent 
                    align="start" 
                    className="w-56 bg-popover shadow-lg border z-[100]"
                    onMouseLeave={() => setHoveredMenu(null)}
                  >
                    {group.items.map((item) => {
                      const ItemIcon = item.icon;
                      const itemActive = isItemActive(item.path);
                      return (
                        <DropdownMenuItem
                          key={item.path}
                          onClick={() => handleNavigate(item.path)}
                          className={cn(
                            "gap-3 cursor-pointer",
                            itemActive && "bg-primary/10 text-primary font-medium"
                          )}
                        >
                          <ItemIcon className={cn("h-4 w-4", itemActive && "text-primary")} />
                          {item.label}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })}

            {/* "More" dropdown for overflow groups */}
            {hasOverflow && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={isOverflowActive() ? "default" : "ghost"}
                    className={cn(
                      "gap-1.5 h-9 px-2.5 flex-shrink-0 text-xs transition-all",
                      isOverflowActive() 
                        ? "bg-primary text-primary-foreground shadow-sm" 
                        : "hover:bg-muted"
                    )}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                    <span className="hidden xl:inline">More</span>
                    <ChevronDown className={cn("h-3 w-3", isOverflowActive() ? "opacity-80" : "opacity-50")} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent 
                  align="start" 
                  className="w-64 bg-popover shadow-lg border z-[100] max-h-[70vh] overflow-y-auto"
                >
                  {overflowGroups.map((group, groupIndex) => {
                    const GroupIcon = group.icon;
                    return (
                      <div key={group.title}>
                        {groupIndex > 0 && <DropdownMenuSeparator />}
                        <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground">
                          <GroupIcon className="h-3.5 w-3.5" />
                          {group.title}
                        </DropdownMenuLabel>
                        {group.items.map((item) => {
                          const ItemIcon = item.icon;
                          const itemActive = isItemActive(item.path);
                          return (
                            <DropdownMenuItem
                              key={item.path}
                              onClick={() => handleNavigate(item.path)}
                              className={cn(
                                "gap-3 cursor-pointer pl-6",
                                itemActive && "bg-primary/10 text-primary font-medium"
                              )}
                            >
                              <ItemIcon className={cn("h-4 w-4", itemActive && "text-primary")} />
                              {item.label}
                            </DropdownMenuItem>
                          );
                        })}
                      </div>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Admin Menu */}
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={isAdminActive() ? "default" : "ghost"}
                    className={cn(
                      "gap-1.5 h-9 px-2.5 flex-shrink-0 text-xs transition-all",
                      isAdminActive() 
                        ? "bg-primary text-primary-foreground shadow-sm" 
                        : "hover:bg-muted"
                    )}
                  >
                    <Shield className="h-3.5 w-3.5" />
                    <span className="hidden xl:inline">Admin</span>
                    <ChevronDown className={cn("h-3 w-3", isAdminActive() ? "opacity-80" : "opacity-50")} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 bg-popover shadow-lg border z-[100]">
                  <DropdownMenuItem 
                    onClick={() => handleNavigate("/admin")} 
                    className={cn(
                      "gap-3 cursor-pointer",
                      location.pathname === '/admin' && "bg-primary/10 text-primary font-medium"
                    )}
                  >
                    <Users className={cn("h-4 w-4", location.pathname === '/admin' && "text-primary")} />
                    Admin Panel
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Factory Tools</DropdownMenuLabel>
                  <DropdownMenuItem 
                    onClick={() => handleNavigate("/factory-calendar")} 
                    className={cn(
                      "gap-3 cursor-pointer",
                      location.pathname === '/factory-calendar' && "bg-primary/10 text-primary font-medium"
                    )}
                  >
                    <Calendar className={cn("h-4 w-4", location.pathname === '/factory-calendar' && "text-primary")} />
                    Factory Calendar
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