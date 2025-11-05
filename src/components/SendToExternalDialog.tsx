import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, addDays } from "date-fns";
import { Loader2, Plus, ExternalLink, AlertCircle } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { z } from "zod";

interface ExternalPartner {
  id: string;
  partner_name: string;
  process_type: string[];
  lead_time_days: number;
}

// Validation schema
const externalMoveSchema = z.object({
  process: z.string().min(1, "Process is required"),
  partnerId: z.string().uuid("Partner is required"),
  qtySent: z.number()
    .positive("Quantity must be greater than 0")
    .max(999999, "Quantity too large"),
  expectedReturnDate: z.string().optional(),
  remarks: z.string().max(500, "Remarks must be less than 500 characters").optional(),
  operationTag: z.string().max(50, "Operation tag too long").optional(),
});

interface SendToExternalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workOrder: any;
  onSuccess: () => void;
}

export const SendToExternalDialog = ({ open, onOpenChange, workOrder, onSuccess }: SendToExternalDialogProps) => {
  const { toast } = useToast();
  const { hasAnyRole } = useUserRole();
  const [loading, setLoading] = useState(false);
  
  const canCreate = hasAnyRole(['production', 'admin']);
  const [process, setProcess] = useState<string>("");
  const [partnerId, setPartnerId] = useState<string>("");
  const [qtySent, setQtySent] = useState<string>("");
  const [expectedReturnDate, setExpectedReturnDate] = useState<string>("");
  const [remarks, setRemarks] = useState<string>("");
  const [operationTag, setOperationTag] = useState<string>("");
  const [partners, setPartners] = useState<ExternalPartner[]>([]);
  const [filteredPartners, setFilteredPartners] = useState<ExternalPartner[]>([]);
  
  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  const processOptions = [
    { value: "Plating", label: "Plating", prefix: "PL" },
    { value: "Job Work", label: "Job Work", prefix: "JW" },
    { value: "Buffing", label: "Buffing", prefix: "BF" },
    { value: "Blasting", label: "Blasting", prefix: "BL" },
    { value: "Forging", label: "Forging", prefix: "FG" },
    { value: "Heat Treatment", label: "Heat Treatment", prefix: "HT" },
  ];

  useEffect(() => {
    loadPartners();
  }, []);

  useEffect(() => {
    if (process && partners.length > 0) {
      const filtered = partners.filter(p => p.process_type?.includes(process));
      setFilteredPartners(filtered);
      setPartnerId("");
      setExpectedReturnDate("");
      setErrors({});
    }
  }, [process, partners]);

  const loadPartners = async () => {
    const { data } = await supabase
      .from("external_partners")
      .select("id, partner_name, process_type, lead_time_days")
      .eq("active", true)
      .order("partner_name");
    setPartners((data || []) as ExternalPartner[]);
  };

  const handlePartnerChange = (newPartnerId: string) => {
    setPartnerId(newPartnerId);
    const selectedPartner = partners.find(p => p.id === newPartnerId);
    if (selectedPartner && selectedPartner.lead_time_days) {
      const returnDate = addDays(new Date(), selectedPartner.lead_time_days);
      setExpectedReturnDate(format(returnDate, "yyyy-MM-dd"));
    }
    setErrors(prev => ({ ...prev, partnerId: "" }));
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

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!process) {
      newErrors.process = "Process selection is required";
    }
    
    if (!partnerId) {
      newErrors.partnerId = "Partner selection is required";
    }
    
    const qty = parseFloat(qtySent);
    const maxQty = getMaxQty();
    
    if (!qtySent || isNaN(qty)) {
      newErrors.qtySent = "Quantity is required";
    } else if (qty <= 0) {
      newErrors.qtySent = "Quantity must be greater than 0";
    } else if (qty > maxQty) {
      newErrors.qtySent = `Quantity cannot exceed ${maxQty} (available quantity)`;
    }
    
    if (!expectedReturnDate) {
      newErrors.expectedReturnDate = "Expected return date is required";
    } else {
      const returnDate = new Date(expectedReturnDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (returnDate < today) {
        newErrors.expectedReturnDate = "Return date cannot be in the past";
      }
    }
    
    if (remarks && remarks.length > 500) {
      newErrors.remarks = "Remarks must be less than 500 characters";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!canCreate) {
      toast({
        title: "Permission denied",
        description: "You do not have permission to create external moves",
        variant: "destructive",
      });
      return;
    }
    
    if (!validateForm()) {
      toast({
        title: "Validation Error",
        description: "Please fix the errors in the form",
        variant: "destructive",
      });
      return;
    }

    const qty = parseFloat(qtySent);

    setLoading(true);
    try {
      const challanNo = generateChallanNo(process);
      const { data: { user } } = await supabase.auth.getUser();

      const { data: moveData, error } = await supabase
        .from("wo_external_moves" as any)
        .insert([{
          work_order_id: workOrder.id,
          process,
          partner_id: partnerId,
          qty_sent: qty,
          expected_return_date: expectedReturnDate,
          challan_no: challanNo,
          remarks: remarks.trim() || null,
          operation_tag: operationTag.trim() || null,
          created_by: user?.id,
        }])
        .select()
        .single() as any;

      if (error) throw error;

      const selectedPartner = partners.find(p => p.id === partnerId);
      
      toast({
        title: "Challan Created Successfully",
        description: `Challan #${challanNo} created for ${selectedPartner?.partner_name || "partner"}`,
        action: (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              window.location.href = `/work-orders/${workOrder.id}`;
            }}
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            View Details
          </Button>
        ),
      });

      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      toast({
        title: "Error Creating Challan",
        description: error.message || "Failed to create external move",
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
    setOperationTag("");
    setErrors({});
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
          {/* Availability Alert */}
          {workOrder && getMaxQty() === 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No quantity available for external processing. All items are already sent or completed.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="process">
              Process <span className="text-destructive">*</span>
            </Label>
            <Select 
              value={process} 
              onValueChange={(value) => {
                setProcess(value);
                setErrors(prev => ({ ...prev, process: "" }));
              }}
            >
              <SelectTrigger id="process" className={errors.process ? "border-destructive" : ""}>
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
            {errors.process && (
              <p className="text-sm text-destructive">{errors.process}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="partner">
              Partner <span className="text-destructive">*</span>
            </Label>
            <Select 
              value={partnerId} 
              onValueChange={handlePartnerChange}
              disabled={!process}
            >
              <SelectTrigger id="partner" className={errors.partnerId ? "border-destructive" : ""}>
                <SelectValue placeholder={!process ? "Select process first" : "Select partner"} />
              </SelectTrigger>
              <SelectContent>
                {filteredPartners.length === 0 && process ? (
                  <div className="p-2 text-sm text-muted-foreground text-center">
                    No partners available for {process}
                  </div>
                ) : (
                  filteredPartners.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.partner_name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {errors.partnerId && (
              <p className="text-sm text-destructive">{errors.partnerId}</p>
            )}
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => window.open("/partners", "_blank")}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add New Partner
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quantity">
              Quantity to Send <span className="text-destructive">*</span>
              <span className="text-muted-foreground text-xs ml-2">
                (Max: {getMaxQty()} pcs)
              </span>
            </Label>
            <Input
              id="quantity"
              type="number"
              value={qtySent}
              onChange={(e) => {
                setQtySent(e.target.value);
                setErrors(prev => ({ ...prev, qtySent: "" }));
              }}
              placeholder="Enter quantity"
              max={getMaxQty()}
              min={1}
              className={errors.qtySent ? "border-destructive" : ""}
            />
            {errors.qtySent && (
              <p className="text-sm text-destructive">{errors.qtySent}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="return-date">
              Expected Return Date <span className="text-destructive">*</span>
            </Label>
            <Input
              id="return-date"
              type="date"
              value={expectedReturnDate}
              onChange={(e) => {
                setExpectedReturnDate(e.target.value);
                setErrors(prev => ({ ...prev, expectedReturnDate: "" }));
              }}
              min={format(new Date(), "yyyy-MM-dd")}
              className={errors.expectedReturnDate ? "border-destructive" : ""}
            />
            {errors.expectedReturnDate && (
              <p className="text-sm text-destructive">{errors.expectedReturnDate}</p>
            )}
          </div>

          {process === 'Job Work' && (
            <div className="space-y-2">
              <Label htmlFor="operation">Operation (Optional)</Label>
              <Select value={operationTag} onValueChange={setOperationTag}>
                <SelectTrigger id="operation">
                  <SelectValue placeholder="Select operation if applicable" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Op-A">Operation A</SelectItem>
                  <SelectItem value="Op-B">Operation B</SelectItem>
                  <SelectItem value="Op-C">Operation C</SelectItem>
                  <SelectItem value="Op-D">Operation D</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="remarks">Remarks (Optional)</Label>
            <Textarea
              id="remarks"
              value={remarks}
              onChange={(e) => {
                const value = e.target.value;
                if (value.length <= 500) {
                  setRemarks(value);
                  setErrors(prev => ({ ...prev, remarks: "" }));
                }
              }}
              placeholder="Optional notes"
              rows={3}
              maxLength={500}
              className={errors.remarks ? "border-destructive" : ""}
            />
            <div className="flex justify-between items-center">
              {errors.remarks && (
                <p className="text-sm text-destructive">{errors.remarks}</p>
              )}
              <p className="text-xs text-muted-foreground ml-auto">
                {remarks.length}/500 characters
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => {
              onOpenChange(false);
              resetForm();
            }} 
            disabled={loading}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={loading || !canCreate || getMaxQty() === 0}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Challan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
