// ============================================================
// KURIKULUM PER MAPEL: RENCANA SESI DARI PDF (meniru JSON kurikulum Master Control V1)
// ------------------------------------------------------------
// Di Master Control, buku siswa dibaca Gemini SEKALI untuk menyusun JSON kurikulum per mapel+kelas:
//   semester > bab > minggu (= satu sesi): topik_materi, halaman, narasi_pengantar, isi_materi_lengkap, pertanyaan_diskusi.
// Kode TIDAK memotong PDF; ia mengambil baris minggu yang sesuai untuk tiap sesi.
// Di sini sama, dengan perbedaan: nomor sesi diulang per semester dan sesi UTS/UAS tidak diberi materi
// (default 16 sesi materi per semester = 18 sesi dikurangi UTS dan UAS).
//
//  Tahap 1 (sekali per mapel): unggah Buku Siswa (+ Panduan Mapel bila ada) -> rencana Semester 1 dan 2
//          (satu panggilan Gemini per semester) -> bacaan lengkap + bank soal ujian per sesi (5 sesi per panggilan).
//          Disimpan di sheet "Kurikulum"; tutor boleh mengubah tiap sesi.
//  Tahap 3: bank soal tiap sesi (10 soal pilihan ganda A-E, tingkat mudah/sedang/sulit) dirakit menjadi Draft UTS/UAS:
//          50 soal, opsi A-D untuk Paket A dan A-E untuk paket lain, komposisi kesulitan dipilih tutor (waStafKurikulumRakitUjian).
//  Tahap 2: dari rencana dibuat Draft Materi ("Sesi N: topik" berisi narasi, rujukan halaman, tujuan, bacaan lengkap)
//          dan Draft Diskusi pada sesi yang sesuai. Tutor meninjau lalu menekan Post (alur lama).
// Kunci Gemini tetap hanya di server. Satu panggilan server = satu langkah kecil agar jauh di bawah batas 6 menit.
// ============================================================

var KUR = {
  SHEET: 'Kurikulum',
  HEADERS: ['ID Mapel', 'Semester', 'Minggu', 'Bab', 'Judul Bab', 'Topik', 'Halaman', 'Tujuan Pembelajaran', 'Narasi Pengantar',
    'Pertanyaan Diskusi', 'Bacaan Lengkap', 'ID Materi', 'ID Diskusi', 'Buku Acuan', 'Diperbarui', 'Oleh', 'Bank Soal'],
  K: { mapel: 0, smt: 1, minggu: 2, bab: 3, judulBab: 4, topik: 5, halaman: 6, tp: 7, narasi: 8, tanya: 9, bacaan: 10, idMateri: 11, idDiskusi: 12, buku: 13, waktu: 14, oleh: 15, bank: 16 },
  PER_BACAAN: 5,        // sesi per panggilan bacaan + bank soal (jawabannya panjang; dikecilkan klien bila waktu habis)
  PER_PETA: 16,         // sesi per panggilan penyusunan rencana; klien mengecilkan otomatis bila waktu habis
  PER_BACAAN_MANUAL: 5, // sesi per prompt bacaan + bank soal pada mode manual (jawaban Gemini web tetap muat dalam satu pesan)
  PER_SOAL: 8,          // sesi per panggilan 'soal saja' (mode otomatis; masukan berupa teks bacaan, bukan PDF)
  PER_SOAL_MANUAL: 6,
  SOAL_PER_SESI: 10,    // bank soal per sesi: 3 mudah, 4 sedang, 3 sulit, masing-masing 5 opsi (A-E)
  MIN_SOAL_BANK: 5,     // bank sesi dianggap ada bila memuat paling sedikit sekian soal valid
  MAKS_SOAL_BANK: 14,
  UJIAN_JUMLAH: 50,     // UTS/UAS: 50 pilihan ganda
  UJIAN_KOMPOSISI: { mudah: 15, sedang: 25, sulit: 10 },
  MAKS_TEKS_IMPOR: 600000,  // total karakter hasil yang ditempel/diunggah pada mode manual
  MAKS_BERKAS_IMPOR: 12,
  PIKIR: 'low',         // tingkat thinking Gemini untuk tugas ini
  MIN_BACAAN: 200,
  MAKS_BACAAN: 24000,
  MAKS_TOPIK: 160,
  MAKS_NARASI: 700,
  MAKS_TANYA: 1500,
  MAKS_TP: 6,
  BAGIAN_MB: 40,        // buku besar dipecah di browser menjadi bagian <= 40 MB
  BAGIAN_HALAMAN: 500,  // dan <= 500 halaman per bagian
  MAKS_TOTAL_MB: 200,   // batas total buku yang diterima
  MAKS_BAGIAN: 8,
  PETUNJUK_DISKUSI: 'Tulis tanggapan Anda minimal 150 kata, lalu cantumkan minimal 3 tautan sumber berita yang relevan dengan topik ini.'
};

// ---------- sheet & pemetaan sesi ----------
function kurSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(KUR.SHEET);
  if (!sh) {
    sh = ss.insertSheet(KUR.SHEET);
    sh.getRange(1, 1, 1, KUR.HEADERS.length).setValues([KUR.HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  } else {
    // sheet lama (16 kolom): tambahkan judul kolom Bank Soal bila belum ada
    var jud = sh.getRange(1, KUR.HEADERS.length, 1, 1).getValues()[0][0];
    if (!String(jud === undefined || jud === null ? '' : jud).trim()) sh.getRange(1, KUR.HEADERS.length, 1, 1).setValues([[KUR.HEADERS[KUR.HEADERS.length - 1]]]).setFontWeight('bold');
  }
  return sh;
}

// Nomor sesi (dalam semester) yang boleh berisi materi: semua sesi biasa, bukan UTS/UAS.
function kurDaftarNomorMateri_(cfg) {
  var out = [];
  for (var n = 1; n <= cfg.sesiPerSemester; n++) if (taJenis_(cfg, n) === 'Biasa') out.push(n);
  return out;
}

// ---------- bank soal per sesi ----------
function kurPaket_(namaRombel) {
  var m = String(namaRombel || '').match(/([ABC])\s*-?\s*\d{1,2}/i);
  return m ? m[1].toUpperCase() : '';
}

function kurTingkat_(t) {
  var x = String(t === undefined || t === null ? '' : t).toLowerCase();
  if (/mudah|easy|gampang/.test(x)) return 'mudah';
  if (/sulit|hard|susah/.test(x)) return 'sulit';
  return 'sedang';
}

// Memeriksa daftar soal dari AI/hasil tempel. Soal valid: ada pertanyaan, minimal 4 opsi, kunci menunjuk opsi yang ada.
// Bila kunci jawaban satu sesi menumpuk di satu huruf (mis. semua A), posisi opsi diacak. Soal berpilihan 'semua/tidak ada/A dan B' tidak diacak.
function kurAcakKunci_(out) {
  if (out.length < 4) return out;
  var hit = {}, maks = 0;
  out.forEach(function(q) { hit[q.kunci] = (hit[q.kunci] || 0) + 1; if (hit[q.kunci] > maks) maks = hit[q.kunci]; });
  if (maks / out.length < 0.6) return out;
  var terlarang = /(semua|tidak ada|seluruh).{0,20}(benar|salah|di atas|jawaban)|\b[A-E]\s+(dan|dan\/atau|atau)\s+[A-E]\b|benar semua|salah semua/i;
  out.forEach(function(q) {
    var huruf = Object.keys(q.opsi).sort();
    var teks = huruf.map(function(h) { return q.opsi[h]; });
    if (teks.some(function(x) { return terlarang.test(x); })) return;
    var benar = q.opsi[q.kunci];
    var lain = teks.filter(function(x) { return x !== benar; });
    for (var i = lain.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var tmp = lain[i]; lain[i] = lain[j]; lain[j] = tmp; }
    var tujuan = Math.floor(Math.random() * huruf.length), baru = {}, k = 0;
    huruf.forEach(function(h, idx) { baru[h] = idx === tujuan ? benar : lain[k++]; });
    q.opsi = baru; q.kunci = huruf[tujuan];
  });
  return out;
}

function kurBersihSoal_(daftar) {
  if (!Array.isArray(daftar)) return [];
  var out = [];
  daftar.forEach(function(s) {
    if (!s || typeof s !== 'object') return;
    var tanya = aiTeks_(s.pertanyaan, KM.MAKS_TEKS_SOAL);
    var masuk = s.opsi || {};
    if (Array.isArray(masuk)) { var o2 = {}; masuk.forEach(function(t, i) { if (i < KM.HURUF_OPSI.length) o2[KM.HURUF_OPSI[i]] = t; }); masuk = o2; }
    var opsi = {}, n = 0;
    KM.HURUF_OPSI.forEach(function(h) {
      var t = aiTeks_(masuk[h], KM.MAKS_TEKS_OPSI).replace(/^[A-Ea-e][\.\)]\s+/, '');
      if (t) { opsi[h] = t; n++; }
    });
    var kunci = String(s.kunci === undefined || s.kunci === null ? '' : s.kunci).trim().toUpperCase().charAt(0);
    if (!tanya || n < 4 || !opsi.hasOwnProperty(kunci)) return;
    out.push({ pertanyaan: tanya, opsi: opsi, kunci: kunci, tingkat: kurTingkat_(s.tingkat) });
  });
  return kurAcakKunci_(out.slice(0, KUR.MAKS_SOAL_BANK));
}

function kurBacaBank_(sel) {
  var t = sTeks_(sel).trim();
  if (!t) return [];
  try { return kurBersihSoal_(JSON.parse(t)); } catch (e) { return []; }
}

function kurRingkasBank_(bank) {
  var r = { jumlah: bank.length, mudah: 0, sedang: 0, sulit: 0 };
  bank.forEach(function(x) { r[x.tingkat]++; });
  return r;
}

function kurWaktu_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'); }

function kurBarisKeObjek_(v, idx) {
  var K = KUR.K;
  return {
    baris: idx + 1,
    smt: Number(v[K.smt]) || 0, minggu: Number(v[K.minggu]) || 0,
    bab: sTeks_(v[K.bab]).trim(), judulBab: sTeks_(v[K.judulBab]).trim(), topik: sTeks_(v[K.topik]).trim(),
    halaman: sTeks_(v[K.halaman]).trim(), tp: bersihCite_(sTeks_(v[K.tp])), narasi: bersihCite_(sTeks_(v[K.narasi])), tanya: bersihCite_(sTeks_(v[K.tanya])),
    bacaan: bersihCite_(sTeks_(v[K.bacaan])), idMateri: sTeks_(v[K.idMateri]).trim(), idDiskusi: sTeks_(v[K.idDiskusi]).trim(),
    buku: sTeks_(v[K.buku]).trim(),
    bank: kurBacaBank_(v[K.bank])
  };
}

function kurBaca_(idMapel) {
  var v = kurSheet_().getDataRange().getValues();
  var out = [];
  for (var i = 1; i < v.length; i++) {
    if (sTeks_(v[i][KUR.K.mapel]).trim() !== String(idMapel)) continue;
    var o = kurBarisKeObjek_(v[i], i);
    if (o.smt >= 1 && o.minggu >= 1) out.push(o);
  }
  out.sort(function(a, b) { return (a.smt - b.smt) || (a.minggu - b.minggu); });
  return out;
}

function kurHapusBaris_(idMapel, hanyaSmt) {
  var sh = kurSheet_();
  var v = sh.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) {
    if (sTeks_(v[i][KUR.K.mapel]).trim() !== String(idMapel)) continue;
    if (hanyaSmt && Number(v[i][KUR.K.smt]) !== hanyaSmt) continue;
    sh.deleteRow(i + 1);
  }
}

function kurIdItemAda_() {
  var m = kmMateri_();
  var v = m.sheet.getDataRange().getValues();
  var peta = {};
  for (var i = 1; i < v.length; i++) {
    var id = sTeks_(v[i][m.c.id - 1]).trim();
    if (id) peta[id] = sTeks_(v[i][m.c.status - 1]).trim() || 'Draft';
  }
  return peta;
}

