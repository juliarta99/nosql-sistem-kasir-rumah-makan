# Panduan MongoDB Atlas — dari Nol sampai Database Siap Dipakai Tim

Projek NoSQL Kelompok 4 — **Sistem Kasir Rumah Makan** (`db_sistem_kasir`)

Langkah-langkahnya mengikuti alur persiapan Atlas di materi Pertemuan 11 (pasang mongosh → daftar akun → buat klaster → user & IP → hubungkan → isi data), lalu ditambah langkah khusus projek (validator, dump, undangan tim). Panduan ini diikuti **berurutan**. Langkah 1–9 dikerjakan **ketua** (pemilik klaster), langkah 10 dikerjakan **setiap anggota** setelah menerima undangan. Label menu Atlas kadang berubah sedikit; bila tombol tidak persis sama, cari padanan namanya.

> Aturan keamanan dari petunjuk teknis: **kata sandi tidak boleh ditulis di skrip, laporan, atau repositori.** Semua contoh di bawah memakai `<...>` sebagai tempat isian — ganti seluruh teks dalam `< >` **termasuk tandanya**.

---

## Ringkasan alur

| No | Langkah | Siapa | Bukti untuk laporan |
|----|---------|-------|---------------------|
| 1 | Buat akun Atlas, organisasi, dan project | Ketua | — |
| 2 | Buat klaster gratis (M0) | Ketua | Tangkapan layar klaster aktif |
| 3 | Buat database user | Ketua | Tangkapan layar Database Access (tanpa sandi) |
| 4 | Atur Network Access (IP) | Ketua | Tangkapan layar Network Access |
| 5 | Pasang mongosh + Database Tools | Semua | `mongosh --version` |
| 6 | Ambil connection string & uji ping | Semua | Hasil `{ ok: 1 }` (CP1) |
| 7 | Jalankan skrip 01–06 dari nol | Ketua / pengembang | `bukti/log_run_all_*.txt` |
| 8 | Periksa di Data Explorer | Semua | Tangkapan layar validator & indeks |
| 9 | `mongodump` ke folder `dump/` | Penguji | Isi folder `dump/` |
| 10 | Undang anggota tim ke project | Ketua → anggota | Tangkapan layar Project Access Manager |
| 11 | (Bila diminta) akses read-only untuk dosen | Ketua | — |

---

## 1. Akun, organisasi, dan project

1. Buka <https://www.mongodb.com/atlas> → **Try Free** (boleh daftar dengan email, akun Google, atau GitHub). Verifikasi email, lalu selesaikan pertanyaan awal sampai halaman **Project Overview** tampil.
   > Ada **dua jenis akun**: akun Atlas (untuk masuk ke situs) dan *database user* (untuk membuka data). Keduanya berbeda.
2. Atlas otomatis membuat satu **Organization** dan satu **Project**. Ubah nama agar rapi:
   - Organization: `BDL-Kelompok4` (Organization Settings → nama).
   - Project: `ProjekNoSQL-Kelompok4` (menu **Projects** → **New Project** bila ingin project baru). Pada layar *Add Members* boleh dilewati dulu — undangan dilakukan di langkah 10.

## 2. Membuat klaster gratis (M0)

1. Di halaman **Project Overview**, klik **Create**.
2. Pilih paket **M0 (Free)**: tidak berbatas waktu, satu klaster gratis per project, cukup untuk 5.000 transaksi (data kita ±4 MB).
3. Isian:
   - **Name**: `Kelompok4` (huruf, angka, tanda hubung; **nama tidak dapat diubah** setelah dibuat)
   - **Provider**: AWS
   - **Region**: `Singapore (ap-southeast-1)` — terdekat dari Bali (latensi rendah). Bila tidak tersedia, pilih region Asia lain.
   - Centang **Preload sample dataset**: *tidak perlu* (biarkan kosong agar klaster bersih).
