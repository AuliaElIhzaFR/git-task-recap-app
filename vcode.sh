#!/bin/bash

# Path ke direktori bot
BOT_DIR="/home/farizrafiqi/Projects/odoo-attendance-bot"

# Simpan direktori saat ini
ORIGINAL_DIR=$(pwd)

# Masuk ke direktori bot untuk menjalankan npm
cd "$BOT_DIR"

# 1. Jalankan Check-in Otomatis saat VS Code dibuka
echo "🎬 Memulai otomatisasi absensi..."
npm run automation -- checkin

# 2. Buka VS Code dan tunggu sampai ditutup
echo "💻 Membuka VS Code..."
# Gunakan path absolut ke binary asli untuk menghindari rekursi jika ada alias
/usr/bin/code --wait "$@"

# 3. Jalankan Check-out Otomatis saat VS Code ditutup
npm run automation -- checkout

echo "✅ Selesai."