// Referensi Buku Siswa boleh satu file atau daftar bagian berurutan (buku besar dipecah di browser).
function kurDaftarRefBuku_(ref) {
  var daftar = Array.isArray(ref) ? ref : (ref ? [ref] : []);
  if (!daftar.length) throw new Error('Referensi Buku Siswa tidak valid. Unggah ulang PDF-nya.');
  if (daftar.length > KUR.MAKS_BAGIAN) throw new Error('Buku terlalu besar (maksimal ' + KUR.MAKS_BAGIAN + ' bagian). Gunakan PDF yang lebih ringkas.');
  daftar.forEach(function(x) {
    if (!aiRefFileValid_(x)) throw new Error('Referensi Buku Siswa tidak valid. Unggah ulang PDF-nya.');
  });
  return daftar;
}

function kurCatatBagian_(bagian) {
  if (!bagian || bagian < 2) return '';
  return 'Buku Siswa dikirim sebagai ' + bagian + ' file PDF BERURUTAN (file 1 = bagian awal buku, file ' + bagian + ' = bagian akhir). Semuanya bersama-sama membentuk SATU buku utuh; ' +
    'anggap sebagai satu buku yang berkesinambungan dan tetap gunakan nomor halaman yang tercetak pada halaman buku.\n\n';
}

// ---------- baca (untuk layar tutor) ----------
function waStafKurikulumBaca(token, idMapel) {
  var ctx = wajibMapel_(token, idMapel);
  var cfg = taBaca_();
  var now = new Date().getTime();
  var nomor = kurDaftarNomorMateri_(cfg);
  var status = kurIdItemAda_();
  var rows = kurBaca_(idMapel).map(function(r) {
    var n = nomor[r.minggu - 1] || 0;
    var info = n ? taInfo_(cfg, r.smt, n, now) : null;
    return {
      smt: r.smt, minggu: r.minggu, n: n, nama: n ? taNama_(r.smt, n) : '',
      label: info ? info.label : '', statusSesi: info ? info.status : '',
      bab: r.bab, judulBab: r.judulBab, topik: r.topik, halaman: r.halaman,
      tp: r.tp, narasi: r.narasi, tanya: r.tanya, bacaan: r.bacaan,
      adaBacaan: r.bacaan.length >= KUR.MIN_BACAAN,
      soal: r.bank, adaSoal: r.bank.length >= KUR.MIN_SOAL_BANK,
      statusMateri: r.idMateri ? (status[r.idMateri] || '') : '',
      statusDiskusi: r.idDiskusi ? (status[r.idDiskusi] || '') : '',
      buku: r.buku
    };
  });
  return {
    mapel: ctx.m.namaMapel, rombel: ctx.m.namaRombel, jumlahMinggu: nomor.length, sesiPerSemester: cfg.sesiPerSemester,
    uts: cfg.uts, uas: cfg.uas, rows: rows, siapAi: !!aiKunci_(), maksMB: Math.floor(AI.MAKS_BYTE_PDF / 1048576),
    maksTotalMB: KUR.MAKS_TOTAL_MB, bagianMB: KUR.BAGIAN_MB, bagianHalaman: KUR.BAGIAN_HALAMAN,
    perPeta: KUR.PER_PETA, perBacaan: KUR.PER_BACAAN, perBacaanManual: KUR.PER_BACAAN_MANUAL,
    minBacaan: KUR.MIN_BACAAN,
    perSoal: KUR.PER_SOAL, perSoalManual: KUR.PER_SOAL_MANUAL, soalPerSesi: KUR.SOAL_PER_SESI,
    paket: kurPaket_(ctx.m.namaRombel), maksOpsi: kurPaket_(ctx.m.namaRombel) === 'A' ? 4 : 5,
    ujianJumlah: KUR.UJIAN_JUMLAH, komposisi: KUR.UJIAN_KOMPOSISI
  };
}

// ---------- prompt tersembunyi ----------
function kurPromptDasar_(mapel) {
  var j = aiJenjang_(mapel.namaRombel);
  var kelasTeks = j.fase ? ('Fase ' + j.fase + ', Kelas ' + j.kelas) : mapel.namaRombel;
  return 'Anda adalah ahli penyusunan kurikulum mata pelajaran ' + mapel.namaMapel + ' untuk jenjang ' + j.tingkat +
    ' (Kurikulum Merdeka, pendekatan Pembelajaran Mendalam, ' + kelasTeks + ') sekaligus memahami pembelajaran Pendidikan Kesetaraan (PKBM). ' +
    'Warga belajar umumnya dewasa atau sudah bekerja dan belajar mandiri lewat aplikasi, sehingga bahasa harus jelas, ramah, dan dekat dengan kehidupan sehari-hari. ' +
    'Gunakan HANYA isi dokumen terlampir sebagai sumber fakta. Jangan mengarang halaman, angka, nama, rumus, atau kutipan. Tulis dalam bahasa Indonesia.\n\n';
}

function kurPromptPeta_(mapel, smt, jumlah, adaPanduan, sebelumnya, judulBuku, catatan, bagian, dari, sampai, iniSebelum, web) {
  dari = dari || 1; sampai = sampai || jumlah;
  var sebagian = dari > 1 || sampai < jumlah;
  var lampiran = adaPanduan
    ? 'Lampiran: (1) Buku Siswa' + (judulBuku ? ' "' + judulBuku + '"' : '') + ' dan (2) Panduan Mata Pelajaran resmi. Panduan dipakai untuk Capaian Pembelajaran dan Tujuan Pembelajaran (TP): bila memuat tabel Alur Tujuan Pembelajaran (biasanya bagian D.2), pakai nomor dan bunyi TP resmi apa adanya; jangan membuat skema penomoran sendiri.\n\n'
    : 'Lampiran: Buku Siswa' + (judulBuku ? ' "' + judulBuku + '"' : '') + '. Tidak ada Panduan; turunkan tujuan pembelajaran singkat sendiri dari isi buku.\n\n';
  // Kerangka CP-TP-ATP yang disetujui admin (Kerangka.gs) menggantikan Panduan: TP resmi diberikan langsung dalam prompt.
  var kf = (typeof kfBlokPrompt_ === 'function') ? kfBlokPrompt_(mapel) : '';
  if (kf) lampiran = 'Lampiran: Buku Siswa' + (judulBuku ? ' "' + judulBuku + '"' : '') + (adaPanduan ? ' dan Panduan Mata Pelajaran' : '') + '.\n\n' + kf;
  var bagi = smt === 1
    ? 'Buku ini dipakai selama satu tahun ajaran (2 semester). Susun HANYA SEMESTER 1, yaitu bagian AWAL buku, kira-kira separuh isi buku, dibagi logis berdasarkan urutan bab.\n'
    : 'Buku ini dipakai selama satu tahun ajaran (2 semester). Semester 1 sudah tersusun (lihat daftar di bawah). Susun HANYA SEMESTER 2: mulai tepat setelah halaman terakhir Semester 1 dan cakup SISA isi buku sampai akhir.\n';
  var daftarSebelum = '';
  if (smt === 2 && sebelumnya && sebelumnya.length) {
    daftarSebelum = 'SEMESTER 1 YANG SUDAH TERSUSUN (jangan diulang):\n' + sebelumnya.map(function(r) {
      return '- Sesi ' + r.minggu + ': ' + r.topik + (r.halaman ? ' (hlm ' + r.halaman + ')' : '');
    }).join('\n') + '\n\n';
  }
  var daftarIni = '';
  if (iniSebelum && iniSebelum.length) {
    daftarIni = 'SESI SEMESTER ' + smt + ' YANG SUDAH TERSUSUN (lanjutkan tepat setelah ini, jangan diulang):\n' + iniSebelum.map(function(r) {
      return '- Sesi ' + r.minggu + ': ' + r.topik + (r.halaman ? ' (hlm ' + r.halaman + ')' : '');
    }).join('\n') + '\n\n';
  }
  var catat = aiBersihCatatan_(catatan);
  var jatah = sebagian
    ? 'Satu minggu = satu sesi belajar. Semester ini seluruhnya terdiri dari ' + jumlah + ' sesi (sesi ujian tengah/akhir semester TIDAK termasuk, sudah dipisah). ' +
      'Pada langkah ini tulis HANYA sesi ' + dari + ' sampai ' + sampai + ' (TEPAT ' + (sampai - dari + 1) + ' sesi), bernomor ' + dari + ' sampai ' + sampai + '. ' +
      (sampai < jumlah
        ? 'Jangan menghabiskan seluruh cakupan semester pada sesi-sesi ini: sisakan bagian akhirnya untuk sesi ' + (sampai + 1) + ' sampai ' + jumlah + '.\n'
        : 'Ini bagian terakhir, jadi cakup sampai akhir cakupan semester ini.\n')
    : 'Satu minggu = satu sesi belajar. Susun TEPAT ' + jumlah + ' sesi bernomor 1 sampai ' + jumlah + ' pada semester ini (sesi ujian tengah/akhir semester TIDAK termasuk, sudah dipisah).\n';
  return kurPromptDasar_(mapel) + (web ? kurAwalanWeb_() : '') + lampiran + kurCatatBagian_(bagian) + bagi + jatah + kurAturanJumlahSesi_(jumlah, sampai === jumlah) +
    'Kelompokkan sesi ke dalam bab mengikuti DAFTAR ISI buku: nomor bab dan judul bab harus persis seperti yang tercetak di buku, dan sesi pindah ke bab baru tepat ketika topiknya sudah masuk bab berikutnya di daftar isi. DILARANG memasukkan semua sesi ke satu bab; tiap sesi memakai nomor dan judul bab tempat topiknya berada. Isi hanya satu semester yang diminta dan jangan menambahkan semester lain di jawaban. Satu sesi = satu sub-topik yang bisa dipelajari mandiri dalam seminggu; bab yang besar dipecah ke beberapa sesi, bab yang kecil boleh digabung.\n\n' +
    daftarSebelum + daftarIni + kurSpesifikasiSesi_() +
    kurFormatKeluaran_(web, '{"buku_acuan":"...","semester_' + smt + '":' + kurSkemaSemester_(smt) + '}') +
    (catat ? '\n\nCatatan tambahan dari tutor (ikuti selama tidak bertentangan dengan isi dokumen): ' + catat : '');
}

// ---- potongan prompt yang dipakai bersama (mode otomatis dan mode manual) ----
function kurSpesifikasiSesi_() {
  return 'UNTUK TIAP SESI ISI:\n' +
    '- topik_materi: judul sesi yang singkat dan jelas (maksimal 100 karakter).\n' +
    '- halaman: rentang halaman yang dibahas, memakai nomor halaman yang TERCETAK pada buku (bukan urutan halaman PDF bila berbeda), contoh "12-25". Bila benar-benar tidak diketahui, isi "".\n' +
    '- tujuan_pembelajaran: 1 sampai 3 butir (nomor dan bunyi TP bila ada Panduan).\n' +
    '- narasi_pengantar: 1 sampai 2 kalimat pengantar yang dikaitkan dengan pengalaman warga belajar dewasa.\n' +
    '- pertanyaan_diskusi_elearning: SATU pertanyaan reflektif/analitis untuk forum diskusi sesi itu, yang berkaitan dengan peristiwa atau isu terkini sehingga warga belajar dapat mencari berita yang relevan sebagai sumber. Bukan pertanyaan ya/tidak.\n\n';
}

function kurSkemaSemester_(smt) {
  return '{"semester":' + smt + ',"bab_list":[{"bab":1,"judul_bab":"...","minggu_list":[{"minggu":1,"topik_materi":"...","halaman":"12-25","tujuan_pembelajaran":["..."],"narasi_pengantar":"...","pertanyaan_diskusi_elearning":"..."}]}]}';
}

