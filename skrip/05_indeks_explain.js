/* =====================================================================
 * 05_indeks_explain.js - Membuat 4 indeks dan membuktikan efeknya
 * Projek NoSQL Kelompok 4 - db_sistem_kasir
 *
 * Cara menjalankan:
 *   mongosh "$URI" --username <user> --file skrip/05_indeks_explain.js
 *
 * APA ITU INDEKS?
 *   Seperti daftar indeks di belakang buku: MongoDB bisa langsung melompat
 *   ke dokumen yang dicari tanpa membaca seluruh koleksi.
 *   Tanpa indeks  → COLLSCAN (collection scan: semua 5.000 dokumen dibaca)
 *   Dengan indeks → IXSCAN   (index scan: hanya dokumen yang relevan dibaca)
 *   Harganya: indeks memakan ruang dan sedikit memperlambat penulisan,
 *   jadi indeks hanya dibuat untuk query yang memang sering dipakai.
 *
 * INDEKS YANG DIBUAT
 *   I1 idx_esr_kasir_tanggal_total  (transaksi) - MAJEMUK dengan aturan ESR   → query Q1
 *        ESR = urutan field: Equality (filter "sama dengan") → Sort (urutan)
 *        → Range (filter rentang). Dengan urutan ini MongoDB tidak perlu
 *        mengurutkan ulang di memori (tahap SORT hilang).
 *   I2 uq_pengguna_username         (pengguna)  - UNIK: satu username satu akun
 *   I3 idx_mk_item_tanggal          (transaksi) - MULTIKEY: indeks pada field di
 *        dalam array (items.kode_menu); MongoDB membuat satu entri per item  → query Q2
 *   I4 idx_pelanggan_tanggal        (transaksi) - riwayat transaksi pelanggan → query Q3
 *
 * CARA MEMBUKTIKAN (explain "executionStats")
 *   1. Hapus indeks I1/I3/I4 bila sudah ada (kondisi "sebelum").
 *   2. Jalankan explain 3 kali per query, catat nilai tengah waktunya.
 *   3. Buat indeks.
 *   4. Jalankan explain 3 kali lagi (kondisi "sesudah"), lalu bandingkan.
 *
 * ISI LAPORAN EXPLAIN YANG DIBACA
 *   tahap             : rencana eksekusi yang dipilih (COLLSCAN / IXSCAN / SORT / FETCH / LIMIT)
 *   nReturned         : jumlah dokumen hasil
 *   totalKeysExamined : jumlah entri indeks yang dibaca
 *   totalDocsExamined : jumlah dokumen yang dibaca (makin kecil makin baik;
 *                       idealnya sama dengan nReturned)
 *   executionTimeMillis : waktu eksekusi dalam milidetik
 * ===================================================================== */
