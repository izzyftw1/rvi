import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

export const downloadCSV = (data: any[], filename: string) => {
  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        // Escape commas and quotes
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value ?? '';
      }).join(',')
    )
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
  link.click();
};

export const downloadPDF = (
  data: any[], 
  filename: string, 
  title: string,
  columns: { header: string; dataKey: string }[]
) => {
  const doc = new jsPDF();
  
  // Add title
  doc.setFontSize(16);
  doc.text(title, 14, 15);
  
  // Add date
  doc.setFontSize(10);
  doc.text(`Generated: ${format(new Date(), 'MMM dd, yyyy HH:mm')}`, 14, 22);
  
  // Add table
  autoTable(doc, {
    startY: 28,
    head: [columns.map(col => col.header)],
    body: data.map(row => columns.map(col => row[col.dataKey] ?? '')),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [59, 130, 246] },
  });
  
  doc.save(`${filename}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
};

export const formatExternalWIP = (externalWip: any): string => {
  if (!externalWip || Object.keys(externalWip).length === 0) return '-';
  return Object.entries(externalWip)
    .map(([process, qty]) => `${process}: ${qty}`)
    .join(' / ');
};
