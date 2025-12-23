import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Package, ShoppingCart, Factory, FileText, DollarSign, ClipboardCheck, Truck, Users } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";

interface SearchResult {
  id: string;
  type: 'customer' | 'sales_order' | 'work_order' | 'item' | 'purchase_order' | 'invoice' | 'qc_record' | 'shipment';
  title: string;
  subtitle?: string;
  metadata?: string;
}

export const GlobalSearch = () => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { hasAnyRole, isFinanceRole } = useUserRole();

  // Keyboard shortcut: Ctrl+K or Cmd+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Perform search
  const performSearch = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    const allResults: SearchResult[] = [];

    try {
      // Parse filter if exists (e.g., "customer:acme" or "wo:ISO")
      const filterMatch = query.match(/^(\w+):(.+)$/);
      const hasFilter = !!filterMatch;
      const filterType = filterMatch?.[1]?.toLowerCase();
      const filterQuery = filterMatch?.[2]?.trim() || query;

      // Search Customers
      if (!hasFilter || filterType === 'customer') {
        const { data: customers } = await supabase
          .from('customer_master')
          .select('id, customer_name, party_code, city, country')
          .or(`customer_name.ilike.%${filterQuery}%,party_code.ilike.%${filterQuery}%`)
          .limit(5);

        customers?.forEach(c => {
          allResults.push({
            id: c.id,
            type: 'customer',
            title: c.customer_name,
            subtitle: c.party_code || undefined,
            metadata: [c.city, c.country].filter(Boolean).join(', ')
          });
        });
      }

      // Search Sales Orders
      if (!hasFilter || filterType === 'so' || filterType === 'sales') {
        const { data: salesOrders } = await supabase
          .from('sales_orders')
          .select('id, so_id, customer, po_number, status')
          .or(`so_id.ilike.%${filterQuery}%,customer.ilike.%${filterQuery}%,po_number.ilike.%${filterQuery}%`)
          .limit(5);

        salesOrders?.forEach(so => {
          allResults.push({
            id: so.id,
            type: 'sales_order',
            title: so.so_id,
            subtitle: so.customer,
            metadata: `PO: ${so.po_number} • ${so.status}`
          });
        });
      }

      // Search Work Orders
      if (!hasFilter || filterType === 'wo' || filterType === 'work') {
        const { data: workOrders } = await supabase
          .from('work_orders')
          .select('id, wo_number, customer, item_code, status, current_stage')
          .or(`wo_number.ilike.%${filterQuery}%,customer.ilike.%${filterQuery}%,item_code.ilike.%${filterQuery}%`)
          .limit(5);

        workOrders?.forEach(wo => {
          allResults.push({
            id: wo.id,
            type: 'work_order',
            title: wo.wo_number,
            subtitle: `${wo.customer} • ${wo.item_code}`,
            metadata: `${wo.status} • ${wo.current_stage}`
          });
        });
      }

      // Search Items
      if (!hasFilter || filterType === 'item') {
        const { data: items } = await supabase
          .from('item_master')
          .select('id, item_code, alloy, material_size_mm')
          .ilike('item_code', `%${filterQuery}%`)
          .limit(5);

        items?.forEach(item => {
          allResults.push({
            id: item.id,
            type: 'item',
            title: item.item_code,
            subtitle: item.alloy || undefined,
            metadata: item.material_size_mm ? `${item.material_size_mm}mm` : undefined
          });
        });
      }

      // Search Purchase Orders (if user has permission)
      if (hasAnyRole(['admin', 'purchase', 'stores'])) {
        if (!hasFilter || filterType === 'po' || filterType === 'purchase' || filterType === 'rpo') {
          const { data: rawPurchaseOrders } = await supabase
            .from('raw_purchase_orders')
            .select('id, rpo_no, supplier_id, status, alloy')
            .ilike('rpo_no', `%${filterQuery}%`)
            .limit(5);

          rawPurchaseOrders?.forEach(rpo => {
            allResults.push({
              id: rpo.id,
              type: 'purchase_order',
              title: rpo.rpo_no,
              subtitle: rpo.alloy || undefined,
              metadata: rpo.status
            });
          });
        }
      }

      // Search Invoices (if user has finance permission)
      if (isFinanceRole()) {
        if (!hasFilter || filterType === 'invoice' || filterType === 'inv') {
          const { data: invoices } = await supabase
            .from('invoices')
            .select('id, invoice_no, status, total_amount')
            .ilike('invoice_no', `%${filterQuery}%`)
            .limit(5);

          invoices?.forEach(inv => {
            allResults.push({
              id: inv.id,
              type: 'invoice',
              title: inv.invoice_no,
              subtitle: `₹${(inv.total_amount / 100000).toFixed(2)}L`,
              metadata: inv.status
            });
          });
        }
      }

      // Search QC Records
      if (hasAnyRole(['admin', 'quality', 'production'])) {
        if (!hasFilter || filterType === 'qc') {
          const { data: qcRecords } = await supabase
            .from('qc_records')
            .select('id, qc_id, wo_id, qc_type, result')
            .ilike('qc_id', `%${filterQuery}%`)
            .limit(5);

          qcRecords?.forEach(qc => {
            allResults.push({
              id: qc.id,
              type: 'qc_record',
              title: qc.qc_id,
              subtitle: qc.qc_type,
              metadata: qc.result
            });
          });
        }
      }

      // Search Material Lots by Heat No or Lot ID
      if (!hasFilter || filterType === 'heat' || filterType === 'lot') {
        const { data: materialLots } = await supabase
          .from('material_lots')
          .select('id, lot_id, heat_no, alloy, status')
          .or(`lot_id.ilike.%${filterQuery}%,heat_no.ilike.%${filterQuery}%`)
          .limit(5);

        materialLots?.forEach(lot => {
          allResults.push({
            id: lot.id,
            type: 'item',
            title: `Lot: ${lot.lot_id}`,
            subtitle: `Heat: ${lot.heat_no} • ${lot.alloy}`,
            metadata: lot.status
          });
        });
      }

      // Search Cartons
      if (!hasFilter || filterType === 'carton') {
        const { data: cartons } = await supabase
          .from('cartons')
          .select('id, carton_id, wo_id, quantity')
          .ilike('carton_id', `%${filterQuery}%`)
          .limit(5);

        cartons?.forEach(carton => {
          allResults.push({
            id: carton.id,
            type: 'shipment',
            title: `Carton: ${carton.carton_id}`,
            subtitle: `${carton.quantity} pcs`,
            metadata: 'Packing'
          });
        });
      }

      setResults(allResults);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  }, [hasAnyRole, isFinanceRole]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(search);
    }, 300);

    return () => clearTimeout(timer);
  }, [search, performSearch]);

  const getIcon = (type: SearchResult['type']) => {
    switch (type) {
      case 'customer': return Users;
      case 'sales_order': return ShoppingCart;
      case 'work_order': return Factory;
      case 'item': return Package;
      case 'purchase_order': return FileText;
      case 'invoice': return DollarSign;
      case 'qc_record': return ClipboardCheck;
      case 'shipment': return Truck;
    }
  };

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    setSearch("");

    // Navigate based on type
    switch (result.type) {
      case 'customer':
        navigate(`/customer/${result.id}`);
        break;
      case 'sales_order':
        navigate(`/sales`); // Could add ?id=${result.id} if detail page exists
        break;
      case 'work_order':
        navigate(`/work-orders/${result.id}`);
        break;
      case 'item':
        navigate(`/item-master`);
        break;
      case 'purchase_order':
        navigate(`/purchase`);
        break;
      case 'invoice':
        navigate(`/finance/invoices/${result.id}`);
        break;
      case 'qc_record':
        navigate(`/quality`);
        break;
      case 'shipment':
        navigate(`/dispatch`);
        break;
    }
  };

  const groupedResults = results.reduce((acc, result) => {
    if (!acc[result.type]) {
      acc[result.type] = [];
    }
    acc[result.type].push(result);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  const typeLabels: Record<SearchResult['type'], string> = {
    customer: 'Customers',
    sales_order: 'Sales Orders',
    work_order: 'Work Orders',
    item: 'Items & Materials',
    purchase_order: 'Purchase Orders',
    invoice: 'Invoices',
    qc_record: 'QC Records',
    shipment: 'Shipments & Packing'
  };

  return (
    <>
      <Button
        variant="outline"
        className="relative w-full justify-start text-sm text-muted-foreground sm:pr-12 md:w-64 lg:w-96"
        onClick={() => setOpen(true)}
      >
        <Search className="mr-2 h-4 w-4" />
        <span className="inline-flex">Search...</span>
        <kbd className="pointer-events-none absolute right-1.5 top-1.5 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput 
          placeholder="Search customers, orders, items, invoices... (try customer:, wo:, so:)" 
          value={search}
          onValueChange={setSearch}
        />
        <CommandList>
          <CommandEmpty>
            {loading ? 'Searching...' : 'No results found.'}
          </CommandEmpty>
          
          {Object.entries(groupedResults).map(([type, items]) => {
            const Icon = getIcon(type as SearchResult['type']);
            return (
              <CommandGroup key={type} heading={typeLabels[type as SearchResult['type']]}>
                {items.map((result) => (
                  <CommandItem
                    key={result.id}
                    value={`${result.title} ${result.subtitle || ''}`}
                    onSelect={() => handleSelect(result)}
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    <div className="flex-1">
                      <div className="font-medium">{result.title}</div>
                      {result.subtitle && (
                        <div className="text-xs text-muted-foreground">{result.subtitle}</div>
                      )}
                    </div>
                    {result.metadata && (
                      <div className="text-xs text-muted-foreground ml-2">
                        {result.metadata}
                      </div>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
        </CommandList>
      </CommandDialog>
    </>
  );
};
