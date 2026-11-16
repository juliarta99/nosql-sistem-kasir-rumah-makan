#!/usr/bin/env bash
# =====================================================================
# dump.sh - membuat cadangan database ke folder dump/ dengan mongodump
#
# Cara pakai:
#   export URI="mongodb+srv://kelompok4.ca4kphx.mongodb.net/db_sistem_kasir"
#   export MONGO_USER="ngurahjuliarta27_db_user"
#   bash skrip/dump.sh
#
# Hasil: dump/db_sistem_kasir/*.bson (isi data) dan *.metadata.json
# (berisi validator dan indeks, jadi ikut terpulihkan saat mongorestore).
# =====================================================================
set -euo pipefail
: "${URI:?Variabel URI belum di-set}"

# Pastikan mongodump sudah terpasang. mongodump TIDAK ikut terpasang bersama
# mongosh; ia bagian dari paket terpisah "MongoDB Database Tools".
if ! command -v mongodump >/dev/null 2>&1; then
  echo "GALAT: perintah 'mongodump' tidak ditemukan."
  echo "Pasang dulu MongoDB Database Tools:"
  echo "  - Windows : unduh MSI dari https://www.mongodb.com/try/download/database-tools"
  echo "              lalu di Git Bash: export PATH=\"\$PATH:/c/Program Files/MongoDB/Tools/100/bin\""
  echo "  - macOS   : brew tap mongodb/brew && brew install mongodb-database-tools"
  echo "  - Ubuntu  : unduh paket .deb dari halaman di atas, lalu sudo apt install ./mongodb-database-tools-*.deb"
  echo "Cek dengan: mongodump --version"
  exit 1
fi

FOLDER_PROJEK="$(cd "$(dirname "$0")/.." && pwd)"

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
  OPSI_LOGIN=(--username="$MONGO_USER" --password="$MONGO_PASS")
fi

rm -rf "$FOLDER_PROJEK/dump"   # hapus cadangan lama supaya isinya selalu terbaru
mongodump --uri="$URI" ${OPSI_LOGIN[@]+"${OPSI_LOGIN[@]}"} --out="$FOLDER_PROJEK/dump"

echo "Selesai. Isi dump:"
find "$FOLDER_PROJEK/dump" -type f | sort
