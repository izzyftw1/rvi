
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Home, Lock, Unlock, Plus, AlertCircle, Calendar, Shield } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { useUserRole } from "@/hooks/useUserRole";

interface PeriodLock {
  id: string;
  period_type: string;
  period_start: string;
  period_end: string;
  locked: boolean;
  locked_at: string | null;
  locked_by: string | null;
}

export default function FinanceSettings() {
  const { hasAnyRole } = useUserRole();
  const canManagePeriods = hasAnyRole(['admin', 'super_admin', 'finance_admin']);
  
  const [periodLocks, setPeriodLocks] = useState<PeriodLock[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLockDialog, setShowLockDialog] = useState(false);
  const [lockMonth, setLockMonth] = useState(format(subMonths(new Date(), 1), 'yyyy-MM'));

  useEffect(() => {
    loadPeriodLocks();
  }, []);

  const loadPeriodLocks = async () => {
    try {
      const { data } = await supabase
        .from('finance_period_locks')
        .select('*')
        .order('period_start', { ascending: false });
      setPeriodLocks(data || []);
    } catch (error) {
      console.error("Error loading period locks:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLockPeriod = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const monthDate = new Date(lockMonth + '-01');
      const periodStart = format(startOfMonth(monthDate), 'yyyy-MM-dd');
      const periodEnd = format(endOfMonth(monthDate), 'yyyy-MM-dd');

      const { error } = await supabase
        .from('finance_period_locks')
        .upsert({
          period_type: 'month',
          period_start: periodStart,
          period_end: periodEnd,
          locked: true,
          locked_at: new Date().toISOString(),
          locked_by: user?.id,
        }, { onConflict: 'period_type,period_start' });

      if (error) throw error;

      toast.success(`Period ${format(monthDate, 'MMM yyyy')} locked successfully`);
      setShowLockDialog(false);
      loadPeriodLocks();
    } catch (error: any) {
      toast.error(error.message || "Failed to lock period");
    }
  };

  const handleUnlockPeriod = async (period: PeriodLock) => {
    try {
      const { error } = await supabase
        .from('finance_period_locks')
        .update({ locked: false, unlock_reason: 'Manually unlocked by admin' })
        .eq('id', period.id);

      if (error) throw error;
      toast.success(`Period unlocked`);
      loadPeriodLocks();
    } catch (error: any) {
      toast.error(error.message || "Failed to unlock period");
    }
  };

  // Generate last 12 months for selection
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const date = subMonths(new Date(), i);
    return { value: format(date, 'yyyy-MM'), label: format(date, 'MMM yyyy') };
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild><Link to="/"><Home className="h-4 w-4" /></Link></BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild><Link to="/finance/dashboard">Finance</Link></BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>Settings</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        <Tabs defaultValue="periods" className="space-y-4">
          <TabsList>
            <TabsTrigger value="periods">Period Controls</TabsTrigger>
            <TabsTrigger value="tax">Tax Profiles</TabsTrigger>
            <TabsTrigger value="numbering">Numbering</TabsTrigger>
          </TabsList>

          {/* FIX #62/#65/#93/#94: Period locking - functional implementation */}
          <TabsContent value="periods">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      Financial Period Controls
                    </CardTitle>
                    <CardDescription>
                      Lock periods to prevent backdated entries. Once locked, no invoices, receipts, or payments can be created or modified for dates within the locked period.
                    </CardDescription>
                  </div>
                  {canManagePeriods && (
                    <Button onClick={() => setShowLockDialog(true)}>
                      <Plus className="h-4 w-4 mr-2" />Lock Period
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : periodLocks.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>No period locks configured</p>
                    <p className="text-xs mt-1">Lock completed periods to prevent accidental backdated entries</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Period</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Locked At</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {periodLocks.map(period => (
                        <TableRow key={period.id}>
                          <TableCell className="font-medium">
                            {format(new Date(period.period_start), 'MMM yyyy')}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">{period.period_type}</Badge>
                          </TableCell>
                          <TableCell>
                            {period.locked ? (
                              <Badge className="bg-red-100 text-red-700 border-red-200">
                                <Lock className="h-3 w-3 mr-1" />Locked
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-green-600 border-green-200">
                                <Unlock className="h-3 w-3 mr-1" />Open
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {period.locked_at ? format(new Date(period.locked_at), 'dd MMM yyyy HH:mm') : '—'}
                          </TableCell>
                          <TableCell>
                            {canManagePeriods && period.locked && (
                              <Button variant="ghost" size="sm" onClick={() => handleUnlockPeriod(period)}>
                                <Unlock className="h-4 w-4 mr-1" />Unlock
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tax">
            <Card>
              <CardHeader><CardTitle>Tax Configuration</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>IGST Rate (Inter-State)</Label>
                    <Input type="number" value="18" readOnly className="bg-muted" />
                    <p className="text-xs text-muted-foreground">Applied for inter-state domestic sales</p>
                  </div>
                  <div className="space-y-2">
                    <Label>CGST + SGST (Intra-State)</Label>
                    <Input type="number" value="9 + 9" readOnly className="bg-muted" />
                    <p className="text-xs text-muted-foreground">Applied when customer state = company state (Maharashtra)</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Export Tax Rate</Label>
                    <Input type="number" value="0" readOnly className="bg-muted" />
                    <p className="text-xs text-muted-foreground">Auto-applied when customer is_export_customer = true</p>
                  </div>
                </div>
                <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground">
                  <AlertCircle className="h-4 w-4 inline mr-1" />
                  GST split (CGST/SGST vs IGST) is auto-determined by comparing customer state with company state (Maharashtra). Export invoices are zero-rated.
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="numbering">
            <Card>
              <CardHeader><CardTitle>Invoice Numbering</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Prefix</Label>
                    <Input value="INV-" readOnly className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Format</Label>
                    <Input value="INV-NNN" readOnly className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Auto-increment</Label>
                    <Input value="Yes" readOnly className="bg-muted" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Invoice numbers are auto-generated and guaranteed unique (DB constraint enforced).
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Lock Period Dialog */}
        <Dialog open={showLockDialog} onOpenChange={setShowLockDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Lock Financial Period</DialogTitle>
              <DialogDescription>
                This will prevent any new invoices, receipts, or payments from being created with dates in this period. Existing records in this period will also be unmodifiable.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Select Period to Lock</Label>
                <Select value={lockMonth} onValueChange={setLockMonth}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {monthOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-700 dark:text-amber-300">
                <AlertCircle className="h-4 w-4 inline mr-1" />
                This action can be reversed by unlocking the period. Only admins can lock/unlock periods.
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowLockDialog(false)}>Cancel</Button>
              <Button onClick={handleLockPeriod} variant="destructive">
                <Lock className="h-4 w-4 mr-2" />Lock Period
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
