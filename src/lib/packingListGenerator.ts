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
  srNo: number;
  itemCode: string;
  description: string;
  cartonNos: string;
  quantityPerCarton: number;
  totalQty: number;
  netWeightKg: number;
  grossWeightKg: number;
}

export interface PackingListData {
  packingListNo: string;
  date: string;
  dispatchRef: string;
  invoiceRef?: string;
  poNumber?: string;
  poDate?: string;
  
  // Customer details
  customer: {
    name: string;
    address: string;
    contact?: string;
    email?: string;
  };
  
  // Notify party (for export)
  notifyParty?: {
    name: string;
    address: string;
  };
  
  // Export-only fields
  isExport: boolean;
  portOfLoading?: string;
  portOfDischarge?: string;
  finalDestination?: string;
  vesselFlight?: string;
  countryOfOrigin?: string;
  
  // Line items
  lineItems: PackingListLineItem[];
  
  // Totals
  totalCartons: number;
  totalQuantity: number;
  totalNetWeight: number;
  totalGrossWeight: number;
  
  // Packing marks
  marksNos?: string;
  kindOfPackages?: string;
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
  doc.text('Precision Brass Components', 105, 19, { align: 'center' });
  
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
  doc.text('Plot No 11, 12/1 & 12/2, Sadguru Industrial Area, Jamnagar - 361006 (Gujarat) India', 105, 29, { align: 'center' });
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
  doc.text('PACKING LIST', 105, yPos, { align: 'center' });
  yPos += 8;
  
