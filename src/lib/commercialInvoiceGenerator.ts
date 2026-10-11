import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { newLetterheadDoc, finalizeLetterhead, tableMargin, ensureSpace, getCompany } from '@/lib/pdfLetterhead';
import { amountInWords, currencySymbol, currencyRateName } from '@/lib/amountInWords';

declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable: {
      finalY: number;
    };
  }
}

const NAVY: [number, number, number] = [30, 74, 141];
const LIGHT: [number, number, number] = [240, 243, 248];

export interface CommercialInvoiceLineItem {
  srNo: number;
  itemCode: string;
  description: string;
  hsCode?: string;
  /** Goods heading, e.g. "HOSE CONNECTORS"; lines are grouped by heading + HS code. */
  goodsHeading?: string;
  quantity: number;
  unit: string;
  rate: number;
  rateBasis: string;
  total: number;
}

export interface CommercialInvoiceData {
  invoiceNo: string;
  financialYear?: string;
  invoiceDate: string;
  poNumber?: string;
  poDate?: string;

  consignee: {
    name: string;
    addressLine1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country: string;
    contact?: string;
    email?: string;
    gst?: string;
    eori?: string;
  };

  notifyParty?: { name: string; address: string };
  notifyPartySameAsConsignee: boolean;

  preCarriageBy?: string;
  placeOfReceipt?: string;
  countryOfOrigin: string;
  /** Country of final destination */
  finalDestination: string;
  /** Final destination (city/place); defaults to country */
  finalDestinationPlace?: string;
  portOfLoading?: string;
  vesselFlightNo?: string;
  portOfDischarge?: string;
  termsOfPayment?: string;
  blNumber?: string;
  blDate?: string;
  incoterm?: string;

  marksAndNumbers?: string;
  kindOfPackages?: string;
  numberOfPackages?: number;
  numberOfPallets?: number;

  grossWeightKg: number;
  netWeightKg: number;

  lineItems: CommercialInvoiceLineItem[];

  currency: string;
  totalQuantity: number;
  totalAmount: number;
  /** Advance actually applied on this invoice */
  lessAdvance?: number;

  declarationText?: string;
  signatureDate?: string;
  signatoryDesignation?: string;
}

const kv = (label: string, value?: string) => ({ label, value: value && value.trim() ? value : '—' });

