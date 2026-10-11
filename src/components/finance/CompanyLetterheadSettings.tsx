import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { BRANDING_BUCKET, HEADER_FILE, FOOTER_FILE, prepareLetterhead } from "@/lib/pdfLetterhead";

const FIELDS: { key: string; label: string; multiline?: boolean; hint?: string }[] = [
  { key: "company_name", label: "Company name" },
  { key: "company_address", label: "Address", multiline: true },
  { key: "company_phones", label: "Phone(s)" },
  { key: "company_email", label: "Email" },
  { key: "company_website", label: "Website" },
  { key: "company_gstin", label: "GSTIN" },
  { key: "company_iec", label: "IEC" },
  { key: "company_udyam", label: "UDYAM" },
  { key: "signatory_designation", label: "Signatory" },
  { key: "lut_arn", label: "LUT ARN (optional)", hint: "Printed on export invoices when set" },
];

export const CompanyDetailsCard = ({ canEdit }: { canEdit: boolean }) => {
  const [v, setV] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    supabase.from("finance_settings").select(FIELDS.map(f => f.key).join(", ")).maybeSingle().then(({ data, error }) => {
      if (error) toast.error("Could not load company details: " + error.message);
      if (data) setV(data as unknown as Record<string, string>);
    });
  }, []);
  const save = async () => {
    for (const f of FIELDS) if (f.key !== "lut_arn" && !(v[f.key] || "").trim()) return toast.error(`${f.label} is required`);
    setSaving(true);
    const payload: Record<string, string | null> = {};
    FIELDS.forEach(f => { payload[f.key] = (v[f.key] || "").trim() || null; });
    const { error } = await supabase.from("finance_settings").update({ ...payload, updated_at: new Date().toISOString() } as never).eq("id", true);
    setSaving(false);
    if (error) return toast.error(error.message);
    await prepareLetterhead(true);
    toast.success("Company details saved");
  };
  return (
    <Card>
      <CardHeader><CardTitle>Company Details</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {FIELDS.map(f => (
            <div key={f.key} className={`space-y-1 ${f.multiline ? "col-span-2" : ""}`}>
              <Label>{f.label}</Label>
              {f.multiline
                ? <Textarea rows={2} value={v[f.key] || ""} disabled={!canEdit} onChange={e => setV({ ...v, [f.key]: e.target.value })} />
                : <Input value={v[f.key] || ""} disabled={!canEdit} onChange={e => setV({ ...v, [f.key]: e.target.value })} />}
              {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
            </div>
          ))}
        </div>
        {canEdit && <Button onClick={save} disabled={saving}>Save</Button>}
      </CardContent>
    </Card>
  );
};

const LetterheadSlot = ({ file, label }: { file: string; label: string }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const { data } = await supabase.storage.from(BRANDING_BUCKET).download(file);
    setUrl(prev => { if (prev) URL.revokeObjectURL(prev); return data ? URL.createObjectURL(data) : null; });
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const upload = async (f?: File) => {
    if (!f) return;
    if (f.type !== "image/png") return toast.error("Please upload a PNG image");
    setBusy(true);
    const { error } = await supabase.storage.from(BRANDING_BUCKET).upload(file, f, { upsert: true, contentType: "image/png", cacheControl: "0" });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${label} updated`);
    await prepareLetterhead(true);
    load();
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button size="sm" variant="outline" disabled={busy} asChild>
          <label className="cursor-pointer">
            {url ? "Replace" : "Upload"}
            <input type="file" accept="image/png" className="hidden" onChange={e => upload(e.target.files?.[0])} />
          </label>
        </Button>
      </div>
      <div className="border rounded-md bg-muted/30 min-h-16 flex items-center justify-center overflow-hidden">
        {url ? <img src={url} alt={label} className="w-full h-auto" /> : <span className="text-xs text-muted-foreground p-4">Not uploaded — documents use a plain text {label.toLowerCase()} from the company details.</span>}
      </div>
    </div>
  );
};

export const LetterheadCard = () => (
  <Card>
    <CardHeader><CardTitle>Letterhead</CardTitle></CardHeader>
    <CardContent className="space-y-6">
      <p className="text-sm text-muted-foreground">Full-width A4 images (PNG) used on the PI, invoices, packing list, dispatch note and QC reports.</p>
      <LetterheadSlot file={HEADER_FILE} label="Header" />
      <LetterheadSlot file={FOOTER_FILE} label="Footer" />
    </CardContent>
  </Card>
);