  // Reference details row
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`PACKING LIST NO.: ${data.packingListNo}`, 15, yPos);
  doc.text(`DATE: ${data.date}`, 150, yPos);
  yPos += 5;
  
  doc.text(`DISPATCH REF.: ${data.dispatchRef}`, 15, yPos);
  if (data.invoiceRef) {
    doc.text(`INVOICE REF.: ${data.invoiceRef}`, 150, yPos);
  }
  yPos += 5;
  
  if (data.poNumber) {
    doc.text(`P.O. NO.: ${data.poNumber}`, 15, yPos);
    if (data.poDate) {
      doc.text(`P.O. DATE: ${data.poDate}`, 150, yPos);
    }
    yPos += 5;
  }
  yPos += 3;
  
  // Customer details
  doc.setFont('helvetica', 'bold');
  doc.text(data.isExport ? 'Consignee (SHIP TO):' : 'Ship To:', 15, yPos);
  if (data.isExport && data.notifyParty) {
    doc.text('Notify Party:', 110, yPos);
  }
  yPos += 5;
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  
  const customerText = [
    data.customer.name,
    data.customer.address,
    data.customer.contact ? `Contact: ${data.customer.contact}` : '',
    data.customer.email ? `Email: ${data.customer.email}` : ''
  ].filter(Boolean).join('\n');
  
  const customerLines = doc.splitTextToSize(customerText, 90);
  customerLines.forEach((line: string) => {
    doc.text(line, 15, yPos);
    yPos += 4;
  });
  
  if (data.isExport && data.notifyParty) {
    let notifyYPos = yPos - (customerLines.length * 4);
    const notifyText = `${data.notifyParty.name}\n${data.notifyParty.address}`;
    const notifyLines = doc.splitTextToSize(notifyText, 85);
    notifyLines.forEach((line: string) => {
      doc.text(line, 110, notifyYPos);
      notifyYPos += 4;
    });
    yPos = Math.max(yPos, notifyYPos);
  }
  
  yPos += 3;
  
  // Export-specific shipping details
  if (data.isExport) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Shipping Details:', 15, yPos);
    yPos += 4;
    
    doc.setFont('helvetica', 'normal');
    
    if (data.portOfLoading) {
      doc.text(`Port of Loading: ${data.portOfLoading}`, 15, yPos);
    }
    if (data.portOfDischarge) {
      doc.text(`Port of Discharge: ${data.portOfDischarge}`, 110, yPos);
    }
    yPos += 4;
    
    if (data.finalDestination) {
      doc.text(`Final Destination: ${data.finalDestination}`, 15, yPos);
    }
    if (data.vesselFlight) {
      doc.text(`Vessel/Flight: ${data.vesselFlight}`, 110, yPos);
    }
    yPos += 4;
    
    doc.text(`Country of Origin: ${data.countryOfOrigin || 'INDIA'}`, 15, yPos);
    yPos += 6;
  }
  
  // Marks & Packages section
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Marks & Nos.:', 15, yPos);
  doc.text('Kind of Packages:', 80, yPos);
  doc.text('No. of Packages:', 145, yPos);
  yPos += 4;
  
  doc.setFont('helvetica', 'normal');
  doc.text(data.marksNos || 'AS MARKED', 15, yPos);
  doc.text(data.kindOfPackages || 'CARTONS', 80, yPos);
  doc.text(data.totalCartons.toString(), 145, yPos);
  yPos += 8;
  
  // Line items table
  const tableHead = [['Sr.', 'Item Code', 'Description', 'Carton Nos.', 'Qty/Carton', 'Total Qty', 'Net Wt (Kg)', 'Gross Wt (Kg)']];
  
  const tableData = data.lineItems.map(item => [
    item.srNo.toString(),
    item.itemCode,
    item.description,
    item.cartonNos,
    item.quantityPerCarton.toLocaleString(),
    item.totalQty.toLocaleString(),
    item.netWeightKg.toFixed(3),
    item.grossWeightKg.toFixed(3),
  ]);
  
  // Add totals row
  tableData.push([
    '',
    '',
    'TOTAL',
    '',
    '',
    data.totalQuantity.toLocaleString(),
    data.totalNetWeight.toFixed(3),
    data.totalGrossWeight.toFixed(3),
  ]);
  
  autoTable(doc, {
    startY: yPos,
    head: tableHead,
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: BRAND_COLORS.primary, fontSize: 7, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 22 },
      2: { cellWidth: 40 },
      3: { cellWidth: 25 },
      4: { cellWidth: 20, halign: 'right' },
      5: { cellWidth: 22, halign: 'right' },
      6: { cellWidth: 23, halign: 'right' },
      7: { cellWidth: 23, halign: 'right' },
    },
    margin: { left: 15, right: 15 },
    didParseCell: (data) => {
      // Bold the totals row
      if (data.row.index === tableData.length - 1) {
        data.cell.styles.fontStyle = 'bold';
      }
    }
  });
  
  yPos = doc.lastAutoTable.finalY + 8;
  
  // Summary section
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('PACKING SUMMARY', 15, yPos);
  yPos += 5;
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  
  const summaryData = [
    ['Total Cartons:', data.totalCartons.toString()],
    ['Total Quantity:', `${data.totalQuantity.toLocaleString()} pcs`],
    ['Total Net Weight:', `${data.totalNetWeight.toFixed(3)} Kg`],
    ['Total Gross Weight:', `${data.totalGrossWeight.toFixed(3)} Kg`],
  ];
  
  summaryData.forEach(([label, value]) => {
    doc.text(label, 15, yPos);
    doc.text(value, 60, yPos);
    yPos += 4;
  });
  
  yPos += 10;
  
  // Declaration
  doc.setFont('helvetica', 'bold');
  doc.text('Declaration:', 15, yPos);
  yPos += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('We certify that the goods are packed in accordance with the requirements and the packing list details are true and correct.', 15, yPos, { maxWidth: 180 });
  yPos += 12;
  
  // Signature section
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('For, R V INDUSTRIES', 15, yPos);
  yPos += 15;
  doc.text('Authorized Signatory', 15, yPos);
  
  // Checked by section on right
  doc.text('Checked By:', 140, yPos - 15);
  doc.setDrawColor(...BRAND_COLORS.dark);
  doc.line(140, yPos + 3, 190, yPos + 3);
  
  addFooter(doc, 1, 1);
  
  return doc;
};

export const downloadPackingList = (data: PackingListData): void => {
  const doc = generatePackingListPDF(data);
  doc.save(`Packing_List_${data.packingListNo}.pdf`);
};
