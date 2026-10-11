import { supabase } from "@/integrations/supabase/client";

/** Session-wide caches for rarely-changing lookups (profile names, machines, departments). */
const profileNames = new Map<string, string>();
let machinesPromise: Promise<{ id: string; machine_id: string; name: string }[]> | null = null;
let departmentsPromise: Promise<{ id: string; name: string; type: string }[]> | null = null;

/** Returns id → full_name, fetching only ids not cached yet (one request). */
export const getProfileNames = async (ids: (string | null | undefined)[]): Promise<Record<string, string>> => {
  const wanted = Array.from(new Set(ids.filter((x): x is string => !!x)));
  const missing = wanted.filter(id => !profileNames.has(id));
  if (missing.length > 0) {
    const { data } = await supabase.from("profiles").select("id, full_name").in("id", missing);
    (data || []).forEach(p => profileNames.set(p.id, p.full_name || ""));
    missing.forEach(id => { if (!profileNames.has(id)) profileNames.set(id, ""); });
  }
  const out: Record<string, string> = {};
  wanted.forEach(id => { const n = profileNames.get(id); if (n) out[id] = n; });
  return out;
};

export const getMachines = () => {
  if (!machinesPromise) {
    machinesPromise = Promise.resolve(supabase.from("machines").select("id, machine_id, name")).then(r => {
      if (r.error) { machinesPromise = null; return []; }
      return r.data || [];
    });
  }
  return machinesPromise;
};

export const getDepartments = () => {
  if (!departmentsPromise) {
    departmentsPromise = Promise.resolve(supabase.from("departments").select("id, name, type")).then(r => {
      if (r.error) { departmentsPromise = null; return []; }
      return (r.data || []) as { id: string; name: string; type: string }[];
    });
  }
  return departmentsPromise;
};
