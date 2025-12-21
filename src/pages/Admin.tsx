import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { NavigationHeader } from "@/components/NavigationHeader";
import { PageHeader, PageContainer } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Shield, Users, Building2, ExternalLink } from "lucide-react";
import { UsersManagement } from "@/components/admin/UsersManagement";
import { RolesManagement } from "@/components/admin/RolesManagement";
import { DepartmentsManagement } from "@/components/admin/DepartmentsManagement";
import { ExternalPartnersManagement } from "@/components/admin/ExternalPartnersManagement";

export default function Admin() {
  const [roles, setRoles] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load roles from roles table
      const { data: rolesData } = await supabase
        .from("roles")
        .select("*")
        .order("role_name");
      setRoles(rolesData || []);

      // Load departments
      const { data: deptData } = await supabase
        .from("departments")
        .select("*")
        .order("name");
      setDepartments(deptData || []);

    } catch (error: any) {
      console.error("Error loading data:", error);
      toast({ 
        title: "Error", 
        description: error.message || "Failed to load data", 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      
      <PageContainer maxWidth="2xl">
        <div className="space-y-6">
          <PageHeader
            title="Admin Panel"
            description="Manage users, roles, and departments"
            icon={<Shield className="h-6 w-6" />}
          />

          <Tabs defaultValue="users" className="space-y-6">
            <TabsList>
              <TabsTrigger value="users" className="gap-2">
                <Users className="h-4 w-4" />
                Users
              </TabsTrigger>
              <TabsTrigger value="roles" className="gap-2">
                <Shield className="h-4 w-4" />
                Roles
              </TabsTrigger>
              <TabsTrigger value="departments" className="gap-2">
                <Building2 className="h-4 w-4" />
                Departments
              </TabsTrigger>
              <TabsTrigger value="partners" className="gap-2">
                <ExternalLink className="h-4 w-4" />
                External Partners
              </TabsTrigger>
            </TabsList>

            <TabsContent value="users" className="space-y-4">
              <UsersManagement roles={roles} departments={departments} />
            </TabsContent>

            <TabsContent value="roles" className="space-y-4">
              <RolesManagement />
            </TabsContent>

            <TabsContent value="departments" className="space-y-4">
              <DepartmentsManagement />
            </TabsContent>

            <TabsContent value="partners" className="space-y-4">
              <ExternalPartnersManagement />
            </TabsContent>
          </Tabs>
        </div>
      </PageContainer>
    </div>
  );
}
