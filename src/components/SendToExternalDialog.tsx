import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";

interface ExternalPartner {
  id: string;
  name: string;
  process_types: string[];
}

interface SendToExternalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workOrder: any;
  onSuccess: () => void;
}

export const SendToExternalDialog = ({ open, onOpenChange, workOrder, onSuccess }: SendToExternalDialogProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [process, setProcess] = useState<string>("");
  const [partnerId, setPartnerId] = useState<string>("");
  const [qtySent, setQtySent] = useState<string>("");
  const [expectedReturnDate, setExpectedReturnDate] = useState<string>("");
  const [remarks, setRemarks] = useState<string>("");
  const [partners, setPartners] = useState<ExternalPartner[]>([]);
  const [filteredPartners, setFilteredPartners] = useState<ExternalPartner[]>([]);

  const processOptions = [
    { value: "job_work", label: "Job Work", prefix: "JW" },
    { value: "plating", label: "Plating", prefix: "PL" },
    { value: "buffing", label: "Buffing", prefix: "BF" },
    { value: "blasting", label: "Blasting", prefix: "BL" },
    { value: "forging", label: "Forging", prefix: "FG" },
  ];

  useEffect(() => {
    loadPartners();
  }, []);

  useEffect(() => {
    if (process && partners.length > 0) {
      const filtered = partners.filter(p => p.process_types?.includes(process));
      setFilteredPartners(filtered);
      setPartnerId("");
    }
  }, [process, partners]);

  const loadPartners = async () => {
    const { data } = await supabase
      .from("external_partners" as any)
      .select("id, name, process_types")
      .eq("active", true)
      .order("name");
    setPartners((data || []) as unknown as ExternalPartner[]);
  };

  const generateChallanNo = (processType: string) => {
    const processPrefix = processOptions.find(p => p.value === processType)?.prefix || "EXT";
    const dateStr = format(new Date(), "yyyyMMdd");
    const seq = Math.floor(Math.random() * 9999).toString().padStart(4, "0");
    return `${processPrefix}-${dateStr}-${seq}`;
  };

  const getMaxQty = () => {
    if (!workOrder) return 0;
    const remaining = (workOrder.quantity || 0) - 
      ((workOrder.external_out_total || 0) - (workOrder.external_in_total || 0));
    return Math.max(0, remaining);
  };

  const handleSubmit = async () => {
    if (!process || !partnerId || !qtySent) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const qty = parseFloat(qtySent);
    const maxQty = getMaxQty();

    if (qty <= 0 || qty > maxQty) {
      toast({
        title: "Invalid quantity",
        description: `Quantity must be between 1 and ${maxQty}`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const challanNo = generateChallanNo(process);
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("wo_external_moves" as any)
        .insert({
          work_order_id: workOrder.id,
          process,
          partner_id: partnerId,
          qty_sent: qty,
          expected_return_date: expectedReturnDate || null,
          challan_no: challanNo,
          remarks: remarks || null,
          created_by: user?.id,
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: `Challan ${challanNo} created successfully`,
      });

      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      console.error("Error creating move:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setProcess("");
    setPartnerId("");
    setQtySent("");
    setExpectedReturnDate("");
    setRemarks("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send to External Processing</DialogTitle>
          <DialogDescription>
            Send items for {workOrder?.item_code} to external partner
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Process *</Label>
            <Select value={process} onValueChange={setProcess}>
              <SelectTrigger>
                <SelectValue placeholder="Select process" />
              </SelectTrigger>
              <SelectContent>
                {processOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Partner *</Label>
            <Select value={partnerId} onValueChange={setPartnerId} disabled={!process}>
              <SelectTrigger>
                <SelectValue placeholder="Select partner" />
              </SelectTrigger>
              <SelectContent>
                {filteredPartners.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Quantity to Send * (Max: {getMaxQty()} pcs)</Label>
            <Input
              type="number"
              value={qtySent}
              onChange={(e) => setQtySent(e.target.value)}
              placeholder="Enter quantity"
              max={getMaxQty()}
            />
          </div>

          <div className="space-y-2">
            <Label>Expected Return Date</Label>
            <Input
              type="date"
              value={expectedReturnDate}
              onChange={(e) => setExpectedReturnDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Remarks</Label>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Optional notes"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Challan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
