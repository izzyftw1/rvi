import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ProformaInvoiceData {
  proformaNo: string;
  date: string;
  customer: {
    name: string;
    address: string;
    city: string;
    attention?: string;
    phone?: string;
  };
  poNumber: string;
  poDate: string;
  items: Array<{
    srNo: number;
    description: string;
    material: string;
    quantity: number;
    pricePerPc: number;
    totalAmount: number;
  }>;
  currency: string;
  paymentTerms: string;
  delivery: string;
  incoterms: string;
  quantityTolerance: string;
}

export const generateProformaInvoice = (data: ProformaInvoiceData): jsPDF => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  
  // Company Header - RV INDUSTRIES Logo and Certifications
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("RV INDUSTRIES", pageWidth / 2, 20, { align: "center" });
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Manufacturer of HIGH PRECISION Brass Components", pageWidth / 2, 27, { align: "center" });
  
  // ISO, TUV, ROHS badges (text representation)
  doc.setFontSize(8);
  doc.text("ISO 9001:2015 | TÜV SÜD | RoHS Compliant", pageWidth / 2, 33, { align: "center" });
  
  // Date
  doc.setFontSize(10);
  doc.text(`Date: ${data.date}`, 14, 45);
  
  // Customer Details
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("To", 14, 55);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  let yPos = 60;
  doc.text(data.customer.name, 14, yPos);
  yPos += 5;
  doc.text(data.customer.address, 14, yPos);
  yPos += 5;
  doc.text(data.customer.city, 14, yPos);
  
  if (data.customer.attention) {
    yPos += 7;
    doc.setFont("helvetica", "bold");
    doc.text(`Kind Attn: ${data.customer.attention}`, 14, yPos);
    doc.setFont("helvetica", "normal");
  }
  
  if (data.customer.phone) {
    yPos += 5;
    doc.text(`Ph- ${data.customer.phone}`, 14, yPos);
  }
  
  // Proforma Invoice Number
  yPos += 10;
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(`Proforma Invoice No. ${data.proformaNo}`, 14, yPos);
  
  // Items Table
  yPos += 10;
  const tableHeaders = [['Sr. No.', 'Description', 'Material', 'Quantity', `Price/Pc (${data.currency})`, `Total Amount ${data.currency}`]];
  
  const tableData = data.items.map(item => [
    item.srNo.toString(),
    item.description,
    item.material,
    item.quantity.toString(),
    `$ ${item.pricePerPc.toFixed(2)}`,
    `$ ${item.totalAmount.toFixed(2)}`
  ]);
  
  // Calculate totals
  const totalAmount = data.items.reduce((sum, item) => sum + item.totalAmount, 0);
  
  // Add summary rows
  tableData.push(['', '', '', '', 'Total Amount', `$ ${totalAmount.toFixed(2)}`]);
  tableData.push(['', '', '', '', data.paymentTerms, `$ ${totalAmount.toFixed(2)}`]);
  
  autoTable(doc, {
    head: tableHeaders,
    body: tableData,
    startY: yPos,
    theme: 'grid',
    styles: { fontSize: 9 },
    headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 60 },
      2: { cellWidth: 25 },
      3: { cellWidth: 25 },
      4: { cellWidth: 30 },
      5: { cellWidth: 30 }
    }
  });
  
  // Terms Section
  yPos = doc.lastAutoTable.finalY + 10;
  
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Terms", 14, yPos);
  
  yPos += 7;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  
  const terms = [
    `PO Number: ${data.poNumber}`,
    `Dated: ${data.poDate}`,
    `Material: ${data.items[0]?.material || 'As per specification'}`,
    `Delivery: ${data.delivery}`,
    `Payment: ${data.paymentTerms}`,
    `Inco Terms: ${data.incoterms || '-'}`,
    `Quantity (+ -): ${data.quantityTolerance || '10% quantity or value plus/minus can happen at the time of production.'}`
  ];
  
  terms.forEach(term => {
    doc.text(term, 14, yPos);
    yPos += 5;
  });
  
  // Bank Details
  yPos += 5;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Bank Details", 14, yPos);
  
  yPos += 7;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  
  const bankDetails = [
    "Account Name: RV INDUSTRIES",
    "Bank Name: BANK OF BARODA",
    "Account No: 25970500001613",
    "Swift Code: BARBINBBRAN",
    "IFSC Code: BARB0SSIJAM (5th character is Zero)"
  ];
  
  bankDetails.forEach(detail => {
    doc.text(detail, 14, yPos);
    yPos += 5;
  });
  
  // Footer - Company Contact Details
  const footerY = doc.internal.pageSize.height - 20;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  
  doc.text("RV INDUSTRIES", pageWidth / 2, footerY, { align: "center" });
  doc.text("K-1/212, G.I.D.C. Shankar Tekri, Udyognagar, Jamnagar - 4. (Guj) India", pageWidth / 2, footerY + 4, { align: "center" });
  doc.text("Mail: mitul@brasspartsindia.net | sales@brasspartsindia.net | brassinserts@gmail.com", pageWidth / 2, footerY + 8, { align: "center" });
  doc.text("Web: www.brasspartsindia.net", pageWidth / 2, footerY + 12, { align: "center" });
  
  return doc;
};

