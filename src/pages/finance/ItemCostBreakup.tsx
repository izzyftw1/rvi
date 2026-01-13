/**
 * Item Cost Breakup Page
 * Single source of truth for item costing - replaces Excel cost breakup sheets
 * Supports Domestic and Export profiles with full revision control
 */
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useItemCostBreakup, computeCosts, CostBreakupInputs } from "@/hooks/useItemCostBreakup";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { 
  Home, 
  Calculator, 
  Save, 
  History, 
  Package, 
  Wrench, 
  TrendingUp, 
  Truck, 
  DollarSign,
  AlertCircle,
  ChevronRight,
  RefreshCw,
  FileSpreadsheet,
  Globe,
  Building
} from "lucide-react";
import { format } from "date-fns";

interface ItemOption {
  id: string;
  item_code: string;
  item_name: string | null;
  default_material_grade: string | null;
  estimated_gross_weight_g: number | null;
  estimated_net_weight_g: number | null;
  estimated_cycle_time_s: number | null;
  gross_weight_grams: number | null;
  net_weight_grams: number | null;
  cycle_time_seconds: number | null;
}

export default function ItemCostBreakup() {
  const { toast } = useToast();
  const [items, setItems] = useState<ItemOption[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [selectedItem, setSelectedItem] = useState<ItemOption | null>(null);
  const [costProfile, setCostProfile] = useState<'domestic' | 'export'>('domestic');
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [changeReason, setChangeReason] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [showRevisions, setShowRevisions] = useState(false);
  const [itemSearch, setItemSearch] = useState("");

  const {
    loading,
    saving,
    breakup,
    inputs,
    computed,
    revisions,
    loadBreakup,
    saveBreakup,
    updateInput,
    resetInputs,
    setInputs,
  } = useItemCostBreakup();

  // Load items on mount
  useEffect(() => {
    loadItems();
  }, []);

  // Load breakup when item or profile changes
  useEffect(() => {
    if (selectedItemId) {
      loadBreakup(selectedItemId, costProfile);
    }
  }, [selectedItemId, costProfile, loadBreakup]);

  const loadItems = async () => {
    const { data, error } = await supabase
      .from('item_master')
      .select('id, item_code, item_name, default_material_grade, estimated_gross_weight_g, estimated_net_weight_g, estimated_cycle_time_s, gross_weight_grams, net_weight_grams, cycle_time_seconds')
      .order('item_code');
    
    if (!error && data) {
      setItems(data);
    }
  };

  const handleItemSelect = (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    setSelectedItemId(itemId);
    setSelectedItem(item || null);
    setShowRevisions(false);
  };

  const handleProfileChange = (profile: 'domestic' | 'export') => {
    setCostProfile(profile);
    // Keep the current profile input when switching
    setInputs(prev => ({ ...prev, costProfile: profile }));
  };

  const handleSave = async () => {
    if (!selectedItemId) {
      toast({ variant: 'destructive', description: 'Please select an item first' });
      return;
    }
    await saveBreakup(selectedItemId, changeReason, effectiveDate);
    setSaveDialogOpen(false);
    setChangeReason("");
  };

  const formatCurrency = (value: number) => {
    return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  };

  const formatNumber = (value: number, decimals = 2) => {
    return value.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const filteredItems = items.filter(item => 
    item.item_code.toLowerCase().includes(itemSearch.toLowerCase()) ||
    item.item_name?.toLowerCase().includes(itemSearch.toLowerCase()) ||
    item.default_material_grade?.toLowerCase().includes(itemSearch.toLowerCase())
  );

  const InputField = ({ 
    label, 
    value, 
    onChange, 
    suffix, 
    hint,
    readOnly = false
  }: { 
    label: string; 
    value: number; 
    onChange?: (val: number) => void;
    suffix?: string;
    hint?: string;
    readOnly?: boolean;
  }) => (
    <div className="space-y-1">
      <Label className="text-sm">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          step="any"
          value={value || ''}
          onChange={(e) => onChange?.(parseFloat(e.target.value) || 0)}
          className={`pr-12 ${readOnly ? 'bg-muted' : ''}`}
          readOnly={readOnly}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  const ComputedField = ({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) => (
    <div className={`p-3 rounded-lg ${highlight ? 'bg-primary/10 border border-primary/20' : 'bg-muted/50'}`}>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-lg font-semibold ${highlight ? 'text-primary' : ''}`}>{value}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/" className="flex items-center gap-1">
                <Home className="h-4 w-4" />
                Home
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/finance/dashboard">Finance</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Item Cost Breakup</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Calculator className="h-6 w-6" />
              Item Cost Breakup
            </h1>
            <p className="text-muted-foreground mt-1">
              Formula-driven costing with full revision control
            </p>
          </div>
          {selectedItemId && (
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => setShowRevisions(!showRevisions)}
              >
                <History className="h-4 w-4 mr-2" />
                {showRevisions ? 'Hide' : 'Show'} History
              </Button>
              <Button 
                onClick={() => setSaveDialogOpen(true)}
                disabled={saving || !selectedItemId}
              >
                <Save className="h-4 w-4 mr-2" />
                {breakup ? 'Save New Revision' : 'Create Cost Breakup'}
              </Button>
            </div>
          )}
        </div>

        {/* Item Selection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="h-5 w-5" />
              Select Item
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <Label>Item Code / Drawing Number</Label>
                <Select value={selectedItemId} onValueChange={handleItemSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an item..." />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="p-2">
                      <Input
                        placeholder="Search items..."
                        value={itemSearch}
                        onChange={(e) => setItemSearch(e.target.value)}
                        className="mb-2"
                      />
                    </div>
                    {filteredItems.slice(0, 50).map(item => (
                      <SelectItem key={item.id} value={item.id}>
                        <div className="flex items-center gap-2">
                          <span className="font-mono">{item.item_code}</span>
                          {item.item_name && (
                            <span className="text-muted-foreground">— {item.item_name}</span>
                          )}
                          {item.default_material_grade && (
                            <Badge variant="outline" className="text-xs">{item.default_material_grade}</Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cost Profile</Label>
                <Tabs value={costProfile} onValueChange={(v) => handleProfileChange(v as 'domestic' | 'export')}>
                  <TabsList className="w-full">
                    <TabsTrigger value="domestic" className="flex-1 gap-2">
                      <Building className="h-4 w-4" />
                      Domestic
                    </TabsTrigger>
                    <TabsTrigger value="export" className="flex-1 gap-2">
                      <Globe className="h-4 w-4" />
                      Export
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>

            {selectedItem && (
              <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Item Code</p>
                    <p className="font-mono font-medium">{selectedItem.item_code}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Material</p>
                    <p>{selectedItem.default_material_grade || '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Current Revision</p>
                    <p>
                      {breakup ? (
                        <Badge>Rev {breakup.currentRevisionNumber}</Badge>
                      ) : (
                        <Badge variant="outline">New</Badge>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Last Updated</p>
                    <p>{breakup ? format(new Date(breakup.updatedAt), 'dd MMM yyyy') : '—'}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {selectedItemId && (
          <>
            {/* Cost Sections */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Raw Material Costing */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Package className="h-5 w-5 text-orange-500" />
                    Raw Material Costing
                  </CardTitle>
                  <CardDescription>Weight and material rate inputs</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <InputField
                      label="Gross Weight / Piece"
                      value={inputs.grossWeightPerPiece}
                      onChange={(v) => updateInput('grossWeightPerPiece', v)}
                      suffix="g"
                    />
                    <InputField
                      label="Net Weight / Piece"
                      value={inputs.netWeightPerPiece}
                      onChange={(v) => updateInput('netWeightPerPiece', v)}
                      suffix="g"
                    />
                  </div>
                  <Separator />
                  <div className="grid grid-cols-2 gap-4">
                    <InputField
                      label="Rod/Section Rate"
                      value={inputs.rodSectionRatePerKg}
                      onChange={(v) => updateInput('rodSectionRatePerKg', v)}
                      suffix="₹/kg"
                    />
                    <InputField
                      label="Scrap Recovery %"
                      value={inputs.scrapRecoveryPercent}
                      onChange={(v) => updateInput('scrapRecoveryPercent', v)}
                      suffix="%"
                    />
                  </div>
                  <InputField
                    label="Scrap Rate"
                    value={inputs.scrapRatePerKg}
                    onChange={(v) => updateInput('scrapRatePerKg', v)}
                    suffix="₹/kg"
                    hint="Realisable scrap value per kg"
                  />
                  <Separator />
                  <div className="grid grid-cols-3 gap-3">
                    <ComputedField
                      label="Gross RM Cost"
                      value={formatCurrency(computed.grossRmCostPerPiece)}
                    />
                    <ComputedField
                      label="Less: Scrap Value"
                      value={formatCurrency(computed.scrapRealisableValue)}
                    />
                    <ComputedField
                      label="Net RM Cost"
                      value={formatCurrency(computed.netRmCostPerPiece)}
                      highlight
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Manufacturing Cost */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Wrench className="h-5 w-5 text-blue-500" />
                    Manufacturing / Conversion Cost
                  </CardTitle>
                  <CardDescription>CNC machining cost calculation</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <InputField
                      label="CNC Cycle Time"
                      value={inputs.cncCycleTimeSeconds}
                      onChange={(v) => updateInput('cncCycleTimeSeconds', v)}
                      suffix="sec"
                    />
                    <InputField
                      label="Machine Rate"
                      value={inputs.machineRatePerHour}
                      onChange={(v) => updateInput('machineRatePerHour', v)}
                      suffix="₹/hr"
                    />
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-2">Formula</p>
                    <p className="text-sm font-mono">
                      ({formatNumber(inputs.cncCycleTimeSeconds)} sec ÷ 3600) × {formatCurrency(inputs.machineRatePerHour)}/hr
                    </p>
                  </div>
                  <ComputedField
                    label="Machining Cost / Piece"
                    value={formatCurrency(computed.machiningCostPerPiece)}
                    highlight
                  />
                </CardContent>
              </Card>

              {/* Quality Impact */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-yellow-500" />
                    Quality Impact
                  </CardTitle>
                  <CardDescription>Rejection allowance costing</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <InputField
                    label="Rejection Allowance"
                    value={inputs.rejectionAllowancePercent}
                    onChange={(v) => updateInput('rejectionAllowancePercent', v)}
                    suffix="%"
                    hint="Applied to (RM + Machining + Packing) cost"
                  />
                  <ComputedField
                    label="Rejection Cost / Piece"
                    value={formatCurrency(computed.rejectionCostPerPiece)}
                    highlight
                  />
                </CardContent>
              </Card>

              {/* Logistics & Packing */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Truck className="h-5 w-5 text-green-500" />
                    Logistics & Packing
                  </CardTitle>
                  <CardDescription>
                    {costProfile === 'export' ? 'Export includes freight charges' : 'Domestic excludes freight'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <InputField
                    label="Packing Charge"
                    value={inputs.packingChargePerPiece}
                    onChange={(v) => updateInput('packingChargePerPiece', v)}
                    suffix="₹/pc"
                  />
                  <div className={costProfile === 'domestic' ? 'opacity-50' : ''}>
                    <InputField
                      label="Freight Charge"
                      value={inputs.freightChargePerPiece}
                      onChange={(v) => updateInput('freightChargePerPiece', v)}
                      suffix="₹/pc"
                      hint={costProfile === 'domestic' ? 'Not applicable for domestic costing' : 'Included in export costing'}
                      readOnly={costProfile === 'domestic'}
                    />
                  </div>
                  {costProfile === 'export' && (
                    <Badge variant="secondary" className="mt-2">
                      <Globe className="h-3 w-3 mr-1" />
                      Freight included in total cost
                    </Badge>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Commercial Output Summary */}
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-primary" />
                  Commercial Output
                </CardTitle>
                <CardDescription>Final cost and margin analysis</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                  <InputField
                    label="Selling Price / Piece"
                    value={inputs.sellingPricePerPiece}
                    onChange={(v) => updateInput('sellingPricePerPiece', v)}
                    suffix="₹"
                  />
                </div>
                <Separator className="my-4" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <ComputedField
                    label="Total Cost / Piece"
                    value={formatCurrency(computed.totalCostPerPiece)}
                    highlight
                  />
                  <ComputedField
                    label="Cost / Kg"
                    value={formatCurrency(computed.costPerKg)}
                  />
                  <ComputedField
                    label="Price / Piece"
                    value={formatCurrency(computed.pricePerPiece)}
                  />
                  <ComputedField
                    label="Gross Profit %"
                    value={`${formatNumber(computed.grossProfitPercent)}%`}
                    highlight
                  />
                </div>

                {/* Cost Breakdown Table */}
                <div className="mt-6">
                  <h4 className="font-medium mb-3">Cost Breakdown Summary</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Component</TableHead>
                        <TableHead className="text-right">₹ / Piece</TableHead>
                        <TableHead className="text-right">% of Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>Net Raw Material</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(computed.netRmCostPerPiece)}</TableCell>
                        <TableCell className="text-right">{computed.totalCostPerPiece > 0 ? formatNumber((computed.netRmCostPerPiece / computed.totalCostPerPiece) * 100) : 0}%</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Machining</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(computed.machiningCostPerPiece)}</TableCell>
                        <TableCell className="text-right">{computed.totalCostPerPiece > 0 ? formatNumber((computed.machiningCostPerPiece / computed.totalCostPerPiece) * 100) : 0}%</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Rejection Allowance</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(computed.rejectionCostPerPiece)}</TableCell>
                        <TableCell className="text-right">{computed.totalCostPerPiece > 0 ? formatNumber((computed.rejectionCostPerPiece / computed.totalCostPerPiece) * 100) : 0}%</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Packing</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(inputs.packingChargePerPiece)}</TableCell>
                        <TableCell className="text-right">{computed.totalCostPerPiece > 0 ? formatNumber((inputs.packingChargePerPiece / computed.totalCostPerPiece) * 100) : 0}%</TableCell>
                      </TableRow>
                      {costProfile === 'export' && (
                        <TableRow>
                          <TableCell>Freight</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(inputs.freightChargePerPiece)}</TableCell>
                          <TableCell className="text-right">{computed.totalCostPerPiece > 0 ? formatNumber((inputs.freightChargePerPiece / computed.totalCostPerPiece) * 100) : 0}%</TableCell>
                        </TableRow>
                      )}
                      <TableRow className="font-bold border-t-2">
                        <TableCell>Total Cost</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(computed.totalCostPerPiece)}</TableCell>
                        <TableCell className="text-right">100%</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Revision History */}
            {showRevisions && revisions.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <History className="h-5 w-5" />
                    Revision History
                  </CardTitle>
                  <CardDescription>All cost revisions are immutable and auditable</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Rev</TableHead>
                        <TableHead>Effective Date</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Change Reason</TableHead>
                        <TableHead className="text-right">Total Cost</TableHead>
                        <TableHead className="text-right">Selling Price</TableHead>
                        <TableHead className="text-right">Margin %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {revisions.map((rev) => (
                        <TableRow key={rev.id}>
                          <TableCell>
                            <Badge variant={rev.revisionNumber === breakup?.currentRevisionNumber ? 'default' : 'outline'}>
                              {rev.revisionNumber}
                            </Badge>
                          </TableCell>
                          <TableCell>{format(new Date(rev.effectiveDate), 'dd MMM yyyy')}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(new Date(rev.createdAt), 'dd MMM yyyy HH:mm')}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {rev.changeReason || '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(rev.computed.totalCostPerPiece)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(rev.inputs.sellingPricePerPiece)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(rev.computed.grossProfitPercent)}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {!selectedItemId && (
          <Card className="p-12">
            <div className="text-center text-muted-foreground">
              <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Select an item to view or create cost breakup</p>
              <p className="text-sm mt-2">
                Choose from the Item Master to manage domestic and export costing with full revision control
              </p>
            </div>
          </Card>
        )}
      </div>

      {/* Save Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {breakup ? `Create Revision ${breakup.currentRevisionNumber + 1}` : 'Create Cost Breakup'}
            </DialogTitle>
            <DialogDescription>
              This will create an immutable revision record for audit purposes
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Effective Date</Label>
              <Input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Change Reason (Optional)</Label>
              <Textarea
                placeholder="e.g., Q1 2024 rate revision, New machine rate applied..."
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Revision
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
