import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { contentTop, tableMargin, finalizeLetterhead, getCompany } from '@/lib/pdfLetterhead';

declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable: {
      finalY: number;
    };
  }
}

// RV Industries Brand Colors
const BRAND_COLORS = {
  primary: [30, 74, 141] as [number, number, number],   // Brand Blue #1E4A8D
  accent: [211, 47, 47] as [number, number, number],    // Brand Red #D32F2F
  dark: [33, 33, 33] as [number, number, number],
  light: [245, 245, 245] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

export interface PackingListLineItem {
  palletNo?: string;
  cartonRange: string;
  totalBoxes: number;
  piecesPerCarton: number;
  itemName: string;
  itemCode: string;
  totalPieces: number;
  grossWeightKg: number;
}

export interface PackingListData {
  // Document Identification
  packingListNo: string;
  date: string;
  
  // Customer PO Reference
  poNumber?: string;
  poDate?: string;
  
  // Consignee Details
  consignee: {
    name: string;
    addressLine1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country: string;
  };
  
  // Notify Party
  notifyParty?: {
    name: string;
    address: string;
  };
  notifyPartySameAsConsignee: boolean;
  
  // Transport Details
  portOfLoading?: string;
  vesselFlightNo?: string;
  portOfDischarge?: string;
  finalDestination: string;
  
  // Payment & BL
  termsOfPayment?: string;
  blNumber?: string;
  blDate?: string;
  
  // Goods Description (header level)
  goodsDescription?: string;
  hsCode?: string;
  
  // Packing Details
  kindOfPackages?: string;
  
  // Line Items (per pallet/carton grouping)
  lineItems: PackingListLineItem[];
  
  // Totals
  totalBoxes: number;
  totalQuantity: number;
  totalGrossWeight: number;
  
  // Signature
  signatureDate?: string;
  signatoryDesignation?: string;
}

const addLetterhead = (_doc: jsPDF): number => contentTop();

// Document title
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BRAND_COLORS.primary);
  doc.text('PACKING LIST', 105, yPos, { align: 'center' });
  yPos += 10;
  doc.setTextColor(...BRAND_COLORS.dark);
  
  // === CONSIGNEE SECTION (Left) & DOCUMENT DETAILS (Right) ===
  const leftColX = 15;
  const rightColX = 120;
  
  // Left: Consignee
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Consignee:', leftColX, yPos);
  
  // Right: Packing List details
  doc.text('INVOICE NO.:', rightColX, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text(data.packingListNo, rightColX + 28, yPos);
  yPos += 5;
  
  doc.setFont('helvetica', 'normal');
  doc.text(data.consignee.name, leftColX, yPos);
  
  doc.setFont('helvetica', 'bold');
  doc.text('DATE:', rightColX, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text(data.date, rightColX + 28, yPos);
  yPos += 4;
  
  // Consignee address lines
  if (data.consignee.addressLine1) {
    doc.text(data.consignee.addressLine1, leftColX, yPos);
    yPos += 4;
  }
  
  let cityStateZip = [data.consignee.city, data.consignee.state, data.consignee.postalCode].filter(Boolean).join(', ');
  if (cityStateZip) {
    doc.text(cityStateZip, leftColX, yPos);
    yPos += 4;
  }
  
  doc.text(data.consignee.country, leftColX, yPos);
  yPos += 6;
  
  // PO Reference
  if (data.poNumber) {
    doc.setFont('helvetica', 'bold');
    doc.text('P.O. NO.:', leftColX, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(data.poNumber, leftColX + 22, yPos);
    
    if (data.poDate) {
      doc.setFont('helvetica', 'bold');
      doc.text('DATE:', rightColX, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(data.poDate, rightColX + 28, yPos);
    }
    yPos += 6;
  }
  
  // Notify Party
  doc.setFont('helvetica', 'bold');
  doc.text('Notify Party (if other than consignee):', leftColX, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text(data.notifyPartySameAsConsignee ? 'As above' : (data.notifyParty?.name || 'As above'), leftColX + 62, yPos);
  yPos += 8;
  
  // === SHIPPING DETAILS TABLE ===
  autoTable(doc, {
    startY: yPos,
    head: [['Port of Loading', 'Vessel/Flight No.', 'Terms of Payment:']],
    body: [[
      data.portOfLoading || '',
      data.vesselFlightNo || 'BY AIR',
      data.termsOfPayment || ''
    ]],
    theme: 'grid',
    headStyles: { fillColor: BRAND_COLORS.light, textColor: BRAND_COLORS.dark, fontSize: 7, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7 },
    margin: tableMargin(doc),
  });
  
  yPos = doc.lastAutoTable.finalY;
  
  autoTable(doc, {
    startY: yPos,
    head: [['Port of Discharge', 'Final Destination', 'BL No. & Date']],
    body: [[
      data.portOfDischarge || '',
      data.finalDestination,
      data.blNumber && data.blDate ? `${data.blNumber} / ${data.blDate}` : (data.blNumber || data.blDate || '')
    ]],
    theme: 'grid',
    headStyles: { fillColor: BRAND_COLORS.light, textColor: BRAND_COLORS.dark, fontSize: 7, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7 },
    margin: tableMargin(doc),
  });
  
  yPos = doc.lastAutoTable.finalY + 5;
  
  // === PACKING TABLE ===
  // Header row for Kind of Packages and Description
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Kind of Packages:', 15, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text(data.kindOfPackages || 'BOXES', 45, yPos);
  
  // Description of Goods header
  let goodsDesc = data.goodsDescription || 'NUTS/SCREW/WASHERS MADE OF BRASS';
  if (data.hsCode) {
    goodsDesc += ` (CETH-${data.hsCode})`;
  }
  doc.setFont('helvetica', 'bold');
  doc.text('Description of Goods:', 90, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text(goodsDesc, 130, yPos);
  yPos += 6;
  
  // Main packing table
  const tableHead = [['C/Box No.', 'Total Boxes', 'PC per C/Box', 'Name of Item', 'Item Code', 'Total Pcs', 'Gross in Kgs.']];
  
  const tableData = data.lineItems.map(item => [
    item.cartonRange,
    item.totalBoxes.toString(),
    item.piecesPerCarton.toLocaleString(),
    item.itemName,
    item.itemCode,
    item.totalPieces.toLocaleString(),
    item.grossWeightKg.toFixed(3)
  ]);
  
  autoTable(doc, {
    startY: yPos,
    head: tableHead,
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: BRAND_COLORS.primary, fontSize: 7, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' },
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 22, halign: 'right' },
      3: { cellWidth: 38 },
      4: { cellWidth: 28 },
      5: { cellWidth: 22, halign: 'right' },
      6: { cellWidth: 28, halign: 'right' }
    },
    margin: tableMargin(doc),
  });
  
  yPos = doc.lastAutoTable.finalY + 3;
  
  // === TOTALS ROW ===
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  
  doc.text(`TOTAL ${data.totalBoxes}`, 15, yPos);
  doc.text(`TOTAL ${data.totalQuantity.toLocaleString()}`, 120, yPos);
  doc.text(`${data.totalGrossWeight.toFixed(3)}`, 190, yPos, { align: 'right' });
  yPos += 15;
  
  // === SIGNATURE SECTION ===
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('SIGNATURE & DATE:', 15, yPos);
  yPos += 10;
  
  doc.text('For, R V INDUSTRIES', 15, yPos);
  yPos += 12;
  
  doc.setFont('helvetica', 'normal');
  doc.text(data.signatureDate || data.date, 15, yPos);
  
  doc.setFont('helvetica', 'bold');
  doc.text(data.signatoryDesignation || 'PROPRIETOR', 60, yPos);
  
  finalizeLetterhead(doc);
  
  return doc;
};

export const downloadPackingList = (data: PackingListData): void => {
  const doc = generatePackingListPDF(data);
  doc.save(`Packing_List_${data.packingListNo}.pdf`);
};

// Helper to check which fields are missing for export packing list generation
export interface MissingPackingFields {
  portOfLoading?: boolean;
  portOfDischarge?: boolean;
  vesselFlightNo?: boolean;
  termsOfPayment?: boolean;
  kindOfPackages?: boolean;
}

export const getMissingPackingFields = (data: Partial<PackingListData>): MissingPackingFields => {
  const missing: MissingPackingFields = {};
  
  if (!data.portOfLoading) missing.portOfLoading = true;
  if (!data.portOfDischarge) missing.portOfDischarge = true;
  if (!data.vesselFlightNo) missing.vesselFlightNo = true;
  if (!data.termsOfPayment) missing.termsOfPayment = true;
  if (!data.kindOfPackages) missing.kindOfPackages = true;
  
  return missing;
};

export const hasMissingPackingFields = (data: Partial<PackingListData>): boolean => {
  return Object.keys(getMissingPackingFields(data)).length > 0;
};