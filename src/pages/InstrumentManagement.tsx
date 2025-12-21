import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NavigationHeader } from "@/components/NavigationHeader";
import { toast } from "sonner";
import { Plus, Ruler, AlertTriangle, CheckCircle2, Calendar, Edit } from "lucide-react";
import { format, differenceInDays } from "date-fns";

interface Instrument {
  id: string;
  instrument_name: string;
  instrument_type: string;
  serial_number: string;
  location: string | null;
  calibration_interval_days: number;
  last_calibration_date: string;
  next_calibration_due_date: string;
  status: string;
  created_at: string;
}

const InstrumentManagement = () => {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingInstrument, setEditingInstrument] = useState<Instrument | null>(null);
  const [formData, setFormData] = useState({
    instrument_name: '',
    instrument_type: '',
    serial_number: '',
    location: '',
    calibration_interval_days: 365,
    last_calibration_date: format(new Date(), 'yyyy-MM-dd')
  });

  useEffect(() => {
    loadInstruments();
  }, []);

  const loadInstruments = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('measurement_instruments')
        .select('*')
        .order('status', { ascending: false })
        .order('next_calibration_due_date', { ascending: true });

      if (error) throw error;
      setInstruments(data || []);
    } catch (error: any) {
      toast.error('Failed to load instruments: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (editingInstrument) {
        const { error } = await supabase
          .from('measurement_instruments')
          .update({
            instrument_name: formData.instrument_name,
            instrument_type: formData.instrument_type,
            serial_number: formData.serial_number,
            location: formData.location || null,
            calibration_interval_days: formData.calibration_interval_days,
            last_calibration_date: formData.last_calibration_date
          })
          .eq('id', editingInstrument.id);
        
        if (error) throw error;
        toast.success('Instrument updated successfully');
      } else {
        const { error } = await supabase
          .from('measurement_instruments')
          .insert([{
            instrument_name: formData.instrument_name,
            instrument_type: formData.instrument_type,
            serial_number: formData.serial_number,
            location: formData.location || null,
            calibration_interval_days: formData.calibration_interval_days,
            last_calibration_date: formData.last_calibration_date,
            next_calibration_due_date: formData.last_calibration_date, // Trigger will recalculate
            created_by: user?.id
          }]);
        
        if (error) throw error;
        toast.success('Instrument added successfully');
      }

      setDialogOpen(false);
      resetForm();
      loadInstruments();
    } catch (error: any) {
      toast.error('Failed to save instrument: ' + error.message);
    }
  };

  const resetForm = () => {
    setFormData({
      instrument_name: '',
      instrument_type: '',
      serial_number: '',
      location: '',
      calibration_interval_days: 365,
      last_calibration_date: format(new Date(), 'yyyy-MM-dd')
    });
    setEditingInstrument(null);
  };

  const handleEdit = (instrument: Instrument) => {
    setEditingInstrument(instrument);
    setFormData({
      instrument_name: instrument.instrument_name,
      instrument_type: instrument.instrument_type,
      serial_number: instrument.serial_number,
      location: instrument.location || '',
      calibration_interval_days: instrument.calibration_interval_days,
      last_calibration_date: instrument.last_calibration_date
    });
    setDialogOpen(true);
  };

  const getDaysUntilDue = (dueDate: string) => {
    return differenceInDays(new Date(dueDate), new Date());
  };

  const validCount = instruments.filter(i => i.status === 'VALID').length;
  const overdueCount = instruments.filter(i => i.status === 'OVERDUE').length;
  const dueSoonCount = instruments.filter(i => {
    const days = getDaysUntilDue(i.next_calibration_due_date);
    return i.status === 'VALID' && days <= 30 && days >= 0;
  }).length;

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader 
        title="Measurement Instruments" 
        subtitle="Manage calibration and instrument status" 
      />
      
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{instruments.length}</div>
              <div className="text-sm text-muted-foreground">Total Instruments</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-success">{validCount}</div>
              <div className="text-sm text-muted-foreground">Valid</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-warning">{dueSoonCount}</div>
              <div className="text-sm text-muted-foreground">Due Within 30 Days</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-destructive">{overdueCount}</div>
              <div className="text-sm text-muted-foreground">Overdue</div>
            </CardContent>
          </Card>
        </div>

        {/* Instruments List */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Ruler className="h-5 w-5" />
              Instruments
            </CardTitle>
            <Dialog open={dialogOpen} onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Instrument
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingInstrument ? 'Edit Instrument' : 'Add New Instrument'}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Instrument Name *</Label>
                      <Input
                        value={formData.instrument_name}
                        onChange={e => setFormData({...formData, instrument_name: e.target.value})}
                        required
                        placeholder="e.g., Vernier Caliper"
                      />
                    </div>
                    <div>
                      <Label>Type *</Label>
                      <Input
                        value={formData.instrument_type}
                        onChange={e => setFormData({...formData, instrument_type: e.target.value})}
                        required
                        placeholder="e.g., Dimensional"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Serial Number *</Label>
                      <Input
                        value={formData.serial_number}
                        onChange={e => setFormData({...formData, serial_number: e.target.value})}
                        required
                        placeholder="Unique identifier"
                      />
                    </div>
                    <div>
                      <Label>Location</Label>
                      <Input
                        value={formData.location}
                        onChange={e => setFormData({...formData, location: e.target.value})}
                        placeholder="e.g., QC Lab"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Calibration Interval (Days) *</Label>
                      <Input
                        type="number"
                        value={formData.calibration_interval_days}
                        onChange={e => setFormData({...formData, calibration_interval_days: parseInt(e.target.value)})}
                        required
                        min={1}
                      />
                    </div>
                    <div>
                      <Label>Last Calibration Date *</Label>
                      <Input
                        type="date"
                        value={formData.last_calibration_date}
                        onChange={e => setFormData({...formData, last_calibration_date: e.target.value})}
                        required
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full">
                    {editingInstrument ? 'Update Instrument' : 'Add Instrument'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Loading instruments...</p>
            ) : instruments.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No instruments registered yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Serial No.</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Last Calibration</TableHead>
                    <TableHead>Next Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {instruments.map(instrument => {
                    const daysUntilDue = getDaysUntilDue(instrument.next_calibration_due_date);
                    const isDueSoon = instrument.status === 'VALID' && daysUntilDue <= 30 && daysUntilDue >= 0;
                    
                    return (
                      <TableRow key={instrument.id}>
                        <TableCell className="font-medium">{instrument.instrument_name}</TableCell>
                        <TableCell>{instrument.instrument_type}</TableCell>
                        <TableCell className="font-mono text-sm">{instrument.serial_number}</TableCell>
                        <TableCell>{instrument.location || '-'}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            {format(new Date(instrument.last_calibration_date), 'dd MMM yyyy')}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className={`flex items-center gap-1 ${
                            instrument.status === 'OVERDUE' ? 'text-destructive' : 
                            isDueSoon ? 'text-warning' : ''
                          }`}>
                            {format(new Date(instrument.next_calibration_due_date), 'dd MMM yyyy')}
                            {isDueSoon && <span className="text-xs">({daysUntilDue}d)</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          {instrument.status === 'OVERDUE' ? (
                            <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                              <AlertTriangle className="h-3 w-3" />
                              OVERDUE
                            </Badge>
                          ) : isDueSoon ? (
                            <Badge variant="outline" className="border-warning text-warning flex items-center gap-1 w-fit">
                              <AlertTriangle className="h-3 w-3" />
                              Due Soon
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-success text-success flex items-center gap-1 w-fit">
                              <CheckCircle2 className="h-3 w-3" />
                              VALID
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(instrument)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default InstrumentManagement;
