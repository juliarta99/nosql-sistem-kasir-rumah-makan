# Projek NoSQL Kelompok 4 - Sistem Kasir Rumah Makan (MongoDB Atlas)

Mata kuliah **Basis Data Lanjut** (24SIFH16X034) · Informatika FMIPA Universitas Udayana · Jalur 1 (lanjutan FP 1.1 & 1.2)

Implementasi ulang basis data relasional `db_sistem_kasir` (MySQL, 9 tabel 3NF) menjadi basis data dokumen pada **MongoDB Atlas (M0)** dengan 4 koleksi, validator, data sintetis berbenih, CRUD, aggregation, indeks + explain, dan pengujian otomatis.

| Dokumen | Isi |
|---|---|
| [`PANDUAN_ATLAS.md`](PANDUAN_ATLAS.md) | Langkah lengkap: buat klaster → database user → IP → koneksi → jalankan skrip → dump → undang anggota |
| [`PERUBAHAN_DAN_ALASAN.md`](PERUBAHAN_DAN_ALASAN.md) | Pola akses, alasan embedding/referencing per relasi ERD (dikaitkan dengan materi Pertemuan 11), peta migrasi tabel→koleksi, perbandingan relasional vs dokumen, kajian polyglot |
| [`LOG_KONTRIBUSI.md`](LOG_KONTRIBUSI.md) | Templat log kontribusi anggota (IK2a) |

---

## Struktur paket

```
ProjekNoSQL_Kelompok4/
├── README.md
├── PANDUAN_ATLAS.md
├── PERUBAHAN_DAN_ALASAN.md
├── LOG_KONTRIBUSI.md
├── .env.example            # contoh variabel lingkungan (tanpa kata sandi)
├── .gitignore
├── skrip/
│   ├── 01_schema.js        # 4 koleksi + validator $jsonSchema/$expr + 5 uji penolakan
│   ├── 02_seed.js          # migrasi data MySQL + data sintetis berbenih (5.000 transaksi)
│   ├── 03_crud.js          # 15 operasi CRUD
│   ├── 04_aggregation.js   # 6 pipeline analitik
│   ├── 05_indeks_explain.js# 4 indeks + explain sebelum/sesudah 3 query
│   ├── 06_pengujian.js     # 15 kasus uji (10 positif, 5 negatif)
│   ├── run_all.sh / run_all.ps1   # menjalankan 01–06 berurutan + log ke bukti/
│   └── dump.sh             # mongodump ke folder dump/
├── contoh_dokumen/         # 1 contoh dokumen JSON per koleksi
├── dump/                   # hasil mongodump dari Atlas (diisi lewat skrip/dump.sh)
└── bukti/                  # log eksekusi & tangkapan layar
    └── uji_lokal/          # log uji di MongoDB 8 lokal (sebelum deploy ke Atlas)
```

## Prasyarat
- Klaster MongoDB Atlas M0 aktif, database user ber-role **Atlas admin** (disarankan) atau *Read and write to any database*, IP sudah diizinkan → lihat `PANDUAN_ATLAS.md`.
- `mongosh` ≥ 2.x dan MongoDB Database Tools (`mongodump`, `mongorestore`).

## Cara menjalankan (dari nol)

```bash
export URI="mongodb+srv://<alamat-klaster-anda>/db_sistem_kasir"
export MONGO_USER="<nama_user>"

# semua sekaligus (password ditanya sekali, log otomatis ke bukti/)
bash skrip/run_all.sh

# atau satu per satu, sesuai petunjuk teknis
mongosh "$URI" --username "$MONGO_USER" --file skrip/01_schema.js
mongosh "$URI" --username "$MONGO_USER" --file skrip/02_seed.js
mongosh "$URI" --username "$MONGO_USER" --file skrip/03_crud.js
mongosh "$URI" --username "$MONGO_USER" --file skrip/04_aggregation.js
mongosh "$URI" --username "$MONGO_USER" --file skrip/05_indeks_explain.js
mongosh "$URI" --username "$MONGO_USER" --file skrip/06_pengujian.js

# cadangan
mongodump --uri="$URI" --username="$MONGO_USER" --out=dump
```
Windows PowerShell: `$env:URI = "..."`, `$env:MONGO_USER = "..."`, lalu `powershell -ExecutionPolicy Bypass -File skrip\run_all.ps1`.

