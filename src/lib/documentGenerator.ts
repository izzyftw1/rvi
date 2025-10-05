import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import rvLogo from '@/assets/rv-industries-logo.jpg';

interface InvoiceLineItem {
  srNo: number;
  description: string;
  hsCode?: string;
  quantity: number;
  rate: number;
  total: number;
}

interface PackingLineItem {
  palletNo: string;
  boxNos: string;
  totalBoxes: number;
  pcsPerBox: number;
  totalPcs: number;
  itemName: string;
  grossWeight: number;
}

interface InvoiceData {
  invoiceNo: string;
  date: string;
  piNo: string;
  piDate: string;
  consignee: {
    name: string;
    address: string;
  };
  notifyParty: {
    name: string;
    address: string;
  };
  portOfLoading: string;
  portOfDischarge: string;
  finalDestination: string;
  paymentTerms: string;
  marks: string;
  kindOfPackages: string;
  grossWeight: number;
  lineItems: InvoiceLineItem[];
  advance: number;
  currency?: string;
}

interface PackingListData {
  invoiceNo: string;
  date: string;
  piNo: string;
  piDate: string;
  consignee: {
    name: string;
    address: string;
  };
  notifyParty: {
    name: string;
    address: string;
  };
  portOfLoading: string;
  portOfDischarge: string;
  finalDestination: string;
  paymentTerms: string;
  vessel: string;
  marks: string;
  description: string;
  kindOfPackages: string;
  lineItems: PackingLineItem[];
}

const addLetterhead = (doc: jsPDF) => {
  // Add logo
  doc.addImage(rvLogo, 'JPEG', 15, 10, 30, 15);
  
  // Company name and title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('R. V. INDUSTRIES', 105, 15, { align: 'center' });
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Manufacturer of HIGH PRECISION Brass Components', 105, 20, { align: 'center' });
  
  // Certifications
  doc.setFontSize(8);
  doc.text('An ISO 9001:2015 Company | CE | RoHS | TUV Compliant', 105, 25, { align: 'center' });
  
  // Contact details
  doc.setFontSize(7);
  doc.text('Plot No 11, 12/1 & 12/2, Near Prime International School, Kansumara Main Road, Sadguru Industrial Area, Jamnagar - 6. (Guj.) India', 105, 30, { align: 'center' });
  doc.text('www.brasspartsindia.net | brassinserts@gmail.com | sales@brasspartsindia.net | +91 288 2564431 / 2567731', 105, 34, { align: 'center' });
  
  // Line separator
  doc.setDrawColor(0, 0, 0);
  doc.line(15, 38, 195, 38);
  
  return 42; // Return Y position after header
};

const addFooter = (doc: jsPDF, pageNumber: number, totalPages: number) => {
  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(7);
  doc.setTextColor(128, 128, 128);
  doc.text(`Page ${pageNumber} of ${totalPages}`, 105, pageHeight - 10, { align: 'center' });
};

