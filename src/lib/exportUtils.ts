import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { rubikFontBase64 } from './rubikFont';

const addBOM = (content: string) => '\ufeff' + content;

const registerHebrewFont = (doc: jsPDF) => {
  doc.addFileToVFS('Rubik-Regular.ttf', rubikFontBase64);
  doc.addFont('Rubik-Regular.ttf', 'Rubik', 'normal');
  doc.setFont('Rubik');
};

const isHebrew = (text: string) => /[\u0590-\u05FF]/.test(text);

const drawText = (doc: jsPDF, text: string, x: number, y: number, options?: any) => {
  const hebrew = isHebrew(text);
  doc.setR2L(hebrew);
  doc.text(text, x, y, options);
};

// Convert a mixed RTL/LTR string to visual LTR order for jsPDF (no setR2L).
// Hebrew runs are reversed internally; LTR runs kept as-is; run order is reversed.
// e.g. "\u05E6\u05E8\u05D9\u05DB\u05D4 (kWh)" \u2192 "(kWh) \u05D4\u05DB\u05D9\u05E8\u05E6" \u2192 renders as "\u05E6\u05E8\u05D9\u05DB\u05D4 (kWh)" when read R\u2192L.
const toVisualLTR = (text: string): string => {
  if (!isHebrew(text)) return text;

  // Split into alternating Hebrew / non-Hebrew segments (spaces attach to preceding run)
  const segs: Array<{ t: string; heb: boolean }> = [];
  for (const ch of text) {
    const heb = /[\u0590-\u05FF]/.test(ch);
    const neutral = ch === ' ';
    if (segs.length === 0) {
      segs.push({ t: ch, heb: neutral ? true : heb }); // space \u2192 join next
    } else {
      const last = segs[segs.length - 1];
      if (neutral || heb === last.heb) {
        last.t += ch;
      } else {
        segs.push({ t: ch, heb });
      }
    }
  }

  return segs
    .reverse()
    .map(s => s.heb ? s.t.split('').reverse().join('') : s.t.trim())
    .join(' ')
    .trim();
};

export const exportToCSV = (data: any[], headers: string[], fileName: string) => {
  const csvContent = [
    headers.join(','),
    ...data.map(row => row.map((cell: any) => {
      const str = String(cell);
      return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(','))
  ].join('\n');
  
  const blob = new Blob([addBOM(csvContent)], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, fileName.endsWith('.csv') ? fileName : `${fileName}.csv`);
};

export const exportToExcel = (data: any[], headers: string[], fileName: string) => {
  const worksheet = XLSX.utils.json_to_sheet(data);
  XLSX.utils.sheet_add_aoa(worksheet, [headers], { origin: 'A1' });
  
  // Set RTL direction for Excel
  worksheet['!views'] = [{ RTL: true }];
  
  const colWidths = headers.map((h, i) => {
    let maxLen = h.length;
    data.forEach(row => {
      const cellVal = String(Object.values(row)[i] || '');
      maxLen = Math.max(maxLen, cellVal.length);
    });
    return { wch: maxLen + 2 };
  });
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
  
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
};

export const exportToPDF = async (
  elementId: string | null, 
  tableData: any[][] | null, 
  headers: string[], 
  title: string, 
  fileName: string,
  metadata: { deviceName: string; dateRange: string; stats?: any }
) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  registerHebrewFont(doc);

  let currentY = 20;

  // Title
  doc.setFontSize(22);
  drawText(doc, title, 105, currentY, { align: 'center' });
  currentY += 12;

  // Metadata
  doc.setFontSize(12);
  drawText(doc, `מכשיר: ${metadata.deviceName}`, 195, currentY, { align: 'right' });
  currentY += 7;
  drawText(doc, `טווח תאריכים: ${metadata.dateRange}`, 195, currentY, { align: 'right' });
  currentY += 10;

  if (metadata.stats) {
    doc.setFontSize(11);
    doc.setFont('Rubik', 'normal');
    drawText(doc, 'סה"כ צריכה:', 195, currentY, { align: 'right' });
    doc.setR2L(false);
    doc.text(metadata.stats.total + ' kWh', 60, currentY, { align: 'left' });
    currentY += 6;
    drawText(doc, 'שיא יומיומי:', 195, currentY, { align: 'right' });
    doc.setR2L(false);
    doc.text(metadata.stats.peak + ' kWh', 60, currentY, { align: 'left' });
    currentY += 12;
  }

  if (elementId) {
    const element = document.getElementById(elementId);
    if (element) {
      const canvas = await html2canvas(element, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 190;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      doc.addImage(imgData, 'PNG', 10, currentY, imgWidth, imgHeight);
      currentY += imgHeight + 15;
    }
  }

  if (tableData && tableData.length > 0) {
    autoTable(doc, {
      head: [headers.map(toVisualLTR)],
      body: tableData,
      startY: currentY,
      styles: { font: 'Rubik', halign: 'right', fontSize: 9 },
      headStyles: { font: 'Rubik', fillColor: [0, 119, 182], textColor: 255, fontStyle: 'normal' },
      theme: 'grid',
      didParseCell: (data: any) => {
        data.cell.styles.font = 'Rubik';
      },
      willDrawCell: () => {
        doc.setR2L(false);
      }
    });
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('Rubik', 'normal');
    doc.setFontSize(8);
    drawText(doc, `עמוד ${i} מתוך ${pageCount}`, 105, 285, { align: 'center' });
    drawText(doc, 'Galoz Energy Monitor', 10, 285);
  }

  doc.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
};
