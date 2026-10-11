import autoTable from 'jspdf-autotable';
import { newLetterheadDoc, finalizeLetterhead, tableMargin, ensureSpace, getCompany } from '@/lib/pdfLetterhead';
import { amountInWords, currencySymbol } from '@/lib/amountInWords';

export interface TaxInvoiceData {
  invoiceNo: string;
  invoiceDate: string;
  poNumber?: string;
  poDate?: string;
  buyer: { name: string; address: string; state?: string; gstin?: string };
  currency: string;
  lines: { description: string; itemCode?: string; hsCode?: string; quantity: number; rate: number; amount: number }[];
  subtotal: number;
  gstType?: string | null;
  gstPercent: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  lessAdvance?: number;
}

/** Domestic GST tax invoice on the shared letterhead. */
export const downloadTaxInvoice = (d: TaxInvoiceData) => {
  const co = getCompany();
  const { doc, y: startY } = newLetterheadDoc();
  const margin = tableMargin(doc);
  const sym = currencySymbol(d.currency);
  const m = (n: number) => `${sym}${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  let y = startY;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('TAX INVOICE', 105, y + 3, { align: 'center' });
  y += 7;

  autoTable(doc, {
    startY: y, theme: 'grid', margin,
    styles: { fontSize: 7.5, cellPadding: 1.8, valign: 'top' },
    headStyles: { fillColor: [240, 243, 248], textColor: [0, 0, 0] },
    head: [['Supplier', 'Buyer', 'Invoice']],
    body: [[
      [co.name, co.address, co.gstin && `GSTIN: ${co.gstin}`].filter(Boolean).join('\n'),
      [d.buyer.name, d.buyer.address, d.buyer.state && `State: ${d.buyer.state}`, d.buyer.gstin && `GSTIN: ${d.buyer.gstin}`].filter(Boolean).join('\n'),
      [`No.: ${d.invoiceNo}`, `Date: ${d.invoiceDate}`, d.poNumber && `PO: ${d.poNumber}`, d.poDate && `PO Date: ${d.poDate}`].filter(Boolean).join('\n'),
    ]],
    columnStyles: { 0: { cellWidth: 65 }, 1: { cellWidth: 65 }, 2: { cellWidth: 50 } },
  });
  y = doc.lastAutoTable.finalY + 2;

  autoTable(doc, {
    startY: y, theme: 'grid', margin,
    head: [['Sr', 'Description', 'HSN', 'Qty', 'Rate', 'Amount']],
    body: d.lines.map((l, i) => [String(i + 1), `${l.description}${l.itemCode && l.itemCode !== l.description ? `\n${l.itemCode}` : ''}`, l.hsCode || '', l.quantity.toLocaleString('en-IN'), `${sym}${l.rate.toFixed(4)}`, m(l.amount)]),
    styles: { fontSize: 7.5, cellPadding: 1.6 },
    headStyles: { fillColor: [30, 74, 141] },
    columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 72 }, 2: { cellWidth: 20 }, 3: { cellWidth: 22, halign: 'right' }, 4: { cellWidth: 26, halign: 'right' }, 5: { cellWidth: 30, halign: 'right' } },
  });
  y = doc.lastAutoTable.finalY;

  const rows: any[] = [['Taxable value', m(d.subtotal)]];
  if (d.igst > 0) rows.push([`IGST @ ${d.gstPercent}%`, m(d.igst)]);
  if (d.cgst > 0) rows.push([`CGST @ ${d.gstPercent / 2}%`, m(d.cgst)]);
  if (d.sgst > 0) rows.push([`SGST @ ${d.gstPercent / 2}%`, m(d.sgst)]);
  rows.push([{ content: 'Invoice total', styles: { fontStyle: 'bold' } }, { content: m(d.total), styles: { fontStyle: 'bold' } }]);
  const adv = Math.max(0, d.lessAdvance || 0);
  const net = Math.round((d.total - adv) * 100) / 100;
  if (adv > 0) {
    rows.push(['Less advance', `- ${m(adv)}`]);
    rows.push([{ content: 'Net payable', styles: { fontStyle: 'bold' } }, { content: m(net), styles: { fontStyle: 'bold' } }]);
  }
  autoTable(doc, {
    startY: y, theme: 'grid', margin: { ...margin, left: 105 },
    body: rows, styles: { fontSize: 8, cellPadding: 1.6 },
    columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 30, halign: 'right' } },
  });
  y = doc.lastAutoTable.finalY + 4;

  y = ensureSpace(doc, y, 34);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Amount in words:', 15, y);
  doc.setFont('helvetica', 'normal');
  const words = doc.splitTextToSize(amountInWords(net, d.currency), 180);
  doc.text(words, 15, y + 4);
  y += 6 + words.length * 4;
  doc.setFont('helvetica', 'bold');
  doc.text(`For ${co.name}`, 195, y, { align: 'right' });
  doc.text(co.signatory || 'Proprietor', 195, y + 16, { align: 'right' });

  finalizeLetterhead(doc);
  doc.save(`Tax_Invoice_${d.invoiceNo.replace(/\//g, '-')}.pdf`);
};
