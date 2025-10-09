import { useState } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save } from "lucide-react";

interface Reconciliation {
  id: string;
  rpo_id: string;
  reason: string;
  resolution: string;
  qty_delta_kg: number | null;
  rate_delta: number | null;
  amount_delta: number | null;
  resolution_ref: string | null;
  notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

interface ReconciliationRowProps {
  reconciliation: Reconciliation;
  onMarkResolved: (id: string, resolution: string, resolutionRef: string, notes: string) => Promise<void>;
}

export function ReconciliationRow({ reconciliation, onMarkResolved }: ReconciliationRowProps) {
  const [editMode, setEditMode] = useState(false);
  const [resolution, setResolution] = useState(reconciliation.resolution);
  const [resolutionRef, setResolutionRef] = useState(reconciliation.resolution_ref || "");
  const [notes, setNotes] = useState(reconciliation.notes || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onMarkResolved(reconciliation.id, resolution, resolutionRef, notes);
      setEditMode(false);
    } finally {
      setSaving(false);
    }
  };

  const getReasonBadge = (reason: string) => {
    const variants: Record<string, any> = {
      short_supply: { variant: "destructive" },
      excess_supply: { variant: "default", className: "bg-blue-600" },
      rate_variance: { variant: "secondary", className: "bg-amber-100 text-amber-700 dark:bg-amber-950" }
    };
    const config = variants[reason] || { variant: "outline" };
    return <Badge {...config}>{reason.replace(/_/g, " ").toUpperCase()}</Badge>;
  };

  const getResolutionBadge = (res: string) => {
    const variants: Record<string, any> = {
      pending: { variant: "outline" },
      credit_note: { variant: "default", className: "bg-green-600" },
      debit_note: { variant: "destructive" },
      price_adjustment: { variant: "secondary" }
    };
    const config = variants[res] || { variant: "outline" };
    return <Badge {...config}>{res.replace(/_/g, " ").toUpperCase()}</Badge>;
  };

  return (
    <TableRow>
      <TableCell>{getReasonBadge(reconciliation.reason)}</TableCell>
      <TableCell>{reconciliation.qty_delta_kg?.toFixed(3) || "-"}</TableCell>
      <TableCell>{reconciliation.rate_delta ? `₹${reconciliation.rate_delta.toFixed(2)}` : "-"}</TableCell>
      <TableCell>{reconciliation.amount_delta ? `₹${reconciliation.amount_delta.toFixed(2)}` : "-"}</TableCell>
      <TableCell>
        {editMode ? (
          <Select value={resolution} onValueChange={setResolution}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="credit_note">Credit Note</SelectItem>
              <SelectItem value="debit_note">Debit Note</SelectItem>
              <SelectItem value="price_adjustment">Price Adjustment</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          getResolutionBadge(reconciliation.resolution)
        )}
      </TableCell>
      <TableCell>
        {editMode ? (
          <Input 
            value={resolutionRef} 
            onChange={(e) => setResolutionRef(e.target.value)}
            placeholder="CN/DN number"
            className="w-[120px]"
          />
        ) : (
          reconciliation.resolution_ref || "-"
        )}
      </TableCell>
      <TableCell className="max-w-[200px]">
        {editMode ? (
          <Textarea 
            value={notes} 
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Resolution notes"
            rows={2}
            className="w-full"
          />
        ) : (
          <p className="text-xs truncate">{reconciliation.notes || "-"}</p>
        )}
      </TableCell>
      <TableCell>
        {reconciliation.resolved_at ? (
          <div className="text-xs">
            <p className="font-medium">Resolved</p>
            <p className="text-muted-foreground">{new Date(reconciliation.resolved_at).toLocaleDateString()}</p>
          </div>
        ) : (
          <Badge variant="outline">Open</Badge>
        )}
      </TableCell>
      <TableCell>
        {!reconciliation.resolved_at && (
          editMode ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="mr-1 h-3 w-3" />
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditMode(true)}>
              Edit
            </Button>
          )
        )}
      </TableCell>
    </TableRow>
  );
}
