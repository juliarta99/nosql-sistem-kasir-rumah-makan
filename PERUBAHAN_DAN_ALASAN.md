# Perubahan Model: MySQL (Relasional) → MongoDB (Dokumen)

Projek NoSQL Kelompok 4 - **Sistem Kasir Rumah Makan** · Jalur 1 (lanjutan FP 1.1 & FP 1.2)

Dokumen ini menjelaskan **apa yang berubah** dari `db_sistem_kasir` versi MySQL (9 tabel, 3NF) menjadi versi MongoDB (4 koleksi), **mengapa** strukturnya seperti itu, dan **apa konsekuensinya**. Setiap keputusan dikaitkan dengan aturan pemodelan dari materi **Pertemuan 11 (Document Database dengan MongoDB)**, dan setiap angka berasal dari hasil eksekusi skrip pada 5.000 transaksi (lihat `bukti/`).

---

## 1. Ringkasan dalam satu tabel

| MySQL (9 tabel) | MongoDB (4 koleksi) | Pola | Inti alasan |
|---|---|---|---|
| `user` + `kasir` + `koki` | **`pengguna`** (profil staf di-embed) | Embedding 1:1 | Selalu dibaca bersama saat login; tidak tumbuh |
| `pelanggan` | **`pelanggan`** | Referencing (koleksi sendiri) | 1 pelanggan → transaksi yang terus bertambah |
| `menu` + `kategori` | **`menu`** (kategori di-embed) | Embedding data acuan | 7 kategori statis tanpa atribut lain, dibaca bersama menu |
| `transaksi` + `detail_transaksi` + `metode_pembayaran` | **`transaksi`** (items[] & pembayaran di-embed; kasir/koki/pelanggan = rujukan + salinan nama) | Koleksi peristiwa + embedding "satu ke sedikit" | Satu nota = satu unit baca/tulis atomik |

9 tabel → 4 koleksi, **bukan** "satu tabel satu koleksi" (kesalahan umum yang disebut di materi). Dari 8 relasi ERD, 5 diselesaikan dengan embedding dan 3 dengan referencing yang dilengkapi salinan nama.

---

## 2. Dasar pemodelan: pola akses dulu, baru bentuk dokumen

Materi Pertemuan 11 menegaskan bahwa pemodelan dokumen dimulai dari pertanyaan **"query apa yang paling sering dijalankan aplikasi?"**, dan bahwa **data yang dibaca bersama sebaiknya disimpan bersama**. Maka kami mulai dari pola akses aplikasi kasir, bukan dari tabel MySQL.

| No | Pola akses (aplikasi kasir) | Frekuensi | Data yang dibutuhkan sekaligus | Dilayani oleh |
|---|---|---|---|---|
| A1 | Kasir membuat nota baru | Sangat sering (±47 nota/hari) | header nota + semua item + pembayaran + nama kasir & pelanggan | **1 `insertOne` ke `transaksi`** |
| A2 | Cetak struk / lihat detail nota | Sangat sering | sama dengan A1 | **1 `findOne` by `_id`, 0 join** |
| A3 | Layar dapur: antrean pesanan belum selesai | Terus-menerus | status, item, tipe pesanan, koki | 1 query `transaksi` (R2) |
| A4 | Koki menandai pesanan siap | Sering | status + riwayat waktu | 1 `updateOne` atomik (U3) |
| A5 | Login staf | Tiap awal shift | username, hash, role, nama, shift | **1 `findOne` di `pengguna`** |
| A6 | Menampilkan daftar menu di layar kasir | Sering | nama, harga, kategori, tersedia, varian | 1 `find` di `menu` |
| A7 | Riwayat & poin pelanggan | Sedang | nota-nota pelanggan + data pelanggan | `transaksi` (indeks) + `pelanggan` |
| A8 | Laporan harian/bulanan (omzet, menu terlaris, kinerja kasir) | Harian | agregasi banyak nota | aggregation pipeline P1–P6 |

Kesimpulan dari tabel ini: **A1–A4 (yang paling sering) semuanya berpusat pada satu nota utuh**. Karena itu `transaksi` dirancang sebagai dokumen yang berisi semua yang dibutuhkan nota, sedangkan data yang tumbuh sendiri (pelanggan) dan data master (menu, akun) dipisah.

