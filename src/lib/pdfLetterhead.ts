import jsPDF from 'jspdf';
import { supabase } from '@/integrations/supabase/client';

/**
 * Shared A4 letterhead for every generated document (PI, tax/commercial invoice,
 * packing list, dispatch note, QC reports). Header and footer images come from
 * the `branding` storage bucket; company details come from finance_settings.
 * Call `prepareLetterhead()` (async) before generating; generators stay synchronous.
 */

export interface CompanyProfile {
  name: string;
  address: string;
  phones: string;
  email: string;
  website: string;
  gstin: string;
  iec: string;
  udyam: string;
  signatory: string;
  lutArn: string | null;
}

interface LoadedImage { data: string; w: number; h: number }

const EMPTY_COMPANY: CompanyProfile = {
  name: '', address: '', phones: '', email: '', website: '', gstin: '', iec: '', udyam: '', signatory: '', lutArn: null,
};

let company: CompanyProfile = EMPTY_COMPANY;
let headerImg: LoadedImage | null = null;
let footerImg: LoadedImage | null = null;
let loaded = false;

export const BRANDING_BUCKET = 'branding';
export const HEADER_FILE = 'letterhead_header.png';
export const FOOTER_FILE = 'letterhead_footer.png';

const PAGE_W = 210;
const MARGIN_X = 15;

const blobToImage = (blob: Blob): Promise<LoadedImage> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result as string;
      const img = new Image();
      img.onload = () => resolve({ data, w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = reject;
      img.src = data;
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const loadImage = async (file: string): Promise<LoadedImage | null> => {
  const { data, error } = await supabase.storage.from(BRANDING_BUCKET).download(file);
  if (error || !data) return null;
  try { return await blobToImage(data); } catch { return null; }
};

export const prepareLetterhead = async (force = false): Promise<void> => {
  if (loaded && !force) return;
  const [{ data: s }, h, f] = await Promise.all([
    supabase.from('finance_settings').select('*').maybeSingle(),
    loadImage(HEADER_FILE),
    loadImage(FOOTER_FILE),
  ]);
  if (s) {
    company = {
      name: s.company_name, address: s.company_address, phones: s.company_phones, email: s.company_email,
      website: s.company_website, gstin: s.company_gstin, iec: s.company_iec, udyam: s.company_udyam,
      signatory: s.signatory_designation, lutArn: s.lut_arn,
    };
  }
  headerImg = h;
  footerImg = f;
  loaded = true;
};

export const getCompany = (): CompanyProfile => company;

const imgHeight = (img: LoadedImage) => (PAGE_W * img.h) / img.w;

/** Height (mm) reserved at the top of each page. */
export const headerHeight = (): number => (headerImg ? imgHeight(headerImg) : 30) + 4;
/** Height (mm) reserved at the bottom of each page (incl. page number). */
export const footerHeight = (): number => (footerImg ? imgHeight(footerImg) : 14) + 6;

/** Y where content starts on every page. */
export const contentTop = (): number => headerHeight() + 2;
/** Y below which content must not go. */
export const contentBottom = (doc: jsPDF): number => doc.internal.pageSize.height - footerHeight();
/** autoTable margin keeping tables between header and footer on every page. */
export const tableMargin = (doc: jsPDF) => ({ top: contentTop(), bottom: footerHeight() + 2, left: MARGIN_X, right: MARGIN_X });

/** Adds a page break if `needed` mm won't fit; returns the y to continue at. */
export const ensureSpace = (doc: jsPDF, y: number, needed: number): number => {
  if (y + needed <= contentBottom(doc)) return y;
  doc.addPage();
  return contentTop();
};

const drawTextHeader = (doc: jsPDF) => {
  doc.setTextColor(30, 74, 141);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(company.name.toUpperCase(), PAGE_W / 2, 12, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(33, 33, 33);
  doc.text(company.address, PAGE_W / 2, 18, { align: 'center', maxWidth: 180 });
  doc.text([company.phones && `Ph: ${company.phones}`, company.email, company.website].filter(Boolean).join(' | '), PAGE_W / 2, 26, { align: 'center' });
  doc.setDrawColor(30, 74, 141);
  doc.setLineWidth(0.6);
  doc.line(MARGIN_X, 30, PAGE_W - MARGIN_X, 30);
};

const drawTextFooter = (doc: jsPDF) => {
  const ph = doc.internal.pageSize.height;
  const y = ph - footerHeight() + 3;
  doc.setDrawColor(30, 74, 141);
  doc.setLineWidth(0.4);
  doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(80, 80, 80);
  doc.text(company.address, PAGE_W / 2, y + 4, { align: 'center', maxWidth: 180 });
  doc.text(
    [company.phones && `Ph: ${company.phones}`, company.email, company.gstin && `GSTIN: ${company.gstin}`, company.iec && `IEC: ${company.iec}`, company.udyam].filter(Boolean).join(' | '),
    PAGE_W / 2, y + 10, { align: 'center', maxWidth: 190 },
  );
};

/** Draws header + footer + page numbers on every page. Call once, right before save/output. */
export const finalizeLetterhead = (doc: jsPDF): jsPDF => {
  const total = doc.getNumberOfPages();
  const ph = doc.internal.pageSize.height;
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    if (headerImg) doc.addImage(headerImg.data, 'PNG', 0, 0, PAGE_W, imgHeight(headerImg));
    else drawTextHeader(doc);
    if (footerImg) {
      const fh = imgHeight(footerImg);
      doc.addImage(footerImg.data, 'PNG', 0, ph - fh, PAGE_W, fh);
    } else drawTextFooter(doc);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(128, 128, 128);
    doc.text(`Page ${i} of ${total}`, PAGE_W - MARGIN_X, ph - footerHeight() + 1, { align: 'right' });
  }
  doc.setTextColor(0, 0, 0);
  return doc;
};

/** New A4 document; returns the doc and the content start Y. */
export const newLetterheadDoc = (): { doc: jsPDF; y: number } => {
  const doc = new jsPDF({ format: 'a4', unit: 'mm' });
  return { doc, y: contentTop() };
};

/** Seller block lines (for invoices). */
export const sellerLines = (): string[] => [
  company.name,
  company.address,
  [company.phones && `Ph: ${company.phones}`, company.email].filter(Boolean).join(' | '),
  [company.gstin && `GSTIN: ${company.gstin}`, company.iec && `IEC: ${company.iec}`].filter(Boolean).join('   '),
].filter(Boolean);
