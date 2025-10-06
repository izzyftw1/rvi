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

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

interface DaySettings {
  id: string;
  day_name: string;
  working: boolean;
  day_shift_start: string | null;
  day_shift_end: string | null;
  night_shift_start: string | null;
  night_shift_end: string | null;
  break_1_start: string | null;
  break_1_end: string | null;
  break_2_start: string | null;
  break_2_end: string | null;
  overtime_allowed: boolean;
}

export default function FactoryCalendar() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [daySettings, setDaySettings] = useState<Record<string, DaySettings>>({});

  useEffect(() => {
    loadCalendarSettings();
  }, []);

  const seedDefaultSettings = async () => {
    const defaultSettings = [
      { day_name: 'monday', working: true, day_shift_start: '08:30:00', day_shift_end: '20:00:00', night_shift_start: '20:00:00', night_shift_end: '07:30:00', break_1_start: '12:30:00', break_1_end: '13:00:00', break_2_start: '00:00:00', break_2_end: '00:30:00', overtime_allowed: false },
      { day_name: 'tuesday', working: true, day_shift_start: '08:30:00', day_shift_end: '20:00:00', night_shift_start: '20:00:00', night_shift_end: '07:30:00', break_1_start: '12:30:00', break_1_end: '13:00:00', break_2_start: '00:00:00', break_2_end: '00:30:00', overtime_allowed: false },
      { day_name: 'wednesday', working: true, day_shift_start: '08:30:00', day_shift_end: '20:00:00', night_shift_start: '20:00:00', night_shift_end: '07:30:00', break_1_start: '12:30:00', break_1_end: '13:00:00', break_2_start: '00:00:00', break_2_end: '00:30:00', overtime_allowed: false },
      { day_name: 'thursday', working: true, day_shift_start: '08:30:00', day_shift_end: '20:00:00', night_shift_start: '20:00:00', night_shift_end: '07:30:00', break_1_start: '12:30:00', break_1_end: '13:00:00', break_2_start: '00:00:00', break_2_end: '00:30:00', overtime_allowed: false },
      { day_name: 'friday', working: false, day_shift_start: null, day_shift_end: null, night_shift_start: null, night_shift_end: null, break_1_start: null, break_1_end: null, break_2_start: null, break_2_end: null, overtime_allowed: true },
      { day_name: 'saturday', working: true, day_shift_start: '08:30:00', day_shift_end: '20:00:00', night_shift_start: '20:00:00', night_shift_end: '07:30:00', break_1_start: '12:30:00', break_1_end: '13:00:00', break_2_start: '00:00:00', break_2_end: '00:30:00', overtime_allowed: false },
      { day_name: 'sunday', working: false, day_shift_start: null, day_shift_end: null, night_shift_start: null, night_shift_end: null, break_1_start: null, break_1_end: null, break_2_start: null, break_2_end: null, overtime_allowed: false },
    ];

    const { error } = await supabase
      .from('factory_calendar_settings' as any)
      .insert(defaultSettings as any);

    if (error) throw error;
  };

  const loadCalendarSettings = async () => {
    try {
      const { data: settings, error } = await supabase
        .from('factory_calendar_settings' as any)
        .select('*')
        .order('day_name');

      if (error) throw error;

      // If no settings exist, seed with defaults
      if (!settings || settings.length === 0) {
        await seedDefaultSettings();
        // Reload after seeding
        const { data: newSettings, error: reloadError } = await supabase
          .from('factory_calendar_settings' as any)
          .select('*')
          .order('day_name');
        
        if (reloadError) throw reloadError;
        
        if (newSettings) {
          const settingsMap: Record<string, DaySettings> = {};
          newSettings.forEach((day: any) => {
            settingsMap[day.day_name] = day;
          });
          setDaySettings(settingsMap);
        }
      } else {
        const settingsMap: Record<string, DaySettings> = {};
        settings.forEach((day: any) => {
          settingsMap[day.day_name] = day;
        });
        setDaySettings(settingsMap);
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
      const updates = Object.values(daySettings).map(day => ({
        id: day.id,
        day_name: day.day_name,
        working: day.working,
        day_shift_start: day.day_shift_start,
        day_shift_end: day.day_shift_end,
        night_shift_start: day.night_shift_start,
        night_shift_end: day.night_shift_end,
        break_1_start: day.break_1_start,
        break_1_end: day.break_1_end,
        break_2_start: day.break_2_start,
        break_2_end: day.break_2_end,
        overtime_allowed: day.overtime_allowed,
      }));

      const { error } = await supabase
        .from('factory_calendar_settings' as any)
        .upsert(updates as any);

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

  const toggleDay = (dayName: string) => {
    setDaySettings(prev => ({
      ...prev,
      [dayName]: {
        ...prev[dayName],
        working: !prev[dayName].working,
      },
    }));
  };

  const updateDayField = (dayName: string, field: keyof DaySettings, value: any) => {
    setDaySettings(prev => ({
      ...prev,
      [dayName]: {
        ...prev[dayName],
        [field]: value,
      },
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
        {DAYS.map((dayName) => {
          const day = daySettings[dayName];
          if (!day) return null;

          return (
            <Card key={dayName}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="capitalize">{dayName}</CardTitle>
                  <Switch
                    checked={day.working}
                    onCheckedChange={() => toggleDay(dayName)}
                  />
                </div>
                <CardDescription>
                  {day.working ? 'Working day' : 'Non-working day'}
                </CardDescription>
              </CardHeader>
              {day.working && (
                <CardContent className="space-y-6">
                  {/* Day Shift */}
                  <div className="space-y-3">
                    <Label className="text-base font-semibold flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Day Shift
                    </Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor={`${dayName}-day-start`} className="text-sm">Start Time</Label>
                        <Input
                          id={`${dayName}-day-start`}
                          type="time"
                          value={day.day_shift_start || '08:30'}
                          onChange={(e) => updateDayField(dayName, 'day_shift_start', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`${dayName}-day-end`} className="text-sm">End Time</Label>
                        <Input
                          id={`${dayName}-day-end`}
                          type="time"
                          value={day.day_shift_end || '20:00'}
                          onChange={(e) => updateDayField(dayName, 'day_shift_end', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Break 1 (Day Shift Break) */}
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">Break 1 (Lunch)</Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor={`${dayName}-break1-start`} className="text-sm">Start Time</Label>
                        <Input
                          id={`${dayName}-break1-start`}
                          type="time"
                          value={day.break_1_start || '12:30'}
                          onChange={(e) => updateDayField(dayName, 'break_1_start', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`${dayName}-break1-end`} className="text-sm">End Time</Label>
                        <Input
                          id={`${dayName}-break1-end`}
                          type="time"
                          value={day.break_1_end || '13:00'}
                          onChange={(e) => updateDayField(dayName, 'break_1_end', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Night Shift */}
                  <div className="space-y-3">
                    <Label className="text-base font-semibold flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Night Shift
                    </Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor={`${dayName}-night-start`} className="text-sm">Start Time</Label>
                        <Input
                          id={`${dayName}-night-start`}
                          type="time"
                          value={day.night_shift_start || '20:00'}
                          onChange={(e) => updateDayField(dayName, 'night_shift_start', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`${dayName}-night-end`} className="text-sm">End Time</Label>
                        <Input
                          id={`${dayName}-night-end`}
                          type="time"
                          value={day.night_shift_end || '07:30'}
                          onChange={(e) => updateDayField(dayName, 'night_shift_end', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Break 2 (Night Shift Break) */}
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">Break 2 (Dinner)</Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor={`${dayName}-break2-start`} className="text-sm">Start Time</Label>
                        <Input
                          id={`${dayName}-break2-start`}
                          type="time"
                          value={day.break_2_start || '00:00'}
                          onChange={(e) => updateDayField(dayName, 'break_2_start', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`${dayName}-break2-end`} className="text-sm">End Time</Label>
                        <Input
                          id={`${dayName}-break2-end`}
                          type="time"
                          value={day.break_2_end || '00:30'}
                          onChange={(e) => updateDayField(dayName, 'break_2_end', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Overtime */}
                  <div className="flex items-center justify-between pt-4 border-t">
                    <Label htmlFor={`${dayName}-overtime`} className="text-base">
                      Allow Overtime
                    </Label>
                    <Switch
                      id={`${dayName}-overtime`}
                      checked={day.overtime_allowed}
                      onCheckedChange={(checked) => updateDayField(dayName, 'overtime_allowed', checked)}
                    />
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}

        <div className="flex justify-end sticky bottom-6">
          <Button onClick={handleSave} disabled={saving} size="lg">
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save All Settings'}
          </Button>
        </div>
      </div>
    </>
  );
}