---

## 3. Aturan pemilihan yang kami pakai (dari materi)

**Tabel "Kapan Memilih Embedding atau Referencing" (Pertemuan 11):**

| Pertimbangan | Embedding | Referencing |
|---|---|---|
| Pola baca | Data dibaca bersama | Data sering dibaca terpisah |
| Jumlah data terkait | Sedikit dan terbatas | Banyak atau terus bertambah |
| Perubahan | Jarang berubah sendiri | Sering berubah atau dipakai bersama |
| Konsistensi | Satu dokumen, atomik | Antardokumen, perlu perhatian ekstra |
| Ukuran dokumen | Membesar, batas 16 MB | Tetap kecil |

**Tabel "Pola Hubungan Antardata" (Pertemuan 11):** satu ke satu → embedding; satu ke sedikit → embedding dalam array; satu ke banyak (terus bertambah) → referencing; banyak ke banyak → referencing, collection tersendiri.

**Contoh rancangan perpustakaan di materi** (anggota, buku, peminjaman) menjadi acuan langsung: `peminjaman` adalah koleksi sendiri yang menyimpan `noAnggota` dan `kodeBuku` sebagai rujukan **ditambah salinan judul agar riwayat tampil tanpa `$lookup`**, sedangkan `penerbit` dan `tag` disematkan di buku karena dibaca bersama dan jarang berubah. Rancangan kami mengikuti pola yang sama persis:

| Rancangan perpustakaan (materi) | Rancangan kasir (kami) |
|---|---|
| `peminjaman` = koleksi peristiwa yang menghubungkan anggota N:M buku | `transaksi` = koleksi peristiwa yang menghubungkan pelanggan N:M menu |
| `noAnggota` (ref) + `kodeBuku` (ref) + `judul` (salinan) | `pelanggan.id_pelanggan` (ref) + `items.kode_menu` (ref) + `nama_menu`, `harga` (salinan) |
| `penerbit {}` disematkan di buku | `kategori {}` disematkan di menu; `pembayaran {}` di transaksi |
| `tag []` disematkan di buku | `tags []`, `varian []` di menu |
| `alamat {kota}` disematkan di anggota | `kontak {no_hp, email}` di pelanggan; `profil {}` di pengguna |

---

## 4. Keputusan per relasi ERD (8 relasi)

Setiap relasi dinilai dengan 5 pertimbangan di §3. ✔ = mendukung keputusan.

### R1–R2. User–Kasir (1:1) dan User–Koki (1:1) → **EMBED** `profil` ke `pengguna`

| Pertimbangan | Kondisi nyata | Arah |
|---|---|---|
| Pola baca | Login (A5) butuh akun **dan** nama/shift staf sekaligus | Embed ✔ |
| Jumlah | Tepat satu profil per akun | Embed ✔ |
| Perubahan | Nama/shift jarang berubah | Embed ✔ |
| Konsistensi | Akun & profil tersimpan atomik dalam satu dokumen | Embed ✔ |
| Ukuran | ±200 byte | Embed ✔ |

Materi menyebut hubungan **satu ke satu → embedding** (contoh: anggota dan kartu anggotanya). Tambahan alasan khusus kasus ini:
- **Bentuk data memang polimorfik.** Admin tidak punya profil, Kasir/Koki wajib punya. MySQL memecahnya jadi 3 tabel + 2 FK + 2 UNIQUE; di MongoDB cukup satu koleksi dengan aturan validator `anyOf: [role = Admin, required: profil]` (uji V5 di 01).
- Sifat 1:1 dijamin **secara struktural** (profil ada di dalam dokumen akunnya), sehingga UNIQUE `id_user` tidak diperlukan lagi.

### R3. Kategori–Menu (1:N) → **EMBED** `kategori {id, nama}` ke `menu`

| Pertimbangan | Kondisi nyata | Arah |
|---|---|---|
| Pola baca | Setiap tampil menu (A6) dan laporan, nama kategori ikut | Embed ✔ |
| Jumlah | Satu menu punya tepat satu kategori (yang disematkan ke menu adalah sisi "satu") | Embed ✔ |
| Perubahan | 7 nama kategori praktis tidak pernah berubah | Embed ✔ |
| Konsistensi | Daftar kategori sah dijaga validator `enum` | Embed ✔ |
| Ukuran | ±40 byte | Embed ✔ |