4. Klik **Create**. Klaster siap dalam waktu singkat, lalu wizard **Security Quickstart** muncul.
5. Wizard Security Quickstart boleh langsung dipakai untuk langkah 3 (database user) dan langkah 4 (IP). Isinya sama; tetap ikuti ketentuan role di bawah.

## 3. Database user (Security → Database Access)

Database user = akun untuk **terhubung ke database** (berbeda dengan akun login Atlas).

1. Menu kiri **Security → Database Access → Add New Database User**.
2. **Authentication Method**: Password.
3. Username: buat **satu user per anggota** agar jejak kerja jelas, misalnya `k4_ngurah`, `k4_<nama2>`, `k4_<nama3>`, `k4_<nama4>`.
4. Password: klik **Autogenerate Secure Password** → salin ke pengelola sandi pribadi. **Jangan** ditempel di grup chat publik, skrip, atau laporan.
5. **Database User Privileges**:
   - **Disarankan: Atlas admin.** Materi menyebut *Atlas admin* atau *Read and write to any database* sudah cukup, dan keduanya sudah kami uji di MongoDB lokal dengan role yang setara (`readWriteAnyDatabase`, serta `readWrite` + `dbAdmin` sebagai pengganti Atlas admin): seluruh skrip 01–06 lulus dari nol **dan** saat diulang.
   - Bedanya: *Read and write to any database* tidak punya izin `collMod` (mengubah validator koleksi yang sudah ada). `01_schema.js` hanya menjalankan `collMod` bila isi validator **berubah**; bila sama, langkah itu dilewati (`[TETAP]`). Jadi role ini cukup selama isi validator di `01_schema.js` tidak diedit. Bila nanti validator diubah, jalankan 01 dengan user **Atlas admin**.
6. **Add User**.

## 4. Network Access (Security → Network Access)

1. **Add IP Address → Add Current IP Address** → Confirm. Statusnya harus **Active**.
2. Setiap anggota menambahkan IP-nya sendiri (setelah diundang, langkah 10) — IP rumah, kos, dan Wi-Fi kampus berbeda-beda.
3. Bila pindah jaringan dan koneksi *timeout*, tambahkan lagi IP baru.
4. **Hindari `0.0.0.0/0`**. Hanya boleh sementara saat penilaian dosen, lalu dihapus (sesuai petunjuk teknis).

## 5. Memasang mongosh dan MongoDB Database Tools

| OS | mongosh | Database Tools (`mongodump`, `mongorestore`) |
|----|---------|------|
| Windows | Unduh MSI dari <https://www.mongodb.com/try/download/shell> | Unduh MSI dari <https://www.mongodb.com/try/download/database-tools> lalu tambahkan folder `bin` ke PATH |
| macOS | `brew install mongosh` | `brew tap mongodb/brew && brew install mongodb-database-tools` |
| Linux (Ubuntu) | paket `.deb` dari halaman unduhan di atas, atau `npm i -g mongosh` | paket `.deb` Database Tools |

Cek: `mongosh --version` dan `mongodump --version`.

## 6. Connection string & uji koneksi (bukti CP1)

1. Di halaman klaster: **Connect → Shell** (atau *Drivers*). Salin alamat yang berbentuk:
   `mongodb+srv://kelompok4.<kode-unik>.mongodb.net/`
   Atlas biasanya menampilkan perintah lengkap seperti `mongosh "mongodb+srv://kelompok4.<kode>.mongodb.net/" --apiVersion 1 --username <nama_user>`. Opsi `--apiVersion 1` boleh dipakai atau tidak; skrip kita sudah diuji dengan dan tanpa opsi itu.
2. Tambahkan nama database di belakangnya → `.../db_sistem_kasir`, sehingga mongosh langsung memakai database itu.
3. Simpan di variabel lingkungan (bukan di berkas):

**macOS / Linux / Git Bash**
```bash
export URI="mongodb+srv://<alamat-klaster-anda>/db_sistem_kasir"
export MONGO_USER="<nama_user>"
mongosh "$URI" --username "$MONGO_USER" --eval 'db.runCommand({ ping: 1 })'
```

