/* =====================================================================
 * 02_seed.js - Mengisi database dengan data
 * Projek NoSQL Kelompok 4 - Sistem Kasir Rumah Makan (db_sistem_kasir)
 *
 * Cara menjalankan (SETELAH 01_schema.js):
 *   mongosh "$URI" --username <user> --file skrip/02_seed.js
 *
 * APA YANG DILAKUKAN SKRIP INI?
 *   1. Memindahkan data ASLI dari database MySQL (FP 1.2) apa adanya.
 *   2. Menambah data BUATAN (sintetis) supaya jumlahnya cukup untuk
 *      latihan analitik dan indeks. Hasil akhirnya:
 *        pengguna  :    40 dokumen  (11 asli + 29 buatan)
 *        pelanggan :   300 dokumen  ( 7 asli + 293 buatan)
 *        menu      :    45 dokumen  ( 7 asli + 38 buatan)
 *        transaksi : 5.000 dokumen  ( 7 asli + 4.993 buatan)
 *   3. Mengosongkan koleksi lalu mengisinya kembali, jadi aman diulang.
 *
 * ISTILAH PENTING
 *   - Data sintetis : data buatan yang meniru data nyata.
 *   - Benih (seed)  : angka awal untuk pengacak. Benih yang sama selalu
 *                     menghasilkan urutan angka acak yang sama, sehingga
 *                     data buatan IDENTIK di laptop siapa pun dan di Atlas.
 *   - WITA          : Waktu Indonesia Tengah (UTC+8), zona waktu Bali.
 *
 * Skrip dibungkus (function () { ... })(); - disebut IIFE - supaya
 * nama-nama variabel di sini tidak bentrok dengan skrip lain bila
 * beberapa skrip dijalankan dalam satu sesi mongosh.
 * ===================================================================== */