**Memulihkan dari dump** (alternatif pemeriksaan dosen):
```bash
mongorestore --uri="mongodb+srv://<alamat-klaster-anda>/" --username="<nama_user>" --drop dump/
```

Semua skrip **idempoten** (boleh diulang; 01 melewati `collMod` bila validator tidak berubah), memakai `db.getSiblingDB("db_sistem_kasir")` (bukan `use`), dan dibungkus IIFE. Seed mengosongkan koleksi dengan `deleteMany({})` - **bukan** `drop()` - sehingga validator tetap ada.

## Cara membaca kode (untuk pemula)

Setiap skrip diawali kotak komentar berisi: cara menjalankan, tujuan skrip, dan kamus istilah yang dipakai. Urutan baca yang disarankan:

| Skrip | Baca bagian ini dulu |
|---|---|
| `01_schema.js` | "Kamus singkat istilah `$jsonSchema`" → lalu tiap validator diberi keterangan per koleksi |
| `02_seed.js` | Bagian 1 "Pengacak berbenih" (mengapa data acak bisa selalu sama) → Bagian 3–7 per koleksi |
| `03_crud.js` | Setiap operasi diberi padanan SQL-nya (`INSERT`, `SELECT ... WHERE`, `UPDATE`, `DELETE`) |
| `04_aggregation.js` | Tabel tahap pipeline + padanan SQL di kepala berkas; setiap tahap diberi nomor dan penjelasan |
| `05_indeks_explain.js` | Arti COLLSCAN/IXSCAN, aturan ESR, dan cara membaca angka explain |
| `06_pengujian.js` | Beda kasus uji positif dan negatif, serta arti kode galat 121 dan 11000 |

Catatan: semua skrip dibungkus `(function () { ... })();` (IIFE) agar nama variabelnya tidak bentrok saat dijalankan bersama, dan memakai `db.getSiblingDB("db_sistem_kasir")` sebagai pengganti `use db_sistem_kasir` (perintah `use` tidak berlaku di dalam berkas skrip).

## Model data (ringkas)

| Koleksi | Dokumen | Isi | Embedding | Referencing |
|---|---|---|---|---|
| `pengguna` | 40 | akun Admin/Kasir/Koki | `profil` (eks tabel kasir/koki, 1:1) | - |
| `pelanggan` | 300 | data pelanggan, `kontak` bervariasi, `poin` | `kontak` | dirujuk dari transaksi |
| `menu` | 45 | menu + `kategori`, `tags[]`, `varian[]`, `riwayat_harga[]` | `kategori` (1:N kecil) | - |
| `transaksi` | 5.000 | nota lengkap | `items[]` (eks detail_transaksi, N:M), `pembayaran` (eks metode_pembayaran), `riwayat_status[]` | `kasir`, `koki`, `pelanggan` → `{id, nama}` (extended reference) |

Contoh dokumen ada di `contoh_dokumen/`. Alasan lengkap tiap keputusan: `PERUBAHAN_DAN_ALASAN.md`.

## Pertanyaan analitik (04_aggregation.js)

| No | Pertanyaan | Tahap kunci |
|---|---|---|
| P1 | Menu terlaris (porsi & omzet) per kategori, Oktober 2026 | `$match` `$unwind` `$group` `$sort` `$group($first)` |
| P2 | Omzet bulanan per jenis pembayaran + % tunai | `$match` `$group` ×2 `$addFields($filter)` |
| P3 | Kinerja kasir (nota, omzet, rata-rata) + data akun | `$match` `$group` **`$lookup` pengguna** `$unwind` |
| P4 | 10 pelanggan dengan belanja terbesar + poin & kontak | `$match` `$group` `$sort` `$limit` **`$lookup` pelanggan** |
| P5 | Jam sibuk & porsi makan di tempat vs bawa pulang (WITA) | `$match` `$project($hour)` `$group($cond)` |
| P6 | 8 menu paling kurang laku 30 hari terakhir | `$match` **`$lookup` berpipeline ke transaksi** `$unwind` |