**Windows PowerShell**
```powershell
$env:URI = "mongodb+srv://<alamat-klaster-anda>/db_sistem_kasir"
$env:MONGO_USER = "<nama_user>"
mongosh $env:URI --username $env:MONGO_USER --eval "db.runCommand({ ping: 1 })"
```

mongosh menanyakan password (tidak tampil saat diketik; itu normal). Hasil yang benar: `{ ok: 1 }` → tangkap layar untuk CP1. Cek juga `db.getName()` → `db_sistem_kasir`.

> Password diketik terpisah lewat `--username` (tidak ditulis di URI). Materi mengingatkan bahwa karakter `@ : / ? #` di password harus dikodekan bila ditulis di URI, jadi cara ini juga menghindari masalah itu.

> Galat `querySrv ENOTFOUND` = alamat klaster masih teks contoh / salah salin. Galat *timeout / server selection* = IP belum diizinkan (langkah 4).

## 7. Menjalankan seluruh skrip dari nol

Dari folder akar projek (`ProjekNoSQL_Kelompok4/`):

**Cara cepat (satu kali isi password, log otomatis ke `bukti/`)**
```bash
bash skrip/run_all.sh                     # macOS / Linux / Git Bash
```
```powershell
powershell -ExecutionPolicy Bypass -File skrip\run_all.ps1   # Windows
```

**Cara manual (persis seperti contoh petunjuk teknis)**
```bash
mongosh "$URI" --username "$MONGO_USER" --file skrip/01_schema.js
mongosh "$URI" --username "$MONGO_USER" --file skrip/02_seed.js
mongosh "$URI" --username "$MONGO_USER" --file skrip/03_crud.js
mongosh "$URI" --username "$MONGO_USER" --file skrip/04_aggregation.js
mongosh "$URI" --username "$MONGO_USER" --file skrip/05_indeks_explain.js
mongosh "$URI" --username "$MONGO_USER" --file skrip/06_pengujian.js
```

Hasil yang harus terlihat:

| Skrip | Tanda berhasil |
|-------|----------------|
| 01 | `[BUAT] koleksi ...` ×4 (run pertama) atau `[TETAP]` (run ulang) dan `Hasil: 5/5 dokumen tidak valid berhasil ditolak.` |
| 02 | pengguna 40, pelanggan 300, menu 45, transaksi 5000 |
| 03 | `deletedCount sesuai perkiraan: true` dan `Selesai: 15 operasi CRUD dijalankan.` |
| 04 | 6 blok `P1`–`P6`, masing-masing menampilkan baris hasil |
| 05 | Q1–Q3: SEBELUM `COLLSCAN` docsExamined 5000 → SESUDAH `IXSCAN` |
| 06 | `RINGKASAN: 15/15 kasus LULUS (10 positif, 5 negatif)` |

Skrip aman diulang kapan saja (idempoten). Data sintetis memakai benih tetap, jadi angka di Atlas sama dengan di laptop anggota mana pun.

## 8. Pemeriksaan di Atlas Data Explorer

Sidebar Atlas → **Data Explorer** (di bawah Database) → pilih klaster → database `db_sistem_kasir`:
- Tab **Documents**: lihat contoh dokumen `transaksi` (array `items`, subdokumen `pembayaran`).
- Tab **Indexes** pada `transaksi` & `pengguna`: 4 indeks buatan kita.
- Tab **Validation**: validator `$jsonSchema` + `$expr` (strict / error).
- Tangkap layar ketiganya untuk BAB V Deployment.

## 9. Backup dengan mongodump

