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

// RV Industries Brand Colors (from company banner)
const BRAND_COLORS = {
  primary: [30, 74, 141] as [number, number, number],   // Brand Blue #1E4A8D
  accent: [211, 47, 47] as [number, number, number],    // Brand Red #D32F2F
  dark: [33, 33, 33] as [number, number, number],
  light: [245, 245, 245] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

export interface CommercialInvoiceLineItem {
  srNo: number;
  itemCode: string;
  description: string;
  hsCode?: string;
  quantity: number;
  unit: string;
  rate: number;
  rateBasis: string;
  total: number;
}

export interface CommercialInvoiceData {
  // Document Identification
  invoiceNo: string;
  financialYear?: string;
  invoiceDate: string;
  
  // Customer PO Reference
  poNumber?: string;
  poDate?: string;
  
  // Consignee Details (Ship To)
  consignee: {
    name: string;
    addressLine1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country: string;
    contact?: string;
    email?: string;
    gst?: string;
  };
  
  // Notify Party
  notifyParty?: {
    name: string;
    address: string;
  };
  notifyPartySameAsConsignee: boolean;
  
  // Pre-Carriage & Receipt
  preCarriageBy?: string;
  placeOfReceipt?: string;
  
  // Origin & Destination
  countryOfOrigin: string;
  finalDestination: string;
  
  // Transport Details
  portOfLoading?: string;
  vesselFlightNo?: string;
  portOfDischarge?: string;
  
  // Payment & BL
  termsOfPayment?: string;
  blNumber?: string;
  blDate?: string;
  
  // Packing & Identification
  marksAndNumbers?: string;
  kindOfPackages?: string;
  numberOfPackages?: number;
  
  // Weight Details
  grossWeightKg: number;
  netWeightKg: number;
  
  // Line Items
  lineItems: CommercialInvoiceLineItem[];
  
  // Currency & Totals (NEVER converted - always in original sales order currency)
  currency: string;
  totalQuantity: number;
  totalAmount: number;
  
  // Declaration
  declarationText?: string;
  
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

// Convert number to words
const convertToWords = (amount: number, currencyName: string): string => {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  
  const convertChunk = (num: number): string => {
    let result = '';
    if (num >= 100) {
      result += ones[Math.floor(num / 100)] + ' Hundred ';
      num %= 100;
    }
    if (num >= 20) {
      result += tens[Math.floor(num / 10)] + ' ';
      num %= 10;
    } else if (num >= 10) {
      result += teens[num - 10] + ' ';
      num = 0;
    }
    if (num > 0) {
      result += ones[num] + ' ';
    }
    return result.trim();
  };
  
  let intPart = Math.floor(amount);
  const decPart = Math.round((amount - intPart) * 100);
  
  if (intPart === 0) return `Zero ${currencyName}`;
  
  let words = '';
  
  if (intPart >= 1000000) {
    words += convertChunk(Math.floor(intPart / 1000000)) + ' Million ';
    intPart %= 1000000;
  }
  
  if (intPart >= 1000) {
    words += convertChunk(Math.floor(intPart / 1000)) + ' Thousand ';
    intPart %= 1000;
  }
  
  if (intPart > 0) {
    words += convertChunk(intPart);
  }
  
  words += ` ${currencyName}`;
  
  if (decPart > 0) {
    words += ` and ${decPart}/100`;
  }
  
  return words.trim() + ' Only';
};

const getCurrencySymbol = (currency: string): string => {
  switch (currency) {
    case 'USD': return '$';
    case 'EUR': return '€';
    case 'GBP': return '£';
    case 'INR': return '₹';
    default: return currency + ' ';
  }
};

const getCurrencyName = (currency: string): string => {
  switch (currency) {
    case 'USD': return 'Dollars';
    case 'EUR': return 'Euros';
    case 'GBP': return 'Pounds';
    case 'INR': return 'Rupees';
    default: return currency;
  }
};

export const generateCommercialInvoicePDF = (data: CommercialInvoiceData): jsPDF => {
  const doc = new jsPDF();
  let yPos = addLetterhead(doc);
  
  // Document title
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BRAND_COLORS.primary);
  doc.text('COMMERCIAL INVOICE', 105, yPos, { align: 'center' });
  yPos += 10;
  doc.setTextColor(...BRAND_COLORS.dark);
  
  // === CONSIGNEE SECTION (Left) & INVOICE DETAILS (Right) ===
  const leftColX = 15;
  const rightColX = 120;
  
  // Left: Consignee
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Consignee:', leftColX, yPos);
  
  // Right: Invoice details
  doc.text('INVOICE NO.:', rightColX, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text(data.invoiceNo + (data.financialYear ? `/${data.financialYear}` : ''), rightColX + 28, yPos);
  yPos += 5;
  
  doc.setFont('helvetica', 'normal');
  doc.text(data.consignee.name, leftColX, yPos);
  
  doc.setFont('helvetica', 'bold');
  doc.text('DATE:', rightColX, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text(data.invoiceDate, rightColX + 28, yPos);
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
  // Row 1: Pre-Carriage, Place of Receipt, Country of Origin, Final Destination
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  const tableY = yPos;
  
  autoTable(doc, {
    startY: yPos,
    head: [['Pre Carriage By', 'Place of receipt of pre carrier', 'Country of Origin', 'Final Destination']],
    body: [[
      data.preCarriageBy || 'N.A.',
      data.placeOfReceipt || 'N.A.',
      data.countryOfOrigin,
      data.finalDestination
    ]],
    theme: 'grid',
    headStyles: { fillColor: BRAND_COLORS.light, textColor: BRAND_COLORS.dark, fontSize: 7, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7 },
    margin: { left: 15, right: 15 },
    tableWidth: 'auto',
  });
  
  yPos = doc.lastAutoTable.finalY;
  
  // Row 2: Port of Loading, Vessel/Flight, Terms of Payment
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
  
  // Row 3: Port of Discharge, Final Destination, BL No. & Date
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
  
  yPos = doc.lastAutoTable.finalY;
  
  // Row 4: Weight details & Packages
  autoTable(doc, {
    startY: yPos,
    head: [['Gross Weight in Kgs', 'Nett Weight in Kgs', 'No. of Packages']],
    body: [[
      data.grossWeightKg.toFixed(3),
      data.netWeightKg.toFixed(3),
      data.numberOfPackages ? `${data.numberOfPackages} ${data.kindOfPackages || 'BOXES'}` : (data.kindOfPackages || '')
    ]],
    theme: 'grid',
    headStyles: { fillColor: BRAND_COLORS.light, textColor: BRAND_COLORS.dark, fontSize: 7, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7 },
    margin: { left: 15, right: 15 },
  });
  
  yPos = doc.lastAutoTable.finalY + 5;
  
  // === LINE ITEMS TABLE ===
  const currencySymbol = getCurrencySymbol(data.currency);
  
  const tableHead = [['Sr. No.', 'Description of Goods', 'Quantity', `Rate - ${data.currency}`, 'Total Amount']];
  
  const tableData = data.lineItems.map(item => {
    // Description includes HS Code and Item Code
    let description = item.description;
    if (item.hsCode) {
      description += `\n(CETH-${item.hsCode})`;
    }
    description += `\nItem Code: ${item.itemCode}`;
    
    return [
      item.srNo.toString(),
      description,
      `${item.quantity.toLocaleString()} ${item.unit}`,
      `${currencySymbol}${item.rate.toFixed(4)}`,
      `${currencySymbol}${item.total.toFixed(2)}`
    ];
  });
  
  autoTable(doc, {
    startY: yPos,
    head: tableHead,
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: BRAND_COLORS.primary, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 18, halign: 'center' },
      1: { cellWidth: 75 },
      2: { cellWidth: 28, halign: 'right' },
      3: { cellWidth: 32, halign: 'right' },
      4: { cellWidth: 32, halign: 'right' }
    },
    margin: { left: 15, right: 15 },
  });
  
  yPos = doc.lastAutoTable.finalY + 3;
  
  // === TOTALS ===
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  
  // Total row
  doc.text('TOTAL:', 120, yPos);
  doc.text(`${data.totalQuantity.toLocaleString()}`, 150, yPos, { align: 'right' });
  doc.text(`TOTAL ${data.currency}: ${currencySymbol}${data.totalAmount.toFixed(2)}`, 190, yPos, { align: 'right' });
  yPos += 6;
  
  // Amount in words
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const amountInWords = convertToWords(data.totalAmount, getCurrencyName(data.currency));
  doc.text(`Amt ${data.currency}: ${amountInWords}`, 15, yPos, { maxWidth: 175 });
  yPos += 10;
  
  // === DECLARATION ===
  doc.setFont('helvetica', 'bold');
  doc.text('Declaration:', 15, yPos);
  yPos += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const declaration = data.declarationText || 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.';
  doc.text(declaration, 15, yPos, { maxWidth: 175 });
  yPos += 12;
  
  // === SIGNATURE SECTION ===
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('SIGNATURE & DATE:', 15, yPos);
  yPos += 8;
  
  doc.text('For, R V INDUSTRIES', 15, yPos);
  yPos += 12;
  
  doc.text('DATE:', 15, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text(data.signatureDate || data.invoiceDate, 30, yPos);
  
  doc.setFont('helvetica', 'bold');
  doc.text(data.signatoryDesignation || 'PROPRIETOR', 80, yPos);
  
  addFooter(doc, 1, 1);
  
  return doc;
};

export const downloadCommercialInvoice = (data: CommercialInvoiceData): void => {
  const doc = generateCommercialInvoicePDF(data);
  doc.save(`Commercial_Invoice_${data.invoiceNo}.pdf`);
};

// Helper to check which fields are missing for export invoice generation
export interface MissingExportFields {
  portOfLoading?: boolean;
  portOfDischarge?: boolean;
  vesselFlightNo?: boolean;
  termsOfPayment?: boolean;
  blNumber?: boolean;
  blDate?: boolean;
  numberOfPackages?: boolean;
  kindOfPackages?: boolean;
}

export const getMissingExportFields = (data: Partial<CommercialInvoiceData>): MissingExportFields => {
  const missing: MissingExportFields = {};
  
  if (!data.portOfLoading) missing.portOfLoading = true;
  if (!data.portOfDischarge) missing.portOfDischarge = true;
  if (!data.vesselFlightNo) missing.vesselFlightNo = true;
  if (!data.termsOfPayment) missing.termsOfPayment = true;
  // BL Number/Date are optional (can be blank)
  if (!data.numberOfPackages) missing.numberOfPackages = true;
  if (!data.kindOfPackages) missing.kindOfPackages = true;
  
  return missing;
};

export const hasMissingExportFields = (data: Partial<CommercialInvoiceData>): boolean => {
  return Object.keys(getMissingExportFields(data)).length > 0;
};