export const generateCommercialInvoicePDF = (data: CommercialInvoiceData): jsPDF => {
  const co = getCompany();
  const { doc, y: startY } = newLetterheadDoc();
  const margin = tableMargin(doc);
  const sym = currencySymbol(data.currency);
  const money = (n: number) => `${sym}${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  let y = startY;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...NAVY);
  doc.text('COMMERCIAL INVOICE', 105, y + 3, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 7;

  const buyer = [
    data.consignee.name,
    data.consignee.addressLine1,
    [data.consignee.city, data.consignee.state, data.consignee.postalCode].filter(Boolean).join(', '),
    data.consignee.country,
    data.consignee.eori ? `EORI No.: ${data.consignee.eori}` : '',
  ].filter(Boolean).join('\n');

  const seller = [
    co.name,
    co.address,
    co.gstin ? `GSTIN: ${co.gstin}` : '',
    co.iec ? `IEC: ${co.iec}` : '',
  ].filter(Boolean).join('\n');

  const invRef = [
    `Invoice No.: ${data.invoiceNo}${data.financialYear ? `/${data.financialYear}` : ''}`,
    `Date: ${data.invoiceDate}`,
    `Buyer's PO No.: ${data.poNumber || '—'}`,
    `PO Date: ${data.poDate || '—'}`,
  ].join('\n');

  const notify = data.notifyPartySameAsConsignee || !data.notifyParty
    ? 'As above'
    : `${data.notifyParty.name}\n${data.notifyParty.address}`;

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    margin,
    styles: { fontSize: 7.5, cellPadding: 1.8, valign: 'top', lineColor: [160, 160, 160] },
    headStyles: { fillColor: LIGHT, textColor: [0, 0, 0], fontStyle: 'bold' },
    head: [['Exporter', 'Invoice']],
    body: [[seller, invRef]],
    columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: 80 } },
  });
  y = doc.lastAutoTable.finalY;

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    margin,
    styles: { fontSize: 7.5, cellPadding: 1.8, valign: 'top', lineColor: [160, 160, 160] },
    headStyles: { fillColor: LIGHT, textColor: [0, 0, 0], fontStyle: 'bold' },
    head: [['Buyer / Consignee', 'Notify Party']],
    body: [[buyer, notify]],
    columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: 80 } },
  });
  y = doc.lastAutoTable.finalY;

  const ship = [
    [kv('Pre-Carriage By', data.preCarriageBy), kv('Place of Receipt by Pre-Carrier', data.placeOfReceipt), kv('Country of Origin of Goods', data.countryOfOrigin || 'India'), kv('Country of Final Destination', data.finalDestination)],
    [kv('Port of Loading', data.portOfLoading), kv('Vessel / Flight No.', data.vesselFlightNo?.trim() || 'BY SEA'), kv('Port of Discharge', data.portOfDischarge), kv('Final Destination', data.finalDestinationPlace || data.finalDestination)],
    [kv('Terms of Delivery & Payment', [data.incoterm, data.termsOfPayment].filter(Boolean).join(' — ')), kv('BL No. & Date', [data.blNumber, data.blDate].filter(Boolean).join(' / ')), kv('Gross Weight (kg)', data.grossWeightKg ? data.grossWeightKg.toFixed(3) : ''), kv('Net Weight (kg)', data.netWeightKg ? data.netWeightKg.toFixed(3) : '')],
  ];
  autoTable(doc, {
    startY: y,
    theme: 'grid',
    margin,
    styles: { fontSize: 7.5, cellPadding: 1.6, lineColor: [160, 160, 160] },
    body: ship.map(r => r.map(c => `${c.label}\n${c.value}`)),
    didParseCell: (h) => { h.cell.styles.fontStyle = 'normal'; },
    columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: 45 }, 2: { cellWidth: 45 }, 3: { cellWidth: 45 } },
  });
  y = doc.lastAutoTable.finalY;

  const boxes = data.numberOfPackages || 0;
  const pallets = data.numberOfPallets || 0;
  const pkgText = boxes
    ? `${boxes} ${data.kindOfPackages?.toLowerCase() || 'boxes'}${pallets ? ` in ${pallets} pallet${pallets === 1 ? '' : 's'}` : ''}`
    : (data.kindOfPackages || '—');
  autoTable(doc, {
    startY: y,
    theme: 'grid',
    margin,
    styles: { fontSize: 7.5, cellPadding: 1.6, lineColor: [160, 160, 160] },
    body: [[`Marks & Nos.\n${data.marksAndNumbers || '—'}`, `No. & Kind of Packages\n${pkgText}`]],
    columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 90 } },
  });
  y = doc.lastAutoTable.finalY + 2;

  // Line items grouped by goods heading + HS code
  const rateHead = `Rate ${data.incoterm ? `${data.incoterm}-` : ''}${currencyRateName(data.currency)} per pcs`;
  const groups = new Map<string, CommercialInvoiceLineItem[]>();
  data.lineItems.forEach(li => {
    const head = li.goodsHeading || li.hsCode
      ? `${(li.goodsHeading || 'GOODS').toUpperCase()}${li.hsCode ? ` (CETH-${li.hsCode})` : ''}`
      : '';
    groups.set(head, [...(groups.get(head) || []), li]);
  });
  const body: any[] = [];
  let sr = 1;
  groups.forEach((items, head) => {
    if (head) body.push([{ content: head, colSpan: 5, styles: { fontStyle: 'bold', fillColor: LIGHT } }]);
    items.forEach(li => {
      body.push([
        String(sr++),
        `${li.description}${li.itemCode && li.itemCode !== li.description ? `\nItem Code: ${li.itemCode}` : ''}`,
        li.quantity.toLocaleString('en-GB'),
        `${sym}${li.rate.toFixed(4)}`,
        money(li.total),
      ]);
    });
  });

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    margin,
    head: [['Sr', 'Description of Goods', 'Qty (pcs)', rateHead, `Amount ${data.currency}`]],
    body,
    styles: { fontSize: 7.5, cellPadding: 1.6, lineColor: [160, 160, 160] },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 82 },
      2: { cellWidth: 24, halign: 'right' },
      3: { cellWidth: 32, halign: 'right' },
      4: { cellWidth: 32, halign: 'right' },
    },
  });
  y = doc.lastAutoTable.finalY;

  const lessAdvance = Math.max(0, data.lessAdvance || 0);
  const net = Math.round((data.totalAmount - lessAdvance) * 100) / 100;
  const totals: any[] = [
    [{ content: 'Total', styles: { fontStyle: 'bold' } }, { content: data.totalQuantity.toLocaleString('en-GB'), styles: { halign: 'right', fontStyle: 'bold' } }, '', { content: money(data.totalAmount), styles: { halign: 'right', fontStyle: 'bold' } }],
  ];
  if (lessAdvance > 0) {
    totals.push(['Less advance', '', '', { content: `- ${money(lessAdvance)}`, styles: { halign: 'right' } }]);
  }
  totals.push([{ content: 'Net payable', styles: { fontStyle: 'bold' } }, '', '', { content: money(net), styles: { halign: 'right', fontStyle: 'bold' } }]);
  autoTable(doc, {
    startY: y,
    theme: 'grid',
    margin,
    body: totals,
    styles: { fontSize: 8, cellPadding: 1.6, lineColor: [160, 160, 160] },
    columnStyles: { 0: { cellWidth: 92 }, 1: { cellWidth: 24 }, 2: { cellWidth: 32 }, 3: { cellWidth: 32 } },
  });
  y = doc.lastAutoTable.finalY + 4;

  y = ensureSpace(doc, y, 40);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Amount chargeable (in words):', 15, y);
  doc.setFont('helvetica', 'normal');
  const words = doc.splitTextToSize(amountInWords(net, data.currency), 180);
  doc.text(words, 15, y + 4);
  y += 4 + words.length * 4 + 2;

  if (co.lutArn) {
    doc.setFont('helvetica', 'bold');
    doc.text(`Supply meant for export under LUT without payment of IGST — LUT ARN ${co.lutArn}`, 15, y, { maxWidth: 180 });
    y += 6;
  }

  doc.setFont('helvetica', 'bold');
  doc.text('Declaration:', 15, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const decl = doc.splitTextToSize(
    data.declarationText || 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
    110,
  );
  doc.text(decl, 15, y + 4);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(`For ${co.name}`, 195, y, { align: 'right' });
  doc.text(data.signatoryDesignation || co.signatory || 'Proprietor', 195, y + 18, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${data.signatureDate || data.invoiceDate}`, 15, y + 18);

  return finalizeLetterhead(doc);
};

export const downloadCommercialInvoice = (data: CommercialInvoiceData): void => {
  const doc = generateCommercialInvoicePDF(data);
  doc.save(`Commercial_Invoice_${data.invoiceNo.replace(/\//g, '-')}.pdf`);
};

// Helper to check which fields are missing for export invoice generation
export interface MissingExportFields {
  portOfLoading?: boolean;
  portOfDischarge?: boolean;
  vesselFlightNo?: boolean;
  termsOfPayment?: boolean;
  blNumber?: boolean;
  blDate?: boolean;
  numberOfPackages?: boolean;
  kindOfPackages?: boolean;
}

export const getMissingExportFields = (data: Partial<CommercialInvoiceData>): MissingExportFields => {
  const missing: MissingExportFields = {};
  
  if (!data.portOfLoading) missing.portOfLoading = true;
  if (!data.portOfDischarge) missing.portOfDischarge = true;
  if (!data.vesselFlightNo) missing.vesselFlightNo = true;
  if (!data.termsOfPayment) missing.termsOfPayment = true;
  // BL Number/Date are optional (can be blank)
  if (!data.numberOfPackages) missing.numberOfPackages = true;
  if (!data.kindOfPackages) missing.kindOfPackages = true;
  
  return missing;
};

export const hasMissingExportFields = (data: Partial<CommercialInvoiceData>): boolean => {
  return Object.keys(getMissingExportFields(data)).length > 0;
};