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

function stripIllegalXmlChars(str: string): string {
  // XML 1.0 forbids C0 control characters other than \t, \n, \r as well as U+FFFE / U+FFFF
  return str.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');
}

function escapeXml(str: string): string {
  return stripIllegalXmlChars(String(str ?? ''))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizeSheetName(name: string, usedNames: Set<string>): string {
  // Excel worksheet names cannot contain : \ / ? * [ ], cannot start/end with ', max 31 chars, and must be unique
  const base =
    stripIllegalXmlChars(name)
      .replace(/[:\\/?*[\]]/g, ' ')
      .replace(/^'+|'+$/g, '')
      .trim()
      .slice(0, 31) || 'Sheet';

  if (!usedNames.has(base.toLowerCase())) {
    usedNames.add(base.toLowerCase());
    return base;
  }

  let idx = 2;
  while (idx < 100) {
    const suffix = ` (${idx})`;
    const candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    if (!usedNames.has(candidate.toLowerCase())) {
      usedNames.add(candidate.toLowerCase());
      return candidate;
    }
    idx += 1;
  }
  return `Sheet_${Date.now().toString().slice(-6)}`;
}

function slugifyClub(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'klub-renang'
  );
}

function sanitizeDownloadFilename(filename: string): string {
  const safe = filename
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-');
  return safe || `ekspor-${todayISO()}`;
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const safeName = sanitizeDownloadFilename(filename);
  const navWithMsSave = navigator as Navigator & {
    msSaveOrOpenBlob?: (b: Blob, defaultName?: string) => boolean;
  };
  if (typeof navWithMsSave.msSaveOrOpenBlob === 'function') {
    navWithMsSave.msSaveOrOpenBlob(blob, safeName);
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();

  // Delay cleanup & URL revocation so Safari, iOS/Android webviews, and iframes finish reading the Blob stream
  window.setTimeout(() => {
    if (link.parentNode) {
      link.parentNode.removeChild(link);
    }
    URL.revokeObjectURL(url);
  }, 10000);
}

// =========================================================================
// PURE TYPESCRIPT OOXML (.xlsx) GENERATOR (ZIP STORE + ECMA-376 XML)
// =========================================================================

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(): { dosTime: number; dosDate: number } {
  const now = new Date();
  const year = Math.max(1980, now.getFullYear());
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((now.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((year - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);
  return { dosTime, dosDate };
}

function createStoredZip(entries: { name: string; data: Uint8Array }[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const { dosTime, dosDate } = getDosDateTime();

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data;
    const checksum = crc32(data);

    // Local file header (30 bytes + filename)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const ldv = new DataView(localHeader.buffer);
    ldv.setUint32(0, 0x04034b50, true);
    ldv.setUint16(4, 20, true); // version needed: 2.0
    ldv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    ldv.setUint16(8, 0, true); // compression method: 0 (STORE)
    ldv.setUint16(10, dosTime, true);
    ldv.setUint16(12, dosDate, true);
    ldv.setUint32(14, checksum, true);
    ldv.setUint32(18, data.length, true);
    ldv.setUint32(22, data.length, true);
    ldv.setUint16(26, nameBytes.length, true);
    ldv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, data);

    // Central directory header (46 bytes + filename)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(centralHeader.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true); // version made by
    cdv.setUint16(6, 20, true); // version needed
    cdv.setUint16(8, 0x0800, true); // UTF-8 filename flag
    cdv.setUint16(10, 0, true); // STORE
    cdv.setUint16(12, dosTime, true);
    cdv.setUint16(14, dosDate, true);
    cdv.setUint32(16, checksum, true);
    cdv.setUint32(20, data.length, true);
    cdv.setUint32(24, data.length, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint16(30, 0, true);
    cdv.setUint16(32, 0, true);
    cdv.setUint16(34, 0, true);
    cdv.setUint16(36, 0, true);
    cdv.setUint32(38, 0, true);
    cdv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  let centralSize = 0;
  for (const part of centralParts) {
    centralSize += part.length;
  }

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const edv = new DataView(eocd.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(4, 0, true);
  edv.setUint16(6, 0, true);
  edv.setUint16(8, entries.length, true);
  edv.setUint16(10, entries.length, true);
  edv.setUint32(12, centralSize, true);
  edv.setUint32(16, offset, true);
  edv.setUint16(20, 0, true);

  const totalSize = offset + centralSize + eocd.length;
  const outputBuffer = new ArrayBuffer(totalSize);
  const out = new Uint8Array(outputBuffer);
  let cursor = 0;
  for (const part of localParts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  for (const part of centralParts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  out.set(eocd, cursor);
  return out;
}

function colIndexToLetter(index: number): string {
  let n = index + 1;
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function styleIdToXfIndex(styleId?: ExcelCell['styleId']): number {
  switch (styleId) {
    case 'Header':
      return 1;
    case 'Bold':
      return 2;
    case 'Currency':
      return 3;
    default:
      return 0;
  }
}

function buildWorksheetXml(sheet: ExcelSheet): string {
  const headers = sheet.headers.length > 0 ? sheet.headers : ['Kolom'];
  const colWidths = headers.map((h) => Math.max(10, String(h).length + 4));

  const headerCells = headers
    .map((h, colIdx) => {
      const ref = `${colIndexToLetter(colIdx)}1`;
      return `<c r="${ref}" t="inlineStr" s="1"><is><t xml:space="preserve">${escapeXml(h)}</t></is></c>`;
    })
    .join('');
  const headerRowXml = `<row r="1" ht="22" customHeight="1">${headerCells}</row>`;

  const rowXmls = sheet.rows.map((row, rIdx) => {
    const excelRow = rIdx + 2;
    const cellsXml = row
      .map((cell, colIdx) => {
        const normalized: ExcelCell =
          typeof cell === 'object' && cell !== null && 'value' in cell
            ? cell
            : { value: cell };
        const rawVal = normalized.value;
        const ref = `${colIndexToLetter(colIdx)}${excelRow}`;
        const xfIdx = styleIdToXfIndex(normalized.styleId);
        const sAttr = xfIdx > 0 ? ` s="${xfIdx}"` : '';

        const wantsNumber =
          normalized.type === 'Number' ||
          (normalized.type === undefined && typeof rawVal === 'number');

        if (wantsNumber) {
          const num = typeof rawVal === 'number' ? rawVal : Number(rawVal);
          if (Number.isFinite(num)) {
            const formattedLen = String(Math.round(num)).length + 4;
            if (colIdx < colWidths.length) {
              colWidths[colIdx] = Math.min(44, Math.max(colWidths[colIdx], formattedLen));
            }
            return `<c r="${ref}" t="n"${sAttr}><v>${num}</v></c>`;
          }
        }

        const strVal = String(rawVal ?? '');
        if (colIdx < colWidths.length) {
          colWidths[colIdx] = Math.min(44, Math.max(colWidths[colIdx], strVal.length + 3));
        }
        return `<c r="${ref}" t="inlineStr"${sAttr}><is><t xml:space="preserve">${escapeXml(
          strVal
        )}</t></is></c>`;
      })
      .join('');
    return `<row r="${excelRow}">${cellsXml}</row>`;
  });

  const maxColIdx = Math.max(
    headers.length - 1,
    ...sheet.rows.map((r) => Math.max(0, r.length - 1))
  );
  const maxRow = sheet.rows.length + 1;
  const dimensionRef = `A1:${colIndexToLetter(maxColIdx)}${maxRow}`;

  const colsXml = colWidths
    .map(
      (w, idx) =>
        `<col min="${idx + 1}" max="${idx + 1}" width="${w.toFixed(1)}" customWidth="1"/>`
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="${dimensionRef}"/>
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${colsXml}</cols>
  <sheetData>
    ${headerRowXml}
    ${rowXmls.join('\n    ')}
  </sheetData>
</worksheet>`;
}

export function buildXlsxZipBytes(sheets: ExcelSheet[]): Uint8Array<ArrayBuffer> {
  const safeSheets: ExcelSheet[] =
    sheets.length > 0
      ? sheets
      : [{ name: 'Data', headers: ['Keterangan'], rows: [['Tidak ada data']] }];

  const encoder = new TextEncoder();
  const usedNames = new Set<string>();
  const resolvedSheets = safeSheets.map((s, idx) => ({
    sheetNumber: idx + 1,
    name: sanitizeSheetName(s.name, usedNames),
    data: s,
  }));

  const contentTypeOverrides = resolvedSheets
    .map(
      (s) =>
        `<Override PartName="/xl/worksheets/sheet${s.sheetNumber}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('\n  ');

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${contentTypeOverrides}
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const stylesRelId = `rId${resolvedSheets.length + 1}`;
  const workbookRels = [
    ...resolvedSheets.map(
      (s) =>
        `<Relationship Id="rId${s.sheetNumber}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${s.sheetNumber}.xml"/>`
    ),
    `<Relationship Id="${stylesRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
  ].join('\n  ');

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${workbookRels}
</Relationships>`;

  const workbookSheetsXml = resolvedSheets
    .map(
      (s) =>
        `<sheet name="${escapeXml(s.name)}" sheetId="${s.sheetNumber}" r:id="rId${s.sheetNumber}"/>`
    )
    .join('\n    ');

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${workbookSheetsXml}
  </sheets>
</workbook>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="#,##0"/>
  </numFmts>
  <fonts count="3">
    <font><sz val="10"/><color rgb="FF0F172A"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF0F172A"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0369A1"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"/></xf>
  </cellXfs>
</styleSheet>`;

  const zipEntries: { name: string; data: Uint8Array }[] = [
    { name: '[Content_Types].xml', data: encoder.encode(contentTypesXml) },
    { name: '_rels/.rels', data: encoder.encode(rootRelsXml) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRelsXml) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbookXml) },
    { name: 'xl/styles.xml', data: encoder.encode(stylesXml) },
    ...resolvedSheets.map((s) => ({
      name: `xl/worksheets/sheet${s.sheetNumber}.xml`,
      data: encoder.encode(buildWorksheetXml(s.data)),
    })),
  ];

  return createStoredZip(zipEntries);
}

/**
 * Generates a genuine OOXML (.xlsx) multi-sheet workbook compatible with Microsoft Excel,
 * Google Sheets, Apple Numbers, LibreOffice Calc, and WPS Office.
 */
export function downloadExcelWorkbook(filename: string, sheets: ExcelSheet[]): void {
  const zipBytes = buildXlsxZipBytes(sheets);
  const normalizedName = filename.endsWith('.xlsx')
    ? filename
    : filename.endsWith('.xls')
    ? `${filename.slice(0, -4)}.xlsx`
    : `${filename}.xlsx`;
  const blob = new Blob([zipBytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerBlobDownload(blob, normalizedName);
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
  const cleanDate = /^\d{4}-\d{2}-\d{2}$/.test(dateISO) ? dateISO : todayISO();
  const cleanTime = /^\d{2}:\d{2}$/.test(hhmm) ? hhmm : '07:00';
  return `${cleanDate.replace(/-/g, '')}T${cleanTime.replace(':', '')}00`;
}

function escapeIcsText(value: string): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Exports training schedules as standard RFC 5545 .ics calendar events (CRLF line endings).
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

  const eventLines = schedules.flatMap((sch) => {
    const startDate = sch.sessionDate || getNextDateForDayOfWeek(sch.dayOfWeek);
    const dtStart = toIcsDateTime(startDate, sch.startTime);
    const dtEnd = toIcsDateTime(startDate, sch.endTime);
    const byDay = icsDayMap[sch.dayOfWeek] || 'MO';
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

    const lines = [
      'BEGIN:VEVENT',
      `UID:${sch.id}@tirta-aquatics`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
    ];
    if (!sch.sessionDate) {
      lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${byDay}`);
    }
    lines.push(
      `SUMMARY:${escapeIcsText(`${sch.title} (${sch.ageGroup})`)}`,
      `LOCATION:${escapeIcsText(loc)}`,
      `DESCRIPTION:${escapeIcsText(desc)}`,
      'END:VEVENT'
    );
    return lines;
  });

  const cal = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${escapeIcsText(club.name)}//Jadwal Latihan Renang//ID`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(`Jadwal Latihan - ${club.name}`)}`,
    ...eventLines,
    'END:VCALENDAR',
  ].join('\r\n');

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
  const unpaid = data.invoices.filter(
    (i) =>
      i.status === 'Belum Lunas' ||
      i.status === 'Jatuh Tempo' ||
      i.status === 'Menunggu Verifikasi'
  );
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

  downloadExcelWorkbook(`laporan-lengkap-${slugifyClub(club.name)}-${todayISO()}.xlsx`, sheets);
}
