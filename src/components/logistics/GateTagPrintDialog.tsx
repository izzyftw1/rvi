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
  supplier_name: string | null;
  party_code: string | null;
  process_type: string | null;
  challan_no: string | null;
  dc_number: string | null;
  vehicle_no: string | null;
  transporter: string | null;
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
    if (!printRef.current) return;

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

    // Trigger browser print
    const printContent = printRef.current.innerHTML;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>${printType === 'tag' ? 'Material Tag' : 'Delivery Challan'}</title>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { font-family: Arial, sans-serif; }
              .tag-container {
                width: 6in;
                height: 4in;
                padding: 0.25in;
                border: 2px solid #000;
                display: flex;
                flex-direction: column;
              }
              .tag-header {
                text-align: center;
                border-bottom: 2px solid #000;
                padding-bottom: 8px;
                margin-bottom: 8px;
              }
              .tag-header h1 { font-size: 16px; margin-bottom: 4px; }
              .tag-header p { font-size: 12px; color: #666; }
              .tag-body { flex: 1; }
              .tag-row {
                display: flex;
                border-bottom: 1px solid #ccc;
                padding: 4px 0;
              }
              .tag-label {
                width: 40%;
                font-weight: bold;
                font-size: 11px;
              }
              .tag-value {
                width: 60%;
                font-size: 12px;
              }
              .tag-highlight {
                font-size: 18px;
                font-weight: bold;
                background: #f0f0f0;
                padding: 8px;
                text-align: center;
                margin: 8px 0;
              }
              .tag-footer {
                border-top: 2px solid #000;
                padding-top: 8px;
                margin-top: 8px;
                font-size: 10px;
                text-align: center;
                color: #666;
              }
              .challan-container {
                width: 8.5in;
                padding: 0.5in;
              }
              .challan-header {
                text-align: center;
                margin-bottom: 20px;
              }
              .challan-header h1 { font-size: 20px; }
              .challan-details {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
                margin-bottom: 20px;
              }
              .challan-table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 20px;
              }
              .challan-table th, .challan-table td {
                border: 1px solid #000;
                padding: 8px;
                text-align: left;
              }
              .challan-signatures {
                display: flex;
                justify-content: space-between;
                margin-top: 60px;
              }
              .signature-block {
                text-align: center;
                width: 30%;
              }
              .signature-line {
                border-top: 1px solid #000;
                margin-top: 40px;
                padding-top: 5px;
              }
              @media print {
                body { -webkit-print-color-adjust: exact; }
              }
            </style>
          </head>
          <body>
            ${printContent}
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
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