// Aturan wajib jumlah sesi per semester. akhir=true bila prompt ini mencakup sesi terakhir semester (ada sesi pendalaman).
function kurAturanJumlahSesi_(jumlah, akhir) {
  return 'ATURAN JUMLAH SESI (WAJIB): jumlah sesi tiap semester harus TEPAT ' + jumlah + ', tidak boleh kurang dan tidak boleh lebih. ' +
    'Bagi isi buku secara SEIMBANG menurut banyaknya materi antara Semester 1 dan Semester 2, jangan menghabiskan buku di Semester 1 sehingga Semester 2 kekurangan sesi. ' +
    'Bila materi bagian ini sedikit sehingga topik lebih sedikit daripada jumlah sesi, JANGAN mengurangi jumlah sesi: pecah satu bab atau topik menjadi 2 sampai 3 sesi menurut aspek, yaitu (a) konsep dan definisi, (b) contoh dan penerapan, (c) latihan dan ringkasan. Tiap sesi hasil pecahan wajib punya topik_materi yang berbeda dan jelas (misalnya "Lompat Jauh: Konsep dan Aturan", lalu "Lompat Jauh: Contoh dan Penerapan"). ' +
    'Semua sesi hanya berupa bacaan dan soal pilihan ganda. DILARANG membuat sesi tugas praktik, video, jurnal, atau portofolio, dan DILARANG membuat sesi kosong atau pengulangan persis dari topik yang sama.\n' +
    (akhir ? 'Dua sesi terakhir semester ini berupa PENDALAMAN: ringkasan dan latihan atas materi semester ini; awali topik_materi dengan "Pendalaman: " dan isi halaman dengan rentang halaman bab terakhir semester ini.\n' : '') + '\n';
}

function kurPagar_() { return String.fromCharCode(96, 96, 96); }

function kurFormatKeluaran_(web, skema) {
  if (web) {
    return 'FORMAT KELUARAN: tulis HANYA SATU blok kode ' + kurPagar_() + 'json yang berisi satu objek JSON valid, tanpa penjelasan sebelum atau sesudahnya. ' +
      'Di dalam string jangan ada baris baru mentah (tulis \\n) dan jangan ada tanda kutip ganda yang belum di-escape. Semua teks berupa string biasa tanpa markdown. ' +
      'ATURAN TAMBAHAN: jangan sertakan penanda sumber atau kutipan apa pun seperti [cite: ...] di dalam teks; kunci jawaban soal harus bervariasi antara A sampai E (jangan semua A, sebarkan secara acak); setiap soal wajib punya lima opsi A, B, C, D, E; dan penulisan opsi harus berbentuk "A":"teks" (pakai titik dua, bukan koma). Skema:\n' + skema;
  }
  return 'FORMAT KELUARAN: balas HANYA dengan satu objek JSON valid (tanpa pagar kode markdown, tanpa penjelasan). Semua teks berupa string biasa tanpa markdown. Skema:\n' + skema;
}

// Awalan khusus Gemini web: PDF dilampirkan manual oleh tutor, jadi minta dibaca utuh.
function kurAwalanWeb_() {
  return 'Baca SELURUH halaman file PDF yang saya lampirkan pada percakapan ini (jangan hanya sebagian) sebelum menjawab.\n\n';
}

// Satu prompt untuk dua semester sekaligus (mode manual).
function kurPromptPetaDua_(mapel, jumlah, adaPanduan, judulBuku, catatan) {
  var lampiran = adaPanduan
    ? 'Lampiran: (1) Buku Siswa' + (judulBuku ? ' "' + judulBuku + '"' : '') + ' dan (2) Panduan Mata Pelajaran resmi. Panduan dipakai untuk Capaian Pembelajaran dan Tujuan Pembelajaran (TP): bila memuat tabel Alur Tujuan Pembelajaran (biasanya bagian D.2), pakai nomor dan bunyi TP resmi apa adanya; jangan membuat skema penomoran sendiri.\n\n'
    : 'Lampiran: Buku Siswa' + (judulBuku ? ' "' + judulBuku + '"' : '') + '. Tidak ada Panduan; turunkan tujuan pembelajaran singkat sendiri dari isi buku.\n\n';
  var kf = (typeof kfBlokPrompt_ === 'function') ? kfBlokPrompt_(mapel) : '';
  if (kf) lampiran = 'Lampiran: Buku Siswa' + (judulBuku ? ' "' + judulBuku + '"' : '') + (adaPanduan ? ' dan Panduan Mata Pelajaran' : '') + '.\n\n' + kf;
  var catat = aiBersihCatatan_(catatan);
  return kurPromptDasar_(mapel) + kurAwalanWeb_() + lampiran +
    'Buku ini dipakai selama satu tahun ajaran (2 semester). Susun SEMESTER 1 dan SEMESTER 2 sekaligus. Semester 1 = bagian AWAL buku, kira-kira separuh isi buku, dibagi logis berdasarkan urutan bab. ' +
    'Semester 2 = SISA isi buku sampai akhir, dimulai tepat setelah halaman terakhir Semester 1 (jangan ada bagian yang diulang atau terlewat).\n' +
    'Satu minggu = satu sesi belajar. Tiap semester berisi TEPAT ' + jumlah + ' sesi bernomor 1 sampai ' + jumlah + ' (sesi ujian tengah/akhir semester TIDAK termasuk, sudah dipisah). ' +
    'Tulis ringkas agar seluruh jawaban muat dalam satu pesan.\n' + kurAturanJumlahSesi_(jumlah, true) +
    'Kelompokkan sesi ke dalam bab mengikuti DAFTAR ISI buku: nomor bab dan judul bab harus persis seperti yang tercetak di buku, dan sesi pindah ke bab baru tepat ketika topiknya sudah masuk bab berikutnya di daftar isi. DILARANG memasukkan semua sesi ke satu bab; tiap sesi memakai nomor dan judul bab tempat topiknya berada. Isi hanya satu semester yang diminta dan jangan menambahkan semester lain di jawaban. Satu sesi = satu sub-topik yang bisa dipelajari mandiri dalam seminggu; bab yang besar dipecah ke beberapa sesi, bab yang kecil boleh digabung.\n\n' +
    kurSpesifikasiSesi_() +
    kurFormatKeluaran_(true, '{"buku_acuan":"...","semester_1":' + kurSkemaSemester_(1) + ',"semester_2":' + kurSkemaSemester_(2) + '}') +
    (catat ? '\n\nCatatan tambahan dari tutor (ikuti selama tidak bertentangan dengan isi dokumen): ' + catat : '');
}

// Ketentuan bank soal (dipakai prompt bacaan dan prompt 'soal saja').
function kurSpesifikasiSoal_(dariBacaanSendiri) {
  return 'BANK SOAL UJIAN untuk tiap sesi: susun TEPAT ' + KUR.SOAL_PER_SESI + ' soal pilihan ganda, hanya dari ' + (dariBacaanSendiri ? 'bacaan yang Anda tulis untuk sesi itu' : 'bacaan sesi itu di bawah') + ' (bukan dari sesi lain).\n' +
    '- Tingkat kesulitan (isi kolom "tingkat"): 3 soal "mudah" (mengingat/memahami), 4 soal "sedang" (menerapkan), 3 soal "sulit" (menganalisis/mengevaluasi).\n' +
    '- Tiap soal punya TEPAT 5 opsi: A, B, C, D, E. Hanya satu yang paling benar. Kunci jawaban disebar merata di A sampai E.\n' +
    '- Pengecoh harus masuk akal dan setara panjangnya dengan jawaban benar. Jangan memakai "semua benar", "tidak ada yang benar", dan jangan ada opsi yang merujuk opsi lain (mis. "A dan B benar"), karena urutan opsi akan diacak.\n' +
    '- Soal harus bisa dijawab tanpa membaca bacaan: jangan menulis "berdasarkan bacaan" atau merujuk gambar, tabel, atau halaman.\n' +
    '- pertanyaan maksimal 300 karakter; tiap opsi maksimal 150 karakter, tanpa awalan huruf seperti "A.".\n';
}

function kurSkemaSoal_() {
  return '"soal":[{"tingkat":"mudah","pertanyaan":"...","opsi":{"A":"...","B":"...","C":"...","D":"...","E":"..."},"kunci":"B"}]';
}

function kurPromptBacaan_(mapel, rows, judulBuku, bagian, web) {
  var daftar = rows.map(function(r) {
    return '[' + r.smt + '-' + r.minggu + '] Topik: ' + r.topik + '. Halaman buku: ' + (r.halaman || '(tidak diketahui, cari bagian yang sesuai topik)') + '.' +
      (r.tp ? ' Tujuan: ' + r.tp.replace(/\n/g, '; ') : '');
  }).join('\n');
  return kurPromptDasar_(mapel) + (web ? kurAwalanWeb_() : '') +
    'Lampiran: Buku Siswa' + (judulBuku ? ' "' + judulBuku + '"' : '') + '.\n\n' + kurCatatBagian_(bagian) +
    'TUGAS: untuk SETIAP sesi di bawah, tulis (1) bacaan materi lengkap dan (2) bank soal ujian, keduanya khusus untuk sesi itu dan hanya berdasarkan bagian buku pada halaman yang disebutkan.\n\n' +
    'BACAAN: 4 sampai 6 paragraf, dipisah satu baris kosong: mulai dari pengantar, lalu konsep inti secara runtut, sertakan contoh kontekstual, ' +
    'definisikan istilah penting saat pertama muncul, dan akhiri dengan penutup singkat. Jangan menulis materi sesi lain.\n\n' +
    kurSpesifikasiSoal_(true) + '\n' +
    'SESI:\n' + daftar + '\n\n' +
    (web
      ? 'FORMAT KELUARAN: tulis HANYA SATU blok kode ' + kurPagar_() + 'json yang berisi satu objek JSON valid, tanpa penjelasan sebelum atau sesudahnya. ' +
        'Di dalam string jangan ada baris baru mentah (pisahkan paragraf dengan \\n\\n) dan jangan ada tanda kutip ganda yang belum di-escape. Teks berupa string biasa tanpa markdown (tanpa #, **, atau tabel). Skema:\n'
      : 'FORMAT KELUARAN: balas HANYA dengan satu objek JSON valid (tanpa pagar kode markdown). Teks berupa string biasa tanpa markdown (tanpa #, **, atau tabel). Skema:\n') +
    '{"hasil":[{"id":"1-3","isi_materi_lengkap":"paragraf 1\\n\\nparagraf 2",' + kurSkemaSoal_() + '}]}  (id = kode dalam kurung siku di atas)';
}

// Bank soal untuk sesi yang sudah punya bacaan: bacaan disertakan di dalam prompt, jadi PDF tidak perlu dilampirkan.
function kurPromptSoal_(mapel, rows, web, catatan) {
  var daftar = rows.map(function(r) {
    return '[' + r.smt + '-' + r.minggu + '] Topik: ' + r.topik + '\nBACAAN:\n' + r.bacaan;
  }).join('\n\n=====\n\n');
  var catat = aiBersihCatatan_(catatan);
  return kurPromptDasar_(mapel) + (web ? 'Tidak ada lampiran: seluruh bahan ada di dalam pesan ini.\n\n' : '') +
    'TUGAS: untuk SETIAP sesi di bawah, susun bank soal ujian dari bacaan sesi itu. Jangan mengubah atau menulis ulang bacaan.\n\n' +
    kurSpesifikasiSoal_(false) + '\n' +
    'SESI DAN BACAANNYA:\n' + daftar + '\n\n' +
    (web
      ? 'FORMAT KELUARAN: tulis HANYA SATU blok kode ' + kurPagar_() + 'json yang berisi satu objek JSON valid, tanpa penjelasan sebelum atau sesudahnya. Di dalam string jangan ada baris baru mentah dan jangan ada tanda kutip ganda yang belum di-escape. Teks berupa string biasa tanpa markdown. Skema:\n'
      : 'FORMAT KELUARAN: balas HANYA dengan satu objek JSON valid (tanpa pagar kode markdown). Teks berupa string biasa tanpa markdown. Skema:\n') +
    '{"hasil":[{"id":"1-3",' + kurSkemaSoal_() + '}]}  (id = kode dalam kurung siku di atas)' +
    (catat ? '\n\nCatatan tambahan dari tutor (ikuti selama tidak bertentangan dengan isi bacaan): ' + catat : '');
}

