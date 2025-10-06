import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Download, Edit, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { QRCodeDisplay } from "@/components/QRCodeDisplay";
import { Badge } from "@/components/ui/badge";

interface HistoricalDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: any;
  type: "material_lot" | "carton" | "pallet" | "work_order";
  onEdit?: () => void;
}

export const HistoricalDataDialog = ({ 
  open, 
  onOpenChange, 
  data, 
  type,
  onEdit 
}: HistoricalDataDialogProps) => {
  const { toast } = useToast();

  const handlePrintLabel = () => {
    toast({
      title: "Printing Label",
      description: `Label for ${getEntityId()} sent to printer`,
    });
    window.print();
  };

  const handleDownloadMTC = () => {
    if (data?.mtc_file) {
      toast({
        description: "Downloading MTC file...",
      });
    } else {
      toast({
        variant: "destructive",
        description: "No MTC file available",
      });
    }
  };

  const getEntityId = () => {
    switch (type) {
      case "material_lot": return data?.lot_id;
      case "carton": return data?.carton_id;
      case "pallet": return data?.pallet_id;
      case "work_order": return data?.wo_id;
      default: return "";
    }
  };

  const renderMaterialLotDetails = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Lot ID</p>
          <p className="font-medium">{data.lot_id}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Heat Number</p>
          <p className="font-medium">{data.heat_no}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Alloy</p>
          <p className="font-medium">{data.alloy}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Supplier</p>
          <p className="font-medium">{data.supplier}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Material Size (mm)</p>
          <p className="font-medium">{data.material_size_mm || "N/A"}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Bin Location</p>
          <p className="font-medium">{data.bin_location || "N/A"}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Gross Weight (kg)</p>
          <p className="font-medium">{Number(data.gross_weight).toFixed(3)}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Net Weight (kg)</p>
          <p className="font-medium">{Number(data.net_weight).toFixed(3)}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Status</p>
          <Badge>{data.status}</Badge>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">QC Status</p>
          <Badge variant={data.qc_status === "approved" ? "default" : "secondary"}>
            {data.qc_status || "pending"}
          </Badge>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Received</p>
          <p className="font-medium">{new Date(data.received_date_time).toLocaleString()}</p>
        </div>
      </div>

      <div className="flex justify-center p-4 bg-secondary rounded-lg">
        <QRCodeDisplay value={data.lot_id} title="Material Lot" />
      </div>

      <div className="flex gap-2">
        <Button onClick={handlePrintLabel} className="flex-1">
          <Printer className="h-4 w-4 mr-2" />
          Reprint Label
        </Button>
        {data.mtc_file && (
          <Button onClick={handleDownloadMTC} variant="outline" className="flex-1">
            <Download className="h-4 w-4 mr-2" />
            Download MTC
          </Button>
        )}
        {onEdit && (
          <Button onClick={onEdit} variant="outline" className="flex-1">
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
        )}
      </div>
    </div>
  );

  const renderCartonDetails = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Carton ID</p>
          <p className="font-medium">{data.carton_id}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Quantity (pcs)</p>
          <p className="font-medium">{data.quantity}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Gross Weight (kg)</p>
          <p className="font-medium">{Number(data.gross_weight).toFixed(3)}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Net Weight (kg)</p>
          <p className="font-medium">{Number(data.net_weight).toFixed(3)}</p>
        </div>
        <div className="col-span-2">
          <p className="text-sm text-muted-foreground">Heat Numbers</p>
          <p className="font-medium">{data.heat_nos?.join(", ") || "N/A"}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Built At</p>
          <p className="font-medium">{new Date(data.built_at).toLocaleString()}</p>
        </div>
      </div>

      <div className="flex justify-center p-4 bg-secondary rounded-lg">
        <QRCodeDisplay value={data.carton_id} title="Carton" />
      </div>

      <Button onClick={handlePrintLabel} className="w-full">
        <Printer className="h-4 w-4 mr-2" />
        Reprint Label
      </Button>
    </div>
  );

  const renderPalletDetails = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Pallet ID</p>
          <p className="font-medium">{data.pallet_id}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Built At</p>
          <p className="font-medium">{new Date(data.built_at).toLocaleString()}</p>
        </div>
      </div>

      <div className="flex justify-center p-4 bg-secondary rounded-lg">
        <QRCodeDisplay value={data.pallet_id} title="Pallet" />
      </div>

      <Button onClick={handlePrintLabel} className="w-full">
        <Printer className="h-4 w-4 mr-2" />
        Reprint Label
      </Button>
    </div>
  );

  const renderWorkOrderDetails = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-muted-foreground">WO ID</p>
          <p className="font-medium">{data.wo_id}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Item Code</p>
          <p className="font-medium">{data.item_code}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Customer</p>
          <p className="font-medium">{data.customer}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Quantity</p>
          <p className="font-medium">{data.quantity} pcs</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Status</p>
          <Badge>{data.status}</Badge>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Current Stage</p>
          <Badge variant="outline">{data.current_stage}</Badge>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Due Date</p>
          <p className="font-medium">{new Date(data.due_date).toLocaleDateString()}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Priority</p>
          <Badge variant={data.priority <= 2 ? "destructive" : "secondary"}>
            P{data.priority}
          </Badge>
        </div>
      </div>

      <div className="flex justify-center p-4 bg-secondary rounded-lg">
        <QRCodeDisplay value={data.wo_id} title="Work Order" />
      </div>

      <Button onClick={handlePrintLabel} className="w-full">
        <Printer className="h-4 w-4 mr-2" />
        Print Label
      </Button>
    </div>
  );

  const renderDetails = () => {
    switch (type) {
      case "material_lot": return renderMaterialLotDetails();
      case "carton": return renderCartonDetails();
      case "pallet": return renderPalletDetails();
      case "work_order": return renderWorkOrderDetails();
      default: return <p>Unknown entity type</p>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            {type.replace("_", " ").toUpperCase()} Details - {getEntityId()}
          </DialogTitle>
        </DialogHeader>
        {renderDetails()}
      </DialogContent>
    </Dialog>
  );
};
