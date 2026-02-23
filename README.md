# 📋 Git Task Recap App

Aplikasi web untuk merangkum task/commit dari Gitea dan mengekspor hasilnya ke file Excel. Mendukung streaming commit secara live, pembersihan teks menggunakan Gemini AI, serta edit dan hapus manual tiap baris.

## ✨ Fitur

- 🔐 **Login** via Username & Password Gitea (generate PAT secara otomatis)
- 📁 **Fetch Repositori** dari akun pribadi dan semua organisasi (paginasi otomatis)
- 📊 **Live Streaming** — commit muncul di tabel secara real-time saat di-fetch
- 🔍 **Filter berdasarkan tanggal** dan author (nama/email/login, case-insensitive)
- ✏️ **Edit & Hapus** baris commit secara manual
- ✨ **AI Enhancement** — bersihkan judul dan deskripsi commit menggunakan Gemini AI
- 📤 **Export ke Excel** (.xlsx) dengan format kolom yang rapi
- 📌 **Sidebar Repositori** — menampilkan daftar repositori per organisasi beserta status fetch

## 🚀 Quick Start

### 1. Clone & Install Dependencies

```bash
git clone <repo-url>
cd git-task-recap-app
npm install
```

### 2. Setup Environment Variables

```bash
cp .env.example .env
```

Edit file `.env`:

```env
PORT=4000
GEMINI_API_KEY=your_gemini_api_key_here
```

> `GEMINI_API_KEY` hanya diperlukan jika ingin menggunakan fitur **Enhance with AI ✨**.
> Dapatkan API key dari [Google AI Studio](https://aistudio.google.com/app/apikey).

### 3. Jalankan Aplikasi

**Development mode (auto-reload):**

```bash
npm run dev
```

Buka browser di `http://localhost:4000`

## 📱 Cara Menggunakan

1. **Login** — Masukkan username dan password Gitea kamu di halaman `/login`.
2. **Dashboard** — Pilih **Start Date** dan **End Date**, lalu klik **Fetch Tasks**.
3. Commit kamu dari semua repositori akan muncul secara live di tabel.
4. _(Opsional)_ Klik **✨ Enhance with AI** untuk membersihkan judul & deskripsi commit secara otomatis.
5. _(Opsional)_ Gunakan tombol **Edit** atau **Hapus** di setiap baris untuk menyesuaikan data secara manual.
6. Klik **Export Excel** untuk mengunduh rekap task dalam format `.xlsx`.

## 🏗️ Struktur Proyek

```
git-task-recap-app/
├── public/
│   ├── index.html        # Landing page
│   ├── login.html        # Halaman login
│   ├── dashboard.html    # Dashboard utama
│   └── app.js            # Frontend logic
├── src/
│   ├── index.ts          # Express server & API routes
│   └── services/
│       ├── gitea.service.ts  # Integrasi Gitea API
│       ├── excel.service.ts  # Generate Excel (exceljs)
│       └── ai.service.ts     # Integrasi Gemini AI
├── .env.example
└── package.json
```

## 🔌 API Routes

| Method | Endpoint             | Deskripsi                                      |
| ------ | -------------------- | ---------------------------------------------- |
| `POST` | `/api/login`         | Login dengan username & password, generate PAT |
| `GET`  | `/api/verify`        | Verifikasi PAT dan ambil info user             |
| `GET`  | `/api/projects`      | Ambil semua repositori (personal + organisasi) |
| `POST` | `/api/commits`       | Ambil commit dari satu repositori              |
| `POST` | `/api/clean-commits` | Bersihkan teks commit menggunakan Gemini AI    |
| `POST` | `/api/export`        | Generate dan download file Excel               |

## 📊 Format Excel

| Kolom              | Isi                                       |
| ------------------ | ----------------------------------------- |
| No                 | Nomor urut                                |
| Nama Tugas         | Judul commit (baris pertama pesan commit) |
| Deskripsi Tugas    | Pesan commit lengkap                      |
| Di Modul Apa       | Nama repositori                           |
| Tanggal Dikerjakan | Tanggal & waktu commit                    |

## 🔧 Troubleshooting

**"No tasks found" padahal ada commit?**

- Pastikan tanggal yang dipilih sudah benar dan mencakup tanggal commit kamu.
- Aplikasi mencari commit berdasarkan nama, email, dan username Gitea kamu.
- Pastikan kamu sudah logout dan login ulang agar token memiliki scope yang lengkap (`read:user`, `read:repository`, `read:organization`).

**Error 500 saat fetch projects?**

- Logout dan login kembali untuk generate token baru dengan scope yang benar.

**Fitur AI tidak berfungsi?**

- Pastikan `GEMINI_API_KEY` sudah diisi di file `.env`.

## 🔐 Security

- File `.env` **jangan di-commit** ke git (sudah ada di `.gitignore`).
- Token Gitea dibuat secara otomatis oleh aplikasi dan disimpan di `localStorage` browser.
- Token hanya dikirim ke server milikmu sendiri (localhost).

## 📄 License

MIT

---

Made with ❤️ for easier task recap & reporting
