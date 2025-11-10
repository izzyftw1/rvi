import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, ShoppingCart, FileText, CheckCircle } from "lucide-react";

interface MaterialDetailModalProps {
  open: boolean;
  onClose: () => void;
  materialGrade: string;
  alloy: string;
}

export function MaterialDetailModal({ open, onClose, materialGrade, alloy }: MaterialDetailModalProps) {
  const [loading, setLoading] = useState(true);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [grnHistory, setGrnHistory] = useState<any[]>([]);
  const [stockLots, setStockLots] = useState<any[]>([]);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, materialGrade, alloy]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load work orders
      const { data: woData } = await supabase
        .from('material_requirements_v2')
        .select(`
          *,
          work_orders!wo_id(wo_number, status, customer)
        `)
        .eq('material_grade', materialGrade)
        .eq('alloy', alloy);

      setWorkOrders(woData || []);

      // Load purchase orders
      const { data: poData } = await supabase
        .from('raw_material_po')
        .select(`
          *,
          suppliers(name)
        `)
        .eq('material_grade', materialGrade)
        .eq('alloy', alloy)
        .order('created_at', { ascending: false });

      setPurchaseOrders(poData || []);

      // Load GRN history
      const { data: grnData } = await supabase
        .from('grn_receipts')
        .select('*')
        .eq('material_grade', materialGrade)
        .eq('alloy', alloy)
        .order('received_date', { ascending: false })
        .limit(10);

      setGrnHistory(grnData || []);

      // Load stock lots
      const { data: lotsData } = await supabase
        .from('material_lots')
        .select('*')
        .eq('material_size_mm', materialGrade)
        .eq('alloy', alloy)
        .eq('status', 'received');

      setStockLots(lotsData || []);

    } catch (error) {
      console.error('Error loading material details:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{materialGrade} - {alloy}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="flow" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="flow">
              <Package className="w-4 h-4 mr-2" />
              Material Flow
            </TabsTrigger>
            <TabsTrigger value="pos">
              <ShoppingCart className="w-4 h-4 mr-2" />
              Purchase Orders
            </TabsTrigger>
            <TabsTrigger value="grn">
              <FileText className="w-4 h-4 mr-2" />
              GRN History
            </TabsTrigger>
            <TabsTrigger value="stock">
              <CheckCircle className="w-4 h-4 mr-2" />
              Stock Lots
            </TabsTrigger>
          </TabsList>

          <TabsContent value="flow" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Linked Work Orders</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>WO Number</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Qty (pcs)</TableHead>
                      <TableHead className="text-right">Required (kg)</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workOrders.map(wo => (
                      <TableRow key={wo.id}>
                        <TableCell className="font-medium">{wo.work_orders?.wo_number || 'N/A'}</TableCell>
                        <TableCell>{wo.customer}</TableCell>
                        <TableCell className="text-right">{wo.qty_pcs}</TableCell>
                        <TableCell className="text-right">{wo.total_gross_kg.toFixed(3)}</TableCell>
                        <TableCell>
                          <Badge>{wo.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pos" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Purchase Orders</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO ID</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Qty (kg)</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead>Expected Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchaseOrders.map(po => (
                      <TableRow key={po.id}>
                        <TableCell className="font-medium">{po.po_id}</TableCell>
                        <TableCell>{po.suppliers?.name || 'N/A'}</TableCell>
                        <TableCell className="text-right">{po.qty_kg.toFixed(3)}</TableCell>
                        <TableCell className="text-right">₹{po.rate_per_kg}</TableCell>
                        <TableCell>{new Date(po.expected_date).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Badge>{po.status.replace('_', ' ')}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="grn" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Recent GRN Receipts</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>GRN No</TableHead>
                      <TableHead>Lot Number</TableHead>
                      <TableHead className="text-right">Received (kg)</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Batch Ref</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grnHistory.map(grn => (
                      <TableRow key={grn.id}>
                        <TableCell className="font-medium">{grn.grn_no}</TableCell>
                        <TableCell>{grn.lot_number}</TableCell>
                        <TableCell className="text-right">{grn.received_qty_kg.toFixed(3)}</TableCell>
                        <TableCell>{new Date(grn.received_date).toLocaleDateString()}</TableCell>
                        <TableCell>{grn.supplier_batch_ref || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="stock" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Current Stock Lots</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lot ID</TableHead>
                      <TableHead>Heat No</TableHead>
                      <TableHead className="text-right">Net Weight (kg)</TableHead>
                      <TableHead>Received Date</TableHead>
                      <TableHead>QC Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stockLots.map(lot => (
                      <TableRow key={lot.id}>
                        <TableCell className="font-medium">{lot.lot_id}</TableCell>
                        <TableCell>{lot.heat_no}</TableCell>
                        <TableCell className="text-right">{lot.net_weight.toFixed(3)}</TableCell>
                        <TableCell>{new Date(lot.received_date).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Badge variant={lot.qc_status === 'approved' ? 'default' : 'secondary'}>
                            {lot.qc_status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
