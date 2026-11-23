import React, { useState } from 'react';
import { signInWithPopup, User } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { createClubAndSeedData } from '../lib/seedSampleClub';
import { ArrowRight, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';

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

  const handleGoogleLogin = async () => {
    setAuthError(null);
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal masuk dengan Google.';
      setAuthError(msg);
    } finally {
      setSigningIn(false);
    }
  };

  const handleCreateClub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormError(null);

    const parsedFee = Number(defaultFee);
    if (clubName.trim().length < 2) {
      setFormError('Nama klub minimal 2 karakter.');
      return;
    }
    if (city.trim().length < 2) {
      setFormError('Kota/Kabupaten minimal 2 karakter.');
      return;
    }
    if (headCoach.trim().length < 2) {
      setFormError('Nama kepala pelatih minimal 2 karakter.');
      return;
    }
    if (!Number.isFinite(parsedFee) || parsedFee < 0) {
      setFormError('Nominal iuran bulanan tidak valid.');
      return;
    }

    setSubmitting(true);
    try {
      await createClubAndSeedData(user.uid, {
        clubName,
        city,
        headCoach,
        defaultMonthlyFee: parsedFee,
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
      {/* Left Visual Column */}
      <div className="lg:w-1/2 relative min-h-[280px] lg:min-h-screen bg-slate-900 overflow-hidden flex flex-col justify-between p-8 lg:p-12">
        <img
          src="/src/assets/images/swim_club_pool_hero_1795440061254.jpg"
          alt="Kolam renang standar kejuaraan Tirta Aquatics"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-55"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/55 to-slate-950/40" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-white p-1 shrink-0 overflow-hidden">
            <img
              src="/src/assets/images/swim_club_emblem_1795440060748.jpg"
              alt="Logo Klub Renang"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover rounded"
            />
          </div>
          <span className="font-display text-lg font-bold tracking-tight text-white">
            Tirta Aquatics
          </span>
        </div>

        <div className="relative z-10 max-w-xl space-y-4 my-8 lg:my-0">
          <p className="text-xs font-medium tracking-wide text-sky-300">
            Sistem Manajemen Klub Renang Terpadu
          </p>
          <h1 className="font-display text-3xl lg:text-4xl font-bold text-white leading-tight">
            Kelola Kas Keuangan, Prestasi Atlet, Jadwal Latihan, dan Invoice Klub dalam Satu Workspace.
          </h1>
          <p className="text-sm lg:text-base text-slate-200 leading-relaxed">
            Dirancang khusus untuk pelatih kepala, bendahara, dan pengurus klub renang Indonesia dengan pencatatan waktu kejuaraan terstruktur dan laporan kas real-time.
          </p>
        </div>

        <div className="relative z-10 flex flex-wrap items-center gap-4 text-xs text-slate-300">
          <span>Catatan Keuangan Kas</span>
          <span aria-hidden="true">·</span>
          <span>Rekor Waktu Atlet</span>
          <span aria-hidden="true">·</span>
          <span>Jadwal & Presensi</span>
          <span aria-hidden="true">·</span>
          <span>Invoice SPP Otomatis</span>
        </div>
      </div>

      {/* Right Interactive Auth / Onboarding Column */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 sm:p-10 lg:p-16 bg-white">
        {!user ? (
          <div className="w-full max-w-md space-y-8">
            <div className="space-y-2">
              <h2 className="font-display text-2xl font-bold text-slate-900">
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
              className="w-full flex items-center justify-center gap-3 px-5 py-3 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-60 cursor-pointer"
            >
              {signingIn ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-sky-400" />
              )}
              <span>{signingIn ? 'Menghubungkan akun...' : 'Masuk dengan Google'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="pt-6 border-t border-slate-200 space-y-2.5 text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Data terisolasi per pemilik klub dengan aturan keamanan terenkripsi</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Mendukung ekspor CSV laporan keuangan, catatan waktu, & cetak invoice PDF</span>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateClub} className="w-full max-w-md space-y-6">
            <div className="space-y-1.5">
              <p className="text-xs text-slate-500">
                Masuk sebagai {user.email}
              </p>
              <h2 className="font-display text-2xl font-bold text-slate-900">
                Setup Profil Klub Renang Anda
              </h2>
              <p className="text-sm text-slate-600">
                Lengkapi identitas klub untuk kop surat, invoice tagihan SPP, dan pencatatan kas.
              </p>
            </div>

            {formError && (
              <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800">
                {formError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Nama Klub Renang
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={clubName}
                  onChange={(e) => setClubName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600/20 focus:border-sky-600"
                  placeholder="Contoh: Tirta Kencana Aquatics"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Kota / Domisili
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={60}
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600/20 focus:border-sky-600"
                    placeholder="Bandung"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Iuran SPP Default (Rp)
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    max={50000000}
                    value={defaultFee}
                    onChange={(e) => setDefaultFee(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm font-mono-tabular border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600/20 focus:border-sky-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Nama Kepala Pelatih
                </label>
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={headCoach}
                  onChange={(e) => setHeadCoach(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600/20 focus:border-sky-600"
                  placeholder="Coach Hendra Wijaya"
                />
              </div>

              <label className="flex items-start gap-3 p-3.5 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={withSample}
                  onChange={(e) => setWithSample(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-600"
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
              className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-sky-700 text-white text-sm font-medium rounded-lg hover:bg-sky-800 transition-colors disabled:opacity-60 cursor-pointer"
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
