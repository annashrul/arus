import React, { useState } from 'react';
import { signInWithPopup, User } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { createClubAndSeedData } from '../lib/seedSampleClub';
import { clampString, FieldErrors, LIMITS } from '../lib/validation';
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';

interface ClubOnboardingProps {
  user: User | null;
  onClubCreated: () => void;
}

export const ClubOnboarding: React.FC<ClubOnboardingProps> = ({ user, onClubCreated }) => {
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [clubName, setClubName] = useState('Tirta Kencana Aquatics');
  const [city, setCity] = useState('Bandung');
  const [headCoach, setHeadCoach] = useState('Coach Hendra Wijaya');
  const [defaultFee, setDefaultFee] = useState('450000');
  const [withSample, setWithSample] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<string>>({});

  const clearFieldError = (key: string) => {
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleGoogleLogin = async () => {
    setAuthError(null);
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-closed-by-user') {
        setAuthError('Jendela login Google ditutup sebelum selesai. Silakan coba lagi.');
      } else if (code === 'auth/popup-blocked') {
        setAuthError('Popup diblokir oleh browser. Izinkan popup untuk melanjutkan login Google.');
      } else if (code === 'auth/unauthorized-domain') {
        setAuthError('Domain aplikasi belum terdaftar di Authorized Domains Firebase Authentication.');
      } else {
        const msg = err instanceof Error ? err.message : 'Gagal masuk dengan Google.';
        setAuthError(msg);
      }
    } finally {
      setSigningIn(false);
    }
  };

  const handleCreateClub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormError(null);

    const errors: FieldErrors<string> = {};
    const cleanName = clampString(clubName, LIMITS.club.nameMax);
    const cleanCity = clampString(city, LIMITS.club.cityMax);
    const cleanCoach = clampString(headCoach, LIMITS.club.headCoachMax);
    const parsedFee = Number(defaultFee);

    if (cleanName.length < LIMITS.club.nameMin) {
      errors.clubName = `Nama klub minimal ${LIMITS.club.nameMin} karakter.`;
    }
    if (cleanCity.length < LIMITS.club.cityMin) {
      errors.city = `Kota/Kabupaten minimal ${LIMITS.club.cityMin} karakter.`;
    }
    if (cleanCoach.length < LIMITS.club.headCoachMin) {
      errors.headCoach = `Nama kepala pelatih minimal ${LIMITS.club.headCoachMin} karakter.`;
    }
    if (
      defaultFee.trim() === '' ||
      !Number.isFinite(parsedFee) ||
      !Number.isInteger(parsedFee) ||
      parsedFee < 0 ||
      parsedFee > 50000000
    ) {
      errors.defaultFee = 'Nominal iuran harus bilangan bulat antara Rp 0 hingga Rp 50.000.000.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError(Object.values(errors)[0] || 'Periksa kembali kolom profil klub.');
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    try {
      await createClubAndSeedData(user.uid, {
        clubName: cleanName,
        city: cleanCity,
        headCoach: cleanCoach,
        defaultMonthlyFee: Math.round(parsedFee),
        withSampleData: withSample,
      });
      onClubCreated();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal membuat profil klub.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Visual Column (Compact mobile banner -> full-height split panel on lg) */}
      <div className="lg:w-1/2 relative min-h-[190px] sm:min-h-[240px] lg:min-h-screen bg-slate-900 overflow-hidden flex flex-col justify-between p-5 sm:p-8 lg:p-12">
        <img
          src="/src/assets/images/swim_club_pool_hero_1795440061254.jpg"
          alt="Kolam renang standar kejuaraan Tirta Aquatics"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-55"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/55 to-slate-950/40" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-white p-1 shrink-0 overflow-hidden">
            <img
              src="/src/assets/images/swim_club_emblem_1795440060748.jpg"
              alt="Logo Klub Renang"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover rounded"
            />
          </div>
          <span className="font-display text-base sm:text-lg font-bold tracking-tight text-white">
            Tirta Aquatics
          </span>
        </div>

        <div className="relative z-10 max-w-xl space-y-2 sm:space-y-4 mt-6 lg:my-0">
          <p className="text-[11px] sm:text-xs font-medium tracking-wide text-sky-300">
            Sistem Manajemen Klub Renang Terpadu
          </p>
          <h1 className="font-display text-xl sm:text-3xl lg:text-4xl font-bold text-white leading-snug lg:leading-tight">
            Kelola Kas Keuangan, Prestasi Atlet, Jadwal Latihan, dan Invoice Klub dalam Satu Workspace.
          </h1>
          <p className="hidden sm:block text-sm lg:text-base text-slate-200 leading-relaxed">
            Dirancang khusus untuk pelatih kepala, bendahara, dan pengurus klub renang Indonesia dengan pencatatan waktu kejuaraan terstruktur dan laporan kas real-time.
          </p>
        </div>

        <div className="relative z-10 hidden sm:flex flex-wrap items-center gap-4 text-xs text-slate-300 mt-4 lg:mt-0">
          <span>Catatan Keuangan Kas</span>
          <span aria-hidden="true">·</span>
          <span>Rekor Waktu Atlet</span>
          <span aria-hidden="true">·</span>
          <span>Jadwal & Presensi</span>
          <span aria-hidden="true">·</span>
          <span>Invoice SPP Otomatis</span>
        </div>
      </div>

      {/* Interactive Auth / Onboarding Column */}
      <div className="flex-1 lg:w-1/2 flex items-start sm:items-center justify-center p-5 sm:p-10 lg:p-16 bg-white pb-safe">
        {!user ? (
          <div className="w-full max-w-md space-y-6 sm:space-y-8 pt-2 sm:pt-0">
            <div className="space-y-2">
              <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
                Masuk ke Workspace Klub
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Gunakan akun Google Anda untuk mengakses data atlet, kas keuangan, jadwal kolam, dan tagihan SPP yang tersimpan aman di cloud.
              </p>
            </div>

            {authError && (
              <div className="p-3.5 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800">
                {authError}
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={signingIn}
              className="w-full flex items-center justify-center gap-3 px-5 min-h-[48px] bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-60 cursor-pointer"
            >
              {signingIn ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-sky-400" />
              )}
              <span>{signingIn ? 'Menghubungkan akun...' : 'Masuk dengan Google'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="pt-5 border-t border-slate-200 space-y-2.5 text-xs text-slate-500">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>Data terisolasi per pemilik klub dengan aturan keamanan terenkripsi</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>Mendukung ekspor CSV laporan keuangan, catatan waktu, & cetak invoice PDF</span>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateClub} noValidate className="w-full max-w-md space-y-5 sm:space-y-6 pt-1 sm:pt-0">
            <div className="space-y-1.5">
              <p className="text-xs text-slate-500 truncate">
                Masuk sebagai {user.email}
              </p>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
                Setup Profil Klub Renang Anda
              </h2>
              <p className="text-sm text-slate-600">
                Lengkapi identitas klub untuk kop surat, invoice tagihan SPP, dan pencatatan kas.
              </p>
            </div>

            {formError && (
              <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Nama Klub Renang <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={LIMITS.club.nameMax}
                  value={clubName}
                  onChange={(e) => {
                    setClubName(e.target.value);
                    clearFieldError('clubName');
                  }}
                  className={`w-full px-3.5 min-h-[44px] text-base sm:text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600/20 focus:border-sky-600 ${
                    fieldErrors.clubName ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
                  }`}
                  placeholder="Contoh: Tirta Kencana Aquatics"
                />
                {fieldErrors.clubName && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.clubName}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Kota / Domisili <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={LIMITS.club.cityMax}
                    value={city}
                    onChange={(e) => {
                      setCity(e.target.value);
                      clearFieldError('city');
                    }}
                    className={`w-full px-3.5 min-h-[44px] text-base sm:text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600/20 focus:border-sky-600 ${
                      fieldErrors.city ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
                    }`}
                    placeholder="Bandung"
                  />
                  {fieldErrors.city && (
                    <p className="mt-1 text-xs text-red-600">{fieldErrors.city}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Iuran SPP Default (Rp) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={50000000}
                    value={defaultFee}
                    onChange={(e) => {
                      setDefaultFee(e.target.value);
                      clearFieldError('defaultFee');
                    }}
                    className={`w-full px-3.5 min-h-[44px] text-base sm:text-sm font-mono-tabular border rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600/20 focus:border-sky-600 ${
                      fieldErrors.defaultFee ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
                    }`}
                  />
                  {fieldErrors.defaultFee && (
                    <p className="mt-1 text-xs text-red-600">{fieldErrors.defaultFee}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Nama Kepala Pelatih <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={LIMITS.club.headCoachMax}
                  value={headCoach}
                  onChange={(e) => {
                    setHeadCoach(e.target.value);
                    clearFieldError('headCoach');
                  }}
                  className={`w-full px-3.5 min-h-[44px] text-base sm:text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600/20 focus:border-sky-600 ${
                    fieldErrors.headCoach ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
                  }`}
                  placeholder="Coach Hendra Wijaya"
                />
                {fieldErrors.headCoach && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.headCoach}</p>
                )}
              </div>

              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer min-h-[44px]">
                <input
                  type="checkbox"
                  checked={withSample}
                  onChange={(e) => setWithSample(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-600 shrink-0"
                />
                <div className="text-xs leading-relaxed">
                  <span className="font-semibold text-slate-900 block">
                    Isi data awal contoh klub renang
                  </span>
                  <span className="text-slate-600">
                    Menambahkan 6 atlet (KU I–KU V), catatan waktu kejuaraan, jadwal latihan, kas keuangan, invoice, dan surat tugas siap pakai.
                  </span>
                </div>
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 px-5 min-h-[48px] bg-sky-700 text-white text-sm font-medium rounded-xl hover:bg-sky-800 transition-colors disabled:opacity-60 cursor-pointer"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4" />
              )}
              <span>{submitting ? 'Menyiapkan Workspace...' : 'Buat Klub & Mulai Kelola'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
