import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import rvLogoHighRes from '@/assets/rv-logo-high-res.png';

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

const addLetterhead = (doc: jsPDF): number => {
  // Add high-res logo
  try {
    doc.addImage(rvLogoHighRes, 'PNG', 15, 8, 32, 16);
  } catch {
    // Fallback if logo fails
    doc.setFillColor(...BRAND_COLORS.primary);
    doc.rect(15, 8, 30, 16, 'F');
    doc.setTextColor(...BRAND_COLORS.white);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('RV', 30, 18, { align: 'center' });
  }
  
  // Company name and title with brand colors
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BRAND_COLORS.primary);
  doc.text('R.V. INDUSTRIES', 105, 14, { align: 'center' });
  
  // ISO certification badge area
  doc.setFontSize(8);
  doc.setTextColor(...BRAND_COLORS.dark);
  doc.text('An ISO 9001:2015 Company', 175, 10, { align: 'right' });
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...BRAND_COLORS.dark);
  doc.text('Manufacturer of HIGH Precision Brass Components', 105, 19, { align: 'center' });
  
  // Certifications with alternating brand colors
  doc.setFontSize(7);
  doc.setTextColor(...BRAND_COLORS.primary);
  doc.text('ISO 9001:2015', 70, 24, { align: 'center' });
  doc.setTextColor(...BRAND_COLORS.accent);
  doc.text('|', 85, 24, { align: 'center' });
  doc.setTextColor(...BRAND_COLORS.primary);
  doc.text('CE', 95, 24, { align: 'center' });
  doc.setTextColor(...BRAND_COLORS.accent);
  doc.text('|', 102, 24, { align: 'center' });
  doc.setTextColor(...BRAND_COLORS.primary);
  doc.text('RoHS', 112, 24, { align: 'center' });
  doc.setTextColor(...BRAND_COLORS.accent);
  doc.text('|', 122, 24, { align: 'center' });
  doc.setTextColor(...BRAND_COLORS.primary);
  doc.text('TÜV Certified', 138, 24, { align: 'center' });
  
  // Contact details
  doc.setFontSize(7);
  doc.setTextColor(...BRAND_COLORS.dark);
  doc.text('Plot No 11 & 12, Sadguru Industrial Area, Jamnagar, 361006 (Gujarat) India', 105, 29, { align: 'center' });
  doc.text('www.brasspartsindia.net | sales@brasspartsindia.net | +91 288 2564431', 105, 33, { align: 'center' });
  
  // Line separator with dual brand colors
  doc.setDrawColor(...BRAND_COLORS.primary);
  doc.setLineWidth(1);
  doc.line(15, 37, 105, 37);
  doc.setDrawColor(...BRAND_COLORS.accent);
  doc.line(105, 37, 195, 37);
  
  return 42;
};

const addFooter = (doc: jsPDF, pageNumber: number, totalPages: number): void => {
  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(7);
  doc.setTextColor(128, 128, 128);
  doc.text(`Page ${pageNumber} of ${totalPages}`, 105, pageHeight - 10, { align: 'center' });
  doc.setTextColor(0, 0, 0);
};

export const generatePackingListPDF = (data: PackingListData): jsPDF => {
  const doc = new jsPDF();
  let yPos = addLetterhead(doc);
  
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
    margin: { left: 15, right: 15 },
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
    margin: { left: 15, right: 15 },
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
    margin: { left: 15, right: 15 },
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
  
  addFooter(doc, 1, 1);
  
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