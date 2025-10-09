import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Phone } from "lucide-react";
import { format } from "date-fns";

interface Followup {
  id: string;
  invoice_no: string;
  customer_name: string;
  balance_amount: number;
  contact_name: string;
  next_followup_date: string;
  invoice_id: string;
}

export function FollowupsTodayWidget() {
  const { toast } = useToast();
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFollowup, setSelectedFollowup] = useState<Followup | null>(null);
  const [showLogDialog, setShowLogDialog] = useState(false);
  const [logData, setLogData] = useState({
    outcome: "",
    notes: "",
    next_date: ""
  });

  useEffect(() => {
    loadFollowups();
  }, []);

  const loadFollowups = async () => {
    try {
      const today = format(new Date(), "yyyy-MM-dd");
      
      const { data, error } = await supabase
        .from("ar_followups")
        .select(`
          id,
          contact_name,
          next_followup_date,
          invoice_id,
          invoices!inner(
            invoice_no,
            balance_amount,
            customer_master!inner(customer_name)
          )
        `)
        .eq("next_followup_date", today)
        .order("next_followup_date", { ascending: true });

      if (error) throw error;

      const processed = data?.map((f: any) => ({
        id: f.id,
        invoice_no: f.invoices.invoice_no,
        customer_name: f.invoices.customer_master.customer_name,
        balance_amount: f.invoices.balance_amount,
        contact_name: f.contact_name,
        next_followup_date: f.next_followup_date,
        invoice_id: f.invoice_id
      })) || [];

      setFollowups(processed);
    } catch (error: any) {
      console.error("Error loading followups:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogOutcome = async () => {
    if (!selectedFollowup || !logData.outcome) {
      toast({ variant: "destructive", description: "Please fill in the outcome" });
      return;
    }

    try {
      const { error } = await supabase
        .from("ar_followups")
        .insert({
          invoice_id: selectedFollowup.invoice_id,
          contact_name: selectedFollowup.contact_name,
          outcome: logData.outcome,
          notes: logData.notes,
          next_followup_date: logData.next_date || null,
          channel: "phone"
        });

      if (error) throw error;

      toast({ description: "✅ Follow-up logged successfully" });
      setShowLogDialog(false);
      setLogData({ outcome: "", notes: "", next_date: "" });
      loadFollowups();
    } catch (error: any) {
      toast({ variant: "destructive", description: error.message });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Follow-ups Today
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Follow-ups Today ({followups.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {followups.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No follow-ups scheduled for today
            </p>
          ) : (
            <div className="space-y-3">
              {followups.map((followup) => (
                <div 
                  key={followup.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex-1">
                    <p className="font-medium">{followup.customer_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {followup.invoice_no} • ${followup.balance_amount.toFixed(2)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Contact: {followup.contact_name}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      setSelectedFollowup(followup);
                      setShowLogDialog(true);
                    }}
                  >
                    Log Call
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showLogDialog} onOpenChange={setShowLogDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Follow-up Outcome</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium">{selectedFollowup?.customer_name}</p>
              <p className="text-sm text-muted-foreground">
                {selectedFollowup?.invoice_no} • ${selectedFollowup?.balance_amount.toFixed(2)}
              </p>
            </div>

            <div>
              <Label>Outcome *</Label>
              <Select value={logData.outcome} onValueChange={(value) => setLogData({ ...logData, outcome: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select outcome" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="promised_payment">Promised Payment</SelectItem>
                  <SelectItem value="dispute">Dispute Raised</SelectItem>
                  <SelectItem value="partial_payment">Partial Payment Committed</SelectItem>
                  <SelectItem value="no_answer">No Answer</SelectItem>
                  <SelectItem value="will_call_back">Will Call Back</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                placeholder="Call notes..."
                value={logData.notes}
                onChange={(e) => setLogData({ ...logData, notes: e.target.value })}
              />
            </div>

            <div>
              <Label>Next Follow-up Date</Label>
              <input
                type="date"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={logData.next_date}
                onChange={(e) => setLogData({ ...logData, next_date: e.target.value })}
              />
            </div>

            <Button onClick={handleLogOutcome} className="w-full">
              Save Follow-up
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
