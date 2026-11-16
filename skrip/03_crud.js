/* =====================================================================
 * 03_crud.js - 15 operasi CRUD (Create, Read, Update, Delete)
 * Projek NoSQL Kelompok 4 - db_sistem_kasir
 *
 * Cara menjalankan (SETELAH 02_seed.js):
 *   mongosh "$URI" --username <user> --file skrip/03_crud.js
 *
 * DAFTAR OPERASI (sesuai petunjuk teknis)
 *   CREATE (3) : C1 insertOne · C2 insertMany · C3 upsert
 *   READ   (6) : R1 perbandingan · R2 logika · R3 array · R4 $regex
 *                R5 notasi titik · R6 proyeksi + sort + limit
 *   UPDATE (4) : U1 $set · U2 $inc · U3 operator array ($push) · U4 updateMany
 *   DELETE (2) : D1 deleteMany · D2 deleteOne
 *
 * Setiap operasi diberi padanan SQL-nya (seperti di materi Pertemuan 11).
 *
 * DATA UJI: pelanggan 9001, nota TR1611202699001 & TR1611202699002, menu ESCMPR.
 * Data uji ini dibersihkan di awal, jadi skrip aman diulang dan tidak
 * merusak data hasil seed.
 * ===================================================================== */
(function () {
  const NAMA_DATABASE = "db_sistem_kasir";
  const kasirDb = db.getSiblingDB(NAMA_DATABASE);

  // Mencetak judul setiap operasi agar keluaran mudah dibaca
  function judul(kode, teks) { print("\n--- " + kode + " | " + teks + " ---"); }

  // Membuat tanggal dari waktu lokal WITA (UTC+8). Bulan ditulis biasa (1–12).
  function waktuWita(tahun, bulan, tanggal, jam, menit) {
    return new Date(Date.UTC(tahun, bulan - 1, tanggal, jam - 8, menit || 0, 0));
  }

  const ID_PELANGGAN_UJI = 9001;
  const NOTA_UJI = ["TR1611202699001", "TR1611202699002"];
  const KODE_MENU_UJI = "ESCMPR";

  print("=== 03_crud.js - database: " + NAMA_DATABASE + " ===");

  // Bersihkan data uji dari eksekusi sebelumnya
  kasirDb.transaksi.deleteMany({ _id: { $in: NOTA_UJI } });
  kasirDb.pelanggan.deleteOne({ _id: ID_PELANGGAN_UJI });
  kasirDb.menu.deleteOne({ _id: KODE_MENU_UJI });

  /* ================================ CREATE ================================ */

  // SQL: INSERT INTO pelanggan VALUES (...)
  judul("C1", "insertOne - mendaftarkan pelanggan baru (atribut kontak bervariasi)");
  const hasilC1 = kasirDb.pelanggan.insertOne({
    _id: ID_PELANGGAN_UJI,
    nama: "Pelanggan Uji Kelompok4",
    kontak: { no_hp: "081234567890", email: "uji.kelompok4@mail.com" },
    poin: 0,
    terdaftar_pada: waktuWita(2026, 11, 16, 12, 0)
  });
  printjson(hasilC1);

  // SQL: INSERT INTO transaksi ... ; INSERT INTO detail_transaksi ... (beberapa baris, beberapa tabel)
  // MongoDB: cukup satu perintah karena item & pembayaran ada di dalam dokumen nota.
  judul("C2", "insertMany - kasir mencatat 2 nota sekaligus (item & pembayaran di-embed)");
  const waktuNota1 = waktuWita(2026, 11, 16, 12, 5);
  const waktuNota2 = waktuWita(2026, 11, 16, 12, 20);
  const hasilC2 = kasirDb.transaksi.insertMany([
    {
      _id: NOTA_UJI[0], tanggal: waktuNota1, tipe_pesanan: "Makan di Tempat", status: "Sedang Diproses",
      items: [
        { kode_menu: "NSCMPR", nama_menu: "Nasi Campur Bali", kategori: "Makanan Utama", harga: 28000, kuantitas: 2, subtotal: 56000 },
        { kode_menu: "ETHMNS", nama_menu: "Es Teh Manis", kategori: "Minuman", harga: 5000, kuantitas: 2, subtotal: 10000, catatan: "Less Sugar" }
      ],
      total_bayar: 66000,                                                                  // 56.000 + 10.000
      pembayaran: { metode: "Tunai", jenis: "Tunai", jumlah_dibayar: 100000, kembalian: 34000 }, // 100.000 − 66.000
      kasir: { id_pengguna: 6, nama: "Putu Pratama" },
      koki: null,                                                                          // belum diambil dapur
      pelanggan: { id_pelanggan: ID_PELANGGAN_UJI, nama: "Pelanggan Uji Kelompok4" },
      riwayat_status: [{ status: "Sedang Diproses", waktu: waktuNota1 }]
    },
    {
      _id: NOTA_UJI[1], tanggal: waktuNota2, tipe_pesanan: "Bawa Pulang", status: "Sedang Diproses",
      items: [
        { kode_menu: "AYMBTT", nama_menu: "Ayam Betutu", kategori: "Makanan Utama", harga: 45000, kuantitas: 1, subtotal: 45000 }
      ],
      total_bayar: 45000,
      pembayaran: { metode: "QRIS", jenis: "QRIS", jumlah_dibayar: 45000, kembalian: 0 },
      kasir: { id_pengguna: 6, nama: "Putu Pratama" },
      koki: null,
      pelanggan: { id_pelanggan: ID_PELANGGAN_UJI, nama: "Pelanggan Uji Kelompok4" },
      riwayat_status: [{ status: "Sedang Diproses", waktu: waktuNota2 }]
    }
  ]);
  printjson(hasilC2);

  // upsert = update bila dokumen sudah ada, insert bila belum ada.
  // $setOnInsert hanya diisi saat dokumen BARU dibuat.
  judul("C3", "upsert - menambah/menyunting menu musiman 'Es Campur' (dibuat bila belum ada)");
  const hasilC3 = kasirDb.menu.updateOne(
    { _id: KODE_MENU_UJI },
    {
      $set: { nama: "Es Campur", harga: 15000, tersedia: true },
      $setOnInsert: { kategori: { id: 4, nama: "Dessert" }, tags: ["dingin", "manis", "musiman"] }
    },
    { upsert: true }
  );
  printjson(hasilC3);

  /* ================================= READ ================================= */

  // SQL: SELECT ... FROM transaksi WHERE total_bayar >= 150000
  //      AND tanggal >= '2026-10-01' AND tanggal < '2026-11-01'
  judul("R1", "Perbandingan ($gte, $lt) - nota bernilai >= Rp150.000 selama Oktober 2026");
  const filterR1 = {
    total_bayar: { $gte: 150000 },                                                  // $gte = lebih besar atau sama dengan
    tanggal: { $gte: waktuWita(2026, 10, 1, 0, 0), $lt: waktuWita(2026, 11, 1, 0, 0) } // $lt  = lebih kecil dari
  };
  print("jumlah nota: " + kasirDb.transaksi.countDocuments(filterR1));
  kasirDb.transaksi.find(filterR1, { total_bayar: 1, "pelanggan.nama": 1 }).limit(3).forEach(printjson);

  // SQL: ... WHERE status <> 'Sudah Diterima' AND (tipe_pesanan = 'Bawa Pulang' OR id_koki IS NULL)
  judul("R2", "Logika ($and + $or) - antrean dapur: belum diterima DAN (bawa pulang ATAU belum ada koki)");
  kasirDb.transaksi.find(
    {
      $and: [
        { status: { $ne: "Sudah Diterima" } },                     // $ne = tidak sama dengan
        { $or: [{ tipe_pesanan: "Bawa Pulang" }, { koki: null }] } // $or = salah satu benar
      ]
    },
    { status: 1, tipe_pesanan: 1, "koki.nama": 1, tanggal: 1 }     // proyeksi: field yang ditampilkan
  ).sort({ tanggal: 1 }).forEach(printjson);

  // $elemMatch: SATU elemen array yang sama harus memenuhi semua syarat sekaligus
  // (kode menunya NSAMBKR DAN kuantitasnya ≥ 3 pada baris item yang sama).
  judul("R3", "Array ($elemMatch) - nota yang memesan Nasi Ayam Bakar minimal 3 porsi dalam satu baris item");
  const filterR3 = { items: { $elemMatch: { kode_menu: "NSAMBKR", kuantitas: { $gte: 3 } } } };
  print("jumlah nota: " + kasirDb.transaksi.countDocuments(filterR3));
  // "items.$" = tampilkan hanya elemen array yang cocok, bukan semua item
  kasirDb.transaksi.find(filterR3, { "items.$": 1, tanggal: 1 }).limit(2).forEach(printjson);

  // SQL: SELECT ... FROM menu WHERE nama LIKE '%goreng%' ORDER BY harga
  judul("R4", "$regex - cari menu yang namanya mengandung 'goreng' (tidak peka huruf besar/kecil)");
  kasirDb.menu.find(
    { nama: { $regex: "goreng", $options: "i" } },                 // $options "i" = abaikan huruf besar/kecil
    { nama: 1, harga: 1, "kategori.nama": 1 }
  ).sort({ harga: 1 }).forEach(printjson);

  // Notasi titik ("induk.anak") dipakai untuk field di dalam subdokumen. Wajib pakai tanda kutip.
  judul("R5", "Notasi titik - transaksi tunai yang dilayani kasir Siti Aminah (field bersarang)");
  const filterR5 = { "kasir.nama": "Siti Aminah", "pembayaran.metode": "Tunai" };
  print("jumlah nota: " + kasirDb.transaksi.countDocuments(filterR5));
  printjson(kasirDb.transaksi.findOne(filterR5, { "kasir.nama": 1, pembayaran: 1, total_bayar: 1 }));

  // SQL: SELECT no_nota, tanggal, total_bayar, ... FROM transaksi ORDER BY total_bayar DESC LIMIT 5
  judul("R6", "Proyeksi + sort + limit - 5 nota terbesar sepanjang data (tanpa _id, hanya field penting)");
  kasirDb.transaksi.find(
    {},
    { _id: 0, no_nota: "$_id", tanggal: 1, total_bayar: 1, "pelanggan.nama": 1, "pembayaran.metode": 1 } // no_nota diambil dari _id
  ).sort({ total_bayar: -1, tanggal: -1 })                         // -1 = urut turun (terbesar dulu)
   .limit(5)
   .forEach(printjson);

  /* ================================ UPDATE ================================ */

  // SQL: UPDATE menu SET tersedia = false, harga = 16000 WHERE kode_menu = 'ESCMPR'
  judul("U1", "$set - menu Es Campur habis hari ini, harga juga disesuaikan");
  printjson(kasirDb.menu.updateOne({ _id: KODE_MENU_UJI }, { $set: { tersedia: false, harga: 16000 } }));

  // $inc menambah angka langsung di server (atomik) - tidak perlu baca dulu lalu tulis.
  // SQL: UPDATE pelanggan SET poin = poin + 6 WHERE id_pelanggan = 9001
  judul("U2", "$inc - tambah poin loyalitas pelanggan uji (1 poin per Rp10.000 nota TR1611202699001)");
  const poinDidapat = Math.floor(66000 / 10000); // = 6
  printjson(kasirDb.pelanggan.updateOne({ _id: ID_PELANGGAN_UJI }, { $inc: { poin: poinDidapat } }));
  printjson(kasirDb.pelanggan.findOne({ _id: ID_PELANGGAN_UJI }, { nama: 1, poin: 1 }));

  // $push menambah satu elemen ke array. Status & riwayat berubah bersamaan dalam satu
  // dokumen, jadi perubahan ini atomik (berhasil semua atau tidak sama sekali).
  judul("U3", "Operator array ($push) - koki Sanji menyelesaikan pesanan: status & riwayat_status diperbarui");
  const waktuSiap = waktuWita(2026, 11, 16, 12, 25);
  printjson(kasirDb.transaksi.updateOne(
    { _id: NOTA_UJI[0], status: "Sedang Diproses" },
    {
      $set: { status: "Siap Diambil", koki: { id_pengguna: 1, nama: "Chef Sanji" } },
      $push: { riwayat_status: { status: "Siap Diambil", waktu: waktuSiap } }
    }
  ));
  printjson(kasirDb.transaksi.findOne({ _id: NOTA_UJI[0] }, { status: 1, koki: 1, riwayat_status: 1 }));

  // updateMany mengubah SEMUA dokumen yang cocok.
  // $addToSet menambah elemen hanya bila belum ada (berbeda dari $push), jadi aman diulang.
  judul("U4", "updateMany ($addToSet) - beri tag 'segar' pada semua menu kategori Minuman yang dingin");
  printjson(kasirDb.menu.updateMany(
    { "kategori.nama": "Minuman", tags: "dingin" },                // tags: "dingin" = array tags berisi "dingin"
    { $addToSet: { tags: "segar" } }
  ));

  /* ================================ DELETE ================================ */

  // Praktik aman (materi Pertemuan 11): hitung dulu dengan filter yang SAMA, baru hapus,
  // lalu cocokkan deletedCount dengan perkiraan.
  // SQL: DELETE FROM transaksi WHERE no_nota IN (...)
  judul("D1", "deleteMany - membatalkan (void) 2 nota uji yang salah input");
  const filterVoid = { _id: { $in: NOTA_UJI } };
  const perkiraanTerhapus = kasirDb.transaksi.countDocuments(filterVoid);
  print("dokumen yang cocok sebelum dihapus: " + perkiraanTerhapus);
  const hasilD1 = kasirDb.transaksi.deleteMany(filterVoid);
  printjson(hasilD1);
  print("deletedCount sesuai perkiraan: " + (hasilD1.deletedCount === perkiraanTerhapus));

  // MongoDB tidak punya FOREIGN KEY, jadi pemeriksaan "masih dipakai atau tidak"
  // dilakukan sendiri sebelum menghapus.
  judul("D2", "deleteOne - menghapus pelanggan uji yang sudah tidak punya transaksi");
  const jumlahNotaPelanggan = kasirDb.transaksi.countDocuments({ "pelanggan.id_pelanggan": ID_PELANGGAN_UJI });
  if (jumlahNotaPelanggan === 0) {
    printjson(kasirDb.pelanggan.deleteOne({ _id: ID_PELANGGAN_UJI }));
  } else {
    print("Dibatalkan: pelanggan masih punya " + jumlahNotaPelanggan + " transaksi");
  }

  print("\nSelesai: 15 operasi CRUD dijalankan. Jumlah akhir -> transaksi=" + kasirDb.transaksi.countDocuments({}) +
        ", pelanggan=" + kasirDb.pelanggan.countDocuments({}) + ", menu=" + kasirDb.menu.countDocuments({}));
})();
