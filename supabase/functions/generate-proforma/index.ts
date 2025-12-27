import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

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

// Generate PDF content using jsPDF-compatible structure
// Since we can't use jsPDF in Deno, we'll generate a proper PDF manually
// Using a simplified approach with PDF primitives

function generatePdfBytes(data: {
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
}): Uint8Array {
  // Create a simple PDF structure
  // This is a minimal PDF that will display the proforma invoice information
  
  const encoder = new TextEncoder();
  
  // Build content string for the PDF
  const lines: string[] = [];
  
  // Header
  lines.push("R.V. INDUSTRIES");
  lines.push("Precision Brass Components");
  lines.push("Plot No 11, 12/1 & 12/2, Sadguru Industrial Area, Jamnagar - 361006 (Gujarat) India");
  lines.push("");
  lines.push("PROFORMA INVOICE");
  lines.push("");
  lines.push(`Proforma Invoice No: ${data.proformaNo}`);
  lines.push(`Date: ${data.date}`);
  if (data.soId) lines.push(`Sales Order No: ${data.soId}`);
  if (data.poNumber) lines.push(`Customer PO No: ${data.poNumber}`);
  if (data.poDate) lines.push(`PO Date: ${data.poDate}`);
  if (data.validityDays) {
    const validDate = new Date();
    validDate.setDate(validDate.getDate() + data.validityDays);
    lines.push(`Valid Until: ${validDate.toLocaleDateString('en-GB')}`);
  }
  lines.push("");
  
  // Customer
  lines.push("Bill To:");
  lines.push(data.customer.name);
  if (data.customer.address) lines.push(data.customer.address);
  const location = [data.customer.city, data.customer.state, data.customer.pincode].filter(Boolean).join(', ');
  if (location) lines.push(location);
  if (data.customer.country) lines.push(data.customer.country);
  if (data.customer.gst_number && !data.isExport) lines.push(`GST No: ${data.customer.gst_number}`);
  lines.push("");
  
  // Items table header
  if (data.isExport) {
    lines.push("Sr | Item Code | Description | HS Code | Qty | Unit | Rate | Amount");
  } else {
    lines.push("Sr | Item Code | Description | Qty | Unit | Rate | Amount");
  }
  lines.push("-".repeat(80));
  
  // Items
  data.items.forEach((item, index) => {
    const desc = [item.description, item.material_grade].filter(Boolean).join(' - ') || 'As per specification';
    if (data.isExport) {
      lines.push(`${index + 1} | ${item.item_code || '-'} | ${desc} | ${item.hs_code || '-'} | ${item.quantity} | ${item.unit || 'PCS'} | ${item.price_per_pc?.toFixed(4) || '-'} | ${item.line_amount?.toFixed(2) || '-'}`);
    } else {
      lines.push(`${index + 1} | ${item.item_code || '-'} | ${desc} | ${item.quantity} | ${item.unit || 'PCS'} | ${item.price_per_pc?.toFixed(4) || '-'} | ${item.line_amount?.toFixed(2) || '-'}`);
    }
  });
  lines.push("-".repeat(80));
  lines.push("");
  
  // Totals
  lines.push(`Subtotal: ${data.currency} ${data.subtotal.toFixed(2)}`);
  if (!data.isExport && data.gstPercent > 0) {
    lines.push(`GST (${data.gstPercent}%): ${data.currency} ${data.gstAmount.toFixed(2)}`);
  }
  lines.push(`TOTAL: ${data.currency} ${data.totalAmount.toFixed(2)}`);
  lines.push("");
  
  // Payment Terms
  lines.push("Payment Terms:");
  if (data.advancePercent && data.advancePercent > 0) {
    lines.push(`Advance: ${data.advancePercent}% (${data.currency} ${(data.advanceAmount || 0).toFixed(2)})`);
    const balance = data.totalAmount - (data.advanceAmount || 0);
    lines.push(`Balance: ${data.currency} ${balance.toFixed(2)}`);
  }
  if (data.balanceTerms) {
    lines.push(`Terms: ${data.balanceTerms}`);
  } else if (data.paymentTermsDays) {
    lines.push(`Net ${data.paymentTermsDays} days`);
  }
  lines.push("");
  
  // Export details
  if (data.isExport) {
    lines.push("Export Details:");
    if (data.incoterm) lines.push(`Incoterms: ${data.incoterm}`);
    if (data.portOfLoading) lines.push(`Port of Loading: ${data.portOfLoading}`);
    if (data.portOfDischarge) lines.push(`Port of Discharge: ${data.portOfDischarge}`);
    lines.push(`Country of Origin: ${data.countryOfOrigin || 'India'}`);
    lines.push("");
  }
  
  // Bank Details
  lines.push("Bank Details for Remittance:");
  lines.push("Account Name: R.V. INDUSTRIES");
  lines.push("Bank Name: BANK OF BARODA");
  lines.push("Account No: 25970500001613");
  lines.push("Branch: S.S.I. Jamnagar");
  lines.push("IFSC Code: BARB0SSIJAM (5th character is Zero)");
  lines.push("Swift Code: BARBINBBRAN");
  lines.push("");
  
  // Notes
  if (data.notes) {
    lines.push(`Notes: ${data.notes}`);
    lines.push("");
  }
  
  // Footer
  lines.push("Email: sales@brasspartsindia.net | mitul@brasspartsindia.net");
  lines.push("Web: www.brasspartsindia.net | Ph: +91-288-2541871");
  lines.push("");
  lines.push("This is a computer-generated Proforma Invoice and is valid without signature.");
  
  const content = lines.join('\n');
  
  // Build minimal PDF structure
  // This creates a valid PDF 1.4 document
  const pdfContent = buildPdf(content);
  
  return encoder.encode(pdfContent);
}

