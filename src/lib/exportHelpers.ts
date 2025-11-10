import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

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

export const downloadExcel = (data: any[], filename: string, sheetName: string = 'Data') => {
  if (data.length === 0) return;

  // Create a new workbook
  const workbook = XLSX.utils.book_new();
  
  // Convert data to worksheet
  const worksheet = XLSX.utils.json_to_sheet(data);
  
  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  
  // Generate Excel file and trigger download
  XLSX.writeFile(workbook, `${filename}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
};

export const downloadDashboardPDF = (
  title: string,
  stats: Record<string, any>,
  charts: { title: string; data: any[] }[]
) => {
  const doc = new jsPDF();
  let yPosition = 15;
  
  // Add title
  doc.setFontSize(20);
  doc.text(title, 14, yPosition);
  yPosition += 10;
  
  // Add date
  doc.setFontSize(10);
  doc.text(`Generated: ${format(new Date(), 'MMM dd, yyyy HH:mm')}`, 14, yPosition);
  yPosition += 15;
  
  // Add stats summary
  doc.setFontSize(14);
  doc.text('Key Metrics', 14, yPosition);
  yPosition += 8;
  
  doc.setFontSize(10);
  Object.entries(stats).forEach(([key, value]) => {
    const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    doc.text(`${label}: ${value}`, 14, yPosition);
    yPosition += 6;
    
    if (yPosition > 270) {
      doc.addPage();
      yPosition = 15;
    }
  });
  
  // Add charts data
  charts.forEach((chart) => {
    if (yPosition > 200) {
      doc.addPage();
      yPosition = 15;
    }
    
    yPosition += 10;
    doc.setFontSize(12);
    doc.text(chart.title, 14, yPosition);
    yPosition += 8;
    
    if (chart.data.length > 0) {
      const columns = Object.keys(chart.data[0]).map(key => ({
        header: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        dataKey: key
      }));
      
      autoTable(doc, {
        startY: yPosition,
        head: [columns.map(col => col.header)],
        body: chart.data.map(row => columns.map(col => row[col.dataKey] ?? '')),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [59, 130, 246] },
      });
      
      yPosition = (doc as any).lastAutoTable.finalY + 10;
    }
  });
  
  doc.save(`${title.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
};

export const formatExternalWIP = (externalWip: any): string => {
  if (!externalWip || Object.keys(externalWip).length === 0) return '-';
  return Object.entries(externalWip)
    .map(([process, qty]) => `${process}: ${qty}`)
    .join(' / ');
};