Ini sama dengan `penerbit` yang disematkan di `buku` pada contoh materi. Kategori tidak punya atribut lain selain nama, jadi koleksi `kategori` terpisah hanya memaksa `$lookup` tanpa manfaat (dan 7 dokumen juga di bawah syarat ≥30 dokumen). **Konsekuensi diterima:** bila nama kategori diganti, perlu satu `updateMany` (lihat K3 di §7).

### R4. Transaksi–Menu (N:M, tabel `detail_transaksi`) → item **EMBED** di nota, menu **DIRUJUK** dengan `kode_menu`  ← keputusan paling penting

Relasi N:M ini dinilai **dari dua arah**, karena jawabannya berbeda:

| Arah | Jumlah | Keputusan |
|---|---|---|
| Nota → item | **Satu ke sedikit**: rata-rata 2,24 item, maksimum 5 per nota | **Embed** sebagai array `items[]` |
| Menu → nota | **Satu ke banyak, terus bertambah**: satu menu muncul di ribuan nota | **Jangan** simpan daftar nota di menu → menu jadi koleksi sendiri, dirujuk lewat `items.kode_menu` |

Penilaian arah nota → item:

| Pertimbangan | Kondisi nyata | Arah |
|---|---|---|
| Pola baca | A1–A4: struk, dapur, dan update status selalu butuh header + seluruh item | Embed ✔ |
| Jumlah | Terbatas: maks 5 di data, validator `maxItems: 50` | Embed ✔ |
| Perubahan | Item nota **tidak pernah berubah** setelah nota dibuat (koreksi = void nota) | Embed ✔ |
| Konsistensi | Header + item tersimpan dalam satu `insertOne` → tidak mungkin ada nota tanpa item atau item yatim | Embed ✔ |
| Ukuran | Dokumen rata-rata **830 byte**, terbesar **1,2 KB** (≈0,007% dari 16 MB) | Embed ✔ |

Lima pertimbangan menunjuk ke embedding. Ini sesuai pola **satu ke sedikit → embedding dalam array**, dan sekaligus pola **banyak ke banyak → collection tersendiri** dari materi: `transaksi` itulah "collection tersendiri" yang menghubungkan pelanggan dan menu (padanan `peminjaman`).

Alasan tambahan yang kuat:
- **Salinan harga = kebenaran historis.** `items.harga` adalah harga **saat transaksi**. Di data kami 6 menu naik harga per 1 Oktober 2026 (mis. Nasi Goreng 20.000 → 22.000), dan nota September tetap Rp20.000 (uji T08). Kalau item hanya merujuk menu, struk lama ikut berubah harganya, dan itu salah secara akuntansi. MySQL juga menyalin harga ke `detail_transaksi.harga`; kami melanjutkan pola yang sama.
- **Salinan `nama_menu` dan `kategori`** mengikuti contoh materi "salinan judul agar riwayat tampil tanpa `$lookup`". Laporan menu terlaris (P1) jadi tanpa `$lookup` sama sekali.

### R5. Metode Pembayaran–Transaksi (1:N) → **EMBED** subdokumen `pembayaran`

| Pertimbangan | Kondisi nyata | Arah |
|---|---|---|
| Pola baca | Struk selalu mencetak metode, jumlah dibayar, kembalian | Embed ✔ |
| Jumlah | Satu nota satu pembayaran | Embed ✔ |
| Perubahan | 6 nilai metode statis | Embed ✔ |
| Konsistensi | Validator `$expr` memeriksa total, dibayar, dan kembalian dalam **satu dokumen** - tidak mungkin bila dipisah | Embed ✔ |
| Ukuran | ±80 byte | Embed ✔ |

`jumlah_dibayar` dan `kembalian` secara makna memang atribut pembayaran, jadi digabung ke satu subdokumen. Ditambah `jenis` (Tunai/QRIS/Transfer) agar analitik porsi tunai (P2) langsung bisa dikelompokkan.

### R6–R7. Kasir–Transaksi dan Koki–Transaksi (1:N) → **REFERENCE** + salinan nama

