# 📘 Panduan Deployment & Pemeliharaan Portal Molis
Panduan lengkap untuk meng-update, memantau, dan mengelola website **Molis Portal** (Frontend Vercel, Backend Railway, DNS Cloudflare).

---

## 🏗️ Struktur Arsitektur Sistem
```
 Karyawan (PWA / Browser)
         │
         ├───► Frontend (Vercel: https://molisgemilang.my.id)
         │
         └───► Backend API (Railway: https://api.molisgemilang.my.id)
                     │
                     ├─► Database (Firebase Firestore)
                     ├─► Storage (Google Drive Upload)
                     └─► Report Output (Google Sheets)
```

---

## 🚀 1. Update Program (Deploy Ulang)
Semua pembaruan kode Anda di komputer lokal dapat langsung dikirim ke Cloud Hosting dengan cara berikut:

### A. Cara Update Frontend (Vercel)
Setiap kali Anda mengubah kode frontend di komputer lokal:
1. Buka PowerShell di folder `C:\Gsheet molis`
2. Jalankan perintah:
   ```powershell
   git add -A
   git commit -m "update frontend"
   git push origin main
   ```
   *(Vercel otomatis membaca push GitHub Anda dan membangun ulang website dalam 1 menit).*

### B. Cara Update Backend (Railway)
Setiap kali Anda mengubah kode backend di komputer lokal:
1. Buka PowerShell di folder `C:\Gsheet molis\backend`
2. Jalankan perintah:
   ```powershell
   railway up
   ```
   *(CLI akan otomatis mengunggah perubahan dan merestart server backend secara instan).*

---

## ⚙️ 2. Daftar Environment Variables (Env)
Pastikan variabel-variabel ini terdaftar pada dashboard masing-masing hosting agar website berjalan normal.

### A. Konfigurasi Vercel (Frontend Settings)
| Nama Variabel | Deskripsi | Nilai Contoh |
|---|---|---|
| `VITE_API_URL` | Alamat Endpoint API Backend Anda | `https://api.molisgemilang.my.id` |
| `VITE_GOOGLE_CLIENT_ID` | OAuth Client ID untuk Login Google | `49463012547-5ond...apps.googleusercontent.com` |

### B. Konfigurasi Railway (Backend Variables)
| Nama Variabel | Deskripsi | Nilai Contoh |
|---|---|---|
| `PORT` | Port Internal Aplikasi | `5000` |
| `NODE_ENV` | Mode Lingkungan Aplikasi | `production` |
| `DB_TYPE` | Adapter Database Aktif | `firestore` |
| `JWT_SECRET` | Kunci Enkripsi Token Login | *Tulis String acak panjang bebas* |
| `GOOGLE_CLIENT_ID` | Client ID untuk Autentikasi Google | `49463012547-5ond...apps.googleusercontent.com` |
| `GOOGLE_SHEET_ID` | ID Google Sheets Target Laporan | `1dNxsXaf44X6qf8iwJATix9k4o7elww30HaNd46BXme4` |
| `GOOGLE_DRIVE_PARENT_FOLDER_ID` | ID Folder Induk Foto Google Drive | *ID Folder Drive Anda* |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Kunci Akses Google Drive & Sheet | *Tempel isi lengkap file service_account.json* |

---

## 🌐 3. Konfigurasi DNS Cloudflare (molisgemilang.my.id)
Jika Anda mengganti domain atau memindahkan server, berikut konfigurasi DNS yang wajib dimasukkan pada Cloudflare:

### A. Untuk Frontend (Arahkan ke Vercel)
| Type | Name | Content / Target | Proxy Status |
|---|---|---|---|
| `A` | `@` | `76.76.21.21` | ☁️ Proxied (ON) |
| `CNAME` | `www` | `cname.vercel-dns.com` | ☁️ Proxied (ON) |

### B. Untuk Backend (Arahkan ke Railway)
| Type | Name | Content / Target | Proxy Status |
|---|---|---|---|
| `CNAME` | `api` | `vqgnke8r.up.railway.app` | 🔘 DNS Only (OFF) |
| `TXT` | `_railway-verify.api` | `railway-verify=0e65790187f4758f6...` | None |

---

## 🔒 4. Keamanan Firestore Database
Untuk mengamankan database Firebase Firestore Anda agar tidak dapat diakses orang tidak bertanggung jawab, buka **Firebase Console -> Firestore Database -> tab Rules** dan tempel aturan ini:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true; 
    }
  }
}
```

---

## 🛠️ 5. Menjalankan Uji Coba Secara Lokal (Lokal PC)
Jika ingin mengembangkan fitur baru secara lokal sebelum di-upload ke internet:

1. **Jalankan Backend Lokal**:
   ```powershell
   cd backend
   npm run dev
   ```
   *(Server backend akan berjalan di http://localhost:5000)*

2. **Jalankan Frontend Lokal**:
   ```powershell
   cd frontend
   npm run dev
   ```
   *(Website frontend akan berjalan di http://localhost:3000)*
