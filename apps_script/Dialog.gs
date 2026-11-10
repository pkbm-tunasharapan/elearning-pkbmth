// ============================================
// MESIN DIALOG BERTEMA
// ============================================
// Menggantikan SEMUA dialog bawaan (ui.alert, ui.prompt, dan alert/confirm/
// prompt bawaan browser di panel HTML) dengan satu tampilan bertema yang
// konsisten.
//
// KENAPA INI TIDAK SEKADAR SOAL TAMPILAN:
// Dialog bawaan Apps Script punya batas nyata yang selama ini menyusahkan -
// tidak bisa menampilkan tautan yang bisa diklik, tidak bisa memformat daftar
// error, memotong teks panjang, dan tombolnya cuma YES/NO/OK/CANCEL sehingga
// pertanyaan berbahaya ("Hapus semua draft?") terlihat persis sama dengan
// pertanyaan biasa. Dialog bertema di sini bisa menampilkan kartu statistik,
// daftar error yang bisa digulir, tautan langsung ke Classroom, dan tombol
// merah khusus untuk tindakan yang tidak bisa diurungkan.
//
// KENDALA TEKNIS YANG MENENTUKAN RANCANGAN INI:
// HtmlService.showModalDialog() TIDAK mengembalikan nilai - ia hanya
// menampilkan lalu kode lanjut jalan. Jadi pola lama:
//
//     var r = ui.alert('Yakin?', ui.ButtonSet.YES_NO);
//     if (r !== ui.Button.YES) return;      // <- menunggu jawaban
//     lakukanSesuatu();
//
// tidak bisa ditiru langsung. Karena itu setiap konfirmasi dipecah jadi dua:
// dialog membawa NAMA AKSI, lalu tombol "Ya" di dalam dialog memanggil
// runDialogAction() lewat google.script.run. Hasilnya digambar ulang di dalam
// dialog yang sama - jadi pengguna tidak melihat dialog beruntun.
//
// Nama aksi divalidasi lewat daftar putih di dialogActions_(); tidak ada
// pemanggilan fungsi sembarangan dari sisi klien.

// ============================================
// TAMPILKAN DIALOG
// ============================================
// config:
//   tone         'info' | 'success' | 'warning' | 'danger' | 'question'
//   icon         emoji di kepala dialog
//   title        judul
//   message      isi (baris baru dipertahankan)
//   stats        [{ label, value }]           - kartu angka
//   details      ['...', '...']               - daftar bergulir
//   detailsLabel judul daftar
//   links        [{ label, url }]             - tautan yang bisa diklik
//   inputs       [{ key, label, type, value, placeholder, hint, options, required }]
//   action       nama aksi (harus terdaftar di dialogActions_)
//   actionArgs   argumen tetap untuk aksi
//   confirmLabel teks tombol utama
//   cancelLabel  teks tombol batal
//   showCancel   tampilkan tombol batal (default: true kalau ada action)
//   width/height ukuran jendela