| Pertimbangan | Kondisi nyata | Arah |
|---|---|---|
| Pola baca | Struk butuh **nama** kasir; laporan kinerja butuh **data akun** (username, shift, aktif) | Campuran → rujukan + salinan nama |
| Jumlah | Satu kasir melayani ±130–310 nota dalam 3,5 bulan, terus bertambah | **Reference** ✔ |
| Perubahan | Akun berubah sendiri (aktif/nonaktif, shift) | **Reference** ✔ |
| Konsistensi | Tidak perlu atomik bersama nota | Reference ✔ |
| Ukuran | Menyematkan nota ke kasir → array tak terbatas, mendekati 16 MB | **Reference** ✔ |

Sesuai materi **satu ke banyak yang terus bertambah → referencing**. Supaya kebutuhan paling sering (cetak struk) tidak perlu `$lookup`, kami menyalin `nama` di samping `id_pengguna`, persis seperti salinan judul pada `peminjaman`. Salinan ini aman karena nama staf **hampir tidak pernah berubah** (jadi tidak termasuk kesalahan "menyalin data yang sering berubah"), dan nama pada struk lama memang seharusnya nama saat itu. `koki` boleh `null` (pesanan belum diambil dapur), sama seperti `id_koki DEFAULT NULL` di MySQL.

### R8. Pelanggan–Transaksi (1:N) → **REFERENCE** + salinan nama

| Pertimbangan | Kondisi nyata | Arah |
|---|---|---|
| Pola baca | Data pelanggan (poin, kontak) sering dibaca **terpisah** dari nota | Reference ✔ |
| Jumlah | Pelanggan setia punya 60–80 nota dan terus bertambah | Reference ✔ |
| Perubahan | `poin` dan `kontak` berubah sendiri | Reference ✔ |
| Konsistensi | Tidak perlu atomik bersama nota | Reference ✔ |
| Ukuran | Embed nota ke pelanggan → array tak terbatas | Reference ✔ |

Ini padanan langsung contoh materi **"buku dan ulasan yang terus bertambah → referencing"**. Riwayat pelanggan dibaca cepat dengan indeks `idx_pelanggan_tanggal` (Q3: 5.000 → 10 dokumen diperiksa).

### Ringkasan 8 relasi

| Relasi ERD | Kardinalitas | Pola hubungan (materi) | Keputusan |
|---|---|---|---|
| User–Kasir | 1:1 | Satu ke satu | Embed `profil` |
| User–Koki | 1:1 | Satu ke satu | Embed `profil` |
| Kategori–Menu | 1:N (sisi "satu" disematkan) | Data acuan statis (seperti penerbit) | Embed `kategori` |
| Transaksi–Menu | N:M | Nota→item: satu ke sedikit; menu→nota: satu ke banyak | Embed `items[]` + rujukan `kode_menu` |
| Metode–Transaksi | 1:N (sisi "satu" disematkan) | Data acuan statis | Embed `pembayaran` |
| Kasir–Transaksi | 1:N | Satu ke banyak, bertambah | Reference + salinan nama |
| Koki–Transaksi | 1:N | Satu ke banyak, bertambah | Reference + salinan nama |
| Pelanggan–Transaksi | 1:N | Satu ke banyak, bertambah | Reference + salinan nama |

---

## 5. Kesalahan umum pemodelan (materi) dan cara kami menghindarinya

| Kesalahan umum (Pertemuan 11) | Status di rancangan kami |
|---|---|
| **Meniru tabel relasional**: satu entitas satu collection, `$lookup` di mana-mana | ✅ Dihindari: 9 tabel → 4 koleksi. Nota dibaca tanpa join; `$lookup` hanya di 3 dari 6 laporan, dan selalu setelah `$group`/`$limit` sehingga hanya 10–19 dokumen yang digabung |
| **Array tanpa batas** | ✅ Dihindari: semua array dibatasi validator (`items` ≤ 50, `riwayat_status` ≤ 3, `tags`/`varian` ≤ 10, `riwayat_harga` ≤ 12). Data yang tumbuh (nota per pelanggan/kasir/menu) **tidak** disematkan |
| **Menyalin data yang sering berubah** | ✅ Hanya menyalin data yang jarang berubah (nama staf, nama pelanggan, nama menu, nama kategori) atau yang **memang harus beku** (harga saat transaksi). Data yang sering berubah (`poin`, `tersedia`, `aktif`, harga menu terkini) **tidak** disalin |
| **Mengabaikan pola akses** | ✅ Rancangan diturunkan dari 8 pola akses di §2 |
| *(tambahan)* Skema fleksibel tanpa desain | ✅ Validator `$jsonSchema` strict/error di **4 koleksi** (materi: "skema fleksibel bukan berarti tanpa desain") |