// ---------- tahap 1a: rencana satu semester ----------
function kurRatakan_(j, smt) {
  var blok = (j && (j['semester_' + smt] || j.semester_ || j)) || {};
  if (blok.semester && typeof blok.semester === 'object') blok = blok.semester;
  var babList = (blok && blok.bab_list) || (j && j.bab_list) || [];
  var out = [];
  (babList instanceof Array ? babList : []).forEach(function(b, bi) {
    var mingguList = (b && b.minggu_list) || [];
    (mingguList instanceof Array ? mingguList : []).forEach(function(mg) {
      if (!mg) return;
      var tpSumber = mg.tujuan_pembelajaran || (mg.rpp && mg.rpp.tujuan_pembelajaran) || [];
      if (typeof tpSumber === 'string') tpSumber = [tpSumber];
      var topik = aiTeks_(mg.topik_materi, KUR.MAKS_TOPIK);
      if (!topik) return;
      out.push({
        bab: String((b && b.bab) !== undefined ? b.bab : (bi + 1)), judulBab: aiTeks_(b && b.judul_bab, 160), topik: topik,
        halaman: aiTeks_(mg.halaman, 40).replace(/\s+/g, ''),
        tp: aiDaftarTeks_(tpSumber, 400, KUR.MAKS_TP).join('\n'),
        narasi: aiTeks_(mg.narasi_pengantar, KUR.MAKS_NARASI),
        tanya: aiTeks_(mg.pertanyaan_diskusi_elearning, KUR.MAKS_TANYA),
        bacaan: aiTeks_(mg.isi_materi_lengkap, KUR.MAKS_BACAAN)
      });
    });
  });
  return out;
}

function waStafKurikulumPeta(token, idMapel, refs, opsi) {
  return aiLindungi_(token, function() { return kurPetaInti_(token, idMapel, refs, opsi); });
}

function kurPetaInti_(token, idMapel, refs, opsi) {
  var r = wajibMapel_(token, idMapel);
  aiWajibSiap_();
  opsi = opsi || {};
  refs = refs || {};
  var smt = parseInt(opsi.smt, 10);
  if (smt !== 1 && smt !== 2) throw new Error('Semester harus 1 atau 2.');
  var cfg = taBaca_();
  var jumlah = kurDaftarNomorMateri_(cfg).length;
  if (jumlah < 1) throw new Error('Tidak ada sesi materi pada pengaturan tahun ajaran.');
  // penyusunan boleh bertahap: sesi dari..sampai saja (bawaan: seluruh semester)
  var dari = opsi.dari === undefined || opsi.dari === null || opsi.dari === '' ? 1 : parseInt(opsi.dari, 10);
  var sampai = opsi.sampai === undefined || opsi.sampai === null || opsi.sampai === '' ? jumlah : parseInt(opsi.sampai, 10);
  if (!(dari >= 1) || !(sampai >= dari) || sampai > jumlah) throw new Error('Rentang sesi tidak valid.');
  var diminta = sampai - dari + 1;
  var iniSebelum = [];
  if (dari > 1) {
    iniSebelum = kurBaca_(idMapel).filter(function(x) { return x.smt === smt; });
    if (iniSebelum.length !== dari - 1) throw new Error('Bagian sebelumnya belum tersusun. Ulangi penyusunan dari awal.');
  }
  var bukuList = kurDaftarRefBuku_(refs.buku);
  var panduan = refs.panduan ? refs.panduan : null;
  if (panduan && !aiRefFileValid_(panduan)) throw new Error('Referensi Panduan tidak valid. Unggah ulang PDF-nya.');
  var judulBuku = aiTeks_(opsi.judulBuku, 160);
  var sebelumnya = [];
  if (smt === 2) {
    sebelumnya = kurBaca_(idMapel).filter(function(x) { return x.smt === 1; });
    if (!sebelumnya.length) throw new Error('Susun Semester 1 terlebih dahulu.');
  }
  if (hitung_('aip|' + r.p.id, 3600) > AI.MAKS_PROSES_PER_JAM) throw new Error('Terlalu banyak proses AI dalam satu jam. Coba lagi nanti.');
  var mulai = Date.now();
  bukuList.forEach(function(b) { aiTungguAktif_(b.name); });
  if (panduan) aiTungguAktif_(panduan.name);
  var parts = bukuList.map(function(b) { return { fileData: { mimeType: 'application/pdf', fileUri: b.uri } }; });
  if (panduan) parts.push({ fileData: { mimeType: 'application/pdf', fileUri: panduan.uri } });
  parts.push({ text: kurPromptPeta_(r.m, smt, jumlah, !!panduan, sebelumnya, judulBuku, opsi.catatan, bukuList.length, dari, sampai, iniSebelum) });
  var res = aiPanggil_('POST', AI.BASE + '/v1beta/models/' + aiModel_() + ':generateContent', {
    contents: [{ role: 'user', parts: parts }],
    generationConfig: { temperature: 0.3, responseMimeType: 'application/json', maxOutputTokens: 16384 }
  }, { mulai: mulai, pikir: KUR.PIKIR, penanda: true });
  var pakai = aiRingkasPakai_(res, mulai);
  var j = aiParseJson_(aiTeksDariRespons_(res.json));
  var minggu = kurRatakan_(j, smt);
  if (minggu.length < Math.max(1, Math.min(4, Math.ceil(diminta / 2)))) throw new Error('Rencana yang dihasilkan AI belum lengkap (' + minggu.length + ' sesi). Coba proses lagi.');
  var kelebihan = Math.max(0, minggu.length - diminta);
  if (kelebihan) minggu = minggu.slice(0, diminta);
  var buku = judulBuku || aiTeks_(j && j.buku_acuan, 160);

  var kunci = kmKunciUnik_();
  kunci.waitLock(20000);
  try {
    if (dari === 1) kurHapusBaris_(idMapel, smt === 1 ? 0 : 2);
    else if (kurBaca_(idMapel).filter(function(x) { return x.smt === smt; }).length !== dari - 1) throw new Error('Rencana berubah saat diproses. Ulangi penyusunan dari awal.');
    var sh = kurSheet_();
    var waktu = kurWaktu_();
    var rows = minggu.map(function(x, i) {
      return [String(idMapel), smt, dari + i, x.bab, x.judulBab, x.topik, x.halaman, x.tp, x.narasi, x.tanya, '', '', '', buku, waktu, r.p.nama, ''];
    });
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, KUR.HEADERS.length).setValues(rows);
    kmCatat_(r.p, idMapel, 'AI rencana kurikulum', ((typeof kurPeringatBab_ === 'function' && kurPeringatBab_(minggu, smt)) ? '[Periksa bab] ' : '') + 'Semester ' + smt + (dari > 1 || sampai < jumlah ? ' sesi ' + dari + '-' + sampai : '') + ': ' + rows.length + ' sesi · ' + pakai, 'OK');
  } finally {
    kunci.releaseLock();
  }
  return { smt: smt, jumlah: minggu.length, diharapkan: diminta, kelebihan: kelebihan, buku: buku, dari: dari, sampai: sampai, sudah: dari - 1 + minggu.length, target: jumlah };
}

// ---------- tahap 1b: bacaan lengkap per sesi (4 sesi per panggilan) ----------
function waStafKurikulumBacaan(token, idMapel, ref, maks) {
  return aiLindungi_(token, function() { return kurBacaanInti_(token, idMapel, ref, maks); });
}

function kurBacaanInti_(token, idMapel, ref, maks) {
  var r = wajibMapel_(token, idMapel);
  aiWajibSiap_();
  var bukuList = kurDaftarRefBuku_(ref);
  var semua = kurBaca_(idMapel);
  var kosong = semua.filter(function(x) { return x.bacaan.length < KUR.MIN_BACAAN; });
  if (!kosong.length) return { terisi: 0, sisa: 0, total: semua.length, soal: 0 };
  var banyak = Math.min(KUR.PER_BACAAN, Math.max(1, parseInt(maks, 10) || KUR.PER_BACAAN));
  var potong = kosong.slice(0, banyak);
  if (hitung_('aip|' + r.p.id, 3600) > AI.MAKS_PROSES_PER_JAM) throw new Error('Terlalu banyak proses AI dalam satu jam. Coba lagi nanti.');
  var mulai = Date.now();
  bukuList.forEach(function(b) { aiTungguAktif_(b.name); });
  var buku = (potong[0] && potong[0].buku) || '';
  var res = aiPanggil_('POST', AI.BASE + '/v1beta/models/' + aiModel_() + ':generateContent', {
    contents: [{ role: 'user', parts: bukuList.map(function(b) { return { fileData: { mimeType: 'application/pdf', fileUri: b.uri } }; })
      .concat([{ text: kurPromptBacaan_(r.m, potong, buku, bukuList.length) }]) }],
    generationConfig: { temperature: 0.4, responseMimeType: 'application/json', maxOutputTokens: 32768 }
  }, { mulai: mulai, pikir: KUR.PIKIR, penanda: true });
  var pakai = aiRingkasPakai_(res, mulai);
  var j = aiParseJson_(aiTeksDariRespons_(res.json));
  var peta = {}, bank = {};
  ((j && j.hasil) || []).forEach(function(h) {
    var id = String(h && h.id || '').trim();
    var t = aiTeks_(h && h.isi_materi_lengkap, KUR.MAKS_BACAAN);
    if (id && t.length >= KUR.MIN_BACAAN) {
      peta[id] = t;
      var b = kurBersihSoal_(h.soal);
      if (b.length >= KUR.MIN_SOAL_BANK) bank[id] = b;
    }
  });
  var terisi = 0, nSoal = 0;
  var kunci = kmKunciUnik_();
  kunci.waitLock(20000);
  try {
    var sh = kurSheet_();
    var waktu = kurWaktu_();
    // baris bisa bergeser bila ada yang menghapus; baca ulang lokasi tepat sebelum menulis
    var terbaru = kurBaca_(idMapel);
    terbaru.forEach(function(x) {
      var t = peta[x.smt + '-' + x.minggu];
      if (!t || x.bacaan.length >= KUR.MIN_BACAAN) return;
      sh.getRange(x.baris, KUR.K.bacaan + 1).setValue(t);
      sh.getRange(x.baris, KUR.K.waktu + 1).setValue(waktu);
      var b = bank[x.smt + '-' + x.minggu];
      if (b) { sh.getRange(x.baris, KUR.K.bank + 1).setValue(JSON.stringify(b)); nSoal++; }
      terisi++;
    });
    kmCatat_(r.p, idMapel, 'AI bacaan kurikulum', terisi + ' sesi · ' + nSoal + ' bank soal · ' + pakai, 'OK');
  } finally {
    kunci.releaseLock();
  }
  if (!terisi) throw new Error('AI tidak menghasilkan bacaan yang lengkap untuk sesi ini. Coba lagi, atau isi bacaannya manual lewat tombol Ubah.');
  var sisa = Math.max(0, kosong.length - terisi);
  return { terisi: terisi, sisa: sisa, total: semua.length, soal: nSoal };
}

// ---------- tahap 1c: bank soal untuk sesi yang sudah punya bacaan tetapi belum punya soal (teks saja, tanpa PDF) ----------
function waStafKurikulumSoal(token, idMapel, maks) {
  return aiLindungi_(token, function() { return kurSoalInti_(token, idMapel, maks); });
}

function kurButuhSoal_(semua) {
  return semua.filter(function(x) { return x.bacaan.length >= KUR.MIN_BACAAN && x.bank.length < KUR.MIN_SOAL_BANK; });
}

