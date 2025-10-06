import { useState, useEffect } from 'react';
import { NavigationHeader } from '@/components/NavigationHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Calendar, Clock, Save } from 'lucide-react';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function FactoryCalendar() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workingDays, setWorkingDays] = useState<Record<number, boolean>>({
    0: false, // Sunday
    1: true,  // Monday
    2: true,  // Tuesday
    3: true,  // Wednesday
    4: true,  // Thursday
    5: false, // Friday
    6: true,  // Saturday
  });
  const [dayShiftEnabled, setDayShiftEnabled] = useState(true);
  const [nightShiftEnabled, setNightShiftEnabled] = useState(false);

  useEffect(() => {
    loadCalendarSettings();
  }, []);

  const loadCalendarSettings = async () => {
    try {
      const { data: settings, error } = await supabase
        .from('default_calendar_settings')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (settings) {
        setWorkingDays({
          0: settings.sunday_working,
          1: settings.monday_working,
          2: settings.tuesday_working,
          3: settings.wednesday_working,
          4: settings.thursday_working,
          5: settings.friday_working,
          6: settings.saturday_working,
        });
        setDayShiftEnabled(settings.day_shift_enabled);
        setNightShiftEnabled(settings.night_shift_enabled);
      }
    } catch (error) {
      console.error('Error loading calendar settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to load calendar settings',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('default_calendar_settings')
        .upsert({
          id: 1,
          sunday_working: workingDays[0],
          monday_working: workingDays[1],
          tuesday_working: workingDays[2],
          wednesday_working: workingDays[3],
          thursday_working: workingDays[4],
          friday_working: workingDays[5],
          saturday_working: workingDays[6],
          day_shift_enabled: dayShiftEnabled,
          night_shift_enabled: nightShiftEnabled,
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Calendar settings saved successfully',
      });
    } catch (error) {
      console.error('Error saving calendar settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save calendar settings',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (dayIndex: number) => {
    setWorkingDays(prev => ({
      ...prev,
      [dayIndex]: !prev[dayIndex],
    }));
  };

  if (loading) {
    return (
      <>
        <NavigationHeader title="Factory Calendar" subtitle="Configure working days and shifts" />
        <div className="container mx-auto p-6">
          <p className="text-muted-foreground">Loading calendar settings...</p>
        </div>
      </>
    );
  }

  return (
    <>
      <NavigationHeader title="Factory Calendar" subtitle="Configure working days and shifts" />
      <div className="container mx-auto p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Working Days
            </CardTitle>
            <CardDescription>
              Select which days of the week the factory operates
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {DAYS.map((day, index) => (
              <div key={day} className="flex items-center justify-between">
                <Label htmlFor={`day-${index}`} className="text-base">
                  {day}
                </Label>
                <Switch
                  id={`day-${index}`}
                  checked={workingDays[index]}
                  onCheckedChange={() => toggleDay(index)}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Shift Configuration
            </CardTitle>
            <CardDescription>
              Enable or disable shifts for production scheduling
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="day-shift" className="text-base">
                    Day Shift
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    08:30-12:30, 13:00-20:00
                  </p>
                </div>
                <Switch
                  id="day-shift"
                  checked={dayShiftEnabled}
                  onCheckedChange={setDayShiftEnabled}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="night-shift" className="text-base">
                    Night Shift
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    20:00-00:00, 00:30-07:30
                  </p>
                </div>
                <Switch
                  id="night-shift"
                  checked={nightShiftEnabled}
                  onCheckedChange={setNightShiftEnabled}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>
    </>
  );
}
