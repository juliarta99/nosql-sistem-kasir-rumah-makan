/* =====================================================================
 * 04_aggregation.js - Aggregation pipeline, dipelajari BERTAHAP
 * Projek NoSQL Kelompok 4 - db_sistem_kasir
 *
 * Cara menjalankan:
 *   mongosh "$URI" --username <user> --file skrip/04_aggregation.js
 *
 * APA ITU AGGREGATION PIPELINE?
 *   Dokumen dialirkan melewati beberapa TAHAP secara berurutan, seperti air
 *   yang melewati pipa bersambung. Keluaran satu tahap menjadi masukan
 *   tahap berikutnya.
 *
 *     koleksi ──► [tahap 1] ──► [tahap 2] ──► [tahap 3] ──► hasil
 *
 * CARA MEMBACA SKRIP INI
 *   BAGIAN A (latihan) membangun pipeline sedikit demi sedikit:
 *     L1  1 tahap  : $match
 *     L2  2 tahap  : $match → $group
 *     L3  3 tahap  : $match → $group → $sort
 *   BAGIAN B (6 pipeline analitik) diurutkan dari yang paling sederhana.
 *   Setiap pipeline memperkenalkan SATU hal baru:
 *     P1  + $project (membentuk field baru sebelum dikelompokkan)
 *     P2  + $cond & $addFields (menghitung kolom bersyarat dan persentase)
 *     P3  + $unwind & $limit (membuka array items)
 *     P4  + $lookup (menggabungkan dengan koleksi lain)
 *     P5  + $lookup setelah $limit (hanya 10 dokumen yang digabung)
 *     P6  + $lookup berpipeline (paling lanjut)
 *
 * TAHAP YANG DIPAKAI (dan padanan SQL-nya)
 *   $match     : menyaring dokumen                     (WHERE)
 *   $group     : mengelompokkan & menghitung           (GROUP BY + SUM/AVG/MAX)
 *   $sort      : mengurutkan                           (ORDER BY)
 *   $project   : memilih / membentuk field             (SELECT kolom)
 *   $addFields : menambah field hasil hitungan         (SELECT ..., rumus AS nama)
 *   $limit     : membatasi jumlah hasil                (LIMIT)
 *   $unwind    : memecah array menjadi satu dokumen per elemen (tidak ada di SQL)
 *   $lookup    : menggabungkan dengan koleksi lain     (LEFT JOIN)
 *
 * KETENTUAN PETUNJUK TEKNIS (untuk P1–P6)
 *   - 6 pipeline, masing-masing ≥ 3 tahap, semuanya diawali $match
 *   - $lookup dipakai 3 kali (P4, P5, P6) - syarat minimal 2
 *   - $unwind dipakai di P3, P4, P5, dan P6 - syarat minimal 1
 *
 * Catatan penulisan:
 *   "$namaField"  = ambil nilai field itu, contoh "$total_bayar"
 *   "$$variabel"  = variabel buatan sendiri (hanya di P6)
 * ===================================================================== */