function kurSoalInti_(token, idMapel, maks) {
  var r = wajibMapel_(token, idMapel);
  aiWajibSiap_();
  var semua = kurBaca_(idMapel);
  var butuh = kurButuhSoal_(semua);
  if (!butuh.length) return { terisi: 0, sisa: 0, total: semua.length };
  var banyak = Math.min(KUR.PER_SOAL, Math.max(1, parseInt(maks, 10) || KUR.PER_SOAL));
  var potong = butuh.slice(0, banyak);
  if (hitung_('aip|' + r.p.id, 3600) > AI.MAKS_PROSES_PER_JAM) throw new Error('Terlalu banyak proses AI dalam satu jam. Coba lagi nanti.');
  var mulai = Date.now();
  var res = aiPanggil_('POST', AI.BASE + '/v1beta/models/' + aiModel_() + ':generateContent', {
    contents: [{ role: 'user', parts: [{ text: kurPromptSoal_(r.m, potong, false, '') }] }],
    generationConfig: { temperature: 0.4, responseMimeType: 'application/json', maxOutputTokens: 32768 }
  }, { mulai: mulai, pikir: KUR.PIKIR, penanda: true });
  var pakai = aiRingkasPakai_(res, mulai);
  var j = aiParseJson_(aiTeksDariRespons_(res.json));
  var bank = {};
  ((j && j.hasil) || []).forEach(function(h) {
    var id = kurIdSesi_(h);
    var b = kurBersihSoal_(h && h.soal);
    if (id && b.length >= KUR.MIN_SOAL_BANK) bank[id] = b;
  });
  var terisi = 0;
  var kunci = kmKunciUnik_();
  kunci.waitLock(20000);
  try {
    var sh = kurSheet_();
    kurBaca_(idMapel).forEach(function(x) {
      var b = bank[x.smt + '-' + x.minggu];
      if (!b || x.bacaan.length < KUR.MIN_BACAAN || x.bank.length >= KUR.MIN_SOAL_BANK) return;
      sh.getRange(x.baris, KUR.K.bank + 1).setValue(JSON.stringify(b));
      terisi++;
    });
    kmCatat_(r.p, idMapel, 'AI bank soal kurikulum', terisi + ' sesi · ' + pakai, 'OK');
  } finally {
    kunci.releaseLock();
  }
  if (!terisi) throw new Error('AI tidak menghasilkan soal yang lengkap untuk sesi ini. Coba lagi.');
  return { terisi: terisi, sisa: Math.max(0, butuh.length - terisi), total: semua.length };
}

// ---------- ubah satu sesi (tutor) ----------
function waStafKurikulumUbah(token, idMapel, smt, minggu, d) {
  var ctx = wajibMapel_(token, idMapel);
  d = d || {};
  smt = parseInt(smt, 10); minggu = parseInt(minggu, 10);
  var topik = aiTeks_(d.topik, KUR.MAKS_TOPIK);
  if (!topik) throw new Error('Topik tidak boleh kosong.');
  var bacaan = aiTeks_(d.bacaan, KUR.MAKS_BACAAN);
  var kunci = kmKunciUnik_();
  kunci.waitLock(20000);
  try {
    var cari = kurBaca_(idMapel).filter(function(x) { return x.smt === smt && x.minggu === minggu; })[0];
    if (!cari) throw new Error('Sesi tidak ditemukan di rencana.');
    var sh = kurSheet_();
    var tpList = String(d.tp || '').split('\n').map(function(x) { return aiTeks_(x, 400); }).filter(function(x) { return x; }).slice(0, KUR.MAKS_TP);
    var K = KUR.K;
    function set(kol, v) { sh.getRange(cari.baris, kol + 1).setValue(v); }
    set(K.topik, topik);
    set(K.halaman, aiTeks_(d.halaman, 40).replace(/\s+/g, ''));
    set(K.tp, tpList.join('\n'));
    set(K.narasi, aiTeks_(d.narasi, KUR.MAKS_NARASI));
    set(K.tanya, aiTeks_(d.tanya, KUR.MAKS_TANYA));
    set(K.bacaan, bacaan);
    set(K.waktu, kurWaktu_());
    set(K.oleh, ctx.p.nama);
    kmCatat_(ctx.p, idMapel, 'Ubah rencana sesi', 'Semester ' + smt + ' sesi ke-' + minggu + ': ' + topik, 'OK');
  } finally {
    kunci.releaseLock();
  }
  return { sukses: true };
}

function waStafKurikulumHapus(token, idMapel) {
  var ctx = wajibMapel_(token, idMapel);
  var kunci = kmKunciUnik_();
  kunci.waitLock(20000);
  try {
    var n = kurBaca_(idMapel).length;
    kurHapusBaris_(idMapel, 0);
    kmCatat_(ctx.p, idMapel, 'Hapus rencana kurikulum', n + ' sesi (Materi/Diskusi yang sudah dibuat tidak ikut terhapus)', 'OK');
    return { terhapus: n };
  } finally {
    kunci.releaseLock();
  }
}

// ---------- tahap 2: rencana -> Draft Materi & Diskusi ----------
function kurKontenMateri_(x) {
  var bag = [];
  if (x.narasi) bag.push(x.narasi);
  if (x.halaman) bag.push('Rujukan: ' + (x.buku ? x.buku + ', ' : 'Buku siswa, ') + 'halaman ' + x.halaman + '.');
  var tp = x.tp ? x.tp.split('\n').filter(function(t) { return t.trim(); }) : [];
  if (tp.length) bag.push('TUJUAN PEMBELAJARAN\n' + tp.map(function(t) { return '• ' + t; }).join('\n'));
  if (x.bacaan) bag.push('MATERI\n' + x.bacaan);
  return bag.join('\n\n');
}

// daftar: 'semua' atau [{ smt, minggu }]
function waStafKurikulumTerbit(token, idMapel, daftar) {
  var ctx = wajibMapel_(token, idMapel);
  var cfg = taBaca_();
  var nomor = kurDaftarNomorMateri_(cfg);
  var kunci = kmKunciUnik_();
  kunci.waitLock(30000);
  try {
    var rows = kurBaca_(idMapel);
    if (!rows.length) throw new Error('Belum ada rencana kurikulum untuk mapel ini.');
    var pilih;
    if (daftar === 'semua') pilih = rows;
    else {
      var kunciPilih = {};
      (daftar || []).forEach(function(d) { kunciPilih[parseInt(d && d.smt, 10) + '-' + parseInt(d && d.minggu, 10)] = true; });
      pilih = rows.filter(function(x) { return kunciPilih[x.smt + '-' + x.minggu]; });
    }
    if (!pilih.length) throw new Error('Tidak ada sesi yang dipilih.');
    var ada = kurIdItemAda_();
    var sh = kurSheet_();
    var K = KUR.K;
    var materi = 0, diskusi = 0, dilewati = 0, tanpaBacaan = 0, tanpaSesi = 0;
    pilih.forEach(function(x) {
      var n = nomor[x.minggu - 1];
      if (!n) { tanpaSesi++; return; }
      var sesi = taNama_(x.smt, n);
      var judulDasar = x.topik;
      if (!(x.idMateri && ada[x.idMateri])) {
        var konten = kurKontenMateri_(x);
        if (konten) {
          var id = aiTulisItem_(idMapel, 'Materi', ('Sesi ' + n + ': ' + judulDasar).slice(0, 120), konten, sesi, 0);
          sh.getRange(x.baris, K.idMateri + 1).setValue(id);
          materi++;
          if (x.bacaan.length < KUR.MIN_BACAAN) tanpaBacaan++;
        } else { dilewati++; }
      } else { dilewati++; }
      if (x.tanya && !(x.idDiskusi && ada[x.idDiskusi])) {
        var idD = aiTulisItem_(idMapel, 'Diskusi', ('Diskusi Sesi ' + n + ': ' + judulDasar).slice(0, 120), x.tanya + '\n\n' + KUR.PETUNJUK_DISKUSI, sesi, 0);
        sh.getRange(x.baris, K.idDiskusi + 1).setValue(idD);
        diskusi++;
      }
    });
    kmCatat_(ctx.p, idMapel, 'Buat Draft dari kurikulum', materi + ' materi, ' + diskusi + ' diskusi', 'OK');
    return { materi: materi, diskusi: diskusi, dilewati: dilewati, tanpaBacaan: tanpaBacaan, tanpaSesi: tanpaSesi };
  } finally {
    kunci.releaseLock();
  }
}

// ---------- tahap 3: bank soal -> draf UTS / UAS ----------
// UTS = soal dari sesi sebelum UTS; UAS = soal dari sesi setelah UTS sampai sebelum UAS (atau seluruh semester bila diminta).
// Paket A memakai opsi A-D, paket lain A-E. Komposisi mudah/sedang/sulit ditentukan tutor.
var KUR_TINGKAT = ['mudah', 'sedang', 'sulit'];

function kurCakupanUjian_(rows, cfg, smt, jenis, seluruh) {
  var nomor = kurDaftarNomorMateri_(cfg);
  return rows.filter(function(x) {
    if (x.smt !== smt) return false;
    var n = nomor[x.minggu - 1];
    if (!n) return false;
    if (jenis === 'UTS') return n < cfg.uts;
    if (seluruh) return n < cfg.uas;
    return n > cfg.uts && n < cfg.uas;
  });
}

// Pilih soal sesuai komposisi; sesi dibagi rata (soal ke-1 tiap sesi dulu, lalu ke-2, dst). Kekurangan satu tingkat diisi tingkat terdekat.
function kurPilihSoalUjian_(sesiList, komposisi) {
  var kolam = { mudah: [], sedang: [], sulit: [] };
  sesiList.forEach(function(x, si) {
    var rank = { mudah: 0, sedang: 0, sulit: 0 };
    x.bank.forEach(function(q, qi) { kolam[q.tingkat].push({ si: si, qi: qi, rank: rank[q.tingkat]++, q: q, tingkat: q.tingkat }); });
  });
  KUR_TINGKAT.forEach(function(t) { kolam[t].sort(function(a, b) { return (a.rank - b.rank) || (a.si - b.si); }); });
  var terpilih = [], kurang = {}, dipakai = {};
  function ambil(e) { dipakai[e.si + ':' + e.qi] = true; terpilih.push(e); }
  KUR_TINGKAT.forEach(function(t) {
    var perlu = komposisi[t] || 0, n = Math.min(perlu, kolam[t].length);
    for (var i = 0; i < n; i++) ambil(kolam[t][i]);
    if (perlu > n) kurang[t] = perlu - n;
  });
  Object.keys(kurang).forEach(function(t) {
    var ti = KUR_TINGKAT.indexOf(t), butuh = kurang[t], sisa = [];
    KUR_TINGKAT.forEach(function(o) {
      if (o === t) return;
      kolam[o].forEach(function(e) { if (!dipakai[e.si + ':' + e.qi]) sisa.push(e); });
    });
    sisa.sort(function(a, b) {
      return (Math.abs(KUR_TINGKAT.indexOf(a.tingkat) - ti) - Math.abs(KUR_TINGKAT.indexOf(b.tingkat) - ti)) || (a.rank - b.rank) || (a.si - b.si);
    });
    for (var i = 0; i < sisa.length && butuh > 0; i++) { ambil(sisa[i]); butuh--; }
    kurang[t] = { diminta: kurang[t], terisiTingkatLain: kurang[t] - butuh };
  });
  terpilih.sort(function(a, b) { return (a.si - b.si) || (a.qi - b.qi); });
  return { terpilih: terpilih, kurang: kurang, kolam: { mudah: kolam.mudah.length, sedang: kolam.sedang.length, sulit: kolam.sulit.length } };
}

// Menyesuaikan jumlah opsi (maksOpsi) dan menyebar kunci jawaban secara merata. Deterministik menurut benih.
function kurSiapkanOpsi_(terpilih, maksOpsi, benih) {
  var daftarSoal = terpilih.map(function(e) {
    var q = e.q;
    var daftar = KM.HURUF_OPSI.filter(function(h) { return q.opsi[h]; }).map(function(h) { return { t: q.opsi[h], benar: h === q.kunci }; });
    while (daftar.length > maksOpsi) {
      for (var i = daftar.length - 1; i >= 0; i--) { if (!daftar[i].benar) { daftar.splice(i, 1); break; } }
    }
    return { pertanyaan: q.pertanyaan, daftar: daftar };
  });
  var urut = [];
  for (var i = 0; i < daftarSoal.length; i++) urut.push(i % maksOpsi);
  var rnd = benih >>> 0;
  function acak() { rnd = (Math.imul(rnd, 1103515245) + 12345) & 0x7fffffff; return rnd; }
  for (var k = urut.length - 1; k > 0; k--) { var j = acak() % (k + 1); var tmp = urut[k]; urut[k] = urut[j]; urut[j] = tmp; }
  return daftarSoal.map(function(s, idx) {
    var target = urut[idx] % s.daftar.length, asal = 0;
    s.daftar.forEach(function(o, i) { if (o.benar) asal = i; });
    var tukar = s.daftar[target]; s.daftar[target] = s.daftar[asal]; s.daftar[asal] = tukar;
    var opsi = {};
    s.daftar.forEach(function(o, i) { opsi[KM.HURUF_OPSI[i]] = o.t; });
    return { pertanyaan: s.pertanyaan, opsi: opsi, kunci: KM.HURUF_OPSI[target] };
  });
}

