import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import rvLogoHighRes from '@/assets/rv-logo-high-res.png';

interface ProformaLineItem {
  sr_no: number;
  item_code: string;
  description?: string;
  material_grade?: string;
  quantity: number;
  unit?: string;
  price_per_pc?: number;
  line_amount?: number;
  hs_code?: string;
}

interface ProformaInvoiceData {
  proformaNo: string;
  date: string;
  customer: {
    name: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    pincode?: string;
    gst_number?: string;
    contact_name?: string;
    contact_email?: string;
    contact_phone?: string;
  };
  poNumber?: string;
  poDate?: string;
  soId?: string;
  items: ProformaLineItem[];
  currency: string;
  subtotal: number;
  gstPercent?: number;
  gstAmount?: number;
  totalAmount: number;
  
  // Payment terms
  advancePercent?: number;
  advanceAmount?: number;
  balanceTerms?: string;
  paymentTermsDays?: number;
  
  // Export vs Domestic
  isExport: boolean;
  incoterm?: string;
  portOfLoading?: string;
  portOfDischarge?: string;
  countryOfOrigin?: string;
  hsCode?: string;
  
  // Metadata
  validityDays?: number;
  notes?: string;
}

// RV Industries Brand Colors (from company banner)
const BRAND_COLORS = {
  primary: [30, 74, 141] as [number, number, number],   // Brand Blue #1E4A8D
  accent: [211, 47, 47] as [number, number, number],    // Brand Red #D32F2F
  dark: [33, 33, 33] as [number, number, number],
  light: [245, 245, 245] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

const drawHeader = (doc: jsPDF, pageWidth: number): number => {
  let yPos = 15;
  
  // Add RV Industries Logo (high resolution PNG)
  try {
    doc.addImage(rvLogoHighRes, 'PNG', 14, yPos - 5, 28, 14);
  } catch {
    // Fallback if logo fails to load
    doc.setFillColor(...BRAND_COLORS.primary);
    doc.rect(14, yPos - 5, 25, 14, 'F');
    doc.setTextColor(...BRAND_COLORS.white);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("RV", 26.5, yPos + 5, { align: "center" });
  }
  
  // Company Name and Tagline
  doc.setTextColor(...BRAND_COLORS.primary);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("R.V. INDUSTRIES", 45, yPos + 3);
  
  doc.setFontSize(9);
  doc.setTextColor(...BRAND_COLORS.dark);
  doc.setFont("helvetica", "normal");
  doc.text("Precision Brass Components", 45, yPos + 9);
  
  // Address
  doc.setFontSize(8);
  doc.text("Plot No 11, 12/1 & 12/2, Sadguru Industrial Area, Jamnagar - 361006 (Gujarat) India", 45, yPos + 15);
  
  // Certifications (right side) - with brand colors
  const certX = pageWidth - 14;
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND_COLORS.primary);
  doc.text("ISO 9001:2015", certX, yPos, { align: "right" });
  doc.setTextColor(...BRAND_COLORS.accent);
  doc.text("TÜV SÜD CERTIFIED", certX, yPos + 5, { align: "right" });
  doc.setTextColor(...BRAND_COLORS.primary);
  doc.text("RoHS COMPLIANT", certX, yPos + 10, { align: "right" });
  doc.setTextColor(...BRAND_COLORS.accent);
  doc.text("CE MARKED", certX, yPos + 15, { align: "right" });
  
  // Horizontal line with dual brand colors
  yPos += 22;
  doc.setDrawColor(...BRAND_COLORS.primary);
  doc.setLineWidth(1.5);
  doc.line(14, yPos, pageWidth / 2, yPos);
  doc.setDrawColor(...BRAND_COLORS.accent);
  doc.line(pageWidth / 2, yPos, pageWidth - 14, yPos);
  
  return yPos + 5;
};

const drawProformaTitle = (doc: jsPDF, pageWidth: number, yPos: number): number => {
  doc.setFillColor(...BRAND_COLORS.primary);
  doc.rect(14, yPos, pageWidth - 28, 10, 'F');
  
  doc.setTextColor(...BRAND_COLORS.white);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("PROFORMA INVOICE", pageWidth / 2, yPos + 7, { align: "center" });
  
  return yPos + 15;
};

