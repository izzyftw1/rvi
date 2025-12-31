import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Printer, Tag, FileText } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  avg_weight_per_pc?: number | null;
  supplier_name: string | null;
  party_code: string | null;
  process_type: string | null;
  challan_no: string | null;
  dc_number: string | null;
  vehicle_no: string | null;
  transporter: string | null;
  work_order_id?: string | null;
  wo_number?: string | null;
}

interface GateTagPrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: GateEntry;
}

export function GateTagPrintDialog({ open, onOpenChange, entry }: GateTagPrintDialogProps) {
  const { toast } = useToast();
  const [printType, setPrintType] = useState<'tag' | 'challan'>('tag');
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = async () => {
    // Update print status
    const field = printType === 'tag' ? 'tag_printed' : 'challan_printed';
    const timeField = printType === 'tag' ? 'tag_printed_at' : 'challan_printed_at';
    
    await supabase
      .from("gate_register")
      .update({ 
        [field]: true, 
        [timeField]: new Date().toISOString() 
      })
      .eq("id", entry.id);

    // Generate print content with complete inline styles
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const isTag = printType === 'tag';
      const directionLabel = entry.direction === 'IN' ? 'GOODS RECEIVED' : 'GOODS DISPATCHED';
      const materialLabel = getMaterialTypeLabel(entry.material_type);
      
      if (isTag) {
        // 6x4 inch Material Tag with complete inline styles
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Material Tag - ${entry.gate_entry_no}</title>
              <style>
                @page { size: 6in 4in; margin: 0; }
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                  font-family: Arial, Helvetica, sans-serif; 
                  width: 6in; 
                  height: 4in; 
                  padding: 0.2in;
                }
                .tag-container {
                  width: 100%;
                  height: 100%;
                  border: 3px solid #000;
                  padding: 12px;
                  display: flex;
                  flex-direction: column;
                }
                .tag-header {
                  text-align: center;
                  border-bottom: 3px solid #000;
                  padding-bottom: 8px;
                  margin-bottom: 10px;
                }
                .tag-header h1 { 
                  font-size: 18px; 
                  font-weight: bold;
                  text-transform: uppercase;
                  letter-spacing: 1px;
                }
                .tag-header p { 
                  font-size: 12px; 
                  color: #555; 
                  margin-top: 2px;
                }
                .entry-number {
                  background: #f0f0f0;
                  border: 2px solid #000;
                  padding: 8px;
                  text-align: center;
                  font-size: 20px;
                  font-weight: bold;
                  margin-bottom: 10px;
                  letter-spacing: 2px;
                }
                .details-grid {
                  display: grid;
                  grid-template-columns: 1fr 1fr;
                  gap: 4px 16px;
                  flex: 1;
                }
                .detail-row {
                  display: flex;
                  padding: 3px 0;
                  border-bottom: 1px solid #ddd;
                }
                .detail-row.full { grid-column: span 2; }
                .detail-label {
                  font-weight: bold;
                  font-size: 11px;
                  min-width: 70px;
                  color: #333;
                }
                .detail-value {
                  font-size: 12px;
                  flex: 1;
                }
                .detail-value.large {
                  font-size: 16px;
                  font-weight: bold;
                }
                .weight-box {
                  background: #000;
                  color: #fff;
                  padding: 10px;
                  text-align: center;
                  margin-top: 8px;
                }
                .weight-label { font-size: 11px; letter-spacing: 2px; }
                .weight-value { font-size: 28px; font-weight: bold; margin: 4px 0; }
                .weight-breakdown { font-size: 10px; opacity: 0.9; }
                .tag-footer {
                  border-top: 2px solid #000;
                  padding-top: 6px;
                  margin-top: 8px;
                  text-align: center;
                  font-size: 10px;
                  color: #555;
                }
                @media print {
                  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
              </style>
            </head>
            <body>
              <div class="tag-container">
                <div class="tag-header">
                  <h1>${directionLabel}</h1>
                  <p>${materialLabel}</p>
                </div>
                
                <div class="entry-number">${entry.gate_entry_no}</div>
                
                <div class="details-grid">
                  <div class="detail-row">
                    <span class="detail-label">Date:</span>
                    <span class="detail-value">${format(new Date(entry.entry_time), 'dd-MMM-yyyy')}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Time:</span>
                    <span class="detail-value">${format(new Date(entry.entry_time), 'HH:mm')}</span>
                  </div>
                  ${entry.heat_no ? `
                  <div class="detail-row full">
                    <span class="detail-label">Heat No:</span>
                    <span class="detail-value large">${entry.heat_no}</span>
                  </div>
                  ` : ''}
                  ${entry.rod_section_size ? `
                  <div class="detail-row">
                    <span class="detail-label">Size:</span>
                    <span class="detail-value">${entry.rod_section_size}</span>
                  </div>
                  ` : ''}
                  ${entry.alloy ? `
                  <div class="detail-row">
                    <span class="detail-label">Grade:</span>
                    <span class="detail-value">${entry.alloy}</span>
                  </div>
                  ` : ''}
                  ${entry.supplier_name ? `
                  <div class="detail-row full">
                    <span class="detail-label">Supplier:</span>
                    <span class="detail-value">${entry.supplier_name}</span>
                  </div>
                  ` : ''}
                  ${entry.party_code ? `
                  <div class="detail-row">
                    <span class="detail-label">Party:</span>
                    <span class="detail-value">${entry.party_code}</span>
                  </div>
                  ` : ''}
                  ${entry.tc_number ? `
                  <div class="detail-row">
                    <span class="detail-label">TC No:</span>
                    <span class="detail-value">${entry.tc_number}</span>
                  </div>
                  ` : ''}
                  ${entry.challan_no ? `
                  <div class="detail-row">
                    <span class="detail-label">Challan:</span>
                    <span class="detail-value">${entry.challan_no}</span>
                  </div>
                  ` : ''}
                  ${entry.process_type ? `
                  <div class="detail-row">
                    <span class="detail-label">Process:</span>
                    <span class="detail-value">${entry.process_type}</span>
                  </div>
                  ` : ''}
                  ${entry.wo_number ? `
                  <div class="detail-row full">
                    <span class="detail-label">Work Order:</span>
                    <span class="detail-value large">${entry.wo_number}</span>
                  </div>
                  ` : ''}
                  ${entry.estimated_pcs ? `
                  <div class="detail-row full">
                    <span class="detail-label">Est. PCS:</span>
                    <span class="detail-value large">${entry.estimated_pcs.toLocaleString()}</span>
                  </div>
                  ` : ''}
                </div>
                
                <div class="weight-box">
                  <div class="weight-label">WEIGHT</div>
                  <div class="weight-value">${entry.gross_weight_kg.toFixed(2)} kg</div>
                  ${entry.tare_weight_kg > 0 ? `
                  <div class="weight-breakdown">Net: ${entry.net_weight_kg.toFixed(2)} kg | Tare: ${entry.tare_weight_kg.toFixed(2)} kg</div>
                  ` : ''}
                </div>
                
                <div class="tag-footer">RV Industries • Gate Register</div>
              </div>
            </body>
          </html>
        `);
      } else {
        // Delivery Challan with complete inline styles
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Delivery Challan - ${entry.gate_entry_no}</title>
              <style>
                @page { size: A4; margin: 0.5in; }
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                  font-family: Arial, Helvetica, sans-serif; 
                  padding: 0.5in;
                  font-size: 12px;
                }
                .challan-container { max-width: 8in; margin: 0 auto; }
                .company-header {
                  text-align: center;
                  border-bottom: 3px double #000;
                  padding-bottom: 15px;
                  margin-bottom: 20px;
                }
                .company-header h1 { 
                  font-size: 24px; 
                  font-weight: bold;
                  letter-spacing: 2px;
                }
                .company-header p { 
                  font-size: 14px; 
                  color: #333;
                  margin-top: 5px;
                }
                .challan-title {
                  text-align: center;
                  background: #f0f0f0;
                  padding: 8px;
                  font-size: 16px;
                  font-weight: bold;
                  border: 2px solid #000;
                  margin-bottom: 20px;
                }
                .info-section {
                  display: grid;
                  grid-template-columns: 1fr 1fr;
                  gap: 20px;
                  margin-bottom: 20px;
                }
                .info-block {
                  border: 1px solid #ccc;
                  padding: 12px;
                }
                .info-block h3 {
                  font-size: 11px;
                  color: #666;
                  text-transform: uppercase;
                  margin-bottom: 8px;
                  border-bottom: 1px solid #ddd;
                  padding-bottom: 4px;
                }
                .info-row {
                  display: flex;
                  margin: 4px 0;
                }
                .info-label { 
                  font-weight: bold; 
                  min-width: 100px; 
                }
                .info-value { flex: 1; }
                .party-box {
                  border: 2px solid #000;
                  padding: 15px;
                  margin-bottom: 20px;
                }
                .party-box h3 {
                  font-size: 11px;
                  color: #666;
                  margin-bottom: 5px;
                }
                .party-box p {
                  font-size: 14px;
                  font-weight: bold;
                }
                table {
                  width: 100%;
                  border-collapse: collapse;
                  margin-bottom: 20px;
                }
                th, td {
                  border: 1px solid #000;
                  padding: 10px;
                  text-align: left;
                }
                th {
                  background: #f0f0f0;
                  font-weight: bold;
                  font-size: 11px;
                  text-transform: uppercase;
                }
                td { font-size: 12px; }
                td.right { text-align: right; }
                td.bold { font-weight: bold; }
                .vehicle-info {
                  display: grid;
                  grid-template-columns: 1fr 1fr;
                  gap: 20px;
                  margin-bottom: 30px;
                  padding: 10px;
                  background: #f9f9f9;
                  border: 1px solid #ddd;
                }
                .signatures {
                  display: flex;
                  justify-content: space-between;
                  margin-top: 60px;
                  padding-top: 10px;
                }
                .sig-block {
                  text-align: center;
                  width: 28%;
                }
                .sig-line {
                  border-top: 1px solid #000;
                  padding-top: 8px;
                  margin-top: 50px;
                  font-size: 11px;
                  color: #333;
                }
                @media print {
                  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
              </style>
            </head>
            <body>
              <div class="challan-container">
                <div class="company-header">
                  <h1>RV INDUSTRIES</h1>
                  <p>Delivery Challan / Gate Pass</p>
                </div>
                
                <div class="challan-title">${entry.direction === 'IN' ? 'INWARD CHALLAN' : 'OUTWARD CHALLAN'}</div>
                
                <div class="info-section">
                  <div class="info-block">
                    <h3>Document Details</h3>
                    <div class="info-row">
                      <span class="info-label">Challan No:</span>
                      <span class="info-value">${entry.gate_entry_no}</span>
                    </div>
                    <div class="info-row">
                      <span class="info-label">Date:</span>
                      <span class="info-value">${format(new Date(entry.entry_time), 'dd-MMM-yyyy')}</span>
                    </div>
                    <div class="info-row">
                      <span class="info-label">Time:</span>
                      <span class="info-value">${format(new Date(entry.entry_time), 'HH:mm')}</span>
                    </div>
                    ${entry.challan_no ? `
                    <div class="info-row">
                      <span class="info-label">Ref Challan:</span>
                      <span class="info-value">${entry.challan_no}</span>
                    </div>
                    ` : ''}
                  </div>
                  <div class="info-block">
                    <h3>Movement Info</h3>
                    <div class="info-row">
                      <span class="info-label">Direction:</span>
                      <span class="info-value">${entry.direction === 'IN' ? 'INWARD' : 'OUTWARD'}</span>
                    </div>
                    <div class="info-row">
                      <span class="info-label">Type:</span>
                      <span class="info-value">${materialLabel}</span>
                    </div>
                    ${entry.process_type ? `
                    <div class="info-row">
                      <span class="info-label">Process:</span>
                      <span class="info-value">${entry.process_type}</span>
                    </div>
                    ` : ''}
                    ${entry.wo_number ? `
                    <div class="info-row">
                      <span class="info-label">Work Order:</span>
                      <span class="info-value" style="font-weight:bold">${entry.wo_number}</span>
                    </div>
                    ` : ''}
                  </div>
                </div>
                
                ${entry.supplier_name ? `
                <div class="party-box">
                  <h3>${entry.direction === 'IN' ? 'Received From:' : 'Dispatched To:'}</h3>
                  <p>${entry.supplier_name}</p>
                  ${entry.party_code ? `<p style="font-size:12px; font-weight:normal; margin-top:4px;">Party Code: ${entry.party_code}</p>` : ''}
                </div>
                ` : ''}
                
                <table>
                  <thead>
                    <tr>
                      <th style="width:45%">Description</th>
                      <th style="width:13%" class="right">Qty</th>
                      <th style="width:12%" class="right">Est. PCS</th>
                      <th style="width:15%" class="right">Gross Wt (kg)</th>
                      <th style="width:15%" class="right">Net Wt (kg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <strong>${entry.item_name || entry.rod_section_size || materialLabel}</strong>
                        ${entry.alloy ? `<br/><span style="color:#555">Grade: ${entry.alloy}</span>` : ''}
                        ${entry.heat_no ? `<br/><span style="color:#555">Heat No: ${entry.heat_no}</span>` : ''}
                        ${entry.tc_number ? `<br/><span style="color:#555">TC: ${entry.tc_number}</span>` : ''}
                        ${entry.avg_weight_per_pc ? `<br/><span style="color:#555">Avg Wt/Pc: ${entry.avg_weight_per_pc.toFixed(4)} kg</span>` : ''}
                      </td>
                      <td class="right">${entry.packaging_count || 1}</td>
                      <td class="right">${entry.estimated_pcs ? entry.estimated_pcs.toLocaleString() : '-'}</td>
                      <td class="right bold">${entry.gross_weight_kg.toFixed(2)}</td>
                      <td class="right">${entry.net_weight_kg.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
                
                ${(entry.vehicle_no || entry.transporter) ? `
                <div class="vehicle-info">
                  ${entry.vehicle_no ? `
                  <div class="info-row">
                    <span class="info-label">Vehicle No:</span>
                    <span class="info-value">${entry.vehicle_no}</span>
                  </div>
                  ` : ''}
                  ${entry.transporter ? `
                  <div class="info-row">
                    <span class="info-label">Transporter:</span>
                    <span class="info-value">${entry.transporter}</span>
                  </div>
                  ` : ''}
                </div>
                ` : ''}
                
                <div class="signatures">
                  <div class="sig-block">
                    <div class="sig-line">Prepared By</div>
                  </div>
                  <div class="sig-block">
                    <div class="sig-line">Checked By</div>
                  </div>
                  <div class="sig-block">
                    <div class="sig-line">${entry.direction === 'IN' ? 'Received By' : 'Dispatched By'}</div>
                  </div>
                </div>
              </div>
            </body>
          </html>
        `);
      }
      
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 250);
    }

    toast({ description: `${printType === 'tag' ? 'Tag' : 'Challan'} sent to printer` });
  };

  const getMaterialTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      raw_material: 'Raw Material',
      external_process: 'External Process',
      finished_goods: 'Finished Goods',
      scrap: 'Scrap',
      other: 'Other',
    };
    return labels[type] || type;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Print Tag / Challan
          </DialogTitle>
        </DialogHeader>

        <Tabs value={printType} onValueChange={(v) => setPrintType(v as 'tag' | 'challan')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="tag" className="flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Material Tag (6×4")
            </TabsTrigger>
            <TabsTrigger value="challan" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Delivery Challan
            </TabsTrigger>
          </TabsList>

          <div ref={printRef} className="mt-4">
            <TabsContent value="tag">
              {/* 6x4 inch Material Tag - matches manual card system */}
              <div className="border-2 border-black p-4" style={{ width: '6in', height: '4in' }}>
                <div className="text-center border-b-2 border-black pb-2 mb-2">
                  <h1 className="text-lg font-bold">
                    {entry.direction === 'IN' ? 'GOODS RECEIVED' : 'GOODS DISPATCHED'}
                  </h1>
                  <p className="text-sm text-muted-foreground">{getMaterialTypeLabel(entry.material_type)}</p>
                </div>

                {/* Entry Number - Large */}
                <div className="bg-muted p-2 text-center text-xl font-bold border border-black mb-2">
                  {entry.gate_entry_no}
                </div>

                <div className="grid grid-cols-2 gap-1 text-sm">
                  <div className="flex">
                    <span className="font-bold w-28">Date:</span>
                    <span>{format(new Date(entry.entry_time), 'dd-MMM-yyyy')}</span>
                  </div>
                  <div className="flex">
                    <span className="font-bold w-28">Time:</span>
                    <span>{format(new Date(entry.entry_time), 'HH:mm')}</span>
                  </div>
                  
                  {entry.heat_no && (
                    <div className="flex col-span-2">
                      <span className="font-bold w-28">Heat No:</span>
                      <span className="font-semibold text-lg">{entry.heat_no}</span>
                    </div>
                  )}
                  
                  {entry.rod_section_size && (
                    <div className="flex">
                      <span className="font-bold w-28">Size:</span>
                      <span>{entry.rod_section_size}</span>
                    </div>
                  )}
                  
                  {entry.alloy && (
                    <div className="flex">
                      <span className="font-bold w-28">Grade:</span>
                      <span>{entry.alloy}</span>
                    </div>
                  )}
                  
                  {entry.supplier_name && (
                    <div className="flex col-span-2">
                      <span className="font-bold w-28">Supplier:</span>
                      <span>{entry.supplier_name}</span>
                    </div>
                  )}
                  
                  {entry.tc_number && (
                    <div className="flex">
                      <span className="font-bold w-28">TC No:</span>
                      <span>{entry.tc_number}</span>
                    </div>
                  )}
                  
                  {entry.challan_no && (
                    <div className="flex">
                      <span className="font-bold w-28">Challan:</span>
                      <span>{entry.challan_no}</span>
                    </div>
                  )}
                </div>

                {/* Weight - Highlighted */}
                <div className="bg-black text-white p-2 text-center mt-3">
                  <div className="text-sm">WEIGHT</div>
                  <div className="text-2xl font-bold">{entry.gross_weight_kg.toFixed(2)} kg</div>
                  {entry.tare_weight_kg > 0 && (
                    <div className="text-xs">
                      (Net: {entry.net_weight_kg.toFixed(2)} kg | Tare: {entry.tare_weight_kg.toFixed(2)} kg)
                    </div>
                  )}
                </div>

                <div className="border-t border-black pt-1 mt-2 text-center text-xs text-muted-foreground">
                  RV Industries • Gate Register
                </div>
              </div>
            </TabsContent>

            <TabsContent value="challan">
              {/* Delivery Challan */}
              <div className="p-8 bg-white border">
                <div className="text-center mb-6">
                  <h1 className="text-2xl font-bold">RV INDUSTRIES</h1>
                  <p className="text-sm text-muted-foreground">Delivery Challan / Gate Pass</p>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                  <div>
                    <p><strong>Challan No:</strong> {entry.gate_entry_no}</p>
                    <p><strong>Date:</strong> {format(new Date(entry.entry_time), 'dd-MMM-yyyy')}</p>
                    <p><strong>Time:</strong> {format(new Date(entry.entry_time), 'HH:mm')}</p>
                  </div>
                  <div>
                    <p><strong>Direction:</strong> {entry.direction === 'IN' ? 'INWARD' : 'OUTWARD'}</p>
                    <p><strong>Type:</strong> {getMaterialTypeLabel(entry.material_type)}</p>
                    {entry.challan_no && <p><strong>Ref Challan:</strong> {entry.challan_no}</p>}
                  </div>
                </div>

                {entry.supplier_name && (
                  <div className="mb-4 p-3 border">
                    <p className="font-bold">
                      {entry.direction === 'IN' ? 'Received From:' : 'Dispatched To:'}
                    </p>
                    <p>{entry.supplier_name}</p>
                  </div>
                )}

                <table className="w-full border-collapse mb-6">
                  <thead>
                    <tr className="bg-muted">
                      <th className="border p-2 text-left">Description</th>
                      <th className="border p-2 text-right">Qty</th>
                      <th className="border p-2 text-right">Gross Wt (kg)</th>
                      <th className="border p-2 text-right">Net Wt (kg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border p-2">
                        {entry.item_name || entry.rod_section_size || getMaterialTypeLabel(entry.material_type)}
                        {entry.alloy && ` - ${entry.alloy}`}
                        {entry.heat_no && (
                          <div className="text-sm text-muted-foreground">Heat: {entry.heat_no}</div>
                        )}
                      </td>
                      <td className="border p-2 text-right">{entry.packaging_count || 1}</td>
                      <td className="border p-2 text-right font-semibold">{entry.gross_weight_kg.toFixed(2)}</td>
                      <td className="border p-2 text-right">{entry.net_weight_kg.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>

                {entry.vehicle_no && (
                  <p className="text-sm mb-1"><strong>Vehicle No:</strong> {entry.vehicle_no}</p>
                )}
                {entry.transporter && (
                  <p className="text-sm mb-4"><strong>Transporter:</strong> {entry.transporter}</p>
                )}

                <div className="flex justify-between mt-16">
                  <div className="text-center w-1/3">
                    <div className="border-t border-black pt-1">Prepared By</div>
                  </div>
                  <div className="text-center w-1/3">
                    <div className="border-t border-black pt-1">Checked By</div>
                  </div>
                  <div className="text-center w-1/3">
                    <div className="border-t border-black pt-1">Received By</div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print {printType === 'tag' ? 'Tag' : 'Challan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}