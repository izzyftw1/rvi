import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";
import autoTable from "https://esm.sh/jspdf-autotable@3.8.2";
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

interface ProformaGenerateRequest {
  salesOrderId: string;
}

interface LineItem {
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

interface ProformaData {
  proformaNo: string;
  date: string;
  soId: string;
  customer: {
    name: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    pincode?: string;
    gst_number?: string;
  };
  poNumber?: string;
  poDate?: string;
  items: LineItem[];
  currency: string;
  subtotal: number;
  gstPercent: number;
  gstAmount: number;
  totalAmount: number;
  advancePercent?: number;
  advanceAmount?: number;
  balanceTerms?: string;
  paymentTermsDays?: number;
  isExport: boolean;
  incoterm?: string;
  portOfLoading?: string;
  portOfDischarge?: string;
  countryOfOrigin?: string;
  validityDays?: number;
  notes?: string;
}

// RV Industries Brand Colors
const BRAND_COLORS = {
  primary: '#1E4A8D',      // Brand Blue
  accent: '#D32F2F',       // Brand Red
  dark: '#212121',         // Dark gray for text
  lightBg: '#F5F5F5',      // Light gray for backgrounds
  white: '#FFFFFF',
  tableBorder: '#1E4A8D',
};


interface LetterheadImg { data: string; w: number; h: number }
interface Letterhead {
  header: LetterheadImg | null;
  footer: LetterheadImg | null;
  company: { name: string; address: string; phones: string; email: string; website: string; gstin: string; iec: string; udyam: string };
}

function toBase64(u8: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) binary += String.fromCharCode(...u8.subarray(i, i + chunk));
  return btoa(binary);
}

// deno-lint-ignore no-explicit-any
async function fetchPng(client: any, path: string): Promise<LetterheadImg | null> {
  try {
    const { data, error } = await client.storage.from('branding').download(path);
    if (error || !data) return null;
    const u8 = new Uint8Array(await data.arrayBuffer());
    if (!(u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47)) return null;
    const dv = new DataView(u8.buffer);
    return { data: `data:image/png;base64,${toBase64(u8)}`, w: dv.getUint32(16), h: dv.getUint32(20) };
  } catch {
    return null;
  }
}

// deno-lint-ignore no-explicit-any
async function loadLetterhead(client: any): Promise<Letterhead> {
  const [{ data: s }, header, footer] = await Promise.all([
    client.from('finance_settings').select('*').maybeSingle(),
    fetchPng(client, 'letterhead_header.png'),
    fetchPng(client, 'letterhead_footer.png'),
  ]);
  return {
    header, footer,
    company: {
      name: s?.company_name ?? '', address: s?.company_address ?? '', phones: s?.company_phones ?? '',
      email: s?.company_email ?? '', website: s?.company_website ?? '', gstin: s?.company_gstin ?? '',
      iec: s?.company_iec ?? '', udyam: s?.company_udyam ?? '',
    },
  };
}

