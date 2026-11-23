# Bukti bayar dan URL tampilan

## Penerapan Firebase

1. Di Firebase Console, buka project `pos-offline-116b6`, lalu Firestore Database `ai-studio-345f4022-fe5a-4c52-a724-48ff833ebe8c`. Terapkan isi `firestore.rules` sebagai aturan database tersebut.
2. Di Storage untuk bucket `pos-offline-116b6.firebasestorage.app`, terapkan isi `storage.rules` sebagai aturan bucket. Pastikan bucket aktif. Aturan ini mengizinkan pemilik klub mengunggah JPG, PNG, WebP, atau PDF maksimal 5 MB dan membaca berkas miliknya sendiri.
3. Karena pratinjau memakai `getBlob`, aktifkan CORS GET pada bucket Storage untuk origin website admin Anda. Dokumentasi Firebase Storage menjelaskan kebutuhan CORS untuk pengunduhan blob dari browser. Sesuaikan origin dengan URL website yang sebenarnya.
4. Jalankan `npm install --legacy-peer-deps`, `npm run lint`, dan `npm run build`, lalu terapkan build melalui proses hosting Anda.

## Alur pembayaran

Orang tua mengirim bukti melalui saluran komunikasi klub (misalnya WhatsApp). Admin membuka daftar invoice, memilih **Unggah bukti dari orang tua**, lalu memilih berkas. Status verifikasi bukti berubah menjadi **Menunggu verifikasi** tanpa mengubah status tagihan. Admin dapat membuka bukti, menolak, atau **Konfirmasi bayar**. Konfirmasi memperbarui invoice dan mencatat satu pemasukan dalam transaksi Firestore.

Belum ada akun atau halaman unggah langsung untuk orang tua. Unggahan langsung memerlukan identitas orang tua yang diverifikasi dan aturan akses terpisah. Bukti bayar tidak otomatis membuktikan dana masuk; admin tetap harus memeriksa mutasi rekening. Tidak ada integrasi payment gateway atau callback bank.

URL menyimpan halaman, tab, pilihan klub, pencarian, filter, pilihan jadwal dan tanggal presensi, laporan, panel pengingat, serta invoice yang sedang dipratinjau/dikonfirmasi. Formulir yang belum disimpan, dialog konfirmasi hapus, dan konten pesan WA tidak disertakan dalam URL.
