import {
  Athlete,
  AttendanceRecord,
  ClubAnnouncement,
  ClubCompetition,
  ClubInvoice,
  ClubProfile,
  Coach,
  DAYS_OF_WEEK,
  EquipmentItem,
  FinanceTransaction,
  formatDateID,
  formatRupiah,
  PoolFacility,
  SwimTime,
  todayISO,
  TrainingSchedule,
} from '../types/club';

export interface ExcelCell {
  value: string | number;
  type?: 'String' | 'Number';
  styleId?: 'Header' | 'Currency' | 'Bold' | 'Default';
}

export interface ExcelSheet {
  name: string;
  headers: string[];
  rows: (string | number | ExcelCell)[][];
}

function escapeXml(str: string): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizeSheetName(name: string): string {
  // Excel worksheet names cannot contain : \ / ? * [ ] and max 31 chars
  return name.replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || 'Sheet';
}

function slugifyClub(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'klub-renang';
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generates a native Excel SpreadsheetML (.xls) multi-sheet workbook with typed Number/String cells.
 */
export function downloadExcelWorkbook(filename: string, sheets: ExcelSheet[]): void {
  const worksheetXml = sheets
    .map((sheet) => {
      const safeName = sanitizeSheetName(sheet.name);
      const headerRow = `<Row ss:AutoFitHeight="1">${sheet.headers
        .map(
          (h) =>
            `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`
        )
        .join('')}</Row>`;

      const dataRows = sheet.rows
        .map((row) => {
          const cellsXml = row
            .map((cell) => {
              const normalized: ExcelCell =
                typeof cell === 'object' && cell !== null && 'value' in cell
                  ? cell
                  : { value: cell };
              const isNum =
                normalized.type === 'Number' ||
                (normalized.type === undefined &&
                  typeof normalized.value === 'number' &&
                  Number.isFinite(normalized.value));
              const styleAttr = normalized.styleId ? ` ss:StyleID="${normalized.styleId}"` : '';
              return `<Cell${styleAttr}><Data ss:Type="${isNum ? 'Number' : 'String'}">${escapeXml(
                String(normalized.value ?? '')
              )}</Data></Cell>`;
            })
            .join('');
          return `<Row>${cellsXml}</Row>`;
        })
        .join('');

      return `<Worksheet ss:Name="${escapeXml(safeName)}">
  <Table>
    ${headerRow}
    ${dataRows}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
    <FreezePanes/>
    <FrozenNoSplit/>
    <SplitHorizontal>1</SplitHorizontal>
    <TopRowBottomPane>1</TopRowBottomPane>
    <ActivePane>2</ActivePane>
  </WorksheetOptions>
</Worksheet>`;
    })
    .join('\n');

  const workbookXml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#0F172A"/>
    </Style>
    <Style ss:ID="Header">
      <Alignment ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#0369A1" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="Bold">
      <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/>
    </Style>
    <Style ss:ID="Currency">
      <NumberFormat ss:Format="#,##0"/>
    </Style>
  </Styles>
  ${worksheetXml}
</Workbook>`;

  const blob = new Blob([workbookXml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  triggerBlobDownload(blob, filename.endsWith('.xls') ? filename : `${filename}.xls`);
}

export function downloadJSONBackup(
  club: ClubProfile,
  data: {
    athletes: Athlete[];
    swimTimes: SwimTime[];
    transactions: FinanceTransaction[];
    schedules: TrainingSchedule[];
    attendance: AttendanceRecord[];
    invoices: ClubInvoice[];
    announcements: ClubAnnouncement[];
    coaches?: Coach[];
    pools?: PoolFacility[];
    equipment?: EquipmentItem[];
    competitions?: ClubCompetition[];
  }
): void {
  const payload = {
    exportedAt: new Date().toISOString(),
    club: {
      id: club.id,
      name: club.name,
      city: club.city,
      address: club.address || '',
      headCoach: club.headCoach,
      phone: club.phone || '',
      email: club.email || '',
      bankName: club.bankName || '',
      bankAccountNumber: club.bankAccountNumber || '',
      bankAccountHolder: club.bankAccountHolder || '',
      defaultMonthlyFee: club.defaultMonthlyFee,
    },
    counts: {
      athletes: data.athletes.length,
      swimTimes: data.swimTimes.length,
      transactions: data.transactions.length,
      schedules: data.schedules.length,
      attendance: data.attendance.length,
      invoices: data.invoices.length,
      announcements: data.announcements.length,
      coaches: data.coaches?.length ?? 0,
      pools: data.pools?.length ?? 0,
      equipment: data.equipment?.length ?? 0,
      competitions: data.competitions?.length ?? 0,
    },
    records: data,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8;',
  });
  triggerBlobDownload(blob, `backup-klub-${slugifyClub(club.name)}-${todayISO()}.json`);
}

function getNextDateForDayOfWeek(dayName: string): string {
  const jsDayMap: Record<string, number> = {
    Minggu: 0,
    Senin: 1,
    Selasa: 2,
    Rabu: 3,
    Kamis: 4,
    Jumat: 5,
    Sabtu: 6,
  };
  const target = jsDayMap[dayName] ?? 1;
  const now = new Date();
  const diff = (target - now.getDay() + 7) % 7;
  const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toIcsDateTime(dateISO: string, hhmm: string): string {
  return `${dateISO.replace(/-/g, '')}T${hhmm.replace(':', '')}00`;
}

function escapeIcsText(value: string): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Exports training schedules as standard .ics calendar events (importable to Google Calendar / Apple Calendar).
 */
export function downloadSchedulesICS(club: ClubProfile, schedules: TrainingSchedule[]): void {
  const icsDayMap: Record<string, string> = {
    Minggu: 'SU',
    Senin: 'MO',
    Selasa: 'TU',
    Rabu: 'WE',
    Kamis: 'TH',
    Jumat: 'FR',
    Sabtu: 'SA',
  };
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';

  const events = schedules
    .map((sch) => {
      const startDate = sch.sessionDate || getNextDateForDayOfWeek(sch.dayOfWeek);
      const dtStart = toIcsDateTime(startDate, sch.startTime);
      const dtEnd = toIcsDateTime(startDate, sch.endTime);
      const byDay = icsDayMap[sch.dayOfWeek] || 'MO';
      const rrule = sch.sessionDate ? '' : `\r\nRRULE:FREQ=WEEKLY;BYDAY=${byDay}`;
      const loc = [sch.poolLocation, sch.laneInfo].filter(Boolean).join(' - ');
      const desc = [
        `Fokus: ${sch.sessionType}`,
        `Kelompok: ${sch.ageGroup}`,
        `Pelatih: ${sch.coachName}`,
        `Target Volume: ${sch.targetDistanceMeters.toLocaleString('id-ID')} meter`,
        sch.notes ? `Catatan: ${sch.notes}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      return `BEGIN:VEVENT
UID:${sch.id}@tirta-aquatics
DTSTAMP:${stamp}
DTSTART:${dtStart}
DTEND:${dtEnd}${rrule}
SUMMARY:${escapeIcsText(`${sch.title} (${sch.ageGroup})`)}
LOCATION:${escapeIcsText(loc)}
DESCRIPTION:${escapeIcsText(desc)}
END:VEVENT`;
    })
    .join('\r\n');

  const cal = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//${escapeIcsText(club.name)}//Jadwal Latihan Renang//ID
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:${escapeIcsText(`Jadwal Latihan - ${club.name}`)}
${events}
END:VCALENDAR`;

  const blob = new Blob([cal], { type: 'text/calendar;charset=utf-8;' });
  triggerBlobDownload(blob, `kalender-latihan-${slugifyClub(club.name)}.ics`);
}

export function buildFinanceSheet(transactions: FinanceTransaction[]): ExcelSheet {
  return {
    name: 'Keuangan Kas',
    headers: ['Tanggal', 'Tipe', 'Kategori', 'Keterangan', 'Atlet', 'Metode', 'Referensi', 'Nominal (IDR)'],
    rows: transactions.map((tx) => [
      tx.transactionDate,
      tx.type === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran',
      tx.category,
      tx.description,
      tx.athleteName || '-',
      tx.paymentMethod,
      tx.referenceNo || '-',
      { value: tx.amount, type: 'Number', styleId: 'Currency' },
    ]),
  };
}

export function buildAthletesSheet(athletes: Athlete[]): ExcelSheet {
  return {
    name: 'Daftar Atlet',
    headers: [
      'Nama Lengkap',
      'Gender',
      'Tanggal Lahir',
      'Kelompok Umur',
      'Status',
      'Nama Wali',
      'Telepon Wali',
      'Pelatih',
      'SPP Bulanan (IDR)',
      'Tanggal Gabung',
    ],
    rows: athletes.map((a) => [
      a.fullName,
      a.gender,
      a.birthDate,
      a.ageGroup,
      a.status,
      a.parentName || '-',
      a.parentPhone || '-',
      a.coachName || '-',
      { value: a.monthlyFee, type: 'Number', styleId: 'Currency' },
      a.joinDate,
    ]),
  };
}

export function buildSwimTimesSheet(swimTimes: SwimTime[]): ExcelSheet {
  return {
    name: 'Catatan Waktu',
    headers: [
      'Atlet',
      'Nomor Lomba',
      'Kolam',
      'Waktu',
      'Kejuaraan',
      'Tanggal',
      'Lokasi',
      'Hasil / Medali',
      'Personal Best',
    ],
    rows: swimTimes.map((t) => [
      t.athleteName,
      t.eventName,
      t.poolCourse,
      t.formattedTime,
      t.championshipName,
      t.meetDate,
      t.location || '-',
      t.medal,
      t.isPersonalBest ? 'Ya (PB)' : 'Tidak',
    ]),
  };
}

export function buildSchedulesSheet(schedules: TrainingSchedule[]): ExcelSheet {
  const dayOrder = new Map<string, number>();
  DAYS_OF_WEEK.forEach((d, idx) => dayOrder.set(d, idx));
  const sorted = [...schedules].sort((a, b) => {
    const diff = (dayOrder.get(a.dayOfWeek) ?? 0) - (dayOrder.get(b.dayOfWeek) ?? 0);
    return diff !== 0 ? diff : a.startTime.localeCompare(b.startTime);
  });
  return {
    name: 'Jadwal Latihan',
    headers: [
      'Hari',
      'Tanggal Khusus',
      'Jam Mulai',
      'Jam Selesai',
      'Program Latihan',
      'Fokus',
      'Kelompok Umur',
      'Lokasi Kolam',
      'Lintasan',
      'Pelatih',
      'Target Jarak (m)',
      'Catatan',
    ],
    rows: sorted.map((s) => [
      s.dayOfWeek,
      s.sessionDate || 'Rutin Mingguan',
      s.startTime,
      s.endTime,
      s.title,
      s.sessionType,
      s.ageGroup,
      s.poolLocation,
      s.laneInfo || '-',
      s.coachName,
      { value: s.targetDistanceMeters, type: 'Number' },
      s.notes || '-',
    ]),
  };
}

export function buildAttendanceSheet(attendance: AttendanceRecord[]): ExcelSheet {
  const sorted = [...attendance].sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
  return {
    name: 'Presensi Latihan',
    headers: ['Tanggal Sesi', 'Nama Sesi', 'Nama Atlet', 'Status Kehadiran', 'Catatan'],
    rows: sorted.map((rec) => [
      rec.sessionDate,
      rec.scheduleTitle,
      rec.athleteName,
      rec.status,
      rec.notes || '-',
    ]),
  };
}

export function buildInvoicesSheet(invoices: ClubInvoice[]): ExcelSheet {
  return {
    name: 'Invoice Tagihan',
    headers: [
      'No Invoice',
      'Atlet',
      'Wali',
      'Telepon Wali',
      'Periode',
      'Kategori',
      'Deskripsi',
      'Nominal (IDR)',
      'Jatuh Tempo',
      'Status',
      'Tanggal Lunas',
      'Metode Bayar',
    ],
    rows: invoices.map((i) => [
      i.invoiceNumber,
      i.athleteName,
      i.parentName || '-',
      i.parentPhone || '-',
      i.periodMonth,
      i.category,
      i.description,
      { value: i.amount, type: 'Number', styleId: 'Currency' },
      i.dueDate,
      i.status,
      i.paidDate || '-',
      i.paymentMethod || '-',
    ]),
  };
}

export function buildCoachesSheet(coaches: Coach[]): ExcelSheet {
  return {
    name: 'Pelatih & Staf',
    headers: [
      'Nama Lengkap',
      'Peran',
      'Lisensi',
      'Spesialisasi',
      'Telepon',
      'Status',
      'Honorarium/Bln (IDR)',
      'Tanggal Gabung',
      'Catatan',
    ],
    rows: coaches.map((c) => [
      c.fullName,
      c.role,
      c.licenseLevel,
      c.specialization || '-',
      c.phone || '-',
      c.status,
      { value: c.monthlyHonorarium, type: 'Number', styleId: 'Currency' },
      c.joinDate,
      c.notes || '-',
    ]),
  };
}

export function buildPoolsSheet(pools: PoolFacility[]): ExcelSheet {
  return {
    name: 'Kolam & Fasilitas',
    headers: [
      'Nama Kolam / Fasilitas',
      'Tipe',
      'Jumlah Lintasan',
      'Alamat',
      'Biaya Sewa/Sesi (IDR)',
      'Status',
      'Catatan',
    ],
    rows: pools.map((p) => [
      p.name,
      p.poolType,
      { value: p.laneCount, type: 'Number' },
      p.address || '-',
      { value: p.rentalCostPerSession, type: 'Number', styleId: 'Currency' },
      p.status,
      p.notes || '-',
    ]),
  };
}

export function buildEquipmentSheet(equipment: EquipmentItem[]): ExcelSheet {
  return {
    name: 'Perlengkapan Klub',
    headers: [
      'Nama Barang',
      'Kategori',
      'Jumlah (Unit)',
      'Kondisi',
      'Lokasi Penyimpanan',
      'Pengecekan Terakhir',
      'Catatan',
    ],
    rows: equipment.map((e) => [
      e.itemName,
      e.category,
      { value: e.quantity, type: 'Number' },
      e.condition,
      e.location || '-',
      e.lastCheckedDate,
      e.notes || '-',
    ]),
  };
}

export function buildCompetitionsSheet(competitions: ClubCompetition[]): ExcelSheet {
  return {
    name: 'Kalender Kejuaraan',
    headers: [
      'Nama Kejuaraan',
      'Tingkat',
      'Tanggal Mulai',
      'Tanggal Selesai',
      'Lokasi',
      'Kolam',
      'Biaya Registrasi (IDR)',
      'Status',
      'Catatan',
    ],
    rows: competitions.map((comp) => [
      comp.name,
      comp.level,
      comp.startDate,
      comp.endDate,
      comp.location,
      comp.poolCourse,
      { value: comp.registrationFee, type: 'Number', styleId: 'Currency' },
      comp.status,
      comp.notes || '-',
    ]),
  };
}

export function downloadFullClubExcel(
  club: ClubProfile,
  data: {
    athletes: Athlete[];
    swimTimes: SwimTime[];
    transactions: FinanceTransaction[];
    schedules: TrainingSchedule[];
    attendance: AttendanceRecord[];
    invoices: ClubInvoice[];
    coaches?: Coach[];
    pools?: PoolFacility[];
    equipment?: EquipmentItem[];
    competitions?: ClubCompetition[];
  }
): void {
  let income = 0;
  let expense = 0;
  for (const tx of data.transactions) {
    if (tx.type === 'pemasukan') income += tx.amount;
    else expense += tx.amount;
  }
  const unpaid = data.invoices.filter((i) => i.status === 'Belum Lunas' || i.status === 'Jatuh Tempo');
  const unpaidTotal = unpaid.reduce((acc, i) => acc + i.amount, 0);

  const summarySheet: ExcelSheet = {
    name: 'Ringkasan Klub',
    headers: ['Indikator Manajemen Klub', 'Nilai / Keterangan'],
    rows: [
      ['Nama Klub', club.name],
      ['Kota', club.city],
      ['Kepala Pelatih', club.headCoach],
      ['Tanggal Ekspor', formatDateID(todayISO())],
      ['Total Atlet Terdaftar', { value: data.athletes.length, type: 'Number' }],
      ['Atlet Berstatus Aktif', { value: data.athletes.filter((a) => a.status === 'Aktif').length, type: 'Number' }],
      ['Pelatih & Staf Terdaftar', { value: data.coaches?.length ?? 0, type: 'Number' }],
      ['Fasilitas Kolam', { value: data.pools?.length ?? 0, type: 'Number' }],
      ['Target Kejuaraan', { value: data.competitions?.length ?? 0, type: 'Number' }],
      ['Catatan Waktu PB', { value: data.swimTimes.filter((s) => s.isPersonalBest).length, type: 'Number' }],
      ['Total Pemasukan Kas', formatRupiah(income)],
      ['Total Pengeluaran Kas', formatRupiah(expense)],
      ['Saldo Kas Bersih', formatRupiah(income - expense)],
      ['Tagihan Belum Lunas / Tempo', `${unpaid.length} invoice (${formatRupiah(unpaidTotal)})`],
      ['Jadwal Sesi Latihan', { value: data.schedules.length, type: 'Number' }],
    ],
  };

  const sheets: ExcelSheet[] = [
    summarySheet,
    buildFinanceSheet(data.transactions),
    buildAthletesSheet(data.athletes),
    buildSwimTimesSheet(data.swimTimes),
    buildSchedulesSheet(data.schedules),
    buildAttendanceSheet(data.attendance),
    buildInvoicesSheet(data.invoices),
  ];

  if (data.coaches && data.coaches.length > 0) sheets.push(buildCoachesSheet(data.coaches));
  if (data.pools && data.pools.length > 0) sheets.push(buildPoolsSheet(data.pools));
  if (data.equipment && data.equipment.length > 0) sheets.push(buildEquipmentSheet(data.equipment));
  if (data.competitions && data.competitions.length > 0) sheets.push(buildCompetitionsSheet(data.competitions));

  downloadExcelWorkbook(`laporan-lengkap-${slugifyClub(club.name)}-${todayISO()}.xls`, sheets);
}