export const generateCommercialInvoice = (data: InvoiceData): jsPDF => {
  const doc = new jsPDF();
  let yPos = addLetterhead(doc);
  
  // Document title
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('COMMERCIAL INVOICE', 105, yPos, { align: 'center' });
  yPos += 8;
  
  // Invoice details
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`INVOICE NO.: ${data.invoiceNo}`, 15, yPos);
  doc.text(`DATE: ${data.date}`, 150, yPos);
  yPos += 6;
  
  doc.text(`P.I. NO.: ${data.piNo}`, 15, yPos);
  doc.text(`DATE: ${data.piDate}`, 150, yPos);
  yPos += 8;
  
  // Consignee and Notify Party
  doc.setFont('helvetica', 'bold');
  doc.text('Consignee (SHIP TO):', 15, yPos);
  doc.text('Notify Party (BILL TO):', 110, yPos);
  yPos += 5;
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const consigneeLines = doc.splitTextToSize(data.consignee.name + '\n' + data.consignee.address, 90);
  const notifyLines = doc.splitTextToSize(data.notifyParty.name + '\n' + data.notifyParty.address, 90);
  
  consigneeLines.forEach((line: string) => {
    doc.text(line, 15, yPos);
    yPos += 4;
  });
  
  let notifyYPos = yPos - (consigneeLines.length * 4);
  notifyLines.forEach((line: string) => {
    doc.text(line, 110, notifyYPos);
    notifyYPos += 4;
  });
  
  yPos = Math.max(yPos, notifyYPos) + 5;
  
  // Shipping details
  doc.setFontSize(8);
  doc.text(`Port of Loading: ${data.portOfLoading}`, 15, yPos);
  doc.text(`Port of Discharge: ${data.portOfDischarge}`, 110, yPos);
  yPos += 5;
  doc.text(`Final Destination: ${data.finalDestination}`, 15, yPos);
  yPos += 5;
  doc.text(`Country of Origin: INDIA`, 15, yPos);
  doc.text(`Terms of Payment: ${data.paymentTerms}`, 110, yPos);
  yPos += 8;
  
  // Marks and packages
  doc.setFont('helvetica', 'bold');
  doc.text('Marks & Nos.:', 15, yPos);
  doc.text('Kind of Packages:', 80, yPos);
  doc.text('Gross Weight (Kgs):', 150, yPos);
  yPos += 5;
  
  doc.setFont('helvetica', 'normal');
  doc.text(data.marks, 15, yPos);
  doc.text(data.kindOfPackages, 80, yPos);
  doc.text(data.grossWeight.toFixed(3), 150, yPos);
  yPos += 8;
  
  // Line items table
  const tableData = data.lineItems.map(item => [
    item.srNo.toString(),
    item.description + (item.hsCode ? `\n(${item.hsCode})` : ''),
    item.quantity.toString(),
    `$${item.rate.toFixed(4)}`,
    `$${item.total.toFixed(2)}`
  ]);
  
  autoTable(doc, {
    startY: yPos,
    head: [['Sr. No.', 'Description of Goods', 'Quantity (Pcs)', 'Rate (USD/Pc)', 'Total Amount']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [66, 66, 66], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 15 },
      1: { cellWidth: 80 },
      2: { cellWidth: 30, halign: 'right' },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 30, halign: 'right' }
    },
    margin: { left: 15, right: 15 }
  });
  
  yPos = (doc as any).lastAutoTable.finalY + 5;
  
  // Totals
  const totalAmount = data.lineItems.reduce((sum, item) => sum + item.total, 0);
  const netAmount = totalAmount - data.advance;
  const currency = data.currency || 'USD';
  
  doc.setFont('helvetica', 'bold');
  doc.text(`TOTAL ${currency}:`, 135, yPos);
  doc.text(`$${totalAmount.toFixed(2)}`, 180, yPos, { align: 'right' });
  yPos += 5;
  
  doc.text(`LESS: ADVANCE:`, 135, yPos);
  doc.text(`-$${data.advance.toFixed(2)}`, 180, yPos, { align: 'right' });
  yPos += 5;
  
  doc.setFontSize(10);
  doc.text(`NET ${currency}:`, 135, yPos);
  doc.text(`$${netAmount.toFixed(2)}`, 180, yPos, { align: 'right' });
  yPos += 8;
  
  // Amount in words
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const amountInWords = convertToWords(netAmount);
  doc.text(`Amount ${currency} $ (In words): ${amountInWords} Dollars`, 15, yPos);
  yPos += 8;
  
  // Declaration
  doc.setFont('helvetica', 'bold');
  doc.text('Declaration:', 15, yPos);
  yPos += 4;
  doc.setFont('helvetica', 'normal');
  doc.text('We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.', 15, yPos, { maxWidth: 180 });
  yPos += 15;
  
  // Signature
  doc.setFont('helvetica', 'bold');
  doc.text('For, R V INDUSTRIES', 15, yPos);
  yPos += 10;
  doc.text('PROPRIETOR', 15, yPos);
  doc.text(`DATE: ${data.date}`, 150, yPos);
  
  addFooter(doc, 1, 1);
  
  return doc;
};

