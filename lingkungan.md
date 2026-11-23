# Konfigurasi Lingkungan (`.env`)

Dokumen ini berisi template isi file `.env` untuk aplikasi manajemen klub renang.

> **Catatan:** Pada setup saat ini, aplikasi membaca konfigurasi Firebase secara langsung dari `firebase-applet-config.json` dan belum memerlukan file `.env` agar berjalan di environment saat ini. Jika Anda ingin memindahkan aplikasi ke server/hosting sendiri, Anda dapat menyalin konfigurasi di bawah ini ke file `.env`.

## 1. Isi `.env` Standar (dari `.env.example`)

```env
# GEMINI_API_KEY: Opsional, hanya dibutuhkan jika menambahkan fitur Gemini AI di masa depan.
# Jangan pernah membagikan atau meng-commit API key asli ke repositori publik.
GEMINI_API_KEY="MY_GEMINI_API_KEY"

# APP_URL: URL tempat aplikasi di-host (contoh untuk lokal: http://localhost:3000)
APP_URL="http://localhost:3000"
```

## 2. Konfigurasi Firebase Client (Opsional dalam format `VITE_*`)

Jika suatu saat Anda ingin memindahkan konfigurasi dari `firebase-applet-config.json` ke variabel lingkungan Vite (`.env`), berikut nilai konfigurasi klien Firebase yang terhubung ke proyek ini:

```env
VITE_FIREBASE_PROJECT_ID="pos-offline-116b6"
VITE_FIREBASE_APP_ID="1:1018591685581:web:b9d4a90bacbf384f5d3284"
VITE_FIREBASE_API_KEY="AIzaSyCKSh85mMRdIjdUYrXuNzYuRt9Lbk5Iid0"
VITE_FIREBASE_AUTH_DOMAIN="pos-offline-116b6.firebaseapp.com"
VITE_FIREBASE_FIRESTORE_DATABASE_ID="ai-studio-345f4022-fe5a-4c52-a724-48ff833ebe8c"
VITE_FIREBASE_STORAGE_BUCKET="pos-offline-116b6.firebasestorage.app"
VITE_FIREBASE_MESSAGING_SENDER_ID="1018591685581"
VITE_FIREBASE_OAUTH_CLIENT_ID="1018591685581-e94vlebs8ac31p1785uk43ei9gets85q.apps.googleusercontent.com"
```

## 3. Cara Penggunaan Lokal

1. Salin blok `.env` di atas ke file `.env` di root proyek (pastikan `.env` tetap berada di `.gitignore`).
2. Pastikan `firebase-applet-config.json` tetap ada jika Anda belum mengubah `src/lib/firebase.ts` untuk membaca `import.meta.env.VITE_*`.
3. Jalankan `npm install` lalu `npm run dev` pada port `3000`.