function kurBenih_(teks) {
  var h = 7;
  String(teks).split('').forEach(function(c) { h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0; });
  return h >>> 0;
}

// opsi: { smt: 1|2, jenis: 'UTS'|'UAS', mudah, sedang, sulit, seluruh: bool (khusus UAS), durasi }
function waStafKurikulumRakitUjian(token, idMapel, opsi) {
  var r = wajibMapel_(token, idMapel);
  opsi = opsi || {};
  var cfg = taBaca_();
  var smt = parseInt(opsi.smt, 10);
  var jenis = String(opsi.jenis || '').toUpperCase();
  if (!(smt >= 1 && smt <= cfg.jumlahSemester) || smt > 2) throw new Error('Pilih Semester 1 atau 2.');
  if (jenis !== 'UTS' && jenis !== 'UAS') throw new Error('Pilih UTS atau UAS.');
  var diminta = {}, total = 0;
  var adaIsi = ['mudah', 'sedang', 'sulit'].some(function(t) { return opsi[t] !== undefined && opsi[t] !== null && opsi[t] !== ''; });
  KUR_TINGKAT.forEach(function(t) {
    var n = adaIsi ? parseInt(opsi[t], 10) : KUR.UJIAN_KOMPOSISI[t];
    if (!(n >= 0)) n = 0;
    diminta[t] = Math.min(n, KM.MAKS_SOAL_PER_UJIAN);
    total += diminta[t];
  });
  if (total < 5) throw new Error('Jumlah soal minimal 5. Atur komposisi mudah, sedang, dan sulit.');
  if (total > KM.MAKS_SOAL_PER_UJIAN) throw new Error('Satu ujian maksimal ' + KM.MAKS_SOAL_PER_UJIAN + ' soal.');
  var nSesi = jenis === 'UTS' ? cfg.uts : cfg.uas;
  var namaSesi = taNama_(smt, nSesi);
  var paket = kurPaket_(r.m.namaRombel);
  var maksOpsi = paket === 'A' ? 4 : 5;

  var kunci = kmKunciUnik_();
  kunci.waitLock(30000);
  try {
    var m = kmMateri_();
    var v = m.sheet.getDataRange().getValues();
    for (var i = 1; i < v.length; i++) {
      if (sTeks_(v[i][m.c.idMapel - 1]).trim() !== String(idMapel)) continue;
      if (sTeks_(v[i][m.c.jenis - 1]).trim() !== 'Ujian') continue;
      if (sTeks_(v[i][m.c.sesi - 1]).trim() !== namaSesi) continue;
      throw new Error('Sudah ada ujian pada ' + namaSesi + ' ("' + sTeks_(v[i][m.c.judul - 1]).trim() + '", ' + (sTeks_(v[i][m.c.status - 1]).trim() || 'Draft') + '). Hapus ujian itu di tab Materi bila ingin membuatnya ulang dari bank soal.');
    }
    var semua = kurBaca_(idMapel);
    if (!semua.length) throw new Error('Belum ada rencana kurikulum untuk mapel ini.');
    var cakupan = kurCakupanUjian_(semua, cfg, smt, jenis, !!opsi.seluruh);
    var denganBank = cakupan.filter(function(x) { return x.bank.length >= KUR.MIN_SOAL_BANK; });
    var tanpaBank = cakupan.filter(function(x) { return x.bank.length < KUR.MIN_SOAL_BANK; }).map(function(x) { return 'Sesi ' + (kurDaftarNomorMateri_(cfg)[x.minggu - 1] || x.minggu); });
    var tersedia = 0;
    denganBank.forEach(function(x) { tersedia += x.bank.length; });
    if (tersedia < 5) throw new Error('Bank soal untuk cakupan ' + jenis + ' Semester ' + smt + ' baru ' + tersedia + ' soal. Lengkapi bank soal dulu (tombol "Lengkapi soal" atau "Lewat Gemini langsung").');
    var pilih = kurPilihSoalUjian_(denganBank, diminta);
    var soal = kurSiapkanOpsi_(pilih.terpilih, maksOpsi, kurBenih_(idMapel + '|' + smt + '|' + jenis));
    var judul = (jenis === 'UTS' ? 'Ujian Tengah Semester ' : 'Ujian Akhir Semester ') + smt;
    var durasi = parseInt(opsi.durasi, 10);
    if (!(durasi >= 5 && durasi <= 240)) durasi = Math.min(240, Math.max(10, Math.ceil(soal.length * 1.5 / 5) * 5));
    var idU = aiTulisItem_(idMapel, 'Ujian', judul, 'Kerjakan semua soal dengan teliti. Pilih satu jawaban yang paling tepat.', namaSesi, durasi);
    aiTulisSoal_(idU, soal);
    var aktual = { mudah: 0, sedang: 0, sulit: 0 };
    pilih.terpilih.forEach(function(e) { aktual[e.tingkat]++; });
    kmCatat_(r.p, idMapel, 'Rakit ujian dari bank soal', judul + ' · ' + soal.length + ' soal · opsi A-' + KM.HURUF_OPSI[maksOpsi - 1], 'OK');
    return {
      id: idU, judul: judul, sesi: namaSesi, jumlah: soal.length, diminta: total, paket: paket, maksOpsi: maksOpsi, durasi: durasi,
      komposisiDiminta: diminta, komposisi: aktual, kurang: pilih.kurang, sesiDipakai: denganBank.length, sesiTanpaBank: tanpaBank, tersedia: tersedia
    };
  } finally {
    kunci.releaseLock();
  }
}

// ============================================================
// MODE MANUAL: Gemini langsung (gemini.google.com), tanpa kuota AI aplikasi
// ------------------------------------------------------------
// 1) Server menyusun prompt (waStafKurikulumPromptManual); tutor menyalinnya ke gemini.google.com dan melampirkan PDF di sana.
// 2) Hasil JSON ditempel/diunggah kembali (waStafKurikulumImporManual). Server memeriksa lalu menyimpan ke sheet Kurikulum
//    persis seperti hasil mode otomatis, sehingga Tahap 2 (Buat Draft Materi/Diskusi) tidak berubah.
// Tidak ada pemanggilan Gemini di sini, jadi tidak butuh kunci API dan tidak memakai kuota.
// ============================================================
function waStafKurikulumPromptManual(token, idMapel, opsi) {
  var r = wajibMapel_(token, idMapel);
  opsi = opsi || {};
  var cfg = taBaca_();
  var jumlah = kurDaftarNomorMateri_(cfg).length;
  if (jumlah < 1) throw new Error('Tidak ada sesi materi pada pengaturan tahun ajaran.');
  var judulBuku = aiTeks_(opsi.judulBuku, 160);
  var adaPanduan = !!opsi.panduan;
  var catat = aiBersihCatatan_(opsi.catatan);
  var semua = kurBaca_(idMapel);

  if (opsi.jenis === 'bacaan') {
    if (!semua.length) throw new Error('Belum ada rencana semester. Buat dan simpan rencana semester terlebih dahulu.');
    var kosong = semua.filter(function(x) { return x.bacaan.length < KUR.MIN_BACAAN; });
    if (!kosong.length) throw new Error('Semua sesi sudah memiliki bacaan lengkap.');
    var pilih = kosong.slice(0, KUR.PER_BACAAN_MANUAL);
    var buku = judulBuku || pilih[0].buku;
    var pb = kurPromptBacaan_(r.m, pilih, buku, 0, true) +
      (catat ? '\n\nCatatan tambahan dari tutor (ikuti selama tidak bertentangan dengan isi dokumen): ' + catat : '');
    return {
      jenis: 'bacaan', smt: 0, prompt: pb, panjang: pb.length,
      sesi: pilih.map(function(x) { return x.smt + '-' + x.minggu; }), sisa: kosong.length - pilih.length, kosongTotal: kosong.length
    };
  }

  if (opsi.jenis === 'soal') {
    if (!semua.length) throw new Error('Belum ada rencana semester. Buat dan simpan rencana semester terlebih dahulu.');
    var butuhS = kurButuhSoal_(semua);
    if (!butuhS.length) throw new Error('Semua sesi yang sudah punya bacaan sudah memiliki bank soal.');
    var pilihS = butuhS.slice(0, KUR.PER_SOAL_MANUAL);
    var ps = kurPromptSoal_(r.m, pilihS, true, opsi.catatan);
    return {
      jenis: 'soal', smt: 0, prompt: ps, panjang: ps.length,
      sesi: pilihS.map(function(x) { return x.smt + '-' + x.minggu; }), sisa: butuhS.length - pilihS.length, kosongTotal: butuhS.length
    };
  }

  var smt = parseInt(opsi.smt, 10);
  if (smt !== 0 && smt !== 1 && smt !== 2) throw new Error('Pilih Semester 1, Semester 2, atau keduanya.');
  var prompt;
  if (smt === 0) {
    prompt = kurPromptPetaDua_(r.m, jumlah, adaPanduan, judulBuku, opsi.catatan);
  } else {
    var sebelumnya = [];
    if (smt === 2) {
      sebelumnya = semua.filter(function(x) { return x.smt === 1; });
      if (!sebelumnya.length) throw new Error('Semester 1 belum tersimpan. Buat Semester 1 dulu, atau pilih "Semester 1 dan 2 sekaligus".');
    }
    prompt = kurPromptPeta_(r.m, smt, jumlah, adaPanduan, sebelumnya, judulBuku, opsi.catatan, 0, 1, jumlah, [], true);
  }
  return { jenis: 'peta', smt: smt, prompt: prompt, panjang: prompt.length, sesi: [], sisa: 0, kosongTotal: 0 };
}

// ---------- pembaca JSON yang toleran terhadap hasil salin-tempel dari Gemini web ----------
// Memecah teks menjadi objek JSON tingkat atas. Objek terakhir boleh belum tertutup (jawaban terpotong).
function kurPecahObjek_(teks) {
  var t = String(teks || ''), out = [], depth = 0, mulai = -1, dalamStr = false, esc = false;
  for (var i = 0; i < t.length; i++) {
    var c = t.charAt(i);
    if (depth === 0) { // di luar objek: abaikan teks bebas (mis. kalimat pembuka dari Gemini)
      if (c === '{') { depth = 1; mulai = i; dalamStr = false; esc = false; }
      continue;
    }
    if (dalamStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') dalamStr = false;
      continue;
    }
    if (c === '"') dalamStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) { out.push(t.slice(mulai, i + 1)); mulai = -1; }
    }
  }
  if (depth > 0 && mulai >= 0) out.push(t.slice(mulai));
  return out;
}

// Baris baru/tab mentah di dalam string diubah menjadi \n / \t agar JSON.parse tidak menolaknya.
function kurPerbaikiString_(t) {
  var o = [], dalam = false, esc = false;
  for (var i = 0; i < t.length; i++) {
    var c = t.charAt(i);
    if (dalam) {
      if (esc) { esc = false; o.push(c); continue; }
      if (c === '\\') { esc = true; o.push(c); continue; }
      if (c === '"') { dalam = false; o.push(c); continue; }
      if (c === '\n') { o.push('\\n'); continue; }
      if (c === '\r') continue;
      if (c === '\t') { o.push('\\t'); continue; }
      o.push(c);
    } else {
      if (c === '"') dalam = true;
      o.push(c);
    }
  }
  return o.join('');
}

