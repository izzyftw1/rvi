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
  name: string;
  process_type: string;
  default_lead_time_days?: number;
  is_active?: boolean;
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
  
  const canCreate = hasAnyRole(['production', 'logistics', 'admin']);
  const [process, setProcess] = useState<string | undefined>(undefined);
  const [partnerId, setPartnerId] = useState<string | undefined>(undefined);
  const [qtySent, setQtySent] = useState<string>("");
  const [expectedReturnDate, setExpectedReturnDate] = useState<string>("");
  const [remarks, setRemarks] = useState<string>("");
  const [operationTag, setOperationTag] = useState<string | undefined>(undefined);
  const [partners, setPartners] = useState<ExternalPartner[]>([]);
  const [filteredPartners, setFilteredPartners] = useState<ExternalPartner[]>([]);
  const [partnersError, setPartnersError] = useState<string | null>(null);
  
  // Quantity tracking
  const [totalSentQty, setTotalSentQty] = useState(0);
  const [totalReceivedQty, setTotalReceivedQty] = useState(0);
  const [remainingQty, setRemainingQty] = useState(0);
  const [loadingQty, setLoadingQty] = useState(false);
  
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
    if (workOrder?.id) {
      loadQuantityTracking();
    }
  }, [workOrder?.id]);

  useEffect(() => {
    if (process && partners.length > 0) {
      const filtered = partners.filter(p => p.process_type === process);
      console.log(`Filtered partners for ${process}:`, filtered.length);
      setFilteredPartners(filtered);
      setPartnerId(undefined);
      setExpectedReturnDate("");
      setErrors({});
    } else {
      setFilteredPartners([]);
    }
  }, [process, partners]);

  const loadQuantityTracking = async () => {
    if (!workOrder?.id) return;
    
    setLoadingQty(true);
    try {
      // Fetch all external moves for this work order
      const { data: moves, error } = await supabase
        .from("wo_external_moves")
        .select("quantity_sent, quantity_returned")
        .eq("work_order_id", workOrder.id)
        .in("status", ["sent", "in_transit", "partial"]);
      
      if (error) throw error;
      
      const totalSent = (moves || []).reduce((sum, m) => sum + (m.quantity_sent || 0), 0);
      const totalReceived = (moves || []).reduce((sum, m) => sum + (m.quantity_returned || 0), 0);
      const remaining = (workOrder.quantity || 0) - totalSent + totalReceived;
      
      setTotalSentQty(totalSent);
      setTotalReceivedQty(totalReceived);
      setRemainingQty(Math.max(0, remaining));
    } catch (error) {
      console.error("Error loading quantity tracking:", error);
      setRemainingQty(workOrder.quantity || 0);
    } finally {
      setLoadingQty(false);
    }
  };

  const loadPartners = async () => {
    try {
      setPartnersError(null);
      const { data, error } = await supabase
        .from("external_partners")
        .select("id, name, process_type, default_lead_time_days, is_active")
        .eq("is_active", true)
        .order("name");
      
      if (error) {
        console.error("Failed to load external partners:", error);
        setPartnersError("Could not load external partners. Please try again.");
        setPartners([]);
        return;
      }
      
      console.log("Loaded partners:", (data || []).length);
      setPartners((data || []) as ExternalPartner[]);
    } catch (err) {
      console.error("Error loading partners:", err);
      setPartnersError("Could not load external partners. Please try again.");
      setPartners([]);
    }
  };

  const handlePartnerChange = (newPartnerId: string) => {
    setPartnerId(newPartnerId);
    const selectedPartner = partners.find(p => p.id === newPartnerId);
    // Set default 7 days return date if not specified
    if (selectedPartner) {
      const defaultDays = selectedPartner.default_lead_time_days || 7;
      const returnDate = addDays(new Date(), defaultDays);
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
    return remainingQty;
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
    const challanNo = generateChallanNo(process);

    setLoading(true);
    try {
      // Check for duplicate challan number
      const { data: existingChallan } = await (supabase as any)
        .from("wo_external_moves")
        .select("id")
        .eq("challan_no", challanNo)
        .maybeSingle();

      if (existingChallan) {
        setErrors({ submit: `Challan #${challanNo} already exists. Please try again.` });
        setLoading(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();

      const { data: moveData, error } = await supabase
        .from("wo_external_moves")
        .insert([{
          work_order_id: workOrder.id,
          process,
          partner_id: partnerId,
          quantity_sent: qty,
          expected_return_date: expectedReturnDate,
          challan_no: challanNo,
          remarks: remarks.trim() || null,
          operation_tag: operationTag?.trim() || null,
          created_by: user?.id,
        }])
        .select()
        .single();

      if (error) {
        // Handle unique constraint violation
        if (error.code === '23505') {
          setErrors({ submit: "Challan number already exists. Please try again." });
          setLoading(false);
          return;
        }
        throw error;
      }

      // Get partner name for material location
      const selectedPartner = partners.find(p => p.id === partnerId);
      const partnerName = selectedPartner?.name || 'External Partner';
      
      // Calculate weight
      const weightPerPc = workOrder.gross_weight_per_pc || 0;
      const totalWeight = (qty * weightPerPc) / 1000; // Convert grams to kg
      
      // Log material movement (OUT)
      const { error: movementError } = await supabase
        .from("material_movements")
        .insert({
          work_order_id: workOrder.id,
          process_type: process,
          movement_type: 'out',
          qty: qty,
          weight: totalWeight,
          partner_id: partnerId,
          remarks: remarks.trim() || null,
          created_by: user?.id,
        });
      
      if (movementError) {
        console.error("Failed to log material movement:", movementError);
        // Don't fail the operation, just log the error
      }
      
      // Update work order with external processing status and set current_stage to match process
      const currentWip = workOrder.qty_external_wip || 0;
      
      // Map process type to stage value
      const stageMap: Record<string, string> = {
        'Forging': 'forging',
        'Plating': 'plating',
        'Buffing': 'buffing',
        'Blasting': 'blasting',
        'Job Work': 'job_work',
        'Heat Treatment': 'heat_treatment',
      };
      
      const { error: updateError } = await supabase
        .from("work_orders")
        .update({
          current_stage: (stageMap[process] || process.toLowerCase().replace(' ', '_')) as any,
          external_status: 'sent',
          external_process_type: process,
          qty_external_wip: currentWip + qty,
          material_location: partnerName,
          updated_at: new Date().toISOString(),
        })
        .eq("id", workOrder.id);

      if (updateError) {
        console.error("Failed to update work order:", updateError);
        // Don't fail the operation if WO update fails, just log it
      }

      // Reload quantity tracking
      await loadQuantityTracking();
      
      toast({
        title: "Material Sent",
        description: `Material sent to ${partnerName} for ${process} - ${qty} pcs (${totalWeight.toFixed(2)} kg).`,
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
    setProcess(undefined);
    setPartnerId(undefined);
    setQtySent("");
    setExpectedReturnDate("");
    setRemarks("");
    setOperationTag(undefined);
    setErrors({});
    setPartnersError(null);
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
          {/* Quantity Summary Alert */}
          <Alert className={remainingQty === 0 ? "border-destructive" : "border-primary"}>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {loadingQty ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading quantity info...
                </span>
              ) : (
                <div className="space-y-1 text-sm">
                  <p><strong>Total Order:</strong> {workOrder?.quantity || 0} pcs</p>
                  <p><strong>Sent to External:</strong> {totalSentQty} pcs</p>
                  <p><strong>Received Back:</strong> {totalReceivedQty} pcs</p>
                  <p className="font-semibold text-primary">
                    <strong>Available to Send:</strong> {remainingQty} pcs
                  </p>
                  {remainingQty === 0 && (
                    <p className="text-destructive font-semibold mt-2">
                      All pieces already sent to external partners. Wait for receipts before sending more.
                    </p>
                  )}
                </div>
              )}
            </AlertDescription>
          </Alert>

          {/* Partners Error Alert */}
          {partnersError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex justify-between items-center">
                <span>{partnersError}</span>
                <Button variant="outline" size="sm" onClick={loadPartners}>
                  Retry
                </Button>
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
              disabled={!process || filteredPartners.length === 0}
            >
              <SelectTrigger id="partner" className={errors.partnerId ? "border-destructive" : ""}>
                <SelectValue placeholder={
                  !process 
                    ? "Select process first" 
                    : filteredPartners.length === 0 
                      ? "No partners found for this process" 
                      : "Select partner"
                } />
              </SelectTrigger>
              <SelectContent>
                {filteredPartners.length === 0 ? (
                  <SelectItem value="__no_partners" disabled>
                    {process ? `No partners available for ${process}` : "Select a process first"}
                  </SelectItem>
                ) : (
                  filteredPartners.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
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
                  <SelectItem value="__none">None</SelectItem>
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
            disabled={loading || !canCreate || remainingQty === 0 || loadingQty}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {remainingQty === 0 ? "No Quantity Available" : "Create Challan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