---

## 6. Peta migrasi tabel → koleksi (field per field)

### 6.1 `pengguna` ← `user`, `kasir`, `koki`

| MySQL | MongoDB | Keterangan |
|---|---|---|
| `user.id_user` | `_id` | Kunci alami dipertahankan (1–11 sama persis) |
| `user.username` | `username` | + indeks **unik** `uq_pengguna_username` |
| `user.password` | `password_hash` | Diganti nama agar jelas isinya hash; validator memaksa 64 heksadesimal (menolak kata sandi polos) |
| `user.role` | `role` | enum `Admin / Kasir / Koki` |
| `kasir.id_kasir`, `koki.id_koki` | `profil.kode_staf` | `KSR01..` / `KOK01..` (KSR01 = id_kasir 1, dapat ditelusuri) |
| `kasir.nama_kasir`, `koki.nama_koki` | `profil.nama_lengkap` | |
| - (baru) | `profil.no_hp`, `profil.shift`, `aktif`, `dibuat_pada` | Atribut opsional; `aktif` agar staf yang resign tidak dihapus dan histori nota tetap valid |
| `kasir.id_user` UNIQUE, `koki.id_user` UNIQUE | (hilang) | 1:1 dijamin secara struktural |

### 6.2 `menu` ← `menu`, `kategori`

| MySQL | MongoDB | Keterangan |
|---|---|---|
| `menu.kode_menu` | `_id` | Mis. `NSAMBKR` |
| `menu.nama_menu` | `nama` | |
| `menu.id_kategori` + `kategori.nama_kategori` | `kategori: { id, nama }` | Disematkan; nama dijaga enum validator |
| `menu.harga` | `harga` | Angka rupiah bulat (lihat §8.3) |
| - (baru) | `tersedia`, `tags[]`, `varian[]`, `riwayat_harga[]` | Atribut array/bervariasi |

### 6.3 `transaksi` ← `transaksi`, `detail_transaksi`, `metode_pembayaran`

| MySQL | MongoDB | Keterangan |
|---|---|---|
| `transaksi.no_nota` | `_id` | Pola `TR` + ddMMyyyy + 5 digit, divalidasi regex |
| `tanggal_transaksi` | `tanggal` | ISODate (UTC); waktu MySQL dianggap WITA (+08:00) |
| `tipe_pesanan`, `status_transaksi` | `tipe_pesanan`, `status` | enum sama persis |
| `detail_transaksi` (`kode_menu, kuantitas, harga, subtotal`) | `items[]` `{kode_menu, nama_menu, kategori, harga, kuantitas, subtotal, catatan?}` | Tabel penghubung dilebur ke nota |
| `total_bayar` | `total_bayar` | Dijaga `$expr`: = Σ `items.subtotal` |
| `id_metode` + `nama_metode` | `pembayaran.metode` (+ `pembayaran.jenis`) | 6 nilai enum |
| `jumlah_dibayar`, `kembalian` | `pembayaran.jumlah_dibayar`, `pembayaran.kembalian` | Dijaga `$expr` |
| `id_kasir` | `kasir: { id_pengguna, nama }` | id_kasir n → id_pengguna n+5 (mis. 1 → 6) |
| `id_koki` (NULL boleh) | `koki: { id_pengguna, nama }` atau `null` | id_koki n → id_pengguna n |
| `id_pelanggan` | `pelanggan: { id_pelanggan, nama }` | |
| - (baru) | `riwayat_status[]` (maks 3) | Waktu tiap perubahan status |

### 6.4 `pelanggan` ← `pelanggan`

| MySQL | MongoDB | Keterangan |
|---|---|---|
| `id_pelanggan`, `nama_pelanggan` | `_id`, `nama` | 7 data asli dipertahankan |
| - (baru) | `kontak { no_hp?, email? }`, `poin`, `terdaftar_pada` | `kontak` bervariasi tanpa kolom NULL (bisa diperiksa dengan `$exists`) |

