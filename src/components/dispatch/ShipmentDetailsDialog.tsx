import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Loader2, Ship, Truck } from "lucide-react";
import { COMMON_PORTS, COMMON_PAYMENT_TERMS } from "@/components/dispatch/ExportDocumentDialog";

/** Shipping details stored on public.shipments */
export interface ShipmentDetails {
  vehicle_no: string;
  transporter_name: string;
  lr_no: string;
  lr_date: string;
  bl_no: string;
  bl_date: string;
  port_of_loading: string;
  port_of_discharge: string;
  vessel_flight: string;
  pre_carriage_by: string;
  place_of_receipt: string;
  final_destination: string;
  payment_terms: string;
  kind_of_packages: string;
  ship_to_address: string;
}

export const EMPTY_SHIPMENT_DETAILS: ShipmentDetails = {
  vehicle_no: "",
  transporter_name: "",
  lr_no: "",
  lr_date: "",
  bl_no: "",
  bl_date: "",
  port_of_loading: "",
  port_of_discharge: "",
  vessel_flight: "BY SEA",
  pre_carriage_by: "N.A.",
  place_of_receipt: "N.A.",
  final_destination: "",
  payment_terms: "",
  kind_of_packages: "BOXES",
  ship_to_address: "",
};

export const SHIPMENT_DETAIL_COLUMNS = Object.keys(EMPTY_SHIPMENT_DETAILS).join(", ");

/** Same rule as the DB function so_payment_terms_text */
export const paymentTermsFromSO = (so?: { advance_percent?: number | null; payment_terms_days?: number | null } | null) => {
  if (!so) return "";
  const pct = Number(so.advance_percent || 0);
  if (pct >= 100) return "100% ADVANCE";
  if (pct > 0) return `${Math.round(pct)}% ADVANCE & BALANCE AGAINST COPY OF BL`;
  if (so.payment_terms_days != null) return `NET ${so.payment_terms_days} DAYS`;
  return "";
};

/** Turn a shipments row into form values (nulls -> defaults) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const detailsFromRow = (row: any): ShipmentDetails => {
  const out = { ...EMPTY_SHIPMENT_DETAILS };
  (Object.keys(out) as (keyof ShipmentDetails)[]).forEach((k) => {
    if (row?.[k] != null && row[k] !== "") out[k] = String(row[k]);
  });
  return out;
};

/** Form values -> DB payload (empty strings become null) */
export const detailsToPayload = (d: ShipmentDetails) =>
  Object.fromEntries(Object.entries(d).map(([k, v]) => [k, typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim() : v]));

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initial: ShipmentDetails;
  summary?: string;
  saving?: boolean;
  onConfirm: (details: ShipmentDetails) => void;
}

export function ShipmentDetailsDialog({ open, onOpenChange, mode, initial, summary, saving, onConfirm }: Props) {
  const [d, setD] = useState<ShipmentDetails>(initial);
  useEffect(() => { if (open) setD(initial); }, [open, initial]);
  const set = (k: keyof ShipmentDetails) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setD((p) => ({ ...p, [k]: e.target.value }));

  const field = (k: keyof ShipmentDetails, label: string, opts: { type?: string; list?: string; placeholder?: string } = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`sd-${k}`}>{label}</Label>
      <Input id={`sd-${k}`} type={opts.type || "text"} list={opts.list} placeholder={opts.placeholder} value={d[k]} onChange={set(k)} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            {mode === "create" ? "Shipping details" : "Edit shipping details"}
          </DialogTitle>
          <DialogDescription>
            {summary ? `${summary}. ` : ""}
            Saved on the shipment and used for the gate pass, commercial invoice and packing list. Anything not known yet (e.g. BL) can be added later from Recent Shipments.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2"><Truck className="h-4 w-4" />Road transport (gate pass)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {field("vehicle_no", "Vehicle no.", { placeholder: "e.g., GJ10 AB 1234" })}
              {field("transporter_name", "Transporter")}
              {field("lr_no", "LR no.")}
              {field("lr_date", "LR date", { type: "date" })}
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2"><Ship className="h-4 w-4" />Export shipping</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {field("port_of_loading", "Port of loading", { list: "sd-ports", placeholder: "NHAVA SHEVA (JNPT)" })}
              {field("port_of_discharge", "Port of discharge", { placeholder: "e.g., FELIXSTOWE" })}
              {field("vessel_flight", "Vessel / flight no.", { placeholder: "BY SEA" })}
              {field("final_destination", "Final destination")}
              {field("pre_carriage_by", "Pre-carriage by", { placeholder: "N.A." })}
              {field("place_of_receipt", "Place of receipt by pre-carrier", { placeholder: "N.A." })}
              {field("bl_no", "BL / AWB no.")}
              {field("bl_date", "BL / AWB date", { type: "date" })}
              {field("payment_terms", "Terms of payment", { list: "sd-terms" })}
              {field("kind_of_packages", "Kind of packages", { placeholder: "BOXES" })}
            </div>
            <datalist id="sd-ports">{COMMON_PORTS.map((p) => <option key={p} value={p} />)}</datalist>
            <datalist id="sd-terms">{COMMON_PAYMENT_TERMS.map((t) => <option key={t} value={t} />)}</datalist>
            <div className="space-y-1.5">
              <Label htmlFor="sd-ship_to_address">Ship-to address (if different from customer address)</Label>
              <Textarea id="sd-ship_to_address" rows={2} value={d.ship_to_address} onChange={set("ship_to_address")} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={() => onConfirm(d)} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {mode === "create" ? "Confirm & create shipment" : "Save details"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