function showDialog_(config) {
  config = config || {};

  var template = HtmlService.createTemplateFromFile('DialogModal');

  // PERBAIKAN BUG "SEMUA DIALOG KOSONG":
  // Sebelumnya config di-stringify DI SINI, lalu di-stringify LAGI di dalam
  // template (`JSON.parse(<?= JSON.stringify(configJson) ?>)`). Dobel
  // stringify membuat JSON.parse mengembalikan sebuah STRING, bukan object -
  // sehingga setiap pembacaan cfg.title, cfg.message, cfg.action, dst.
  // menghasilkan undefined.
  //
  // Akibatnya render() jatuh ke semua nilai cadangannya: kepala berwarna biru
  // (default 'info'), ikon ℹ️ default, judul dan pesan KOSONG, dan tombol
  // bertuliskan 'Selesai' - persis tampilan yang terlihat di semua dialog.
  //
  // Sekarang JSON dicetak SEKALI sebagai literal JavaScript apa adanya.
  // Dicetak dengan <?!= ?> (force-print) - BUKAN <?= ?>, karena <?= ?>
  // menerapkan contextual escaping yang justru merusak literal JSON di dalam
  // blok <script>.
  //
  // Tanda '<' diubah jadi < supaya isi data yang kebetulan memuat
  // "</script>" tidak bisa menutup blok skrip lebih awal.
  template.configLiteral = JSON.stringify(config).replace(/</g, '\\u003c');

  // Overlay sibuk disuntikkan juga di sini. Dialog ini TIDAK lewat
  // panelHtml_() karena ia satu-satunya yang butuh mesin templat (untuk
  // mencetak configLiteral), jadi penyuntikannya harus dilakukan sesudah
  // template dievaluasi - bukan pada berkas mentahnya.
  var isi = template.evaluate().getContent();

  var suntikan = busyStub_();
  try {
    suntikan += '\n' + HtmlService.createHtmlOutputFromFile('BusyOverlay').getContent();
  } catch (e) {
    Logger.log('showDialog_: BusyOverlay tidak terbaca, memakai definisi kosong - ' + e.message);
  }

  var m = isi.match(/<body[^>]*>/i);
  if (m) {
    isi = isi.replace(m[0], m[0] + '\n' + suntikan);
  } else if (isi.indexOf('</body>') !== -1) {
    isi = isi.replace('</body>', function() { return suntikan + '\n</body>'; });
  } else {
    isi = suntikan + isi;
  }

  var html = HtmlService.createHtmlOutput(isi)
    .setWidth(config.width || estimateDialogWidth_(config))
    .setHeight(config.height || estimateDialogHeight_(config));

  SpreadsheetApp.getUi().showModalDialog(html, config.title || 'Classroom Master');
}

// Jendela modal Apps Script berukuran tetap - tidak bisa menyesuaikan diri
// dengan isinya. Kalau terlalu pendek, isi penting terpotong; kalau selalu
// tinggi, dialog satu kalimat terlihat kosong melompong. Jadi ukurannya
// diperkirakan dari isi.
function estimateDialogHeight_(config) {
  var h = 210; // kepala + tombol

  var message = String(config.message || '');
  if (message) {
    var lines = message.split('\n').length + Math.floor(message.length / 70);
    h += Math.min(lines * 20 + 16, 220);
  }

  if (config.stats && config.stats.length) h += 96;
  if (config.links && config.links.length) h += config.links.length * 34 + 14;

  if (config.inputs && config.inputs.length) {
    for (var i = 0; i < config.inputs.length; i++) {
      h += config.inputs[i].hint ? 92 : 74;
    }
  }

  if (config.details && config.details.length) {
    h += Math.min(config.details.length * 24 + 46, 260);
  }

  return Math.max(240, Math.min(h, 620));
}

function estimateDialogWidth_(config) {
  if (config.details && config.details.length) return 580;
  if (config.stats && config.stats.length >= 3) return 560;
  if (config.inputs && config.inputs.length) return 500;
  return 460;
}

// ============================================
// PEMBUNGKUS SINGKAT
// ============================================
// Pengganti langsung untuk ui.alert() di seluruh project.

function dialogInfo(title, message, extra) {
  showDialog_(mergeDialog_({ tone: 'info', icon: 'ℹ️', title: title, message: message }, extra));
}

function dialogSuccess(title, message, extra) {
  showDialog_(mergeDialog_({ tone: 'success', icon: '✅', title: title, message: message }, extra));
}

function dialogWarning(title, message, extra) {
  showDialog_(mergeDialog_({ tone: 'warning', icon: '⚠️', title: title, message: message }, extra));
}

function dialogError(title, message, extra) {
  showDialog_(mergeDialog_({ tone: 'danger', icon: '❌', title: title, message: message }, extra));
}

// Konfirmasi: tombol utama menjalankan `action`, hasilnya digambar ulang di
// dalam dialog yang sama.
function dialogConfirm(config) {
  showDialog_(mergeDialog_({
    tone: config.danger ? 'danger' : 'question',
    icon: config.icon || (config.danger ? '⚠️' : '❓'),
    confirmLabel: config.confirmLabel || 'Ya, Lanjutkan',
    showCancel: true
  }, config));
}