---

## 7. Perbandingan relasional vs dokumen pada 3 kebutuhan

### K1 - Cetak struk satu nota (pola akses A2)
**MySQL** (6 tabel, 5 JOIN):
```sql
SELECT t.no_nota, t.tanggal_transaksi, m.nama_menu, d.kuantitas, d.harga, d.subtotal,
       t.total_bayar, mp.nama_metode, t.jumlah_dibayar, t.kembalian, k.nama_kasir, p.nama_pelanggan
FROM transaksi t
JOIN detail_transaksi d ON d.no_nota = t.no_nota
JOIN menu m ON m.kode_menu = d.kode_menu
JOIN metode_pembayaran mp ON mp.id_metode = t.id_metode
JOIN kasir k ON k.id_kasir = t.id_kasir
JOIN pelanggan p ON p.id_pelanggan = t.id_pelanggan
WHERE t.no_nota = 'TR1909202600001';
```
**MongoDB** (1 dokumen, 0 join, lewat indeks `_id`):
```js
db.transaksi.findOne({ _id: "TR1909202600001" })
```
➜ **Dokumen unggul**: hasil langsung berbentuk struk (header + array item).

### K2 - Menu terlaris per kategori dalam satu bulan (pola akses A8)
**MySQL**: `detail_transaksi JOIN transaksi JOIN menu JOIN kategori GROUP BY` + window function/subquery untuk peringkat 1 per kategori.
**MongoDB** (P1): `$match → $unwind items → $group → $sort → $group($first) → $project → $sort`, tanpa `$lookup` karena `nama_menu` & `kategori` sudah ada di item.
➜ **Dokumen unggul** untuk laporan penjualan.

### K3 - Mengganti nama kategori "Camilan" → "Kudapan"
**MySQL**: `UPDATE kategori SET nama_kategori='Kudapan' WHERE id_kategori=3;` → 1 baris, semua menu ikut.
**MongoDB**: `db.menu.updateMany({ "kategori.id": 3 }, { $set: { "kategori.nama": "Kudapan" } })` → 6 dokumen menu, ditambah ubah enum validator. Item di nota lama tetap "Camilan" kecuali ikut di-update (ribuan dokumen), dan menurut materi `updateMany` **atomik per dokumen tetapi tidak atomik secara keseluruhan**.
➜ **Relasional unggul** untuk data master yang berubah dan harus seragam di semua tempat. Kami menerima trade-off ini karena nama kategori praktis tidak pernah berubah.

---

## 8. Perubahan lain dan alasannya

### 8.1 Kunci alami sebagai `_id`
`no_nota`, `kode_menu`, `id_user`, `id_pelanggan` dijadikan `_id`. Materi menyebut setiap collection otomatis punya **indeks unik pada `_id`**, jadi tidak perlu indeks tambahan untuk kunci ini, dan nomor lama tetap sama sehingga migrasi dapat ditelusuri.

### 8.2 Waktu: `DATETIME` lokal → ISODate (UTC) + zona WITA saat analitik
MySQL menyimpan `2026-09-19 10:15:00` tanpa zona. MongoDB menyimpan `ISODate("2026-09-19T02:15:00Z")`. Semua agregasi waktu memakai `timezone: "Asia/Makassar"` sehingga jam 10:15 tetap terbaca 10:15 WITA (P5).

### 8.3 Uang: `DECIMAL(p,2)` → angka rupiah bulat - sekaligus memperbaiki bug skema MySQL

| Kolom MySQL | Tipe | Nilai maksimum | Masalah nyata |
|---|---|---|---|
| `menu.harga`, `detail_transaksi.harga` | `DECIMAL(7,2)` | 99.999,99 | Menu **Paket Keluarga Rp150.000** tidak bisa disimpan |
| `transaksi.kembalian` | `DECIMAL(5,2)` | **999,99** | Kembalian Rp34.000 (bayar 100.000 untuk 66.000) **ditolak**, padahal kejadian sehari-hari |

