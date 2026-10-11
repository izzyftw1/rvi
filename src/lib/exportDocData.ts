import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { prepareLetterhead } from '@/lib/pdfLetterhead';
import { downloadCommercialInvoice, CommercialInvoiceData } from '@/lib/commercialInvoiceGenerator';
import { downloadTaxInvoice } from '@/lib/taxInvoiceGenerator';
import { paymentTermsFromSO } from '@/components/dispatch/ShipmentDetailsDialog';

export interface Packaging { boxes: number; pallets: number; grossKg: number; netKg: number }

/** Boxes, pallets and actual weights from the cartons. */
export const loadPackaging = async (cartonIds: string[]): Promise<Packaging> => {
  const ids = Array.from(new Set(cartonIds.filter(Boolean)));
  if (ids.length === 0) return { boxes: 0, pallets: 0, grossKg: 0, netKg: 0 };
  const [{ data: cartons }, { data: pc }] = await Promise.all([
    supabase.from('cartons').select('id, num_cartons, num_pallets, gross_weight, net_weight').in('id', ids),
    supabase.from('pallet_cartons').select('pallet_id, carton_id').in('carton_id', ids),
  ]);
  const boxes = (cartons || []).reduce((s, c) => s + (c.num_cartons || 1), 0);
  const palletIds = new Set((pc || []).map(p => p.pallet_id));
  const pallets = palletIds.size || (cartons || []).reduce((s, c) => s + (c.num_pallets || 0), 0);
  const grossKg = (cartons || []).reduce((s, c) => s + Number(c.gross_weight || 0), 0);
  const netKg = (cartons || []).reduce((s, c) => s + Number(c.net_weight || 0), 0);
  return { boxes, pallets, grossKg, netKg };
};

export const loadItemMeta = async (codes: string[]) => {
  const list = Array.from(new Set(codes.filter(Boolean)));
  const map: Record<string, { hs_code: string | null; goods_heading: string | null }> = {};
  if (list.length === 0) return map;
  const { data } = await supabase.from('item_master').select('item_code, hs_code, goods_heading').in('item_code', list);
  (data || []).forEach(r => { map[r.item_code] = { hs_code: r.hs_code, goods_heading: r.goods_heading }; });
  return map;
};

const fmt = (d?: string | null) => (d ? format(new Date(d), 'dd-MMM-yyyy') : undefined);

/** Download the right legal document for a saved invoice: commercial (export) or GST tax invoice. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const downloadInvoicePdf = async (invoice: any, items: any[]) => {
  await prepareLetterhead();
  const customer = invoice.customer_master || {};
  const meta = await loadItemMeta(items.map(i => i.item_code));
  const currency = invoice.currency || 'INR';

  if (!invoice.is_export) {
    downloadTaxInvoice({
      invoiceNo: invoice.invoice_no,
      invoiceDate: fmt(invoice.invoice_date) || '',
      poNumber: invoice.po_number || undefined,
      poDate: fmt(invoice.po_date),
      buyer: {
        name: customer.customer_name || '',
        address: invoice.customer_address || [customer.address_line_1, customer.city, customer.pincode].filter(Boolean).join(', '),
        state: customer.state || undefined,
        gstin: invoice.customer_gst || customer.gst_number || undefined,
      },
      currency,
      lines: items.map(i => ({ description: i.description, itemCode: i.item_code, hsCode: meta[i.item_code]?.hs_code || undefined, quantity: i.quantity, rate: Number(i.rate), amount: Number(i.amount) })),
      subtotal: Number(invoice.subtotal || 0),
      gstType: invoice.gst_type,
      gstPercent: Number(invoice.gst_percent || 0),
      cgst: Number(invoice.cgst_amount || 0),
      sgst: Number(invoice.sgst_amount || 0),
      igst: Number(invoice.igst_amount || 0),
      total: Number(invoice.total_amount || 0),
      lessAdvance: Number(invoice.advance_applied || 0),
    });
    return;
  }

  // Export: shipment cartons for packages/weights, SO for incoterm + payment terms
  const dnIds = items.map(i => i.dispatch_note_id).filter(Boolean);
  const [{ data: dns }, { data: so }] = await Promise.all([
    dnIds.length ? supabase.from('dispatch_notes').select('carton_id').in('id', dnIds) : Promise.resolve({ data: [] as { carton_id: string | null }[] }),
    invoice.so_id ? supabase.from('sales_orders').select('incoterm, payment_terms_days, advance_percent, po_number, po_date').eq('id', invoice.so_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const pkg = await loadPackaging((dns || []).map(d => d.carton_id as string));

  const data: CommercialInvoiceData = {
    invoiceNo: invoice.invoice_no,
    invoiceDate: fmt(invoice.invoice_date) || '',
    poNumber: invoice.po_number || so?.po_number || undefined,
    poDate: fmt(invoice.po_date || so?.po_date),
    consignee: {
      name: customer.customer_name || '',
      addressLine1: customer.address_line_1 || '',
      city: customer.city || '',
      state: customer.state || '',
      postalCode: customer.pincode || '',
      country: customer.country || '',
      eori: customer.eori_number || undefined,
    },
    notifyPartySameAsConsignee: true,
    countryOfOrigin: invoice.country_of_origin || 'India',
    finalDestination: invoice.final_destination || customer.country || '',
    portOfLoading: invoice.port_of_loading || undefined,
    portOfDischarge: invoice.port_of_discharge || undefined,
    vesselFlightNo: invoice.vessel_flight || undefined,
    incoterm: invoice.incoterm || so?.incoterm || undefined,
    termsOfPayment: invoice.payment_terms_text || paymentTermsFromSO(so as any) || (invoice.payment_terms_days ? `NET ${invoice.payment_terms_days} DAYS` : undefined),
    preCarriageBy: invoice.pre_carriage_by || 'N.A.',
    placeOfReceipt: invoice.place_of_receipt || 'N.A.',
    blNumber: invoice.bl_no || undefined,
    blDate: fmt(invoice.bl_date),
    marksAndNumbers: invoice.marks_nos || customer.default_marks_numbers || undefined,
    kindOfPackages: invoice.kind_of_packages || 'boxes',
    numberOfPackages: pkg.boxes || undefined,
    numberOfPallets: pkg.pallets || undefined,
    grossWeightKg: pkg.grossKg || Number(invoice.total_gross_weight || 0),
    netWeightKg: pkg.netKg || Number(invoice.total_net_weight || 0),
    lineItems: items.map((i, idx) => ({
      srNo: idx + 1,
      itemCode: i.item_code,
      description: i.description,
      hsCode: meta[i.item_code]?.hs_code || invoice.hs_code || undefined,
      goodsHeading: meta[i.item_code]?.goods_heading || undefined,
      quantity: i.quantity,
      unit: 'Pcs',
      rate: Number(i.rate),
      rateBasis: 'Per PCS',
      total: Number(i.amount),
    })),
    currency,
    totalQuantity: items.reduce((s, i) => s + i.quantity, 0),
    totalAmount: Number(invoice.subtotal || invoice.total_amount || 0),
    lessAdvance: Number(invoice.advance_applied || 0),
  };
  downloadCommercialInvoice(data);
};
