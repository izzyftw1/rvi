import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import {
  Package, Search, Truck, ArrowDownToLine, ArrowUpFromLine,
  Plus, RefreshCw, FileText, Calendar, Building2, Home, Scale,
  Printer, Tag, Box, Factory, Trash2
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { GateTagPrintDialog } from "@/components/logistics/GateTagPrintDialog";
import { PROCESS_TYPES } from "@/config/materialMasters";
import { PackagingCalculator, PackagingRow, PACKAGING_OPTIONS } from "@/components/logistics/PackagingCalculator";
import { PCSEstimationSection, PCSEstimation } from "@/components/logistics/PCSEstimationSection";
import { createExecutionRecord } from "@/hooks/useExecutionRecord";
import { useCanViewCustomerName } from "@/hooks/useCustomerDisplay";

interface Supplier {
  id: string;
  name: string;
}

interface Partner {
  id: string;
  name: string;
  process_type: string;
}

interface Customer {
  id: string;
  customer_name: string;
  party_code: string | null;
}

interface WorkOrder {
  id: string;
  wo_number: string;
  item_code: string;
  customer: string | null;
  quantity: number;
}

interface RPO {
  id: string;
  rpo_no: string;
  material_size_mm: string | null;
  alloy: string | null;
  qty_ordered_kg: number;
  rate_per_kg: number | null;
  expected_delivery_date: string | null;
  status: string;
  supplier_id: string | null;
  wo_id: string | null;
  item_code: string | null;
  supplier_name?: string;
  total_received_kg?: number;
  remaining_kg?: number;
}

interface GateEntry {
  id: string;
  gate_entry_no: string;
  direction: 'IN' | 'OUT';
  material_type: string;
  entry_date: string;
  entry_time: string;
  item_name: string | null;
  rod_section_size: string | null;
  material_grade: string | null;
  alloy: string | null;
  heat_no: string | null;
  tc_number: string | null;
  gross_weight_kg: number;
  net_weight_kg: number;
  tare_weight_kg: number;
  packaging_count: number | null;
  estimated_pcs: number | null;
  supplier_name: string | null;
  party_code: string | null;
  process_type: string | null;
  challan_no: string | null;
  dc_number: string | null;
  vehicle_no: string | null;
  transporter: string | null;
  status: string;
  qc_required: boolean;
  qc_status: string;
  tag_printed: boolean;
  challan_printed: boolean;
  remarks: string | null;
  work_order_id: string | null;
  customer_id: string | null;
  wo_number?: string | null;
}

interface MaterialGrade {
  id: string;
  name: string;
  category: string | null;
}

interface MaterialForm {
  id: string;
  name: string;
}

interface CrossSectionShape {
  id: string;
  name: string;
  has_inner_diameter: boolean;
}

interface NominalSize {
  id: string;
  size_value: number;
  unit: string | null;
  display_label: string | null;
  shape_id?: string | null;
}

interface ProcessTypeMaster {
  name: string;
}

type GateEntryRow = {
  id: string;
  gate_entry_no: string;
  direction: string;
  material_type: string;
  entry_date: string;
  entry_time: string;
  item_name: string | null;
  rod_section_size: string | null;
  material_grade: string | null;
  alloy: string | null;
  heat_no: string | null;
  tc_number: string | null;
  gross_weight_kg: number;
  net_weight_kg: number;
  tare_weight_kg: number;
  packaging_count: number | null;
  estimated_pcs: number | null;
  supplier_name: string | null;
  party_code: string | null;
  process_type: string | null;
  challan_no: string | null;
  dc_number: string | null;
  vehicle_no: string | null;
  transporter: string | null;
  status: string;
  qc_required: boolean;
  qc_status: string;
  tag_printed: boolean;
  challan_printed: boolean;
  remarks: string | null;
  work_order_id: string | null;
  customer_id: string | null;
};

const MATERIAL_TYPES = [
  { value: 'raw_material', label: 'Raw Material', icon: Package },
  { value: 'external_process', label: 'External Process', icon: Factory },
  { value: 'finished_goods', label: 'Finished Goods', icon: Box },
  { value: 'scrap', label: 'Scrap', icon: Trash2 },
  { value: 'other', label: 'Other', icon: Package },
];

// PROCESS_TYPES will be loaded from external_partners distinct process_types

export default function GateRegister() {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const { canView: canViewCustomerName } = useCanViewCustomerName();
  const [activeTab, setActiveTab] = useState<'goods_in' | 'goods_out' | 'ledger'>('goods_in');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [prefilledRPO, setPrefilledRPO] = useState<any>(null);

  // Master data - removed packagingTypes state (now using standardized PACKAGING_OPTIONS)
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [materialGrades, setMaterialGrades] = useState<MaterialGrade[]>([]);
  const [materialForms, setMaterialForms] = useState<MaterialForm[]>([]);
  const [crossSectionShapes, setCrossSectionShapes] = useState<CrossSectionShape[]>([]);
  const [nominalSizes, setNominalSizes] = useState<NominalSize[]>([]);
  const [processTypes, setProcessTypes] = useState<string[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [rpos, setRpos] = useState<RPO[]>([]);

  // Gate entries ledger
  const [entries, setEntries] = useState<GateEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDirection, setFilterDirection] = useState<'all' | 'IN' | 'OUT'>('all');
  const [filterMaterialType, setFilterMaterialType] = useState<string>('all');

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [formDirection, setFormDirection] = useState<'IN' | 'OUT'>('IN');
  const [formData, setFormData] = useState({
    material_type: 'raw_material',
    material_form: '',
    cross_section_shape: '',
    item_name: '',
    rod_section_size: '',
    material_grade: '',
    alloy: '',
    heat_no: '',
    tc_number: '',
    gross_weight_kg: '',
    supplier_id: '',
    supplier_name: '',
    party_code: '',
    customer_id: '',
    partner_id: '',
    process_type: '',
    work_order_id: '',
    challan_no: '',
    dc_number: '',
    vehicle_no: '',
    transporter: '',
    qc_required: true,
    remarks: '',
    rpo_id: '',
  });

  // NEW: Packaging state managed by PackagingCalculator
  const [packagingRows, setPackagingRows] = useState<PackagingRow[]>([
    { id: crypto.randomUUID(), type: 'NONE', count: 1 }
  ]);
  const [tareWeight, setTareWeight] = useState(0);
  const [netWeight, setNetWeight] = useState(0);
  const [manualTareOverride, setManualTareOverride] = useState<number | null>(null);

  // NEW: PCS Estimation state (only for external processes)
  const [pcsEstimation, setPcsEstimation] = useState<PCSEstimation>({
    sampleCount: null,
    sampleWeight: null,
    avgWeightPerPc: null,
    estimatedPcs: null
  });

  // Memoized PCS estimation change handler to prevent re-renders
  const handlePcsEstimationChange = useCallback((estimation: PCSEstimation) => {
    setPcsEstimation(estimation);
  }, []);

  // Filtered nominal sizes based on selected shape
  const filteredNominalSizes = useMemo(() => {
    if (!formData.cross_section_shape) return nominalSizes;
    const selectedShape = crossSectionShapes.find(s => s.name === formData.cross_section_shape);
    if (!selectedShape) return nominalSizes;
    // Filter sizes by shape_id if available, otherwise return all
    return nominalSizes.filter(s => !s.shape_id || s.shape_id === selectedShape.id);
  }, [formData.cross_section_shape, nominalSizes, crossSectionShapes]);

  // Check if selected shape needs inner diameter
  const selectedShape = crossSectionShapes.find(s => s.name === formData.cross_section_shape);
  const showInnerDiameter = selectedShape?.has_inner_diameter || false;

  // Print dialog
  const [printEntry, setPrintEntry] = useState<GateEntry | null>(null);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);

  // Gross weight for calculations
  const grossWeight = parseFloat(formData.gross_weight_kg) || 0;

  // Handle packaging changes from PackagingCalculator
  const handlePackagingChange = (
    newNetWeight: number, 
    newTareWeight: number, 
    newPackagingRows: PackagingRow[],
    newManualTare: number | null
  ) => {
    setNetWeight(newNetWeight);
    setTareWeight(newTareWeight);
    setPackagingRows(newPackagingRows);
    setManualTareOverride(newManualTare);
  };

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      await Promise.all([
        loadSuppliers(),
        loadPartners(),
        loadMaterialGrades(),
        loadMaterialForms(),
        loadCrossSectionShapes(),
        loadNominalSizes(),
        loadProcessTypes(),
        loadCustomers(),
        loadWorkOrders(),
        loadEntries(),
        loadRPOs()
      ]);
      
      // Check for RPO pre-fill from URL params (coming from Raw PO "Receive" button)
      const rpoId = searchParams.get('rpo_id');
      const materialType = searchParams.get('material_type');
      const direction = searchParams.get('direction');
      
      if (rpoId && materialType === 'raw_material' && direction === 'IN') {
        await loadRPOForPrefill(rpoId);
      }
    };
    init();

    // Realtime subscription
    const channel = supabase
      .channel('gate-register-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gate_register' }, () => loadEntries())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'raw_purchase_orders' }, () => loadRPOs())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'raw_po_receipts' }, () => loadRPOs())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [searchParams]);
  
  // Load RPO data for pre-filling the gate register form
  const loadRPOForPrefill = async (rpoId: string) => {
    try {
      const { data: rpo, error } = await supabase
        .from("raw_purchase_orders")
        .select(`
          *,
          suppliers(id, name),
          work_orders(id, wo_id)
        `)
        .eq("id", rpoId)
        .single();
      
      if (error) throw error;
      if (!rpo) return;
      
      setPrefilledRPO(rpo);
      setActiveTab('goods_in');
      setFormDirection('IN');
      setFormOpen(true);
      
      // Pre-fill form with RPO data
      setFormData(prev => ({
        ...prev,
        material_type: 'raw_material',
        rpo_id: rpo.id,
        rod_section_size: rpo.material_size_mm || '',
        alloy: rpo.alloy || '',
        material_grade: rpo.alloy || '',
        supplier_id: rpo.supplier_id || '',
        supplier_name: rpo.suppliers?.name || '',
        work_order_id: rpo.wo_id || '',
        remarks: `RPO: ${rpo.rpo_no}`,
      }));
      
      toast({ 
        title: "RPO Loaded", 
        description: `Pre-filled from ${rpo.rpo_no}. Enter weight and heat number to complete.` 
      });
    } catch (error: any) {
      console.error("Error loading RPO:", error);
      toast({ variant: "destructive", description: "Failed to load RPO data" });
    }
  };

  // NOTE: loadPackagingTypes is no longer needed - using standardized PACKAGING_OPTIONS
  // Kept for backwards compatibility but does nothing now

  const loadSuppliers = async () => {
    const { data } = await supabase
      .from("suppliers")
      .select("id, name")
      .order("name");
    if (data) {
      setSuppliers(data.map(s => ({ id: s.id, name: s.name })));
    }
  };

  const loadPartners = async () => {
    const { data } = await supabase
      .from("external_partners")
      .select("id, name, process_type")
      .eq("is_active", true)
      .order("name");
    setPartners(data || []);
  };

  const loadMaterialGrades = async () => {
    const { data } = await supabase
      .from("material_grades")
      .select("id, name, category")
      .order("name");
    setMaterialGrades(data || []);
  };

  const loadMaterialForms = async () => {
    const { data } = await supabase
      .from("material_forms")
      .select("id, name")
      .order("name");
    setMaterialForms(data || []);
  };

  const loadCrossSectionShapes = async () => {
    const { data } = await supabase
      .from("cross_section_shapes")
      .select("id, name, has_inner_diameter")
      .order("name");
    setCrossSectionShapes(data || []);
  };

  const loadNominalSizes = async () => {
    const { data } = await supabase
      .from("nominal_sizes")
      .select("id, size_value, unit, display_label")
      .order("size_value");
    if (data) {
      setNominalSizes(data.map(d => ({
        id: d.id,
        size_value: d.size_value,
        unit: d.unit,
        display_label: d.display_label
      })));
    }
  };

  const loadProcessTypes = async () => {
    // Use shared PROCESS_TYPES from materialMasters as the source of truth
    // Supplement with any additional types from external_partners
    const { data } = await supabase
      .from("external_partners")
      .select("process_type")
      .eq("is_active", true);
    
    const partnerTypes = data?.map(p => p.process_type).filter(Boolean) || [];
    const allTypes = [...new Set([...PROCESS_TYPES, ...partnerTypes])].sort();
    setProcessTypes(allTypes);
  };

  const loadCustomers = async () => {
    const { data } = await supabase
      .from("customer_master")
      .select("id, customer_name, party_code")
      .order("customer_name");
    setCustomers(data || []);
  };

  const loadWorkOrders = async () => {
    const { data } = await supabase
      .from("work_orders")
      .select("id, wo_number, item_code, customer, quantity")
      .in("status", ["in_progress", "pending", "qc", "packing"])
      .order("created_at", { ascending: false })
      .limit(200);
    setWorkOrders(data?.map(wo => ({
      ...wo,
      customer: wo.customer || null
    })) || []);
  };

  // Load approved/part_received RPOs for raw material receiving
  const loadRPOs = async () => {
    const { data: rpoData, error } = await supabase
      .from("raw_purchase_orders")
      .select(`
        id, rpo_no, material_size_mm, alloy, qty_ordered_kg, rate_per_kg,
        expected_delivery_date, status, supplier_id, wo_id, item_code,
        suppliers(name)
      `)
      .in("status", ["approved", "part_received"])
      .order("created_at", { ascending: false });
    
    if (error) {
      console.error("Error loading RPOs:", error);
      return;
    }
    
    // Calculate received quantities for each RPO
    const rposWithReceipts = await Promise.all(
      (rpoData || []).map(async (rpo: any) => {
        const { data: receipts } = await supabase
          .from("raw_po_receipts")
          .select("qty_received_kg")
          .eq("rpo_id", rpo.id);
        
        const totalReceived = receipts?.reduce((sum, r) => sum + (r.qty_received_kg || 0), 0) || 0;
        const remaining = rpo.qty_ordered_kg - totalReceived;
        
        return {
          id: rpo.id,
          rpo_no: rpo.rpo_no,
          material_size_mm: rpo.material_size_mm,
          alloy: rpo.alloy,
          qty_ordered_kg: rpo.qty_ordered_kg,
          rate_per_kg: rpo.rate_per_kg,
          expected_delivery_date: rpo.expected_delivery_date,
          status: rpo.status,
          supplier_id: rpo.supplier_id,
          wo_id: rpo.wo_id,
          item_code: rpo.item_code,
          supplier_name: rpo.suppliers?.name || '',
          total_received_kg: totalReceived,
          remaining_kg: remaining,
        } as RPO;
      })
    );
    
    setRpos(rposWithReceipts);
  };

  // Parse material_size_mm to extract cross section shape and size
  // Examples: "22 MM HOLLOW", "25 HEX", "HEX 20", "25.5 HEX"
  const parseMaterialSizeInfo = (materialSizeMm: string | null): { shape: string; size: string; form: string } => {
    if (!materialSizeMm) return { shape: '', size: '', form: '' };
    
    const sizeStr = materialSizeMm.toUpperCase().trim();
    let shape = '';
    let size = '';
    let form = 'ROD'; // Default form
    
    // Known shapes to look for
    const knownShapes = ['HEX', 'HOLLOW', 'ROUND', 'SQUARE', 'FLAT', 'PIPE', 'TUBE', 'RECTANGLE', 'OCTAGON'];
    
    // Find shape in string
    for (const s of knownShapes) {
      if (sizeStr.includes(s)) {
        shape = s;
        break;
      }
    }
    
    // Extract numeric size - look for numbers (with optional decimal)
    const sizeMatch = sizeStr.match(/(\d+\.?\d*)/);
    if (sizeMatch) {
      size = `${sizeMatch[1]} mm`;
    }
    
    // Determine form based on shape
    if (['HOLLOW', 'PIPE', 'TUBE'].includes(shape)) {
      form = 'TUBE';
    } else if (['FLAT', 'RECTANGLE'].includes(shape)) {
      form = 'FLAT';
    }
    
    return { shape, size, form };
  };

  // Handle RPO selection - prefills form with RPO data including parsed material info
  const handleRPOChange = (rpoId: string) => {
    const rpo = rpos.find(r => r.id === rpoId);
    if (rpo) {
      // Parse material size to extract shape and size
      const parsedInfo = parseMaterialSizeInfo(rpo.material_size_mm);
      
      // Find matching cross section shape from loaded data
      const matchingShape = crossSectionShapes.find(
        s => s.name.toUpperCase() === parsedInfo.shape
      );
      
      // Find matching material form
      const matchingForm = materialForms.find(
        f => f.name.toUpperCase() === parsedInfo.form
      );
      
      setFormData(prev => ({
        ...prev,
        rpo_id: rpoId,
        // Auto-fill from parsed material info
        material_form: matchingForm?.name || parsedInfo.form || prev.material_form,
        cross_section_shape: matchingShape?.name || parsedInfo.shape || prev.cross_section_shape,
        rod_section_size: parsedInfo.size || rpo.material_size_mm || prev.rod_section_size,
        alloy: rpo.alloy || prev.alloy,
        material_grade: rpo.alloy || prev.material_grade,
        supplier_id: rpo.supplier_id || prev.supplier_id,
        supplier_name: rpo.supplier_name || prev.supplier_name,
        work_order_id: rpo.wo_id || prev.work_order_id,
        item_name: rpo.item_code || prev.item_name,
        remarks: `RPO: ${rpo.rpo_no}${prev.remarks && !prev.remarks.includes('RPO:') ? ` | ${prev.remarks}` : ''}`,
      }));
      
      toast({ 
        title: "RPO Selected", 
        description: `${rpo.rpo_no}: ${rpo.remaining_kg?.toFixed(1)} kg remaining. Material details auto-filled from PO.` 
      });
    } else {
      setFormData(prev => ({ ...prev, rpo_id: '' }));
    }
  };

  const loadEntries = async () => {
    const { data, error } = await supabase
      .from("gate_register")
      .select("*")
      .order("entry_time", { ascending: false })
      .limit(200);

    if (error) {
      console.error("Error loading entries:", error);
      return;
    }
    setEntries((data || []).map((d: GateEntryRow) => ({
      ...d,
      direction: d.direction as 'IN' | 'OUT'
    })));
  };

  const filteredEntries = useMemo(() => {
    return entries.filter(entry => {
      const matchesSearch = !searchTerm ||
        entry.gate_entry_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.heat_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.challan_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.item_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesDirection = filterDirection === 'all' || entry.direction === filterDirection;
      const matchesMaterialType = filterMaterialType === 'all' || entry.material_type === filterMaterialType;

      return matchesSearch && matchesDirection && matchesMaterialType;
    });
  }, [entries, searchTerm, filterDirection, filterMaterialType]);

  const openNewEntry = (direction: 'IN' | 'OUT') => {
    setFormDirection(direction);
    setFormData({
      material_type: 'raw_material',
      material_form: '',
      cross_section_shape: '',
      item_name: '',
      rod_section_size: '',
      material_grade: '',
      alloy: '',
      heat_no: '',
      tc_number: '',
      gross_weight_kg: '',
      supplier_id: '',
      supplier_name: '',
      party_code: '',
      customer_id: '',
      partner_id: '',
      process_type: '',
      work_order_id: '',
      challan_no: '',
      dc_number: '',
      vehicle_no: '',
      transporter: '',
      qc_required: direction === 'IN',
      remarks: '',
      rpo_id: '',
    });
    // Reset packaging to None/N/A (default for raw material)
    setPackagingRows([{ id: crypto.randomUUID(), type: 'NONE', count: 1 }]);
    setTareWeight(0);
    setNetWeight(0);
    setManualTareOverride(null);
    // Reset PCS estimation
    setPcsEstimation({
      sampleCount: null,
      sampleWeight: null,
      avgWeightPerPc: null,
      estimatedPcs: null
    });
    setFormOpen(true);
  };

  const handleSupplierChange = (supplierId: string) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    setFormData(prev => ({
      ...prev,
      supplier_id: supplierId,
      supplier_name: supplier?.name || ''
    }));
  };

  const handlePartnerChange = (partnerId: string) => {
    const partner = partners.find(p => p.id === partnerId);
    setFormData(prev => ({
      ...prev,
      partner_id: partnerId,
      supplier_name: partner?.name || '',
      process_type: partner?.process_type || prev.process_type
    }));
  };

  const handleWorkOrderChange = (workOrderId: string) => {
    const wo = workOrders.find(w => w.id === workOrderId);
    if (wo) {
      setFormData(prev => ({
        ...prev,
        work_order_id: workOrderId,
        item_name: wo.item_code, // Auto-fill item from work order
        party_code: wo.customer || prev.party_code
      }));
      // Also try to find and set customer
      const customer = customers.find(c => 
        c.customer_name === wo.customer || c.party_code === wo.customer
      );
      if (customer) {
        setFormData(prev => ({
          ...prev,
          customer_id: customer.id,
          party_code: customer.party_code || customer.customer_name
        }));
      }
    } else {
      setFormData(prev => ({ ...prev, work_order_id: workOrderId }));
    }
  };

  const handleSubmit = async () => {
    if (!formData.gross_weight_kg || parseFloat(formData.gross_weight_kg) <= 0) {
      toast({ variant: "destructive", description: "Gross weight is required" });
      return;
    }

    if (formDirection === 'OUT' && !formData.challan_no) {
      toast({ variant: "destructive", description: "Challan number is mandatory for goods out" });
      return;
    }

    if (formData.material_type === 'raw_material' && formDirection === 'IN' && !formData.heat_no) {
      toast({ variant: "destructive", description: "Heat number is required for raw material" });
      return;
    }

    setLoading(true);
    try {
      // --- Determine estimated_pcs: for external processes use PCS estimation OR fall back to qty from WO ---
      // POINT 11 FIX: Use net weight as fallback when estimated_pcs is 0
      let estimatedPcs: number | null = null;
      if (formData.material_type === 'external_process' && pcsEstimation.estimatedPcs) {
        estimatedPcs = pcsEstimation.estimatedPcs;
      }

      const effectiveNetWeight = netWeight > 0 ? netWeight : grossWeight;

      // Explicitly typed payload to avoid TS2589
      const insertPayload: {
        direction: string;
        material_type: string;
        gate_entry_no: string;
        gross_weight_kg: number;
        tare_weight_kg: number;
        net_weight_kg?: number | null;
        status: string;
        estimated_pcs?: number | null;
        avg_weight_per_pc?: number | null;
        pcs_sample_count?: number | null;
        pcs_sample_weight?: number | null;
        item_name?: string | null;
        rod_section_size?: string | null;
        material_grade?: string | null;
        alloy?: string | null;
        heat_no?: string | null;
        tc_number?: string | null;
        packaging_type_id?: string | null;
        packaging_count?: number | null;
        supplier_id?: string | null;
        supplier_name?: string | null;
        party_code?: string | null;
        customer_id?: string | null;
        partner_id?: string | null;
        process_type?: string | null;
        work_order_id?: string | null;
        rpo_id?: string | null;
        challan_no?: string | null;
        dc_number?: string | null;
        vehicle_no?: string | null;
        transporter?: string | null;
        qc_required?: boolean | null;
        qc_status?: string | null;
        remarks?: string | null;
        created_by?: string | null;
      } = {
        direction: formDirection,
        material_type: formData.material_type,
        gate_entry_no: `GIN-${Date.now()}`,
        gross_weight_kg: grossWeight,
        tare_weight_kg: tareWeight,
        net_weight_kg: effectiveNetWeight,
        status: 'completed',
        estimated_pcs: estimatedPcs,
        avg_weight_per_pc: formData.material_type === 'external_process' && pcsEstimation.avgWeightPerPc
          ? pcsEstimation.avgWeightPerPc
          : null,
        pcs_sample_count: formData.material_type === 'external_process' && pcsEstimation.sampleCount
          ? pcsEstimation.sampleCount
          : null,
        pcs_sample_weight: formData.material_type === 'external_process' && pcsEstimation.sampleWeight
          ? pcsEstimation.sampleWeight
          : null,
        item_name: formData.item_name || null,
        rod_section_size: formData.rod_section_size || null,
        material_grade: formData.material_grade || null,
        alloy: formData.alloy || null,
        heat_no: formData.heat_no || null,
        tc_number: formData.tc_number || null,
        packaging_type_id: null,
        packaging_count: packagingRows.filter(r => r.type !== 'NONE').reduce((sum, r) => sum + r.count, 0) || null,
        supplier_id: formData.supplier_id || null,
        supplier_name: formData.supplier_name || null,
        party_code: formData.party_code || null,
        partner_id: formData.partner_id || null,
        process_type: formData.process_type || null,
        work_order_id: formData.work_order_id || null,
        rpo_id: formData.rpo_id || null,
        customer_id: formData.customer_id || null,
        challan_no: formData.challan_no || null,
        dc_number: formData.dc_number || null,
        vehicle_no: formData.vehicle_no || null,
        transporter: formData.transporter || null,
        qc_required: formData.qc_required,
        qc_status: formData.qc_required ? 'pending' : 'not_required',
        remarks: formData.remarks || null,
        created_by: user?.id || null,
      };

      const { data, error } = await supabase
        .from("gate_register")
        .insert(insertPayload)
        .select()
        .single();

      if (error) throw error;

      // ===================================================================
      // RAW MATERIAL RECEIPT WORKFLOW (Points 1-10)
      // ===================================================================
      if (formData.material_type === 'raw_material' && formDirection === 'IN') {
        const receivedQtyKg = effectiveNetWeight;
        const supplierName = formData.supplier_name || suppliers.find(s => s.id === formData.supplier_id)?.name || 'Unknown';

        // POINT 5: Create material_lots record (triggers production notification)
        const materialLotId = `ML-${data.gate_entry_no}-${formData.heat_no || 'NH'}`;
        const { data: materialLotData, error: materialLotError } = await supabase
          .from("material_lots")
          .insert({
            lot_id: materialLotId,
            alloy: formData.alloy || 'N/A',
            heat_no: formData.heat_no || 'N/A',
            gross_weight: grossWeight,
            net_weight: receivedQtyKg,
            supplier: supplierName,
            material_size_mm: formData.rod_section_size || null,
            po_id: null,
            qc_status: formData.qc_required ? 'pending' : null,
            status: 'received' as any,
            received_by: user?.id || null,
          })
          .select()
          .single();

        if (materialLotError) {
          console.error("Failed to create material_lots record:", materialLotError);
          toast({ variant: "destructive", description: `Material lot creation failed: ${materialLotError.message}` });
        }

        if (formData.rpo_id) {
          const selectedRPO = rpos.find(r => r.id === formData.rpo_id);

          // POINT 1,3: Create raw_po_receipts with gate_register_id and gi_ref to material_lots
          const { error: receiptError } = await supabase
            .from("raw_po_receipts")
            .insert({
              rpo_id: formData.rpo_id,
              gi_ref: materialLotData?.id || null,
              gate_register_id: data.id,
              received_date: new Date().toISOString().split('T')[0],
              qty_received_kg: receivedQtyKg,
              supplier_invoice_no: formData.challan_no || null,
              lr_no: null,
              transporter: formData.transporter || null,
              notes: `Gate Entry: ${data.gate_entry_no}. ${formData.remarks || ''}`.trim(),
            } as any);

          if (receiptError) {
            console.error("Failed to create raw_po_receipts record:", receiptError);
            toast({ variant: "destructive", description: `RPO receipt failed: ${receiptError.message}` });
          }

          // POINT 4: Create inventory_lots with safe defaults for NOT NULL columns
          const lotId = `LOT-${data.gate_entry_no}-${formData.heat_no || 'NH'}`;
          const { error: lotError } = await supabase
            .from("inventory_lots")
            .insert({
              lot_id: lotId,
              material_size_mm: formData.rod_section_size || 'N/A',
              alloy: formData.alloy || 'N/A',
              qty_kg: receivedQtyKg,
              supplier_id: formData.supplier_id || null,
              rpo_id: formData.rpo_id,
              heat_no: formData.heat_no || null,
              received_date: new Date().toISOString().split('T')[0],
              cost_rate: selectedRPO?.rate_per_kg || null,
            });

          if (lotError) {
            console.error("Failed to create inventory_lots record:", lotError);
            toast({ variant: "destructive", description: `Inventory lot failed: ${lotError.message}` });
          }

          // POINT 2,6: Calculate total received and update RPO status with valid enum
          const { data: allReceipts } = await supabase
            .from("raw_po_receipts")
            .select("qty_received_kg")
            .eq("rpo_id", formData.rpo_id);

          const totalReceivedKg = allReceipts?.reduce((sum, r) => sum + (r.qty_received_kg || 0), 0) || 0;
          const orderedQty = selectedRPO?.qty_ordered_kg || 0;

          // POINT 6: Use valid rpo_status enum values
          const newStatus: 'part_received' | 'closed' = totalReceivedKg >= orderedQty ? 'closed' : 'part_received';

          await supabase
            .from("raw_purchase_orders")
            .update({
              status: newStatus,
              updated_at: new Date().toISOString()
            })
            .eq("id", formData.rpo_id);

          // POINT 7: Create reconciliation record if there's a variance
          const qtyDelta = totalReceivedKg - orderedQty;
          if (newStatus === 'closed' && Math.abs(qtyDelta) > 0.1) {
            const reason: 'short_supply' | 'excess_supply' = qtyDelta < 0 ? 'short_supply' : 'excess_supply';
            const rateDelta = selectedRPO?.rate_per_kg ? qtyDelta * selectedRPO.rate_per_kg : null;
            await supabase
              .from("raw_po_reconciliations")
              .insert({
                rpo_id: formData.rpo_id,
                qty_delta_kg: qtyDelta,
                amount_delta: rateDelta,
                reason: reason,
                resolution: 'pending' as any,
                notes: `Auto-created on RPO closure. Gate Entry: ${data.gate_entry_no}`,
              });
          }

          // POINT 8: Create execution record (even without WO link for traceability)
          if (formData.work_order_id) {
            await createExecutionRecord({
              workOrderId: formData.work_order_id,
              operationType: 'RAW_MATERIAL',
              processName: 'Raw Material Receipt',
              quantity: receivedQtyKg,
              unit: 'kg',
              direction: 'IN',
              relatedPartnerId: null,
              relatedChallanId: null,
            });
          }

        } else {
          // Ad-hoc receipt without RPO - still create inventory lot
          // POINT 4: Safe defaults
          const lotId = `LOT-${data.gate_entry_no}-${formData.heat_no || 'NH'}`;
          const { error: lotError } = await supabase
            .from("inventory_lots")
            .insert({
              lot_id: lotId,
              material_size_mm: formData.rod_section_size || 'N/A',
              alloy: formData.alloy || 'N/A',
              qty_kg: receivedQtyKg,
              supplier_id: formData.supplier_id || null,
              rpo_id: null,
              heat_no: formData.heat_no || null,
              received_date: new Date().toISOString().split('T')[0],
              cost_rate: null,
            });

          if (lotError) {
            console.error("Failed to create inventory_lots record:", lotError);
            toast({ variant: "destructive", description: `Inventory lot failed: ${lotError.message}` });
          }

          // POINT 8: Execution record even without RPO if WO is linked
          if (formData.work_order_id) {
            await createExecutionRecord({
              workOrderId: formData.work_order_id,
              operationType: 'RAW_MATERIAL',
              processName: 'Raw Material Receipt',
              quantity: receivedQtyKg,
              unit: 'kg',
              direction: 'IN',
              relatedPartnerId: null,
              relatedChallanId: null,
            });
          }
        }

        // POINT 9: Create qc_records entry for QC team visibility when QC is required
        if (formData.qc_required && formData.work_order_id) {
          const qcId = `QC-INC-${data.gate_entry_no}`;
          await supabase
            .from("qc_records")
            .insert({
              qc_id: qcId,
              wo_id: formData.work_order_id,
              qc_type: 'incoming' as any,
              result: 'pending' as any,
              heat_no: formData.heat_no || null,
              material_grade: formData.alloy || formData.material_grade || null,
              material_lot_id: null, // Will be linked by QC team during inspection
              remarks: `Auto-created from Gate Register ${data.gate_entry_no}. Qty: ${effectiveNetWeight} kg`,
              inspected_quantity: 0,
            });
        }

        // Reload RPOs to reflect updated quantities
        loadRPOs();
      }

      // ===================================================================
      // EXTERNAL PROCESS WORKFLOW (Points 11-30)
      // ===================================================================
      if (formData.material_type === 'external_process' && formData.work_order_id && formData.process_type) {
        // POINT 11 FIX: Use estimated_pcs if available, otherwise use net weight as the quantity
        // This ensures wo_external_moves always has meaningful quantity
        const qtySent = estimatedPcs || 0;
        const netWeightKg = effectiveNetWeight;
        // POINT 11: Fallback — if no pcs, use weight as quantity indicator
        const effectiveQtySent = qtySent > 0 ? qtySent : Math.round(netWeightKg);

        if (formDirection === 'OUT') {
          // =============== GOODS OUT = Sending to External Partner ===============

          // POINT 18: Auto-generate challan if not provided
          const challanNo = formData.challan_no || `DC-${data.gate_entry_no}`;

          // POINT 12,15: Create wo_external_moves with weight tracking + expected_return_date
          const { data: moveData, error: moveError } = await supabase
            .from("wo_external_moves")
            .insert([{
              work_order_id: formData.work_order_id,
              process: formData.process_type,
              partner_id: formData.partner_id || null,
              challan_no: challanNo,
              remarks: formData.remarks || null,
              created_by: user?.id || null,
              status: 'sent',
              quantity_sent: effectiveQtySent,
              dispatch_date: new Date().toISOString().split('T')[0],
              // POINT 15: Set expected return date (default 7 days)
              expected_return_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              // POINT 12: Weight tracking
              weight_sent_kg: netWeightKg,
              gate_register_id: data.id,
            } as any])
            .select()
            .single();

          if (moveError) {
            console.error("Failed to create wo_external_moves record:", moveError);
            toast({ variant: "destructive", description: `External move record failed: ${moveError.message}` });
          } else if (moveData) {
            // Link gate register entry to the external move
            await supabase
              .from("gate_register")
              .update({ external_movement_id: moveData.id })
              .eq("id", data.id);

            // Update work_orders.qty_external_wip and location
            const { data: woData } = await supabase
              .from("work_orders")
              .select("qty_external_wip")
              .eq("id", formData.work_order_id)
              .single();

            const partnerName = partners.find(p => p.id === formData.partner_id)?.name || 'External Partner';
            const currentWip = woData?.qty_external_wip || 0;

            await supabase
              .from("work_orders")
              .update({
                qty_external_wip: currentWip + effectiveQtySent,
                external_status: 'sent',
                external_process_type: formData.process_type,
                material_location: partnerName,
                updated_at: new Date().toISOString(),
              })
              .eq("id", formData.work_order_id);
          }

          // POINT 13,14: Update ALL active production_batches (not just 1) with broader filter
          const { data: activeBatches } = await supabase
            .from("production_batches")
            .select("id, batch_quantity")
            .eq("wo_id", formData.work_order_id)
            .is("ended_at", null)
            .in("current_location_type", ["factory", "transit"])
            .order("created_at", { ascending: false });

          if (activeBatches && activeBatches.length > 0) {
            // Update all matching active batches
            const batchIds = activeBatches.map(b => b.id);
            await supabase
              .from("production_batches")
              .update({
                current_location_type: 'external_partner',
                current_process: formData.process_type,
                external_partner_id: formData.partner_id || null,
                external_process_type: formData.process_type,
                external_sent_at: new Date().toISOString(),
                stage_entered_at: new Date().toISOString(),
              })
              .in("id", batchIds);
          }

          // Create execution record for traceability
          if (moveData) {
            await createExecutionRecord({
              workOrderId: formData.work_order_id,
              operationType: 'EXTERNAL_PROCESS',
              processName: formData.process_type,
              quantity: effectiveQtySent,
              unit: qtySent > 0 ? 'pcs' : 'kg',
              direction: 'OUT',
              relatedPartnerId: formData.partner_id || null,
              relatedChallanId: moveData.id,
            });
          }

        } else if (formDirection === 'IN') {
          // =============== GOODS IN = Receiving from External Partner ===============

          // POINT 21: Match ALL pending moves (not just latest) and distribute received qty
          const { data: pendingMoves } = await supabase
            .from("wo_external_moves")
            .select("*")
            .eq("work_order_id", formData.work_order_id)
            .eq("process", formData.process_type)
            .in("status", ["sent", "partial"])
            .order("dispatch_date", { ascending: true }); // FIFO order

          const receivedQty = estimatedPcs || Math.round(effectiveNetWeight);
          let remainingToAllocate = receivedQty;

          if (pendingMoves && pendingMoves.length > 0) {
            for (const move of pendingMoves) {
              if (remainingToAllocate <= 0) break;

              const pendingQty = (move.quantity_sent || 0) - (move.quantity_returned || 0);
              // POINT 22: Don't allocate more than what's pending for this move
              const allocatedQty = Math.min(remainingToAllocate, pendingQty > 0 ? pendingQty : remainingToAllocate);
              const newTotalReturned = (move.quantity_returned || 0) + allocatedQty;
              const newStatus = newTotalReturned >= (move.quantity_sent || 0) ? 'completed' : 'partial';

              await supabase
                .from("wo_external_moves")
                .update({
                  quantity_returned: newTotalReturned,
                  returned_date: new Date().toISOString().split('T')[0],
                  status: newStatus,
                  // POINT 12: Track returned weight
                  weight_returned_kg: ((move as any).weight_returned_kg || 0) + effectiveNetWeight,
                  gate_register_id: data.id,
                } as any)
                .eq("id", move.id);

              remainingToAllocate -= allocatedQty;

              // Link gate register entry to the first matched move
              if (move === pendingMoves[0]) {
                await supabase
                  .from("gate_register")
                  .update({ external_movement_id: move.id })
                  .eq("id", data.id);
              }
            }

            // POINT 23: Update work_orders to reduce qty_external_wip
            const { data: woData } = await supabase
              .from("work_orders")
              .select("qty_external_wip, external_process_type")
              .eq("id", formData.work_order_id)
              .single();

            if (woData) {
              const currentWip = woData.qty_external_wip || 0;
              const newWip = Math.max(0, currentWip - receivedQty);

              const woUpdateData: any = {
                qty_external_wip: newWip,
                updated_at: new Date().toISOString(),
              };

              // If all external WIP returned, update location and status
              if (newWip === 0) {
                woUpdateData.external_status = null;
                woUpdateData.material_location = 'Factory';
              }

              await supabase
                .from("work_orders")
                .update(woUpdateData)
                .eq("id", formData.work_order_id);
            }

            // POINT 26: Update ALL batches at external partner (not just 1)
            const { data: externalBatches } = await supabase
              .from("production_batches")
              .select("id, batch_quantity")
              .eq("wo_id", formData.work_order_id)
              .is("ended_at", null)
              .eq("current_location_type", "external_partner")
              .eq("current_process", formData.process_type);

            if (externalBatches && externalBatches.length > 0) {
              const requiresQC = formData.qc_required;
              const batchIds = externalBatches.map(b => b.id);

              await supabase
                .from("production_batches")
                .update({
                  current_location_type: 'factory',
                  current_process: requiresQC ? 'post_external_qc' : 'production',
                  external_returned_at: new Date().toISOString(),
                  stage_entered_at: new Date().toISOString(),
                  requires_qc_on_return: requiresQC,
                  post_external_qc_status: requiresQC ? 'pending' : 'passed',
                })
                .in("id", batchIds);
            }

            // POINT 24: Create qc_records for post-external QC visibility
            if (formData.qc_required) {
              const qcId = `QC-EXT-${data.gate_entry_no}`;
              await supabase
                .from("qc_records")
                .insert({
                  qc_id: qcId,
                  wo_id: formData.work_order_id,
                  qc_type: 'post_external' as any,
                  result: 'pending' as any,
                  heat_no: formData.heat_no || null,
                  remarks: `Post-external QC for ${formData.process_type}. Gate Entry: ${data.gate_entry_no}. Qty: ${receivedQty} pcs, Weight: ${effectiveNetWeight} kg`,
                  inspected_quantity: 0,
                });
            }

            // POINT 25: Create inventory record on external return for tracking
            if (formData.work_order_id) {
              const linkedWO = workOrders.find(w => w.id === formData.work_order_id);
              const lotId = `LOT-EXT-${data.gate_entry_no}`;
              await supabase
                .from("inventory_lots")
                .insert({
                  lot_id: lotId,
                  material_size_mm: formData.rod_section_size || linkedWO?.item_code || 'N/A',
                  alloy: formData.alloy || 'N/A',
                  qty_kg: effectiveNetWeight,
                  supplier_id: null,
                  rpo_id: null,
                  heat_no: formData.heat_no || null,
                  received_date: new Date().toISOString().split('T')[0],
                  cost_rate: null,
                });
            }

            // Create execution record for traceability
            await createExecutionRecord({
              workOrderId: formData.work_order_id,
              operationType: 'EXTERNAL_PROCESS',
              processName: formData.process_type,
              quantity: receivedQty,
              unit: 'pcs',
              direction: 'IN',
              relatedPartnerId: formData.partner_id || null,
              relatedChallanId: pendingMoves[0]?.id || null,
            });
          } else {
            // No pending moves found — create a standalone return record
            toast({
              title: "Warning",
              description: "No pending external move found for this WO/process. Entry recorded but could not match to a challan.",
            });
          }
        }
      }

      // ===================================================================
      // FINISHED GOODS DISPATCH WORKFLOW (Points 31-40)
      // ===================================================================
      if (formData.material_type === 'finished_goods' && formDirection === 'OUT') {
        const linkedWO = workOrders.find(w => w.id === formData.work_order_id);

        if (formData.work_order_id && linkedWO) {
          // POINT 31: Create dispatch_notes record for finance/logistics visibility
          const dispatchNoteNo = `DN-${data.gate_entry_no}`;
          const dispatchedQty = estimatedPcs || Math.round(effectiveNetWeight);

          const { error: dnError } = await supabase
            .from("dispatch_notes")
            .insert({
              dispatch_note_no: dispatchNoteNo,
              work_order_id: formData.work_order_id,
              item_code: linkedWO.item_code || 'N/A',
              item_description: formData.item_name || linkedWO.item_code || null,
              dispatched_qty: dispatchedQty,
              packed_qty: dispatchedQty,
              dispatch_date: new Date().toISOString().split('T')[0],
              gross_weight_kg: grossWeight,
              net_weight_kg: effectiveNetWeight,
              remarks: `Gate Register dispatch: ${data.gate_entry_no}. ${formData.remarks || ''}`.trim(),
              created_by: user?.id || null,
              sales_order_id: null, // Can be linked manually later
            });

          if (dnError) {
            console.error("Failed to create dispatch_notes record:", dnError);
            toast({ variant: "destructive", description: `Dispatch note failed: ${dnError.message}` });
          }

          // POINT 37: Update work order qty_dispatched
          const { data: woData } = await supabase
            .from("work_orders")
            .select("qty_dispatched")
            .eq("id", formData.work_order_id)
            .single();

          const currentDispatched = woData?.qty_dispatched || 0;
          await supabase
            .from("work_orders")
            .update({
              qty_dispatched: currentDispatched + dispatchedQty,
              updated_at: new Date().toISOString(),
            })
            .eq("id", formData.work_order_id);

          // Create execution record for dispatch traceability
          await createExecutionRecord({
            workOrderId: formData.work_order_id,
            operationType: 'DISPATCH',
            processName: 'Finished Goods Dispatch',
            quantity: dispatchedQty,
            unit: 'pcs',
            direction: 'OUT',
            relatedPartnerId: null,
            relatedChallanId: null,
          });
        }
      }

      // ===================================================================
      // SCRAP OUT — execution record for traceability (Point 40)
      // ===================================================================
      if (formData.material_type === 'scrap' && formDirection === 'OUT' && formData.work_order_id) {
        await createExecutionRecord({
          workOrderId: formData.work_order_id,
          operationType: 'DISPATCH',
          processName: 'Scrap Dispatch',
          quantity: effectiveNetWeight,
          unit: 'kg',
          direction: 'OUT',
          relatedPartnerId: null,
          relatedChallanId: null,
        });
      }

      // ===================================================================
      // POINT 50: Create audit_logs entry for every gate register action
      // ===================================================================
      await supabase
        .from("audit_logs")
        .insert({
          table_name: 'gate_register',
          record_id: data.id,
          action: `gate_${formDirection.toLowerCase()}_${formData.material_type}`,
          changed_by: user?.id || null,
          new_data: {
            gate_entry_no: data.gate_entry_no,
            direction: formDirection,
            material_type: formData.material_type,
            net_weight_kg: effectiveNetWeight,
            estimated_pcs: estimatedPcs,
            rpo_id: formData.rpo_id || null,
            work_order_id: formData.work_order_id || null,
            partner_id: formData.partner_id || null,
            process_type: formData.process_type || null,
          },
        });

      toast({
        title: "Entry Created",
        description: `${data.gate_entry_no}: ${formData.gross_weight_kg} kg ${formDirection === 'IN' ? 'received' : 'dispatched'}`
      });

      setFormOpen(false);
      loadEntries();

      // Offer to print tag
      if (data) {
        const linkedWO = formData.work_order_id
          ? workOrders.find(w => w.id === formData.work_order_id)
          : null;
        const entryData = {
          ...data,
          direction: data.direction as 'IN' | 'OUT',
          wo_number: linkedWO?.wo_number || null
        };
        setPrintEntry(entryData);
        setPrintDialogOpen(true);
      }
    } catch (error: any) {
      console.error("Error creating entry:", error);
      toast({ variant: "destructive", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handlePrintTag = (entry: GateEntry) => {
    setPrintEntry(entry);
    setPrintDialogOpen(true);
  };

  const getDirectionBadge = (direction: string) => {
    if (direction === 'IN') {
      return <Badge className="bg-emerald-500 text-white">IN</Badge>;
    }
    return <Badge className="bg-amber-500 text-white">OUT</Badge>;
  };

  const getMaterialTypeBadge = (type: string) => {
    const config: Record<string, { color: string; label: string }> = {
      raw_material: { color: 'bg-blue-500', label: 'Raw' },
      external_process: { color: 'bg-purple-500', label: 'External' },
      finished_goods: { color: 'bg-green-500', label: 'FG' },
      scrap: { color: 'bg-gray-500', label: 'Scrap' },
      other: { color: 'bg-slate-500', label: 'Other' },
    };
    const c = config[type] || config.other;
    return <Badge className={cn(c.color, "text-white text-xs")}>{c.label}</Badge>;
  };

  // Summary stats
  const todayStats = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const todayEntries = entries.filter(e => e.entry_date === today);
    return {
      totalIn: todayEntries.filter(e => e.direction === 'IN').reduce((sum, e) => sum + e.gross_weight_kg, 0),
      totalOut: todayEntries.filter(e => e.direction === 'OUT').reduce((sum, e) => sum + e.gross_weight_kg, 0),
      countIn: todayEntries.filter(e => e.direction === 'IN').length,
      countOut: todayEntries.filter(e => e.direction === 'OUT').length,
    };
  }, [entries]);

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/"><Home className="h-4 w-4" /></Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Gate Register</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Gate Register</h1>
            <p className="text-sm text-muted-foreground">
              Unified Goods In / Out workflow • Weight is the source of truth
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => openNewEntry('IN')} className="bg-emerald-600 hover:bg-emerald-700">
              <ArrowDownToLine className="h-4 w-4 mr-2" />
              Goods In
            </Button>
            <Button onClick={() => openNewEntry('OUT')} className="bg-amber-600 hover:bg-amber-700">
              <ArrowUpFromLine className="h-4 w-4 mr-2" />
              Goods Out
            </Button>
          </div>
        </div>

        {/* Today's Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500">
                  <ArrowDownToLine className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{todayStats.totalIn.toFixed(1)} kg</p>
                  <p className="text-xs text-muted-foreground">Goods In Today ({todayStats.countIn})</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500">
                  <ArrowUpFromLine className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{todayStats.totalOut.toFixed(1)} kg</p>
                  <p className="text-xs text-muted-foreground">Goods Out Today ({todayStats.countOut})</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500">
                  <Scale className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{(todayStats.totalIn - todayStats.totalOut).toFixed(1)} kg</p>
                  <p className="text-xs text-muted-foreground">Net Movement Today</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500">
                  <FileText className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{todayStats.countIn + todayStats.countOut}</p>
                  <p className="text-xs text-muted-foreground">Total Entries Today</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Ledger */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Gate Ledger</CardTitle>
                <CardDescription>All goods movements recorded at gate</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search entry, heat no, challan..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 w-64"
                  />
                </div>
                <Select value={filterDirection} onValueChange={(v) => setFilterDirection(v as any)}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="IN">In</SelectItem>
                    <SelectItem value="OUT">Out</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterMaterialType} onValueChange={setFilterMaterialType}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="all">All Types</SelectItem>
                    {MATERIAL_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" onClick={loadEntries}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredEntries.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Scale className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No gate entries found</p>
                <p className="text-sm">Use the buttons above to record goods in or out</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entry No</TableHead>
                    <TableHead>Dir</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Date/Time</TableHead>
                    <TableHead>Item / Heat</TableHead>
                    <TableHead>Supplier/Partner</TableHead>
                    <TableHead className="text-right">Gross (kg)</TableHead>
                    <TableHead className="text-right">Net (kg)</TableHead>
                    <TableHead className="text-right">Est. PCS</TableHead>
                    <TableHead>Challan</TableHead>
                    <TableHead>QC</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono text-sm">{entry.gate_entry_no}</TableCell>
                      <TableCell>{getDirectionBadge(entry.direction)}</TableCell>
                      <TableCell>{getMaterialTypeBadge(entry.material_type)}</TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(entry.entry_time), 'dd-MMM HH:mm')}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {entry.item_name || entry.rod_section_size || '-'}
                        </div>
                        {entry.heat_no && (
                          <div className="text-xs text-muted-foreground">
                            Heat: {entry.heat_no}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{entry.supplier_name || '-'}</TableCell>
                      <TableCell className="text-right font-medium">{entry.gross_weight_kg.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{entry.net_weight_kg.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-sm">
                        {entry.material_type === 'external_process' && entry.estimated_pcs 
                          ? entry.estimated_pcs.toLocaleString() 
                          : '-'}
                      </TableCell>
                      <TableCell className="text-sm">{entry.challan_no || '-'}</TableCell>
                      <TableCell>
                        {entry.qc_required ? (
                          <Badge
                            variant={entry.qc_status === 'passed' ? 'default' : entry.qc_status === 'failed' ? 'destructive' : 'secondary'}
                            className="text-xs"
                          >
                            {entry.qc_status}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handlePrintTag(entry)}
                          title="Print Tag"
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Entry Form Dialog */}
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {formDirection === 'IN' ? (
                  <>
                    <ArrowDownToLine className="h-5 w-5 text-emerald-500" />
                    Goods In
                  </>
                ) : (
                  <>
                    <ArrowUpFromLine className="h-5 w-5 text-amber-500" />
                    Goods Out
                  </>
                )}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Material Type */}
              <div>
                <Label>Material Type *</Label>
                <Select
                  value={formData.material_type}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, material_type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    {MATERIAL_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Raw Material Fields */}
              {formData.material_type === 'raw_material' && formDirection === 'IN' && (
                <div>
                  <Label>Raw Material PO (Optional)</Label>
                  <Select value={formData.rpo_id || "none"} onValueChange={(v) => handleRPOChange(v === "none" ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select RPO to receive against" />
                    </SelectTrigger>
                    <SelectContent className="bg-background z-50 max-h-64">
                      <SelectItem value="none">-- No PO (Ad-hoc Receipt) --</SelectItem>
                      {rpos.filter(rpo => rpo.id).map(rpo => (
                        <SelectItem key={rpo.id} value={rpo.id}>
                          <div className="flex flex-col">
                            <span className="font-medium">{rpo.rpo_no}</span>
                            <span className="text-xs text-muted-foreground">
                              {rpo.supplier_name} | {rpo.alloy} {rpo.material_size_mm} | 
                              Rem: {(rpo.remaining_kg || 0).toFixed(1)} kg
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formData.rpo_id && (
                    <div className="mt-2 p-2 bg-muted/50 rounded text-xs">
                      {(() => {
                        const selectedRPO = rpos.find(r => r.id === formData.rpo_id);
                        if (!selectedRPO) return null;
                        return (
                          <div className="flex justify-between">
                            <span>Ordered: {selectedRPO.qty_ordered_kg} kg</span>
                            <span>Received: {(selectedRPO.total_received_kg || 0).toFixed(1)} kg</span>
                            <span className="font-medium text-primary">Remaining: {(selectedRPO.remaining_kg || 0).toFixed(1)} kg</span>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
              
              {formData.material_type === 'raw_material' && (
                <>
                  {/* Show info banner when RPO is selected */}
                  {formData.rpo_id && formDirection === 'IN' && (
                    <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                      <p className="text-xs text-primary font-medium mb-1">
                        ✓ Material details auto-filled from Purchase Order
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Fields are pre-populated but editable if there's a variation
                      </p>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="flex items-center gap-2">
                        Material Form
                        {formData.rpo_id && formData.material_form && (
                          <Badge variant="outline" className="text-[10px] h-4 bg-primary/10 text-primary border-primary/20">From PO</Badge>
                        )}
                      </Label>
                      <Select
                        value={formData.material_form || "none"}
                        onValueChange={(v) => setFormData(prev => ({ ...prev, material_form: v === "none" ? "" : v }))}
                      >
                        <SelectTrigger className={formData.rpo_id && formData.material_form ? "border-primary/30" : ""}>
                          <SelectValue placeholder="Select form" />
                        </SelectTrigger>
                        <SelectContent className="bg-background z-50">
                          <SelectItem value="none">-- Select --</SelectItem>
                          {materialForms.filter(f => f.name).map(f => (
                            <SelectItem key={f.id} value={f.name}>{f.name.toUpperCase()}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="flex items-center gap-2">
                        Cross Section Shape
                        {formData.rpo_id && formData.cross_section_shape && (
                          <Badge variant="outline" className="text-[10px] h-4 bg-primary/10 text-primary border-primary/20">From PO</Badge>
                        )}
                      </Label>
                      <Select
                        value={formData.cross_section_shape || "none"}
                        onValueChange={(v) => setFormData(prev => ({ 
                          ...prev, 
                          cross_section_shape: v === "none" ? "" : v,
                          rod_section_size: '' // Reset size when shape changes
                        }))}
                      >
                        <SelectTrigger className={formData.rpo_id && formData.cross_section_shape ? "border-primary/30" : ""}>
                          <SelectValue placeholder="Select shape" />
                        </SelectTrigger>
                        <SelectContent className="bg-background z-50">
                          <SelectItem value="none">-- Select --</SelectItem>
                          {crossSectionShapes.filter(s => s.name).map(s => (
                            <SelectItem key={s.id} value={s.name}>{s.name.toUpperCase()}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Nominal Size and Material Grade */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="flex items-center gap-2">
                        Nominal Size
                        {formData.rpo_id && formData.rod_section_size && (
                          <Badge variant="outline" className="text-[10px] h-4 bg-primary/10 text-primary border-primary/20">From PO</Badge>
                        )}
                      </Label>
                      <Select
                        value={formData.rod_section_size || "none"}
                        onValueChange={(v) => setFormData(prev => ({ ...prev, rod_section_size: v === "none" ? "" : v }))}
                      >
                        <SelectTrigger className={formData.rpo_id && formData.rod_section_size ? "border-primary/30" : ""}>
                          <SelectValue placeholder="Select size" />
                        </SelectTrigger>
                        <SelectContent className="bg-background z-50 max-h-48">
                          <SelectItem value="none">-- Select --</SelectItem>
                          {filteredNominalSizes.filter(s => s.display_label || s.size_value).map(s => {
                            const sizeValue = s.display_label || `${s.size_value}${s.unit || 'mm'}`;
                            return (
                              <SelectItem key={s.id} value={sizeValue}>
                                {s.display_label || `${s.size_value} ${s.unit || 'mm'}`}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="flex items-center gap-2">
                        Material Grade (Alloy)
                        {formData.rpo_id && formData.alloy && (
                          <Badge variant="outline" className="text-[10px] h-4 bg-primary/10 text-primary border-primary/20">From PO</Badge>
                        )}
                      </Label>
                      <Select
                        value={formData.alloy || "none"}
                        onValueChange={(v) => setFormData(prev => ({ ...prev, alloy: v === "none" ? "" : v, material_grade: v === "none" ? "" : v }))}
                      >
                        <SelectTrigger className={formData.rpo_id && formData.alloy ? "border-primary/30" : ""}>
                          <SelectValue placeholder="Select grade" />
                        </SelectTrigger>
                        <SelectContent className="bg-background z-50 max-h-48">
                          <SelectItem value="none">-- Select --</SelectItem>
                          {materialGrades.filter(g => g.name).map(g => (
                            <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Heat Number {formDirection === 'IN' ? '*' : ''}</Label>
                      <Input
                        value={formData.heat_no}
                        onChange={(e) => setFormData(prev => ({ ...prev, heat_no: e.target.value.toUpperCase() }))}
                        placeholder="Heat number"
                      />
                    </div>
                    <div>
                      <Label>TC Number</Label>
                      <Input
                        value={formData.tc_number}
                        onChange={(e) => setFormData(prev => ({ ...prev, tc_number: e.target.value }))}
                        placeholder="Test certificate no."
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Supplier</Label>
                    <Select value={formData.supplier_id || "none"} onValueChange={(v) => handleSupplierChange(v === "none" ? "" : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select supplier" />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50 max-h-48">
                        <SelectItem value="none">-- Select --</SelectItem>
                        {suppliers.filter(s => s.id).map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {/* External Process Fields */}
              {formData.material_type === 'external_process' && (
                <>
                  <div>
                    <Label>Item Code / Name {formData.work_order_id ? '(from Work Order)' : ''}</Label>
                    <Input
                      value={formData.item_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, item_name: e.target.value }))}
                      placeholder="Select work order to auto-fill"
                      className={formData.work_order_id ? "bg-muted" : ""}
                      readOnly={!!formData.work_order_id}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>External Partner</Label>
                      <Select value={formData.partner_id || "none"} onValueChange={(v) => handlePartnerChange(v === "none" ? "" : v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select partner" />
                        </SelectTrigger>
                        <SelectContent className="bg-background z-50 max-h-48">
                          <SelectItem value="none">-- Select --</SelectItem>
                          {partners.filter(p => p.id).map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Process Type</Label>
                      <Select
                        value={formData.process_type || "none"}
                        onValueChange={(v) => setFormData(prev => ({ ...prev, process_type: v === "none" ? "" : v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select process" />
                        </SelectTrigger>
                        <SelectContent className="bg-background z-50">
                          <SelectItem value="none">-- Select --</SelectItem>
                          {processTypes.filter(p => p).map(p => (
                            <SelectItem key={p} value={p}>{p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}

              {/* Other/FG/Scrap Fields */}
              {['finished_goods', 'scrap', 'other'].includes(formData.material_type) && (
                <div>
                  <Label>Item Name</Label>
                  <Input
                    value={formData.item_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, item_name: e.target.value }))}
                    placeholder="Item description"
                  />
                </div>
              )}

              {/* Customer/Party Selection - from customer_master */}
              <div>
                <Label>Customer / Party</Label>
                <Select
                  value={formData.customer_id || "none"}
                  onValueChange={(v) => {
                    if (v === "none") {
                      setFormData(prev => ({ ...prev, customer_id: '', party_code: '' }));
                      return;
                    }
                    const customer = customers.find(c => c.id === v);
                    setFormData(prev => ({
                      ...prev,
                      customer_id: v,
                      party_code: customer?.party_code || customer?.customer_name || ''
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50 max-h-48">
                    <SelectItem value="none">-- Select --</SelectItem>
                    {customers.filter(c => c.id).map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.customer_name} {c.party_code ? `(${c.party_code})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Work Order Selection for External Process */}
              {formData.material_type === 'external_process' && (
                <div>
                  <Label>Linked Work Order *</Label>
                  <Select
                    value={formData.work_order_id || "none"}
                    onValueChange={(v) => handleWorkOrderChange(v === "none" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select work order" />
                    </SelectTrigger>
                    <SelectContent className="bg-background z-50 max-h-48">
                      <SelectItem value="none">-- Select --</SelectItem>
                      {workOrders.filter(wo => wo.id).map(wo => (
                        <SelectItem key={wo.id} value={wo.id}>
                          {wo.wo_number} - {wo.item_code} ({wo.customer || 'N/A'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Selecting a work order auto-fills item code and customer
                  </p>
                </div>
              )}

              {/* Weight Section - Using new PackagingCalculator */}
              <div className="space-y-4">
                <div>
                  <Label>Gross Weight (kg) *</Label>
                  <Input
                    type="number"
                    step="0.001"
                    value={formData.gross_weight_kg}
                    onChange={(e) => setFormData(prev => ({ ...prev, gross_weight_kg: e.target.value }))}
                    placeholder="0.000"
                    className="text-lg font-semibold"
                  />
                </div>
                
                <PackagingCalculator
                  grossWeight={grossWeight}
                  onNetWeightChange={handlePackagingChange}
                  defaultToNone={formData.material_type === 'raw_material'}
                  initialPackaging={packagingRows}
                  initialManualTare={manualTareOverride}
                />
                
                {/* PCS Estimation - only for External Process */}
                {formData.material_type === 'external_process' && (
                  <PCSEstimationSection
                    netWeight={netWeight}
                    onChange={handlePcsEstimationChange}
                  />
                )}
              </div>

              {/* Document Section */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Challan No. {formDirection === 'OUT' ? '*' : ''}</Label>
                  <Input
                    value={formData.challan_no}
                    onChange={(e) => setFormData(prev => ({ ...prev, challan_no: e.target.value }))}
                    placeholder="Delivery challan no."
                  />
                </div>
                <div>
                  <Label>DC Number</Label>
                  <Input
                    value={formData.dc_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, dc_number: e.target.value }))}
                    placeholder="Dispatch challan"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Vehicle No.</Label>
                  <Input
                    value={formData.vehicle_no}
                    onChange={(e) => setFormData(prev => ({ ...prev, vehicle_no: e.target.value.toUpperCase() }))}
                    placeholder="MH-12-AB-1234"
                  />
                </div>
                <div>
                  <Label>Transporter</Label>
                  <Input
                    value={formData.transporter}
                    onChange={(e) => setFormData(prev => ({ ...prev, transporter: e.target.value }))}
                    placeholder="Transport company"
                  />
                </div>
              </div>

              {/* QC Required */}
              {formDirection === 'IN' && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="qc_required"
                    checked={formData.qc_required}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, qc_required: !!checked }))}
                  />
                  <Label htmlFor="qc_required">QC Required</Label>
                </div>
              )}

              {/* Remarks */}
              <div>
                <Label>Remarks</Label>
                <Textarea
                  value={formData.remarks}
                  onChange={(e) => setFormData(prev => ({ ...prev, remarks: e.target.value }))}
                  placeholder="Any additional notes..."
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button
                onClick={handleSubmit}
                disabled={loading}
                className={formDirection === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'}
              >
                {loading ? 'Saving...' : `Record ${formDirection === 'IN' ? 'Goods In' : 'Goods Out'}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Print Tag Dialog */}
        {printEntry && (
          <GateTagPrintDialog
            open={printDialogOpen}
            onOpenChange={setPrintDialogOpen}
            entry={printEntry}
          />
        )}
      </div>
    </div>
  );
}
