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
  // Generate proforma number from SO
  const proformaNo = `${salesOrder.so_id}-PI`;
  
  // Parse items - handle both string and array formats
  let items = [];
  if (salesOrder.items) {
    if (typeof salesOrder.items === 'string') {
      try {
        items = JSON.parse(salesOrder.items);
      } catch (e) {
        console.error("Failed to parse items:", e);
        items = [];
      }
    } else if (Array.isArray(salesOrder.items)) {
      items = salesOrder.items;
    }
  }
  
  const proformaItems = items.map((item: any, index: number) => ({
    srNo: index + 1,
    description: `${item.item_code || 'Item'} - ${item.drawing_number || ''}`,
    material: item.alloy || item.material_size_mm || 'As specified',
    quantity: item.quantity || 0,
    pricePerPc: Number(item.price_per_pc || 0),
    totalAmount: Number(item.line_amount || (item.quantity * item.price_per_pc) || 0)
  }));
  
  const data: ProformaInvoiceData = {
    proformaNo: proformaNo,
    date: new Date().toLocaleDateString('en-GB').replace(/\//g, '-'),
    customer: {
      name: customer?.customer_name || salesOrder.customer || 'Customer Name',
      address: customer?.city || salesOrder.customer || '',
      city: customer?.state && customer?.country 
        ? `${customer.state}, ${customer.country}`.trim() 
        : '',
      attention: customer?.primary_contact_name,
      phone: customer?.primary_contact_phone
    },
    poNumber: salesOrder.po_number || 'N/A',
    poDate: salesOrder.po_date 
      ? new Date(salesOrder.po_date).toLocaleDateString('en-GB').replace(/\//g, '-')
      : new Date().toLocaleDateString('en-GB').replace(/\//g, '-'),
    items: proformaItems,
    currency: salesOrder.currency || 'USD',
    paymentTerms: salesOrder.payment_terms_days 
      ? `Payment within ${salesOrder.payment_terms_days} days` 
      : '100% Advance Payment',
    delivery: salesOrder.expected_delivery_date
      ? `${Math.ceil((new Date(salesOrder.expected_delivery_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} Days from the date of PO`
      : '20 Days from the date of PO Copy with advance payment',
    incoterms: salesOrder.incoterm || '-',
    quantityTolerance: '10% quantity or value plus/minus can happen at the time of production.'
  };
  
  return generateProformaInvoice(data);
};