```bash
bash skrip/dump.sh
# atau manual:
mongodump --uri="$URI" --username="$MONGO_USER" --out=dump
```
Hasil: `dump/db_sistem_kasir/*.bson` + `*.metadata.json` (metadata membawa validator & indeks). Uji pemulihan (opsional, ke database lain agar data asli aman):
```bash
mongorestore --uri="mongodb+srv://<alamat-klaster-anda>/" --username="$MONGO_USER" \
  --nsFrom='db_sistem_kasir.*' --nsTo='db_restore.*' dump/
```
Setelah dicek, hapus `db_restore` dari Data Explorer.

## 10. Mengundang anggota tim

**Oleh ketua:**
1. Buka project `ProjekNoSQL-Kelompok4` → menu **Access Manager → Project Access** (atau *Project Settings → Access Manager*).
2. Klik **Invite to Project** / **Add New**.
3. Masukkan email masing-masing anggota (email yang mereka pakai/akan pakai untuk akun Atlas).
4. Role yang disarankan:
   - **Project Owner** untuk semua anggota inti (kelompok kecil; setiap orang perlu bisa menambah IP sendiri dan melihat metrik). 
   - Alternatif lebih ketat: **Project Data Access Read/Write** + ketua yang mengurus IP & database user.
5. **Invite**. Status anggota tampil sebagai *Pending* sampai diterima. Undangan kedaluwarsa 30 hari.

**Oleh setiap anggota:**
1. Buka email undangan MongoDB → **Accept** → login/daftar dengan email yang sama.
2. Pilih project `ProjekNoSQL-Kelompok4`.
3. **Network Access → Add Current IP Address**.
4. Minta ketua membuatkan database user `k4_<nama>` (atau buat sendiri bila Project Owner) dengan role seperti langkah 3.
5. Lakukan langkah 5–6 di laptop sendiri sampai `ping` → `{ ok: 1 }`.
6. Jalankan `mongosh "$URI" --username "$MONGO_USER" --file skrip/06_pengujian.js` untuk memastikan 15/15 lulus dari laptop masing-masing (jangan menjalankan `02_seed.js` bersamaan dengan anggota lain).

## 11. Akses untuk dosen (bila diminta)

1. **Database Access → Add New Database User**: username `dosen_bdl_k4`, role **Only read any database** (atau *Specific Privileges* `read` @ `db_sistem_kasir`).
2. Kirim alamat klaster + username + password **lewat kanal privat** (DM / email), bukan di laporan.
3. Bila dosen terhubung dari jaringan yang tidak diketahui: tambahkan `0.0.0.0/0` **sementara**, beri komentar "sementara-penilaian", dan **hapus** setelah nilai keluar.
4. Klaster harus tetap aktif sampai penilaian selesai (M0 tidak dihapus otomatis, tetapi bisa dijeda bila lama tidak dipakai — buka Atlas sesekali).

---

## Pemecahan masalah

| Gejala | Penyebab | Solusi |
|--------|----------|--------|
| `querySrv ENOTFOUND` | Alamat klaster salah / masih contoh | Salin ulang dari **Connect → Shell** |
| `Server selection timed out` | IP belum diizinkan / pindah Wi-Fi | Network Access → Add Current IP |
| `Authentication failed` | Username/password salah, atau user dibuat di project lain | Reset password di Database Access |
| `not authorized ... collMod` | Validator di 01 diedit, tetapi user ber-role *Read and write to any database* | Jalankan 01 dengan user **Atlas admin** |
| `MongoServerSelectionError` | Alamat klaster salah atau klaster belum siap | Tunggu klaster aktif, salin ulang dari Connect |
| Password berisi `@ : / ? #` gagal di URI | Karakter khusus harus dikodekan | Jangan tulis password di URI; pakai `--username` agar diketik terpisah |
| `Document failed validation` saat seed | Skrip 02 diubah sembarangan | Jalankan ulang file asli; validator memang menolak data salah |
| `E11000 duplicate key` | Menyisipkan `_id`/username yang sudah ada | Normal pada uji negatif N04 |
| `use db_sistem_kasir` di dalam skrip galat | `use` tidak berlaku di `--file` | Skrip kita sudah memakai `db.getSiblingDB(...)` |