export const generateEnhancedProformaInvoice = (data: ProformaInvoiceData): jsPDF => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const leftCol = 14;
  const rightCol = pageWidth / 2 + 5;
  
  // === HEADER ===
  let yPos = drawHeader(doc, pageWidth);
  
  // === PROFORMA TITLE ===
  yPos = drawProformaTitle(doc, pageWidth, yPos);
  
  // === PROFORMA DETAILS (2 columns) ===
  doc.setTextColor(...BRAND_COLORS.dark);
  doc.setFontSize(9);
  
  // Left column
  doc.setFont("helvetica", "bold");
  doc.text("Proforma Invoice No:", leftCol, yPos);
  doc.setFont("helvetica", "normal");
  doc.text(data.proformaNo, leftCol + 40, yPos);
  
  // Right column
  doc.setFont("helvetica", "bold");
  doc.text("Date:", rightCol, yPos);
  doc.setFont("helvetica", "normal");
  doc.text(data.date, rightCol + 15, yPos);
  
  yPos += 5;
  if (data.soId) {
    doc.setFont("helvetica", "bold");
    doc.text("Sales Order No:", leftCol, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(data.soId, leftCol + 40, yPos);
  }
  
  if (data.validityDays) {
    doc.setFont("helvetica", "bold");
    doc.text("Valid Until:", rightCol, yPos);
    doc.setFont("helvetica", "normal");
    const validDate = new Date();
    validDate.setDate(validDate.getDate() + data.validityDays);
    doc.text(validDate.toLocaleDateString('en-GB'), rightCol + 25, yPos);
  }
  
  yPos += 5;
  if (data.poNumber) {
    doc.setFont("helvetica", "bold");
    doc.text("Customer PO No:", leftCol, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(data.poNumber, leftCol + 40, yPos);
  }
  
  if (data.poDate) {
    doc.setFont("helvetica", "bold");
    doc.text("PO Date:", rightCol, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(data.poDate, rightCol + 20, yPos);
  }
  
  // === CUSTOMER DETAILS ===
  yPos += 10;
  doc.setFillColor(...BRAND_COLORS.light);
  doc.rect(leftCol, yPos - 3, pageWidth - 28, 30, 'F');
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND_COLORS.primary);
  doc.text("Bill To:", leftCol + 2, yPos + 2);
  
  yPos += 7;
  doc.setTextColor(...BRAND_COLORS.dark);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(data.customer.name, leftCol + 2, yPos);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  
  if (data.customer.address) {
    yPos += 5;
    doc.text(data.customer.address, leftCol + 2, yPos);
  }
  
  const location = [data.customer.city, data.customer.state, data.customer.pincode]
    .filter(Boolean).join(', ');
  if (location) {
    yPos += 5;
    doc.text(location, leftCol + 2, yPos);
  }
  
  if (data.customer.country) {
    yPos += 5;
    doc.text(data.customer.country, leftCol + 2, yPos);
  }
  
  // GST on the right side of customer box
  if (data.customer.gst_number && !data.isExport) {
    doc.setFont("helvetica", "bold");
    doc.text("GST No:", rightCol, yPos - 10);
    doc.setFont("helvetica", "normal");
    doc.text(data.customer.gst_number, rightCol + 18, yPos - 10);
  }
  
  // === ITEMS TABLE ===
  yPos += 10;
  
  const tableHeaders = data.isExport 
    ? [['Sr', 'Item Code', 'Description / Material', 'HS Code', 'Qty', 'Unit', `Rate (${data.currency})`, `Amount (${data.currency})`]]
    : [['Sr', 'Item Code', 'Description / Material Grade', 'Qty', 'Unit', `Rate (${data.currency})`, `Amount (${data.currency})`]];
  
  const tableData = data.items.map((item, index) => {
    const desc = [item.description, item.material_grade].filter(Boolean).join(' - ') || 'As per specification';
    const baseRow = [
      (index + 1).toString(),
      item.item_code || '-',
      desc,
    ];
    
    if (data.isExport) {
      return [
        ...baseRow,
        item.hs_code || data.hsCode || '-',
        item.quantity?.toString() || '0',
        item.unit || 'PCS',
        item.price_per_pc ? item.price_per_pc.toFixed(4) : '-',
        item.line_amount ? item.line_amount.toFixed(2) : '-'
      ];
    }
    
    return [
      ...baseRow,
      item.quantity?.toString() || '0',
      item.unit || 'PCS',
      item.price_per_pc ? item.price_per_pc.toFixed(4) : '-',
      item.line_amount ? item.line_amount.toFixed(2) : '-'
    ];
  });
  
  const columnStyles = data.isExport ? {
    0: { cellWidth: 12, halign: 'center' as const },
    1: { cellWidth: 25 },
    2: { cellWidth: 45 },
    3: { cellWidth: 20 },
    4: { cellWidth: 18, halign: 'right' as const },
    5: { cellWidth: 15, halign: 'center' as const },
    6: { cellWidth: 22, halign: 'right' as const },
    7: { cellWidth: 25, halign: 'right' as const }
  } : {
    0: { cellWidth: 12, halign: 'center' as const },
    1: { cellWidth: 30 },
    2: { cellWidth: 55 },
    3: { cellWidth: 18, halign: 'right' as const },
    4: { cellWidth: 15, halign: 'center' as const },
    5: { cellWidth: 25, halign: 'right' as const },
    6: { cellWidth: 27, halign: 'right' as const }
  };
  
  autoTable(doc, {
    head: tableHeaders,
    body: tableData,
    startY: yPos,
    theme: 'grid',
    styles: { 
      fontSize: 8,
      cellPadding: 2
    },
    headStyles: { 
      fillColor: BRAND_COLORS.primary,
      textColor: BRAND_COLORS.white,
      fontStyle: 'bold',
      halign: 'center'
    },
    columnStyles
  });
  
  // === TOTALS SECTION ===
  yPos = (doc as any).lastAutoTable.finalY + 8;
  
  const totalsX = pageWidth - 75;
  const totalsWidth = 60;
  
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  
  // Subtotal
  doc.text("Subtotal:", totalsX, yPos);
  doc.text(`${data.currency} ${data.subtotal.toFixed(2)}`, totalsX + totalsWidth, yPos, { align: 'right' });
  
  // GST (for domestic only)
  if (!data.isExport && data.gstPercent && data.gstPercent > 0) {
    yPos += 5;
    doc.text(`GST (${data.gstPercent}%):`, totalsX, yPos);
    doc.text(`${data.currency} ${(data.gstAmount || 0).toFixed(2)}`, totalsX + totalsWidth, yPos, { align: 'right' });
  }
  
  // Total
  yPos += 5;
  doc.setLineWidth(0.3);
  doc.line(totalsX, yPos, totalsX + totalsWidth, yPos);
  yPos += 4;
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("TOTAL:", totalsX, yPos);
  doc.text(`${data.currency} ${data.totalAmount.toFixed(2)}`, totalsX + totalsWidth, yPos, { align: 'right' });
  
  // === PAYMENT TERMS ===
  yPos += 12;
  doc.setFillColor(...BRAND_COLORS.light);
  doc.rect(leftCol, yPos - 3, (pageWidth - 28) / 2 - 5, 35, 'F');
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND_COLORS.primary);
  doc.text("Payment Terms", leftCol + 2, yPos + 2);
  
  yPos += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND_COLORS.dark);
  
  if (data.advancePercent && data.advancePercent > 0) {
    doc.text(`Advance: ${data.advancePercent}% (${data.currency} ${(data.advanceAmount || 0).toFixed(2)})`, leftCol + 2, yPos);
    yPos += 5;
    const balance = data.totalAmount - (data.advanceAmount || 0);
    doc.text(`Balance: ${data.currency} ${balance.toFixed(2)}`, leftCol + 2, yPos);
  }
  
  if (data.balanceTerms) {
    yPos += 5;
    doc.text(`Terms: ${data.balanceTerms}`, leftCol + 2, yPos);
  } else if (data.paymentTermsDays) {
    yPos += 5;
    doc.text(`Net ${data.paymentTermsDays} days`, leftCol + 2, yPos);
  }
  
  // === EXPORT DETAILS (only for export) ===
  if (data.isExport) {
    const exportBoxY = (doc as any).lastAutoTable.finalY + 17;
    doc.setFillColor(...BRAND_COLORS.light);
    doc.rect(pageWidth / 2, exportBoxY - 3, (pageWidth - 28) / 2 - 5, 35, 'F');
    
    let expY = exportBoxY;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND_COLORS.primary);
    doc.text("Export Details", pageWidth / 2 + 2, expY + 2);
    
    expY += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND_COLORS.dark);
    
    if (data.incoterm) {
      doc.text(`Incoterms: ${data.incoterm}`, pageWidth / 2 + 2, expY);
      expY += 5;
    }
    
    if (data.portOfLoading) {
      doc.text(`Port of Loading: ${data.portOfLoading}`, pageWidth / 2 + 2, expY);
      expY += 5;
    }
    
    if (data.portOfDischarge) {
      doc.text(`Port of Discharge: ${data.portOfDischarge}`, pageWidth / 2 + 2, expY);
      expY += 5;
    }
    
    doc.text(`Country of Origin: ${data.countryOfOrigin || 'India'}`, pageWidth / 2 + 2, expY);
  }
  
  // === BANK DETAILS ===
  yPos = Math.max(yPos + 20, (doc as any).lastAutoTable.finalY + 55);
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND_COLORS.primary);
  doc.text("Bank Details for Remittance", leftCol, yPos);
  
  yPos += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...BRAND_COLORS.dark);
  
  const bankDetails = [
    "Account Name: R.V. INDUSTRIES",
    "Bank Name: BANK OF BARODA",
    "Account No: 25970500001613",
    "Branch: S.S.I. Jamnagar",
    "IFSC Code: BARB0SSIJAM (5th character is Zero)",
    "Swift Code: BARBINBBRAN"
  ];
  
  bankDetails.forEach(detail => {
    doc.text(detail, leftCol, yPos);
    yPos += 4;
  });
  
  // === NOTES ===
  if (data.notes) {
    yPos += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Notes:", leftCol, yPos);
    doc.setFont("helvetica", "normal");
    yPos += 4;
    doc.text(data.notes, leftCol, yPos);
  }
  
  // === FOOTER ===
  const footerY = doc.internal.pageSize.height - 20;
  
  doc.setDrawColor(...BRAND_COLORS.primary);
  doc.setLineWidth(0.5);
  doc.line(14, footerY - 5, pageWidth - 14, footerY - 5);
  
  doc.setFontSize(8);
  doc.setTextColor(...BRAND_COLORS.dark);
  doc.setFont("helvetica", "normal");
  doc.text("Email: sales@brasspartsindia.net | mitul@brasspartsindia.net", pageWidth / 2, footerY, { align: "center" });
  doc.text("Web: www.brasspartsindia.net | Ph: +91-288-2541871", pageWidth / 2, footerY + 4, { align: "center" });
  
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text("This is a computer-generated Proforma Invoice and is valid without signature.", pageWidth / 2, footerY + 10, { align: "center" });
  
  return doc;
};

