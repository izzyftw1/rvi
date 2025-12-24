import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { format, differenceInDays } from 'date-fns';
import { Package, Send, Loader2, Search, AlertTriangle } from 'lucide-react';

interface InventoryItem {
  id: string;
  item_code: string;
  customer_id: string | null;
  customer_name: string | null;
  work_order_id: string | null;
  quantity_available: number;
  quantity_reserved: number;
  source_type: string;
  created_at: string;
  heat_nos: string[] | null;
  work_orders?: { wo_number: string } | null;
  selected?: boolean;
  dispatch_qty?: number;
}

interface WorkOrder {
  id: string;
  wo_number: string;
  display_id: string;
  item_code: string;
  customer: string;
  quantity: number;
}

export function DispatchFromInventory() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [dispatching, setDispatching] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDispatchDialog, setShowDispatchDialog] = useState(false);
  const [selectedWO, setSelectedWO] = useState<string>('');
  const [shipmentId, setShipmentId] = useState('');
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load available inventory
      const { data: invData } = await supabase
        .from('finished_goods_inventory')
        .select(`
          *,
          work_orders (wo_number)
        `)
        .gt('quantity_available', 0)
        .order('created_at', { ascending: false });

      setInventory((invData || []).map(i => ({
        ...i,
        selected: false,
        dispatch_qty: 0,
      })));

      // Load work orders that might need stock fulfillment
      const { data: woData } = await supabase
        .from('work_orders')
        .select('id, wo_number, display_id, item_code, customer, quantity')
        .in('status', ['in_progress', 'packing', 'pending'])
        .order('created_at', { ascending: false })
        .limit(100);

      setWorkOrders(woData || []);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (id: string) => {
    setInventory(prev => prev.map(item => {
      if (item.id === id) {
        const newSelected = !item.selected;
        return {
          ...item,
          selected: newSelected,
          dispatch_qty: newSelected ? item.quantity_available : 0,
        };
      }
      return item;
    }));
  };

  const updateDispatchQty = (id: string, qty: number) => {
    setInventory(prev => prev.map(item => {
      if (item.id === id) {
        return {
          ...item,
          dispatch_qty: Math.min(Math.max(0, qty), item.quantity_available),
        };
      }
      return item;
    }));
  };

  const selectedItems = inventory.filter(i => i.selected && (i.dispatch_qty || 0) > 0);
  const totalDispatchQty = selectedItems.reduce((sum, i) => sum + (i.dispatch_qty || 0), 0);

  const filteredInventory = inventory.filter(item => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      item.item_code.toLowerCase().includes(search) ||
      item.customer_name?.toLowerCase().includes(search) ||
      item.work_orders?.wo_number?.toLowerCase().includes(search)
    );
  });

  const handleDispatch = async () => {
    if (selectedItems.length === 0) {
      toast.error('Please select items to dispatch');
      return;
    }

    setDispatching(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const generatedShipId = shipmentId.trim() || `SHIP-STK-${Date.now().toString().slice(-8)}`;

      // Create shipment
      const { data: shipment, error: shipmentError } = await supabase
        .from('shipments')
        .insert({
          ship_id: generatedShipId,
          customer: selectedItems[0].customer_name || 'Stock Dispatch',
          status: 'dispatched',
        })
        .select()
        .single();

      if (shipmentError) throw shipmentError;

      // Create inventory movements and update quantities
      for (const item of selectedItems) {
        const dispatchQty = item.dispatch_qty || 0;

        // Create inventory movement
        await supabase.from('inventory_movements').insert({
          inventory_id: item.id,
          movement_type: 'dispatch',
          quantity: -dispatchQty,
          work_order_id: selectedWO || item.work_order_id,
          notes: `Dispatched via ${generatedShipId}${remarks ? ` - ${remarks}` : ''}`,
          created_by: user?.id,
        });

        // Update inventory
        await supabase
          .from('finished_goods_inventory')
          .update({
            quantity_available: item.quantity_available - dispatchQty,
            last_movement_at: new Date().toISOString(),
          })
          .eq('id', item.id);
      }

      toast.success(`Dispatched ${totalDispatchQty} pcs via ${generatedShipId}`);
      setShowDispatchDialog(false);
      setSelectedWO('');
      setShipmentId('');
      setRemarks('');
      loadData();
    } catch (error: any) {
      console.error('Dispatch error:', error);
      toast.error('Failed to dispatch: ' + error.message);
    } finally {
      setDispatching(false);
    }
  };

  const getAgeBadge = (createdAt: string) => {
    const days = differenceInDays(new Date(), new Date(createdAt));
    if (days <= 30) return <Badge className="bg-green-100 text-green-800">{days}d</Badge>;
    if (days <= 90) return <Badge className="bg-blue-100 text-blue-800">{days}d</Badge>;
    if (days <= 180) return <Badge className="bg-amber-100 text-amber-800">{days}d</Badge>;
    return <Badge variant="destructive">{days}d</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Dispatch from Stock
              </CardTitle>
              <CardDescription>
                Fulfill orders from existing finished goods inventory
              </CardDescription>
            </div>
            <Button
              onClick={() => setShowDispatchDialog(true)}
              disabled={selectedItems.length === 0}
            >
              <Send className="h-4 w-4 mr-2" />
              Dispatch Selected ({totalDispatchQty} pcs)
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by item code, customer, WO..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {filteredInventory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-amber-500" />
              <p>No available inventory to dispatch</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Item Code</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Source WO</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-right">Dispatch Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInventory.map(item => (
                  <TableRow key={item.id} className={item.selected ? 'bg-primary/5' : ''}>
                    <TableCell>
                      <Checkbox
                        checked={item.selected}
                        onCheckedChange={() => toggleSelection(item.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{item.item_code}</TableCell>
                    <TableCell>{item.customer_name || '-'}</TableCell>
                    <TableCell>{item.work_orders?.wo_number || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {item.source_type?.replace(/_/g, ' ') || 'overproduction'}
                      </Badge>
                    </TableCell>
                    <TableCell>{getAgeBadge(item.created_at)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {item.quantity_available.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        className="w-24 text-right"
                        value={item.dispatch_qty || ''}
                        onChange={(e) => updateDispatchQty(item.id, parseInt(e.target.value) || 0)}
                        disabled={!item.selected}
                        min={0}
                        max={item.quantity_available}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dispatch Dialog */}
      <Dialog open={showDispatchDialog} onOpenChange={setShowDispatchDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Dispatch from Stock</DialogTitle>
            <DialogDescription>
              Dispatching {selectedItems.length} item(s), {totalDispatchQty} pcs total
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>Link to Work Order (Optional)</Label>
              <Select value={selectedWO} onValueChange={setSelectedWO}>
                <SelectTrigger>
                  <SelectValue placeholder="Select work order..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No Work Order</SelectItem>
                  {workOrders.map(wo => (
                    <SelectItem key={wo.id} value={wo.id}>
                      {wo.display_id} - {wo.item_code} ({wo.customer})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Shipment ID (Optional)</Label>
              <Input
                placeholder="Auto-generated if empty"
                value={shipmentId}
                onChange={(e) => setShipmentId(e.target.value)}
              />
            </div>

            <div>
              <Label>Remarks</Label>
              <Input
                placeholder="Optional notes"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>

            {/* Summary */}
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">Dispatch Summary</h4>
              <div className="text-sm space-y-1">
                {selectedItems.map(item => (
                  <div key={item.id} className="flex justify-between">
                    <span>{item.item_code}</span>
                    <span className="font-medium">{item.dispatch_qty} pcs</span>
                  </div>
                ))}
                <div className="border-t pt-2 mt-2 flex justify-between font-medium">
                  <span>Total</span>
                  <span>{totalDispatchQty} pcs</span>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDispatchDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleDispatch} disabled={dispatching}>
              {dispatching && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm Dispatch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
