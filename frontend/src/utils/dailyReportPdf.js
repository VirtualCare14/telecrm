import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export function generateDailyActivityPdf(reportData) {
  if (!reportData) return;

  const { selectedDate, summary, hospitalActivity = [] } = reportData;

  // Create PDF document in Landscape A4 format for maximum readable column width
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // 1. Header Section
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 55, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text('TeleCRM — Daily Activity Report', 30, 26);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(226, 232, 240); // slate-200
  doc.text(`Report Date: ${selectedDate} (Asia/Kolkata)`, 30, 44);

  const nowIstStr = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  doc.text(`Generated At: ${nowIstStr} IST`, pageWidth - 30, 44, { align: 'right' });

  // 2. Summary KPI Metrics Table
  const s = summary || {};
  const summaryHeaders = [
    'Total Calls',
    'Unique Hospitals',
    'Follow-ups Done',
    'Follow-ups Pending',
    'Follow-ups Overdue',
    'Demos Scheduled',
    'Demos Done',
    'Walk-ins Scheduled',
    'Walk-ins Done',
    'Leads Won',
    'Leads Lost',
  ];

  const summaryValues = [
    String(s.totalCalls || 0),
    String(s.uniqueHospitalsCalled || 0),
    String(s.followUpsCompleted || 0),
    String(s.followUpsPending || 0),
    String(s.followUpsOverdue || 0),
    String(s.demosScheduled || 0),
    String(s.demosCompleted || 0),
    String(s.walkInsScheduled || 0),
    String(s.walkInsCompleted || 0),
    String(s.leadsWon || 0),
    String(s.leadsLost || 0),
  ];

  autoTable(doc, {
    startY: 68,
    margin: { left: 30, right: 30 },
    head: [summaryHeaders],
    body: [summaryValues],
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59], // slate-800
      textColor: [248, 250, 252],
      fontSize: 8.5,
      fontStyle: 'bold',
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 10,
      fontStyle: 'bold',
      halign: 'center',
      textColor: [15, 23, 42],
    },
    styles: {
      cellPadding: 5,
    },
  });

  // 3. Hospital-Wise Detailed Activity Table
  const activityRows = hospitalActivity.map((r, idx) => [
    idx + 1,
    r.hospitalName || 'N/A',
    r.hospitalPhone || 'N/A',
    r.callDateTime || 'N/A',
    r.callerName || 'N/A',
    r.disposition || 'N/A',
    r.remarks || 'N/A',
    r.currentLeadStatus || 'OPEN',
    r.nextFollowUpDate || 'N/A',
    r.demoStatus !== 'N/A' ? r.demoStatus : r.walkInStatus !== 'N/A' ? r.walkInStatus : 'N/A',
    r.currentAssignedAgent || 'Unassigned',
  ]);

  const tableHead = [
    [
      '#',
      'Hospital Name',
      'Phone',
      'Call Date & Time',
      'Caller / Agent',
      'Disposition',
      'Call Remarks / Notes',
      'Status',
      'Next Follow-up',
      'Demo / Walk-in',
      'Assigned Agent',
    ],
  ];

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 14,
    margin: { left: 30, right: 30, bottom: 35 },
    head: tableHead,
    body: activityRows.length > 0 ? activityRows : [['—', 'No calls recorded for this date', '—', '—', '—', '—', '—', '—', '—', '—', '—']],
    theme: 'striped',
    headStyles: {
      fillColor: [14, 116, 144], // cyan-700
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'left',
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 41, 59],
      cellPadding: 4,
      valign: 'top',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 20, halign: 'center' }, // #
      1: { cellWidth: 105, fontStyle: 'bold' }, // Hospital Name
      2: { cellWidth: 65 }, // Phone
      3: { cellWidth: 80 }, // Call Date & Time
      4: { cellWidth: 70 }, // Caller
      5: { cellWidth: 65 }, // Disposition
      6: { cellWidth: 155 }, // Remarks (generous width with auto-wrap)
      7: { cellWidth: 45, halign: 'center' }, // Lead Status
      8: { cellWidth: 70 }, // Next Follow-up
      9: { cellWidth: 65 }, // Demo / Walk-in
      10: { cellWidth: 70 }, // Assigned Agent
    },
    didDrawPage: (data) => {
      // Add Page Number Footer
      const str = `Page ${doc.internal.getNumberOfPages()}`;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(str, pageWidth - 30, pageHeight - 15, { align: 'right' });
      doc.text('TeleCRM Confidential • Internal Use Only', 30, pageHeight - 15);
    },
  });

  // Save the PDF file
  doc.save(`daily_activity_report_${selectedDate}.pdf`);
}