function mergeDialog_(base, extra) {
  if (!extra) return base;
  for (var k in extra) {
    if (extra.hasOwnProperty(k) && extra[k] !== undefined) base[k] = extra[k];
  }
  return base;
}

// ============================================
// TAMPILKAN HASIL OPERASI MASSAL
// ============================================
// Menggantikan showResult() versi teks polos di Helpers.gs. Angka ditampilkan
// sebagai kartu, daftar error jadi daftar bergulir yang bisa dibaca utuh -
// bukan dipotong "and 12 more errors" seperti dialog bawaan.

function buildResultDialog_(title, results, extra) {
  var stats = [
    { label: 'Total', value: results.total || 0 },
    { label: 'Berhasil', value: results.success || 0, tone: 'good' },
    { label: 'Gagal', value: results.failed || 0, tone: (results.failed ? 'bad' : '') }
  ];

  if (results.skipped) stats.push({ label: 'Dilewati', value: results.skipped });
  if (results.healed) stats.push({ label: 'Dipulihkan', value: results.healed, tone: 'good' });

  var tone = 'success', icon = '✅';
  if (results.failed > 0 && results.success > 0) { tone = 'warning'; icon = '⚠️'; }
  else if (results.failed > 0) { tone = 'danger'; icon = '❌'; }

  var message = results.failed > 0
    ? 'Sebagian gagal. Rincian penyebabnya ada di bawah.'
    : 'Semua berhasil diproses.';

  return mergeDialog_({
    tone: tone,
    icon: icon,
    title: title,
    message: message,
    stats: stats,
    details: results.errors && results.errors.length ? results.errors : null,
    detailsLabel: 'Rincian (' + ((results.errors || []).length) + ')'
  }, extra);
}

function dialogResult(title, results, extra) {
  showDialog_(buildResultDialog_(title, results, extra));
}

// ============================================
// DAFTAR PUTIH AKSI
// ============================================
// Hanya nama yang terdaftar di sini yang boleh dijalankan dari dialog.
// Dibuat sebagai FUNGSI (bukan var global) supaya isinya dievaluasi saat
// dipanggil - kalau ditulis sebagai object literal di tingkat global, ia bisa
// merujuk fungsi yang belum sempat didefinisikan, karena urutan pemuatan file
// di Apps Script tidak dijamin.
function dialogActions_() {
  return {
    // Kelas & Siswa
    'validasiKelas': doValidasiKelas,
    'validasiMateri': doValidasiMateri,
    'generateKodeAkses': doGenerateKodeAkses,
    'pastikanIdMateri': doPastikanIdMateri,

    // Web App
    'simpanUrlWebApp': simpanUrlWebApp,

    // Laporan
    'cetakRekapNilai': cetakRekapNilai
  };
}

// Dipanggil dari DialogModal.html saat tombol utama ditekan.
// inputs = { key: value } dari kolom isian di dialog (kalau ada).
// Mengembalikan config dialog baru untuk digambar ulang di tempat.
function runDialogAction(actionKey, actionArgs, inputs) {
  try {
    var actions = dialogActions_();
    var fn = actions[actionKey];

    if (typeof fn !== 'function') {
      return {
        tone: 'danger', icon: '❌', title: 'Aksi Tidak Dikenali',
        message: 'Aksi "' + actionKey + '" tidak terdaftar. Ini kemungkinan bug - ' +
                 'silakan laporkan beserta nama menu yang Anda klik.'
      };
    }

    var result = fn(inputs || {}, actionArgs || []);

    // Aksi boleh mengembalikan config dialog utuh. Kalau tidak, buatkan
    // tampilan sukses seadanya supaya pengguna tetap dapat umpan balik.
    if (!result || typeof result !== 'object') {
      return { tone: 'success', icon: '✅', title: 'Selesai', message: 'Proses selesai dijalankan.' };
    }
    return result;

  } catch (error) {
    Logger.log('runDialogAction("' + actionKey + '") gagal: ' + error.message);
    return {
      tone: 'danger', icon: '❌', title: 'Terjadi Kesalahan',
      message: error.message,
      details: error.stack ? String(error.stack).split('\n').slice(0, 8) : null,
      detailsLabel: 'Detail teknis'
    };
  }
}
