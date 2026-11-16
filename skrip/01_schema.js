/* =====================================================================
 * 01_schema.js — Membuat 4 koleksi beserta aturan validasinya
 * Projek NoSQL Kelompok 4 — Sistem Kasir Rumah Makan (db_sistem_kasir)
 *
 * Cara menjalankan:
 *   mongosh "$URI" --username <user> --file skrip/01_schema.js
 *
 * APA ITU VALIDATOR?
 *   MongoDB pada dasarnya menerima dokumen dengan bentuk apa pun. Validator
 *   adalah "satpam" koleksi: setiap insert/update diperiksa, dan dokumen
 *   yang melanggar aturan DITOLAK (kode galat 121).
 *
 * KAMUS SINGKAT ISTILAH $jsonSchema
 *   bsonType   : tipe data wajib, mis. "string", "number", "date", "bool",
 *                "object" (subdokumen), "array" (daftar)
 *   required   : daftar field yang WAJIB ada
 *   properties : aturan untuk masing-masing field
 *   enum       : nilai hanya boleh salah satu dari daftar
 *   pattern    : pola teks (regex), mis. "^08[0-9]{8,11}$" = diawali 08 lalu 8–11 angka
 *   minimum / maximum       : batas angka
 *   minLength / maxLength   : batas panjang teks
 *   minItems / maxItems     : batas jumlah isi array
 *   anyOf      : minimal SATU syarat di dalamnya terpenuhi
 *   oneOf      : TEPAT SATU syarat di dalamnya terpenuhi
 *   $expr      : aturan berupa rumus yang membandingkan field satu dengan
 *                field lain (mis. total = jumlah subtotal)
 *
 * PENGATURAN VALIDATOR YANG DIPAKAI
 *   validationLevel  "strict" : semua insert DAN update diperiksa
 *   validationAction "error"  : dokumen yang melanggar ditolak (bukan sekadar diberi peringatan)
 *
 * SIFAT SKRIP
 *   - Aman dijalankan berulang. Koleksi yang belum ada dibuat dengan
 *     createCollection. Koleksi yang sudah ada dibandingkan validatornya:
 *     sama → dilewati; berbeda → diperbarui dengan collMod. Data tidak
 *     dihapus (tidak memakai drop()).
 *   - Bagian akhir mencoba memasukkan 5 dokumen yang SALAH dengan sengaja
 *     untuk membuktikan validator bekerja.
 * ===================================================================== */