## Indeks & hasil explain (data 5.000 transaksi)

| Query | Indeks | Sebelum | Sesudah |
|---|---|---|---|
| Q1 nota ≥ Rp100rb kasir Siti, urut terbaru | `idx_esr_kasir_tanggal_total` (majemuk, ESR) | SORT ← COLLSCAN, docs 5.000 | FETCH ← IXSCAN, docs 39 (= nReturned), tanpa SORT |
| Q2 nota berisi Gurame Goreng, Okt 2026 | `idx_mk_item_tanggal` (multikey) | COLLSCAN, docs 5.000 | IXSCAN, docs 95 (= nReturned) |
| Q3 10 nota terakhir pelanggan Rina | `idx_pelanggan_tanggal` | SORT ← COLLSCAN, docs 5.000 | LIMIT ← FETCH ← IXSCAN, docs 10 |
| - | `uq_pengguna_username` (unik) | - | menolak username ganda (uji N04) |

## Daftar periksa petunjuk teknis

| No | Butir | Status | Bukti |
|---|---|---|---|
| 1 | ≥4 entitas, relasi 1:N & N:M, atribut bersarang/array, ≥6 pertanyaan | ✅ | 8 entitas ERD; N:M transaksi–menu; `items[]`, `kontak`, `varian[]`; P1–P6 |
| 2 | ≥4 koleksi, embedding & referencing beralasan, contoh dokumen | ✅ | 4 koleksi; `PERUBAHAN_DAN_ALASAN.md` §2–5; `contoh_dokumen/` |
| 3 | Validator 3 koleksi strict/error + 4 data tidak valid ditolak | ✅ | 4 koleksi; 5 penolakan (V1–V5) di 01 |
| 4 | Koleksi terbesar ≥1.000 (disarankan 5.000), lainnya ≥30, benih tetap | ✅ | 5.000 / 300 / 45 / 40; benih `4042026` |
| 5 | 15 CRUD sesuai cakupan | ✅ | C1–C3, R1–R6, U1–U4, D1–D2 |
| 6 | 6 pipeline ≥3 tahap, ≥2 `$lookup`, ≥1 `$unwind`, `$match` di awal | ✅ | 3 `$lookup`, 4 `$unwind`, semua diawali `$match` |
| 7 | 4 indeks (ESR, unik, multikey) + explain sebelum/sesudah 3 query, median 3× | ✅ | 05 |
| 8 | 15 kasus uji (≥4 negatif), perbandingan, polyglot | ✅ | 06 (10+5); `PERUBAHAN_DAN_ALASAN.md` §7 & §10 |
| 9 | Skrip jalan dari nol di Atlas, dump, README | ⏳ jalankan di Atlas | `bukti/`, `dump/` |
| 10 | Tidak ada kata sandi di skrip/laporan | ✅ | URI & user via variabel lingkungan; password ditanya saat runtime |
| 11 | Laporan, slide, log kontribusi | ⏳ | tahap berikutnya |

## Keamanan
- Jangan pernah menulis password atau connection string berpassword di berkas mana pun. `.env` sudah di-`.gitignore`.
- `password_hash` di data adalah hash SHA-256 bawaan data FP 1.2 (bukan kata sandi asli). Untuk aplikasi produksi disarankan bcrypt/argon2 dengan salt.
- Akses `0.0.0.0/0` hanya sementara saat penilaian, lalu dihapus.

## Penggunaan alat bantu
Penyusunan skrip dan dokumentasi dibantu asisten AI (Claude, Anthropic) dan telah ditinjau, dijalankan, serta dipahami oleh seluruh anggota kelompok, sesuai ketentuan orisinalitas pada petunjuk teknis.
