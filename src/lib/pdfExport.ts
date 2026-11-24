import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Athlete,
  AttendanceRecord,
  ClubCompetition,
  ClubInvoice,
  ClubProfile,
  Coach,
  EquipmentItem,
  FinanceTransaction,
  formatDateID,
  formatRupiah,
  PoolFacility,
  SwimTime,
  todayISO,
  TrainingSchedule,
} from '../types/club';
import { triggerBlobDownload } from './exportUtils';
import { computeConsecutiveAbsences } from './attendanceAlerts';

export type PdfReportKind =
  | 'executive'
  | 'finance'
  | 'athletes'
  | 'schedules'
  | 'invoices'
  | 'clubops';

export interface GenerateClubPdfOptions {
  kind: PdfReportKind;
  club: ClubProfile;
  orientation?: 'portrait' | 'landscape';
  periodLabel?: string;
  includeKop?: boolean;
  includeSignature?: boolean;
  athletes?: Athlete[];
  swimTimes?: SwimTime[];
  transactions?: FinanceTransaction[];
  schedules?: TrainingSchedule[];
  attendance?: AttendanceRecord[];
  invoices?: ClubInvoice[];
  coaches?: Coach[];
  pools?: PoolFacility[];
  equipment?: EquipmentItem[];
  competitions?: ClubCompetition[];
}

/**
 * Sanitizes Unicode punctuation/emojis to WinAnsi-safe ASCII for crisp jsPDF Helvetica output.
 */
function pdfText(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2022/g, '*')
    .replace(/\u00B7/g, '|')
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '')
    .trim();
}

function slugifyClub(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'klub-renang'
  );
}

const REPORT_TITLES: Record<PdfReportKind, string> = {
  executive: 'Laporan Ringkasan Eksekutif Klub',
  finance: 'Laporan Keuangan & Buku Kas Klub',
  athletes: 'Laporan Database Atlet & Catatan Waktu',
  schedules: 'Laporan Jadwal Latihan & Rekap Presensi',
  invoices: 'Laporan Rekap Tagihan & Tunggakan SPP',
  clubops: 'Laporan Pelatih, Fasilitas, Inventaris & Lomba',
};

const FILE_PREFIX: Record<PdfReportKind, string> = {
  executive: 'laporan-ringkasan',
  finance: 'laporan-keuangan',
  athletes: 'laporan-atlet-waktu',
  schedules: 'laporan-jadwal-presensi',
  invoices: 'laporan-tagihan-spp',
  clubops: 'laporan-operasional-klub',
};

function getLastTableFinalY(doc: jsPDF, fallbackY: number): number {
  const internal = doc as jsPDF & { lastAutoTable?: { finalY?: number } };
  return typeof internal.lastAutoTable?.finalY === 'number'
    ? internal.lastAutoTable.finalY
    : fallbackY;
}

function ensureSpace(doc: jsPDF, currentY: number, neededHeight: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (currentY + neededHeight > pageHeight - 18) {
    doc.addPage();
    return 18;
  }
  return currentY;
}

function drawSummaryGrid(
  doc: jsPDF,
  startY: number,
  cards: { label: string; value: string; sub?: string }[]
): number {
  const marginX = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const usableWidth = pageWidth - marginX * 2;
  const cols = Math.min(cards.length, 4);
  const gap = 3;
  const boxW = (usableWidth - gap * (cols - 1)) / cols;
  const boxH = 19;

  let y = ensureSpace(doc, startY, boxH + 6);

  cards.slice(0, 4).forEach((card, idx) => {
    const x = marginX + idx * (boxW + gap);
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, y, boxW, boxH, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(pdfText(card.label), x + 3, y + 5.5, { maxWidth: boxW - 6 });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(pdfText(card.value), x + 3, y + 12, { maxWidth: boxW - 6 });

    if (card.sub) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(pdfText(card.sub), x + 3, y + 16.5, { maxWidth: boxW - 6 });
    }
  });

  return y + boxH + 7;
}

