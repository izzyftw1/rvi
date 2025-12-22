import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, Plus, Search, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

const formSchema = z.object({
  log_date: z.date(),
  plant: z.enum(["Main", "Pragati"]),
  shift: z.enum(["Day", "Night"]),
  machine_id: z.string().min(1, "Machine is required"),
  wo_id: z.string().optional(),
  setup_number: z.string().min(1, "Setup number is required"),
  operator_id: z.string().optional(),
  programmer_id: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface Machine {
  id: string;
  name: string;
  machine_id: string;
}

interface WorkOrder {
  id: string;
  display_id: string;
  customer: string | null;
  item_code: string | null;
  revision: string | null;
  material_size_mm: string | null;
  quantity: number | null;
  cycle_time_seconds: number | null;
}

interface Person {
  id: string;
  full_name: string;
  role: string;
}

interface ProductionLog {
  id: string;
  log_date: string;
  plant: string;
  shift: string;
  setup_number: string;
  party_code: string | null;
  product_description: string | null;
  ordered_quantity: number | null;
  machines: { name: string; machine_id: string } | null;
  work_orders: { display_id: string } | null;
  operator: { full_name: string } | null;
  programmer: { full_name: string } | null;
}

export default function DailyProductionLog() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [logs, setLogs] = useState<ProductionLog[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [operators, setOperators] = useState<Person[]>([]);
  const [programmers, setProgrammers] = useState<Person[]>([]);
  const [selectedWO, setSelectedWO] = useState<WorkOrder | null>(null);
  const [filterDate, setFilterDate] = useState<Date>(new Date());
  const [searchTerm, setSearchTerm] = useState("");

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      log_date: new Date(),
      plant: "Main",
      shift: "Day",
      machine_id: "",
      wo_id: "",
      setup_number: "",
      operator_id: "",
      programmer_id: "",
    },
  });

  useEffect(() => {
    loadData();
  }, [filterDate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const dateStr = format(filterDate, "yyyy-MM-dd");
      
      // Load logs for selected date
      const { data: logsData, error: logsError } = await supabase
        .from("daily_production_logs")
        .select(`
          id,
          log_date,
          plant,
          shift,
          setup_number,
          party_code,
          product_description,
          ordered_quantity,
          machines:machine_id(name, machine_id),
          work_orders:wo_id(display_id),
          operator:operator_id(full_name),
          programmer:programmer_id(full_name)
        `)
        .eq("log_date", dateStr)
        .order("created_at", { ascending: false });

      if (logsError) throw logsError;
      setLogs((logsData as unknown as ProductionLog[]) || []);

      // Load machines
      const { data: machinesData } = await supabase
        .from("machines")
        .select("id, name, machine_id")
        .order("machine_id");
      setMachines(machinesData || []);

      // Load active work orders
      const { data: woData } = await supabase
        .from("work_orders")
        .select("id, display_id, customer, item_code, revision, material_size_mm, quantity, cycle_time_seconds")
        .in("status", ["pending", "in_progress", "qc", "packing"])
        .order("display_id", { ascending: false })
        .limit(100);
      setWorkOrders(woData || []);

      // Load operators
      const { data: operatorsData } = await supabase
        .from("people")
        .select("id, full_name, role")
        .eq("role", "operator")
        .eq("is_active", true)
        .order("full_name");
      setOperators(operatorsData || []);

      // Load programmers
      const { data: programmersData } = await supabase
        .from("people")
        .select("id, full_name, role")
        .eq("role", "programmer")
        .eq("is_active", true)
        .order("full_name");
      setProgrammers(programmersData || []);
    } catch (error: any) {
      console.error("Error loading data:", error);
      toast({
        title: "Error",
        description: "Failed to load data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleWOChange = (woId: string) => {
    const wo = workOrders.find((w) => w.id === woId);
    setSelectedWO(wo || null);
    form.setValue("wo_id", woId);
  };

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      
      const insertData: any = {
        log_date: format(data.log_date, "yyyy-MM-dd"),
        plant: data.plant,
        shift: data.shift,
        machine_id: data.machine_id,
        setup_number: data.setup_number,
        created_by: userData.user?.id,
      };

      // Add optional fields
      if (data.wo_id) {
        insertData.wo_id = data.wo_id;
      }
      if (data.operator_id) {
        insertData.operator_id = data.operator_id;
      }
      if (data.programmer_id) {
        insertData.programmer_id = data.programmer_id;
      }

      // Auto-populate from WO if selected
      if (selectedWO) {
        insertData.party_code = selectedWO.customer;
        insertData.product_description = selectedWO.item_code;
        insertData.drawing_number = selectedWO.revision;
        insertData.raw_material_grade = selectedWO.material_size_mm;
        insertData.ordered_quantity = selectedWO.quantity;
        insertData.cycle_time_seconds = selectedWO.cycle_time_seconds;
      }

      const { error } = await supabase
        .from("daily_production_logs")
        .insert(insertData);

      if (error) {
        if (error.code === "23505") {
          toast({
            title: "Duplicate Entry",
            description: "A log entry already exists for this machine, shift, and setup on this date.",
            variant: "destructive",
          });
        } else {
          throw error;
        }
        return;
      }

      toast({
        title: "Success",
        description: "Production log entry created",
      });

      setDialogOpen(false);
      form.reset();
      setSelectedWO(null);
      loadData();
    } catch (error: any) {
      console.error("Error creating log:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create log entry",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      log.machines?.name?.toLowerCase().includes(search) ||
      log.machines?.machine_id?.toLowerCase().includes(search) ||
      log.work_orders?.display_id?.toLowerCase().includes(search) ||
      log.party_code?.toLowerCase().includes(search) ||
      log.product_description?.toLowerCase().includes(search) ||
      log.setup_number?.toLowerCase().includes(search)
    );
  });

  return (
    <div className="container mx-auto p-4 space-y-6">
      <PageHeader
        title="Daily Production Log"
        description="Record daily machine setups, shifts, and production assignments"
      />

      {/* Filters and Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              {/* Date Picker */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[200px] justify-start text-left font-normal",
                      !filterDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filterDate ? format(filterDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filterDate}
                    onSelect={(date) => date && setFilterDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              {/* Search */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search logs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Add New Button */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Log Entry
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>New Daily Production Log</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Date */}
                      <FormField
                        control={form.control}
                        name="log_date"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>Date</FormLabel>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    className={cn(
                                      "w-full pl-3 text-left font-normal",
                                      !field.value && "text-muted-foreground"
                                    )}
                                  >
                                    {field.value ? format(field.value, "PPP") : "Pick a date"}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={field.value}
                                  onSelect={field.onChange}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Plant */}
                      <FormField
                        control={form.control}
                        name="plant"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Plant</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select plant" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="Main">Main</SelectItem>
                                <SelectItem value="Pragati">Pragati</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Shift */}
                      <FormField
                        control={form.control}
                        name="shift"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Shift</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select shift" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="Day">Day</SelectItem>
                                <SelectItem value="Night">Night</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Machine */}
                      <FormField
                        control={form.control}
                        name="machine_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Machine</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select machine" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {machines.map((machine) => (
                                  <SelectItem key={machine.id} value={machine.id}>
                                    {machine.machine_id} - {machine.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Setup Number */}
                      <FormField
                        control={form.control}
                        name="setup_number"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Setup Number</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., S1, S2" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Work Order */}
                      <FormField
                        control={form.control}
                        name="wo_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Work Order (Optional)</FormLabel>
                            <Select onValueChange={handleWOChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select work order" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="">None</SelectItem>
                                {workOrders.map((wo) => (
                                  <SelectItem key={wo.id} value={wo.id}>
                                    {wo.display_id} - {wo.item_code}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Operator */}
                      <FormField
                        control={form.control}
                        name="operator_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Operator</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select operator" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="">None</SelectItem>
                                {operators.map((op) => (
                                  <SelectItem key={op.id} value={op.id}>
                                    {op.full_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Programmer */}
                      <FormField
                        control={form.control}
                        name="programmer_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Setter / Programmer</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select programmer" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="">None</SelectItem>
                                {programmers.map((prog) => (
                                  <SelectItem key={prog.id} value={prog.id}>
                                    {prog.full_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Auto-populated WO Details */}
                    {selectedWO && (
                      <Card className="bg-muted/50">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Work Order Details (Auto-populated)</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                          <div>
                            <span className="text-muted-foreground">Party Code:</span>
                            <p className="font-medium">{selectedWO.customer || "-"}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Product:</span>
                            <p className="font-medium">{selectedWO.item_code || "-"}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Drawing No:</span>
                            <p className="font-medium">{selectedWO.revision || "-"}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Material Grade:</span>
                            <p className="font-medium">{selectedWO.material_size_mm || "-"}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Ordered Qty:</span>
                            <p className="font-medium">{selectedWO.quantity?.toLocaleString() || "-"}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Cycle Time:</span>
                            <p className="font-medium">{selectedWO.cycle_time_seconds ? `${selectedWO.cycle_time_seconds}s` : "-"}</p>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    <div className="flex justify-end gap-2 pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setDialogOpen(false);
                          form.reset();
                          setSelectedWO(null);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={submitting}>
                        {submitting ? "Creating..." : "Create Log Entry"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Production Logs for {format(filterDate, "PPP")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No production logs found for this date.</p>
              <p className="text-sm">Click "New Log Entry" to create one.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plant</TableHead>
                    <TableHead>Shift</TableHead>
                    <TableHead>Machine</TableHead>
                    <TableHead>Setup</TableHead>
                    <TableHead>Work Order</TableHead>
                    <TableHead>Party</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Operator</TableHead>
                    <TableHead>Programmer</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>{log.plant}</TableCell>
                      <TableCell>{log.shift}</TableCell>
                      <TableCell>
                        <span className="font-mono text-xs">
                          {log.machines?.machine_id}
                        </span>
                        <br />
                        <span className="text-muted-foreground text-xs">
                          {log.machines?.name}
                        </span>
                      </TableCell>
                      <TableCell>{log.setup_number}</TableCell>
                      <TableCell>
                        {log.work_orders?.display_id || "-"}
                      </TableCell>
                      <TableCell>{log.party_code || "-"}</TableCell>
                      <TableCell>{log.product_description || "-"}</TableCell>
                      <TableCell>{log.ordered_quantity?.toLocaleString() || "-"}</TableCell>
                      <TableCell>{log.operator?.full_name || "-"}</TableCell>
                      <TableCell>{log.programmer?.full_name || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}