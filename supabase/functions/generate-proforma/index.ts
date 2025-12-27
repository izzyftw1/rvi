import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { PDFDocument, rgb, StandardFonts, PageSizes } from "https://esm.sh/pdf-lib@1.17.1";

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

// RV Industries Brand Colors (RGB 0-1 scale for pdf-lib)
const BRAND_COLORS = {
  primary: rgb(30/255, 74/255, 141/255),     // Brand Blue #1E4A8D
  accent: rgb(211/255, 47/255, 47/255),      // Brand Red #D32F2F
  dark: rgb(33/255, 33/255, 33/255),         // Dark gray
  light: rgb(245/255, 245/255, 245/255),     // Light gray
  white: rgb(1, 1, 1),                        // White
  tableHeader: rgb(30/255, 74/255, 141/255), // Same as primary
};

async function generateProfessionalPdf(data: ProformaData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage(PageSizes.A4);
  const { width, height } = page.getSize();
  
  // Load fonts
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  
  const leftMargin = 40;
  const rightMargin = width - 40;
  const contentWidth = rightMargin - leftMargin;
  let yPos = height - 40;
  
  // === HEADER SECTION ===
  // Company Name - Large Blue Title
  page.drawText('R.V. INDUSTRIES', {
    x: leftMargin,
    y: yPos,
    size: 22,
    font: helveticaBold,
    color: BRAND_COLORS.primary,
  });
  
  // Certifications on the right
  const certX = rightMargin;
  page.drawText('ISO 9001:2015', {
    x: certX - 70,
    y: yPos,
    size: 7,
    font: helveticaBold,
    color: BRAND_COLORS.primary,
  });
  page.drawText('TÜV SÜD CERTIFIED', {
    x: certX - 85,
    y: yPos - 10,
    size: 7,
    font: helveticaBold,
    color: BRAND_COLORS.accent,
  });
  page.drawText('RoHS COMPLIANT', {
    x: certX - 75,
    y: yPos - 20,
    size: 7,
    font: helveticaBold,
    color: BRAND_COLORS.primary,
  });
  page.drawText('CE MARKED', {
    x: certX - 60,
    y: yPos - 30,
    size: 7,
    font: helveticaBold,
    color: BRAND_COLORS.accent,
  });
  
  yPos -= 18;
  page.drawText('Precision Brass Components', {
    x: leftMargin,
    y: yPos,
    size: 10,
    font: helvetica,
    color: BRAND_COLORS.dark,
  });
  
  yPos -= 14;
  page.drawText('Plot No 11, 12/1 & 12/2, Sadguru Industrial Area, Jamnagar - 361006 (Gujarat) India', {
    x: leftMargin,
    y: yPos,
    size: 8,
    font: helvetica,
    color: BRAND_COLORS.dark,
  });
  
  // Header divider line (two-color)
  yPos -= 12;
  const midPoint = leftMargin + contentWidth / 2;
  page.drawLine({
    start: { x: leftMargin, y: yPos },
    end: { x: midPoint, y: yPos },
    thickness: 2,
    color: BRAND_COLORS.primary,
  });
  page.drawLine({
    start: { x: midPoint, y: yPos },
    end: { x: rightMargin, y: yPos },
    thickness: 2,
    color: BRAND_COLORS.accent,
  });
  
  // === PROFORMA INVOICE TITLE BAR ===
  yPos -= 20;
  page.drawRectangle({
    x: leftMargin,
    y: yPos - 8,
    width: contentWidth,
    height: 22,
    color: BRAND_COLORS.primary,
  });
  
  page.drawText('PROFORMA INVOICE', {
    x: leftMargin + contentWidth / 2 - 55,
    y: yPos,
    size: 14,
    font: helveticaBold,
    color: BRAND_COLORS.white,
  });
  
  // === DOCUMENT DETAILS (Two columns) ===
  yPos -= 35;
  const col1X = leftMargin;
  const col2X = leftMargin + contentWidth / 2 + 10;
  
  // Left column
  page.drawText('Proforma Invoice No:', { x: col1X, y: yPos, size: 9, font: helveticaBold, color: BRAND_COLORS.dark });
  page.drawText(data.proformaNo, { x: col1X + 95, y: yPos, size: 9, font: helvetica, color: BRAND_COLORS.dark });
  
  // Right column
  page.drawText('Date:', { x: col2X, y: yPos, size: 9, font: helveticaBold, color: BRAND_COLORS.dark });
  page.drawText(data.date, { x: col2X + 30, y: yPos, size: 9, font: helvetica, color: BRAND_COLORS.dark });
  
  yPos -= 14;
  if (data.soId) {
    page.drawText('Sales Order No:', { x: col1X, y: yPos, size: 9, font: helveticaBold, color: BRAND_COLORS.dark });
    page.drawText(data.soId, { x: col1X + 80, y: yPos, size: 9, font: helvetica, color: BRAND_COLORS.dark });
  }
  
  if (data.validityDays) {
    const validDate = new Date();
    validDate.setDate(validDate.getDate() + data.validityDays);
    page.drawText('Valid Until:', { x: col2X, y: yPos, size: 9, font: helveticaBold, color: BRAND_COLORS.dark });
    page.drawText(validDate.toLocaleDateString('en-GB'), { x: col2X + 55, y: yPos, size: 9, font: helvetica, color: BRAND_COLORS.dark });
  }
  
  yPos -= 14;
  if (data.poNumber) {
    page.drawText('Customer PO No:', { x: col1X, y: yPos, size: 9, font: helveticaBold, color: BRAND_COLORS.dark });
    page.drawText(data.poNumber, { x: col1X + 85, y: yPos, size: 9, font: helvetica, color: BRAND_COLORS.dark });
  }
  
  if (data.poDate) {
    page.drawText('PO Date:', { x: col2X, y: yPos, size: 9, font: helveticaBold, color: BRAND_COLORS.dark });
    page.drawText(data.poDate, { x: col2X + 45, y: yPos, size: 9, font: helvetica, color: BRAND_COLORS.dark });
  }
  
  // === CUSTOMER DETAILS BOX ===
  yPos -= 25;
  const customerBoxHeight = 65;
  page.drawRectangle({
    x: leftMargin,
    y: yPos - customerBoxHeight + 10,
    width: contentWidth,
    height: customerBoxHeight,
    color: BRAND_COLORS.light,
  });
  
  page.drawText('Bill To:', { x: leftMargin + 8, y: yPos, size: 10, font: helveticaBold, color: BRAND_COLORS.primary });
  
  yPos -= 14;
  page.drawText(data.customer.name, { x: leftMargin + 8, y: yPos, size: 10, font: helveticaBold, color: BRAND_COLORS.dark });
  
  if (data.customer.address) {
    yPos -= 12;
    page.drawText(data.customer.address, { x: leftMargin + 8, y: yPos, size: 9, font: helvetica, color: BRAND_COLORS.dark });
  }
  
  const location = [data.customer.city, data.customer.state, data.customer.pincode].filter(Boolean).join(', ');
  if (location) {
    yPos -= 12;
    page.drawText(location, { x: leftMargin + 8, y: yPos, size: 9, font: helvetica, color: BRAND_COLORS.dark });
  }
  
  if (data.customer.country) {
    yPos -= 12;
    page.drawText(data.customer.country, { x: leftMargin + 8, y: yPos, size: 9, font: helvetica, color: BRAND_COLORS.dark });
  }
  
  // GST on the right side of customer box (for domestic orders)
  if (data.customer.gst_number && !data.isExport) {
    page.drawText('GST No:', { x: col2X, y: yPos + 24, size: 9, font: helveticaBold, color: BRAND_COLORS.dark });
    page.drawText(data.customer.gst_number, { x: col2X + 45, y: yPos + 24, size: 9, font: helvetica, color: BRAND_COLORS.dark });
  }
  
  // === ITEMS TABLE ===
  yPos -= 25;
  
  // Table column definitions
  const columns = data.isExport
    ? [
        { header: 'Sr', width: 25, align: 'center' as const },
        { header: 'Item Code', width: 60, align: 'left' as const },
        { header: 'Description / Material', width: 130, align: 'left' as const },
        { header: 'HS Code', width: 50, align: 'center' as const },
        { header: 'Qty', width: 40, align: 'right' as const },
        { header: 'Unit', width: 35, align: 'center' as const },
        { header: `Rate (${data.currency})`, width: 55, align: 'right' as const },
        { header: `Amount (${data.currency})`, width: 65, align: 'right' as const },
      ]
    : [
        { header: 'Sr', width: 25, align: 'center' as const },
        { header: 'Item Code', width: 70, align: 'left' as const },
        { header: 'Description / Material Grade', width: 155, align: 'left' as const },
        { header: 'Qty', width: 45, align: 'right' as const },
        { header: 'Unit', width: 35, align: 'center' as const },
        { header: `Rate (${data.currency})`, width: 60, align: 'right' as const },
        { header: `Amount (${data.currency})`, width: 70, align: 'right' as const },
      ];
  
  const tableWidth = columns.reduce((sum, col) => sum + col.width, 0);
  const tableStartX = leftMargin + (contentWidth - tableWidth) / 2;
  const rowHeight = 16;
  const headerHeight = 18;
  
  // Draw table header background
  page.drawRectangle({
    x: tableStartX,
    y: yPos - headerHeight + 5,
    width: tableWidth,
    height: headerHeight,
    color: BRAND_COLORS.tableHeader,
  });
  
  // Draw header text
  let colX = tableStartX;
  for (const col of columns) {
    const textWidth = helveticaBold.widthOfTextAtSize(col.header, 8);
    let textX = colX + 3;
    if (col.align === 'center') textX = colX + (col.width - textWidth) / 2;
    if (col.align === 'right') textX = colX + col.width - textWidth - 3;
    
    page.drawText(col.header, {
      x: textX,
      y: yPos - 8,
      size: 8,
      font: helveticaBold,
      color: BRAND_COLORS.white,
    });
    colX += col.width;
  }
  
  yPos -= headerHeight;
  
  // Draw table rows
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i];
    const desc = [item.description, item.material_grade].filter(Boolean).join(' - ') || 'As per specification';
    
    // Alternate row background
    if (i % 2 === 1) {
      page.drawRectangle({
        x: tableStartX,
        y: yPos - rowHeight + 5,
        width: tableWidth,
        height: rowHeight,
        color: BRAND_COLORS.light,
      });
    }
    
    const rowData = data.isExport
      ? [
          (i + 1).toString(),
          item.item_code || '-',
          desc.substring(0, 35),
          item.hs_code || '-',
          item.quantity?.toString() || '0',
          item.unit || 'PCS',
          item.price_per_pc ? item.price_per_pc.toFixed(4) : '-',
          item.line_amount ? item.line_amount.toFixed(2) : '-',
        ]
      : [
          (i + 1).toString(),
          item.item_code || '-',
          desc.substring(0, 40),
          item.quantity?.toString() || '0',
          item.unit || 'PCS',
          item.price_per_pc ? item.price_per_pc.toFixed(4) : '-',
          item.line_amount ? item.line_amount.toFixed(2) : '-',
        ];
    
    colX = tableStartX;
    for (let j = 0; j < columns.length; j++) {
      const col = columns[j];
      const text = rowData[j];
      const textWidth = helvetica.widthOfTextAtSize(text, 8);
      let textX = colX + 3;
      if (col.align === 'center') textX = colX + (col.width - textWidth) / 2;
      if (col.align === 'right') textX = colX + col.width - textWidth - 3;
      
      page.drawText(text, {
        x: textX,
        y: yPos - 10,
        size: 8,
        font: helvetica,
        color: BRAND_COLORS.dark,
      });
      colX += col.width;
    }
    
    yPos -= rowHeight;
  }
  
  // Table border
  page.drawRectangle({
    x: tableStartX,
    y: yPos + 5,
    width: tableWidth,
    height: headerHeight + (data.items.length * rowHeight),
    borderColor: BRAND_COLORS.primary,
    borderWidth: 0.5,
  });
  
  // === TOTALS SECTION ===
  yPos -= 20;
  const totalsX = rightMargin - 150;
  
  page.drawText('Subtotal:', { x: totalsX, y: yPos, size: 9, font: helvetica, color: BRAND_COLORS.dark });
  page.drawText(`${data.currency} ${data.subtotal.toFixed(2)}`, { x: rightMargin - 70, y: yPos, size: 9, font: helvetica, color: BRAND_COLORS.dark });
  
  if (!data.isExport && data.gstPercent > 0) {
    yPos -= 14;
    page.drawText(`GST (${data.gstPercent}%):`, { x: totalsX, y: yPos, size: 9, font: helvetica, color: BRAND_COLORS.dark });
    page.drawText(`${data.currency} ${data.gstAmount.toFixed(2)}`, { x: rightMargin - 70, y: yPos, size: 9, font: helvetica, color: BRAND_COLORS.dark });
  }
  
  yPos -= 5;
  page.drawLine({
    start: { x: totalsX, y: yPos },
    end: { x: rightMargin - 10, y: yPos },
    thickness: 0.5,
    color: BRAND_COLORS.dark,
  });
  
  yPos -= 14;
  page.drawText('TOTAL:', { x: totalsX, y: yPos, size: 10, font: helveticaBold, color: BRAND_COLORS.dark });
  page.drawText(`${data.currency} ${data.totalAmount.toFixed(2)}`, { x: rightMargin - 70, y: yPos, size: 10, font: helveticaBold, color: BRAND_COLORS.dark });
  
  // === PAYMENT TERMS BOX ===
  yPos -= 30;
  const boxWidth = (contentWidth - 20) / 2;
  const boxHeight = 55;
  
  page.drawRectangle({
    x: leftMargin,
    y: yPos - boxHeight + 10,
    width: boxWidth,
    height: boxHeight,
    color: BRAND_COLORS.light,
  });
  
  page.drawText('Payment Terms', { x: leftMargin + 8, y: yPos, size: 10, font: helveticaBold, color: BRAND_COLORS.primary });
  
  yPos -= 14;
  if (data.advancePercent && data.advancePercent > 0) {
    page.drawText(`Advance: ${data.advancePercent}% (${data.currency} ${(data.advanceAmount || 0).toFixed(2)})`, { 
      x: leftMargin + 8, y: yPos, size: 9, font: helvetica, color: BRAND_COLORS.dark 
    });
    yPos -= 12;
    const balance = data.totalAmount - (data.advanceAmount || 0);
    page.drawText(`Balance: ${data.currency} ${balance.toFixed(2)}`, { 
      x: leftMargin + 8, y: yPos, size: 9, font: helvetica, color: BRAND_COLORS.dark 
    });
  }
  
  yPos -= 12;
  if (data.balanceTerms) {
    page.drawText(`Terms: ${data.balanceTerms}`, { x: leftMargin + 8, y: yPos, size: 9, font: helvetica, color: BRAND_COLORS.dark });
  } else if (data.paymentTermsDays) {
    page.drawText(`Net ${data.paymentTermsDays} days`, { x: leftMargin + 8, y: yPos, size: 9, font: helvetica, color: BRAND_COLORS.dark });
  }
  
  // === EXPORT DETAILS BOX (for export orders) ===
  if (data.isExport) {
    let expY = yPos + 26;
    page.drawRectangle({
      x: leftMargin + boxWidth + 20,
      y: expY - boxHeight + 10,
      width: boxWidth,
      height: boxHeight,
      color: BRAND_COLORS.light,
    });
    
    page.drawText('Export Details', { x: leftMargin + boxWidth + 28, y: expY, size: 10, font: helveticaBold, color: BRAND_COLORS.primary });
    
    expY -= 14;
    if (data.incoterm) {
      page.drawText(`Incoterms: ${data.incoterm}`, { x: leftMargin + boxWidth + 28, y: expY, size: 9, font: helvetica, color: BRAND_COLORS.dark });
      expY -= 12;
    }
    if (data.portOfLoading) {
      page.drawText(`Port of Loading: ${data.portOfLoading}`, { x: leftMargin + boxWidth + 28, y: expY, size: 9, font: helvetica, color: BRAND_COLORS.dark });
      expY -= 12;
    }
    if (data.portOfDischarge) {
      page.drawText(`Port of Discharge: ${data.portOfDischarge}`, { x: leftMargin + boxWidth + 28, y: expY, size: 9, font: helvetica, color: BRAND_COLORS.dark });
      expY -= 12;
    }
    page.drawText(`Country of Origin: ${data.countryOfOrigin || 'India'}`, { x: leftMargin + boxWidth + 28, y: expY, size: 9, font: helvetica, color: BRAND_COLORS.dark });
  }
  
  // === BANK DETAILS ===
  yPos -= 40;
  page.drawText('Bank Details for Remittance', { x: leftMargin, y: yPos, size: 10, font: helveticaBold, color: BRAND_COLORS.primary });
  
  const bankDetails = [
    'Account Name: R.V. INDUSTRIES',
    'Bank Name: BANK OF BARODA',
    'Account No: 25970500001613',
    'Branch: S.S.I. Jamnagar',
    'IFSC Code: BARB0SSIJAM (5th character is Zero)',
    'Swift Code: BARBINBBRAN',
  ];
  
  yPos -= 12;
  for (const detail of bankDetails) {
    page.drawText(detail, { x: leftMargin, y: yPos, size: 8, font: helvetica, color: BRAND_COLORS.dark });
    yPos -= 10;
  }
  
  // === FOOTER ===
  const footerY = 50;
  
  page.drawLine({
    start: { x: leftMargin, y: footerY + 25 },
    end: { x: rightMargin, y: footerY + 25 },
    thickness: 0.5,
    color: BRAND_COLORS.primary,
  });
  
  const footerText1 = 'Email: sales@brasspartsindia.net | mitul@brasspartsindia.net';
  const footerText2 = 'Web: www.brasspartsindia.net | Ph: +91-288-2541871';
  const footer1Width = helvetica.widthOfTextAtSize(footerText1, 8);
  const footer2Width = helvetica.widthOfTextAtSize(footerText2, 8);
  
  page.drawText(footerText1, { 
    x: leftMargin + (contentWidth - footer1Width) / 2, 
    y: footerY + 15, 
    size: 8, 
    font: helvetica, 
    color: BRAND_COLORS.dark 
  });
  page.drawText(footerText2, { 
    x: leftMargin + (contentWidth - footer2Width) / 2, 
    y: footerY + 5, 
    size: 8, 
    font: helvetica, 
    color: BRAND_COLORS.dark 
  });
  
  const disclaimerText = 'This is a computer-generated Proforma Invoice and is valid without signature.';
  const disclaimerWidth = helveticaOblique.widthOfTextAtSize(disclaimerText, 7);
  page.drawText(disclaimerText, { 
    x: leftMargin + (contentWidth - disclaimerWidth) / 2, 
    y: footerY - 8, 
    size: 7, 
    font: helveticaOblique, 
    color: rgb(0.4, 0.4, 0.4),
  });
  
  return await pdfDoc.save();
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
    
    // Check for existing proforma (avoid duplicates)
    const proformaNo = `${order.so_id}-PI`;
    const { data: existingProforma } = await supabase
      .from('proforma_invoices')
      .select('id, file_path')
      .eq('sales_order_id', salesOrderId)
      .eq('proforma_no', proformaNo)
      .maybeSingle();
    
    // If proforma already exists, return signed URL for existing file
    if (existingProforma?.file_path) {
      console.log('Proforma already exists, returning signed URL');
      
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('proforma-invoices')
        .createSignedUrl(existingProforma.file_path, 3600);
      
      if (signedUrlError) {
        throw new Error(`Failed to create signed URL: ${signedUrlError.message}`);
      }
      
      return new Response(JSON.stringify({
        success: true,
        proformaId: existingProforma.id,
        proformaNo,
        downloadUrl: signedUrlData.signedUrl,
        isExisting: true
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
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
    
    // Calculate advance payment
    let advancePercent = 0;
    let advanceAmount = 0;
    if (order.advance_payment) {
      if (order.advance_payment.type === 'percentage') {
        advancePercent = order.advance_payment.value || 0;
        advanceAmount = order.advance_payment.calculated_amount || (totalAmount * advancePercent / 100);
      } else {
        advanceAmount = order.advance_payment.value || order.advance_payment.calculated_amount || 0;
      }
    }
    
    // Generate professional PDF
    console.log('Generating professional PDF with branding...');
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
    });
    
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
    
    console.log(`Proforma ${proformaNo} generated successfully with professional formatting`);
    
    return new Response(JSON.stringify({
      success: true,
      proformaId: proformaRecord.id,
      proformaNo,
      downloadUrl: signedUrlData.signedUrl,
      isExisting: false
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
