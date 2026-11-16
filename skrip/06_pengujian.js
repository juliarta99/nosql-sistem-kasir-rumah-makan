/* =====================================================================
 * 06_pengujian.js - 15 kasus uji otomatis (10 positif, 5 negatif)
 * Projek NoSQL Kelompok 4 - db_sistem_kasir
 *
 * Cara menjalankan (SETELAH 01 sampai 05):
 *   mongosh "$URI" --username <user> --file skrip/06_pengujian.js
 *
 * DUA JENIS KASUS UJI
 *   Positif : memeriksa bahwa data dan fitur bekerja BENAR
 *             (jumlah data, konsistensi hitungan, integritas rujukan, indeks).
 *   Negatif : sengaja melakukan operasi yang SALAH; dianggap LULUS bila
 *             operasi itu DITOLAK oleh database.
 *             Kode penolakan: 121 = ditolak validator, 11000 = nilai kembar pada indeks unik.
 *
 * Setiap kasus mencetak LULUS/GAGAL beserta "harapan" dan "aktual".
 * Tidak ada data yang tertinggal: bila operasi negatif ternyata lolos,
 * datanya langsung dihapus/dikembalikan.
 * ===================================================================== */
(function () {
  const NAMA_DATABASE = "db_sistem_kasir";
  const kasirDb = db.getSiblingDB(NAMA_DATABASE);
  const rekapHasil = [];

  function waktuWita(tahun, bulan, tanggal, jam, menit) {
    return new Date(Date.UTC(tahun, bulan - 1, tanggal, jam - 8, menit || 0, 0));
  }

  // Menjalankan satu kasus uji.
  // fungsiUji harus mengembalikan objek { lulus: true/false, harapan: "...", aktual: "..." }.
  function uji(id, jenis, nama, fungsiUji) {
    let hasil;
    try {
      hasil = fungsiUji();
    } catch (galat) {
      hasil = { lulus: false, harapan: "-", aktual: "galat: " + galat.message }; // galat tak terduga = GAGAL
    }
    rekapHasil.push({ id: id, jenis: jenis, nama: nama, lulus: hasil.lulus });
    print((hasil.lulus ? "[LULUS] " : "[GAGAL] ") + id + " (" + jenis + ") " + nama);
    print("         harapan: " + hasil.harapan + " | aktual: " + hasil.aktual);
  }

  // Untuk kasus NEGATIF: operasi harus gagal dengan kode galat tertentu.
  //   operasi    : fungsi berisi perintah yang seharusnya ditolak
  //   bersihkan  : (opsional) fungsi untuk membatalkan efeknya bila ternyata diterima
  function harusDitolak(kodeYangDiharapkan, operasi, bersihkan) {
    const harapan = "ditolak (code " + kodeYangDiharapkan + ")";
    try {
      operasi();
      if (bersihkan) bersihkan();                    // operasi lolos → kembalikan data seperti semula
      return { lulus: false, harapan: harapan, aktual: "DITERIMA" };
    } catch (galat) {
      return { lulus: galat.code === kodeYangDiharapkan, harapan: harapan, aktual: "ditolak (code " + galat.code + ")" };
    }
  }

  // Menghitung jumlah dokumen hasil sebuah pipeline (dengan tahap $count di akhir).
  function hitungHasilPipeline(namaKoleksi, pipeline) {
    const hasil = kasirDb.getCollection(namaKoleksi).aggregate(pipeline.concat([{ $count: "n" }])).toArray();
    return hasil.length ? hasil[0].n : 0;           // tanpa hasil → $count tidak mengembalikan apa-apa → 0
  }

  print("=== 06_pengujian.js - database: " + NAMA_DATABASE + " ===\n");

  /* ============================ KASUS POSITIF ============================ */

  uji("T01", "positif", "Volume data sesuai syarat (transaksi >= 1000, koleksi lain >= 30)", function () {
    const jumlah = {};
    ["transaksi", "pengguna", "pelanggan", "menu"].forEach(function (nama) {
      jumlah[nama] = kasirDb.getCollection(nama).countDocuments({});
    });
    const memenuhi = jumlah.transaksi >= 1000 && jumlah.pengguna >= 30 && jumlah.pelanggan >= 30 && jumlah.menu >= 30;
    return { lulus: memenuhi, harapan: "transaksi>=1000, lainnya>=30", aktual: JSON.stringify(jumlah) };
  });

  uji("T02", "positif", "Keempat koleksi punya validator strict/error", function () {
    // Tanpa filter $in: Atlas Free (M0) menolak filter nama selain teks/regex.
    const namaDicek = ["transaksi", "pengguna", "pelanggan", "menu"];
    const infoKoleksi = kasirDb.getCollectionInfos().filter(function (k) { return namaDicek.indexOf(k.name) >= 0; });
    const yangBenar = infoKoleksi.filter(function (k) {
      return k.options.validator && k.options.validationLevel === "strict" && k.options.validationAction === "error";
    });
    return { lulus: yangBenar.length === 4, harapan: "4 koleksi", aktual: yangBenar.length + " koleksi" };
  });

  uji("T03", "positif", "Data asli MySQL termigrasi utuh (7 nota, 9 baris item, total Rp175.000)", function () {
    // Di MySQL: 7 baris tabel transaksi, 9 baris detail_transaksi, jumlah total_bayar = 175.000
    const notaAsli = ["TR1909202600001", "TR1909202600002", "TR2009202600001", "TR2009202600002",
                      "TR2109202600001", "TR2109202600002", "TR2109202600003"];
    const r = kasirDb.transaksi.aggregate([
      { $match: { _id: { $in: notaAsli } } },
      { $group: { _id: null, nota: { $sum: 1 }, baris_item: { $sum: { $size: "$items" } }, total: { $sum: "$total_bayar" } } }
    ]).toArray()[0] || {};
    return {
      lulus: r.nota === 7 && r.baris_item === 9 && r.total === 175000,
      harapan: "nota=7, baris_item=9, total=175000",
      aktual: "nota=" + r.nota + ", baris_item=" + r.baris_item + ", total=" + r.total
    };
  });

  uji("T04", "positif", "Konsistensi: setiap subtotal = harga x kuantitas", function () {
    const jumlahSalah = hitungHasilPipeline("transaksi", [
      { $unwind: "$items" },
      { $match: { $expr: { $ne: ["$items.subtotal", { $multiply: ["$items.harga", "$items.kuantitas"] }] } } }
    ]);
    return { lulus: jumlahSalah === 0, harapan: "0 item salah", aktual: jumlahSalah + " item salah" };
  });

  uji("T05", "positif", "Konsistensi: total_bayar = jumlah subtotal & kembalian = dibayar - total", function () {
    const jumlahSalah = hitungHasilPipeline("transaksi", [
      { $match: { $expr: { $or: [
        { $ne: ["$total_bayar", { $sum: "$items.subtotal" }] },
        { $ne: ["$pembayaran.kembalian", { $subtract: ["$pembayaran.jumlah_dibayar", "$total_bayar"] }] }
      ] } } }
    ]);
    return { lulus: jumlahSalah === 0, harapan: "0 nota salah", aktual: jumlahSalah + " nota salah" };
  });

  // MongoDB tidak punya FOREIGN KEY, jadi kebenaran rujukan diperiksa dengan $lookup.
  uji("T06", "positif", "Integritas referensi: kasir & koki di transaksi ada di pengguna dengan role yang benar", function () {
    const jumlahRusak = hitungHasilPipeline("transaksi", [
      { $lookup: { from: "pengguna", localField: "kasir.id_pengguna", foreignField: "_id", as: "dataKasir" } },
      { $lookup: { from: "pengguna", localField: "koki.id_pengguna", foreignField: "_id", as: "dataKoki" } },
      { $match: { $or: [
        { "dataKasir.role": { $ne: "Kasir" } },                                   // kasir tidak ditemukan / bukan kasir
        { $and: [{ koki: { $ne: null } }, { "dataKoki.role": { $ne: "Koki" } }] } // koki diisi tetapi tidak ditemukan / bukan koki
      ] } }
    ]);
    return { lulus: jumlahRusak === 0, harapan: "0 rujukan rusak", aktual: jumlahRusak + " rujukan rusak" };
  });

  uji("T07", "positif", "Integritas referensi: setiap pelanggan di transaksi ada di koleksi pelanggan", function () {
    const jumlahYatim = hitungHasilPipeline("transaksi", [
      { $lookup: { from: "pelanggan", localField: "pelanggan.id_pelanggan", foreignField: "_id", as: "dataPelanggan" } },
      { $match: { dataPelanggan: { $size: 0 } } }                                  // array kosong = pelanggan tidak ditemukan
    ]);
    return { lulus: jumlahYatim === 0, harapan: "0 yatim", aktual: jumlahYatim + " yatim" };
  });

  // Membuktikan alasan item disematkan: harga di nota adalah harga SAAT transaksi.
  uji("T08", "positif", "Snapshot harga: nota sebelum 1 Okt memakai harga lama Nasi Goreng (20.000)", function () {
    const hargaDiNotaLama = kasirDb.transaksi.aggregate([
      { $match: { "items.kode_menu": "NSGRG", tanggal: { $lt: waktuWita(2026, 10, 1, 0, 0) } } },
      { $unwind: "$items" },
      { $match: { "items.kode_menu": "NSGRG" } },
      { $group: { _id: "$items.harga" } }                                         // daftar harga berbeda yang muncul
    ]).toArray().map(function (d) { return d._id; });
    const hargaMenuSekarang = kasirDb.menu.findOne({ _id: "NSGRG" }).harga;
    return {
      lulus: hargaDiNotaLama.length === 1 && hargaDiNotaLama[0] === 20000 && hargaMenuSekarang === 22000,
      harapan: "harga di nota lama=[20000], harga menu kini=22000",
      aktual: "nota lama=" + JSON.stringify(hargaDiNotaLama) + ", menu kini=" + hargaMenuSekarang
    };
  });

  uji("T09", "positif", "Query Q1 memakai indeks ESR (IXSCAN, tanpa tahap SORT di memori)", function () {
    const laporan = kasirDb.transaksi
      .find({ "kasir.id_pengguna": 7, total_bayar: { $gte: 100000 } })
      .sort({ tanggal: -1 })
      .explain("executionStats");
    const rencanaSebagaiTeks = JSON.stringify(laporan.queryPlanner.winningPlan);
    const pakaiIndeks = rencanaSebagaiTeks.indexOf("idx_esr_kasir_tanggal_total") >= 0;
    const adaSort = rencanaSebagaiTeks.indexOf("\"SORT\"") >= 0;
    const dibaca = laporan.executionStats.totalDocsExamined;
    const hasil = laporan.executionStats.nReturned;
    return {
      lulus: pakaiIndeks && !adaSort && dibaca === hasil,
      harapan: "IXSCAN idx_esr..., tanpa SORT, docsExamined = nReturned",
      aktual: "docsExamined=" + dibaca + ", nReturned=" + hasil + ", SORT=" + adaSort
    };
  });

  uji("T10", "positif", "Aggregation omzet per kategori Oktober 2026 menghasilkan 7 kategori terurut", function () {
    const hasil = kasirDb.transaksi.aggregate([
      { $match: { status: "Sudah Diterima", tanggal: { $gte: waktuWita(2026, 10, 1, 0, 0), $lt: waktuWita(2026, 11, 1, 0, 0) } } },
      { $unwind: "$items" },
      { $group: { _id: "$items.kategori", omzet: { $sum: "$items.subtotal" } } },
      { $sort: { omzet: -1 } }
    ]).toArray();
    let terurutTurun = true;
    for (let i = 1; i < hasil.length; i++) {
      if (hasil[i - 1].omzet < hasil[i].omzet) terurutTurun = false;
    }
    return { lulus: hasil.length === 7 && terurutTurun, harapan: "7 kategori, menurun", aktual: hasil.length + " kategori, terurut=" + terurutTurun };
  });

  /* ============================ KASUS NEGATIF ============================ */
  // Nota contoh yang BENAR. Tiap kasus di bawah merusak satu bagiannya.
  const sekarang = new Date();
  const notaBenar = {
    _id: "TR1611202699777", tanggal: sekarang, tipe_pesanan: "Makan di Tempat", status: "Sedang Diproses",
    items: [{ kode_menu: "ETHMNS", nama_menu: "Es Teh Manis", kategori: "Minuman", harga: 5000, kuantitas: 1, subtotal: 5000 }],
    total_bayar: 5000,
    pembayaran: { metode: "Tunai", jenis: "Tunai", jumlah_dibayar: 5000, kembalian: 0 },
    kasir: { id_pengguna: 6, nama: "Putu Pratama" }, koki: null, pelanggan: { id_pelanggan: 1, nama: "Andi" },
    riwayat_status: [{ status: "Sedang Diproses", waktu: sekarang }]
  };
  const hapusNotaUji = function () { kasirDb.transaksi.deleteOne({ _id: notaBenar._id }); };

  uji("N01", "negatif", "Nota tanpa item (items kosong) ditolak", function () {
    return harusDitolak(121, function () {
      kasirDb.transaksi.insertOne(Object.assign({}, notaBenar, {
        items: [], total_bayar: 0,
        pembayaran: { metode: "Tunai", jenis: "Tunai", jumlah_dibayar: 0, kembalian: 0 }
      }));
    }, hapusNotaUji);
  });

  uji("N02", "negatif", "Metode pembayaran tidak terdaftar ('OVO') ditolak", function () {
    return harusDitolak(121, function () {
      kasirDb.transaksi.insertOne(Object.assign({}, notaBenar, {
        pembayaran: { metode: "OVO", jenis: "QRIS", jumlah_dibayar: 5000, kembalian: 0 }
      }));
    }, hapusNotaUji);
  });

  // Validator juga memeriksa UPDATE, bukan hanya insert (validationLevel "strict").
  uji("N03", "negatif", "Update yang membuat kembalian tidak sesuai ($set kembalian 9999) ditolak", function () {
    return harusDitolak(121, function () {
      kasirDb.transaksi.updateOne({ _id: "TR1909202600001" }, { $set: { "pembayaran.kembalian": 9999 } });
    }, function () {
      kasirDb.transaksi.updateOne({ _id: "TR1909202600001" }, { $set: { "pembayaran.kembalian": 500 } }); // kembalikan nilai asli
    });
  });

  uji("N04", "negatif", "Username duplikat ('siti') ditolak indeks unik", function () {
    return harusDitolak(11000, function () {
      kasirDb.pengguna.insertOne({
        _id: 9999, username: "siti",
        password_hash: "f02b7c1e519e4fa436147f7e1399974f9510aa9c8e0cb8be29151eb540f9d214",
        role: "Kasir", aktif: true, dibuat_pada: sekarang,
        profil: { kode_staf: "KSR99", nama_lengkap: "Siti Duplikat" }
      });
    }, function () { kasirDb.pengguna.deleteOne({ _id: 9999 }); });
  });

  uji("N05", "negatif", "Status di luar alur ('Dibatalkan') & riwayat_status > 3 elemen ditolak", function () {
    return harusDitolak(121, function () {
      kasirDb.transaksi.updateOne({ _id: "TR1909202600001" }, {
        $set: { status: "Dibatalkan" },
        $push: { riwayat_status: { status: "Sedang Diproses", waktu: sekarang } } // nota ini sudah punya 3 riwayat
      });
    });
  });

  /* ============================== RINGKASAN ============================== */
  const jumlahLulus = rekapHasil.filter(function (h) { return h.lulus; }).length;
  const jumlahNegatif = rekapHasil.filter(function (h) { return h.jenis === "negatif"; }).length;
  const jumlahPositif = rekapHasil.length - jumlahNegatif;
  print("\n=== RINGKASAN: " + jumlahLulus + "/" + rekapHasil.length + " kasus LULUS (" + jumlahPositif + " positif, " + jumlahNegatif + " negatif) ===");
  if (jumlahLulus !== rekapHasil.length) {
    print("Ada kasus GAGAL - periksa keluaran di atas.");
    if (typeof quit === "function") quit(1); // keluar dengan kode 1 agar run_all menandai ada kegagalan
  }
})();
