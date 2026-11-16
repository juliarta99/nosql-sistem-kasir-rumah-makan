#!/usr/bin/env bash
# =====================================================================
# run_all.sh — menjalankan skrip 01 sampai 06 berurutan + menyimpan log
#
# Cara pakai (macOS / Linux / Git Bash di Windows):
#   export URI="mongodb+srv://kelompok4.ca4kphx.mongodb.net/db_sistem_kasir"
#   export MONGO_USER="ngurahjuliarta27_db_user"
#   bash skrip/run_all.sh
#
# Password ditanyakan SEKALI saat skrip mulai (tidak tampil di layar dan
# tidak disimpan ke berkas). Log seluruh keluaran disimpan ke folder bukti/.
# Untuk MongoDB lokal tanpa login: biarkan MONGO_USER kosong.
# =====================================================================

# Hentikan skrip bila ada perintah yang gagal (-e), variabel belum diisi (-u),
# atau bagian pipa (|) yang gagal (-o pipefail).
set -euo pipefail

# Wajib: variabel URI harus sudah diisi. Bila belum, tampilkan pesan lalu berhenti.
: "${URI:?Variabel URI belum di-set. Contoh: export URI=\"mongodb+srv://kelompok4.ca4kphx.mongodb.net/db_sistem_kasir\"}"

FOLDER_SKRIP="$(cd "$(dirname "$0")" && pwd)"   # lokasi folder skrip/
FOLDER_PROJEK="$(dirname "$FOLDER_SKRIP")"       # satu tingkat di atasnya
mkdir -p "$FOLDER_PROJEK/bukti"
BERKAS_LOG="$FOLDER_PROJEK/bukti/log_run_all_$(date +%Y%m%d_%H%M%S).txt"

# Siapkan opsi login. Bila MONGO_USER diisi, tanyakan password (read -s = tidak ditampilkan).
OPSI_LOGIN=()
if [ -n "${MONGO_USER:-}" ]; then
  if [ -z "${MONGO_PASS:-}" ]; then
    read -r -s -p "Password untuk $MONGO_USER (tempel dengan Shift+Insert / klik kanan, BUKAN Ctrl+V): " MONGO_PASS
    echo
  fi

  # Password tidak boleh kosong atau berisi karakter tak terlihat. Di Git Bash, Ctrl+V
  # TIDAK menempel teks, tetapi mengirim karakter tersembunyi (\u0016) sehingga login gagal.
  if [ -z "$MONGO_PASS" ]; then
    echo "GALAT: password kosong."
    exit 1
  fi
  if printf '%s' "$MONGO_PASS" | LC_ALL=C grep -q '[[:cntrl:]]'; then
    echo "GALAT: password berisi karakter tak terlihat (biasanya karena menempel dengan Ctrl+V di Git Bash)."
    echo "       Jalankan ulang, lalu tempel password dengan Shift+Insert atau klik kanan > Paste, atau ketik manual."
    exit 1
  fi
  OPSI_LOGIN=(--username "$MONGO_USER" --password "$MONGO_PASS")
fi

# Jalankan keenam skrip berurutan. Keluarannya tampil di layar sekaligus
# disalin ke berkas log oleh perintah "tee".
for SKRIP in 01_schema.js 02_seed.js 03_crud.js 04_aggregation.js 05_indeks_explain.js 06_pengujian.js; do
  echo ""
  echo "################ $SKRIP ################"
  # ${OPSI_LOGIN[@]+"${OPSI_LOGIN[@]}"} = pakai opsi login bila ada; bila kosong, tidak menambahkan apa-apa
  mongosh "$URI" ${OPSI_LOGIN[@]+"${OPSI_LOGIN[@]}"} --quiet --file "$FOLDER_SKRIP/$SKRIP"
done 2>&1 | tee "$BERKAS_LOG"

echo ""
echo "Log tersimpan di: $BERKAS_LOG"
