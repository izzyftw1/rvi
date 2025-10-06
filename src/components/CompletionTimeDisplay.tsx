import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from './ui/badge';
import { Calendar, Clock } from 'lucide-react';
import { format } from 'date-fns';

interface CompletionTimeDisplayProps {
  startTime: string;
  hoursNeeded: number;
}

export const CompletionTimeDisplay = ({ startTime, hoursNeeded }: CompletionTimeDisplayProps) => {
  const [endTime, setEndTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const calculateEndTime = async () => {
      try {
        const { data, error } = await supabase.rpc('calculate_end_time' as any, {
          _start_time: startTime,
          _hours_needed: hoursNeeded
        });

        if (error) throw error;
        setEndTime(data as string);
      } catch (error) {
        console.error('Error calculating end time:', error);
      } finally {
        setLoading(false);
      }
    };

    calculateEndTime();
  }, [startTime, hoursNeeded]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="h-4 w-4" />
        <span>Calculating completion time...</span>
      </div>
    );
  }

  if (!endTime) {
    return (
      <Badge variant="outline" className="gap-2">
        <Clock className="h-3 w-3" />
        Unable to calculate
      </Badge>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant="secondary" className="gap-2">
        <Calendar className="h-3 w-3" />
        {format(new Date(endTime), 'PPp')}
      </Badge>
      <span className="text-xs text-muted-foreground">
        ({hoursNeeded.toFixed(1)} working hours)
      </span>
    </div>
  );
};
