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
  rate: number;
  total: number;
}

export interface CommercialInvoiceData {
  invoiceNo: string;
  invoiceDate: string;
  dispatchDate: string;
  poNumber?: string;
  poDate?: string;
  
  // Customer details
  customer: {
    name: string;
    address: string;
    contact?: string;
    email?: string;
    gst?: string;
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
  incoterm?: string;
  vesselFlight?: string;
  hsCode?: string;
  countryOfOrigin?: string;
  
  // Packing details
  marksNos?: string;
  kindOfPackages?: string;
  totalGrossWeight?: number;
  totalNetWeight?: number;
  
  // Line items
  lineItems: CommercialInvoiceLineItem[];
  
  // Totals
  currency: string;
  subtotal: number;
  gstPercent?: number;
  gstAmount?: number;
  totalAmount: number;
  advanceAmount?: number;
  balanceAmount?: number;
  
  // Payment
  paymentTermsDays?: number;
  dueDate: string;
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

// Convert number to words
const convertToWords = (amount: number): string => {
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
  
  if (intPart === 0) return 'Zero';
  
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
  
  if (decPart > 0) {
    words += ' and ' + decPart + '/100';
  }
  
  return words.trim();
};

export const generateCommercialInvoicePDF = (data: CommercialInvoiceData): jsPDF => {
  const doc = new jsPDF();
  let yPos = addLetterhead(doc);
  
  // Document title
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('COMMERCIAL INVOICE', 105, yPos, { align: 'center' });
  yPos += 8;
  
  // Invoice details row
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`INVOICE NO.: ${data.invoiceNo}`, 15, yPos);
  doc.text(`DATE: ${data.invoiceDate}`, 150, yPos);
  yPos += 5;
  
  if (data.poNumber) {
    doc.text(`P.O. NO.: ${data.poNumber}`, 15, yPos);
    if (data.poDate) {
      doc.text(`P.O. DATE: ${data.poDate}`, 150, yPos);
    }
    yPos += 5;
  }
  
  doc.text(`DISPATCH DATE: ${data.dispatchDate}`, 15, yPos);
  doc.text(`DUE DATE: ${data.dueDate}`, 150, yPos);
  yPos += 8;
  
  // Customer details
  doc.setFont('helvetica', 'bold');
  doc.text(data.isExport ? 'Consignee (SHIP TO):' : 'Bill To:', 15, yPos);
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
    data.customer.email ? `Email: ${data.customer.email}` : '',
    data.customer.gst ? `GST: ${data.customer.gst}` : ''
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
    if (data.incoterm) {
      doc.text(`Incoterms: ${data.incoterm}`, 110, yPos);
    }
    yPos += 6;
  }
  
  // Packing details
  if (data.marksNos || data.kindOfPackages || data.totalGrossWeight) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    
    if (data.marksNos) {
      doc.text('Marks & Nos.:', 15, yPos);
    }
    if (data.kindOfPackages) {
      doc.text('Kind of Packages:', 80, yPos);
    }
    if (data.totalGrossWeight) {
      doc.text('Gross Weight (Kgs):', 145, yPos);
    }
    yPos += 4;
    