function buildPdf(textContent: string): string {
  // Escape special PDF characters in text
  const escapeText = (text: string) => text.replace(/[()\\]/g, '\\$&');
  
  // Split content into lines for proper PDF text formatting
  const lines = textContent.split('\n');
  
  // Build text stream with proper positioning
  let textStream = 'BT\n';
  textStream += '/F1 10 Tf\n';
  textStream += '50 800 Td\n';
  textStream += '12 TL\n'; // Leading (line spacing)
  
  for (const line of lines) {
    textStream += `(${escapeText(line)}) Tj T*\n`;
  }
  textStream += 'ET';
  
  // Calculate stream length
  const streamBytes = new TextEncoder().encode(textStream);
  const streamLength = streamBytes.length;
  
  // Build PDF structure
  const objects: string[] = [];
  
  // Object 1: Catalog
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  
  // Object 2: Pages
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');
  
  // Object 3: Page
  objects.push('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj');
  
  // Object 4: Content stream
  objects.push(`4 0 obj\n<< /Length ${streamLength} >>\nstream\n${textStream}\nendstream\nendobj`);
  
  // Object 5: Font
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj');
  
  // Build PDF
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj + '\n';
  }
  
  // Cross-reference table
  const xrefOffset = pdf.length;
  pdf += 'xref\n';
  pdf += `0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets) {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  
  // Trailer
  pdf += 'trailer\n';
  pdf += `<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += 'startxref\n';
  pdf += `${xrefOffset}\n`;
  pdf += '%%EOF';
  
  return pdf;
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
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }
    
    // Verify the requesting user
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      throw new Error('Unauthorized: Invalid token');
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
        .createSignedUrl(existingProforma.file_path, 3600); // 1 hour expiry
      
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
    
    // Generate PDF bytes
    const pdfBytes = generatePdfBytes({
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
        file_url: signedUrlData.signedUrl, // Store signed URL
        generated_by: user.id,
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
    
    console.log(`Proforma ${proformaNo} generated successfully`);
    
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
    
  } catch (error: any) {
    console.error("Error in generate-proforma function:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
};

serve(handler);