(function () {
  const NAMA_DATABASE = "db_sistem_kasir";
  const kasirDb = db.getSiblingDB(NAMA_DATABASE); // pengganti "use db_sistem_kasir" di dalam berkas skrip

  /* ===================================================================
   * BAGIAN 1. PENGACAK BERBENIH
   * -------------------------------------------------------------------
   * Mengapa tidak memakai Math.random() saja?
   *   Math.random() memberi angka berbeda setiap kali skrip dijalankan.
   *   Akibatnya data buatan, hasil laporan, dan angka explain berubah-ubah,
   *   sehingga sulit dicocokkan dengan laporan dan sulit diperiksa dosen.
   *
   * Solusinya: pengacak yang bisa diberi BENIH. Ibaratnya mengocok kartu
   * dengan gerakan yang selalu sama → urutan kartunya pun selalu sama.
   * =================================================================== */
  const BENIH = 4042026; // angka bebas; kami pakai "4" (Kelompok 4) + "042026". JANGAN diubah.

  // Rumus "mulberry32": rumus pengacak semu (pseudo-random) yang pendek dan populer.
  // Pemula TIDAK perlu memahami isi rumusnya. Yang perlu diketahui hanya:
  //   - setiap pemanggilan angkaAcak() menghasilkan angka pecahan 0 sampai <1;
  //   - deret angkanya selalu sama bila benihnya sama.
  // Operator >>>, ^, dan Math.imul di bawah hanyalah operasi bit untuk "mengaduk" angka.
  let posisiPengacak = BENIH >>> 0; // ">>> 0" memastikan angka berupa bilangan bulat positif 32-bit
  function angkaAcak() {
    posisiPengacak = (posisiPengacak + 0x6D2B79F5) >>> 0; // maju satu langkah
    let t = posisiPengacak;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;         // dibagi 2^32 → hasil 0 sampai <1
  }

  // Bilangan bulat acak dari min sampai max (keduanya ikut). Contoh: angkaBulatAcak(1, 6) seperti melempar dadu.
  function angkaBulatAcak(min, max) {
    return min + Math.floor(angkaAcak() * (max - min + 1));
  }

  // Memilih satu isi daftar secara acak, peluang tiap isi sama besar.
  function pilihAcak(daftar) {
    const nomorUrut = Math.floor(angkaAcak() * daftar.length);
    return daftar[nomorUrut];
  }

  // Memilih satu isi daftar dengan PELUANG BERBEDA-BEDA (berbobot).
  // Contoh: pilihAcakBerbobot([1, 2, 3], [70, 22, 8])
  //   → 70% kemungkinan hasilnya 1, 22% hasilnya 2, 8% hasilnya 3.
  // Cara kerjanya seperti roda putar: tiap pilihan mendapat "irisan"
  // selebar bobotnya, lalu jarum diputar sekali.
  function pilihAcakBerbobot(daftar, bobot) {
    let totalBobot = 0;
    for (let i = 0; i < bobot.length; i++) totalBobot += bobot[i];

    let posisiJarum = angkaAcak() * totalBobot; // jarum berhenti di 0 .. totalBobot
    for (let i = 0; i < daftar.length; i++) {
      posisiJarum -= bobot[i];
      if (posisiJarum < 0) return daftar[i];    // jarum jatuh di irisan ke-i
    }
    return daftar[daftar.length - 1];            // pengaman (secara teori tidak pernah terjadi)
  }

  /* ===================================================================
   * BAGIAN 2. FUNGSI BANTU UMUM
   * =================================================================== */

  // Menambah angka nol di depan. Contoh: tambahNol(7, 2) → "07", tambahNol(12, 5) → "00012"
  function tambahNol(angka, panjang) {
    let teks = String(angka);
    while (teks.length < panjang) teks = "0" + teks;
    return teks;
  }

  // Membuat tanggal dari waktu lokal WITA.
  // MongoDB menyimpan waktu dalam UTC, sedangkan WITA = UTC + 8 jam,
  // jadi jam WITA dikurangi 8. Contoh: 10:15 WITA disimpan sebagai 02:15 UTC.
  // Catatan: di JavaScript, bulan dihitung dari 0 (Januari = 0), karena itu "bulan - 1".
  function waktuWita(tahun, bulan, tanggal, jam, menit) {
    return new Date(Date.UTC(tahun, bulan - 1, tanggal, jam - 8, menit || 0, 0));
  }

  // Menggeser waktu sekian menit ke depan.
  function tambahMenit(waktu, jumlahMenit) {
    return new Date(waktu.getTime() + jumlahMenit * 60 * 1000);
  }

  // Membuat nomor HP Indonesia acak, contoh "081382717322" (12 digit).
  function buatNomorHpAcak() {
    const kodeOperator = pilihAcak(["11", "12", "13", "21", "22", "52", "53", "57", "77", "78", "81", "82", "95", "96"]);
    const tujuhDigit = tambahNol(angkaBulatAcak(0, 9999999), 7);
    const digitTerakhir = String(angkaBulatAcak(0, 9));
    return "08" + kodeOperator + tujuhDigit + digitTerakhir;
  }

  // Hash SHA-256 yang sudah ada di data MySQL (bukan kata sandi asli).
  const HASH_PASSWORD_KOKI = "b3f69230e36b9867409c495b29e80baf3b66b768f02b306118df38193122150d";
  const HASH_PASSWORD_KASIR = "f02b7c1e519e4fa436147f7e1399974f9510aa9c8e0cb8be29151eb540f9d214";
  const HASH_PASSWORD_ADMIN = "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9";

  const NAMA_KATEGORI = {
    1: "Makanan Utama", 2: "Minuman", 3: "Camilan", 4: "Dessert",
    5: "Paket Spesial", 6: "Lauk Tambahan", 7: "Sayuran"
  };

  // Mulai 1 Oktober 2026 beberapa menu naik harga. Nota sebelum tanggal ini memakai harga lama.
  const TANGGAL_HARGA_BARU = waktuWita(2026, 10, 1, 0, 0);

  print("=== 02_seed.js - database: " + NAMA_DATABASE + " (benih " + BENIH + ") ===");

  /* ===================================================================
   * BAGIAN 3. KOLEKSI pengguna
   * Tabel MySQL user + kasir + koki digabung. Data kasir/koki disimpan
   * di dalam field "profil" (embedding relasi 1:1).
   * =================================================================== */
  const TANGGAL_AKUN_DIBUAT = waktuWita(2026, 6, 1, 9, 0);
  const daftarPengguna = [];

  // 3a. Data ASLI dari MySQL. Aturan pemetaan id: id_koki n = id_user n, id_kasir n = id_user n+5.
  const penggunaAsli = [
    { _id: 1, username: "sanji",   password_hash: HASH_PASSWORD_KOKI,  role: "Koki",  profil: { kode_staf: "KOK01", nama_lengkap: "Chef Sanji",    shift: "Pagi" } },
    { _id: 2, username: "renatta", password_hash: HASH_PASSWORD_KOKI,  role: "Koki",  profil: { kode_staf: "KOK02", nama_lengkap: "Chef Renatta",  shift: "Pagi" } },
    { _id: 3, username: "arnold",  password_hash: HASH_PASSWORD_KOKI,  role: "Koki",  profil: { kode_staf: "KOK03", nama_lengkap: "Chef Arnold",   shift: "Sore" } },
    { _id: 4, username: "vincent", password_hash: HASH_PASSWORD_KOKI,  role: "Koki",  profil: { kode_staf: "KOK04", nama_lengkap: "Chef Vincent",  shift: "Sore" } },
    { _id: 5, username: "dedi",    password_hash: HASH_PASSWORD_KOKI,  role: "Koki",  profil: { kode_staf: "KOK05", nama_lengkap: "Chef Dedi",     shift: "Sore" } },
    { _id: 6, username: "putu",    password_hash: HASH_PASSWORD_KASIR, role: "Kasir", profil: { kode_staf: "KSR01", nama_lengkap: "Putu Pratama",  shift: "Pagi" } },
    { _id: 7, username: "siti",    password_hash: HASH_PASSWORD_KASIR, role: "Kasir", profil: { kode_staf: "KSR02", nama_lengkap: "Siti Aminah",   shift: "Pagi" } },
    { _id: 8, username: "wayan",   password_hash: HASH_PASSWORD_KASIR, role: "Kasir", profil: { kode_staf: "KSR03", nama_lengkap: "Wayan Santoso", shift: "Sore" } },
    { _id: 9, username: "ayu",     password_hash: HASH_PASSWORD_KASIR, role: "Kasir", profil: { kode_staf: "KSR04", nama_lengkap: "Ayu Lestari",   shift: "Sore" } },
    { _id: 10, username: "rizky",  password_hash: HASH_PASSWORD_KASIR, role: "Kasir", profil: { kode_staf: "KSR05", nama_lengkap: "Rizky Maulana", shift: "Sore" } },
    { _id: 11, username: "admin",  password_hash: HASH_PASSWORD_ADMIN, role: "Admin" } // Admin tidak punya profil
  ];
  penggunaAsli.forEach(function (akun) {
    akun.aktif = true;
    akun.dibuat_pada = TANGGAL_AKUN_DIBUAT;
    daftarPengguna.push(akun);
  });

  // 3b. Data BUATAN: 14 kasir, 14 koki, dan 1 admin tambahan.
  const namaKasirBaru = ["Made Ariawan", "Komang Sari", "Ketut Wirawan", "Nyoman Dewi", "Kadek Ananta", "Gede Prasetya",
    "Luh Ayu Wulandari", "Dewa Ngurah Putra", "Ni Putu Cahyani", "Agung Rai", "Desak Made Sri", "Ida Ayu Laksmi",
    "Fajar Nugroho", "Dewi Kartika"];
  const namaKokiBaru = ["Chef Bayu", "Chef Kadek", "Chef Arya", "Chef Ratna", "Chef Dodi", "Chef Laras", "Chef Surya",
    "Chef Wulan", "Chef Andika", "Chef Indra", "Chef Melati", "Chef Rudi", "Chef Tirta", "Chef Gita"];

  // Username harus unik. Catat yang sudah dipakai supaya tidak ada yang kembar.
  const usernameTerpakai = {};
  daftarPengguna.forEach(function (akun) { usernameTerpakai[akun.username] = true; });

  // Membuat username dari nama. Contoh: "Made Ariawan" → "ariawan"; "Chef Bayu" → "bayu".
  // Bila sudah dipakai, gabungkan seluruh kata ("ni.putu.cahyani"), lalu tambah angka bila masih kembar.
  function buatUsername(namaLengkap) {
    const kata = namaLengkap.toLowerCase().replace(/^chef /, "").split(" ");
    let username = kata[kata.length - 1];               // pakai kata terakhir
    if (usernameTerpakai[username]) username = kata.join(".");
    const usernameDasar = username;
    let nomor = 2;
    while (usernameTerpakai[username]) {                // masih kembar? tambah angka 2, 3, ...
      username = usernameDasar + nomor;
      nomor++;
    }
    usernameTerpakai[username] = true;
    return username;
  }

  let idPenggunaBerikutnya = 12;

  // Membuat satu akun staf buatan. PENTING: pemanggilan pengacak di sini
  // urutannya harus tetap (no HP → shift → tanggal dibuat), karena urutan
  // pemanggilan ikut menentukan data yang dihasilkan.
  function buatAkunStaf(namaLengkap, role, kodeStaf, hashPassword, masihAktif) {
    const username = buatUsername(namaLengkap);
    const noHp = buatNomorHpAcak();
    const shift = pilihAcak(["Pagi", "Sore"]);
    const selisihHari = angkaBulatAcak(0, 40);           // dibuat 0–40 hari setelah 1 Juni 2026
    return {
      _id: idPenggunaBerikutnya++,
      username: username,
      password_hash: hashPassword,
      role: role,
      profil: { kode_staf: kodeStaf, nama_lengkap: namaLengkap, no_hp: noHp, shift: shift },
      aktif: masihAktif,
      dibuat_pada: tambahMenit(TANGGAL_AKUN_DIBUAT, selisihHari * 24 * 60)
    };
  }

  for (let i = 0; i < namaKasirBaru.length; i++) {
    const kodeStaf = "KSR" + tambahNol(6 + i, 2);        // KSR06, KSR07, ...
    const masihAktif = i < 12;                            // 2 kasir terakhir sudah berhenti bekerja
    daftarPengguna.push(buatAkunStaf(namaKasirBaru[i], "Kasir", kodeStaf, HASH_PASSWORD_KASIR, masihAktif));
  }
  for (let i = 0; i < namaKokiBaru.length; i++) {
    const kodeStaf = "KOK" + tambahNol(6 + i, 2);
    const masihAktif = i < 12;                            // 2 koki terakhir sudah berhenti bekerja
    daftarPengguna.push(buatAkunStaf(namaKokiBaru[i], "Koki", kodeStaf, HASH_PASSWORD_KOKI, masihAktif));
  }
  daftarPengguna.push({
    _id: idPenggunaBerikutnya++, username: "manajer", password_hash: HASH_PASSWORD_ADMIN,
    role: "Admin", aktif: true, dibuat_pada: TANGGAL_AKUN_DIBUAT
  });

  const semuaKasir = daftarPengguna.filter(function (akun) { return akun.role === "Kasir"; });
  const semuaKoki = daftarPengguna.filter(function (akun) { return akun.role === "Koki"; });

  /* ===================================================================
   * BAGIAN 4. KOLEKSI pelanggan
   * =================================================================== */
  const daftarPelanggan = [];

  // 4a. Data ASLI dari MySQL (id 1–7).
  const namaPelangganAsli = ["Andi", "Bima", "Rina", "Joko", "Siska", "Dimas", "Lina"];
  for (let i = 0; i < namaPelangganAsli.length; i++) {
    daftarPelanggan.push({
      _id: i + 1,
      nama: namaPelangganAsli[i],
      poin: 0,                                            // dihitung ulang di Bagian 7
      terdaftar_pada: waktuWita(2026, 7, 1 + i, 10, 0)
    });
  }

  // 4b. Data BUATAN (id 8–300): nama dibentuk dari nama depan + nama belakang acak.
  const namaDepan = ["Agus", "Budi", "Citra", "Dewi", "Eka", "Fitri", "Gilang", "Hendra", "Indah", "Jaya", "Kurnia", "Lestari",
    "Mega", "Nanda", "Oka", "Putri", "Rahmat", "Sari", "Tri", "Umi", "Vina", "Wahyu", "Yoga", "Zahra", "Arya", "Bagus",
    "Cahya", "Dian", "Eko", "Galih", "Hana", "Intan", "Krisna", "Laksmi", "Mira", "Nyoman", "Pande", "Ratih", "Sinta", "Teguh"];
  const namaBelakang = ["Saputra", "Wijaya", "Pratiwi", "Santika", "Mahendra", "Kusuma", "Permana", "Utami", "Hidayat",
    "Suryani", "Adnyana", "Wiranata", "Astuti", "Nugraha", "Purnama", "Setiawan", "Anggraeni", "Dharma", "Sukma",
    "Ramadhan", "Wulandari", "Yudistira", "Paramitha", "Gunawan", "Sanjaya", "Febrianti", "Arimbawa", "Pertiwi"];

  const namaTerpakai = {};
  daftarPelanggan.forEach(function (p) { namaTerpakai[p.nama] = true; });

  for (let id = 8; id <= 300; id++) {
    // Ulangi pengacakan sampai mendapat nama yang belum dipakai.
    let nama;
    do {
      nama = pilihAcak(namaDepan) + " " + pilihAcak(namaBelakang);
    } while (namaTerpakai[nama]);
    namaTerpakai[nama] = true;

    // Tanggal daftar acak di bulan Juli 2026, jam 08.00–21.59 WITA.
    const tanggal = angkaBulatAcak(1, 31);
    const jam = angkaBulatAcak(8, 21);
    const menit = angkaBulatAcak(0, 59);
    const pelanggan = { _id: id, nama: nama, poin: 0, terdaftar_pada: waktuWita(2026, 7, tanggal, jam, menit) };

    // Atribut BERVARIASI: tidak semua pelanggan punya data kontak yang sama.
    //   45% hanya no HP, 20% no HP + email, 10% hanya email, 25% tanpa kontak.
    // Di MySQL ini butuh kolom yang banyak berisi NULL; di MongoDB field cukup tidak ditulis.
    const peluang = angkaAcak();
    const emailDariNama = nama.toLowerCase().replace(" ", ".") + "@mail.com";
    if (peluang < 0.45) {
      pelanggan.kontak = { no_hp: buatNomorHpAcak() };
    } else if (peluang < 0.65) {
      pelanggan.kontak = { no_hp: buatNomorHpAcak(), email: emailDariNama };
    } else if (peluang < 0.75) {
      pelanggan.kontak = { email: nama.toLowerCase().replace(" ", "_") + id + "@mail.com" };
    }
    daftarPelanggan.push(pelanggan);
  }

  /* ===================================================================
   * BAGIAN 5. KOLEKSI menu
   * Kategori disimpan langsung di dalam menu (embedding), karena
   * kategori hanya punya nama dan selalu dibaca bersama menu.
   * =================================================================== */
  // popularitas = bobot peluang menu dipesan (makin besar, makin sering muncul di nota)
  // naikHarga   = true bila menu ini naik Rp2.000 mulai 1 Oktober 2026
  const dataMenu = [
    // --- 7 menu ASLI dari MySQL ---
    { kode: "BKNJGG",  nama: "Bakwan Jagung",     kategori: 3, harga: 15000,  popularitas: 6,  tags: ["goreng", "vegetarian"] },
    { kode: "ECDL",    nama: "Es Cendol",         kategori: 4, harga: 12000,  popularitas: 6,  tags: ["dingin", "manis"] },
    { kode: "EJRKPRS", nama: "Es Jeruk Peras",    kategori: 2, harga: 10000,  popularitas: 10, tags: ["dingin", "segar"] },
    { kode: "ETHMNS",  nama: "Es Teh Manis",      kategori: 2, harga: 5000,   popularitas: 18, tags: ["dingin", "favorit"] },
    { kode: "GRMGRG",  nama: "Gurame Goreng",     kategori: 1, harga: 30000,  popularitas: 7,  tags: ["goreng", "ikan"] },
    { kode: "NSAMBKR", nama: "Nasi Ayam Bakar",   kategori: 1, harga: 25000,  popularitas: 12, tags: ["bakar", "favorit"] },
    { kode: "PKRNS",   nama: "Paket Nasi",        kategori: 5, harga: 35000,  popularitas: 6,  tags: ["paket"] },
    // --- 38 menu BUATAN ---
    { kode: "NSGRG",   nama: "Nasi Goreng",       kategori: 1, harga: 22000,  popularitas: 11, tags: ["goreng", "favorit"], naikHarga: true },
    { kode: "MIGRG",   nama: "Mie Goreng",        kategori: 1, harga: 20000,  popularitas: 8,  tags: ["goreng"] },
    { kode: "NSCMPR",  nama: "Nasi Campur Bali",  kategori: 1, harga: 28000,  popularitas: 9,  tags: ["khas bali", "pedas"], naikHarga: true },
    { kode: "AYMBTT",  nama: "Ayam Betutu",       kategori: 1, harga: 45000,  popularitas: 5,  tags: ["khas bali", "pedas"] },
    { kode: "BBGLNG",  nama: "Babi Guling",       kategori: 1, harga: 40000,  popularitas: 6,  tags: ["khas bali"] },
    { kode: "STLLLT",  nama: "Sate Lilit",        kategori: 1, harga: 30000,  popularitas: 6,  tags: ["khas bali", "bakar"], naikHarga: true },
    { kode: "SPBNTT",  nama: "Sop Buntut",        kategori: 1, harga: 50000,  popularitas: 3,  tags: ["berkuah", "panas"] },
    { kode: "NSPCLL",  nama: "Nasi Pecel Lele",   kategori: 1, harga: 23000,  popularitas: 6,  tags: ["goreng", "pedas"] },
    { kode: "IKNBKR",  nama: "Ikan Bakar",        kategori: 1, harga: 38000,  popularitas: 4,  tags: ["bakar", "ikan"] },
    { kode: "ETHTWR",  nama: "Es Teh Tawar",      kategori: 2, harga: 4000,   popularitas: 7,  tags: ["dingin"] },
    { kode: "KPHTM",   nama: "Kopi Hitam",        kategori: 2, harga: 8000,   popularitas: 6,  tags: ["panas", "kopi"] },
    { kode: "KPSS",    nama: "Kopi Susu",         kategori: 2, harga: 15000,  popularitas: 8,  tags: ["dingin", "kopi"], naikHarga: true },
    { kode: "JSALPKT", nama: "Jus Alpukat",       kategori: 2, harga: 18000,  popularitas: 5,  tags: ["dingin", "jus"] },
    { kode: "JSMNG",   nama: "Jus Mangga",        kategori: 2, harga: 16000,  popularitas: 4,  tags: ["dingin", "jus"] },
    { kode: "AIRMNR",  nama: "Air Mineral",       kategori: 2, harga: 5000,   popularitas: 9,  tags: ["dingin"] },
    { kode: "ESKLPMD", nama: "Es Kelapa Muda",    kategori: 2, harga: 15000,  popularitas: 5,  tags: ["dingin", "segar"] },
    { kode: "WDNGJH",  nama: "Wedang Jahe",       kategori: 2, harga: 10000,  popularitas: 3,  tags: ["panas"] },
    { kode: "KTGGRG",  nama: "Kentang Goreng",    kategori: 3, harga: 18000,  popularitas: 5,  tags: ["goreng", "vegetarian"] },
    { kode: "PSGGRG",  nama: "Pisang Goreng",     kategori: 3, harga: 12000,  popularitas: 5,  tags: ["goreng", "manis"] },
    { kode: "TMPMDN",  nama: "Tempe Mendoan",     kategori: 3, harga: 12000,  popularitas: 5,  tags: ["goreng", "vegetarian"] },
    { kode: "THUISI",  nama: "Tahu Isi",          kategori: 3, harga: 12000,  popularitas: 4,  tags: ["goreng", "vegetarian"] },
    { kode: "KRPKUDG", nama: "Kerupuk Udang",     kategori: 3, harga: 8000,   popularitas: 6,  tags: ["goreng"] },
    { kode: "ESDLMN",  nama: "Es Daluman",        kategori: 4, harga: 12000,  popularitas: 3,  tags: ["dingin", "khas bali"] },
    { kode: "KLPN",    nama: "Klepon",            kategori: 4, harga: 10000,  popularitas: 4,  tags: ["manis", "khas bali"] },
    { kode: "PDDCKL",  nama: "Puding Cokelat",    kategori: 4, harga: 15000,  popularitas: 3,  tags: ["manis", "dingin"] },
    { kode: "BBKTHM",  nama: "Bubur Ketan Hitam", kategori: 4, harga: 12000,  popularitas: 3,  tags: ["manis", "panas"] },
    { kode: "PKTKLG",  nama: "Paket Keluarga",    kategori: 5, harga: 150000, popularitas: 2,  tags: ["paket", "porsi besar"], naikHarga: true },
    { kode: "PKTHMT",  nama: "Paket Hemat",       kategori: 5, harga: 25000,  popularitas: 6,  tags: ["paket", "hemat"] },
    { kode: "PKTBTT",  nama: "Paket Betutu",      kategori: 5, harga: 65000,  popularitas: 2,  tags: ["paket", "khas bali"] },
    { kode: "TLRDDR",  nama: "Telur Dadar",       kategori: 6, harga: 6000,   popularitas: 6,  tags: ["telur"] },
    { kode: "TLRBLD",  nama: "Telur Balado",      kategori: 6, harga: 7000,   popularitas: 4,  tags: ["telur", "pedas"] },
    { kode: "AYMGRG",  nama: "Ayam Goreng",       kategori: 6, harga: 18000,  popularitas: 6,  tags: ["goreng"], naikHarga: true },
    { kode: "SMBLMTH", nama: "Sambal Matah",      kategori: 6, harga: 5000,   popularitas: 7,  tags: ["pedas", "khas bali"] },
    { kode: "CPCY",    nama: "Cap Cay",           kategori: 7, harga: 25000,  popularitas: 4,  tags: ["sayur", "berkuah"] },
    { kode: "TMSKNGK", nama: "Tumis Kangkung",    kategori: 7, harga: 15000,  popularitas: 5,  tags: ["sayur", "vegetarian"] },
    { kode: "PLCNG",   nama: "Plecing Kangkung",  kategori: 7, harga: 15000,  popularitas: 4,  tags: ["sayur", "pedas", "khas bali"] },
    { kode: "LWRBL",   nama: "Lawar Bali",        kategori: 7, harga: 20000,  popularitas: 3,  tags: ["khas bali"] },
    { kode: "SYRASM",  nama: "Sayur Asem",        kategori: 7, harga: 12000,  popularitas: 3,  tags: ["sayur", "berkuah"] }
  ];

  // Hanya beberapa menu yang punya varian (contoh atribut yang tidak dimiliki semua dokumen).
  const varianMenu = {
    ETHMNS:  [{ nama: "Less Sugar", harga_tambahan: 0 }, { nama: "Jumbo", harga_tambahan: 3000 }],
    KPSS:    [{ nama: "Gula Aren", harga_tambahan: 2000 }, { nama: "Less Ice", harga_tambahan: 0 }],
    NSGRG:   [{ nama: "Level Pedas 1-5", harga_tambahan: 0 }, { nama: "Tambah Telur", harga_tambahan: 5000 }],
    MIGRG:   [{ nama: "Level Pedas 1-5", harga_tambahan: 0 }, { nama: "Tambah Telur", harga_tambahan: 5000 }],
    JSALPKT: [{ nama: "Tambah Cokelat", harga_tambahan: 3000 }]
  };

  // Mengubah dataMenu menjadi dokumen sesuai bentuk koleksi menu.
  const daftarMenu = [];
  const bobotPopularitasMenu = [];
  dataMenu.forEach(function (m) {
    const dokumenMenu = {
      _id: m.kode,
      nama: m.nama,
      kategori: { id: m.kategori, nama: NAMA_KATEGORI[m.kategori] }, // kategori disematkan
      harga: m.harga,
      tersedia: true,
      tags: m.tags
    };
    if (varianMenu[m.kode]) dokumenMenu.varian = varianMenu[m.kode];
    if (m.naikHarga) {
      // simpan harga lama (Rp2.000 lebih murah) yang berlaku sampai 30 September 2026
      dokumenMenu.riwayat_harga = [{ harga: m.harga - 2000, berlaku_sampai: TANGGAL_HARGA_BARU }];
    }
    daftarMenu.push(dokumenMenu);
    bobotPopularitasMenu.push(m.popularitas);
  });

  // Contoh menu yang sedang kosong: Sop Buntut tidak dijual lagi sejak Oktober.
  const KODE_MENU_KOSONG = "SPBNTT";
  daftarMenu.forEach(function (m) { if (m._id === KODE_MENU_KOSONG) m.tersedia = false; });

  /* ===================================================================
   * BAGIAN 6. KOLEKSI transaksi
   * Satu dokumen = satu nota lengkap: item (eks tabel detail_transaksi)
   * dan pembayaran (eks tabel metode_pembayaran) disimpan di dalamnya.
   * Kasir, koki, dan pelanggan disimpan sebagai rujukan {id + nama}.
   * =================================================================== */

  // "Kamus" untuk mencari data berdasarkan id dengan cepat.
  const menuBerdasarkanKode = {};
  daftarMenu.forEach(function (m) { menuBerdasarkanKode[m._id] = m; });
  const penggunaBerdasarkanId = {};
  daftarPengguna.forEach(function (u) { penggunaBerdasarkanId[u._id] = u; });
  const pelangganBerdasarkanId = {};
  daftarPelanggan.forEach(function (p) { pelangganBerdasarkanId[p._id] = p; });

  // Harga menu pada waktu tertentu (harga lama bila sebelum 1 Oktober).
  function hargaPadaWaktu(menu, waktu) {
    const punyaHargaLama = menu.riwayat_harga !== undefined;
    if (punyaHargaLama && waktu < TANGGAL_HARGA_BARU) return menu.riwayat_harga[0].harga;
    return menu.harga;
  }

  // Membuat satu baris item nota. Harga dan nama DISALIN dari menu saat itu
  // (snapshot), supaya struk lama tidak ikut berubah saat harga menu naik.
  function buatItemNota(menu, jumlahPorsi, waktu) {
    const harga = hargaPadaWaktu(menu, waktu);
    return {
      kode_menu: menu._id,
      nama_menu: menu.nama,
      kategori: menu.kategori.nama,
      harga: harga,
      kuantitas: jumlahPorsi,
      subtotal: harga * jumlahPorsi
    };
  }

  // Rujukan staf yang disimpan di nota: id + salinan nama (atau null bila belum ada).
  function rujukanStaf(idPengguna) {
    if (idPengguna === null) return null;
    return { id_pengguna: idPengguna, nama: penggunaBerdasarkanId[idPengguna].profil.nama_lengkap };
  }
  function rujukanPelanggan(idPelanggan) {
    return { id_pelanggan: idPelanggan, nama: pelangganBerdasarkanId[idPelanggan].nama };
  }

  // "Transfer BCA" → "Transfer", "QRIS" → "QRIS", "Tunai" → "Tunai"
  function jenisPembayaran(metode) {
    if (metode === "Tunai") return "Tunai";
    if (metode === "QRIS") return "QRIS";
    return "Transfer";
  }

  function jumlahkanSubtotal(daftarItem) {
    let total = 0;
    daftarItem.forEach(function (item) { total += item.subtotal; });
    return total;
  }

  // Riwayat status pesanan: Sedang Diproses → Siap Diambil (8–25 menit) → Sudah Diterima (1–8 menit).
  function buatRiwayatStatus(statusAkhir, waktuPesan) {
    const riwayat = [{ status: "Sedang Diproses", waktu: waktuPesan }];
    if (statusAkhir === "Sedang Diproses") return riwayat;

    const waktuSiap = tambahMenit(waktuPesan, angkaBulatAcak(8, 25));
    riwayat.push({ status: "Siap Diambil", waktu: waktuSiap });
    if (statusAkhir === "Siap Diambil") return riwayat;

    riwayat.push({ status: "Sudah Diterima", waktu: tambahMenit(waktuSiap, angkaBulatAcak(1, 8)) });
    return riwayat;
  }

  const daftarTransaksi = [];
  const nomorUrutTerakhirPerHari = {}; // contoh: { "19092026": 2 } → nota terakhir tgl 19-09-2026 bernomor 00002
  const jamMulaiPerHari = {};          // di hari yang punya nota asli, nota buatan dimulai setelah nota asli terakhir

  // 6a. 7 transaksi ASLI dari MySQL (angka, waktu, dan relasi tidak diubah).
  const transaksiAsli = [
    { nota: "TR1909202600001", waktu: [2026, 9, 19, 10, 15], tipe: "Makan di Tempat", item: [["ETHMNS", 1], ["NSAMBKR", 1]], metode: "Tunai",        dibayar: 30500, status: "Sudah Diterima",  koki: 1,    kasir: 6,  pelanggan: 1 },
    { nota: "TR1909202600002", waktu: [2026, 9, 19, 11, 30], tipe: "Bawa Pulang",     item: [["GRMGRG", 1]],                  metode: "QRIS",         dibayar: 30000, status: "Sudah Diterima",  koki: 2,    kasir: 7,  pelanggan: 2 },
    { nota: "TR2009202600001", waktu: [2026, 9, 20, 12, 45], tipe: "Makan di Tempat", item: [["NSAMBKR", 1]],                 metode: "Transfer BNI", dibayar: 25000, status: "Sudah Diterima",  koki: 3,    kasir: 8,  pelanggan: 3 },
    { nota: "TR2009202600002", waktu: [2026, 9, 20, 13, 10], tipe: "Bawa Pulang",     item: [["EJRKPRS", 1]],                 metode: "Tunai",        dibayar: 10000, status: "Sedang Diproses", koki: 4,    kasir: 9,  pelanggan: 4 },
    { nota: "TR2109202600001", waktu: [2026, 9, 21, 14, 5],  tipe: "Makan di Tempat", item: [["PKRNS", 1]],                   metode: "QRIS",         dibayar: 35000, status: "Siap Diambil",    koki: 5,    kasir: 10, pelanggan: 5 },
    { nota: "TR2109202600002", waktu: [2026, 9, 21, 15, 20], tipe: "Makan di Tempat", item: [["EJRKPRS", 1], ["GRMGRG", 1]],  metode: "Transfer BRI", dibayar: 40000, status: "Sudah Diterima",  koki: 1,    kasir: 7,  pelanggan: 6 },
    { nota: "TR2109202600003", waktu: [2026, 9, 21, 16, 30], tipe: "Bawa Pulang",     item: [["ETHMNS", 1]],                  metode: "Tunai",        dibayar: 5500,  status: "Sedang Diproses", koki: null, kasir: 9,  pelanggan: 7 }
  ];
  transaksiAsli.forEach(function (a) {
    const w = a.waktu;
    const waktuPesan = waktuWita(w[0], w[1], w[2], w[3], w[4]);
    const daftarItem = a.item.map(function (baris) {
      return buatItemNota(menuBerdasarkanKode[baris[0]], baris[1], waktuPesan);
    });
    const total = jumlahkanSubtotal(daftarItem);

    daftarTransaksi.push({
      _id: a.nota,
      tanggal: waktuPesan,
      tipe_pesanan: a.tipe,
      status: a.status,
      items: daftarItem,
      total_bayar: total,
      pembayaran: { metode: a.metode, jenis: jenisPembayaran(a.metode), jumlah_dibayar: a.dibayar, kembalian: a.dibayar - total },
      kasir: rujukanStaf(a.kasir),
      koki: rujukanStaf(a.koki),
      pelanggan: rujukanPelanggan(a.pelanggan),
      riwayat_status: buatRiwayatStatus(a.status, waktuPesan)
    });

    const kodeTanggal = a.nota.substring(2, 10);                  // "TR19092026xxxxx" → "19092026"
    nomorUrutTerakhirPerHari[kodeTanggal] = parseInt(a.nota.substring(10), 10);
    jamMulaiPerHari[kodeTanggal] = w[3] + 1;                      // nota buatan dimulai satu jam setelahnya
  });

  // 6b. 4.993 transaksi BUATAN, 1 Agustus – 15 November 2026.
  const TARGET_JUMLAH_TRANSAKSI = 5000;

  // Langkah 1 - daftar semua hari. Akhir pekan lebih ramai (bobot lebih besar).
  const daftarHari = [];
  const tanggalAwal = new Date(Date.UTC(2026, 7, 1));    // 1 Agustus 2026 (bulan 7 = Agustus, karena dihitung dari 0)
  const tanggalAkhir = new Date(Date.UTC(2026, 10, 15)); // 15 November 2026
  for (let hari = tanggalAwal; hari <= tanggalAkhir; hari = new Date(hari.getTime() + 24 * 60 * 60 * 1000)) {
    const hariKe = hari.getUTCDay();                     // 0 = Minggu, 5 = Jumat, 6 = Sabtu
    let bobotKeramaian = 1.0;
    if (hariKe === 0 || hariKe === 6) bobotKeramaian = 1.4;
    else if (hariKe === 5) bobotKeramaian = 1.2;
    daftarHari.push({ tahun: hari.getUTCFullYear(), bulan: hari.getUTCMonth() + 1, tanggal: hari.getUTCDate(), bobot: bobotKeramaian });
  }

  // Langkah 2 - bagi 4.993 nota ke hari-hari tersebut sesuai bobot keramaian.
  const nomorHari = [];
  const bobotHari = [];
  const jumlahNotaPerHari = [];
  for (let i = 0; i < daftarHari.length; i++) {
    nomorHari.push(i);
    bobotHari.push(daftarHari[i].bobot);
    jumlahNotaPerHari.push(0);
  }
  for (let n = daftarTransaksi.length; n < TARGET_JUMLAH_TRANSAKSI; n++) {
    const hariTerpilih = pilihAcakBerbobot(nomorHari, bobotHari);
    jumlahNotaPerHari[hariTerpilih]++;
  }

  // Pengaturan peluang untuk isi nota.
  const JAM_BUKA = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
  const KERAMAIAN_PER_JAM = [2, 3, 4, 8, 10, 9, 5, 4, 4, 6, 9, 10, 7, 4]; // puncak makan siang & makan malam
  const METODE_BAYAR = ["Tunai", "QRIS", "Transfer BNI", "Transfer BRI", "Transfer BCA", "Transfer Mandiri"];
  const PELUANG_METODE = [40, 35, 6, 7, 8, 4];
  const PILIHAN_JUMLAH_ITEM = [1, 2, 3, 4, 5];
  const PELUANG_JUMLAH_ITEM = [30, 35, 20, 10, 5];
  const PILIHAN_PORSI = [1, 2, 3];
  const PELUANG_PORSI = [70, 22, 8];
  const PECAHAN_UANG = [0, 5000, 10000, 50000, 100000]; // 0 = pelanggan membayar uang pas
  const PELUANG_PECAHAN = [25, 20, 25, 20, 10];

  // 30 pelanggan pertama adalah pelanggan setia (6x lebih sering datang).
  const idSemuaPelanggan = [];
  const bobotPelanggan = [];
  daftarPelanggan.forEach(function (p) {
    idSemuaPelanggan.push(p._id);
    bobotPelanggan.push(p._id <= 30 ? 6 : 1);
  });

  const KODE_HARI_TERAKHIR = "15112026";

  // Langkah 3 - buat nota untuk setiap hari.
  for (let i = 0; i < daftarHari.length; i++) {
    const h = daftarHari[i];
    const kodeTanggal = tambahNol(h.tanggal, 2) + tambahNol(h.bulan, 2) + h.tahun; // contoh "01082026"
    const jamPalingAwal = jamMulaiPerHari[kodeTanggal] || 8;

    // 3a. Tentukan jam & menit setiap nota hari ini, lalu urutkan dari pagi ke malam.
    const daftarWaktu = [];
    for (let k = 0; k < jumlahNotaPerHari[i]; k++) {
      let jam;
      do {
        jam = pilihAcakBerbobot(JAM_BUKA, KERAMAIAN_PER_JAM);
      } while (jam < jamPalingAwal);
      const menit = angkaBulatAcak(0, 59);
      daftarWaktu.push(waktuWita(h.tahun, h.bulan, h.tanggal, jam, menit));
    }
    daftarWaktu.sort(function (a, b) { return a - b; });

    // 3b. Isi setiap nota.
    // PENTING: urutan pemanggilan pengacak di bawah sengaja dibuat tetap
    // (item → status → kasir → koki → metode bayar → tipe pesanan → pelanggan → riwayat).
    // Bila urutannya diubah, data yang keluar akan berbeda walaupun benihnya sama.
    daftarWaktu.forEach(function (waktuPesan) {
      nomorUrutTerakhirPerHari[kodeTanggal] = (nomorUrutTerakhirPerHari[kodeTanggal] || 0) + 1;
      const noNota = "TR" + kodeTanggal + tambahNol(nomorUrutTerakhirPerHari[kodeTanggal], 5);
      const sebelumOktober = waktuPesan < TANGGAL_HARGA_BARU;

      // (1) Item: 1–5 menu berbeda dalam satu nota.
      const jumlahItem = pilihAcakBerbobot(PILIHAN_JUMLAH_ITEM, PELUANG_JUMLAH_ITEM);
      const menuSudahDipilih = {};
      const daftarItem = [];
      while (daftarItem.length < jumlahItem) {
        const menu = pilihAcakBerbobot(daftarMenu, bobotPopularitasMenu);
        const sudahAdaDiNota = menuSudahDipilih[menu._id] === true;
        const menuSudahKosong = menu._id === KODE_MENU_KOSONG && !sebelumOktober;
        if (sudahAdaDiNota || menuSudahKosong) continue;          // pilih ulang

        menuSudahDipilih[menu._id] = true;
        const porsi = pilihAcakBerbobot(PILIHAN_PORSI, PELUANG_PORSI);
        const item = buatItemNota(menu, porsi, waktuPesan);
        // 30% pesanan menu bervarian diberi catatan, mis. "Less Sugar"
        if (menu.varian && angkaAcak() < 0.3) item.catatan = pilihAcak(menu.varian).nama;
        daftarItem.push(item);
      }
      const totalBayar = jumlahkanSubtotal(daftarItem);

      // (2) Status: hanya nota malam terakhir (15 Nov ≥ 19.00) yang masih bisa berjalan.
      let status = "Sudah Diterima";
      const masihBerjalan = kodeTanggal === KODE_HARI_TERAKHIR && waktuPesan >= waktuWita(2026, 11, 15, 19, 0);
      if (masihBerjalan) status = pilihAcak(["Sedang Diproses", "Siap Diambil", "Sudah Diterima"]);

      // (3) Kasir dan koki. Staf yang sudah berhenti hanya muncul di nota sebelum Oktober.
      const kasirYangBisa = semuaKasir.filter(function (u) { return u.aktif || sebelumOktober; });
      const kokiYangBisa = semuaKoki.filter(function (u) { return u.aktif || sebelumOktober; });
      const idKasir = pilihAcak(kasirYangBisa)._id;

      let idKoki = null;
      let kokiBelumDitentukan = false;
      if (status === "Sedang Diproses") kokiBelumDitentukan = angkaAcak() < 0.5; // separuh pesanan baru belum diambil dapur
      if (!kokiBelumDitentukan) idKoki = pilihAcak(kokiYangBisa)._id;

      // (4) Pembayaran. Tunai bisa dibayar uang pas atau uang lebih (dibulatkan ke pecahan).
      const metode = pilihAcakBerbobot(METODE_BAYAR, PELUANG_METODE);
      let jumlahDibayar = totalBayar;
      if (metode === "Tunai") {
        const pecahan = pilihAcakBerbobot(PECAHAN_UANG, PELUANG_PECAHAN);
        // contoh: total 66.000 dibayar dengan pecahan 50.000 → 2 lembar = 100.000
        if (pecahan > 0) jumlahDibayar = Math.ceil(totalBayar / pecahan) * pecahan;
      }

      // (5) Tipe pesanan: 65% makan di tempat.
      const tipePesanan = angkaAcak() < 0.65 ? "Makan di Tempat" : "Bawa Pulang";

      // (6) Pelanggan (pelanggan setia lebih sering terpilih).
      const idPelanggan = pilihAcakBerbobot(idSemuaPelanggan, bobotPelanggan);

      // (7) Susun dokumen nota.
      daftarTransaksi.push({
        _id: noNota,
        tanggal: waktuPesan,
        tipe_pesanan: tipePesanan,
        status: status,
        items: daftarItem,
        total_bayar: totalBayar,
        pembayaran: { metode: metode, jenis: jenisPembayaran(metode), jumlah_dibayar: jumlahDibayar, kembalian: jumlahDibayar - totalBayar },
        kasir: rujukanStaf(idKasir),
        koki: rujukanStaf(idKoki),
        pelanggan: rujukanPelanggan(idPelanggan),
        riwayat_status: buatRiwayatStatus(status, waktuPesan)
      });
    });
  }

  /* ===================================================================
   * BAGIAN 7. POIN PELANGGAN
   * Aturan loyalitas: 1 poin untuk setiap Rp10.000 belanja dari nota
   * yang sudah selesai (status "Sudah Diterima").
   * =================================================================== */
  daftarTransaksi.forEach(function (nota) {
    if (nota.status === "Sudah Diterima") {
      const poinDidapat = Math.floor(nota.total_bayar / 10000);
      pelangganBerdasarkanId[nota.pelanggan.id_pelanggan].poin += poinDidapat;
    }
  });

  /* ===================================================================
   * BAGIAN 8. SIMPAN KE DATABASE
   * deleteMany({}) hanya mengosongkan ISI koleksi; validator dan indeks
   * tetap ada. Kalau memakai drop(), koleksi beserta validatornya ikut
   * terhapus. Data disimpan per 1.000 dokumen agar tidak terlalu berat.
   * =================================================================== */
  function kosongkanLaluIsi(namaKoleksi, daftarDokumen) {
    const koleksi = kasirDb.getCollection(namaKoleksi);
    const hasilHapus = koleksi.deleteMany({});

    const UKURAN_KELOMPOK = 1000;
    for (let mulai = 0; mulai < daftarDokumen.length; mulai += UKURAN_KELOMPOK) {
      koleksi.insertMany(daftarDokumen.slice(mulai, mulai + UKURAN_KELOMPOK));
    }
    print("[" + namaKoleksi + "] dihapus " + hasilHapus.deletedCount +
          " -> disisipkan " + daftarDokumen.length +
          " -> countDocuments = " + koleksi.countDocuments({}));
  }

  kosongkanLaluIsi("pengguna", daftarPengguna);
  kosongkanLaluIsi("pelanggan", daftarPelanggan);
  kosongkanLaluIsi("menu", daftarMenu);
  kosongkanLaluIsi("transaksi", daftarTransaksi);

  print("\nRingkasan jumlah dokumen:");
  ["pengguna", "pelanggan", "menu", "transaksi"].forEach(function (nama) {
    print("  " + nama.padEnd(10) + ": " + kasirDb.getCollection(nama).countDocuments({}));
  });
  print("Contoh nota asli MySQL yang sudah dipindahkan:");
  printjson(kasirDb.transaksi.findOne({ _id: "TR1909202600001" }));
})();
