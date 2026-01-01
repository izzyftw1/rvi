import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";
import autoTable from "https://esm.sh/jspdf-autotable@3.8.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

// deno-lint-ignore no-explicit-any
async function fetchLogoFromStorage(supabaseClient: any): Promise<{ base64: string | null; bytes: number; status: string }> {
  const LOGO_PATH = 'rv-logo.png';
  const BUCKET = 'company-assets';
  
  console.log(`[LOGO] Fetching logo from bucket: ${BUCKET}, path: ${LOGO_PATH}`);
  
  try {
    // Use service role client to download the file
    const { data, error } = await supabaseClient.storage
      .from(BUCKET)
      .download(LOGO_PATH);
    
    if (error) {
      console.log(`[LOGO] Storage error: ${error.message}`);
      return { base64: null, bytes: 0, status: `storage_error: ${error.message}` };
    }
    
    if (!data) {
      console.log('[LOGO] No data returned from storage');
      return { base64: null, bytes: 0, status: 'no_data_returned' };
    }
    
    // Convert blob to ArrayBuffer
    const arrayBuffer = await data.arrayBuffer();
    const bytes = arrayBuffer.byteLength;
    
    console.log(`[LOGO] Downloaded ${bytes} bytes, type: ${data.type}`);
    
    if (bytes === 0) {
      console.log('[LOGO] File is empty (0 bytes)');
      return { base64: null, bytes: 0, status: 'empty_file' };
    }
    
    // Validate it's a PNG by checking magic bytes
    const uint8 = new Uint8Array(arrayBuffer);
    const isPng = uint8[0] === 0x89 && uint8[1] === 0x50 && uint8[2] === 0x4E && uint8[3] === 0x47;
    const isJpeg = uint8[0] === 0xFF && uint8[1] === 0xD8 && uint8[2] === 0xFF;
    
    if (!isPng && !isJpeg) {
      console.log(`[LOGO] Invalid image format. First 4 bytes: ${uint8[0]}, ${uint8[1]}, ${uint8[2]}, ${uint8[3]}`);
      return { base64: null, bytes, status: 'invalid_format' };
    }
    
    const imageType = isPng ? 'PNG' : 'JPEG';
    console.log(`[LOGO] Valid ${imageType} image detected`);
    
    // Convert to base64
    let binary = '';
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    const base64 = btoa(binary);
    const mimeType = isPng ? 'image/png' : 'image/jpeg';
    
    console.log(`[LOGO] Successfully converted to base64, length: ${base64.length} chars`);
    
    return { 
      base64: `data:${mimeType};base64,${base64}`, 
      bytes, 
      status: `success_${imageType.toLowerCase()}` 
    };
    
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[LOGO] Exception during fetch: ${errMsg}`);
    return { base64: null, bytes: 0, status: `exception: ${errMsg}` };
  }
}

async function generateProfessionalPdf(data: ProformaData, logoBase64: string | null): Promise<Uint8Array> {
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

  // ============= HEADER SECTION =============
  const logoWidth = 45;
  const logoHeight = 18;
  let textStartX = leftMargin;
  
  // Add actual logo image if available
  if (logoBase64 && logoBase64.startsWith('data:image')) {
    try {
      // Determine format from data URI
      const format = logoBase64.includes('image/png') ? 'PNG' : 'JPEG';
      doc.addImage(logoBase64, format, leftMargin, yPos, logoWidth, logoHeight);
      textStartX = leftMargin + logoWidth + 5;
      console.log(`[PDF] Logo added successfully as ${format}`);
    } catch (e) {
      console.error('[PDF] Error adding logo image:', e);
      // Fallback: show company name prominently
      console.log('[PDF] Using text fallback for logo');
      textStartX = leftMargin;
    }
  } else {
    // No logo available - use text header as fallback
    console.log('[PDF] No valid logo, using text-only header');
    textStartX = leftMargin;
  }
  
  // Company Name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(30, 74, 141);
  doc.text('R.V. INDUSTRIES', textStartX, yPos + 8);
  
  // Tagline
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(33, 33, 33);
  doc.text('Precision Brass Components', textStartX, yPos + 14);
  
  // Address - on its own line
  doc.setFontSize(8);
  doc.text('Plot No 11 & 12, Sadguru Industrial Area, Jamnagar, 361006 (Gujarat) India', textStartX, yPos + 20);
  
  // Certifications on the far right - stacked properly
  const certX = rightMargin - 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  
  doc.setTextColor(30, 74, 141);
  doc.text('ISO 9001:2015', certX, yPos + 4, { align: 'right' });
  
  doc.setTextColor(211, 47, 47);
  doc.text('TÜV SÜD CERTIFIED', certX, yPos + 9, { align: 'right' });
  
  doc.setTextColor(30, 74, 141);
  doc.text('RoHS COMPLIANT', certX, yPos + 14, { align: 'right' });
  
  doc.setTextColor(211, 47, 47);
  doc.text('CE MARKED', certX, yPos + 19, { align: 'right' });
  
  // Header divider line (two-color)
  yPos += 26;
  doc.setDrawColor(30, 74, 141);
  doc.setLineWidth(0.8);
  doc.line(leftMargin, yPos, leftMargin + contentWidth / 2, yPos);
  doc.setDrawColor(211, 47, 47);
  doc.line(leftMargin + contentWidth / 2, yPos, rightMargin, yPos);
  
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
    doc.text(data.poDate, col2X + 22, yPos);
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
    const desc = [item.description, item.material_grade].filter(Boolean).join(' - ') || 'As per specification';
    
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
    doc.text(`Advance: ${data.advancePercent}% (${data.currency} ${(data.advanceAmount || 0).toFixed(2)})`, leftMargin + 3, paymentY);
    paymentY += 5;
    const balance = data.totalAmount - (data.advanceAmount || 0);
    doc.text(`Balance: ${data.currency} ${balance.toFixed(2)}`, leftMargin + 3, paymentY);
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
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(33, 33, 33);
  
  const bankDetails = [
    'Account Name: R.V. INDUSTRIES',
    'Bank Name: BANK OF BARODA',
    'Account No: 25970500001613',
    'Branch: S.S.I. Jamnagar',
    'IFSC Code: BARB0SSIJAM (5th character is Zero)',
    'Swift Code: BARBINBBRAN',
  ];
  
  for (const detail of bankDetails) {
    doc.text(detail, leftMargin, yPos);
    yPos += 4;
  }
  
  // ============= FOOTER =============
  const footerY = pageHeight - 20;
  
  // Footer divider line (two-color)
  doc.setDrawColor(30, 74, 141);
  doc.setLineWidth(0.8);
  doc.line(leftMargin, footerY, leftMargin + contentWidth / 2, footerY);
  doc.setDrawColor(211, 47, 47);
  doc.line(leftMargin + contentWidth / 2, footerY, rightMargin, footerY);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(33, 33, 33);
  doc.text('Email: sales@brasspartsindia.net | mitul@brasspartsindia.net', pageWidth / 2, footerY + 5, { align: 'center' });
  doc.text('Web: www.brasspartsindia.net | Ph: +91-288-2541871', pageWidth / 2, footerY + 10, { align: 'center' });
  
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text('This is a computer-generated Proforma Invoice and is valid without signature.', pageWidth / 2, footerY + 15, { align: 'center' });
  
  // Return as bytes
  return doc.output('arraybuffer') as unknown as Uint8Array;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Create service role client for privileged operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get authorization header to verify user
    const authHeader = req.headers.get('Authorization');
    console.log('Auth header present:', !!authHeader);
    
    let userId: string | null = null;
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      
      if (authError) {
        console.log('Auth error:', authError.message);
      }
      
      if (user) {
        userId = user.id;
        console.log('User authenticated:', userId);
      }
    }
    
    if (!userId) {
      console.log('No authenticated user, proceeding with service role only');
    }
    
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
    
    // Parse items from sales order
    let lineItems: LineItem[] = [];
    if (order.items) {
      const parsedItems = typeof order.items === 'string' 
        ? JSON.parse(order.items) 
        : order.items;
      
      lineItems = (parsedItems || []).map((item: any, index: number) => ({
        sr_no: index + 1,
        item_code: item.item_code || '-',
        description: item.drawing_number || '',
        material_grade: [item.alloy, item.material_size_mm].filter(Boolean).join(' '),
        quantity: Number(item.quantity) || 0,
        unit: 'PCS',
        price_per_pc: item.price_per_pc ? Number(item.price_per_pc) : undefined,
        line_amount: item.line_amount ? Number(item.line_amount) : undefined,
        hs_code: item.hs_code
      }));
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
    const logoResult = await fetchLogoFromStorage(supabase);
    console.log(`[LOGO] Fetch result - Status: ${logoResult.status}, Bytes: ${logoResult.bytes}, Has base64: ${!!logoResult.base64}`);
    const logoBase64 = logoResult.base64;
    
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
    }, logoBase64);
    
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
