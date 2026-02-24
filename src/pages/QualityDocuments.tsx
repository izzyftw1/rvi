import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  FileText,
  Search,
  Download,
  Eye,
  ClipboardCheck,
  Shield,
  FileCheck,
  AlertTriangle,
  ExternalLink
} from "lucide-react";
import { useNavigate } from "react-router-dom";

interface QCFinalReport {
  id: string;
  work_order_id: string;
  file_url: string;
  file_path: string;
  version_number: number;
  generated_at: string;
  remarks: string | null;
  work_orders?: {
    wo_number: string;
    customer: string;
    item_code: string;
  };
}

interface NCRDocument {
  id: string;
  ncr_number: string;
  status: string;
  ncr_type: string;
  issue_description: string;
  created_at: string;
  closed_at: string | null;
  work_order_id: string | null;
  work_orders?: {
    wo_number: string;
  } | null;
}

export default function QualityDocuments() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [finalReports, setFinalReports] = useState<QCFinalReport[]>([]);
  const [ncrDocuments, setNcrDocuments] = useState<NCRDocument[]>([]);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      // Load Final QC Reports
      const { data: reports, error: reportsError } = await supabase
        .from("qc_final_reports")
        .select("id, work_order_id, file_url, file_path, version_number, generated_at, remarks")
        .order("generated_at", { ascending: false })
        .limit(100);

      if (reportsError) throw reportsError;

      // Get work order details for reports
      const woIds = [...new Set((reports || []).map(r => r.work_order_id))];
      let woMap: Record<string, any> = {};
      if (woIds.length > 0) {
        const { data: workOrders } = await supabase
          .from("work_orders")
          .select("id, wo_number, customer, item_code")
          .in("id", woIds);
        (workOrders || []).forEach(wo => {
          woMap[wo.id] = wo;
        });
      }

      const enrichedReports = (reports || []).map(r => ({
        ...r,
        work_orders: woMap[r.work_order_id] || null
      }));

      setFinalReports(enrichedReports);

      // Load NCR Documents
      const { data: ncrs, error: ncrsError } = await supabase
        .from("ncrs")
        .select("id, ncr_number, status, ncr_type, issue_description, created_at, closed_at, work_order_id")
        .order("created_at", { ascending: false })
        .limit(100);

      if (ncrsError) throw ncrsError;

      // Get work order details for NCRs
      const ncrWoIds = [...new Set((ncrs || []).map(n => n.work_order_id).filter(Boolean))];
      let ncrWoMap: Record<string, any> = {};
      if (ncrWoIds.length > 0) {
        const { data: ncrWorkOrders } = await supabase
          .from("work_orders")
          .select("id, wo_number")
          .in("id", ncrWoIds);
        (ncrWorkOrders || []).forEach(wo => {
          ncrWoMap[wo.id] = wo;
        });
      }

      const enrichedNCRs = (ncrs || []).map(n => ({
        ...n,
        work_orders: n.work_order_id ? ncrWoMap[n.work_order_id] || null : null
      }));

      setNcrDocuments(enrichedNCRs);

    } catch (error: any) {
      console.error("Error loading documents:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load quality documents"
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return "-";
    try {
      return format(new Date(dateStr), "dd MMM yyyy HH:mm");
    } catch {
      return dateStr;
    }
  };

  const filteredReports = finalReports.filter(r => 
    r.work_orders?.wo_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.work_orders?.customer?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.work_orders?.item_code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredNCRs = ncrDocuments.filter(n =>
    n.ncr_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    n.issue_description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    n.work_orders?.wo_number?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Quality Documents</h1>
            <p className="text-muted-foreground">
              Access and manage all quality-related documentation
            </p>
          </div>
          <FileText className="h-10 w-10 text-primary" />
        </div>

        {/* Search */}
        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by Work Order, Customer, Item Code, or NCR ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Document Tabs */}
        <Tabs defaultValue="final-qc" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="final-qc" className="gap-2">
              <FileCheck className="h-4 w-4" />
              Final QC Reports ({filteredReports.length})
            </TabsTrigger>
            <TabsTrigger value="ncr" className="gap-2">
              <AlertTriangle className="h-4 w-4" />
              NCR Documents ({filteredNCRs.length})
            </TabsTrigger>
            <TabsTrigger value="certificates" className="gap-2">
              <Shield className="h-4 w-4" />
              Certificates
            </TabsTrigger>
          </TabsList>

          {/* Final QC Reports Tab */}
          <TabsContent value="final-qc">
            <Card>
              <CardHeader>
                <CardTitle>Final QC Reports</CardTitle>
                <CardDescription>
                  Generated quality reports for released work orders
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : filteredReports.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No Final QC reports found
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Work Order</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Item Code</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>Generated</TableHead>
                        <TableHead>Remarks</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredReports.map((report) => (
                        <TableRow key={report.id}>
                          <TableCell className="font-medium">
                            {report.work_orders?.wo_number || "-"}
                          </TableCell>
                          <TableCell>{report.work_orders?.customer || "-"}</TableCell>
                          <TableCell>{report.work_orders?.item_code || "-"}</TableCell>
                          <TableCell>
                            <Badge variant="outline">v{report.version_number}</Badge>
                          </TableCell>
                          <TableCell>{formatDateTime(report.generated_at)}</TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {report.remarks || "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {report.file_url && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => window.open(report.file_url, "_blank")}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => navigate(`/final-qc/${report.work_order_id}`)}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* NCR Documents Tab */}
          <TabsContent value="ncr">
            <Card>
              <CardHeader>
                <CardTitle>Non-Conformance Reports</CardTitle>
                <CardDescription>
                  All NCR documentation with status and actions
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : filteredNCRs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No NCR documents found
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>NCR Number</TableHead>
                        <TableHead>Work Order</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Closed</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredNCRs.map((ncr) => (
                        <TableRow key={ncr.id}>
                          <TableCell className="font-medium">{ncr.ncr_number}</TableCell>
                          <TableCell>{ncr.work_orders?.wo_number || "-"}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {ncr.ncr_type || "-"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={
                              ncr.status === "CLOSED" ? "default" :
                              ncr.status === "OPEN" ? "destructive" : "secondary"
                            }>
                              {ncr.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {ncr.issue_description}
                          </TableCell>
                          <TableCell>{formatDateTime(ncr.created_at)}</TableCell>
                          <TableCell>{formatDateTime(ncr.closed_at)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/ncr/${ncr.id}`)}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Certificates Tab */}
          <TabsContent value="certificates">
            <Card>
              <CardHeader>
                <CardTitle>Quality Certificates</CardTitle>
                <CardDescription>
                  Material test certificates and compliance documents
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12">
                  <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                  <p className="text-lg font-medium mb-2">Certificate Management</p>
                  <p className="text-sm text-muted-foreground mb-1">
                    <span className="font-medium">What goes here:</span> Material Test Certificates (MTCs), compliance documents, and calibration certificates.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium">How to populate:</span> Upload certificates when receiving materials via GRN, or attach to work orders.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
