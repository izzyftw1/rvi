import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QRCodeDisplay } from "@/components/QRCodeDisplay";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ChevronDown, Check, AlertCircle } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Customer {
  id: string;
  customer_name: string;
  party_code: string | null;
}

interface ItemMaster {
  id: string;
  item_code: string;
  item_name: string | null;
  alloy: string | null;
  default_material_form: string | null;
  default_cross_section_shape: string | null;
  default_nominal_size_mm: number | null;
  default_material_grade: string | null;
  gross_weight_grams: number | null;
  net_weight_grams: number | null;
  cycle_time_seconds: number | null;
  material_size_mm: string | null;
  customer_id: string | null;
}

interface SalesOrder {
  id: string;
  so_id: string;
  customer_id: string;
  customer: string;
  po_number: string;
  status: string;
}

const NewWorkOrder = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [createdWO, setCreatedWO] = useState<any>(null);

  // Popover states
  const [customerOpen, setCustomerOpen] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const [soOpen, setSOOpen] = useState(false);

  const [formData, setFormData] = useState({
    customer_id: "",
    customer_po: "",
    item_id: "",
    item_code: "",
    revision: "",
    quantity: "",
    due_date: "",
    priority: "3",
    so_id: "",
    cutting_required: false,
    forging_required: false,
    // Material specs auto-populated from item master
    alloy: "",
    material_form: "",
    cross_section_shape: "",
    nominal_size_mm: "",
    material_grade: "",
    gross_weight_grams: "",
    net_weight_grams: "",
    cycle_time_seconds: "",
    material_size_mm: "",
  });

  // Fetch customers
  const { data: customers = [], isLoading: customersLoading } = useQuery({
    queryKey: ["customers-dropdown"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_master")
        .select("id, customer_name, party_code")
        .order("customer_name");
      if (error) throw error;
      return data as Customer[];
    },
  });

  // Fetch items
  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["items-dropdown"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("item_master")
        .select("id, item_code, item_name, alloy, default_material_form, default_cross_section_shape, default_nominal_size_mm, default_material_grade, gross_weight_grams, net_weight_grams, cycle_time_seconds, material_size_mm, customer_id")
        .order("item_code");
      
      if (error) throw error;
      return data as ItemMaster[];
    },
  });

  // Fetch sales orders (filter by customer)
  const { data: salesOrders = [], isLoading: salesOrdersLoading } = useQuery({
    queryKey: ["sales-orders-dropdown", formData.customer_id],
    queryFn: async () => {
      let query = supabase
        .from("sales_orders")
        .select("id, so_id, customer_id, customer, po_number, status")
        .in("status", ["approved", "pending"])
        .order("created_at", { ascending: false });
      
      if (formData.customer_id) {
        query = query.eq("customer_id", formData.customer_id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as SalesOrder[];
    },
    enabled: true,
  });

  // Get selected customer name
  const selectedCustomer = useMemo(() => {
    return customers.find(c => c.id === formData.customer_id);
  }, [customers, formData.customer_id]);

  // Get selected item
  const selectedItem = useMemo(() => {
    return items.find(i => i.id === formData.item_id);
  }, [items, formData.item_id]);

  // Get selected SO
  const selectedSO = useMemo(() => {
    return salesOrders.find(s => s.id === formData.so_id);
  }, [salesOrders, formData.so_id]);

  // Auto-populate material specs when item is selected
  useEffect(() => {
    if (selectedItem) {
      // Build material_size_mm from components if not directly available
      let materialSizeMm = selectedItem.material_size_mm || "";
      if (!materialSizeMm && selectedItem.default_nominal_size_mm) {
        const parts = [
          selectedItem.default_material_form,
          selectedItem.default_cross_section_shape,
          selectedItem.default_nominal_size_mm ? `${selectedItem.default_nominal_size_mm}mm` : null,
        ].filter(Boolean);
        materialSizeMm = parts.join(" ");
      }

      setFormData(prev => ({
        ...prev,
        item_code: selectedItem.item_code,
        alloy: selectedItem.alloy || "",
        material_form: selectedItem.default_material_form || "",
        cross_section_shape: selectedItem.default_cross_section_shape || "",
        nominal_size_mm: selectedItem.default_nominal_size_mm?.toString() || "",
        material_grade: selectedItem.default_material_grade || "",
        gross_weight_grams: selectedItem.gross_weight_grams?.toString() || "",
        net_weight_grams: selectedItem.net_weight_grams?.toString() || "",
        cycle_time_seconds: selectedItem.cycle_time_seconds?.toString() || "",
        material_size_mm: materialSizeMm,
      }));
    }
  }, [selectedItem]);

  // When sales order is selected, populate customer and PO
  useEffect(() => {
    if (selectedSO && !formData.customer_id) {
      setFormData(prev => ({
        ...prev,
        customer_id: selectedSO.customer_id,
        customer_po: selectedSO.po_number || "",
      }));
    }
  }, [selectedSO, formData.customer_id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.customer_id) {
      toast({ variant: "destructive", title: "Validation Error", description: "Please select a customer" });
      return;
    }
    if (!formData.item_id || !formData.item_code) {
      toast({ variant: "destructive", title: "Validation Error", description: "Please select an item" });
      return;
    }
    if (!formData.quantity || parseInt(formData.quantity) <= 0) {
      toast({ variant: "destructive", title: "Validation Error", description: "Please enter a valid quantity" });
      return;
    }
    if (!formData.due_date) {
      toast({ variant: "destructive", title: "Validation Error", description: "Please select a due date" });
      return;
    }
    if (!formData.customer_po) {
      toast({ variant: "destructive", title: "Validation Error", description: "Please enter a Customer PO" });
      return;
    }

    setLoading(true);

    try {
      // Build material_size_mm
      let materialSizeMm = formData.material_size_mm;
      if (!materialSizeMm && formData.nominal_size_mm) {
        const parts = [
          formData.material_form,
          formData.cross_section_shape,
          formData.nominal_size_mm ? `${formData.nominal_size_mm}mm` : null,
        ].filter(Boolean);
        materialSizeMm = parts.join(" ");
      }

      const insertData: any = {
        customer: selectedCustomer?.customer_name || "",
        customer_id: formData.customer_id || null,
        customer_po: formData.customer_po || null,
        item_code: formData.item_code,
        revision: formData.revision || null,
        quantity: parseInt(formData.quantity),
        due_date: formData.due_date,
        priority: parseInt(formData.priority),
        sales_order: selectedSO?.so_id || null,
        so_id: formData.so_id || null,
        cutting_required: formData.cutting_required,
        forging_required: formData.forging_required,
        material_size_mm: materialSizeMm || null,
        gross_weight_per_pc: formData.gross_weight_grams ? parseFloat(formData.gross_weight_grams) / 1000 : null,
        net_weight_per_pc: formData.net_weight_grams ? parseFloat(formData.net_weight_grams) / 1000 : null,
        cycle_time_seconds: formData.cycle_time_seconds ? parseFloat(formData.cycle_time_seconds) : null,
        financial_snapshot: {
          alloy: formData.alloy || null,
          material_grade: formData.material_grade || null,
          material_form: formData.material_form || null,
          cross_section_shape: formData.cross_section_shape || null,
          nominal_size_mm: formData.nominal_size_mm ? parseFloat(formData.nominal_size_mm) : null,
        },
      };

      const { data: woData, error } = await supabase
        .from("work_orders")
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Work order created",
        description: `${woData.wo_number} created successfully`,
      });

      setCreatedWO(woData);
      setShowQR(true);
      
      setTimeout(() => navigate("/work-orders"), 3000);
    } catch (error: any) {
      console.error("Work order creation error:", error);
      toast({
        variant: "destructive",
        title: "Failed to create work order",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  // Check if we have material specs
  const hasMaterialSpecs = selectedItem && (
    formData.alloy || formData.material_grade || formData.material_form || 
    formData.cross_section_shape || formData.nominal_size_mm
  );

  const missingMaterialSpecs = selectedItem && !hasMaterialSpecs;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-4 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Create Work Order</CardTitle>
            <CardDescription>
              Select customer, item, and optionally link to a sales order. Material specifications will auto-populate from item master.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Customer & Sales Order Section */}
              <div className="space-y-4">
                <h3 className="font-medium text-sm text-muted-foreground">Customer & Order Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Customer Dropdown */}
                  <div className="space-y-2">
                    <Label>Customer <span className="text-destructive">*</span></Label>
                    <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={customerOpen}
                          className="w-full justify-between font-normal"
                        >
                          {selectedCustomer ? (
                            <span className="truncate">
                              {selectedCustomer.customer_name}
                              {selectedCustomer.party_code && (
                                <span className="text-muted-foreground ml-2">({selectedCustomer.party_code})</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              {customersLoading ? "Loading..." : "Select customer..."}
                            </span>
                          )}
                          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search customers..." />
                          <CommandList>
                            <CommandEmpty>No customer found.</CommandEmpty>
                            <CommandGroup>
                              {customers.map((customer) => (
                                <CommandItem
                                  key={customer.id}
                                  value={`${customer.customer_name} ${customer.party_code || ""}`}
                                  onSelect={() => {
                                    setFormData(prev => ({ 
                                      ...prev, 
                                      customer_id: customer.id,
                                      so_id: "", // Reset SO when customer changes
                                    }));
                                    setCustomerOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      formData.customer_id === customer.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <div className="flex flex-col">
                                    <span>{customer.customer_name}</span>
                                    {customer.party_code && (
                                      <span className="text-xs text-muted-foreground">{customer.party_code}</span>
                                    )}
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Customer PO */}
                  <div className="space-y-2">
                    <Label htmlFor="customer_po">Customer PO <span className="text-destructive">*</span></Label>
                    <Input
                      id="customer_po"
                      value={formData.customer_po}
                      onChange={(e) => setFormData({ ...formData, customer_po: e.target.value })}
                      placeholder="Enter PO number"
                      required
                    />
                  </div>
                </div>

                {/* Sales Order Dropdown */}
                <div className="space-y-2">
                  <Label>Sales Order (Optional - links WO to SO for material requirements)</Label>
                  <Popover open={soOpen} onOpenChange={setSOOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={soOpen}
                        className="w-full justify-between font-normal"
                        disabled={!formData.customer_id}
                      >
                        {selectedSO ? (
                          <span className="truncate flex items-center gap-2">
                            <Badge variant="outline" className="font-mono">{selectedSO.so_id}</Badge>
                            <span className="text-muted-foreground">PO: {selectedSO.po_number}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            {formData.customer_id 
                              ? (salesOrdersLoading ? "Loading..." : "Select sales order (optional)...") 
                              : "Select customer first"}
                          </span>
                        )}
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[500px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search sales orders..." />
                        <CommandList>
                          <CommandEmpty>No sales orders found for this customer.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="none"
                              onSelect={() => {
                                setFormData(prev => ({ ...prev, so_id: "" }));
                                setSOOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  !formData.so_id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <span className="text-muted-foreground">No Sales Order</span>
                            </CommandItem>
                            {salesOrders.map((so) => (
                              <CommandItem
                                key={so.id}
                                value={`${so.so_id} ${so.po_number}`}
                                onSelect={() => {
                                  setFormData(prev => ({ 
                                    ...prev, 
                                    so_id: so.id,
                                    customer_po: so.po_number || prev.customer_po,
                                  }));
                                  setSOOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    formData.so_id === so.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="font-mono">{so.so_id}</Badge>
                                  <span>PO: {so.po_number}</span>
                                  <Badge variant={so.status === "approved" ? "default" : "secondary"} className="ml-auto">
                                    {so.status}
                                  </Badge>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Item Selection Section */}
              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-medium text-sm text-muted-foreground">Item Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Item Dropdown */}
                  <div className="space-y-2">
                    <Label>Item Code <span className="text-destructive">*</span></Label>
                    <Popover open={itemOpen} onOpenChange={setItemOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={itemOpen}
                          className="w-full justify-between font-normal"
                        >
                          {selectedItem ? (
                            <span className="truncate">
                              <span className="font-mono">{selectedItem.item_code}</span>
                              {selectedItem.item_name && (
                                <span className="text-muted-foreground ml-2">- {selectedItem.item_name}</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              {itemsLoading ? "Loading..." : "Select item..."}
                            </span>
                          )}
                          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[500px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search items by code or name..." />
                          <CommandList>
                            <CommandEmpty>No item found.</CommandEmpty>
                            <CommandGroup>
                              {items.map((item) => (
                                <CommandItem
                                  key={item.id}
                                  value={`${item.item_code} ${item.item_name || ""} ${item.alloy || ""}`}
                                  onSelect={() => {
                                    setFormData(prev => ({ ...prev, item_id: item.id }));
                                    setItemOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      formData.item_id === item.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono font-medium">{item.item_code}</span>
                                      {item.alloy && <Badge variant="secondary" className="text-xs">{item.alloy}</Badge>}
                                    </div>
                                    {item.item_name && (
                                      <span className="text-xs text-muted-foreground">{item.item_name}</span>
                                    )}
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Revision */}
                  <div className="space-y-2">
                    <Label htmlFor="revision">Revision</Label>
                    <Input
                      id="revision"
                      value={formData.revision}
                      onChange={(e) => setFormData({ ...formData, revision: e.target.value })}
                      placeholder="Rev. A"
                    />
                  </div>
                </div>
              </div>

              {/* Material Specs Warning */}
              {missingMaterialSpecs && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    This item has no material specifications defined. Please update the Item Master with alloy, material form, shape, and size to ensure proper material requirement sync.
                  </AlertDescription>
                </Alert>
              )}

              {/* Material Specs (Auto-populated, read-only display) */}
              {selectedItem && hasMaterialSpecs && (
                <div className="space-y-4 pt-4 border-t bg-muted/50 rounded-lg p-4">
                  <h3 className="font-medium text-sm text-muted-foreground">Material Specifications (from Item Master)</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Alloy:</span>
                      <span className="ml-2 font-medium">{formData.alloy || "-"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Grade:</span>
                      <span className="ml-2 font-medium">{formData.material_grade || "-"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Form:</span>
                      <span className="ml-2 font-medium capitalize">{formData.material_form || "-"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Shape:</span>
                      <span className="ml-2 font-medium capitalize">{formData.cross_section_shape || "-"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Size:</span>
                      <span className="ml-2 font-medium">{formData.nominal_size_mm ? `${formData.nominal_size_mm}mm` : "-"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Gross Wt:</span>
                      <span className="ml-2 font-medium">{formData.gross_weight_grams ? `${formData.gross_weight_grams}g` : "-"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Net Wt:</span>
                      <span className="ml-2 font-medium">{formData.net_weight_grams ? `${formData.net_weight_grams}g` : "-"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Cycle Time:</span>
                      <span className="ml-2 font-medium">{formData.cycle_time_seconds ? `${formData.cycle_time_seconds}s` : "-"}</span>
                    </div>
                  </div>
                  {formData.material_size_mm && (
                    <div className="pt-2 border-t">
                      <span className="text-muted-foreground text-sm">Material Size String:</span>
                      <span className="ml-2 font-mono text-sm font-medium">{formData.material_size_mm}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Quantity, Due Date, Priority */}
              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-medium text-sm text-muted-foreground">Order Requirements</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Quantity <span className="text-destructive">*</span></Label>
                    <Input
                      id="quantity"
                      type="number"
                      min="1"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                      placeholder="Enter quantity"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="due_date">Due Date <span className="text-destructive">*</span></Label>
                    <Input
                      id="due_date"
                      type="date"
                      value={formData.due_date}
                      onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="priority">Priority</Label>
                    <Select
                      value={formData.priority}
                      onValueChange={(value) => setFormData({ ...formData, priority: value })}
                    >
                      <SelectTrigger id="priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">P1 - Critical</SelectItem>
                        <SelectItem value="2">P2 - High</SelectItem>
                        <SelectItem value="3">P3 - Normal</SelectItem>
                        <SelectItem value="4">P4 - Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Processing Requirements */}
              <div className="space-y-3 pt-4 border-t">
                <Label>Processing Requirements</Label>
                <div className="flex flex-wrap gap-6">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="cutting_required"
                      checked={formData.cutting_required}
                      onCheckedChange={(checked) => 
                        setFormData({ ...formData, cutting_required: checked as boolean })
                      }
                    />
                    <label
                      htmlFor="cutting_required"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Cutting Required
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="forging_required"
                      checked={formData.forging_required}
                      onCheckedChange={(checked) => 
                        setFormData({ ...formData, forging_required: checked as boolean })
                      }
                    />
                    <label
                      htmlFor="forging_required"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Forging Required
                    </label>
                  </div>
                </div>
              </div>

              <Button type="submit" disabled={loading} className="w-full" size="lg">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Work Order
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
      
      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Work Order Created!</DialogTitle>
            <DialogDescription>Scan QR code to track this work order</DialogDescription>
          </DialogHeader>
          {createdWO && (
            <div className="flex justify-center">
              <QRCodeDisplay 
                value={createdWO.wo_number}
                title="Work Order Traveler"
                entityInfo={`${createdWO.wo_number} | ${createdWO.customer} | ${createdWO.item_code} | ${createdWO.quantity} pcs`}
                size={250}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default NewWorkOrder;