(function () {
  const NAMA_DATABASE = "db_sistem_kasir";
  const kasirDb = db.getSiblingDB(NAMA_DATABASE);
  const ZONA_WAKTU = "Asia/Makassar"; // WITA

  function waktuWita(tahun, bulan, tanggal, jam, menit) {
    return new Date(Date.UTC(tahun, bulan - 1, tanggal, jam - 8, menit || 0, 0));
  }

  // Rentang waktu yang sering dipakai
  const AWAL_OKTOBER = waktuWita(2026, 10, 1, 0, 0);
  const AWAL_NOVEMBER = waktuWita(2026, 11, 1, 0, 0);

  // Menjalankan pipeline lalu mencetak urutan tahap dan setiap baris hasil.
  function jalankanDanTampilkan(kode, judul, pipeline, namaKoleksi) {
    print("\n=== " + kode + " | " + judul + " ===");
    const namaTahap = pipeline.map(function (tahap) { return Object.keys(tahap)[0]; });
    print("tahap (" + pipeline.length + "): " + namaTahap.join(" -> "));
    const hasil = kasirDb.getCollection(namaKoleksi).aggregate(pipeline).toArray();
    hasil.forEach(function (baris) { print(JSON.stringify(baris)); });
    print("(" + hasil.length + " baris)");
    return hasil;
  }

  print("=== 04_aggregation.js - database: " + NAMA_DATABASE + " ===");

  /* ###################################################################
   * BAGIAN A - LATIHAN BERTAHAP (1 tahap → 2 tahap → 3 tahap)
   * Latihan ini tidak termasuk 6 pipeline wajib; tujuannya agar alur
   * pipeline mudah dipahami sebelum masuk ke P1–P6.
   * ################################################################### */
  print("\n################ BAGIAN A - LATIHAN BERTAHAP ################");

  // L1 - SATU tahap: $match saja (sama seperti find dengan filter)
  // SQL: SELECT * FROM transaksi WHERE pembayaran = 'Tunai' AND tanggal di bulan Oktober
  const hasilL1 = kasirDb.transaksi.aggregate([
    { $match: { "pembayaran.metode": "Tunai", tanggal: { $gte: AWAL_OKTOBER, $lt: AWAL_NOVEMBER } } }
  ]).toArray();
  print("\n=== L1 | 1 tahap ($match): nota tunai bulan Oktober 2026 ===");
  print("jumlah dokumen yang lolos $match: " + hasilL1.length);
  print("contoh nota pertama: " + hasilL1[0]._id + ", total_bayar " + hasilL1[0].total_bayar);

  // L2 - DUA tahap: $match lalu $group
  // _id: null artinya SEMUA dokumen dijadikan satu kelompok.
  // SQL: SELECT COUNT(*), SUM(total_bayar) FROM transaksi WHERE ... (bulan Oktober)
  jalankanDanTampilkan("L2", "2 tahap ($match -> $group): total nota & omzet Oktober 2026", [
    { $match: { status: "Sudah Diterima", tanggal: { $gte: AWAL_OKTOBER, $lt: AWAL_NOVEMBER } } },
    { $group: {
        _id: null,
        jumlah_nota: { $sum: 1 },              // $sum: 1 = tambah 1 untuk setiap dokumen (COUNT)
        omzet: { $sum: "$total_bayar" } } }    // jumlahkan field total_bayar (SUM)
  ], "transaksi");

  // L3 - TIGA tahap: $match → $group → $sort
  // Sekarang _id diisi "$tipe_pesanan", jadi dokumen dikelompokkan per tipe pesanan.
  // SQL: SELECT tipe_pesanan, COUNT(*), SUM(total_bayar) ... GROUP BY tipe_pesanan ORDER BY omzet DESC
  jalankanDanTampilkan("L3", "3 tahap ($match -> $group -> $sort): omzet Oktober per tipe pesanan", [
    { $match: { status: "Sudah Diterima", tanggal: { $gte: AWAL_OKTOBER, $lt: AWAL_NOVEMBER } } },
    { $group: { _id: "$tipe_pesanan", jumlah_nota: { $sum: 1 }, omzet: { $sum: "$total_bayar" } } },
    { $sort: { omzet: -1 } }                    // -1 = urut turun (terbesar dulu)
  ], "transaksi");

  /* ###################################################################
   * BAGIAN B - 6 PIPELINE ANALITIK (dari sederhana ke lanjut)
   * ################################################################### */
  print("\n################ BAGIAN B - 6 PIPELINE ANALITIK ################");

  /* ------------------------------------------------------------------
   * P1 - Jam berapa paling ramai? Berapa yang makan di tempat vs bawa pulang?
   * HAL BARU: $project untuk MEMBENTUK field baru (jam) sebelum dikelompokkan.
   * ------------------------------------------------------------------ */
  jalankanDanTampilkan("P1", "Jam sibuk & tipe pesanan", [
    // 1. Hanya nota yang sudah selesai
    { $match: { status: "Sudah Diterima" } },
    // 2. Bentuk field baru:
    //    jam   = jam dari tanggal (zona WITA), mis. 12
    //    porsi = jumlah kuantitas semua item dalam satu nota
    { $project: {
        jam: { $hour: { date: "$tanggal", timezone: ZONA_WAKTU } },
        tipe_pesanan: 1,
        porsi: { $sum: "$items.kuantitas" } } },
    // 3. Kelompokkan per jam.
    //    $cond = "jika ... maka 1, selain itu 0" → menghitung tiap tipe pesanan secara terpisah
    { $group: {
        _id: "$jam",
        nota: { $sum: 1 },
        porsi: { $sum: "$porsi" },
        makan_di_tempat: { $sum: { $cond: [{ $eq: ["$tipe_pesanan", "Makan di Tempat"] }, 1, 0] } },
        bawa_pulang: { $sum: { $cond: [{ $eq: ["$tipe_pesanan", "Bawa Pulang"] }, 1, 0] } } } },
    // 4. Urutkan dari jam paling pagi
    { $sort: { _id: 1 } },
    // 5. Rapikan tampilan: _id disembunyikan, jam ditulis "12:00"
    { $project: { _id: 0, jam: { $concat: [{ $toString: "$_id" }, ":00"] }, nota: 1, porsi: 1, makan_di_tempat: 1, bawa_pulang: 1 } }
  ], "transaksi");

  /* ------------------------------------------------------------------
   * P2 - Berapa omzet bulanan tiap jenis pembayaran, dan berapa persen tunai?
   * HAL BARU: kolom bersyarat dengan $cond di dalam $group (satu kolom per jenis),
   *           lalu $addFields untuk menghitung persentase.
   * ------------------------------------------------------------------ */
  // Fungsi kecil agar rumus "jumlahkan total_bayar bila jenisnya X" tidak ditulis berulang
  function omzetJenis(jenis) {
    return { $sum: { $cond: [{ $eq: ["$pembayaran.jenis", jenis] }, "$total_bayar", 0] } };
  }
  jalankanDanTampilkan("P2", "Omzet bulanan per jenis pembayaran", [
    // 1. Hanya nota yang sudah selesai
    { $match: { status: "Sudah Diterima" } },
    // 2. Kelompokkan per bulan ("2026-10"); omzet tiap jenis dijadikan kolom sendiri
    { $group: {
        _id: { $dateToString: { format: "%Y-%m", date: "$tanggal", timezone: ZONA_WAKTU } },
        nota: { $sum: 1 },
        omzet_total: { $sum: "$total_bayar" },
        omzet_tunai: omzetJenis("Tunai"),
        omzet_qris: omzetJenis("QRIS"),
        omzet_transfer: omzetJenis("Transfer") } },
    // 3. Tambah kolom persen_tunai = omzet_tunai / omzet_total × 100 (dibulatkan 1 desimal)
    { $addFields: {
        persen_tunai: { $round: [{ $multiply: [{ $divide: ["$omzet_tunai", "$omzet_total"] }, 100] }, 1] } } },
    // 4. Urutkan dari bulan terlama
    { $sort: { _id: 1 } },
    // 5. Ganti nama _id menjadi bulan
    { $project: { _id: 0, bulan: "$_id", nota: 1, omzet_total: 1, omzet_tunai: 1, omzet_qris: 1, omzet_transfer: 1, persen_tunai: 1 } }
  ], "transaksi");

  /* ------------------------------------------------------------------
   * P3 - 10 menu paling laris bulan Oktober 2026
   * HAL BARU: $unwind (membuka array items) dan $limit.
   *   Satu nota berisi 3 item → setelah $unwind menjadi 3 dokumen,
   *   masing-masing dengan SATU item, sehingga item bisa dikelompokkan.
   * ------------------------------------------------------------------ */
  jalankanDanTampilkan("P3", "10 menu terlaris Oktober 2026", [
    // 1. Nota selesai pada bulan Oktober
    { $match: { status: "Sudah Diterima", tanggal: { $gte: AWAL_OKTOBER, $lt: AWAL_NOVEMBER } } },
    // 2. Buka array items: satu dokumen per item
    { $unwind: "$items" },
    // 3. Kelompokkan per menu. Nama & kategori sudah tersalin di item → tidak perlu $lookup.
    { $group: {
        _id: "$items.nama_menu",
        kategori: { $first: "$items.kategori" },  // $first = ambil nilai dari dokumen pertama di kelompok
        porsi: { $sum: "$items.kuantitas" },
        omzet: { $sum: "$items.subtotal" } } },
    // 4. Porsi terbanyak di atas; bila porsinya sama, omzet terbesar didahulukan
    //    (pengurut kedua ini membuat urutan hasil selalu sama di mana pun dijalankan)
    { $sort: { porsi: -1, omzet: -1 } },
    // 5. Ambil 10 teratas
    { $limit: 10 },
    // 6. Rapikan tampilan
    { $project: { _id: 0, menu: "$_id", kategori: 1, porsi: 1, omzet: 1 } }
  ], "transaksi");

  /* ------------------------------------------------------------------
   * P4 - Bagaimana kinerja tiap kasir?
   * HAL BARU: $lookup (gabung dengan koleksi pengguna).
   *   Nota hanya menyimpan id & nama kasir; username, shift, dan status
   *   aktif diambil dari koleksi pengguna.
   * ------------------------------------------------------------------ */
  jalankanDanTampilkan("P4", "Kinerja kasir (gabung data akun pengguna)", [
    // 1. Nota selesai
    { $match: { status: "Sudah Diterima" } },
    // 2. Hitung per kasir DULU, baru digabung → $lookup hanya untuk ±19 kasir, bukan 5.000 nota
    { $group: {
        _id: "$kasir.id_pengguna",
        jumlah_nota: { $sum: 1 },
        omzet: { $sum: "$total_bayar" },
        rata_rata_nota: { $avg: "$total_bayar" } } },
    // 3. Gabungkan: cari dokumen di "pengguna" yang _id-nya sama dengan _id hasil group
    //    SQL: LEFT JOIN pengguna ON pengguna._id = hasil._id
    { $lookup: { from: "pengguna", localField: "_id", foreignField: "_id", as: "akun" } },
    // 4. Hasil $lookup selalu berupa ARRAY ("akun": [ {...} ]). $unwind mengubahnya jadi satu objek.
    { $unwind: "$akun" },
    // 5. Pilih field yang ditampilkan
    { $project: {
        _id: 0, username: "$akun.username", nama: "$akun.profil.nama_lengkap",
        shift: "$akun.profil.shift", aktif: "$akun.aktif",
        jumlah_nota: 1, omzet: 1, rata_rata_nota: { $round: ["$rata_rata_nota", 0] } } },
    // 6. Omzet terbesar di atas
    { $sort: { omzet: -1 } }
  ], "transaksi");

  /* ------------------------------------------------------------------
   * P5 - Siapa 10 pelanggan dengan belanja terbesar?
   * HAL BARU: urutan tahap untuk efisiensi - $sort & $limit DULU,
   *           baru $lookup, sehingga hanya 10 dokumen yang digabung.
   * ------------------------------------------------------------------ */
  jalankanDanTampilkan("P5", "10 pelanggan dengan belanja terbesar", [
    // 1. Nota selesai
    { $match: { status: "Sudah Diterima" } },
    // 2. Total belanja, jumlah kunjungan, dan kunjungan terakhir per pelanggan
    { $group: {
        _id: "$pelanggan.id_pelanggan",
        kunjungan: { $sum: 1 },
        total_belanja: { $sum: "$total_bayar" },
        terakhir: { $max: "$tanggal" } } },
    // 3. Belanja terbesar di atas
    { $sort: { total_belanja: -1 } },
    // 4. Ambil 10 teratas
    { $limit: 10 },
    // 5. Ambil data pelanggan (nama, poin, kontak)
    { $lookup: { from: "pelanggan", localField: "_id", foreignField: "_id", as: "data" } },
    // 6. Ubah array "data" menjadi objek
    { $unwind: "$data" },
    // 7. Tampilkan. punya_kontak = true bila field kontak ada.
    //    $ifNull: bila data.kontak tidak ada, pakai false; $toBool mengubahnya jadi true/false.
    { $project: {
        _id: 0, id_pelanggan: "$_id", nama: "$data.nama", poin: "$data.poin",
        punya_kontak: { $toBool: { $ifNull: ["$data.kontak", false] } },
        kunjungan: 1, total_belanja: 1,
        terakhir: { $dateToString: { format: "%Y-%m-%d", date: "$terakhir", timezone: ZONA_WAKTU } } } }
  ], "transaksi");

  /* ------------------------------------------------------------------
   * P6 - Menu mana yang paling kurang laku dalam 30 hari terakhir?
   * HAL BARU (paling lanjut): $lookup BERPIPELINE.
   *   Dimulai dari koleksi menu. Untuk SETIAP menu, MongoDB menjalankan
   *   pipeline kecil di koleksi transaksi untuk menghitung penjualannya.
   *   Kelebihannya: menu yang TIDAK terjual sama sekali tetap ikut tampil
   *   (nilainya 0) - hal ini tidak bisa didapat bila dimulai dari transaksi.
   * ------------------------------------------------------------------ */
  const AWAL_30_HARI = waktuWita(2026, 10, 17, 0, 0); // 17 Okt – 15 Nov 2026
  jalankanDanTampilkan("P6", "8 menu tersedia yang paling kurang laku 30 hari terakhir", [
    // 1. Hanya menu yang masih dijual
    { $match: { tersedia: true } },
    // 2. Untuk setiap menu, cari nota yang memuat menu itu, lalu hitung porsi & omzetnya.
    //    let { kode: "$_id" } → membuat variabel $$kode berisi kode menu yang sedang diproses.
    { $lookup: {
        from: "transaksi",
        localField: "_id", foreignField: "items.kode_menu",   // cari nota yang item-nya memuat kode menu ini
        let: { kode: "$_id" },
        pipeline: [
          { $match: { tanggal: { $gte: AWAL_30_HARI }, status: "Sudah Diterima" } },  // 30 hari terakhir
          { $unwind: "$items" },                                                      // buka item nota
          { $match: { $expr: { $eq: ["$items.kode_menu", "$$kode"] } } },             // ambil item menu ini saja
          { $group: { _id: null, porsi: { $sum: "$items.kuantitas" }, omzet: { $sum: "$items.subtotal" } } }
        ],
        as: "penjualan" } },
    // 3. Ubah array penjualan jadi objek. preserveNullAndEmptyArrays: true
    //    = menu tanpa penjualan TETAP ditampilkan (tidak ikut hilang).
    { $unwind: { path: "$penjualan", preserveNullAndEmptyArrays: true } },
    // 4. Bila tidak ada penjualan, tampilkan 0
    { $project: {
        _id: 0, kode_menu: "$_id", nama: 1, kategori: "$kategori.nama",
        porsi_30_hari: { $ifNull: ["$penjualan.porsi", 0] },
        omzet_30_hari: { $ifNull: ["$penjualan.omzet", 0] } } },
    // 5–6. Paling sedikit terjual di atas (bila sama, omzet terkecil dulu), ambil 8
    { $sort: { porsi_30_hari: 1, omzet_30_hari: 1 } },
    { $limit: 8 }
  ], "menu");
})();
