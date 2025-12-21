import { useState, useEffect } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Calendar as CalendarIcon, Clock, Save, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, getDay } from 'date-fns';

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

interface CalendarException {
  id: string;
  exception_date: string;
  is_working: boolean;
  override_shift_start?: string;
  override_shift_end?: string;
  reason?: string;
  created_at: string;
  created_by?: string;
}

export default function FactoryCalendar() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [daySettings, setDaySettings] = useState<Record<string, DaySettings>>({});
  const [exceptions, setExceptions] = useState<CalendarException[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [exceptionDialog, setExceptionDialog] = useState(false);
  const [exceptionForm, setExceptionForm] = useState({
    is_working: false,
    override_shift_start: '08:30',
    override_shift_end: '20:00',
    reason: ''
  });

  useEffect(() => {
    loadCalendarSettings();
    loadExceptions();
  }, []);

  const loadExceptions = async () => {
    const { data, error } = await supabase
      .from('factory_calendar_exceptions')
      .select('*')
      .order('exception_date', { ascending: true });
    
    if (error) {
      console.error('Error loading exceptions:', error);
    } else {
      setExceptions(data || []);
    }
  };

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
      .from('factory_calendar_settings')
      .insert(defaultSettings);

    if (error) throw error;
  };

  const loadCalendarSettings = async () => {
    try {
      const { data: settings, error } = await supabase
        .from('factory_calendar_settings')
        .select('*')
        .order('day_name');

      if (error) throw error;

      if (!settings || settings.length === 0) {
        await seedDefaultSettings();
        
        const { data: newSettings, error: reloadError } = await supabase
          .from('factory_calendar_settings')
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
        .from('factory_calendar_settings')
        .upsert(updates);

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

  const handleDateClick = (date: Date) => {
    const existing = exceptions.find(e => 
      isSameDay(new Date(e.exception_date), date)
    );
    
    if (existing) {
      setExceptionForm({
        is_working: existing.is_working,
        override_shift_start: existing.override_shift_start || '08:30',
        override_shift_end: existing.override_shift_end || '20:00',
        reason: existing.reason || ''
      });
    } else {
      setExceptionForm({
        is_working: false,
        override_shift_start: '08:30',
        override_shift_end: '20:00',
        reason: ''
      });
    }
    
    setSelectedDate(date);
    setExceptionDialog(true);
  };

  const handleSaveException = async () => {
    if (!selectedDate) return;
    
    const { data: { user } } = await supabase.auth.getUser();
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    
    const existing = exceptions.find(e => e.exception_date === dateStr);
    
    const payload = {
      exception_date: dateStr,
      is_working: exceptionForm.is_working,
      override_shift_start: exceptionForm.is_working ? exceptionForm.override_shift_start : null,
      override_shift_end: exceptionForm.is_working ? exceptionForm.override_shift_end : null,
      reason: exceptionForm.reason,
      created_by: user?.id
    };
    
    let error;
    if (existing) {
      const result = await supabase
        .from('factory_calendar_exceptions')
        .update(payload)
        .eq('id', existing.id);
      error = result.error;
    } else {
      const result = await supabase
        .from('factory_calendar_exceptions')
        .insert([payload]);
      error = result.error;
    }
    
    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to save exception',
        variant: 'destructive',
      });
      console.error(error);
    } else {
      toast({
        title: 'Success',
        description: 'Exception saved successfully',
      });
      setExceptionDialog(false);
      loadExceptions();
    }
  };

  const handleDeleteException = async (id: string) => {
    const { error } = await supabase
      .from('factory_calendar_exceptions')
      .delete()
      .eq('id', id);
    
    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete exception',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Success',
        description: 'Exception deleted',
      });
      loadExceptions();
    }
  };

  const renderCalendarGrid = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    
    const getDateType = (date: Date) => {
      const exception = exceptions.find(e => 
        isSameDay(new Date(e.exception_date), date)
      );
      
      if (exception) {
        return exception.is_working ? 'overtime' : 'holiday';
      }
      
      const dayName = format(date, 'EEEE').toLowerCase();
      const settings = daySettings[dayName];
      return settings?.working ? 'working' : 'non-working';
    };
    
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-7 gap-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="text-center font-semibold p-2 text-sm">
              {day}
            </div>
          ))}
        
          {Array.from({ length: getDay(monthStart) }).map((_, i) => (
            <div key={`empty-${i}`} className="p-2" />
          ))}
        
          {days.map(day => {
            const dateType = getDateType(day);
            const bgColor = 
              dateType === 'holiday' ? 'bg-destructive/20 hover:bg-destructive/30' :
              dateType === 'overtime' ? 'bg-blue-500/20 hover:bg-blue-500/30' :
              dateType === 'working' ? 'bg-success/20 hover:bg-success/30' :
              'bg-muted hover:bg-muted/80';
          
            return (
              <button
                key={day.toISOString()}
                onClick={() => handleDateClick(day)}
                className={`p-3 rounded-md transition-colors ${bgColor} ${
                  !isSameMonth(day, currentMonth) ? 'opacity-50' : ''
                }`}
              >
                <div className="text-sm font-medium">{format(day, 'd')}</div>
              </button>
            );
          })}
        </div>
        
        <div className="flex items-center gap-6 text-sm pt-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-success/20" />
            <span>Normal Working</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-blue-500/20" />
            <span>Overtime Day</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-destructive/20" />
            <span>Holiday</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-muted" />
            <span>Non-Working</span>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto p-6">
          <p className="text-muted-foreground">Loading calendar settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-6">
        <Tabs defaultValue="monthly" className="space-y-6">
          <TabsList>
            <TabsTrigger value="monthly">Monthly View</TabsTrigger>
            <TabsTrigger value="weekly">Weekly Template</TabsTrigger>
            <TabsTrigger value="exceptions">Exception List</TabsTrigger>
          </TabsList>

          <TabsContent value="monthly">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <CalendarIcon className="h-5 w-5" />
                    {format(currentMonth, 'MMMM yyyy')}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date())}>
                      Today
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {renderCalendarGrid()}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="weekly" className="space-y-4">
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
            
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving} size="lg">
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save All Settings'}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="exceptions">
            <Card>
              <CardHeader>
                <CardTitle>Calendar Exceptions</CardTitle>
                <CardDescription>Special holidays and overtime days that override the weekly template</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {exceptions.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No exceptions defined. Click any date in the monthly view to add one.</p>
                  ) : (
                    exceptions.map(exception => (
                      <div key={exception.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex-1">
                          <div className="font-medium">{format(new Date(exception.exception_date), 'PPP')}</div>
                          <div className="text-sm text-muted-foreground">
                            {exception.is_working ? (
                              `Overtime: ${exception.override_shift_start} - ${exception.override_shift_end}`
                            ) : (
                              'Holiday / Non-working'
                            )}
                          </div>
                          {exception.reason && (
                            <div className="text-sm mt-1">{exception.reason}</div>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteException(exception.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={exceptionDialog} onOpenChange={setExceptionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedDate && format(selectedDate, 'PPP')}
            </DialogTitle>
            <DialogDescription>Configure working days, shifts and holidays</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Switch
                checked={exceptionForm.is_working}
                onCheckedChange={(checked) => 
                  setExceptionForm({ ...exceptionForm, is_working: checked })
                }
              />
              <Label>Working Day (Overtime)</Label>
            </div>
            
            {exceptionForm.is_working && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Shift Start</Label>
                  <Input
                    type="time"
                    value={exceptionForm.override_shift_start}
                    onChange={(e) => 
                      setExceptionForm({ ...exceptionForm, override_shift_start: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Shift End</Label>
                  <Input
                    type="time"
                    value={exceptionForm.override_shift_end}
                    onChange={(e) => 
                      setExceptionForm({ ...exceptionForm, override_shift_end: e.target.value })
                    }
                  />
                </div>
              </div>
            )}
            
            <div>
              <Label>Reason</Label>
              <Textarea
                value={exceptionForm.reason}
                onChange={(e) => 
                  setExceptionForm({ ...exceptionForm, reason: e.target.value })
                }
                placeholder="e.g., Public Holiday, Special Production Day"
              />
            </div>
            
            <Button onClick={handleSaveException} className="w-full">
              Save Exception
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