Di MongoDB uang disimpan sebagai **angka rupiah bulat** karena rupiah tidak memakai sen; bilangan bulat sampai 2⁵³ direpresentasikan **eksak**, jadi `$sum` tidak punya galat pembulatan. Batas nilai diatur validator (`minimum`, `maximum`), bukan presisi kolom. *(Untuk laporan: sebutkan juga sebagai rekomendasi perbaikan MySQL → `DECIMAL(12,2)`.)*

### 8.4 Aturan bisnis lintas-field yang di MySQL tidak dijaga
Validator `transaksi` menggabungkan `$jsonSchema` dengan tiga `$expr`:
1. `total_bayar = Σ items.subtotal`
2. `pembayaran.jumlah_dibayar ≥ total_bayar`
3. `pembayaran.kembalian = jumlah_dibayar − total_bayar`

Aturan ini hanya **bisa** dipasang karena item dan pembayaran berada dalam **satu dokumen** (validator MongoDB tidak bisa melihat dokumen lain). Ini bukti tambahan bahwa embedding R4 dan R5 adalah pilihan yang tepat. Bukti uji: V2, V3 (01) dan N03 (06).

### 8.5 Atribut baru yang memanfaatkan fleksibilitas dokumen

| Atribut | Koleksi | Jenis | Kegunaan / operator di CRUD |
|---|---|---|---|
| `items[]` | transaksi | array subdokumen | detail nota; query `$elemMatch` (R3) |
| `riwayat_status[]` (maks 3) | transaksi | array terbatas | waktu tunggu dapur; `$push` (U3) |
| `items.catatan` | transaksi | opsional | "Less Sugar", hanya ada bila diisi |
| `tags[]` | menu | array string | `$addToSet` agar unik (U4) |
| `varian[]` | menu | array opsional | hanya 5 menu yang punya varian |
| `riwayat_harga[]` | menu | array terbatas | jejak perubahan harga |
| `kontak {no_hp?, email?}` | pelanggan | subdokumen bervariasi | tanpa kolom NULL |
| `poin` | pelanggan | angka | loyalitas; `$inc` atomik (U2) |
| `aktif`, `profil.shift` | pengguna | bool / enum | staf resign tidak dihapus |

### 8.6 Status transaksi
Enum tetap tiga. Nilai lain seperti "Dibatalkan" ditolak (N05). Nota salah input dibatalkan dengan `deleteMany` (D1), dan sebelum menghapus dihitung dulu dengan filter yang sama (praktik aman dari materi).

---

## 9. Konsekuensi (trade-off) yang diterima dan penanganannya

| Konsekuensi | Dampak | Penanganan |
|---|---|---|
| Tidak ada FOREIGN KEY | `kasir.id_pengguna` bisa merujuk akun yang tidak ada | Uji integritas T06 & T07 (`$lookup` + hitung yatim = 0); D2 memeriksa transaksi sebelum menghapus pelanggan |
| Salinan nama di nota | Bila nama berubah, nota lama tetap nama lama | Disengaja (nilai historis struk); bila perlu seragam: satu `updateMany` |
| `poin` pelanggan diperbarui di dokumen lain dari nota | Insert nota + `$inc` poin = 2 dokumen, tidak atomik bersama | Poin bisa dihitung ulang kapan saja dari `transaksi` dengan aggregation (sumber kebenaran tetap nota); untuk produksi bisa dibungkus *multi-document transaction* |
| Laporan lintas koleksi butuh `$lookup` | Sedikit lebih mahal dari JOIN berindeks | Hanya di P3, P4, P6; dilakukan setelah `$group`/`$limit` |
| Mengubah validator (`collMod`) butuh hak lebih | Role "Read and write to any database" tidak punya `collMod` | 01 hanya menjalankan `collMod` bila validator berubah; bila sama dilewati, jadi skrip tetap bisa diulang dengan role itu (sudah diuji) |
| Skema fleksibel bisa "kebablasan" | Field liar bisa masuk | Validator `strict/error` di 4 koleksi + field wajib + enum + regex |

---

## 10. Kajian polyglot persistence (ringkas, 1 halaman)

Satu rumah makan nyata tidak harus memakai satu jenis basis data:

