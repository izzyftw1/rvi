import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ProformaEmailRequest {
  proformaId: string;
  customerEmail: string;
  customerName: string;
  salesOrderNo: string;
  proformaNo: string;
  pdfUrl: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      proformaId,
      customerEmail, 
      customerName,
      salesOrderNo,
      proformaNo,
      pdfUrl
    }: ProformaEmailRequest = await req.json();

    if (!customerEmail || !pdfUrl) {
      throw new Error("Missing required fields: customerEmail and pdfUrl");
    }

    // Download PDF from Supabase Storage
    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) {
      throw new Error("Failed to download PDF from storage");
    }
    
    const pdfBuffer = await pdfResponse.arrayBuffer();
    const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)));

    // Send email with Resend
    const emailResponse = await resend.emails.send({
      from: "R.V. Industries <sales@brasspartsindia.net>",
      to: [customerEmail],
      subject: `Proforma Invoice ${proformaNo} - ${salesOrderNo}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
            <h2 style="color: #333; margin-top: 0;">R.V. Industries</h2>
            <p style="color: #666; font-size: 14px;">Manufacturer of HIGH PRECISION Brass & Stainless Steel Components</p>
          </div>
          
          <div style="padding: 30px 20px;">
            <p style="font-size: 16px; color: #333;">Dear ${customerName || 'Valued Customer'},</p>
            
            <p style="font-size: 14px; color: #666; line-height: 1.6;">
              Please find attached the Proforma Invoice <strong>${proformaNo}</strong> for Sales Order <strong>${salesOrderNo}</strong>.
            </p>
            
            <p style="font-size: 14px; color: #666; line-height: 1.6;">
              This document contains the pricing, terms, and conditions for your order. Please review it carefully and feel free to reach out if you have any questions.
            </p>
            
            <div style="background-color: #f1f3f5; padding: 15px; border-radius: 6px; margin: 20px 0;">
              <p style="font-size: 13px; color: #495057; margin: 0;">
                <strong>Next Steps:</strong><br>
                • Review the attached Proforma Invoice<br>
                • Confirm advance payment details<br>
                • Share your order confirmation
              </p>
            </div>
            
            <p style="font-size: 14px; color: #666; line-height: 1.6;">
              We look forward to serving you and delivering quality products.
            </p>
            
            <p style="font-size: 14px; color: #333; margin-top: 30px;">
              Best regards,<br>
              <strong>Sales Team</strong><br>
              R.V. Industries
            </p>
          </div>
          
          <div style="background-color: #212529; color: #adb5bd; padding: 20px; border-radius: 8px; text-align: center; font-size: 12px;">
            <p style="margin: 5px 0;">K-1/212, G.I.D.C. Shankar Tekri, Udyognagar, Jamnagar - 361004, Gujarat, India</p>
            <p style="margin: 5px 0;">Email: sales@brasspartsindia.net | Web: www.brasspartsindia.net</p>
            <p style="margin: 5px 0;">ISO 9001:2015 | TÜV SÜD | RoHS Compliant</p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: `${proformaNo}.pdf`,
          content: pdfBase64,
        },
      ],
    });

    if (emailResponse.error) {
      throw emailResponse.error;
    }

    // Update proforma_invoices record with sent timestamp
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    await supabase
      .from('proforma_invoices')
      .update({
        sent_to_email: customerEmail,
        sent_at: new Date().toISOString()
      })
      .eq('id', proformaId);

    console.log("Proforma email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ 
      success: true,
      message: "Proforma invoice sent successfully",
      emailId: emailResponse.id 
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-proforma-email function:", error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
