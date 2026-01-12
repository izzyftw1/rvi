import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, X, Filter } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { LogisticsFilters } from "@/hooks/useLogisticsData";

interface LogisticsFiltersBarProps {
  filters: LogisticsFilters;
  onFilterChange: (filters: Partial<LogisticsFilters>) => void;
  customers: { id: string; customer_name: string }[];
  workOrders: { id: string; display_id: string }[];
}

export const LogisticsFiltersBar = memo(({ 
  filters, 
  onFilterChange, 
  customers, 
  workOrders 
}: LogisticsFiltersBarProps) => {
  const hasActiveFilters = filters.customer || filters.workOrder || filters.itemCode || 
    filters.dispatchStatus || filters.dateRange.from || filters.dateRange.to;

  const clearFilters = () => {
    onFilterChange({
      dateRange: { from: null, to: null },
      customer: "",
      workOrder: "",
      itemCode: "",
      dispatchStatus: "",
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/30 rounded-lg border">
      <Filter className="h-4 w-4 text-muted-foreground" />
      
      {/* Date Range */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-8 text-xs justify-start",
              filters.dateRange.from && "bg-primary/10"
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
            {filters.dateRange.from ? (
              filters.dateRange.to ? (
                `${format(filters.dateRange.from, "MMM d")} - ${format(filters.dateRange.to, "MMM d")}`
              ) : (
                format(filters.dateRange.from, "MMM d, yyyy")
              )
            ) : (
              "Date Range"
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={{ from: filters.dateRange.from || undefined, to: filters.dateRange.to || undefined }}
            onSelect={(range) => onFilterChange({ 
              dateRange: { from: range?.from || null, to: range?.to || null } 
            })}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>

      {/* Customer */}
      <Select 
        value={filters.customer} 
        onValueChange={(value) => onFilterChange({ customer: value === "all" ? "" : value })}
      >
        <SelectTrigger className={cn("h-8 w-[150px] text-xs", filters.customer && "bg-primary/10")}>
          <SelectValue placeholder="Customer" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Customers</SelectItem>
          {customers.map((c) => (
            <SelectItem key={c.id} value={c.customer_name}>{c.customer_name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Work Order */}
      <Select 
        value={filters.workOrder} 
        onValueChange={(value) => onFilterChange({ workOrder: value === "all" ? "" : value })}
      >
        <SelectTrigger className={cn("h-8 w-[140px] text-xs", filters.workOrder && "bg-primary/10")}>
          <SelectValue placeholder="Work Order" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All WOs</SelectItem>
          {workOrders.map((wo) => (
            <SelectItem key={wo.id} value={wo.id}>{wo.display_id}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Item Code */}
      <Input
        placeholder="Item code..."
        value={filters.itemCode}
        onChange={(e) => onFilterChange({ itemCode: e.target.value })}
        className={cn("h-8 w-[120px] text-xs", filters.itemCode && "bg-primary/10")}
      />

      {/* Dispatch Status */}
      <Select 
        value={filters.dispatchStatus} 
        onValueChange={(value) => onFilterChange({ dispatchStatus: value === "all" ? "" : value })}
      >
        <SelectTrigger className={cn("h-8 w-[130px] text-xs", filters.dispatchStatus && "bg-primary/10")}>
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="packed">Packed</SelectItem>
          <SelectItem value="partial">Partial</SelectItem>
          <SelectItem value="dispatched">Dispatched</SelectItem>
        </SelectContent>
      </Select>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearFilters}
          className="h-8 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
});

LogisticsFiltersBar.displayName = "LogisticsFiltersBar";
