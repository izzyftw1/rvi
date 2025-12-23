import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface WorkOrderOption {
  id: string; // UUID - used for binding
  wo_number: string; // WO-YYYY-XXXXX format
  item_code: string | null;
  customer: string | null;
  quantity: number | null;
}

interface WorkOrderSelectProps {
  value: string | undefined | null;
  onValueChange: (value: string) => void;
  workOrders: WorkOrderOption[];
  placeholder?: string;
  disabled?: boolean;
  includeNone?: boolean;
  noneLabel?: string;
  className?: string;
  triggerClassName?: string;
}

/**
 * Standardized Work Order Select Component
 * 
 * Features:
 * - Primary label: WO-YYYY-XXXXX
 * - Secondary line: Item Name | Customer | Qty
 * - Search by WO code, item name, or customer
 * - Binds to work_order_id (UUID), never text
 */
export function WorkOrderSelect({
  value,
  onValueChange,
  workOrders,
  placeholder = "Select work order...",
  disabled = false,
  includeNone = false,
  noneLabel = "None",
  className,
  triggerClassName,
}: WorkOrderSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  // Find the selected work order for display
  const selectedWO = React.useMemo(() => {
    if (!value || value === "none") return null;
    return workOrders.find((wo) => wo.id === value);
  }, [value, workOrders]);

  // Filter work orders based on search query
  const filteredWorkOrders = React.useMemo(() => {
    if (!searchQuery.trim()) return workOrders;
    
    const query = searchQuery.toLowerCase().trim();
    return workOrders.filter((wo) => {
      const woNumber = (wo.wo_number || "").toLowerCase();
      const itemCode = (wo.item_code || "").toLowerCase();
      const customer = (wo.customer || "").toLowerCase();
      
      return (
        woNumber.includes(query) ||
        itemCode.includes(query) ||
        customer.includes(query)
      );
    });
  }, [workOrders, searchQuery]);

  // Format secondary line: Item Name | Customer | Qty
  const formatSecondaryLine = (wo: WorkOrderOption): string => {
    const parts: string[] = [];
    if (wo.item_code) parts.push(wo.item_code);
    if (wo.customer) parts.push(wo.customer);
    if (wo.quantity != null) parts.push(`Qty ${wo.quantity}`);
    return parts.join(" | ");
  };

  // Get display text for trigger button
  const getDisplayText = (): React.ReactNode => {
    if (!value || value === "none") {
      return <span className="text-muted-foreground">{placeholder}</span>;
    }
    
    if (selectedWO) {
      return (
        <div className="flex flex-col items-start text-left">
          <span className="font-medium">{selectedWO.wo_number}</span>
          <span className="text-xs text-muted-foreground truncate max-w-[200px]">
            {formatSecondaryLine(selectedWO)}
          </span>
        </div>
      );
    }
    
    return <span className="text-muted-foreground">{placeholder}</span>;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between h-auto min-h-10 py-2",
            triggerClassName
          )}
        >
          {getDisplayText()}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-[350px] p-0", className)} align="start">
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="Search by WO code, item, or customer..." 
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            <CommandEmpty>No work orders found.</CommandEmpty>
            <CommandGroup>
              {includeNone && (
                <CommandItem
                  value="none"
                  onSelect={() => {
                    onValueChange("none");
                    setOpen(false);
                    setSearchQuery("");
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === "none" ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="text-muted-foreground">{noneLabel}</span>
                </CommandItem>
              )}
              {filteredWorkOrders.map((wo) => (
                <CommandItem
                  key={wo.id}
                  value={wo.id}
                  onSelect={() => {
                    onValueChange(wo.id);
                    setOpen(false);
                    setSearchQuery("");
                  }}
                  className="flex flex-col items-start py-2"
                >
                  <div className="flex items-center w-full">
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        value === wo.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col">
                      <span className="font-medium">{wo.wo_number}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatSecondaryLine(wo)}
                      </span>
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
