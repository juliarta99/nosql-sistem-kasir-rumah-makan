# =====================================================================
# run_all.ps1 - versi Windows PowerShell dari run_all.sh
#
# Cara pakai:
#   $env:URI = "mongodb+srv://kelompok4.ca4kphx.mongodb.net/db_sistem_kasir"
#   $env:MONGO_USER = "ngurahjuliarta27_db_user"
#   powershell -ExecutionPolicy Bypass -File skrip\run_all.ps1
#
# Password ditanyakan sekali (tidak tampil). Log disimpan ke folder bukti\.
# =====================================================================
$ErrorActionPreference = "Continue"   # pesan peringatan mongosh tidak dianggap galat fatal

if (-not $env:URI) {
  Write-Error 'Set dulu: $env:URI = "mongodb+srv://kelompok4.ca4kphx.mongodb.net/db_sistem_kasir"'
  exit 1
}

$folderSkrip  = Split-Path -Parent $MyInvocation.MyCommand.Path   # lokasi folder skrip\
$folderProjek = Split-Path -Parent $folderSkrip                    # satu tingkat di atasnya
New-Item -ItemType Directory -Force -Path "$folderProjek\bukti" | Out-Null
$berkasLog = "$folderProjek\bukti\log_run_all_$(Get-Date -Format yyyyMMdd_HHmmss).txt"

# Siapkan opsi login. Password dibaca sebagai SecureString lalu diubah ke teks biasa untuk mongosh.
$opsiLogin = @()
if ($env:MONGO_USER) {
  $passwordAman = Read-Host "Password untuk $($env:MONGO_USER)" -AsSecureString
  $password = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($passwordAman))
  $opsiLogin = @("--username", $env:MONGO_USER, "--password", $password)
}

$daftarSkrip = "01_schema.js", "02_seed.js", "03_crud.js", "04_aggregation.js", "05_indeks_explain.js", "06_pengujian.js"

# Jalankan berurutan; Tee-Object menampilkan keluaran sekaligus menyimpannya ke log.
& {
  foreach ($skrip in $daftarSkrip) {
    ""
    "################ $skrip ################"
    & mongosh $env:URI @opsiLogin --quiet --file "$folderSkrip\$skrip" 2>&1
  }
} | Tee-Object -FilePath $berkasLog

""
"Log tersimpan di: $berkasLog"
