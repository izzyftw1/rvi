import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { FileDown, Ship, Plane, Truck } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface ExportDocumentFields {
  portOfLoading: string;
  portOfDischarge: string;
  vesselFlightNo: string;
  termsOfPayment: string;
  blNumber: string;
  blDate: string;
  numberOfPackages: number;
  kindOfPackages: string;
  preCarriageBy: string;
  placeOfReceipt: string;
}

interface ExportDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentType: 'invoice' | 'packing-list';
  existingData?: Partial<ExportDocumentFields>;
  onConfirm: (fields: ExportDocumentFields) => void;
}

const COMMON_PORTS = [
  'AHMEDABAD AIR PORT',
  'MUMBAI AIR PORT',
  'DELHI AIR PORT',
  'MUNDRA SEA PORT',
  'NHAVA SHEVA SEA PORT',
  'CHENNAI SEA PORT',
];

const COMMON_PAYMENT_TERMS = [
  '100% ADVANCE',
  '100% BALANCE AGAINST BL COPY',
  '50% ADVANCE, 50% AGAINST BL',
  'NET 30 DAYS',
  'NET 60 DAYS',
  'L/C AT SIGHT',
];

const PACKAGE_TYPES = [
  'BOXES',
  'CARTONS',
  'PALLETS',
  'DRUMS',
  'BAGS',
];

export function ExportDocumentDialog({
  open,
  onOpenChange,
  documentType,
  existingData,
  onConfirm,
}: ExportDocumentDialogProps) {
  const [fields, setFields] = useState<ExportDocumentFields>({
    portOfLoading: existingData?.portOfLoading || '',
    portOfDischarge: existingData?.portOfDischarge || '',
    vesselFlightNo: existingData?.vesselFlightNo || 'BY AIR',
    termsOfPayment: existingData?.termsOfPayment || '100% BALANCE AGAINST BL COPY',
    blNumber: existingData?.blNumber || '',
    blDate: existingData?.blDate || '',
    numberOfPackages: existingData?.numberOfPackages || 0,
    kindOfPackages: existingData?.kindOfPackages || 'BOXES',
    preCarriageBy: existingData?.preCarriageBy || 'N.A.',
    placeOfReceipt: existingData?.placeOfReceipt || 'N.A.',
  });

  const handleChange = (field: keyof ExportDocumentFields, value: string | number) => {
    setFields(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = () => {
    onConfirm(fields);
    onOpenChange(false);
  };

  const title = documentType === 'invoice' ? 'Commercial Invoice Details' : 'Packing List Details';
  const description = 'Enter shipping and transport details for this export document. Fields marked with * are required.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* Transport Mode */}
          <div className="space-y-3">
            <h4 className="font-medium text-sm flex items-center gap-2">
              <Ship className="h-4 w-4" />
              Transport Details
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="portOfLoading">Port of Loading *</Label>
                <Select 
                  value={fields.portOfLoading} 
                  onValueChange={(v) => handleChange('portOfLoading', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select port" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_PORTS.map(port => (
                      <SelectItem key={port} value={port}>{port}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="vesselFlightNo">Vessel / Flight No. *</Label>
                <Input
                  id="vesselFlightNo"
                  value={fields.vesselFlightNo}
                  onChange={(e) => handleChange('vesselFlightNo', e.target.value)}
                  placeholder="BY AIR / Flight No."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="portOfDischarge">Port of Discharge *</Label>
                <Input
                  id="portOfDischarge"
                  value={fields.portOfDischarge}
                  onChange={(e) => handleChange('portOfDischarge', e.target.value)}
                  placeholder="e.g., JFK AIRPORT, LONG BEACH"
                />
              </div>
              {documentType === 'invoice' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="preCarriageBy">Pre-Carriage By</Label>
                    <Input
                      id="preCarriageBy"
                      value={fields.preCarriageBy}
                      onChange={(e) => handleChange('preCarriageBy', e.target.value)}
                      placeholder="N.A."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="placeOfReceipt">Place of Receipt</Label>
                    <Input
                      id="placeOfReceipt"
                      value={fields.placeOfReceipt}
                      onChange={(e) => handleChange('placeOfReceipt', e.target.value)}
                      placeholder="N.A."
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          <Separator />

          {/* Payment & BL */}
          <div className="space-y-3">
            <h4 className="font-medium text-sm">Payment & BL Reference</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="termsOfPayment">Terms of Payment *</Label>
                <Select 
                  value={fields.termsOfPayment} 
                  onValueChange={(v) => handleChange('termsOfPayment', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select terms" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_PAYMENT_TERMS.map(term => (
                      <SelectItem key={term} value={term}>{term}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="blNumber">BL Number (optional)</Label>
                <Input
                  id="blNumber"
                  value={fields.blNumber}
                  onChange={(e) => handleChange('blNumber', e.target.value)}
                  placeholder="Leave blank if not available"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="blDate">BL Date (optional)</Label>
                <Input
                  id="blDate"
                  type="date"
                  value={fields.blDate}
                  onChange={(e) => handleChange('blDate', e.target.value)}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Packing Details */}
          <div className="space-y-3">
            <h4 className="font-medium text-sm flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Packing Details
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="kindOfPackages">Kind of Packages *</Label>
                <Select 
                  value={fields.kindOfPackages} 
                  onValueChange={(v) => handleChange('kindOfPackages', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {PACKAGE_TYPES.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="numberOfPackages">Number of Packages *</Label>
                <Input
                  id="numberOfPackages"
                  type="number"
                  min="1"
                  value={fields.numberOfPackages || ''}
                  onChange={(e) => handleChange('numberOfPackages', parseInt(e.target.value) || 0)}
                  placeholder="Enter total packages"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={!fields.portOfLoading || !fields.portOfDischarge || !fields.termsOfPayment}
          >
            <FileDown className="h-4 w-4 mr-2" />
            Generate {documentType === 'invoice' ? 'Invoice' : 'Packing List'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}