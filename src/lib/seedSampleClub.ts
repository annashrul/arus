import { doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

export async function createClubAndSeedData(
  ownerId: string,
  options?: {
    withSampleData?: boolean;
    clubName?: string;
    city?: string;
    headCoach?: string;
    defaultMonthlyFee?: number;
  }
): Promise<string> {
  const clubId = makeId('club');
  const now = serverTimestamp();

  const clubPayload = {
    name: options?.clubName?.trim() || 'Tirta Kencana Aquatics',
    city: options?.city?.trim() || 'Bandung',
    address: 'Jl. Gelora Renang Pajajaran No. 14, Bandung',
    headCoach: options?.headCoach?.trim() || 'Coach Hendra Wijaya',
    phone: '0812-3456-7890',
    email: 'admin@tirtakencana.id',
    bankName: 'Bank Mandiri',
    bankAccountNumber: '1310009845123',
    bankAccountHolder: 'Perkumpulan Renang Tirta Kencana',
    defaultMonthlyFee: options?.defaultMonthlyFee ?? 450000,
    ownerId,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'clubs', clubId), clubPayload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `clubs/${clubId}`);
  }

  if (options?.withSampleData) {
    await seedSampleRecordsForClub(clubId, ownerId);
  }

  return clubId;
}

export async function seedSampleRecordsForClub(clubId: string, ownerId: string): Promise<void> {
  const now = serverTimestamp();
  const batch1 = writeBatch(db);

  const athletes = [
    {
      id: makeId('ath'),
      fullName: 'Raka Pratama Wijaya',
      gender: 'Putra',
      birthDate: '2011-04-18',
      ageGroup: 'KU II',
      status: 'Aktif',
      parentName: 'Budi Wijaya',
      parentPhone: '081288991122',
      coachName: 'Coach Hendra Wijaya',
      monthlyFee: 450000,
      joinDate: '2022-03-10',
      notes: 'Spesialis Gaya Bebas & Kupu-Kupu jarak pendek',
    },
    {
      id: makeId('ath'),
      fullName: 'Nadia Kusuma Putri',
      gender: 'Putri',
      birthDate: '2013-09-05',
      ageGroup: 'KU III',
      status: 'Aktif',
      parentName: 'Siti Aminah',
      parentPhone: '081344556677',
      coachName: 'Coach Hendra Wijaya',
      monthlyFee: 450000,
      joinDate: '2023-01-15',
      notes: 'Persiapan Kejurnas Akuatik KU III nomor Gaya Dada',
    },
    {
      id: makeId('ath'),
      fullName: 'Dimas Aditya Saputra',
      gender: 'Putra',
      birthDate: '2015-02-22',
      ageGroup: 'KU IV',
      status: 'Aktif',
      parentName: 'Andi Saputra',
      parentPhone: '085611223344',
      coachName: 'Coach Rina Marlina',
      monthlyFee: 400000,
      joinDate: '2024-02-01',
      notes: 'Progres sangat baik di teknik start dan turn',
    },
    {
      id: makeId('ath'),
      fullName: 'Alya Zahra Ramadhani',
      gender: 'Putri',
      birthDate: '2009-11-12',
      ageGroup: 'KU I',
      status: 'Aktif',
      parentName: 'Hendra Ramadhani',
      parentPhone: '081922334455',
      coachName: 'Coach Hendra Wijaya',
      monthlyFee: 500000,
      joinDate: '2020-08-19',
      notes: 'Kapten tim putri, target limit PON & Kejurnas',
    },
    {
      id: makeId('ath'),
      fullName: 'Kevin Hartono',
      gender: 'Putra',
      birthDate: '2017-07-30',
      ageGroup: 'KU V',
      status: 'Aktif',
      parentName: 'Rudi Hartono',
      parentPhone: '081199887766',
      coachName: 'Coach Rina Marlina',
      monthlyFee: 350000,
      joinDate: '2025-01-10',
      notes: 'Fokus penguasaan pernapasan dan gaya punggung',
    },
    {
      id: makeId('ath'),
      fullName: 'Clara Angelina Tan',
      gender: 'Putri',
      birthDate: '2012-06-14',
      ageGroup: 'KU II',
      status: 'Cuti',
      parentName: 'Maya Tan',
      parentPhone: '081766554433',
      coachName: 'Coach Hendra Wijaya',
      monthlyFee: 450000,
      joinDate: '2022-11-04',
      notes: 'Izin persiapan ujian sekolah selama 3 minggu',
    },
  ];

  for (const ath of athletes) {
    const { id, ...rest } = ath;
    batch1.set(doc(db, 'athletes', id), {
      ...rest,
      clubId,
      ownerId,
      createdAt: now,
      updatedAt: now,
    });
  }

  const schedules = [
    {
      id: makeId('sch'),
      title: 'Latihan Teknik & Aerodinamika Stroke',
      sessionType: 'Teknik & Stroke',
      ageGroup: 'KU III',
      dayOfWeek: 'Senin',
      sessionDate: '2026-11-23',
      startTime: '15:30',
      endTime: '17:30',
      poolLocation: 'Kolam Renang Pajajaran (50m)',
      laneInfo: 'Lintasan 1–3',
      coachName: 'Coach Hendra Wijaya',
      targetDistanceMeters: 3200,
      notes: 'Fokus catch & pull gaya bebas dan drill gaya dada.',
    },
    {
      id: makeId('sch'),
      title: 'Sesi Endurance & Pace 200m–400m',
      sessionType: 'Ketahanan (Endurance)',
      ageGroup: 'KU I',
      dayOfWeek: 'Selasa',
      sessionDate: '2026-11-24',
      startTime: '05:30',
      endTime: '07:30',
      poolLocation: 'Kolam Renang Pajajaran (50m)',
      laneInfo: 'Lintasan 4–6',
      coachName: 'Coach Hendra Wijaya',
      targetDistanceMeters: 5000,
      notes: 'Interval threshold 10x200m @ 2:35, bawa pullbuoy & paddles.',
    },
    {
      id: makeId('sch'),
      title: 'Dasar Keseimbangan & Kaki Gaya Bebas',
      sessionType: 'Teknik & Stroke',
      ageGroup: 'KU V',
      dayOfWeek: 'Rabu',
      sessionDate: '2026-11-25',
      startTime: '15:00',
      endTime: '16:30',
      poolLocation: 'Kolam Pendek UPI (25m)',
      laneInfo: 'Lintasan 1–2',
      coachName: 'Coach Rina Marlina',
      targetDistanceMeters: 1500,
      notes: 'Gunakan papan kickboard dan fins pendek.',
    },
    {
      id: makeId('sch'),
      title: 'Sprint Power, Start Block & Flip Turn',
      sessionType: 'Start & Turn',
      ageGroup: 'KU II',
      dayOfWeek: 'Kamis',
      sessionDate: '2026-11-26',
      startTime: '16:00',
      endTime: '18:00',
      poolLocation: 'Kolam Renang Pajajaran (50m)',
      laneInfo: 'Lintasan 2–5',
      coachName: 'Coach Hendra Wijaya',
      targetDistanceMeters: 2800,
      notes: 'Simulasi reaksi start dan 15m underwater dolphin kick.',
    },
    {
      id: makeId('sch'),
      title: 'Dryland Core Strength & Mobilitas Bahu',
      sessionType: 'Latihan Fisik (Dryland)',
      ageGroup: 'Semua Kelompok',
      dayOfWeek: 'Jumat',
      sessionDate: '2026-11-27',
      startTime: '15:30',
      endTime: '17:00',
      poolLocation: 'Area Dryland Stadion Akuatik',
      laneInfo: 'Matras Indoor',
      coachName: 'Coach Rina Marlina',
      targetDistanceMeters: 0,
      notes: 'Resistance band, plank series, dan peregangan bahu.',
    },
    {
      id: makeId('sch'),
      title: 'Time Trial & Simulasi Kejuaraan Bulanan',
      sessionType: 'Simulasi Lomba',
      ageGroup: 'Semua Kelompok',
      dayOfWeek: 'Sabtu',
      sessionDate: '2026-11-28',
      startTime: '06:00',
      endTime: '09:00',
      poolLocation: 'Kolam Renang Pajajaran (50m)',
      laneInfo: 'Seluruh Lintasan (1–8)',
      coachName: 'Coach Hendra Wijaya',
      targetDistanceMeters: 3000,
      notes: 'Wajib mengenakan baju renang lomba dan kacamata cadangan.',
    },
  ];

  for (const sch of schedules) {
    const { id, ...rest } = sch;
    batch1.set(doc(db, 'schedules', id), {
      ...rest,
      clubId,
      ownerId,
      createdAt: now,
      updatedAt: now,
    });
  }

  const transactions = [
    {
      id: makeId('tx'),
      type: 'pemasukan',
      category: 'Iuran Bulanan (SPP)',
      description: 'Pembayaran SPP November 2026 — Raka Pratama Wijaya',
      amount: 450000,
      transactionDate: '2026-11-05',
      paymentMethod: 'Transfer Bank',
      referenceNo: 'TRF-20261105-01',
      athleteId: athletes[0].id,
      athleteName: athletes[0].fullName,
    },
    {
      id: makeId('tx'),
      type: 'pemasukan',
      category: 'Iuran Bulanan (SPP)',
      description: 'Pembayaran SPP November 2026 — Alya Zahra Ramadhani',
      amount: 500000,
      transactionDate: '2026-11-06',
      paymentMethod: 'QRIS',
      referenceNo: 'QRIS-20261106-08',
      athleteId: athletes[3].id,
      athleteName: athletes[3].fullName,
    },
    {
      id: makeId('tx'),
      type: 'pemasukan',
      category: 'Iuran Bulanan (SPP)',
      description: 'Pembayaran SPP November 2026 — Kevin Hartono',
      amount: 350000,
      transactionDate: '2026-11-07',
      paymentMethod: 'Transfer Bank',
      referenceNo: 'TRF-20261107-11',
      athleteId: athletes[4].id,
      athleteName: athletes[4].fullName,
    },
    {
      id: makeId('tx'),
      type: 'pemasukan',
      category: 'Sponsor & Donasi',
      description: 'Dukungan Pembinaan Prestasi dari Komite Wali Atlet',
      amount: 4500000,
      transactionDate: '2026-10-18',
      paymentMethod: 'Transfer Bank',
      referenceNo: 'SPN-20261018',
    },
    {
      id: makeId('tx'),
      type: 'pemasukan',
      category: 'Iuran Bulanan (SPP)',
      description: 'Rekap Pelunasan SPP Oktober 2026 (6 Atlet Aktif)',
      amount: 2600000,
      transactionDate: '2026-10-10',
      paymentMethod: 'Transfer Bank',
      referenceNo: 'SPP-OKT-BATCH',
    },
    {
      id: makeId('tx'),
      type: 'pengeluaran',
      category: 'Sewa Kolam',
      description: 'Sewa Lintasan Kolam Pajajaran Bulan November 2026',
      amount: 1850000,
      transactionDate: '2026-11-02',
      paymentMethod: 'Transfer Bank',
      referenceNo: 'INV-KOLAM-1126',
    },
    {
      id: makeId('tx'),
      type: 'pengeluaran',
      category: 'Gaji Pelatih',
      description: 'Honorarium Tim Pelatih Periode Oktober 2026',
      amount: 2400000,
      transactionDate: '2026-10-28',
      paymentMethod: 'Transfer Bank',
      referenceNo: 'PAY-COACH-1026',
    },
    {
      id: makeId('tx'),
      type: 'pengeluaran',
      category: 'Pendaftaran Kejuaraan',
      description: 'Biaya Registrasi Kejuaraan Bandung Open Aquatic 2026',
      amount: 950000,
      transactionDate: '2026-11-12',
      paymentMethod: 'Transfer Bank',
      referenceNo: 'BOA-REG-2026',
    },
  ];

  for (const tx of transactions) {
    const { id, ...rest } = tx;
    batch1.set(doc(db, 'transactions', id), {
      ...rest,
      clubId,
      ownerId,
      createdAt: now,
      updatedAt: now,
    });
  }

  const announcements = [
    {
      id: makeId('ann'),
      title: 'Surat Tugas Kontingen Kejuaraan Bandung Open Aquatic 2026',
      docType: 'Surat Tugas Lomba',
      eventDate: '2026-12-05',
      targetGroup: 'KU I, KU II, KU III',
      authorName: 'Coach Hendra Wijaya',
      content:
        'Dengan ini pengurus Tirta Kencana Aquatics menugaskan seluruh atlet kelompok umur KU I, KU II, dan KU III yang telah memenuhi limit waktu seleksi untuk mengikuti Kejuaraan Bandung Open Aquatic 2026 pada tanggal 5–6 Desember 2026 di Kolam Renang Si Jalak Harupat.\n\nTechnical meeting dilaksanakan 4 Desember pukul 16.00 WIB. Seluruh atlet diwajibkan hadir 60 menit sebelum sesi pemanasan dimulai dengan membawa kartu anggota resmi.',
    },
    {
      id: makeId('ann'),
      title: 'Jadwal Time Trial Evaluasi Akhir Tahun & Pengukuran Waktu Resmi',
      docType: 'Pengumuman Klub',
      eventDate: '2026-11-28',
      targetGroup: 'Semua Kelompok',
      authorName: 'Pengurus Harian Klub',
      content:
        'Sabtu, 28 November 2026 pukul 06.00 WIB akan diadakan Time Trial resmi klub untuk pembaruan catatan waktu Personal Best (PB) menjelang kalender lomba awal 2027. Orang tua dipersilakan menyaksikan dari tribun atas.',
    },
  ];

  for (const ann of announcements) {
    const { id, ...rest } = ann;
    batch1.set(doc(db, 'announcements', id), {
      ...rest,
      clubId,
      ownerId,
      createdAt: now,
      updatedAt: now,
    });
  }

  try {
    await batch1.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'batch_seed_primary');
  }

  // Batch 2: child records referencing athletes & schedules
  const batch2 = writeBatch(db);

  const swimTimes = [
    {
      id: makeId('st'),
      athleteId: athletes[0].id,
      athleteName: athletes[0].fullName,
      eventName: '50m Gaya Bebas',
      stroke: 'Gaya Bebas',
      distanceMeters: 50,
      poolCourse: '50m (LCM)',
      timeMs: 26840,
      formattedTime: '00:26.84',
      championshipName: 'Jabar Open Aquatic Championship 2026',
      meetDate: '2026-10-18',
      location: 'Bandung',
      medal: 'Emas',
      isPersonalBest: true,
      notes: 'Start sangat responsif, finish touch akurat',
    },
    {
      id: makeId('st'),
      athleteId: athletes[0].id,
      athleteName: athletes[0].fullName,
      eventName: '50m Gaya Bebas',
      stroke: 'Gaya Bebas',
      distanceMeters: 50,
      poolCourse: '50m (LCM)',
      timeMs: 27420,
      formattedTime: '00:27.42',
      championshipName: 'Kejurda Pelajar Jawa Barat 2026',
      meetDate: '2026-06-14',
      location: 'Cirebon',
      medal: 'Perak',
      isPersonalBest: false,
      notes: 'Catatan sebelumnya',
    },
    {
      id: makeId('st'),
      athleteId: athletes[0].id,
      athleteName: athletes[0].fullName,
      eventName: '100m Gaya Kupu-Kupu',
      stroke: 'Gaya Kupu-Kupu',
      distanceMeters: 100,
      poolCourse: '50m (LCM)',
      timeMs: 61450,
      formattedTime: '01:01.45',
      championshipName: 'Jabar Open Aquatic Championship 2026',
      meetDate: '2026-10-19',
      location: 'Bandung',
      medal: 'Perak',
      isPersonalBest: true,
      notes: 'Split 50m pertama 28.40',
    },
    {
      id: makeId('st'),
      athleteId: athletes[1].id,
      athleteName: athletes[1].fullName,
      eventName: '100m Gaya Dada',
      stroke: 'Gaya Dada',
      distanceMeters: 100,
      poolCourse: '50m (LCM)',
      timeMs: 78920,
      formattedTime: '01:18.92',
      championshipName: 'Jabar Open Aquatic Championship 2026',
      meetDate: '2026-10-18',
      location: 'Bandung',
      medal: 'Emas',
      isPersonalBest: true,
      notes: 'Memecahkan rekor pribadi 1.4 detik',
    },
    {
      id: makeId('st'),
      athleteId: athletes[1].id,
      athleteName: athletes[1].fullName,
      eventName: '100m Gaya Dada',
      stroke: 'Gaya Dada',
      distanceMeters: 100,
      poolCourse: '50m (LCM)',
      timeMs: 80340,
      formattedTime: '01:20.34',
      championshipName: 'Invitasi Renang Priangan 2026',
      meetDate: '2026-05-09',
      location: 'Garut',
      medal: 'Perunggu',
      isPersonalBest: false,
      notes: 'Evaluasi glide di 25m terakhir',
    },
    {
      id: makeId('st'),
      athleteId: athletes[3].id,
      athleteName: athletes[3].fullName,
      eventName: '200m Gaya Ganti',
      stroke: 'Gaya Ganti',
      distanceMeters: 200,
      poolCourse: '50m (LCM)',
      timeMs: 146780,
      formattedTime: '02:26.78',
      championshipName: 'Kejurnas Akuatik Indonesia 2026',
      meetDate: '2026-09-24',
      location: 'Jakarta (GBK)',
      medal: 'Perak',
      isPersonalBest: true,
      notes: 'Lolos kualifikasi final nasional',
    },
    {
      id: makeId('st'),
      athleteId: athletes[2].id,
      athleteName: athletes[2].fullName,
      eventName: '50m Gaya Punggung',
      stroke: 'Gaya Punggung',
      distanceMeters: 50,
      poolCourse: '50m (LCM)',
      timeMs: 36180,
      formattedTime: '00:36.18',
      championshipName: 'Festival Akuatik Pemula 2026',
      meetDate: '2026-08-16',
      location: 'Bandung',
      medal: 'Emas',
      isPersonalBest: true,
      notes: 'Tempo kayuhan stabil hingga dinding finish',
    },
  ];

  for (const st of swimTimes) {
    const { id, ...rest } = st;
    batch2.set(doc(db, 'swimTimes', id), {
      ...rest,
      clubId,
      ownerId,
      createdAt: now,
      updatedAt: now,
    });
  }

  const invoices = [
    {
      id: makeId('inv'),
      invoiceNumber: 'INV/2026/11/001',
      athleteId: athletes[0].id,
      athleteName: athletes[0].fullName,
      parentName: athletes[0].parentName,
      parentPhone: athletes[0].parentPhone,
      periodMonth: 'November 2026',
      category: 'Iuran Bulanan (SPP)',
      description: 'Iuran Latihan Reguler KU II — November 2026',
      amount: 450000,
      dueDate: '2026-11-10',
      status: 'Lunas',
      paidDate: '2026-11-05',
      paymentMethod: 'Transfer Bank',
      notes: 'Diterima via Mandiri',
    },
    {
      id: makeId('inv'),
      invoiceNumber: 'INV/2026/11/002',
      athleteId: athletes[1].id,
      athleteName: athletes[1].fullName,
      parentName: athletes[1].parentName,
      parentPhone: athletes[1].parentPhone,
      periodMonth: 'November 2026',
      category: 'Iuran Bulanan (SPP)',
      description: 'Iuran Latihan Reguler KU III — November 2026',
      amount: 450000,
      dueDate: '2026-11-28',
      status: 'Belum Lunas',
      paidDate: '',
      paymentMethod: '',
      notes: 'Pengingat dikirim ke wali atlet',
    },
    {
      id: makeId('inv'),
      invoiceNumber: 'INV/2026/11/003',
      athleteId: athletes[2].id,
      athleteName: athletes[2].fullName,
      parentName: athletes[2].parentName,
      parentPhone: athletes[2].parentPhone,
      periodMonth: 'November 2026',
      category: 'Iuran Bulanan (SPP)',
      description: 'Iuran Latihan Reguler KU IV — November 2026',
      amount: 400000,
      dueDate: '2026-11-15',
      status: 'Jatuh Tempo',
      paidDate: '',
      paymentMethod: '',
      notes: 'Melewati batas tanggal 15 November',
    },
    {
      id: makeId('inv'),
      invoiceNumber: 'INV/2026/11/004',
      athleteId: athletes[3].id,
      athleteName: athletes[3].fullName,
      parentName: athletes[3].parentName,
      parentPhone: athletes[3].parentPhone,
      periodMonth: 'November 2026',
      category: 'Iuran Bulanan (SPP)',
      description: 'Iuran Latihan Prestasi KU I — November 2026',
      amount: 500000,
      dueDate: '2026-11-10',
      status: 'Lunas',
      paidDate: '2026-11-06',
      paymentMethod: 'QRIS',
      notes: 'Lunas tepat waktu',
    },
    {
      id: makeId('inv'),
      invoiceNumber: 'INV/2026/11/005',
      athleteId: athletes[1].id,
      athleteName: athletes[1].fullName,
      parentName: athletes[1].parentName,
      parentPhone: athletes[1].parentPhone,
      periodMonth: 'Desember 2026',
      category: 'Biaya Kejuaraan',
      description: 'Pendaftaran 3 Nomor Lomba — Bandung Open Aquatic 2026',
      amount: 275000,
      dueDate: '2026-11-30',
      status: 'Belum Lunas',
      paidDate: '',
      paymentMethod: '',
      notes: 'Termasuk akreditasi lintasan pemanasan',
    },
  ];

  for (const inv of invoices) {
    const { id, ...rest } = inv;
    batch2.set(doc(db, 'invoices', id), {
      ...rest,
      clubId,
      ownerId,
      createdAt: now,
      updatedAt: now,
    });
  }

  const attendanceList = [
    {
      id: makeId('att'),
      scheduleId: schedules[0].id,
      scheduleTitle: schedules[0].title,
      sessionDate: '2026-11-23',
      athleteId: athletes[0].id,
      athleteName: athletes[0].fullName,
      status: 'Hadir',
      notes: 'Selesai target 3.200m',
    },
    {
      id: makeId('att'),
      scheduleId: schedules[0].id,
      scheduleTitle: schedules[0].title,
      sessionDate: '2026-11-23',
      athleteId: athletes[1].id,
      athleteName: athletes[1].fullName,
      status: 'Hadir',
      notes: 'Teknik pull gaya dada membaik',
    },
    {
      id: makeId('att'),
      scheduleId: schedules[0].id,
      scheduleTitle: schedules[0].title,
      sessionDate: '2026-11-23',
      athleteId: athletes[5].id,
      athleteName: athletes[5].fullName,
      status: 'Izin',
      notes: 'Cuti ujian sekolah',
    },
  ];

  for (const att of attendanceList) {
    const { id, ...rest } = att;
    batch2.set(doc(db, 'attendance', id), {
      ...rest,
      clubId,
      ownerId,
      createdAt: now,
      updatedAt: now,
    });
  }

  try {
    await batch2.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'batch_seed_secondary');
  }
}
