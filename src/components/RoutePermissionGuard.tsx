import { ReactNode, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDepartmentPermissions } from '@/hooks/useDepartmentPermissions';
import { AlertTriangle, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface RoutePermissionGuardProps {
  children: ReactNode;
}

/**
 * RoutePermissionGuard - Protects routes based on department permissions
 * 
 * This component wraps route content and checks if the current user
 * has permission to access the current route based on their department.
 * 
 * Admin and Finance users bypass all checks.
 */
export const RoutePermissionGuard = ({ children }: RoutePermissionGuardProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { loading, canAccessRoute, isBypassUser } = useDepartmentPermissions();
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  useEffect(() => {
    if (!loading) {
      const access = canAccessRoute(location.pathname);
      setHasAccess(access);
    }
  }, [loading, location.pathname, canAccessRoute]);

  // Show loading state
  if (loading || hasAccess === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // User has access - render children
  if (hasAccess) {
    return <>{children}</>;
  }

  // Access denied - show friendly message
  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <Lock className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle className="text-xl">Access Restricted</CardTitle>
          <CardDescription>
            You don't have permission to access this page based on your department role.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
            <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">Why am I seeing this?</p>
              <p className="text-muted-foreground mt-1">
                Each department has access to specific areas of the system. 
                Contact your administrator if you need access to this page.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={() => navigate(-1)}
            >
              Go Back
            </Button>
            <Button 
              className="flex-1"
              onClick={() => navigate('/')}
            >
              Go to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