(function () {
  const NAMA_DATABASE = "db_sistem_kasir";
  const kasirDb = db.getSiblingDB(NAMA_DATABASE);

  function waktuWita(tahun, bulan, tanggal, jam, menit) {
    return new Date(Date.UTC(tahun, bulan - 1, tanggal, jam - 8, menit || 0, 0));
  }

  // Daftar indeks. kunci: 1 = urut naik, -1 = urut turun.
  const DAFTAR_INDEKS = [
    { koleksi: "transaksi", nama: "idx_esr_kasir_tanggal_total", kunci: { "kasir.id_pengguna": 1, tanggal: -1, total_bayar: 1 }, opsi: {} },
    { koleksi: "pengguna",  nama: "uq_pengguna_username",        kunci: { username: 1 },                                        opsi: { unique: true } },
    { koleksi: "transaksi", nama: "idx_mk_item_tanggal",         kunci: { "items.kode_menu": 1, tanggal: 1 },                   opsi: {} },
    { koleksi: "transaksi", nama: "idx_pelanggan_tanggal",       kunci: { "pelanggan.id_pelanggan": 1, tanggal: -1 },           opsi: {} }
  ];

  // Tiga query yang diukur. "jalankanExplain" mengembalikan laporan explain query tersebut.
  const DAFTAR_QUERY = [
    {
      kode: "Q1",
      keterangan: "Nota >= Rp100.000 milik kasir Siti (id 7), terbaru dulu  [E: kasir, S: tanggal, R: total]",
      jalankanExplain: function () {
        return kasirDb.transaksi
          .find({ "kasir.id_pengguna": 7, total_bayar: { $gte: 100000 } }) // E = kasir, R = total_bayar
          .sort({ tanggal: -1 })                                          // S = tanggal
          .explain("executionStats");
      }
    },
    {
      kode: "Q2",
      keterangan: "Nota berisi Gurame Goreng (GRMGRG) selama Oktober 2026  [multikey items.kode_menu]",
      jalankanExplain: function () {
        return kasirDb.transaksi
          .find({ "items.kode_menu": "GRMGRG", tanggal: { $gte: waktuWita(2026, 10, 1, 0, 0), $lt: waktuWita(2026, 11, 1, 0, 0) } })
          .explain("executionStats");
      }
    },
    {
      kode: "Q3",
      keterangan: "10 transaksi terakhir pelanggan Rina (id 3)",
      jalankanExplain: function () {
        return kasirDb.transaksi
          .find({ "pelanggan.id_pelanggan": 3 })
          .sort({ tanggal: -1 })
          .limit(10)
          .explain("executionStats");
      }
    }
  ];

  // Rencana eksekusi berbentuk pohon bertingkat, contoh:
  //   FETCH → (inputStage) IXSCAN
  // Fungsi ini menelusuri pohon itu dan menuliskannya dalam satu baris,
  // contoh: "FETCH <- IXSCAN(idx_pelanggan_tanggal)".
  function ambilUrutanTahap(rencana) {
    const daftarTahap = [];
    function telusuri(tahap) {
      if (!tahap) return;
      if (tahap.queryPlan) { telusuri(tahap.queryPlan); return; } // format mesin SBE (MongoDB 7/8) membungkus rencana di "queryPlan"
      if (tahap.stage) daftarTahap.push(tahap.stage + (tahap.indexName ? "(" + tahap.indexName + ")" : ""));
      if (tahap.inputStage) telusuri(tahap.inputStage);                // tahap di bawahnya (satu)
      if (tahap.inputStages) tahap.inputStages.forEach(telusuri);     // tahap di bawahnya (lebih dari satu)
    }
    telusuri(rencana);
    return daftarTahap.join(" <- ");
  }

  // Nilai tengah (median). Contoh: [3, 1, 2] → diurutkan [1, 2, 3] → 2.
  // Median dipakai agar satu pengukuran yang kebetulan lambat tidak merusak hasil.
  function nilaiTengah(daftarAngka) {
    const terurut = daftarAngka.slice().sort(function (a, b) { return a - b; });
    return terurut[Math.floor(terurut.length / 2)];
  }

  // Menjalankan explain 3 kali dan merangkum hasilnya.
  function ukurQuery(query) {
    const daftarWaktu = [];
    let laporan;
    for (let i = 0; i < 3; i++) {
      laporan = query.jalankanExplain();
      daftarWaktu.push(laporan.executionStats.executionTimeMillis);
    }
    return {
      tahap: ambilUrutanTahap(laporan.queryPlanner.winningPlan),
      nReturned: laporan.executionStats.nReturned,
      totalKeysExamined: laporan.executionStats.totalKeysExamined,
      totalDocsExamined: laporan.executionStats.totalDocsExamined,
      waktu3x: daftarWaktu,
      median_ms: nilaiTengah(daftarWaktu)
    };
  }

  print("=== 05_indeks_explain.js - database: " + NAMA_DATABASE + " ===");
  print("jumlah dokumen transaksi: " + kasirDb.transaksi.countDocuments({}));

  // LANGKAH 1 - kondisi awal: hapus indeks buatan kita bila sudah ada (indeks _id tidak disentuh)
  DAFTAR_INDEKS.forEach(function (indeks) {
    const koleksi = kasirDb.getCollection(indeks.koleksi);
    const sudahAda = koleksi.getIndexes().some(function (i) { return i.name === indeks.nama; });
    if (sudahAda) {
      koleksi.dropIndex(indeks.nama);
      print("[hapus] " + indeks.koleksi + "." + indeks.nama);
    }
  });

  // LANGKAH 2 - ukur SEBELUM indeks dibuat
  const hasilSebelum = {};
  DAFTAR_QUERY.forEach(function (q) { hasilSebelum[q.kode] = ukurQuery(q); });

  // LANGKAH 3 - buat indeks
  print("");
  DAFTAR_INDEKS.forEach(function (indeks) {
    const opsiLengkap = Object.assign({ name: indeks.nama }, indeks.opsi);
    kasirDb.getCollection(indeks.koleksi).createIndex(indeks.kunci, opsiLengkap);
    print("[buat]  " + indeks.koleksi + "." + indeks.nama + " " + JSON.stringify(indeks.kunci) + (indeks.opsi.unique ? " UNIQUE" : ""));
  });

  // LANGKAH 4 - ukur SESUDAH indeks dibuat
  const hasilSesudah = {};
  DAFTAR_QUERY.forEach(function (q) { hasilSesudah[q.kode] = ukurQuery(q); });

  // LANGKAH 5 - tampilkan perbandingan
  print("\n=== Perbandingan explain (executionStats, waktu = nilai tengah dari 3 kali) ===");
  function barisLaporan(label, h) {
    return "  " + label + " : tahap=" + h.tahap + " | nReturned=" + h.nReturned + " | keysExamined=" + h.totalKeysExamined +
           " | docsExamined=" + h.totalDocsExamined + " | waktu=" + JSON.stringify(h.waktu3x) + " median=" + h.median_ms + " ms";
  }
  DAFTAR_QUERY.forEach(function (q) {
    const sebelum = hasilSebelum[q.kode];
    const sesudah = hasilSesudah[q.kode];
    print("\n" + q.kode + " - " + q.keterangan);
    print(barisLaporan("SEBELUM", sebelum));
    print(barisLaporan("SESUDAH", sesudah));

    // Berapa kali lebih sedikit dokumen yang dibaca, dan seberapa efisien
    // (rasio 1.00 = setiap dokumen yang dibaca memang dokumen hasil).
    const kaliLebihSedikit = sesudah.totalDocsExamined > 0 ? (sebelum.totalDocsExamined / sesudah.totalDocsExamined).toFixed(1) : "-";
    const rasioEfisiensi = sesudah.nReturned ? (sesudah.totalDocsExamined / sesudah.nReturned).toFixed(2) : "-";
    print("  => dokumen yang diperiksa turun " + sebelum.totalDocsExamined + " -> " + sesudah.totalDocsExamined +
          " (" + kaliLebihSedikit + "x lebih sedikit); rasio docsExamined/nReturned sesudah = " + rasioEfisiensi);
  });

  // Ringkasan JSON (untuk disalin ke tabel laporan BAB IV)
  print("\nJSON ringkasan:");
  print(JSON.stringify({ sebelum: hasilSebelum, sesudah: hasilSesudah }));

  print("\nDaftar indeks akhir:");
  ["transaksi", "pengguna"].forEach(function (namaKoleksi) {
    kasirDb.getCollection(namaKoleksi).getIndexes().forEach(function (i) {
      print("  " + namaKoleksi + "." + i.name + " " + JSON.stringify(i.key) + (i.unique ? " unique" : ""));
    });
  });
})();
