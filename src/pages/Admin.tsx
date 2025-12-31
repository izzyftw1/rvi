import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

import { PageHeader, PageContainer } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Shield, Users, Building2, ExternalLink, HardHat, Warehouse } from "lucide-react";
import { UsersManagement } from "@/components/admin/UsersManagement";
import { DepartmentsManagement } from "@/components/admin/DepartmentsManagement";
import { ExternalPartnersManagement } from "@/components/admin/ExternalPartnersManagement";
import { PeopleManagement } from "@/components/admin/PeopleManagement";
import { SupplierAccountsManagement } from "@/components/admin/SupplierAccountsManagement";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InfoIcon } from "lucide-react";

export default function Admin() {
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

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
      <PageContainer maxWidth="2xl">
        <div className="space-y-6">
          <PageHeader
            title="Admin Panel"
            description="Manage users, departments, and permissions"
            icon={<Shield className="h-6 w-6" />}
          />

          <Alert>
            <InfoIcon className="h-4 w-4" />
            <AlertDescription>
              <strong>Permission System:</strong> Access is controlled by department assignment. 
              Admin and Finance departments have full access. Other departments have limited access based on their function.
              Individual user permissions can be overridden in the user edit panel.
            </AlertDescription>
          </Alert>

          <Tabs defaultValue="users" className="space-y-6">
            <TabsList>
              <TabsTrigger value="users" className="gap-2">
                <Users className="h-4 w-4" />
                Users
              </TabsTrigger>
              <TabsTrigger value="departments" className="gap-2">
                <Building2 className="h-4 w-4" />
                Departments
              </TabsTrigger>
              <TabsTrigger value="partners" className="gap-2">
                <ExternalLink className="h-4 w-4" />
                External Partners
              </TabsTrigger>
              <TabsTrigger value="people" className="gap-2">
                <HardHat className="h-4 w-4" />
                People
              </TabsTrigger>
              <TabsTrigger value="suppliers" className="gap-2">
                <Warehouse className="h-4 w-4" />
                Supplier Accounts
              </TabsTrigger>
            </TabsList>

            <TabsContent value="users" className="space-y-4">
              <UsersManagement roles={[]} departments={departments} />
            </TabsContent>

            <TabsContent value="departments" className="space-y-4">
              <DepartmentsManagement />
            </TabsContent>

            <TabsContent value="partners" className="space-y-4">
              <ExternalPartnersManagement />
            </TabsContent>

            <TabsContent value="people" className="space-y-4">
              <PeopleManagement />
            </TabsContent>

            <TabsContent value="suppliers" className="space-y-4">
              <SupplierAccountsManagement />
            </TabsContent>
          </Tabs>
        </div>
      </PageContainer>
    </div>
  );
}
