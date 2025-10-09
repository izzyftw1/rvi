import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface OverdueInvoice {
  id: string;
  invoice_no: string;
  customer_name: string;
  balance_amount: number;
  due_date: string;
  days_late: number;
  recovery_stage: string;
}

export function OverdueInvoicesWidget() {
  const navigate = useNavigate();
  const [overdueInvoices, setOverdueInvoices] = useState<OverdueInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOverdueInvoices();
  }, []);

  const loadOverdueInvoices = async () => {
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select(`
          id,
          invoice_no,
          balance_amount,
          due_date,
          recovery_stage,
          customer_master!invoices_customer_id_fkey(customer_name)
        `)
        .eq("status", "overdue")
        .order("due_date", { ascending: true });

      if (error) throw error;

      const processed = data?.map((inv: any) => {
        const dueDate = new Date(inv.due_date);
        const today = new Date();
        const daysLate = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        
        return {
          id: inv.id,
          invoice_no: inv.invoice_no,
          customer_name: inv.customer_master?.customer_name || "Unknown",
          balance_amount: inv.balance_amount,
          due_date: inv.due_date,
          days_late: daysLate,
          recovery_stage: inv.recovery_stage || "none"
        };
      }) || [];

      setOverdueInvoices(processed);
    } catch (error: any) {
      console.error("Error loading overdue invoices:", error);
    } finally {
      setLoading(false);
    }
  };

  const getRecoveryStageBadge = (stage: string) => {
    const variants: Record<string, any> = {
      none: { variant: "secondary", label: "None" },
      friendly: { variant: "default", label: "Friendly" },
      firm: { variant: "default", label: "Firm" },
      final_notice: { variant: "destructive", label: "Final Notice" },
      hold_shipments: { variant: "destructive", label: "Hold Shipments" },
      legal: { variant: "destructive", label: "Legal" }
    };
    
    const config = variants[stage] || variants.none;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getDaysLateBadge = (days: number) => {
    if (days <= 15) return <Badge variant="default">{days} days</Badge>;
    if (days <= 30) return <Badge variant="destructive">{days} days</Badge>;
    return <Badge variant="destructive" className="bg-red-700">{days} days</Badge>;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            Overdue Invoices
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            Overdue Invoices ({overdueInvoices.length})
          </CardTitle>
          <Button 
            size="sm" 
            variant="outline"
            onClick={() => navigate("/finance/invoices?filter=overdue")}
          >
            View All
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {overdueInvoices.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No overdue invoices ✓
          </p>
        ) : (
          <div className="space-y-3">
            {overdueInvoices.slice(0, 5).map((invoice) => (
              <div 
                key={invoice.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                onClick={() => navigate(`/finance/invoices/${invoice.id}`)}
              >
                <div className="flex-1">
                  <p className="font-medium">{invoice.invoice_no}</p>
                  <p className="text-sm text-muted-foreground">{invoice.customer_name}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <p className="font-semibold text-destructive">
                    ${invoice.balance_amount.toFixed(2)}
                  </p>
                  <div className="flex gap-2">
                    {getDaysLateBadge(invoice.days_late)}
                    {getRecoveryStageBadge(invoice.recovery_stage)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