    doc.setFont('helvetica', 'normal');
    if (data.marksNos) {
      doc.text(data.marksNos, 15, yPos);
    }
    if (data.kindOfPackages) {
      doc.text(data.kindOfPackages, 80, yPos);
    }
    if (data.totalGrossWeight) {
      doc.text(data.totalGrossWeight.toFixed(3), 145, yPos);
    }
    yPos += 6;
  }
  
  // Line items table
  const tableHead = data.isExport 
    ? [['Sr.', 'Item Code', 'Description', 'HS Code', 'Qty (Pcs)', `Rate (${data.currency})`, `Total (${data.currency})`]]
    : [['Sr.', 'Item Code', 'Description', 'Qty (Pcs)', `Rate (${data.currency})`, `Total (${data.currency})`]];
  
  const tableData = data.lineItems.map(item => {
    const baseRow = [
      item.srNo.toString(),
      item.itemCode,
      item.description,
    ];
    
    if (data.isExport) {
      baseRow.push(item.hsCode || data.hsCode || '—');
    }
    
    baseRow.push(
      item.quantity.toLocaleString(),
      item.rate.toFixed(4),
      item.total.toFixed(2)
    );
    
    return baseRow;
  });
  
  const columnStyles: any = data.isExport ? {
    0: { cellWidth: 12 },
    1: { cellWidth: 25 },
    2: { cellWidth: 55 },
    3: { cellWidth: 22 },
    4: { cellWidth: 22, halign: 'right' },
    5: { cellWidth: 22, halign: 'right' },
    6: { cellWidth: 27, halign: 'right' }
  } : {
    0: { cellWidth: 12 },
    1: { cellWidth: 30 },
    2: { cellWidth: 65 },
    3: { cellWidth: 25, halign: 'right' },
    4: { cellWidth: 25, halign: 'right' },
    5: { cellWidth: 28, halign: 'right' }
  };
  
  autoTable(doc, {
    startY: yPos,
    head: tableHead,
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: BRAND_COLORS.primary, fontSize: 7, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7 },
    columnStyles,
    margin: { left: 15, right: 15 }
  });
  
  yPos = doc.lastAutoTable.finalY + 5;
  
  // Totals section
  const currencySymbol = data.currency === 'INR' ? '₹' : data.currency === 'USD' ? '$' : data.currency;
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  
  doc.text(`SUBTOTAL:`, 130, yPos);
  doc.text(`${currencySymbol}${data.subtotal.toFixed(2)}`, 190, yPos, { align: 'right' });
  yPos += 5;
  
  if (data.gstAmount && data.gstAmount > 0) {
    doc.setFont('helvetica', 'normal');
    doc.text(`GST (${data.gstPercent || 18}%):`, 130, yPos);
    doc.text(`${currencySymbol}${data.gstAmount.toFixed(2)}`, 190, yPos, { align: 'right' });
    yPos += 5;
  }
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`TOTAL ${data.currency}:`, 130, yPos);
  doc.text(`${currencySymbol}${data.totalAmount.toFixed(2)}`, 190, yPos, { align: 'right' });
  yPos += 6;
  
  if (data.advanceAmount && data.advanceAmount > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`LESS: ADVANCE:`, 130, yPos);
    doc.text(`-${currencySymbol}${data.advanceAmount.toFixed(2)}`, 190, yPos, { align: 'right' });
    yPos += 5;
    
    doc.setFont('helvetica', 'bold');
    doc.text(`NET PAYABLE:`, 130, yPos);
    doc.text(`${currencySymbol}${(data.totalAmount - data.advanceAmount).toFixed(2)}`, 190, yPos, { align: 'right' });
    yPos += 6;
  }
  
  // Amount in words
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const netAmount = data.advanceAmount ? data.totalAmount - data.advanceAmount : data.totalAmount;
  const amountInWords = convertToWords(netAmount);
  doc.text(`Amount in words: ${amountInWords} ${data.currency === 'INR' ? 'Rupees' : data.currency === 'USD' ? 'Dollars' : data.currency} Only`, 15, yPos, { maxWidth: 180 });
  yPos += 10;
  
  // Declaration
  doc.setFont('helvetica', 'bold');
  doc.text('Declaration:', 15, yPos);
  yPos += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.', 15, yPos, { maxWidth: 180 });
  yPos += 12;
  
  // Bank details for export
  if (data.isExport) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Bank Details:', 15, yPos);
    yPos += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('Bank Name: [Bank Name]', 15, yPos);
    yPos += 3;
    doc.text('Account No: [Account Number]', 15, yPos);
    yPos += 3;
    doc.text('SWIFT Code: [SWIFT Code]', 15, yPos);
    yPos += 8;
  }
  
  // Signature section
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('For, R V INDUSTRIES', 15, yPos);
  yPos += 15;
  doc.text('Authorized Signatory', 15, yPos);
  
  addFooter(doc, 1, 1);
  
  return doc;
};

export const downloadCommercialInvoice = (data: CommercialInvoiceData): void => {
  const doc = generateCommercialInvoicePDF(data);
  doc.save(`Commercial_Invoice_${data.invoiceNo}.pdf`);
};
