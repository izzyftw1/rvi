import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, addDays } from "date-fns";
import { Loader2, Plus, AlertCircle } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { z } from "zod";
import { createExecutionRecord } from "@/hooks/useExecutionRecord";
import { FormSection, FormRow, FormField, FormActions, FormHint, RequiredIndicator } from "@/components/ui/form-layout";
import { createGateEntry } from "@/lib/gateRegisterUtils";
import { PROCESS_OPTIONS, PRE_PRODUCTION_PROCESSES, INTERNAL_PROCESSES } from "@/config/materialMasters";

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

  // Check if current process is internal
  const isInternalProcess = process && INTERNAL_PROCESSES.includes(process as any);

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
    const processPrefix = PROCESS_OPTIONS.find(p => p.value === processType)?.prefix || "EXT";
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
    
    // Partner is only required for external (non-internal) processes
    if (!isInternalProcess && !partnerId) {
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
    
    // Expected return date only required for external processes
    if (!isInternalProcess) {
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
    }
    
    if (remarks && remarks.length > 500) {
      newErrors.remarks = "Remarks must be less than 500 characters";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    // Check if selected process requires production release
    const selectedProcess = PROCESS_OPTIONS.find(p => p.value === process);
    const isPreProductionProcess = selectedProcess?.preProduction || false;
    
    // Only block if NOT a pre-production process AND production is not released
    if (!isPreProductionProcess && workOrder?.production_release_status !== 'RELEASED') {
      toast({
        title: "Production Not Released",
        description: `${process} requires the work order to be released for production first. Pre-production processes (Forging, Heat Treatment, Cutting) can be sent without release.`,
        variant: "destructive",
      });
      return;
    }
    
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
      const { data: { user } } = await supabase.auth.getUser();

      // Calculate weight
      const weightPerPc = workOrder.gross_weight_per_pc || 0;
      const totalWeight = (qty * weightPerPc) / 1000; // Convert grams to kg

      // INTERNAL PROCESS: Route to production_batches instead of wo_external_moves
      if (isInternalProcess) {
        // Create or update production batch for internal process
        const { data: batchData, error: batchError } = await supabase
          .from("production_batches")
          .insert({
            wo_id: workOrder.id,
            batch_quantity: qty,
            current_process: process,
            stage_type: 'production',
            batch_status: 'in_queue',
            trigger_reason: `internal_${process?.toLowerCase()}`,
            created_by: user?.id,
          })
          .select()
          .single();

        if (batchError) {
          throw batchError;
        }

        // Log material movement (internal transfer)
        await supabase
          .from("material_movements")
          .insert({
            work_order_id: workOrder.id,
            process_type: process,
            movement_type: 'internal',
            qty: qty,
            weight: totalWeight,
            remarks: remarks.trim() || `Sent to ${process} department`,
            created_by: user?.id,
          });

        // Update work order stage - CRITICAL GAP 5 FIX: Reliable stage update
        const stageMap: Record<string, string> = {
          'Cutting': 'cutting',
          'Production': 'production',
          'CNC': 'production',
          'QC': 'qc',
          'Packing': 'packing',
        };

        const newStage = stageMap[process!] || process!.toLowerCase().replace(/\s+/g, '_');
        
        const { error: stageUpdateError } = await supabase
          .from("work_orders")
          .update({
            current_stage: newStage as any,
            material_location: `In-House (${process})`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", workOrder.id);
        
        if (stageUpdateError) {
          console.error("Failed to update work order stage:", stageUpdateError);
        }

        // Create execution record for internal process
        await createExecutionRecord({
          workOrderId: workOrder.id,
          operationType: 'CNC', // Internal cutting tracked as CNC operation
          processName: process,
          quantity: qty,
          unit: 'pcs',
          direction: 'OUT',
        });

        toast({
          title: "Sent to " + process,
          description: `${qty} pcs (${totalWeight.toFixed(2)} kg) sent to ${process} department.`,
        });

        onSuccess();
        onOpenChange(false);
        resetForm();
        return;
      }

      // EXTERNAL PROCESS: Create wo_external_moves and challan
      const challanNo = generateChallanNo(process);

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
      }
      
      // Update work order with external processing status - CRITICAL GAP 5 FIX
      const currentWip = workOrder.qty_external_wip || 0;
      
      const stageMap: Record<string, string> = {
        'Forging': 'forging',
        'Plating': 'plating',
        'Buffing': 'buffing',
        'Blasting': 'blasting',
        'Job Work': 'job_work',
        'Heat Treatment': 'heat_treatment',
        'Cutting': 'cutting',
        'Anodizing': 'anodizing',
        'Painting': 'painting',
      };
      
      const newStage = stageMap[process!] || process!.toLowerCase().replace(/\s+/g, '_');
      
      const { error: updateError } = await supabase
        .from("work_orders")
        .update({
          current_stage: newStage as any,
          external_status: 'sent',
          external_process_type: process,
          qty_external_wip: currentWip + qty,
          material_location: partnerName,
          updated_at: new Date().toISOString(),
        })
        .eq("id", workOrder.id);

      if (updateError) {
        console.error("Failed to update work order stage:", updateError);
        // Don't throw - external move was created successfully
      }
      
      // Also create/update production batch for external process tracking
      // CRITICAL FIX: Explicitly cast stage_type to the enum type and include stage_entered_at
      const now = new Date().toISOString();
      const { data: batchData, error: batchError } = await supabase
        .from("production_batches")
        .insert({
          wo_id: workOrder.id,
          batch_quantity: qty,
          current_location_type: 'external_partner',
          current_location_ref: partnerId,
          current_process: process,
          stage_type: 'external' as const, // Explicitly cast as enum value
          external_partner_id: partnerId,
          external_process_type: process,
          external_sent_at: now,
          stage_entered_at: now,
          batch_status: 'in_progress',
          trigger_reason: `external_${process?.toLowerCase().replace(/\s+/g, '_')}`,
          created_by: user?.id,
        })
        .select('id')
        .single();
      
      if (batchError) {
        console.error("Failed to create production batch for external:", batchError);
        // Don't fail the whole operation, challan was already created
        toast({
          title: "Warning",
          description: "Challan created but batch tracking failed. Data may not appear in dashboards.",
          variant: "destructive",
        });
      } else {
        console.log("Created external batch:", batchData?.id);
      }

      // Reload quantity tracking
      await loadQuantityTracking();
      
      // Create execution record for external process OUT
      await createExecutionRecord({
        workOrderId: workOrder.id,
        operationType: 'EXTERNAL_PROCESS',
        processName: process,
        quantity: qty,
        unit: 'pcs',
        direction: 'OUT',
        relatedPartnerId: partnerId,
        relatedChallanId: moveData?.id,
      });

      // AUTO-CREATE GATE REGISTER ENTRY (OUT) - SSOT integration
      await createGateEntry({
        direction: 'OUT',
        material_type: 'external_process',
        gross_weight_kg: totalWeight,
        net_weight_kg: totalWeight,
        estimated_pcs: qty,
        item_name: workOrder.item_code || null,
        partner_id: partnerId || null,
        process_type: process || null,
        work_order_id: workOrder.id,
        challan_no: challanNo,
        qc_required: false,
        remarks: `Auto: Sent to ${partnerName} for ${process} via Work Order`,
        created_by: user?.id || null,
      });
      
      toast({
        title: "Challan Created",
        description: `Material sent to ${partnerName} for ${process} - ${qty} pcs (${totalWeight.toFixed(2)} kg).`,
      });

      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      toast({
        title: isInternalProcess ? "Error Sending to Department" : "Error Creating Challan",
        description: error.message || "Failed to process request",
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
          <DialogTitle>Send to Processing</DialogTitle>
          <DialogDescription>
            Send items for {workOrder?.item_code} to {isInternalProcess ? 'internal department' : 'external partner'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Alerts Section */}
          {/* Info about pre-production processes */}
          {workOrder?.production_release_status !== 'RELEASED' && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Production not yet released.</strong> Pre-production processes (Forging, Heat Treatment, Cutting) can still be sent to external partners.
              </AlertDescription>
            </Alert>
          )}

          <Alert className={remainingQty === 0 ? "border-destructive" : "border-primary"}>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {loadingQty ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading quantity info...
                </span>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <span>Total Order:</span><span className="font-medium">{workOrder?.quantity || 0} pcs</span>
                  <span>Sent to External:</span><span className="font-medium">{totalSentQty} pcs</span>
                  <span>Received Back:</span><span className="font-medium">{totalReceivedQty} pcs</span>
                  <span className="text-primary font-medium">Available to Send:</span>
                  <span className="text-primary font-bold">{remainingQty} pcs</span>
                </div>
              )}
            </AlertDescription>
          </Alert>

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

          {/* Process & Partner Section */}
          <FormSection title="Process & Partner">
            <FormRow>
              <FormField>
                <Label>Process<RequiredIndicator /></Label>
                <Select 
                  value={process} 
                  onValueChange={(value) => {
                    setProcess(value);
                    setErrors(prev => ({ ...prev, process: "" }));
                  }}
                >
                  <SelectTrigger className={errors.process ? "border-destructive" : ""}>
                    <SelectValue placeholder="Select process" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROCESS_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.process && <FormHint variant="error">{errors.process}</FormHint>}
              </FormField>

              {isInternalProcess ? (
                <FormField>
                  <Label>Department</Label>
                  <div className="flex items-center h-10 px-3 rounded-md border bg-muted text-muted-foreground">
                    In-House ({process})
                  </div>
                  <FormHint>Internal process - no external partner required</FormHint>
                </FormField>
              ) : (
                <FormField>
                  <Label>Partner<RequiredIndicator /></Label>
                  <Select 
                    value={partnerId} 
                    onValueChange={handlePartnerChange}
                    disabled={!process || filteredPartners.length === 0}
                  >
                    <SelectTrigger className={errors.partnerId ? "border-destructive" : ""}>
                      <SelectValue placeholder={
                        !process 
                          ? "Select process first" 
                          : filteredPartners.length === 0 
                            ? "No partners found" 
                            : "Select partner"
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredPartners.length === 0 ? (
                        <SelectItem value="__no_partners" disabled>
                          {process ? `No partners for ${process}` : "Select process first"}
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
                  {errors.partnerId && <FormHint variant="error">{errors.partnerId}</FormHint>}
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
                </FormField>
              )}
            </FormRow>
          </FormSection>

          {/* Quantity & Timeline Section */}
          <FormSection title="Quantity & Timeline" withSeparator>
            <FormRow>
              <FormField>
                <Label>
                  Quantity to Send<RequiredIndicator />
                  <span className="text-muted-foreground text-xs ml-2">(Max: {getMaxQty()})</span>
                </Label>
                <Input
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
                {errors.qtySent && <FormHint variant="error">{errors.qtySent}</FormHint>}
              </FormField>

              {!isInternalProcess && (
                <FormField>
                  <Label>Expected Return<RequiredIndicator /></Label>
                  <Input
                    type="date"
                    value={expectedReturnDate}
                    onChange={(e) => {
                      setExpectedReturnDate(e.target.value);
                      setErrors(prev => ({ ...prev, expectedReturnDate: "" }));
                    }}
                    min={format(new Date(), "yyyy-MM-dd")}
                    className={errors.expectedReturnDate ? "border-destructive" : ""}
                  />
                  {errors.expectedReturnDate && <FormHint variant="error">{errors.expectedReturnDate}</FormHint>}
                </FormField>
              )}
            </FormRow>

            {process === 'Job Work' && (
              <FormField>
                <Label>Operation</Label>
                <Select value={operationTag} onValueChange={setOperationTag}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select if applicable" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">None</SelectItem>
                    <SelectItem value="Op-A">Operation A</SelectItem>
                    <SelectItem value="Op-B">Operation B</SelectItem>
                    <SelectItem value="Op-C">Operation C</SelectItem>
                    <SelectItem value="Op-D">Operation D</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            )}
          </FormSection>

          {/* Notes Section */}
          <FormSection title="Notes" withSeparator>
            <FormField>
              <Label>Remarks</Label>
              <Textarea
                value={remarks}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value.length <= 500) {
                    setRemarks(value);
                    setErrors(prev => ({ ...prev, remarks: "" }));
                  }
                }}
                placeholder={isInternalProcess ? "Optional notes..." : "Optional notes for this challan..."}
                rows={2}
                maxLength={500}
                className={errors.remarks ? "border-destructive" : ""}
              />
              <div className="flex justify-between items-center">
                {errors.remarks && <FormHint variant="error">{errors.remarks}</FormHint>}
                <span className="text-xs text-muted-foreground ml-auto">{remarks.length}/500</span>
              </div>
            </FormField>
          </FormSection>

          <FormActions>
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
              disabled={loading || !canCreate || remainingQty === 0 || loadingQty || (!isInternalProcess && workOrder?.production_release_status !== 'RELEASED')}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {!isInternalProcess && workOrder?.production_release_status !== 'RELEASED' 
                ? "Not Released" 
                : remainingQty === 0 
                  ? "No Qty Available" 
                  : isInternalProcess 
                    ? `Send to ${process}` 
                    : "Create Challan"}
            </Button>
          </FormActions>
        </div>
      </DialogContent>
    </Dialog>
  );
};