async function generateProfessionalPdf(data: ProformaData, lh: Letterhead): Promise<Uint8Array> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const leftMargin = 15;
  const rightMargin = pageWidth - 15;
  const contentWidth = rightMargin - leftMargin;
  let yPos = 12;

  // ============= HEADER (shared letterhead) =============
  const co = lh.company;
  if (lh.header) {
    const hh = (pageWidth * lh.header.h) / lh.header.w;
    doc.addImage(lh.header.data, 'PNG', 0, 0, pageWidth, hh);
    yPos = hh + 2;
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(30, 74, 141);
    doc.text(co.name.toUpperCase(), pageWidth / 2, yPos + 4, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(33, 33, 33);
    doc.text(co.address, pageWidth / 2, yPos + 10, { align: 'center', maxWidth: contentWidth });
    doc.text([co.phones && `Ph: ${co.phones}`, co.email, co.website].filter(Boolean).join(' | '), pageWidth / 2, yPos + 18, { align: 'center' });
    yPos += 22;
    doc.setDrawColor(30, 74, 141);
    doc.setLineWidth(0.6);
    doc.line(leftMargin, yPos, rightMargin, yPos);
  }
  
  // ============= PROFORMA INVOICE TITLE =============
  yPos += 8;
  doc.setFillColor(30, 74, 141);
  doc.rect(leftMargin, yPos, contentWidth, 10, 'F');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('PROFORMA INVOICE', pageWidth / 2, yPos + 7, { align: 'center' });
  
  // ============= DOCUMENT DETAILS =============
  yPos += 18;
  const col1X = leftMargin;
  const col2X = pageWidth / 2 + 5;
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(33, 33, 33);
  
  // Row 1
  doc.text('Proforma Invoice No:', col1X, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text(data.proformaNo, col1X + 45, yPos);
  
  doc.setFont('helvetica', 'bold');
  doc.text('Date:', col2X, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text(data.date, col2X + 20, yPos);
  
  // Row 2
  yPos += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Sales Order No:', col1X, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text(data.soId, col1X + 35, yPos);
  
  if (data.validityDays) {
    const validDate = new Date();
    validDate.setDate(validDate.getDate() + data.validityDays);
    doc.setFont('helvetica', 'bold');
    doc.text('Valid Until:', col2X, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(validDate.toLocaleDateString('en-GB'), col2X + 25, yPos);
  }
  
  // Row 3
  yPos += 6;
  if (data.poNumber) {
    doc.setFont('helvetica', 'bold');
    doc.text('Customer PO No:', col1X, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(data.poNumber, col1X + 40, yPos);
  }
  
  if (data.poDate) {
    doc.setFont('helvetica', 'bold');
    doc.text('PO Date:', col2X, yPos);
    doc.setFont('helvetica', 'normal');
    // Format PO date to DD/MM/YYYY
    const poDateFormatted = data.poDate.includes('-') 
      ? data.poDate.split('-').reverse().join('/') 
      : data.poDate;
    doc.text(poDateFormatted, col2X + 22, yPos);
  }
  
  // ============= CUSTOMER DETAILS BOX =============
  yPos += 10;
  const customerBoxHeight = 28;
  doc.setFillColor(245, 245, 245);
  doc.rect(leftMargin, yPos, contentWidth, customerBoxHeight, 'F');
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.rect(leftMargin, yPos, contentWidth, customerBoxHeight, 'S');
  
  yPos += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 74, 141);
  doc.text('Bill To:', leftMargin + 3, yPos);
  
  yPos += 5;
  doc.setTextColor(33, 33, 33);
  doc.text(data.customer.name, leftMargin + 3, yPos);
  
  yPos += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  
  if (data.customer.address) {
    doc.text(data.customer.address, leftMargin + 3, yPos);
    yPos += 4;
  }
  
  const location = [data.customer.city, data.customer.state, data.customer.pincode].filter(Boolean).join(', ');
  if (location) {
    doc.text(location, leftMargin + 3, yPos);
    yPos += 4;
  }
  
  if (data.customer.country) {
    doc.text(data.customer.country, leftMargin + 3, yPos);
  }
  
  // GST on right side (for domestic)
  if (data.customer.gst_number && !data.isExport) {
    doc.setFont('helvetica', 'bold');
    doc.text('GST No:', col2X, yPos - 8);
    doc.setFont('helvetica', 'normal');
    doc.text(data.customer.gst_number, col2X + 20, yPos - 8);
  }
  
  yPos += 10;
  
  // ============= ITEMS TABLE =============
  // Define columns based on export/domestic
  const tableColumns = data.isExport
    ? [
        { header: 'Sr', dataKey: 'sr' },
        { header: 'Item Code', dataKey: 'code' },
        { header: 'Description / Material Grade', dataKey: 'desc' },
        { header: 'HS Code', dataKey: 'hs' },
        { header: 'Qty', dataKey: 'qty' },
        { header: 'Unit', dataKey: 'unit' },
        { header: `Rate (${data.currency})`, dataKey: 'rate' },
        { header: `Amount (${data.currency})`, dataKey: 'amount' },
      ]
    : [
        { header: 'Sr', dataKey: 'sr' },
        { header: 'Item Code', dataKey: 'code' },
        { header: 'Description / Material Grade', dataKey: 'desc' },
        { header: 'Qty', dataKey: 'qty' },
        { header: 'Unit', dataKey: 'unit' },
        { header: `Rate (${data.currency})`, dataKey: 'rate' },
        { header: `Amount (${data.currency})`, dataKey: 'amount' },
      ];
  
  const tableBody = data.items.map((item, index) => {
    // Format: Item Name / Material Grade (e.g., "2" Hose Pipe Fitting / CW617N")
    const desc = [item.description, item.material_grade].filter(Boolean).join(' / ') || 'As per specification';
    
    if (data.isExport) {
      return {
        sr: (index + 1).toString(),
        code: item.item_code || '-',
        desc: desc,
        hs: item.hs_code || '-',
        qty: item.quantity?.toString() || '0',
        unit: item.unit || 'PCS',
        rate: item.price_per_pc ? item.price_per_pc.toFixed(4) : '-',
        amount: item.line_amount ? item.line_amount.toFixed(2) : '-',
      };
    }
    return {
      sr: (index + 1).toString(),
      code: item.item_code || '-',
      desc: desc,
      qty: item.quantity?.toString() || '0',
      unit: item.unit || 'PCS',
      rate: item.price_per_pc ? item.price_per_pc.toFixed(4) : '-',
      amount: item.line_amount ? item.line_amount.toFixed(2) : '-',
    };
  });
  
  // Column widths for domestic (full width = 180mm)
  const columnStyles = data.isExport
    ? {
        sr: { cellWidth: 12, halign: 'center' as const },
        code: { cellWidth: 25, halign: 'left' as const },
        desc: { cellWidth: 50, halign: 'left' as const },
        hs: { cellWidth: 20, halign: 'center' as const },
        qty: { cellWidth: 18, halign: 'right' as const },
        unit: { cellWidth: 15, halign: 'center' as const },
        rate: { cellWidth: 22, halign: 'right' as const },
        amount: { cellWidth: 28, halign: 'right' as const },
      }
    : {
        sr: { cellWidth: 12, halign: 'center' as const },
        code: { cellWidth: 30, halign: 'left' as const },
        desc: { cellWidth: 60, halign: 'left' as const },
        qty: { cellWidth: 20, halign: 'right' as const },
        unit: { cellWidth: 18, halign: 'center' as const },
        rate: { cellWidth: 25, halign: 'right' as const },
        amount: { cellWidth: 25, halign: 'right' as const },
      };
  
  // Calculate table width to match content width exactly (180mm for A4 with 15mm margins)
  // For domestic: Sr(15) + Code(30) + Desc(65) + Qty(20) + Unit(15) + Rate(25) + Amount(30) = 200 - too wide
  // Adjusted: Sr(12) + Code(25) + Desc(58) + Qty(18) + Unit(15) + Rate(22) + Amount(30) = 180
  autoTable(doc, {
    startY: yPos,
    head: [tableColumns.map(col => col.header)],
    body: tableBody.map(row => tableColumns.map(col => String(row[col.dataKey as keyof typeof row] ?? ''))),
    margin: { left: leftMargin, right: leftMargin },
    tableWidth: 'auto',
    styles: {
      fontSize: 9,
      cellPadding: 2,
      lineColor: [30, 74, 141],
      lineWidth: 0.2,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [30, 74, 141],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    alternateRowStyles: {
      fillColor: [248, 248, 248],
    },
    columnStyles: data.isExport
      ? {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 22 },
          2: { cellWidth: 45 },
          3: { cellWidth: 18, halign: 'center' },
          4: { cellWidth: 16, halign: 'right' },
          5: { cellWidth: 12, halign: 'center' },
          6: { cellWidth: 20, halign: 'right' },
          7: { cellWidth: 25, halign: 'right' },
        }
      : {
          0: { cellWidth: 12, halign: 'center' },
          1: { cellWidth: 28 },
          2: { cellWidth: 52 },
          3: { cellWidth: 20, halign: 'right' },
          4: { cellWidth: 16, halign: 'center' },
          5: { cellWidth: 25, halign: 'right' },
          6: { cellWidth: 27, halign: 'right' },
        },
    theme: 'grid',
  });
  
  // Get Y position after table
  yPos = (doc as any).lastAutoTable.finalY + 8;
  
  // ============= TOTALS SECTION =============
  const totalsX = rightMargin - 75;
  const amountX = rightMargin - 5;
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(33, 33, 33);
  
  doc.text('Subtotal:', totalsX, yPos);
  doc.text(`${data.currency} ${data.subtotal.toFixed(2)}`, amountX, yPos, { align: 'right' });
  
  if (!data.isExport && data.gstPercent > 0) {
    yPos += 6;
    doc.text(`GST (${data.gstPercent}%):`, totalsX, yPos);
    doc.text(`${data.currency} ${data.gstAmount.toFixed(2)}`, amountX, yPos, { align: 'right' });
  }
  
  yPos += 3;
  doc.setDrawColor(33, 33, 33);
  doc.setLineWidth(0.3);
  doc.line(totalsX, yPos, amountX, yPos);
  
  yPos += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('TOTAL:', totalsX, yPos);
  doc.text(`${data.currency} ${data.totalAmount.toFixed(2)}`, amountX, yPos, { align: 'right' });
  
  // ============= PAYMENT TERMS BOX =============
  yPos += 12;
  const boxWidth = contentWidth / 2 - 5;
  const boxHeight = 30;
  
  doc.setFillColor(245, 245, 245);
  doc.rect(leftMargin, yPos, boxWidth, boxHeight, 'F');
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.rect(leftMargin, yPos, boxWidth, boxHeight, 'S');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 74, 141);
  doc.text('Payment Terms', leftMargin + 3, yPos + 6);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(33, 33, 33);
  
  let paymentY = yPos + 12;
  if (data.advancePercent && data.advancePercent > 0) {
    // Bold "Advance:" label with clear gap before value
    const advanceLabel = 'Advance:';
    doc.setFont('helvetica', 'bold');
    doc.text(advanceLabel, leftMargin + 3, paymentY);
    const advanceLabelWidth = doc.getTextWidth(advanceLabel);
    doc.setFont('helvetica', 'normal');
    doc.text(
      ` ${data.advancePercent}% (${data.currency} ${(data.advanceAmount || 0).toFixed(2)})`,
      leftMargin + 3 + advanceLabelWidth + 1,
      paymentY,
    );

    paymentY += 5;
    const balance = data.totalAmount - (data.advanceAmount || 0);

    // Bold "Balance:" label with clear gap before value
    const balanceLabel = 'Balance:';
    doc.setFont('helvetica', 'bold');
    doc.text(balanceLabel, leftMargin + 3, paymentY);
    const balanceLabelWidth = doc.getTextWidth(balanceLabel);
    doc.setFont('helvetica', 'normal');
    doc.text(
      ` ${data.currency} ${balance.toFixed(2)}`,
      leftMargin + 3 + balanceLabelWidth + 1,
      paymentY,
    );

    paymentY += 5;
  }
  
  if (data.balanceTerms) {
    doc.text(data.balanceTerms, leftMargin + 3, paymentY);
  } else if (data.paymentTermsDays) {
    doc.text(`Net ${data.paymentTermsDays} days`, leftMargin + 3, paymentY);
  }
  
  // ============= EXPORT DETAILS BOX (for export orders) =============
  if (data.isExport) {
    const exportBoxX = leftMargin + boxWidth + 10;
    doc.setFillColor(245, 245, 245);
    doc.rect(exportBoxX, yPos, boxWidth, boxHeight, 'F');
    doc.setDrawColor(200, 200, 200);
    doc.rect(exportBoxX, yPos, boxWidth, boxHeight, 'S');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 74, 141);
    doc.text('Export Details', exportBoxX + 3, yPos + 6);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(33, 33, 33);
    
    let exportY = yPos + 12;
    if (data.incoterm) {
      doc.text(`Incoterms: ${data.incoterm}`, exportBoxX + 3, exportY);
      exportY += 5;
    }
    if (data.portOfLoading) {
      doc.text(`Port of Loading: ${data.portOfLoading}`, exportBoxX + 3, exportY);
      exportY += 5;
    }
    if (data.portOfDischarge) {
      doc.text(`Port of Discharge: ${data.portOfDischarge}`, exportBoxX + 3, exportY);
      exportY += 5;
    }
    doc.text(`Country of Origin: ${data.countryOfOrigin || 'India'}`, exportBoxX + 3, exportY);
  }
  
  yPos += boxHeight + 10;
  
  // ============= BANK DETAILS =============
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 74, 141);
  doc.text('Bank Details for Remittance', leftMargin, yPos);
  
  yPos += 6;
  doc.setFontSize(9);
  doc.setTextColor(33, 33, 33);
  
  // Bank details with bold labels and proper spacing
  const bankDetails = [
    { label: 'Account Name: ', value: lh.company.name.toUpperCase() },
    { label: 'Bank Name: ', value: 'BANK OF BARODA' },
    { label: 'Account No: ', value: '25970500001613' },
    { label: 'Branch: ', value: 'S.S.I. Jamnagar' },
    { label: 'IFSC Code: ', value: 'BARB0SSIJAM (5th character is Zero)' },
    { label: 'Swift Code: ', value: 'BARBINBBRAN' },
  ];
  
  for (const detail of bankDetails) {
    doc.setFont('helvetica', 'bold');
    doc.text(detail.label.trim(), leftMargin, yPos);
    const labelWidth = doc.getTextWidth(detail.label.trim());
    doc.setFont('helvetica', 'normal');
    // Add a small gap so text never overlaps the bold label
    doc.text(` ${detail.value}`, leftMargin + labelWidth + 1, yPos);
    yPos += 4;
  }
  
  // ============= FOOTER (shared letterhead) =============
  const footerH = lh.footer ? (pageWidth * lh.footer.h) / lh.footer.w : 14;
  const footerTop = pageHeight - footerH;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text('This is a computer-generated Proforma Invoice and is valid without signature.', pageWidth / 2, footerTop - 3, { align: 'center' });
  if (lh.footer) {
    doc.addImage(lh.footer.data, 'PNG', 0, footerTop, pageWidth, footerH);
  } else {
    doc.setDrawColor(30, 74, 141);
    doc.setLineWidth(0.4);
    doc.line(leftMargin, footerTop + 1, rightMargin, footerTop + 1);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(60, 60, 60);
    doc.text(co.address, pageWidth / 2, footerTop + 5, { align: 'center', maxWidth: contentWidth });
    doc.text([co.phones && `Ph: ${co.phones}`, co.email, co.gstin && `GSTIN: ${co.gstin}`, co.iec && `IEC: ${co.iec}`, co.udyam].filter(Boolean).join(' | '), pageWidth / 2, footerTop + 11, { align: 'center', maxWidth: contentWidth });
  }

  // Return as bytes
  return doc.output('arraybuffer') as unknown as Uint8Array;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    // Create service role client for privileged operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized: No authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized: Invalid or expired token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles').select('department_id').eq('id', user.id).single();
    if (profileError || !profile?.department_id) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden: No department assigned' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: department, error: departmentError } = await supabase
      .from('departments').select('type').eq('id', profile.department_id).single();
    if (departmentError || !department || !['sales', 'admin', 'super_admin', 'finance'].includes(department.type)) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden: Insufficient permissions to generate proformas' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = user.id;
    
    const { salesOrderId }: ProformaGenerateRequest = await req.json();
    
    if (!salesOrderId) {
      throw new Error('Missing required field: salesOrderId');
    }
    
    console.log(`Generating proforma for sales order: ${salesOrderId}`);
    
    // Fetch sales order with service role
    const { data: order, error: orderError } = await supabase
      .from('sales_orders')
      .select('*')
      .eq('id', salesOrderId)
      .single();
    
    if (orderError || !order) {
      throw new Error(`Sales order not found: ${orderError?.message || 'Unknown error'}`);
    }
    
    // Fetch customer details
    let customer = null;
    if (order.customer_id) {
      const { data: customerData } = await supabase
        .from('customer_master')
        .select('*')
        .eq('id', order.customer_id)
        .single();
      customer = customerData;
    }
    
    // Check for existing proforma (avoid duplicates) - DELETE if exists to regenerate
    const proformaNo = `${order.so_id}-PI`;
    const { data: existingProforma } = await supabase
      .from('proforma_invoices')
      .select('id, file_path')
      .eq('sales_order_id', salesOrderId)
      .eq('proforma_no', proformaNo)
      .maybeSingle();
    
    // Delete existing proforma to regenerate with new formatting
    if (existingProforma) {
      console.log('Deleting existing proforma to regenerate with new format...');
      
      // Delete from storage
      if (existingProforma.file_path) {
        await supabase.storage
          .from('proforma-invoices')
          .remove([existingProforma.file_path]);
      }
      
      // Delete from database
      await supabase
        .from('proforma_invoices')
        .delete()
        .eq('id', existingProforma.id);
    }
    
    // Parse items from sales order and fetch item details from item_master
    let lineItems: LineItem[] = [];
    if (order.items) {
      const parsedItems = typeof order.items === 'string' 
        ? JSON.parse(order.items) 
        : order.items;
      
      // Collect all item codes to fetch from item_master
      const itemCodes = (parsedItems || []).map((item: any) => item.item_code).filter(Boolean);
      
      // Fetch item details from item_master
      let itemMasterMap: Record<string, any> = {};
      if (itemCodes.length > 0) {
        const { data: itemMasterData } = await supabase
          .from('item_master')
          .select('item_code, item_name, alloy, default_material_grade')
          .in('item_code', itemCodes);
        
        if (itemMasterData) {
          itemMasterMap = itemMasterData.reduce((acc: Record<string, any>, item: any) => {
            acc[item.item_code] = item;
            return acc;
          }, {});
        }
        console.log(`[ITEMS] Fetched ${Object.keys(itemMasterMap).length} items from item_master`);
      }
      
      lineItems = (parsedItems || []).map((item: any, index: number) => {
        const masterItem = itemMasterMap[item.item_code] || {};
        // Description should be item_name from item_master (e.g., "2" Hose Pipe Fitting")
        const itemName = masterItem.item_name || item.item_name || item.description || '';
        // Material grade from item_master (alloy or default_material_grade e.g., "CW617N" or "C37700")
        const materialGrade = item.alloy || masterItem.alloy || masterItem.default_material_grade || item.material_grade || '';
        
        return {
          sr_no: index + 1,
          item_code: item.item_code || '-',
          description: itemName,
          material_grade: materialGrade,
          quantity: Number(item.quantity) || 0,
          unit: 'PCS',
          price_per_pc: item.price_per_pc ? Number(item.price_per_pc) : undefined,
          line_amount: item.line_amount ? Number(item.line_amount) : undefined,
          hs_code: item.hs_code
        };
      });
    }
    
    // Calculate totals
    const subtotal = lineItems.reduce((sum, item) => sum + (item.line_amount || 0), 0);
    const isExport = customer?.is_export_customer || customer?.gst_type === 'export';
    const gstPercent = isExport ? 0 : 18;
    const gstAmount = (subtotal * gstPercent) / 100;
    const totalAmount = subtotal + gstAmount;
    
    // Calculate advance payment - handle both 'percent' and 'percentage' types
    let advancePercent = 0;
    let advanceAmount = 0;
    if (order.advance_payment) {
      const advType = order.advance_payment.type;
      // Support both 'percent' (from frontend) and 'percentage' (legacy)
      if (advType === 'percent' || advType === 'percentage') {
        advancePercent = order.advance_payment.value || 0;
        advanceAmount = order.advance_payment.calculated_amount || (totalAmount * advancePercent / 100);
      } else if (advType === 'fixed') {
        // Fixed amount - store as advance amount, calculate percent for display
        advanceAmount = order.advance_payment.calculated_amount || order.advance_payment.value || 0;
        advancePercent = totalAmount > 0 ? (advanceAmount / totalAmount) * 100 : 0;
      }
    }
    
    // Fetch the company logo using service role client
    console.log('[LOGO] Starting logo fetch...');
    const letterhead = await loadLetterhead(supabase);
    
    // Generate professional PDF using jsPDF with autoTable
    console.log('Generating professional PDF with jsPDF and autoTable...');
    const pdfBytes = await generateProfessionalPdf({
      proformaNo,
      date: new Date().toLocaleDateString('en-GB'),
      soId: order.so_id,
      customer: {
        name: customer?.customer_name || order.customer || 'Unknown',
        address: customer?.address_line_1,
        city: customer?.city,
        state: customer?.state,
        country: customer?.country,
        pincode: customer?.pincode,
        gst_number: customer?.gst_number
      },
      poNumber: order.po_number,
      poDate: order.po_date,
      items: lineItems,
      currency: order.currency || 'USD',
      subtotal,
      gstPercent,
      gstAmount,
      totalAmount,
      advancePercent,
      advanceAmount,
      balanceTerms: order.advance_payment?.balance_terms,
      paymentTermsDays: order.payment_terms_days,
      isExport,
      incoterm: order.incoterm,
      countryOfOrigin: 'India',
      validityDays: 30
    }, letterhead);
    
    // Upload to storage using service role (bypasses RLS)
    const fileName = `${proformaNo}.pdf`;
    const filePath = `${order.customer_id || 'general'}/${fileName}`;
    
    console.log(`Uploading PDF to: ${filePath}`);
    
    const { error: uploadError } = await supabase.storage
      .from('proforma-invoices')
      .upload(filePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true
      });
    
    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Failed to upload PDF: ${uploadError.message}`);
    }
    
    // Create signed URL for download (valid for 1 hour)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('proforma-invoices')
      .createSignedUrl(filePath, 3600);
    
    if (signedUrlError) {
      throw new Error(`Failed to create signed URL: ${signedUrlError.message}`);
    }
    
    // Save metadata to database
    const { data: proformaRecord, error: dbError } = await supabase
      .from('proforma_invoices')
      .insert({
        sales_order_id: salesOrderId,
        proforma_no: proformaNo,
        file_path: filePath,
        file_url: signedUrlData.signedUrl,
        generated_by: userId,
        customer_id: order.customer_id,
        customer_name: customer?.customer_name || order.customer,
        customer_address: [customer?.address_line_1, customer?.city, customer?.state, customer?.pincode].filter(Boolean).join(', '),
        customer_contact: customer?.primary_contact_name,
        customer_email: customer?.primary_contact_email,
        customer_gst: customer?.gst_number,
        po_number: order.po_number,
        po_date: order.po_date,
        line_items: lineItems,
        subtotal,
        gst_percent: gstPercent,
        gst_amount: gstAmount,
        total_amount: totalAmount,
        currency: order.currency || 'USD',
        advance_percent: advancePercent,
        advance_amount: advanceAmount,
        balance_terms: order.advance_payment?.balance_terms,
        is_export: isExport,
        incoterm: order.incoterm,
        country_of_origin: 'India',
        validity_days: 30,
        status: 'issued'
      })
      .select()
      .single();
    
    if (dbError) {
      console.error('Database error:', dbError);
      throw new Error(`Failed to save proforma record: ${dbError.message}`);
    }
    
    console.log(`[SUCCESS] Proforma ${proformaNo} generated with logo status: ${logoResult.status}`);
    
    return new Response(JSON.stringify({
      success: true,
      proformaId: proformaRecord.id,
      proformaNo,
      downloadUrl: signedUrlData.signedUrl,
      isExisting: false,
      logoPath: 'company-assets/rv-logo.png',
      logoBytesLoaded: logoResult.bytes,
      logoRenderResult: logoResult.status
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });

  } catch (error: unknown) {
    console.error('Error generating proforma:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate proforma invoice';
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage
    }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
};

serve(handler);