| Kebutuhan | Penyimpanan | Alasan |
|---|---|---|
| Transaksi POS, menu, pelanggan, laporan penjualan | **MongoDB (dokumen)**, projek ini | Nota adalah agregat alami (header + item); skema menu & pelanggan bervariasi; aggregation pipeline kuat untuk laporan |
| Pembukuan/akuntansi (jurnal, kas, utang pemasok, stok bahan) | **MySQL / PostgreSQL (relasional)** | Butuh ACID lintas banyak tabel, FK ketat, laporan keuangan dengan JOIN kompleks dan audit |
| Antrean dapur real-time, sesi login kasir, cache daftar menu | **Redis (key-value)** | Latensi sub-milidetik, List/Stream untuk antrean, TTL untuk sesi |
| Rekomendasi "sering dibeli bersama" (opsional) | **Neo4j (graf)** | Relasi menu–menu–pelanggan berlapis lebih alami sebagai graf |
| Rekap penjualan per hari dalam skala sangat besar (opsional) | **Cassandra (column-family)** | Tulis masif terdistribusi dengan kunci partisi tanggal/outlet bila rumah makan menjadi jaringan banyak cabang |

**Kapan MongoDB bukan pilihan terbaik untuk sistem ini:**
- Modul keuangan yang harus mengubah banyak entitas sekaligus (retur → stok, kas, jurnal). Bisa dengan transaksi multi-dokumen MongoDB, tetapi lebih rumit daripada transaksi SQL biasa.
- Data master yang sering berubah dan wajib seragam di semua tempat (lihat K3).
- Pelaporan ad-hoc oleh pihak non-teknis yang terbiasa SQL/BI berbasis tabel.

Integrasi yang realistis: MongoDB sebagai sumber data transaksi POS → *Change Streams* mengirim ringkasan harian ke basis data akuntansi relasional; Redis menampung antrean dapur yang kemudian ditulis kembali ke `transaksi.riwayat_status`.

---

## 11. Persiapan tanya-jawab ("bagaimana jika ...?")

| Pengandaian | Jawaban singkat |
|---|---|
| Satu nota berisi 1.000 item (katering)? | Ukuran masih aman (~200 KB) tetapi melanggar `maxItems: 50`. Katering dibuat koleksi sendiri dengan item dirujuk; embedding berlaku untuk nota kasir biasa yang "satu ke sedikit". |
| Harga menu naik, apakah nota lama ikut berubah? | Tidak. `items.harga` adalah salinan saat transaksi (uji T08). Ini alasan item disematkan, bukan hanya dirujuk. |
| Mengapa daftar nota tidak disimpan di dokumen menu? | Satu menu muncul di ribuan nota dan terus bertambah → array tanpa batas (kesalahan umum materi). Arah menu→nota memakai rujukan `items.kode_menu` + indeks multikey. |
| Kasir resign? | `aktif: false`, tidak dihapus, agar `$lookup` histori nota tetap menemukan akunnya (P3 menampilkan 2 kasir nonaktif). |
| Mengapa nota tidak disematkan di pelanggan? | Satu ke banyak yang terus bertambah (±80 nota dan bertambah) → risiko 16 MB, dan tiap nota baru menulis ulang dokumen pelanggan yang besar. Sama dengan contoh "buku dan ulasan" di materi. |
| Mengapa nama kasir disalin, bukan hanya id? | Struk (kebutuhan paling sering) butuh nama tanpa `$lookup`, mengikuti contoh "salinan judul" pada peminjaman. Nama staf jarang berubah. |
| Tanpa FK, bagaimana menjamin integritas? | Validator (struktur + aturan bisnis `$expr`), indeks unik, uji integritas T06/T07, dan pemeriksaan sebelum delete (D2). |
| Mengapa indeks Q1 urutannya kasir → tanggal → total? | Aturan ESR: Equality (`kasir.id_pengguna`), Sort (`tanggal`), Range (`total_bayar`). Hasilnya tahap SORT hilang dan docsExamined 5.000 → 39. |
| Indeks kan memperlambat penulisan? | Benar (materi menyebut biaya ini). Karena itu indeks dibuat hanya untuk 3 query yang diukur + 1 indeks unik, bukan di semua field. |
| Mengapa seed memakai `deleteMany({})`, bukan `drop()`? | `drop()` menghapus collection beserta indeks dan validatornya; `deleteMany({})` hanya mengosongkan isi sehingga validator tetap aktif. |
