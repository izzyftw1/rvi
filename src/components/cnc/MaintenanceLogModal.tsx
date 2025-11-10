import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface MaintenanceLogModalProps {
  open: boolean;
  onClose: () => void;
  machineId: string;
  machineName: string;
}

const DOWNTIME_REASONS = [
  'Preventive',
  'Breakdown',
  'Electrical',
  'Tool Change',
  'Cleaning',
  'Other'
];

export const MaintenanceLogModal = ({ 
  open, 
  onClose, 
  machineId, 
  machineName 
}: MaintenanceLogModalProps) => {
  const [downtimeReason, setDowntimeReason] = useState('Preventive');
  const [startTime, setStartTime] = useState(new Date().toISOString().slice(0, 16));
  const [endTime, setEndTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [markingComplete, setMarkingComplete] = useState(false);

  const handleSave = async (complete: boolean = false) => {
    try {
      if (complete) {
        setMarkingComplete(true);
      } else {
        setLoading(true);
      }

      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user?.id;

      const logData = {
        machine_id: machineId,
        downtime_reason: downtimeReason,
        start_time: new Date(startTime).toISOString(),
        end_time: complete || endTime ? new Date(endTime || new Date()).toISOString() : null,
        logged_by: userId,
      };

      const { error } = await supabase
        .from('maintenance_logs')
        .insert([logData]);

      if (error) throw error;

      // Update machine status
      await supabase
        .from('machines')
        .update({ 
          status: complete || endTime ? 'idle' : 'maintenance',
          updated_at: new Date().toISOString()
        })
        .eq('id', machineId);

      toast.success(
        complete 
          ? 'Maintenance completed and logged successfully' 
          : 'Maintenance log created successfully'
      );
      
      onClose();
      resetForm();
    } catch (error: any) {
      console.error('Error saving maintenance log:', error);
      toast.error(error.message || 'Failed to save maintenance log');
    } finally {
      setLoading(false);
      setMarkingComplete(false);
    }
  };

  const resetForm = () => {
    setDowntimeReason('Preventive');
    setStartTime(new Date().toISOString().slice(0, 16));
    setEndTime('');
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log Maintenance</DialogTitle>
          <p className="text-sm text-muted-foreground">{machineName}</p>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Downtime Reason</Label>
            <Select value={downtimeReason} onValueChange={setDowntimeReason}>
              <SelectTrigger id="reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOWNTIME_REASONS.map((reason) => (
                  <SelectItem key={reason} value={reason}>
                    {reason}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="start">Start Time</Label>
            <Input
              id="start"
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="end">End Time (optional)</Label>
            <Input
              id="end"
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty if maintenance is still ongoing
            </p>
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading || markingComplete}>
            Cancel
          </Button>
          <Button 
            onClick={() => handleSave(false)} 
            disabled={loading || markingComplete}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
          <Button 
            onClick={() => handleSave(true)} 
            disabled={loading || markingComplete}
            variant="default"
          >
            {markingComplete && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Mark Complete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