function drawSectionHeading(doc: jsPDF, y: number, title: string): number {
  const nextY = ensureSpace(doc, y, 16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(pdfText(title), 14, nextY);
  return nextY + 3.5;
}

export function downloadClubSummaryPdf(options: GenerateClubPdfOptions): void {
  const {
    kind,
    club,
    orientation = 'portrait',
    periodLabel = 'Sesuai Filter Aktif',
    includeKop = true,
    includeSignature = true,
    athletes = [],
    swimTimes = [],
    transactions = [],
    schedules = [],
    attendance = [],
    invoices = [],
    coaches = [],
    pools = [],
    equipment = [],
    competitions = [],
  } = options;

  const today = todayISO();
  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  let cursorY = 15;

  // Header / Kop Klub
  if (includeKop) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(pdfText(club.name), marginX, cursorY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(3, 105, 161);
    doc.text(pdfText(REPORT_TITLES[kind]), pageWidth - marginX, cursorY, {
      align: 'right',
    });

    cursorY += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(71, 85, 105);
    const contactLine = [
      club.address || club.city,
      club.phone ? `Telp: ${club.phone}` : '',
      club.email || '',
    ]
      .filter(Boolean)
      .join(' | ');
    doc.text(pdfText(contactLine), marginX, cursorY, {
      maxWidth: pageWidth * 0.55,
    });

    doc.text(
      pdfText(`Periode: ${periodLabel} | Dicetak: ${formatDateID(today)}`),
      pageWidth - marginX,
      cursorY,
      { align: 'right' }
    );

    cursorY += 4.5;
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.5);
    doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
    cursorY += 6.5;
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(pdfText(REPORT_TITLES[kind]), marginX, cursorY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(100, 116, 139);
    doc.text(
      pdfText(`${periodLabel} | ${formatDateID(today)}`),
      pageWidth - marginX,
      cursorY,
      { align: 'right' }
    );

    cursorY += 3.5;
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
    cursorY += 6;
  }

  const baseTableStyles = {
    font: 'helvetica' as const,
    fontSize: 8,
    cellPadding: 2.3,
    textColor: [30, 41, 59] as [number, number, number],
    lineColor: [226, 232, 240] as [number, number, number],
    lineWidth: 0.2,
  };

  const baseHeadStyles = {
    fillColor: [241, 245, 249] as [number, number, number],
    textColor: [51, 65, 85] as [number, number, number],
    fontStyle: 'bold' as const,
    fontSize: 8,
  };

  if (kind === 'executive') {
    let totalIn = 0;
    let totalOut = 0;
    let todayIn = 0;
    let todayOut = 0;
    for (const tx of transactions) {
      if (tx.type === 'pemasukan') {
        totalIn += tx.amount;
        if (tx.transactionDate === today) todayIn += tx.amount;
      } else {
        totalOut += tx.amount;
        if (tx.transactionDate === today) todayOut += tx.amount;
      }
    }
    const activeAth = athletes.filter((a) => a.status === 'Aktif').length;
    const pbCount = swimTimes.filter((s) => s.isPersonalBest).length;
    const unpaidSum = invoices
      .filter(
        (i) =>
          i.status === 'Belum Lunas' ||
          i.status === 'Jatuh Tempo' ||
          i.status === 'Menunggu Verifikasi'
      )
      .reduce((acc, i) => acc + i.amount, 0);

    cursorY = drawSummaryGrid(doc, cursorY, [
      {
        label: 'Saldo Kas Bersih',
        value: formatRupiah(totalIn - totalOut),
        sub: `Hari ini +${formatRupiah(todayIn)} / -${formatRupiah(todayOut)}`,
      },
      {
        label: 'Atlet Aktif / Total',
        value: `${activeAth} / ${athletes.length} atlet`,
        sub: `${coaches.filter((c) => c.status === 'Aktif').length} pelatih aktif`,
      },
      {
        label: 'Rekor Personal Best',
        value: `${pbCount} nomor`,
        sub: `${swimTimes.length} catatan lomba`,
      },
      {
        label: 'Tagihan Tertunda',
        value: formatRupiah(unpaidSum),
        sub: `${schedules.length} jadwal latihan`,
      },
    ]);

    const recentPBs = [...swimTimes]
      .filter((s) => s.isPersonalBest)
      .sort((a, b) => b.meetDate.localeCompare(a.meetDate))
      .slice(0, 12);

    cursorY = drawSectionHeading(
      doc,
      cursorY,
      `Rekor Personal Best Terbaru (${recentPBs.length})`
    );
    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      styles: baseTableStyles,
      headStyles: baseHeadStyles,
      head: [['Atlet', 'Nomor Lomba', 'Kolam', 'Kejuaraan', 'Tanggal', 'Waktu']],
      body:
        recentPBs.length > 0
          ? recentPBs.map((st) => [
              pdfText(st.athleteName),
              pdfText(st.eventName),
              pdfText(st.poolCourse),
              pdfText(st.championshipName),
              pdfText(formatDateID(st.meetDate)),
              pdfText(st.formattedTime),
            ])
          : [['Belum ada catatan rekor Personal Best.', '', '', '', '', '']],
      columnStyles: { 5: { halign: 'right', fontStyle: 'bold' } },
    });
    cursorY = getLastTableFinalY(doc, cursorY) + 7;

    const recentTx = [...transactions]
      .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate))
      .slice(0, 12);

    cursorY = drawSectionHeading(
      doc,
      cursorY,
      `Transaksi Kas Terbaru (${recentTx.length})`
    );
    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      styles: baseTableStyles,
      headStyles: baseHeadStyles,
      head: [['Tanggal', 'Keterangan', 'Kategori', 'Metode', 'Nominal']],
      body:
        recentTx.length > 0
          ? recentTx.map((tx) => [
              pdfText(formatDateID(tx.transactionDate)),
              pdfText(tx.description),
              pdfText(tx.category),
              pdfText(tx.paymentMethod),
              pdfText(`${tx.type === 'pemasukan' ? '+' : '-'}${formatRupiah(tx.amount)}`),
            ])
          : [['Belum ada transaksi keuangan.', '', '', '', '']],
      columnStyles: { 4: { halign: 'right', fontStyle: 'bold' } },
    });
    cursorY = getLastTableFinalY(doc, cursorY) + 8;
  }

  if (kind === 'finance') {
    const sortedTx = [...transactions].sort((a, b) =>
      b.transactionDate.localeCompare(a.transactionDate)
    );
    let income = 0;
    let expense = 0;
    let todayIn = 0;
    let todayOut = 0;
    for (const tx of sortedTx) {
      if (tx.type === 'pemasukan') {
        income += tx.amount;
        if (tx.transactionDate === today) todayIn += tx.amount;
      } else {
        expense += tx.amount;
        if (tx.transactionDate === today) todayOut += tx.amount;
      }
    }

    cursorY = drawSummaryGrid(doc, cursorY, [
      { label: 'Total Pemasukan', value: formatRupiah(income) },
      { label: 'Total Pengeluaran', value: formatRupiah(expense) },
      {
        label: 'Saldo Kas Bersih',
        value: formatRupiah(income - expense),
        sub: `${sortedTx.length} transaksi`,
      },
      {
        label: 'Arus Kas Hari Ini',
        value: formatRupiah(todayIn - todayOut),
        sub: `+${formatRupiah(todayIn)} / -${formatRupiah(todayOut)}`,
      },
    ]);

    cursorY = drawSectionHeading(
      doc,
      cursorY,
      `Rincian Transaksi Keuangan (${sortedTx.length})`
    );
    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      styles: baseTableStyles,
      headStyles: baseHeadStyles,
      head: [['Tanggal', 'Tipe', 'Keterangan & Kategori', 'Atlet', 'Metode', 'Nominal']],
      body:
        sortedTx.length > 0
          ? sortedTx.map((tx) => [
              pdfText(formatDateID(tx.transactionDate)),
              pdfText(tx.type === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran'),
              pdfText(`${tx.description} (${tx.category})`),
              pdfText(tx.athleteName || '-'),
              pdfText(tx.paymentMethod),
              pdfText(`${tx.type === 'pemasukan' ? '+' : '-'}${formatRupiah(tx.amount)}`),
            ])
          : [['Tidak ada transaksi keuangan pada filter/periode ini.', '', '', '', '', '']],
      columnStyles: { 5: { halign: 'right', fontStyle: 'bold' } },
    });
    cursorY = getLastTableFinalY(doc, cursorY) + 8;
  }

  if (kind === 'athletes') {
    const sortedAth = [...athletes].sort((a, b) => a.fullName.localeCompare(b.fullName));
    const sortedTimes = [...swimTimes].sort((a, b) => b.meetDate.localeCompare(a.meetDate));
    const activeCount = sortedAth.filter((a) => a.status === 'Aktif').length;
    const pbCount = sortedTimes.filter((s) => s.isPersonalBest).length;

    cursorY = drawSummaryGrid(doc, cursorY, [
      { label: 'Total Atlet', value: `${sortedAth.length} atlet` },
      { label: 'Atlet Aktif', value: `${activeCount} atlet` },
      { label: 'Catatan Waktu', value: `${sortedTimes.length} hasil` },
      { label: 'Rekor Personal Best', value: `${pbCount} nomor` },
    ]);

    cursorY = drawSectionHeading(
      doc,
      cursorY,
      `Daftar Atlet Klub (${sortedAth.length})`
    );
    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      styles: baseTableStyles,
      headStyles: baseHeadStyles,
      head: [['Nama Atlet', 'KU / Gender', 'Pelatih', 'Wali & Kontak', 'SPP/Bln', 'Status']],
      body:
        sortedAth.length > 0
          ? sortedAth.map((a) => [
              pdfText(a.fullName),
              pdfText(`${a.ageGroup} | ${a.gender}`),
              pdfText(a.coachName || club.headCoach),
              pdfText(`${a.parentName || '-'} (${a.parentPhone || '-'})`),
              pdfText(formatRupiah(a.monthlyFee)),
              pdfText(a.status),
            ])
          : [['Belum ada data atlet.', '', '', '', '', '']],
      columnStyles: { 4: { halign: 'right' } },
    });
    cursorY = getLastTableFinalY(doc, cursorY) + 7;

    cursorY = drawSectionHeading(
      doc,
      cursorY,
      `Catatan Waktu Kejuaraan (${sortedTimes.length})`
    );
    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      styles: baseTableStyles,
      headStyles: baseHeadStyles,
      head: [['Tanggal', 'Atlet', 'Nomor & Kolam', 'Kejuaraan', 'Hasil', 'Waktu']],
      body:
        sortedTimes.length > 0
          ? sortedTimes.map((st) => [
              pdfText(formatDateID(st.meetDate)),
              pdfText(st.athleteName),
              pdfText(`${st.eventName} (${st.poolCourse})`),
              pdfText(st.championshipName),
              pdfText(`${st.medal}${st.isPersonalBest ? ' | PB' : ''}`),
              pdfText(st.formattedTime),
            ])
          : [['Belum ada catatan waktu kejuaraan.', '', '', '', '', '']],
      columnStyles: { 5: { halign: 'right', fontStyle: 'bold' } },
    });
    cursorY = getLastTableFinalY(doc, cursorY) + 8;
  }

  if (kind === 'schedules') {
    const sortedSchedules = [...schedules];
    const sortedAttendance = [...attendance].sort((a, b) =>
      b.sessionDate.localeCompare(a.sessionDate)
    );
    let hadir = 0;
    let izin = 0;
    let sakit = 0;
    let alpa = 0;
    for (const rec of sortedAttendance) {
      if (rec.status === 'Hadir') hadir++;
      else if (rec.status === 'Izin') izin++;
      else if (rec.status === 'Sakit') sakit++;
      else if (rec.status === 'Alpa') alpa++;
    }
    const rate = sortedAttendance.length > 0 ? Math.round((hadir / sortedAttendance.length) * 100) : 0;
    const { alerts: consecutiveAbsences } = computeConsecutiveAbsences(athletes, attendance, club, 3);

    cursorY = drawSummaryGrid(doc, cursorY, [
      { label: 'Total Jadwal', value: `${sortedSchedules.length} sesi` },
      { label: 'Kehadiran Hadir', value: `${hadir} (${rate}%)`, sub: `Dari ${sortedAttendance.length} log` },
      { label: 'Izin / Sakit / Alpa', value: `${izin} / ${sakit} / ${alpa}` },
      {
        label: 'Absen >=3x Beruntun',
        value: `${consecutiveAbsences.length} atlet`,
        sub: consecutiveAbsences.length > 0 ? 'Perlu tindak lanjut' : 'Semua aman',
      },
    ]);

    if (consecutiveAbsences.length > 0) {
      cursorY = drawSectionHeading(
        doc,
        cursorY,
        `Peringatan Atlet Tidak Hadir >=3x Beruntun (${consecutiveAbsences.length})`
      );
      autoTable(doc, {
        startY: cursorY,
        margin: { left: marginX, right: marginX },
        styles: baseTableStyles,
        headStyles: baseHeadStyles,
        head: [['Atlet', 'KU', 'Streak Absen', 'Rincian', 'Sesi Terakhir', 'Kontak Wali']],
        body: consecutiveAbsences.map((al) => [
          pdfText(al.athlete.fullName),
          pdfText(al.athlete.ageGroup),
          pdfText(`${al.streak}x beruntun`),
          pdfText(al.breakdownSummary),
          pdfText(`${formatDateID(al.lastSessionDate)} (${al.lastSessionTitle})`),
          pdfText(`${al.athlete.parentName || '-'} (${al.athlete.parentPhone || '-'})`),
        ]),
      });
      cursorY = getLastTableFinalY(doc, cursorY) + 7;
    }

    cursorY = drawSectionHeading(
      doc,
      cursorY,
      `Matriks Jadwal Latihan (${sortedSchedules.length})`
    );
    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      styles: baseTableStyles,
      headStyles: baseHeadStyles,
      head: [['Hari / Jam', 'Program & Fokus', 'Kelompok', 'Lokasi Kolam', 'Pelatih', 'Target']],
      body:
        sortedSchedules.length > 0
          ? sortedSchedules.map((sch) => [
              pdfText(`${sch.dayOfWeek} ${sch.startTime}-${sch.endTime}`),
              pdfText(`${sch.title} (${sch.sessionType})`),
              pdfText(sch.ageGroup),
              pdfText(`${sch.poolLocation}${sch.laneInfo ? ` (${sch.laneInfo})` : ''}`),
              pdfText(sch.coachName),
              pdfText(`${sch.targetDistanceMeters.toLocaleString('id-ID')}m`),
            ])
          : [['Belum ada jadwal latihan.', '', '', '', '', '']],
      columnStyles: { 5: { halign: 'right' } },
    });
    cursorY = getLastTableFinalY(doc, cursorY) + 7;

    if (sortedAttendance.length > 0) {
      cursorY = drawSectionHeading(
        doc,
        cursorY,
        `Log Presensi Terbaru (${Math.min(sortedAttendance.length, 40)})`
      );
      autoTable(doc, {
        startY: cursorY,
        margin: { left: marginX, right: marginX },
        styles: baseTableStyles,
        headStyles: baseHeadStyles,
        head: [['Tanggal', 'Sesi Latihan', 'Nama Atlet', 'Status']],
        body: sortedAttendance.slice(0, 40).map((rec) => [
          pdfText(formatDateID(rec.sessionDate)),
          pdfText(rec.scheduleTitle),
          pdfText(rec.athleteName),
          pdfText(rec.status),
        ]),
      });
      cursorY = getLastTableFinalY(doc, cursorY) + 8;
    }
  }

  if (kind === 'invoices') {
    const sortedInvoices = [...invoices].sort((a, b) => b.dueDate.localeCompare(a.dueDate));
    let paid = 0;
    let pending = 0;
    let overdue = 0;
    let verifying = 0;
    for (const inv of sortedInvoices) {
      if (inv.status === 'Lunas') paid += inv.amount;
      else if (inv.status === 'Belum Lunas') pending += inv.amount;
      else if (inv.status === 'Jatuh Tempo') overdue += inv.amount;
      else if (inv.status === 'Menunggu Verifikasi') verifying += inv.amount;
    }

    cursorY = drawSummaryGrid(doc, cursorY, [
      { label: 'Total Lunas', value: formatRupiah(paid) },
      { label: 'Belum Lunas', value: formatRupiah(pending) },
      { label: 'Menunggu Verifikasi', value: formatRupiah(verifying) },
      { label: 'Jatuh Tempo', value: formatRupiah(overdue) },
    ]);

    cursorY = drawSectionHeading(
      doc,
      cursorY,
      `Daftar Tagihan & Invoice (${sortedInvoices.length})`
    );
    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      styles: baseTableStyles,
      headStyles: baseHeadStyles,
      head: [['No. Invoice', 'Atlet & Wali', 'Rincian & Periode', 'Jatuh Tempo', 'Status', 'Nominal']],
      body:
        sortedInvoices.length > 0
          ? sortedInvoices.map((inv) => [
              pdfText(inv.invoiceNumber),
              pdfText(`${inv.athleteName}${inv.parentName ? ` (${inv.parentName})` : ''}`),
              pdfText(`${inv.description} | ${inv.periodMonth}`),
              pdfText(formatDateID(inv.dueDate)),
              pdfText(inv.status),
              pdfText(formatRupiah(inv.amount)),
            ])
          : [['Belum ada invoice tagihan.', '', '', '', '', '']],
      columnStyles: { 5: { halign: 'right', fontStyle: 'bold' } },
    });
    cursorY = getLastTableFinalY(doc, cursorY) + 8;
  }

  if (kind === 'clubops') {
    const activeCoaches = coaches.filter((c) => c.status === 'Aktif').length;
    const totalUnits = equipment.reduce((acc, e) => acc + e.quantity, 0);

    cursorY = drawSummaryGrid(doc, cursorY, [
      { label: 'Pelatih Aktif', value: `${activeCoaches} / ${coaches.length}` },
      { label: 'Fasilitas Kolam', value: `${pools.length} lokasi` },
      { label: 'Perlengkapan', value: `${totalUnits} unit`, sub: `${equipment.length} jenis` },
      { label: 'Agenda Kejuaraan', value: `${competitions.length} lomba` },
    ]);

    cursorY = drawSectionHeading(doc, cursorY, `Tim Pelatih & Staf (${coaches.length})`);
    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      styles: baseTableStyles,
      headStyles: baseHeadStyles,
      head: [['Nama Pelatih', 'Peran & Lisensi', 'Telepon', 'Status', 'Honorarium/Bln']],
      body:
        coaches.length > 0
          ? coaches.map((c) => [
              pdfText(c.fullName),
              pdfText(`${c.role} | ${c.licenseLevel}`),
              pdfText(c.phone || '-'),
              pdfText(c.status),
              pdfText(formatRupiah(c.monthlyHonorarium)),
            ])
          : [['Belum ada data pelatih.', '', '', '', '']],
      columnStyles: { 4: { halign: 'right' } },
    });
    cursorY = getLastTableFinalY(doc, cursorY) + 7;

    cursorY = drawSectionHeading(doc, cursorY, `Fasilitas Kolam (${pools.length})`);
    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      styles: baseTableStyles,
      headStyles: baseHeadStyles,
      head: [['Nama Kolam', 'Tipe', 'Lintasan', 'Status', 'Sewa/Sesi']],
      body:
        pools.length > 0
          ? pools.map((p) => [
              pdfText(p.name),
              pdfText(p.poolType),
              pdfText(`${p.laneCount} lintasan`),
              pdfText(p.status),
              pdfText(formatRupiah(p.rentalCostPerSession)),
            ])
          : [['Belum ada fasilitas kolam.', '', '', '', '']],
      columnStyles: { 4: { halign: 'right' } },
    });
    cursorY = getLastTableFinalY(doc, cursorY) + 7;

    cursorY = drawSectionHeading(doc, cursorY, `Inventaris Perlengkapan (${equipment.length})`);
    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      styles: baseTableStyles,
      headStyles: baseHeadStyles,
      head: [['Nama Barang', 'Kategori', 'Jumlah', 'Kondisi', 'Cek Terakhir']],
      body:
        equipment.length > 0
          ? equipment.map((e) => [
              pdfText(e.itemName),
              pdfText(e.category),
              pdfText(`${e.quantity} unit`),
              pdfText(e.condition),
              pdfText(formatDateID(e.lastCheckedDate)),
            ])
          : [['Belum ada inventaris perlengkapan.', '', '', '', '']],
    });
    cursorY = getLastTableFinalY(doc, cursorY) + 7;

    cursorY = drawSectionHeading(doc, cursorY, `Kalender Kejuaraan (${competitions.length})`);
    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      styles: baseTableStyles,
      headStyles: baseHeadStyles,
      head: [['Nama Kejuaraan', 'Tanggal', 'Lokasi & Kolam', 'Tingkat', 'Status']],
      body:
        competitions.length > 0
          ? competitions.map((k) => [
              pdfText(k.name),
              pdfText(
                k.startDate === k.endDate
                  ? formatDateID(k.startDate)
                  : `${formatDateID(k.startDate)} - ${formatDateID(k.endDate)}`
              ),
              pdfText(`${k.location} (${k.poolCourse})`),
              pdfText(k.level),
              pdfText(k.status),
            ])
          : [['Belum ada agenda kejuaraan.', '', '', '', '']],
    });
    cursorY = getLastTableFinalY(doc, cursorY) + 8;
  }

  // Signature block on final page
  if (includeSignature) {
    cursorY = ensureSpace(doc, cursorY, 34);
    const leftX = marginX + 26;
    const rightX = pageWidth - marginX - 26;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);

    doc.text('Mengetahui,', leftX, cursorY, { align: 'center' });
    doc.text(pdfText(`Kepala Pelatih ${club.name}`), leftX, cursorY + 4.5, { align: 'center' });

    doc.text(pdfText(`${club.city}, ${formatDateID(today)}`), rightX, cursorY, { align: 'center' });
    doc.text('Administrasi & Keuangan Klub', rightX, cursorY + 4.5, { align: 'center' });

    const signLineY = cursorY + 21;
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.3);
    doc.line(leftX - 25, signLineY, leftX + 25, signLineY);
    doc.line(rightX - 25, signLineY, rightX + 25, signLineY);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(pdfText(club.headCoach), leftX, signLineY + 4.5, { align: 'center' });
    doc.text(pdfText(`Pengurus ${club.name}`), rightX, signLineY + 4.5, { align: 'center' });
  }

  // Page numbers & subtle footer across all pages
  const totalPages = doc.getNumberOfPages();
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    doc.setPage(pageNum);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      pdfText(`${club.name} - ${REPORT_TITLES[kind]}`),
      marginX,
      pageH - 8
    );
    doc.text(
      `Halaman ${pageNum} dari ${totalPages}`,
      pageWidth - marginX,
      pageH - 8,
      { align: 'right' }
    );
  }

  const blob = doc.output('blob');
  const filename = `${FILE_PREFIX[kind]}-${slugifyClub(club.name)}-${today}.pdf`;
  triggerBlobDownload(blob, filename);
}