export const generatePackingList = (data: PackingListData): jsPDF => {
  const doc = new jsPDF();
  let yPos = addLetterhead(doc);
  
  // Document title
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('PACKING LIST', 105, yPos, { align: 'center' });
  yPos += 8;
  
  // Invoice details
  doc.setFontSize(9);
  doc.text(`Invoice No.: ${data.invoiceNo}`, 15, yPos);
  doc.text(`Date: ${data.date}`, 150, yPos);
  yPos += 6;
  
  doc.text(`P.I. No.: ${data.piNo}`, 15, yPos);
  doc.text(`Date: ${data.piDate}`, 150, yPos);
  yPos += 8;
  
  // Consignee and Notify Party
  doc.setFont('helvetica', 'bold');
  doc.text('Consignee (SHIP TO):', 15, yPos);
  doc.text('Notify Party (BILL TO):', 110, yPos);
  yPos += 5;
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const consigneeLines = doc.splitTextToSize(data.consignee.name + '\n' + data.consignee.address, 90);
  const notifyLines = doc.splitTextToSize(data.notifyParty.name + '\n' + data.notifyParty.address, 90);
  
  consigneeLines.forEach((line: string) => {
    doc.text(line, 15, yPos);
    yPos += 4;
  });
  
  let notifyYPos = yPos - (consigneeLines.length * 4);
  notifyLines.forEach((line: string) => {
    doc.text(line, 110, notifyYPos);
    notifyYPos += 4;
  });
  
  yPos = Math.max(yPos, notifyYPos) + 5;
  
  // Shipping details
  doc.setFontSize(8);
  doc.text(`Port of Loading: ${data.portOfLoading}`, 15, yPos);
  doc.text(`Port of Discharge: ${data.portOfDischarge}`, 110, yPos);
  yPos += 5;
  doc.text(`Vessel/Flight No.: ${data.vessel}`, 15, yPos);
  doc.text(`Final Destination: ${data.finalDestination}`, 110, yPos);
  yPos += 5;
  doc.text(`Terms of Payment: ${data.paymentTerms}`, 15, yPos);
  yPos += 8;
  
  // Marks and description
  doc.setFont('helvetica', 'bold');
  doc.text('Marks & Nos.:', 15, yPos);
  doc.text('Description of Goods:', 60, yPos);
  doc.text('Kind of Packages:', 130, yPos);
  yPos += 5;
  
  doc.setFont('helvetica', 'normal');
  doc.text(data.marks, 15, yPos);
  doc.text(data.description, 60, yPos);
  doc.text(data.kindOfPackages, 130, yPos);
  yPos += 8;
  
  // Packing details table
  const tableData = data.lineItems.map(item => [
    item.palletNo,
    item.boxNos,
    item.totalBoxes.toString(),
    item.pcsPerBox.toString(),
    item.itemName,
    item.totalPcs.toString(),
    item.grossWeight.toFixed(3)
  ]);
  
  autoTable(doc, {
    startY: yPos,
    head: [['Pallet No.', 'Box Nos.', 'Total Boxes', 'Pcs/Box', 'Name of Items', 'Total Pcs', 'Gross Wt (Kgs)']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [66, 66, 66], fontSize: 7, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 25 },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 60 },
      5: { cellWidth: 20, halign: 'right' },
      6: { cellWidth: 22, halign: 'right' }
    },
    margin: { left: 15, right: 15 }
  });
  
  yPos = (doc as any).lastAutoTable.finalY + 5;
  
  // Grand totals
  const totalPcs = data.lineItems.reduce((sum, item) => sum + item.totalPcs, 0);
  const totalWeight = data.lineItems.reduce((sum, item) => sum + item.grossWeight, 0);
  
  doc.setFont('helvetica', 'bold');
  doc.text('GRAND TOTAL:', 135, yPos);
  doc.text(`${totalPcs} PCS`, 165, yPos);
  doc.text(`${totalWeight.toFixed(3)} KGS`, 180, yPos, { align: 'right' });
  yPos += 15;
  
  // Signature
  doc.text('For, R V INDUSTRIES', 15, yPos);
  yPos += 10;
  doc.text('PROPRIETOR', 15, yPos);
  doc.text(`DATE: ${data.date}`, 150, yPos);
  
  addFooter(doc, 1, 1);
  
  return doc;
};

// Helper function to convert numbers to words (simplified version)
function convertToWords(amount: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  
  let intPart = Math.floor(amount);
  const decPart = Math.round((amount - intPart) * 100);
  
  let words = '';
  
  if (intPart === 0) {
    words = 'Zero';
  } else {
    if (intPart >= 1000) {
      const thousands = Math.floor(intPart / 1000);
      words += convertThousands(thousands, ones, teens, tens) + ' Thousand ';
      intPart %= 1000;
    }
    
    if (intPart >= 100) {
      words += ones[Math.floor(intPart / 100)] + ' Hundred ';
      intPart %= 100;
    }
    
    if (intPart >= 20) {
      words += tens[Math.floor(intPart / 10)] + ' ';
      intPart %= 10;
    } else if (intPart >= 10) {
      words += teens[intPart - 10] + ' ';
      intPart = 0;
    }
    
    if (intPart > 0) {
      words += ones[intPart] + ' ';
    }
  }
  
  if (decPart > 0) {
    words += 'and ' + decPart + '/100';
  } else {
    words += 'and No Cents';
  }
  
  return words.trim();
}

function convertThousands(num: number, ones: string[], teens: string[], tens: string[]): string {
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
}