// Wrapper function for backward compatibility
export const generateProformaFromSalesOrder = (salesOrder: any, customer: any): jsPDF => {
  // Parse items from sales order
  let items: ProformaLineItem[] = [];
  if (salesOrder.items) {
    const parsedItems = typeof salesOrder.items === 'string' 
      ? JSON.parse(salesOrder.items) 
      : salesOrder.items;
    
    items = (parsedItems || []).map((item: any, index: number) => ({
      sr_no: index + 1,
      item_code: item.item_code || '-',
      description: item.drawing_number || '',
      material_grade: [item.alloy, item.material_size_mm].filter(Boolean).join(' '),
      quantity: Number(item.quantity) || 0,
      unit: 'PCS',
      price_per_pc: item.price_per_pc ? Number(item.price_per_pc) : undefined,
      line_amount: item.line_amount ? Number(item.line_amount) : undefined
    }));
  }
  
  const subtotal = items.reduce((sum, item) => sum + (item.line_amount || 0), 0);
  const isExport = customer?.is_export_customer || customer?.gst_type === 'export';
  const gstPercent = isExport ? 0 : 18;
  const gstAmount = (subtotal * gstPercent) / 100;
  const totalAmount = subtotal + gstAmount;
  
  // Calculate advance
  let advancePercent = 0;
  let advanceAmount = 0;
  if (salesOrder.advance_payment) {
    if (salesOrder.advance_payment.type === 'percentage') {
      advancePercent = salesOrder.advance_payment.value || 0;
      advanceAmount = salesOrder.advance_payment.calculated_amount || (totalAmount * advancePercent / 100);
    } else {
      advanceAmount = salesOrder.advance_payment.value || salesOrder.advance_payment.calculated_amount || 0;
      advancePercent = totalAmount > 0 ? (advanceAmount / totalAmount) * 100 : 0;
    }
  }
  
  const proformaData: ProformaInvoiceData = {
    proformaNo: `${salesOrder.so_id}-PI`,
    date: new Date().toLocaleDateString('en-GB'),
    soId: salesOrder.so_id,
    customer: {
      name: customer?.customer_name || salesOrder.customer || 'Customer',
      address: customer?.address_line_1,
      city: customer?.city,
      state: customer?.state,
      country: customer?.country,
      pincode: customer?.pincode,
      gst_number: customer?.gst_number,
      contact_name: customer?.primary_contact_name,
      contact_email: customer?.primary_contact_email,
      contact_phone: customer?.primary_contact_phone
    },
    poNumber: salesOrder.po_number,
    poDate: salesOrder.po_date 
      ? new Date(salesOrder.po_date).toLocaleDateString('en-GB')
      : undefined,
    items,
    currency: salesOrder.currency || 'USD',
    subtotal,
    gstPercent,
    gstAmount,
    totalAmount,
    advancePercent,
    advanceAmount,
    balanceTerms: salesOrder.advance_payment?.balance_terms || undefined,
    paymentTermsDays: salesOrder.payment_terms_days,
    isExport,
    incoterm: salesOrder.incoterm,
    portOfLoading: undefined, // Can be added to SO later
    portOfDischarge: undefined,
    countryOfOrigin: 'India',
    validityDays: 30,
    notes: undefined
  };
  
  return generateEnhancedProformaInvoice(proformaData);
};

// Legacy function for backward compatibility
export const generateProformaInvoice = (data: any): jsPDF => {
  return generateProformaFromSalesOrder(data, null);
};
