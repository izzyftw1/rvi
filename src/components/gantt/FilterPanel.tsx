import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Filter } from "lucide-react";

interface FilterPanelProps {
  machineGroups: string[];
  selectedMachineGroup: string;
  onMachineGroupChange: (value: string) => void;
  selectedJobStatus: string;
  onJobStatusChange: (value: string) => void;
  selectedShift: string;
  onShiftChange: (value: string) => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
}

export const FilterPanel = ({
  machineGroups,
  selectedMachineGroup,
  onMachineGroupChange,
  selectedJobStatus,
  onJobStatusChange,
  selectedShift,
  onShiftChange,
  searchTerm,
  onSearchChange,
}: FilterPanelProps) => {
  return (
    <div className="bg-card rounded-lg border p-4">
      <div className="flex items-center gap-2 mb-4">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">Filters</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="space-y-2">
          <Label htmlFor="search" className="text-xs">Search</Label>
          <Input
            id="search"
            placeholder="WO, Item, Customer..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-9"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="machine-group" className="text-xs">Machine Group</Label>
          <Select value={selectedMachineGroup} onValueChange={onMachineGroupChange}>
            <SelectTrigger id="machine-group" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Groups</SelectItem>
              {machineGroups.map((group) => (
                <SelectItem key={group} value={group}>
                  {group}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="job-status" className="text-xs">Job Status</Label>
          <Select value={selectedJobStatus} onValueChange={onJobStatusChange}>
            <SelectTrigger id="job-status" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="shift" className="text-xs">Shift</Label>
          <Select value={selectedShift} onValueChange={onShiftChange}>
            <SelectTrigger id="shift" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Shifts</SelectItem>
              <SelectItem value="day">Day Shift</SelectItem>
              <SelectItem value="night">Night Shift</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};