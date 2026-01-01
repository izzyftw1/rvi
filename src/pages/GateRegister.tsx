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
        loadEntries()
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
      // Determine estimated_pcs - only for external processes with PCS estimation
      const estimatedPcs = formData.material_type === 'external_process' && pcsEstimation.estimatedPcs
        ? pcsEstimation.estimatedPcs
        : null;
      
      // Explicitly typed payload to avoid TS2589
      const insertPayload: {
        direction: string;
        material_type: string;
        gate_entry_no: string;
        gross_weight_kg: number;
        tare_weight_kg: number;
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
        gate_entry_no: '', // Will be auto-generated by trigger
        gross_weight_kg: grossWeight,
        tare_weight_kg: tareWeight,
        status: 'completed', // Set to completed to trigger inventory creation for raw material
        // PCS estimation fields (only populated for external processes)
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
        packaging_type_id: null, // No longer used - using packagingRows now
        packaging_count: packagingRows.filter(r => r.type !== 'NONE').reduce((sum, r) => sum + r.count, 0) || null,
        supplier_id: formData.supplier_id || null,
        supplier_name: formData.supplier_name || null,
        party_code: formData.party_code || null,
        partner_id: formData.partner_id || null,
        process_type: formData.process_type || null,
        work_order_id: formData.work_order_id || null,
        customer_id: formData.customer_id || null,
        challan_no: formData.challan_no || null,
        dc_number: formData.dc_number || null,
        vehicle_no: formData.vehicle_no || null,
        transporter: formData.transporter || null,
        qc_required: formData.qc_required,
        qc_status: formData.qc_required ? 'pending' : 'pending',
        remarks: formData.remarks || null,
        created_by: user?.id || null,
      };

      const { data, error } = await supabase
        .from("gate_register")
        .insert(insertPayload)
        .select()
        .single();

      if (error) throw error;

      // If this is an external process with a work order, sync with wo_external_moves and production_batches
      if (formData.material_type === 'external_process' && formData.work_order_id && formData.process_type) {
        const qtySent = data.estimated_pcs || 0;
        const netWeightKg = data.net_weight_kg || 0;
        
        if (formDirection === 'OUT') {
          // Goods OUT = sending to external partner
          
          // 1. Create wo_external_moves record
          const { data: moveData, error: moveError } = await supabase
            .from("wo_external_moves")
            .insert([{
              work_order_id: formData.work_order_id,
              process: formData.process_type,
              partner_id: formData.partner_id || null,
              challan_no: formData.challan_no || data.gate_entry_no,
              remarks: formData.remarks || null,
              created_by: user?.id || null,
              status: 'sent',
              quantity_sent: qtySent,
              dispatch_date: new Date().toISOString().split('T')[0],
            }])
            .select()
            .single();
          
          if (moveError) {
            console.warn("Failed to create wo_external_moves record:", moveError);
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
                qty_external_wip: currentWip + qtySent,
                external_status: 'sent',
                external_process_type: formData.process_type,
                material_location: partnerName,
                updated_at: new Date().toISOString(),
              })
              .eq("id", formData.work_order_id);
          }
          
          // 2. Update production_batches to reflect external location
          // Find active batches for this WO and update their location
          const { data: activeBatches } = await supabase
            .from("production_batches")
            .select("id, batch_quantity")
            .eq("wo_id", formData.work_order_id)
            .is("ended_at", null)
            .eq("current_location_type", "factory")
            .order("created_at", { ascending: false })
            .limit(1);
          
          if (activeBatches && activeBatches.length > 0) {
            const batch = activeBatches[0];
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
              .eq("id", batch.id);
          }
          
          // 3. Create execution record for traceability
          if (moveData) {
            await createExecutionRecord({
              workOrderId: formData.work_order_id,
              operationType: 'EXTERNAL_PROCESS',
              processName: formData.process_type,
              quantity: qtySent,
              unit: 'pcs',
              direction: 'OUT',
              relatedPartnerId: formData.partner_id || null,
              relatedChallanId: moveData.id,
            });
          }
          
        } else if (formDirection === 'IN') {
          // Goods IN = receiving from external partner
          
          // 1. Find and update the pending external move
          const { data: pendingMoves } = await supabase
            .from("wo_external_moves")
            .select("*")
            .eq("work_order_id", formData.work_order_id)
            .eq("process", formData.process_type)
            .in("status", ["sent", "partial"])
            .order("dispatch_date", { ascending: false })
            .limit(1);
          
          if (pendingMoves && pendingMoves.length > 0) {
            const move = pendingMoves[0];
            const receivedQty = data.estimated_pcs || 0;
            const newTotalReturned = (move.quantity_returned || 0) + receivedQty;
            const newStatus = newTotalReturned >= (move.quantity_sent || 0) ? 'completed' : 'partial';
            
            await supabase
              .from("wo_external_moves")
              .update({ 
                quantity_returned: newTotalReturned,
                returned_date: new Date().toISOString().split('T')[0],
                status: newStatus 
              })
              .eq("id", move.id);
            
            // Link gate register entry to the external move
            await supabase
              .from("gate_register")
              .update({ external_movement_id: move.id })
              .eq("id", data.id);
            
            // 3. Update work_orders to reduce qty_external_wip and update status
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
            
            // 4. Update production_batches to return to factory
            // Find batches at external partner for this WO/process
            const { data: externalBatches } = await supabase
              .from("production_batches")
              .select("id, batch_quantity")
              .eq("wo_id", formData.work_order_id)
              .is("ended_at", null)
              .eq("current_location_type", "external_partner")
              .eq("current_process", formData.process_type)
              .order("created_at", { ascending: false })
              .limit(1);
            
            if (externalBatches && externalBatches.length > 0) {
              const batch = externalBatches[0];
              // Determine if QC is required after external return
              const requiresQC = formData.qc_required;
              
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
                .eq("id", batch.id);
            }
            
            // 5. Create execution record for traceability
            await createExecutionRecord({
              workOrderId: formData.work_order_id,
              operationType: 'EXTERNAL_PROCESS',
              processName: formData.process_type,
              quantity: receivedQty,
              unit: 'pcs',
              direction: 'IN',
              relatedPartnerId: formData.partner_id || null,
              relatedChallanId: move.id,
            });
          }
        }
      }

      toast({
        title: "Entry Created",
        description: `${data.gate_entry_no}: ${formData.gross_weight_kg} kg ${formDirection === 'IN' ? 'received' : 'dispatched'}`
      });

      setFormOpen(false);
      loadEntries();

      // Offer to print tag - include work order number if linked
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
              {formData.material_type === 'raw_material' && (
                <>
                  {/* Material Form and Shape */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Material Form</Label>
                      <Select
                        value={formData.material_form}
                        onValueChange={(v) => setFormData(prev => ({ ...prev, material_form: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select form" />
                        </SelectTrigger>
                        <SelectContent className="bg-background z-50">
                          {materialForms.map(f => (
                            <SelectItem key={f.id} value={f.name}>{f.name.toUpperCase()}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Cross Section Shape</Label>
                      <Select
                        value={formData.cross_section_shape}
                        onValueChange={(v) => setFormData(prev => ({ 
                          ...prev, 
                          cross_section_shape: v,
                          rod_section_size: '' // Reset size when shape changes
                        }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select shape" />
                        </SelectTrigger>
                        <SelectContent className="bg-background z-50">
                          {crossSectionShapes.map(s => (
                            <SelectItem key={s.id} value={s.name}>{s.name.toUpperCase()}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Nominal Size and Material Grade */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Nominal Size</Label>
                      <Select
                        value={formData.rod_section_size}
                        onValueChange={(v) => setFormData(prev => ({ ...prev, rod_section_size: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select size" />
                        </SelectTrigger>
                        <SelectContent className="bg-background z-50 max-h-48">
                          {filteredNominalSizes.map(s => (
                            <SelectItem key={s.id} value={s.display_label || `${s.size_value}${s.unit || 'mm'}`}>
                              {s.display_label || `${s.size_value} ${s.unit || 'mm'}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Material Grade (Alloy)</Label>
                      <Select
                        value={formData.alloy}
                        onValueChange={(v) => setFormData(prev => ({ ...prev, alloy: v, material_grade: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select grade" />
                        </SelectTrigger>
                        <SelectContent className="bg-background z-50 max-h-48">
                          {materialGrades.map(g => (
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
                    <Select value={formData.supplier_id} onValueChange={handleSupplierChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select supplier" />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50 max-h-48">
                        {suppliers.map(s => (
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
                      <Select value={formData.partner_id} onValueChange={handlePartnerChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select partner" />
                        </SelectTrigger>
                        <SelectContent className="bg-background z-50 max-h-48">
                          {partners.map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Process Type</Label>
                      <Select
                        value={formData.process_type}
                        onValueChange={(v) => setFormData(prev => ({ ...prev, process_type: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select process" />
                        </SelectTrigger>
                        <SelectContent className="bg-background z-50">
                          {processTypes.map(p => (
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
                  value={formData.customer_id}
                  onValueChange={(v) => {
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
                    {customers.map(c => (
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
                    value={formData.work_order_id}
                    onValueChange={handleWorkOrderChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select work order" />
                    </SelectTrigger>
                    <SelectContent className="bg-background z-50 max-h-48">
                      {workOrders.map(wo => (
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