(function () {
  const NAMA_DATABASE = "db_sistem_kasir";
  const kasirDb = db.getSiblingDB(NAMA_DATABASE); // pengganti "use db_sistem_kasir" di dalam berkas skrip

  // Daftar nilai yang sah (dipakai di beberapa validator)
  const METODE_PEMBAYARAN = ["Tunai", "QRIS", "Transfer BNI", "Transfer BRI", "Transfer BCA", "Transfer Mandiri"];
  const KATEGORI_MENU = ["Makanan Utama", "Minuman", "Camilan", "Dessert", "Paket Spesial", "Lauk Tambahan", "Sayuran"];
  const STATUS_PESANAN = ["Sedang Diproses", "Siap Diambil", "Sudah Diterima"];

  /* ---------------------------------------------------------------
   * 1) Koleksi pengguna
   *    Gabungan tabel MySQL user + kasir + koki.
   *    Data kasir/koki disimpan di subdokumen "profil" (relasi 1:1).
   * --------------------------------------------------------------- */
  const validatorPengguna = {
    $jsonSchema: {
      bsonType: "object",
      title: "pengguna",
      required: ["_id", "username", "password_hash", "role", "aktif", "dibuat_pada"],
      properties: {
        _id: { bsonType: "number", minimum: 1, description: "id_user lama (angka)" },
        username: { bsonType: "string", pattern: "^[a-z0-9_.]{3,30}$", description: "huruf kecil/angka/_/., 3-30 karakter" },
        password_hash: { bsonType: "string", pattern: "^[a-f0-9]{64}$", description: "hash SHA-256 (64 hex), bukan kata sandi asli" },
        role: { enum: ["Admin", "Kasir", "Koki"] },
        aktif: { bsonType: "bool" },
        dibuat_pada: { bsonType: "date" },
        profil: {
          bsonType: "object",
          required: ["kode_staf", "nama_lengkap"],
          properties: {
            kode_staf: { bsonType: "string", pattern: "^(KSR|KOK)[0-9]{2,3}$" }, // KSR01 (kasir) / KOK01 (koki)
            nama_lengkap: { bsonType: "string", minLength: 2, maxLength: 50 },
            no_hp: { bsonType: "string", pattern: "^08[0-9]{8,11}$" },
            shift: { enum: ["Pagi", "Sore"] }
          }
        }
      },
      // Aturan khusus: role Admin boleh tanpa profil,
      // sedangkan Kasir dan Koki WAJIB punya profil.
      // Dibaca: "role-nya Admin" ATAU "punya field profil".
      anyOf: [
        { properties: { role: { enum: ["Admin"] } } },
        { required: ["profil"] }
      ]
    }
  };

  /* ---------------------------------------------------------------
   * 2) Koleksi pelanggan
   *    Disimpan terpisah dan dirujuk dari transaksi, karena satu
   *    pelanggan bisa punya transaksi yang terus bertambah.
   * --------------------------------------------------------------- */
  const validatorPelanggan = {
    $jsonSchema: {
      bsonType: "object",
      title: "pelanggan",
      required: ["_id", "nama", "poin", "terdaftar_pada"],
      properties: {
        _id: { bsonType: "number", minimum: 1 },
        nama: { bsonType: "string", minLength: 2, maxLength: 50 },
        poin: { bsonType: "number", minimum: 0 },
        terdaftar_pada: { bsonType: "date" },
        // kontak tidak wajib; bila ada, isinya boleh no_hp saja, email saja, atau keduanya
        kontak: {
          bsonType: "object",
          properties: {
            no_hp: { bsonType: "string", pattern: "^08[0-9]{8,11}$" },
            email: { bsonType: "string", pattern: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$" } // bentuk sederhana: teks@teks.teks
          }
        }
      }
    }
  };

  /* ---------------------------------------------------------------
   * 3) Koleksi menu
   *    Kategori disimpan di dalam menu (subdokumen "kategori").
   * --------------------------------------------------------------- */
  const validatorMenu = {
    $jsonSchema: {
      bsonType: "object",
      title: "menu",
      required: ["_id", "nama", "kategori", "harga", "tersedia"],
      properties: {
        _id: { bsonType: "string", pattern: "^[A-Z]{2,10}$", description: "kode_menu lama" },
        nama: { bsonType: "string", minLength: 3, maxLength: 40 },
        kategori: {
          bsonType: "object",
          required: ["id", "nama"],
          properties: {
            id: { bsonType: "number", minimum: 1, maximum: 7 },
            nama: { enum: KATEGORI_MENU }
          }
        },
        harga: { bsonType: "number", minimum: 1000, maximum: 1000000 },
        tersedia: { bsonType: "bool" },
        tags: { bsonType: "array", uniqueItems: true, maxItems: 10, items: { bsonType: "string" } }, // uniqueItems = tidak boleh ada tag kembar
        varian: {
          bsonType: "array",
          maxItems: 10,
          items: {
            bsonType: "object",
            required: ["nama", "harga_tambahan"],
            properties: {
              nama: { bsonType: "string" },
              harga_tambahan: { bsonType: "number", minimum: 0 }
            }
          }
        },
        riwayat_harga: {
          bsonType: "array",
          maxItems: 12, // dibatasi supaya array tidak tumbuh tanpa batas
          items: {
            bsonType: "object",
            required: ["harga", "berlaku_sampai"],
            properties: {
              harga: { bsonType: "number", minimum: 1000 },
              berlaku_sampai: { bsonType: "date" }
            }
          }
        }
      }
    }
  };

  /* ---------------------------------------------------------------
   * 4) Koleksi transaksi (satu dokumen = satu nota)
   *    - items      : eks tabel detail_transaksi (disematkan)
   *    - pembayaran : eks tabel metode_pembayaran (disematkan)
   *    - kasir, koki, pelanggan : rujukan {id + nama}
   *    Validator ini terdiri dari 4 bagian yang SEMUANYA harus lolos ($and):
   *    1 aturan bentuk ($jsonSchema) + 3 aturan hitungan ($expr).
   * --------------------------------------------------------------- */

  // Bentuk rujukan staf (kasir/koki) yang dipakai dua kali di bawah.
  const skemaRujukanStaf = {
    bsonType: "object",
    required: ["id_pengguna", "nama"],
    properties: {
      id_pengguna: { bsonType: "number", minimum: 1 },
      nama: { bsonType: "string", minLength: 2 }
    }
  };

  const validatorTransaksi = {
    $and: [
      // Bagian 1 — aturan bentuk dokumen
      {
        $jsonSchema: {
          bsonType: "object",
          title: "transaksi",
          required: ["_id", "tanggal", "tipe_pesanan", "status", "items", "total_bayar",
                     "pembayaran", "kasir", "koki", "pelanggan", "riwayat_status"],
          properties: {
            _id: { bsonType: "string", pattern: "^TR[0-9]{13}$", description: "no_nota: TR + ddMMyyyy + 5 digit urut" },
            tanggal: { bsonType: "date" },
            tipe_pesanan: { enum: ["Makan di Tempat", "Bawa Pulang"] },
            status: { enum: STATUS_PESANAN },
            items: {
              bsonType: "array",
              minItems: 1,   // nota tanpa item ditolak
              maxItems: 50,  // batas wajar satu nota
              items: {       // aturan untuk SETIAP isi array items
                bsonType: "object",
                required: ["kode_menu", "nama_menu", "kategori", "harga", "kuantitas", "subtotal"],
                properties: {
                  kode_menu: { bsonType: "string", pattern: "^[A-Z]{2,10}$" },
                  nama_menu: { bsonType: "string" },
                  kategori: { enum: KATEGORI_MENU },
                  harga: { bsonType: "number", minimum: 0 },
                  kuantitas: { bsonType: "number", minimum: 1, maximum: 100, multipleOf: 1 }, // multipleOf 1 = harus bilangan bulat
                  subtotal: { bsonType: "number", minimum: 0 },
                  catatan: { bsonType: "string", maxLength: 100 }
                }
              }
            },
            total_bayar: { bsonType: "number", minimum: 0 },
            pembayaran: {
              bsonType: "object",
              required: ["metode", "jenis", "jumlah_dibayar", "kembalian"],
              properties: {
                metode: { enum: METODE_PEMBAYARAN },
                jenis: { enum: ["Tunai", "QRIS", "Transfer"] },
                jumlah_dibayar: { bsonType: "number", minimum: 0 },
                kembalian: { bsonType: "number", minimum: 0 }
              }
            },
            kasir: skemaRujukanStaf,
            koki: { oneOf: [{ bsonType: "null" }, skemaRujukanStaf] }, // koki boleh null (pesanan belum diambil dapur)
            pelanggan: {
              bsonType: "object",
              required: ["id_pelanggan", "nama"],
              properties: {
                id_pelanggan: { bsonType: "number", minimum: 1 },
                nama: { bsonType: "string" }
              }
            },
            riwayat_status: {
              bsonType: "array",
              minItems: 1,
              maxItems: 3, // hanya ada 3 status, jadi array ini tidak akan tumbuh tanpa batas
              items: {
                bsonType: "object",
                required: ["status", "waktu"],
                properties: {
                  status: { enum: STATUS_PESANAN },
                  waktu: { bsonType: "date" }
                }
              }
            }
          }
        }
      },
      // Bagian 2 — total_bayar harus sama dengan jumlah semua subtotal item
      { $expr: { $eq: ["$total_bayar", { $sum: "$items.subtotal" }] } },
      // Bagian 3 — uang yang dibayar tidak boleh kurang dari total
      { $expr: { $gte: ["$pembayaran.jumlah_dibayar", "$total_bayar"] } },
      // Bagian 4 — kembalian = uang dibayar − total
      { $expr: { $eq: ["$pembayaran.kembalian", { $subtract: ["$pembayaran.jumlah_dibayar", "$total_bayar"] }] } }
    ]
  };

  const daftarKoleksi = [
    { nama: "pengguna", validator: validatorPengguna },
    { nama: "pelanggan", validator: validatorPelanggan },
    { nama: "menu", validator: validatorMenu },
    { nama: "transaksi", validator: validatorTransaksi }
  ];

  /* ---------------------------------------------------------------
   * MEMBUAT / MEMPERBARUI KOLEKSI
   * --------------------------------------------------------------- */
  // Mengambil info (termasuk validator) sebuah koleksi berdasarkan namanya.
  // CATATAN ATLAS FREE (M0): getCollectionInfos TIDAK diberi filter seperti
  // { name: { $in: [...] } }, karena klaster Free hanya menerima filter nama
  // berupa teks/regex dan akan memunculkan galat
  // "can't get regex from filter doc not a regex". Jadi semua info diambil
  // tanpa filter, lalu disaring di JavaScript.
  function ambilInfoKoleksi(namaKoleksi) {
    const semuaInfo = kasirDb.getCollectionInfos();
    for (let i = 0; i < semuaInfo.length; i++) {
      if (semuaInfo[i].name === namaKoleksi) return semuaInfo[i];
    }
    return null; // koleksi tidak ditemukan
  }

  print("=== 01_schema.js — database: " + NAMA_DATABASE + " ===");
  const koleksiYangSudahAda = kasirDb.getCollectionNames();

  daftarKoleksi.forEach(function (k) {
    const pengaturan = { validator: k.validator, validationLevel: "strict", validationAction: "error" };

    // Kasus 1: koleksi belum ada → buat baru beserta validatornya.
    if (koleksiYangSudahAda.indexOf(k.nama) === -1) {
      kasirDb.createCollection(k.nama, pengaturan);
      print("[BUAT]     koleksi " + k.nama + " + validator");
      return;
    }

    // Kasus 2: koleksi sudah ada dan validatornya SAMA → tidak perlu diubah.
    // (Dengan begini, user ber-role "Read and write to any database" yang
    //  tidak punya izin collMod tetap bisa menjalankan ulang skrip ini.)
    const pengaturanTersimpan = ambilInfoKoleksi(k.nama).options;
    const validatorSama = EJSON.stringify(pengaturanTersimpan.validator || {}) === EJSON.stringify(k.validator);
    const levelSama = pengaturanTersimpan.validationLevel === "strict" && pengaturanTersimpan.validationAction === "error";
    if (validatorSama && levelSama) {
      print("[TETAP]    validator koleksi " + k.nama + " sudah sesuai (data tetap)");
      return;
    }

    // Kasus 3: koleksi sudah ada tetapi validatornya BERBEDA → perbarui dengan collMod.
    try {
      kasirDb.runCommand(Object.assign({ collMod: k.nama }, pengaturan));
      print("[PERBARUI] validator koleksi " + k.nama + " (data tetap)");
    } catch (galat) {
      if (galat.code === 13) { // 13 = Unauthorized (tidak punya izin)
        print("[GALAT]    validator berubah tetapi user tidak berhak menjalankan collMod.");
        print("           Pakai database user ber-role 'Atlas admin' (lihat PANDUAN_ATLAS.md langkah 3).");
      }
      throw galat;
    }
  });

  // Tampilkan pengaturan validator yang sekarang aktif
  ["pengguna", "pelanggan", "menu", "transaksi"].forEach(function (namaKoleksi) {
    const info = ambilInfoKoleksi(namaKoleksi);
    print("  - " + info.name + ": validationLevel=" + info.options.validationLevel +
          ", validationAction=" + info.options.validationAction);
  });

  /* ---------------------------------------------------------------
   * UJI PENOLAKAN: 5 dokumen yang SENGAJA dibuat salah
   * Hasil yang benar: semuanya ditolak dengan kode 121.
   * --------------------------------------------------------------- */
  print("\n=== Uji penolakan validator (harus DITOLAK semua) ===");
  const sekarang = new Date();

  // Contoh nota yang BENAR. Setiap percobaan di bawah merusak satu bagiannya.
  const notaBenar = {
    _id: "TR0000000099999",
    tanggal: sekarang,
    tipe_pesanan: "Makan di Tempat",
    status: "Sedang Diproses",
    items: [{ kode_menu: "ETHMNS", nama_menu: "Es Teh Manis", kategori: "Minuman", harga: 5000, kuantitas: 2, subtotal: 10000 }],
    total_bayar: 10000,
    pembayaran: { metode: "Tunai", jenis: "Tunai", jumlah_dibayar: 10000, kembalian: 0 },
    kasir: { id_pengguna: 6, nama: "Putu Pratama" },
    koki: null,
    pelanggan: { id_pelanggan: 1, nama: "Andi" },
    riwayat_status: [{ status: "Sedang Diproses", waktu: sekarang }]
  };

  // Object.assign({}, notaBenar, {...}) = salin notaBenar lalu timpa field tertentu.
  const daftarPercobaan = [
    {
      keterangan: "V1 transaksi: tipe_pesanan di luar enum ('Delivery')",
      koleksi: "transaksi",
      dokumen: Object.assign({}, notaBenar, { tipe_pesanan: "Delivery" })
    },
    {
      keterangan: "V2 transaksi: total_bayar (15000) != jumlah subtotal item (10000)",
      koleksi: "transaksi",
      dokumen: Object.assign({}, notaBenar, {
        total_bayar: 15000,
        pembayaran: { metode: "Tunai", jenis: "Tunai", jumlah_dibayar: 20000, kembalian: 5000 }
      })
    },
    {
      keterangan: "V3 transaksi: jumlah_dibayar (5000) < total_bayar (10000)",
      koleksi: "transaksi",
      dokumen: Object.assign({}, notaBenar, {
        pembayaran: { metode: "Tunai", jenis: "Tunai", jumlah_dibayar: 5000, kembalian: 0 }
      })
    },
    {
      keterangan: "V4 menu: harga negatif & kategori tidak dikenal",
      koleksi: "menu",
      dokumen: { _id: "UJIMENU", nama: "Menu Uji", kategori: { id: 9, nama: "Minuman Keras" }, harga: -5000, tersedia: true }
    },
    {
      keterangan: "V5 pengguna: role Kasir tanpa profil & password tidak di-hash",
      koleksi: "pengguna",
      dokumen: { _id: 999, username: "kasir_uji", password_hash: "rahasia123", role: "Kasir", aktif: true, dibuat_pada: sekarang }
    }
  ];

  // Galat validator berisi rincian yang panjang dan bersarang.
  // Fungsi ini menelusurinya dan mengambil maksimal 3 alasan singkat,
  // contoh: "harga -> comparison failed [minimum]".
  function ringkasAlasanPenolakan(infoGalat) {
    const daftarAlasan = [];
    function telusuri(bagian, namaField) {
      if (!bagian || typeof bagian !== "object") return;
      if (Array.isArray(bagian)) {
        bagian.forEach(function (isi) { telusuri(isi, namaField); });
        return;
      }
      let field = namaField;
      if (bagian.propertyName) field = namaField ? namaField + "." + bagian.propertyName : bagian.propertyName;
      if (bagian.reason) {
        daftarAlasan.push((field || "(aturan $expr)") + " -> " + bagian.reason +
                          (bagian.operatorName ? " [" + bagian.operatorName + "]" : ""));
      }
      Object.keys(bagian).forEach(function (kunci) {
        if (kunci !== "specifiedAs" && kunci !== "consideredValue") telusuri(bagian[kunci], field);
      });
    }
    telusuri(infoGalat && infoGalat.details, "");
    return daftarAlasan.length ? daftarAlasan.slice(0, 3).join("; ") : "-";
  }

  let jumlahDitolak = 0;
  daftarPercobaan.forEach(function (p) {
    try {
      kasirDb.getCollection(p.koleksi).insertOne(p.dokumen);
      // Bila sampai di baris ini, berarti dokumen salah malah DITERIMA → validator bermasalah.
      print("[GAGAL]  " + p.keterangan + " -> TERNYATA DITERIMA (validator bermasalah)");
      kasirDb.getCollection(p.koleksi).deleteOne({ _id: p.dokumen._id }); // bersihkan lagi
    } catch (galat) {
      if (galat.code === 121) { // 121 = DocumentValidationFailure (ditolak validator)
        jumlahDitolak++;
        print("[DITOLAK] " + p.keterangan + "  (code " + galat.code + " DocumentValidationFailure)");
        print("          alasan: " + ringkasAlasanPenolakan(galat.errInfo));
      } else {
        print("[??]     " + p.keterangan + " -> galat lain: " + galat.message);
      }
    }
  });
  print("Hasil: " + jumlahDitolak + "/" + daftarPercobaan.length + " dokumen tidak valid berhasil ditolak.");
})();