export const generateProformaFromSalesOrder = (salesOrder: any, customer: any): jsPDF => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  let yPos = 20;
  
  // === HEADER SECTION ===
  // Company Logo and Name
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("R.V. INDUSTRIES", pageWidth / 2, yPos, { align: "center" });
  
  yPos += 6;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Manufacturer of HIGH PRECISION Brass & Stainless Steel Components", pageWidth / 2, yPos, { align: "center" });
  
  yPos += 5;
  doc.setFontSize(8);
  doc.text("K-1/212, G.I.D.C. Shankar Tekri, Udyognagar, Jamnagar - 361004 (Gujarat) India", pageWidth / 2, yPos, { align: "center" });
  
  yPos += 4;
  doc.text("Email: sales@brasspartsindia.net | Web: www.brasspartsindia.net", pageWidth / 2, yPos, { align: "center" });
  
  yPos += 4;
  doc.text("ISO 9001:2015 | TÜV SÜD | RoHS Compliant", pageWidth / 2, yPos, { align: "center" });
  
  // Horizontal line
  yPos += 5;
  doc.setLineWidth(0.5);
  doc.line(14, yPos, pageWidth - 14, yPos);
  
  // === PROFORMA DETAILS ===
  yPos += 8;
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("PROFORMA INVOICE", pageWidth / 2, yPos, { align: "center" });
  
  yPos += 10;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  
  // Left column: Proforma details
  const leftCol = 14;
  const rightCol = pageWidth / 2 + 10;
  
  doc.setFont("helvetica", "bold");
  doc.text("Proforma Invoice No:", leftCol, yPos);
  doc.setFont("helvetica", "normal");
  doc.text(`${salesOrder.so_id}-PI`, leftCol + 45, yPos);
  
  doc.setFont("helvetica", "bold");
  doc.text("Date:", rightCol, yPos);
  doc.setFont("helvetica", "normal");
  doc.text(new Date().toLocaleDateString('en-GB').replace(/\//g, '-'), rightCol + 15, yPos);
  
  yPos += 6;
  doc.setFont("helvetica", "bold");
  doc.text("Sales Order No:", leftCol, yPos);
  doc.setFont("helvetica", "normal");
  doc.text(salesOrder.so_id || 'N/A', leftCol + 45, yPos);
  
  doc.setFont("helvetica", "bold");
  doc.text("PO Date:", rightCol, yPos);
  doc.setFont("helvetica", "normal");
  doc.text(
    salesOrder.po_date 
      ? new Date(salesOrder.po_date).toLocaleDateString('en-GB').replace(/\//g, '-')
      : 'N/A',
    rightCol + 15,
    yPos
  );
  
  yPos += 6;
  doc.setFont("helvetica", "bold");
  doc.text("Customer PO No:", leftCol, yPos);
  doc.setFont("helvetica", "normal");
  doc.text(salesOrder.po_number || 'N/A', leftCol + 45, yPos);
  
  // === CUSTOMER DETAILS ===
  yPos += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Bill To:", leftCol, yPos);
  
  yPos += 6;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(customer?.customer_name || salesOrder.customer || 'Customer Name', leftCol, yPos);
  
  if (customer?.address_line_1) {
    yPos += 5;
    doc.text(customer.address_line_1, leftCol, yPos);
  }
  
  if (customer?.city || customer?.state) {
    yPos += 5;
    const location = [customer?.city, customer?.state, customer?.pincode].filter(Boolean).join(', ');
    doc.text(location, leftCol, yPos);
  }
  
  if (customer?.country) {
    yPos += 5;
    doc.text(customer.country, leftCol, yPos);
  }
  
  if (customer?.gst_number) {
    yPos += 5;
    doc.setFont("helvetica", "bold");
    doc.text("GST No: ", leftCol, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(customer.gst_number, leftCol + 18, yPos);
  }
  
  // === ITEMS TABLE ===
  yPos += 10;
  
  // Parse items
  let items = [];
  if (salesOrder.items) {
    if (typeof salesOrder.items === 'string') {
      try {
        items = JSON.parse(salesOrder.items);
      } catch (e) {
        items = [];
      }
    } else if (Array.isArray(salesOrder.items)) {
      items = salesOrder.items;
    }
  }
  
  const tableHeaders = [
    ['Sr No', 'Item Code', 'Description', 'Qty', 'Unit', `Unit Price\n(${salesOrder.currency || 'USD'})`, `Amount\n(${salesOrder.currency || 'USD'})`]
  ];
  
  const tableData = items.map((item: any, index: number) => [
    (index + 1).toString(),
    item.item_code || '-',
    `${item.alloy || ''} ${item.material_size_mm || ''}`.trim() || 'As per spec',
    item.quantity?.toString() || '0',
    'PCS',
    item.price_per_pc ? Number(item.price_per_pc).toFixed(4) : '0.0000',
    item.line_amount ? Number(item.line_amount).toFixed(2) : '0.00'
  ]);
  
  autoTable(doc, {
    head: tableHeaders,
    body: tableData,
    startY: yPos,
    theme: 'grid',
    styles: { 
      fontSize: 9,
      cellPadding: 3
    },
    headStyles: { 
      fillColor: [70, 70, 70],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center'
    },
    columnStyles: {
      0: { cellWidth: 15, halign: 'center' },
      1: { cellWidth: 30 },
      2: { cellWidth: 50 },
      3: { cellWidth: 20, halign: 'right' },
      4: { cellWidth: 20, halign: 'center' },
      5: { cellWidth: 25, halign: 'right' },
      6: { cellWidth: 30, halign: 'right' }
    }
  });
  
  // === TOTALS SECTION ===
  yPos = (doc as any).lastAutoTable.finalY + 10;
  
  const subtotal = items.reduce((sum: number, item: any) => sum + (Number(item.line_amount) || 0), 0);
  const gstPercent = customer?.gst_type === 'domestic' ? 18 : 0;
  const gstAmount = (subtotal * gstPercent) / 100;
  const total = subtotal + gstAmount;
  
  // Totals box on the right
  const totalsX = pageWidth - 80;
  const totalsWidth = 66;
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  
  // Subtotal
  doc.text("Subtotal:", totalsX, yPos);
  doc.text(`${salesOrder.currency || 'USD'} ${subtotal.toFixed(2)}`, totalsX + totalsWidth, yPos, { align: 'right' });
  
  if (gstPercent > 0) {
    yPos += 6;
    doc.text(`GST (${gstPercent}%):`, totalsX, yPos);
    doc.text(`${salesOrder.currency || 'USD'} ${gstAmount.toFixed(2)}`, totalsX + totalsWidth, yPos, { align: 'right' });
  }
  
  yPos += 6;
  doc.setLineWidth(0.3);
  doc.line(totalsX, yPos - 2, totalsX + totalsWidth, yPos - 2);
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Total:", totalsX, yPos);
  doc.text(`${salesOrder.currency || 'USD'} ${total.toFixed(2)}`, totalsX + totalsWidth, yPos, { align: 'right' });
  
  // === PAYMENT SUMMARY ===
  yPos += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Payment Summary:", leftCol, yPos);
  
  yPos += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  
  let advanceAmount = 0;
  if (salesOrder.advance_payment) {
    advanceAmount = salesOrder.advance_payment.calculated_amount || 0;
    const advanceDisplay = salesOrder.advance_payment.type === 'percentage'
      ? `${salesOrder.advance_payment.value}% (${salesOrder.currency || 'USD'} ${advanceAmount.toFixed(2)})`
      : `${salesOrder.currency || 'USD'} ${advanceAmount.toFixed(2)}`;
    
    doc.text("Advance Payment:", leftCol, yPos);
    doc.setFont("helvetica", "bold");
    doc.text(advanceDisplay, leftCol + 50, yPos);
    doc.setFont("helvetica", "normal");
  } else {
    doc.text("Advance Payment:", leftCol, yPos);
    doc.text("Not specified", leftCol + 50, yPos);
  }
  
  yPos += 6;
  const balancePayable = total - advanceAmount;
  doc.text("Balance Payable:", leftCol, yPos);
  doc.setFont("helvetica", "bold");
  doc.text(`${salesOrder.currency || 'USD'} ${balancePayable.toFixed(2)}`, leftCol + 50, yPos);
  
  // === TERMS & CONDITIONS ===
  yPos += 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Terms & Conditions:", leftCol, yPos);
  
  yPos += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  
  const terms = [
    `Incoterms: ${salesOrder.incoterm || 'EXW'}`,
    `Payment Terms: ${salesOrder.payment_terms_days ? `${salesOrder.payment_terms_days} days` : 'As agreed'}`,
    `Delivery: ${salesOrder.expected_delivery_date 
      ? `Expected by ${new Date(salesOrder.expected_delivery_date).toLocaleDateString('en-GB')}`
      : 'As per agreement'}`,
    `Quantity Tolerance: ±10% variation is acceptable`
  ];
  
  terms.forEach(term => {
    doc.text(`• ${term}`, leftCol + 2, yPos);
    yPos += 5;
  });
  
  // === FOOTER ===
  const footerY = doc.internal.pageSize.height - 15;
  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(100, 100, 100);
  doc.text("This is a computer-generated Proforma Invoice.", pageWidth / 2, footerY, { align: "center" });
  
  doc.setFont("helvetica", "normal");
  doc.text("For R.V. Industries | Authorized Signatory", pageWidth / 2, footerY + 5, { align: "center" });
  
  return doc;
};