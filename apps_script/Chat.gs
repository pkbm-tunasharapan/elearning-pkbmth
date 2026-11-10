// ============================================
// CHATROOM PER-ROMBEL + STATUS ONLINE (SEMI REAL-TIME VIA POLLING)
// ============================================
// Apps Script tidak punya WebSocket, jadi "real-time" di sini berarti
// klien (Login.html) memanggil waPollRombel (lihat WebApp.gs) tiap
// beberapa detik lewat google.script.run. Satu panggilan itu SEKALIGUS:
//   1. menandai siswa yang polling sebagai "online" (tulis ke sheet
//      Kehadiran),
//   2. mengambil daftar siapa saja yang online di rombel yang sama, dan
//   3. mengambil pesan chat baru sejak waktu terakhir klien polling
// - supaya cukup SATU panggilan RPC per siklus polling, bukan tiga
// panggilan terpisah (penting karena tiap google.script.run adalah round
// trip jaringan tersendiri).
//
// Chat & Kehadiran keduanya di-scope per ID Rombel - TIDAK ada chat lintas
// rombel, sesuai konsep "kelas virtual pribadi" siswa.

// Menandai satu siswa sebagai aktif sekarang (dipanggil dari waPollRombel_
// dan waKirimChat_). Kalau baris Kehadiran untuk siswa ini sudah ada,
// TIMPA waktunya; kalau belum ada, tambah baris baru.
function tandaiOnline_(idRombel, nama) {
  var sheet = getSheet(CONFIG.SHEETS.KEHADIRAN);
  var values = sheet.getDataRange().getValues();
  var now = new Date();
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (String(row[0]) === String(idRombel) && row[1] === nama) {
      sheet.getRange(i + 1, 3).setValue(now);
      return;
    }
  }
  sheet.appendRow([idRombel, nama, now]);
}

// Daftar nama siswa yang sedang "online" di satu rombel - Waktu Terakhir
// Aktif masih dalam rentang CONFIG.AMBANG_ONLINE_MS dari sekarang.
function getDaftarOnlineRombel_(idRombel) {
  var sheet = getSheet(CONFIG.SHEETS.KEHADIRAN);
  var values = sheet.getDataRange().getValues();
  var now = Date.now();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (String(row[0]) !== String(idRombel)) continue;
    var waktu = row[2];
    var waktuMs = (waktu instanceof Date) ? waktu.getTime() : new Date(waktu).getTime();
    if (!isNaN(waktuMs) && (now - waktuMs) <= CONFIG.AMBANG_ONLINE_MS) {
      out.push(row[1]);
    }
  }
  out.sort();
  return out;
}

// Menyimpan satu pesan chat untuk satu rombel. Pesan dipotong ke panjang
// wajar supaya tidak ada yang iseng kirim teks raksasa yang memperlambat
// sheet Chat.
function waKirimChat_(idRombel, nama, pesan) {
  var teks = String(pesan == null ? '' : pesan).trim();
  if (!teks) return { sukses: false, pesan: 'Pesan tidak boleh kosong.' };
  if (teks.length > 500) teks = teks.substring(0, 500);
  var sheet = getSheet(CONFIG.SHEETS.CHAT);
  var now = new Date();
  sheet.appendRow([idRombel, nama, teks, now]);
  tandaiOnline_(idRombel, nama);
  return { sukses: true, waktu: now.getTime() };
}

// Dipanggil klien tiap siklus polling (lihat Login.html). sejakMs = waktu
// (epoch ms) pesan chat TERAKHIR yang sudah diterima klien - 0 kalau baru
// pertama kali polling di sesi ini, supaya server tahu pesan mana saja
// yang belum pernah dikirim ke klien ini.
function waPollRombel_(idRombel, nama, sejakMs) {
  tandaiOnline_(idRombel, nama);

  var chatSheet = getSheet(CONFIG.SHEETS.CHAT);
  var chatValues = chatSheet.getDataRange().getValues();
  var pesanBaru = [];
  var ambang = Number(sejakMs) || 0;
  for (var i = 1; i < chatValues.length; i++) {
    var row = chatValues[i];
    if (String(row[0]) !== String(idRombel)) continue;
    var waktu = row[3];
    var waktuMs = (waktu instanceof Date) ? waktu.getTime() : new Date(waktu).getTime();
    if (isNaN(waktuMs) || waktuMs <= ambang) continue;
    pesanBaru.push({ nama: row[1], pesan: row[2], waktu: waktuMs });
  }
  pesanBaru.sort(function(a, b) { return a.waktu - b.waktu; });

  return {
    online: getDaftarOnlineRombel_(idRombel),
    chatBaru: pesanBaru,
    sekarangMs: Date.now()
  };
}