// Hasil: { obj, terpotong } atau null. Bila JSON terpotong, dipotong pada penutup kurung terakhir yang utuh lalu ditutup otomatis.
// Bersihkan keluaran Gemini web: penanda sumber [cite: ..], koma yang tertukar titik dua pada opsi ("C","teks" menjadi "C":"teks"), kunci tambahan icon.
function kurBersihGemini_(t) {
  return String(t || '')
    .replace(/\s*\[(?:cite_start|cite[^\]]*)\]/g, '')
    .replace(/([{,]\s*)"([A-Ea-e])"\s*,\s*"/g, function(m0, p, h) { return p + '"' + h.toUpperCase() + '":"'; })
    .replace(/,\s*"icon"\s*:\s*null/g, '');
}

// Menyeimbangkan kurung: bila penutup tidak cocok dengan pembuka terakhir (mis. } padahal seharusnya ]), sisipkan penutup yang hilang; penutup berlebih dibuang.
// tambahAkhir = jumlah penutup yang ditambahkan di akhir teks (tanda JSON terpotong).
function kurTutupSeimbang_(t) {
  var o = [], stack = [], dalam = false, esc = false;
  for (var i = 0; i < t.length; i++) {
    var c = t.charAt(i);
    if (dalam) { o.push(c); if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') dalam = false; continue; }
    if (c === '"') { dalam = true; o.push(c); continue; }
    // kunci tingkat atas "semester_1/2" muncul padahal kurung sebelumnya belum ditutup: tutup semuanya sampai objek utama
    if (c === ',' && stack.length > 1 && /^,\s*"semester_[12]"\s*:/.test(t.substr(i, 24))) { while (stack.length > 1) o.push(stack.pop()); o.push(c); continue; }
    if (c === '{') { stack.push('}'); o.push(c); continue; }
    if (c === '[') { stack.push(']'); o.push(c); continue; }
    if (c === '}' || c === ']') {
      if (!stack.length) continue;
      if (stack[stack.length - 1] !== c) {
        if (stack.indexOf(c) < 0) continue;
        while (stack.length && stack[stack.length - 1] !== c) o.push(stack.pop());
      }
      stack.pop(); o.push(c); continue;
    }
    o.push(c);
  }
  var tambah = stack.length;
  while (stack.length) o.push(stack.pop());
  return { s: o.join(''), tambahAkhir: tambah };
}

function kurParseLonggar_(teks) {
  var t = kurPerbaikiString_(kurBersihGemini_(String(teks || '').replace(/^\uFEFF/, '')));
  try { return { obj: JSON.parse(t), terpotong: false }; } catch (e) {}
  // buang koma menggantung sebelum penutup
  try { return { obj: JSON.parse(t.replace(/,\s*([}\]])/g, '$1')), terpotong: false }; } catch (e2) {}
  // kurung tidak cocok (mis. kurang ] di tengah): seimbangkan lalu coba lagi
  try { var sb = kurTutupSeimbang_(t); if (sb.tambahAkhir === 0) return { obj: JSON.parse(sb.s.replace(/,\s*([}\]])/g, '$1')), terpotong: false }; } catch (e3) {}
  var stack = [], dalam = false, esc = false, terakhir = -1, sisaStack = null;
  for (var i = 0; i < t.length; i++) {
    var c = t.charAt(i);
    if (dalam) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') dalam = false;
      continue;
    }
    if (c === '"') dalam = true;
    else if (c === '{' || c === '[') stack.push(c);
    else if (c === '}' || c === ']') {
      stack.pop();
      terakhir = i + 1; sisaStack = stack.slice();
    }
  }
  if (terakhir < 0 || !sisaStack) return null;
  var tutup = sisaStack.reverse().map(function(b) { return b === '{' ? '}' : ']'; }).join('');
  try { return { obj: JSON.parse(t.slice(0, terakhir).replace(/,\s*$/, '') + tutup), terpotong: true }; } catch (e3) {}
  return null;
}

function kurIdSesi_(h) {
  if (!h) return '';
  var id = String(h.id === undefined || h.id === null ? '' : h.id).replace(/[\[\]\s]/g, '');
  if (/^\d+-\d+$/.test(id)) return id;
  var m = /^(?:s(?:emester)?)?([12])[^0-9]+(\d+)$/i.exec(id);
  if (m) return m[1] + '-' + m[2];
  var smt = parseInt(h.semester !== undefined ? h.semester : h.smt, 10), mg = parseInt(h.minggu, 10);
  if ((smt === 1 || smt === 2) && mg >= 1) return smt + '-' + mg;
  return '';
}

// Menganalisis (tanpa menulis) semua teks yang ditempel. Mengembalikan rencana yang siap disimpan dan ringkasannya.
function kurAnalisisImpor_(idMapel, daftarTeks, opsi) {
  if (!Array.isArray(daftarTeks) || !daftarTeks.length) throw new Error('Belum ada hasil yang ditempel atau diunggah.');
  if (daftarTeks.length > KUR.MAKS_BERKAS_IMPOR) throw new Error('Terlalu banyak berkas (maksimal ' + KUR.MAKS_BERKAS_IMPOR + ' sekaligus).');
  var total = 0;
  var teksList = daftarTeks.map(function(x) { x = String(x === undefined || x === null ? '' : x); total += x.length; return x; });
  if (total > KUR.MAKS_TEKS_IMPOR) throw new Error('Hasil yang ditempel terlalu besar. Impor per semester atau per beberapa sesi.');
  var cfg = taBaca_();
  var jumlah = kurDaftarNomorMateri_(cfg).length;
  var peringatan = [];
  var petaSmt = {}, terpotongSmt = {}, bacaanMasuk = {}, bukuAcuan = '';
  var objekValid = 0, objekGagal = 0, tidakDikenal = 0;

  teksList.forEach(function(teks) {
    kurPecahObjek_(teks).forEach(function(bagian) {
      var h = kurParseLonggar_(bagian);
      if (!h || !h.obj || typeof h.obj !== 'object') { objekGagal++; return; }
      var j = h.obj, dikenali = false, smtDiObjek = [];
      if (j.buku_acuan && !bukuAcuan) bukuAcuan = aiTeks_(j.buku_acuan, 160);
      [1, 2].forEach(function(smt) {
        var ada = j['semester_' + smt] !== undefined;
        if (!ada && j.bab_list && parseInt(j.semester, 10) === smt) ada = true;
        if (!ada) return;
        dikenali = true;
        var minggu = kurRatakan_(j, smt);
        // jawaban terpotong: butir terakhir yang belum memuat pertanyaan diskusi dianggap belum utuh
        if (h.terpotong && minggu.length && !minggu[minggu.length - 1].tanya) minggu.pop();
        if (!minggu.length) return;
        if (petaSmt[smt]) peringatan.push('Semester ' + smt + ' muncul lebih dari sekali; hasil yang terakhir dipakai.');
        petaSmt[smt] = minggu;
        delete terpotongSmt[smt];
        smtDiObjek.push(smt);
      });
      // jawaban terpotong: semester terakhir pada objek inilah yang tidak utuh
      if (h.terpotong && smtDiObjek.length) terpotongSmt[smtDiObjek[smtDiObjek.length - 1]] = true;
      if (Array.isArray(j.hasil)) {
        dikenali = true;
        j.hasil.forEach(function(x) {
          var id = kurIdSesi_(x);
          var isi = aiTeks_(x && x.isi_materi_lengkap, KUR.MAKS_BACAAN);
          var soalMasuk = kurBersihSoal_(x && x.soal);
          if (!id) { bacaanMasuk['?' + Object.keys(bacaanMasuk).length] = { id: '', teks: isi, soal: soalMasuk }; return; }
          bacaanMasuk[id] = { id: id, teks: isi, soal: soalMasuk };
        });
        if (h.terpotong) peringatan.push('Jawaban bacaan terpotong; hanya sesi yang utuh yang dipakai.');
      }
      if (dikenali) objekValid++; else tidakDikenal++;
    });
  });

  if (!objekValid) {
    if (tidakDikenal) throw new Error('JSON terbaca tetapi bentuknya tidak dikenali. Pastikan Anda memakai prompt dari aplikasi ini dan menyalin seluruh jawabannya.');
    throw new Error('Tidak ditemukan JSON yang valid. Salin seluruh isi blok kode jawaban Gemini (dari tanda { sampai }), lalu tempel lagi.');
  }
  if (objekGagal) peringatan.push(objekGagal + ' bagian teks tidak bisa dibaca sebagai JSON dan dilewati.');

  var semuaSmt = [1, 2].filter(function(s) { return !!petaSmt[s]; });
  semuaSmt.forEach(function(smt) {
    var n = petaSmt[smt].length;
    var pb = kurPeringatBab_(petaSmt[smt], smt); if (pb) peringatan.push(pb);
    var jmlPendalaman = petaSmt[smt].filter(function(rw) { return /^pendalaman/i.test(String(rw.topik || rw.topik_materi || '').trim()); }).length;
    if (jmlPendalaman > 2) peringatan.push('Semester ' + smt + ' memuat ' + jmlPendalaman + ' sesi "Pendalaman" (seharusnya hanya 2 sesi terakhir). Sisanya sebaiknya sesi materi yang dipecah per aspek (konsep, contoh dan penerapan, latihan) dengan halaman berbeda, bukan pengulangan bab lama. Minta Gemini memperbaiki.');
    if (n > jumlah) { peringatan.push('Semester ' + smt + ' memuat ' + n + ' sesi; hanya ' + jumlah + ' sesi pertama dipakai (sesuai jatah sesi materi).'); petaSmt[smt] = petaSmt[smt].slice(0, jumlah); }
    else if (n < jumlah) peringatan.push('Semester ' + smt + ' baru ' + n + ' dari ' + jumlah + ' sesi' + (terpotongSmt[smt] ? ' (jawaban Gemini terpotong)' : '') + '. Bila bukan karena terpotong, materinya terlalu sedikit: minta Gemini memecah topik per aspek (konsep, contoh dan penerapan, latihan) sampai genap ' + jumlah + ' sesi. Buat prompt Semester ' + smt + ' lagi dan minta Gemini menulis lebih ringkas.');
  });

  // baris yang berlaku setelah impor: semester yang diganti memakai hasil baru, sisanya tetap dari sheet
  var ada = kurBaca_(idMapel);
  var berlaku = {};
  ada.forEach(function(x) { if (!petaSmt[x.smt]) berlaku[x.smt + '-' + x.minggu] = true; });
  semuaSmt.forEach(function(smt) { petaSmt[smt].forEach(function(x, i) { berlaku[smt + '-' + (i + 1)] = true; }); });

  var bacaanTulis = {}, bankTulis = {}, tidakCocok = [], pendek = [], soalKurang = [], soalTanpaBacaan = [];
  // bacaan yang sudah ada di sheet pada semester yang tidak diganti (dipakai untuk soal-saja)
  var bacaanAda = {};
  ada.forEach(function(x) { if (!petaSmt[x.smt] && x.bacaan.length >= KUR.MIN_BACAAN) bacaanAda[x.smt + '-' + x.minggu] = true; });
  // bacaan inline pada rencana (bila Gemini menyertakannya)
  semuaSmt.forEach(function(smt) {
    petaSmt[smt].forEach(function(x, i) { if (x.bacaan && x.bacaan.length >= KUR.MIN_BACAAN) bacaanTulis[smt + '-' + (i + 1)] = x.bacaan; });
  });
  Object.keys(bacaanMasuk).forEach(function(k) {
    var b = bacaanMasuk[k];
    if (!b.id || !berlaku[b.id]) { tidakCocok.push(b.id || '(tanpa kode)'); return; }
    var adaTeks = b.teks.length >= KUR.MIN_BACAAN;
    if (b.teks.length && !adaTeks) { pendek.push(b.id); return; }
    if (!adaTeks && !b.soal.length) { pendek.push(b.id); return; }
    if (adaTeks) bacaanTulis[b.id] = b.teks;
    if (b.soal.length >= KUR.MIN_SOAL_BANK) {
      if (adaTeks || bacaanAda[b.id]) bankTulis[b.id] = b.soal; else soalTanpaBacaan.push(b.id);
    } else if (b.soal.length) soalKurang.push(b.id);
  });
  if (tidakCocok.length) peringatan.push('Bacaan dengan kode ' + tidakCocok.slice(0, 6).join(', ') + (tidakCocok.length > 6 ? ', ...' : '') + ' tidak cocok dengan rencana yang ada dan dilewati.');
  if (pendek.length) peringatan.push('Bacaan atau soal sesi ' + pendek.slice(0, 6).join(', ') + ' kosong/terlalu pendek dan dilewati.');
  if (soalKurang.length) peringatan.push('Soal sesi ' + soalKurang.slice(0, 6).join(', ') + ' kurang dari ' + KUR.MIN_SOAL_BANK + ' yang valid dan dilewati.');
  if (soalTanpaBacaan.length) peringatan.push('Soal sesi ' + soalTanpaBacaan.slice(0, 6).join(', ') + ' dilewati karena sesi itu belum punya bacaan.');
  if (Object.keys(bacaanMasuk).length && !Object.keys(bacaanTulis).length && !Object.keys(bankTulis).length && !soalTanpaBacaan.length && !soalKurang.length && !semuaSmt.length) throw new Error('Tidak satu pun bacaan cocok dengan rencana yang sudah tersimpan. Pastikan rencana semester sudah disimpan dan memakai prompt bacaan terbaru.');

  var judulBuku = aiTeks_(opsi && opsi.judulBuku, 160) || bukuAcuan || (ada[0] && ada[0].buku) || '';
  return {
    petaSmt: petaSmt, semuaSmt: semuaSmt, bacaanTulis: bacaanTulis, bankTulis: bankTulis, peringatan: peringatan, buku: judulBuku, jumlah: jumlah, ada: ada, terpotongSmt: terpotongSmt
  };
}

