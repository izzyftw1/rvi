import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Ruler, CheckCircle2 } from "lucide-react";

interface Instrument {
  id: string;
  instrument_name: string;
  instrument_type: string;
  serial_number: string;
  status: string;
  next_calibration_due_date: string;
}

interface InstrumentSelectorProps {
  value: string | null;
  onChange: (instrumentId: string | null, isValid: boolean) => void;
  required?: boolean;
  instrumentType?: string;
}

export const InstrumentSelector = ({ 
  value, 
  onChange, 
  required = true,
  instrumentType 
}: InstrumentSelectorProps) => {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInstrument, setSelectedInstrument] = useState<Instrument | null>(null);

  useEffect(() => {
    loadInstruments();
  }, [instrumentType]);

  useEffect(() => {
    if (value && instruments.length > 0) {
      const instrument = instruments.find(i => i.id === value);
      setSelectedInstrument(instrument || null);
    } else {
      setSelectedInstrument(null);
    }
  }, [value, instruments]);

  const loadInstruments = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('measurement_instruments')
        .select('id, instrument_name, instrument_type, serial_number, status, next_calibration_due_date')
        .order('status', { ascending: true })
        .order('instrument_name', { ascending: true });

      if (instrumentType) {
        query = query.eq('instrument_type', instrumentType);
      }

      const { data, error } = await query;
      if (error) throw error;
      setInstruments(data || []);
    } catch (error) {
      console.error('Error loading instruments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (instrumentId: string) => {
    const instrument = instruments.find(i => i.id === instrumentId);
    setSelectedInstrument(instrument || null);
    
    const isValid = instrument ? instrument.status === 'VALID' : false;
    onChange(instrumentId, isValid);
  };

  const isOverdue = selectedInstrument?.status === 'OVERDUE';

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        <Ruler className="h-4 w-4" />
        Measurement Instrument {required && <span className="text-destructive">*</span>}
      </Label>
      
      <Select 
        value={value || ''} 
        onValueChange={handleChange}
        disabled={loading}
      >
        <SelectTrigger className={isOverdue ? 'border-destructive' : ''}>
          <SelectValue placeholder={loading ? 'Loading instruments...' : 'Select instrument'} />
        </SelectTrigger>
        <SelectContent>
          {instruments.map(instrument => (
            <SelectItem key={instrument.id} value={instrument.id}>
              <div className="flex items-center gap-2">
                {instrument.status === 'OVERDUE' ? (
                  <AlertTriangle className="h-3 w-3 text-destructive" />
                ) : (
                  <CheckCircle2 className="h-3 w-3 text-success" />
                )}
                <span>{instrument.instrument_name}</span>
                <span className="text-xs text-muted-foreground">({instrument.serial_number})</span>
                {instrument.status === 'OVERDUE' && (
                  <Badge variant="destructive" className="text-[10px] px-1 py-0">OVERDUE</Badge>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedInstrument && (
        <div className="text-xs text-muted-foreground">
          Type: {selectedInstrument.instrument_type} | S/N: {selectedInstrument.serial_number}
        </div>
      )}

      {isOverdue && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Calibration Overdue!</strong> This instrument's calibration expired on{' '}
            {new Date(selectedInstrument.next_calibration_due_date).toLocaleDateString()}.
            QC record cannot be saved until instrument is recalibrated.
          </AlertDescription>
        </Alert>
      )}

      {instruments.length === 0 && !loading && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            No instruments available. Please add instruments in the Instrument Management page.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};