function kurRingkasImpor_(a, disimpan) {
  var sem = {};
  a.semuaSmt.forEach(function(smt) {
    var daftar = a.petaSmt[smt];
    sem[smt] = {
      jumlah: daftar.length, diharapkan: a.jumlah, akanGanti: a.ada.filter(function(x) { return x.smt === smt; }).length,
      terpotong: !!a.terpotongSmt[smt],
      topik: daftar.map(function(x, i) { return (i + 1) + '. ' + x.topik + (x.halaman ? ' (hlm ' + x.halaman + ')' : ''); })
    };
  });
  return {
    simpan: !!disimpan, semester: sem, buku: a.buku, bacaanTerisi: Object.keys(a.bacaanTulis).length, soalTerisi: Object.keys(a.bankTulis).length,
    peringatan: a.peringatan
  };
}

// simpan=false: hanya memeriksa dan memberi ringkasan. simpan=true: menulis ke sheet Kurikulum.
function waStafKurikulumImporManual(token, idMapel, daftarTeks, opsi) {
  var r = wajibMapel_(token, idMapel);
  opsi = opsi || {};
  if (!opsi.simpan) return kurRingkasImpor_(kurAnalisisImpor_(idMapel, daftarTeks, opsi), false);
  var kunci = kmKunciUnik_();
  kunci.waitLock(30000);
  try {
    var a = kurAnalisisImpor_(idMapel, daftarTeks, opsi); // dihitung ulang di dalam kunci agar sesuai isi sheet terbaru
    var sh = kurSheet_();
    var waktu = kurWaktu_();
    a.semuaSmt.forEach(function(smt) { kurHapusBaris_(idMapel, smt); });
    var baris = [];
    a.semuaSmt.forEach(function(smt) {
      a.petaSmt[smt].forEach(function(x, i) {
        baris.push([String(idMapel), smt, i + 1, x.bab, x.judulBab, x.topik, x.halaman, x.tp, x.narasi, x.tanya, '', '', '', a.buku, waktu, r.p.nama, '']);
      });
    });
    if (baris.length) sh.getRange(sh.getLastRow() + 1, 1, baris.length, KUR.HEADERS.length).setValues(baris);
    var tulisBacaan = 0, tulisSoal = 0;
    var sekarang = kurBaca_(idMapel);
    sekarang.forEach(function(x) {
      var kode = x.smt + '-' + x.minggu;
      var t = a.bacaanTulis[kode], b = a.bankTulis[kode];
      if (t) {
        sh.getRange(x.baris, KUR.K.bacaan + 1).setValue(t);
        sh.getRange(x.baris, KUR.K.waktu + 1).setValue(waktu);
        sh.getRange(x.baris, KUR.K.oleh + 1).setValue(r.p.nama);
        tulisBacaan++;
        // bacaan diganti: bank soal lama tidak lagi sesuai, kecuali ada bank baru dari hasil yang sama
        if (!b && x.bank.length) sh.getRange(x.baris, KUR.K.bank + 1).setValue('');
      }
      if (b) {
        sh.getRange(x.baris, KUR.K.bank + 1).setValue(JSON.stringify(b));
        sh.getRange(x.baris, KUR.K.waktu + 1).setValue(waktu);
        tulisSoal++;
      }
    });
    var ringkas = kurRingkasImpor_(a, true);
    ringkas.bacaanTerisi = tulisBacaan;
    ringkas.soalTerisi = tulisSoal;
    kmCatat_(r.p, idMapel, 'Impor rencana manual', a.semuaSmt.map(function(s) { return 'Semester ' + s + ': ' + a.petaSmt[s].length + ' sesi'; }).join(', ') + (a.semuaSmt.length ? ' · ' : '') + tulisBacaan + ' bacaan · ' + tulisSoal + ' bank soal', 'OK');
    return ringkas;
  } finally {
    kunci.releaseLock();
  }
}


// Memeriksa apakah pembagian bab masuk akal: satu bab yang memuat terlalu banyak sesi berarti Gemini menumpuk semua sesi ke satu bab.
function kurPeringatBab_(minggu, smt) {
  var hitung = {}, urut = [];
  (minggu || []).forEach(function (x) {
    var k = String(x.bab) + '|' + String(x.judulBab || '');
    if (!hitung[k]) { hitung[k] = 0; urut.push(k); }
    hitung[k]++;
  });
  var n = (minggu || []).length;
  if (n < 6) return '';
  var besar = urut.filter(function (k) { return hitung[k] > 8; });
  if (!besar.length) return '';
  var k0 = besar[0].split('|');
  return 'Semester ' + smt + ': ' + n + ' sesi hanya dikelompokkan ke ' + urut.length + ' bab, dan bab "' + (k0[1] || k0[0]) + '" memuat ' + hitung[besar[0]] + ' sesi. Kemungkinan pembagian bab belum sesuai daftar isi buku; periksa judul bab setelah disimpan, atau ulangi dengan prompt yang menyebut daftar isi.';
}


// ---------- RPP: PDF untuk pratinjau (HTML dari klien -> PDF) ----------
function waStafRppPdf(token, idMapel, html) {
  rppAkses_(token, idMapel, false); // tutor pengampu, admin, dan pimpinan (lihat saja)
  html = String(html || '');
  if (html.length < 50) throw new Error('Dokumen RPP kosong.');
  if (html.length > 3000000) throw new Error('Dokumen RPP terlalu besar untuk dibuat PDF.');
  var pdf = Utilities.newBlob(html, 'text/html', 'rpp.html').getAs('application/pdf');
  return { b64: Utilities.base64Encode(pdf.getBytes()) };
}

// ---------- Cetak umum: HTML dari klien -> PDF (laporan kesiapan dll.) ----------
function waStafHtmlPdf(token, html) {
  stafDariToken_(token);
  html = String(html || '');
  if (html.length < 50) throw new Error('Dokumen kosong.');
  if (html.length > 3000000) throw new Error('Dokumen terlalu besar untuk dibuat PDF.');
  var pdf = Utilities.newBlob(html, 'text/html', 'dokumen.html').getAs('application/pdf');
  return { b64: Utilities.base64Encode(pdf.getBytes()) };
}

// ---------- analisa kesiapan semua rombel untuk memulai e-learning ----------
// Satu baris per kelas: berapa mapel yang sudah lengkap pada kerangka CP-TP-ATP, rencana sesi, bacaan, bank soal, materi, diskusi, dan RPP.
function waStafKesiapanSemua(token) {
  var p = stafDariToken_(token);
  var cfg = taBaca_();
  var perSmt = kurDaftarNomorMateri_(cfg).length;
  var target = perSmt * 2;
  var daftar = mapelAktifSemua_();
  if (p.peran !== 'Admin') {
    var milik = {};
    bacaEnrollment_().forEach(function(e) { if (e.idPengguna === p.id) milik[e.idMapel] = true; });
    daftar = daftar.filter(function(x) { return milik[x.idMapel]; });
  }
  if (!daftar.length) throw new Error('Belum ada mata pelajaran aktif yang dapat Anda lihat.');
  // baca setiap sheet sekali saja
  var kur = {};
  kurSheet_().getDataRange().getValues().slice(1).forEach(function(r, i) {
    var id = sTeks_(r[KUR.K.mapel]).trim();
    if (!id) return;
    var o = kurBarisKeObjek_(r, i + 1);
    (kur[id] || (kur[id] = [])).push(o);
  });
  var rppSemua = {};
  rppSheet_().getDataRange().getValues().slice(1).forEach(function(r) {
    var id = sTeks_(r[RPP.K.mapel]).trim();
    var smt = Number(r[RPP.K.smt]) || 0, mg = Number(r[RPP.K.minggu]) || 0;
    if (!id || smt < 1 || mg < 1) return;
    (rppSemua[id] || (rppSemua[id] = {}))[smt + '|' + mg] = rppBarisKeBlok_(r);
  });
  var h = CONFIG.HEADERS.MATERI;
  var iMapel = h.indexOf('ID Mapel'), iJenis = h.indexOf('Jenis');
  var hitung = {};
  getSheetData(CONFIG.SHEETS.MATERI).slice(1).forEach(function(r) {
    var id = sTeks_(r[iMapel]).trim();
    var jenis = sTeks_(r[iJenis]);
    if (!id || (jenis !== 'Materi' && jenis !== 'Diskusi')) return;
    var c = hitung[id] || (hitung[id] = { Materi: 0, Diskusi: 0 });
    c[jenis]++;
  });
  var KOMP = ['kerangka', 'rencana', 'bacaan', 'soal', 'materi', 'diskusi', 'rpp'];
  var grup = {}, urut = [];
  daftar.forEach(function(m) {
    var rows = kur[m.idMapel] || [];
    var bacaan = 0, soal = 0;
    rows.forEach(function(r) {
      if (r.bacaan.length >= KUR.MIN_BACAAN) bacaan++;
      if (r.bank.length >= KUR.MIN_SOAL_BANK) soal++;
    });
    var kerangka = false;
    try { kerangka = !!kfUntukMapel_(m); } catch (e) { kerangka = false; }
    var simpan = rppSemua[m.idMapel] || {};
    var rpp = 0;
    rows.forEach(function(r) {
      var b = simpan[r.smt + '|' + r.minggu];
      if (!b) return;
      var sk = 0;
      try { sk = rppSkor_(b, rppDaftar_(r.tp)); } catch (e) { sk = 0; }
      if (sk >= 5) rpp++;
    });
    var cm = hitung[m.idMapel] || { Materi: 0, Diskusi: 0 };
    var ada = { kerangka: kerangka ? 1 : 0, rencana: rows.length, bacaan: bacaan, soal: soal, materi: cm.Materi, diskusi: cm.Diskusi, rpp: rpp };
    var key = String(m.idRombel);
    if (!grup[key]) {
      grup[key] = { idRombel: key, namaRombel: m.namaRombel, mapel: [], idMapelPertama: m.idMapel, jumlah: 0, siap: 0, persen: 0, komponen: {} };
      KOMP.forEach(function(k) { grup[key].komponen[k] = { ok: 0, kurang: [] }; });
      urut.push(key);
    }
    var g = grup[key];
    g.jumlah++;
    var lengkap = true, jml = 0;
    KOMP.forEach(function(k) {
      var tgt = k === 'kerangka' ? 1 : target;
      var ok = ada[k] >= tgt;
      jml += Math.min(ada[k], tgt) / tgt;
      if (ok) g.komponen[k].ok++; else { g.komponen[k].kurang.push(m.namaMapel + ' (' + Math.min(ada[k], tgt) + '/' + tgt + ')'); lengkap = false; }
    });
    if (lengkap) g.siap++;
    g.persen += jml / KOMP.length;
  });
  var rombel = urut.map(function(k) {
    var g = grup[k];
    g.persen = Math.round(g.persen / g.jumlah * 100);
    g.status = g.siap === g.jumlah ? 'siap' : (g.persen >= 75 ? 'hampir' : 'belum');
    return g;
  });
  rombel.sort(function(a, b) { return String(a.namaRombel).localeCompare(String(b.namaRombel)); });
  return { targetSesi: target, perSemester: perSmt, rombel: rombel };
}
