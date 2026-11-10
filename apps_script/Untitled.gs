// ============================================
// JADWAL UJIAN TERKUNCI + SOAL ACAK PER SISWA DARI BANK SOAL
// ============================================
// UTS/UAS tiap mapel: tutor menetapkan hari, jam mulai, durasi, nilai minimal (KKM)
// dan jumlah soal SEKALI SAJA (terkunci). Soal tidak disimpan tetap: tiap siswa
// mendapat undian soal berbeda dari bank soal sesi yang masuk cakupan (UTS = sesi
// 1-8, UAS = seluruh sesi materi semester itu), dengan urutan soal dan urutan
// pilihan jawaban berbeda. Kunci jawaban dihitung ulang di server dari undian yang
// sama (deterministik), jadi tidak pernah dikirim ke siswa.
//
// Sheet (dibuat otomatis): Jadwal Ujian, Pengajuan Ujian, Permohonan Ujian,
// Akses Ujian, Hasil Ujian. Alur susulan/remedial/perubahan ada di PengajuanUjian.gs.

var UJ = {
  SH: { JADWAL: 'Jadwal Ujian', AJU: 'Pengajuan Ujian', PERM: 'Permohonan Ujian', AKSES: 'Akses Ujian', HASIL: 'Hasil Ujian' },
  H: {
    JADWAL: ['Kunci', 'ID Mapel', 'Semester', 'Jenis', 'ID Ujian', 'Tanggal', 'Jam Mulai', 'Durasi Menit', 'KKM', 'Jumlah Soal',
      'Mudah', 'Sedang', 'Sulit', 'Dibuat Oleh', 'Dibuat Pada', 'Diubah Oleh', 'Diubah Pada', 'Catatan', 'Mode', 'Terpusat', 'Judul'],
    AJU: ['ID', 'Waktu', 'Jenis', 'ID Mapel', 'Semester', 'Jenis Ujian', 'ID Ujian', 'ID Rombel', 'Nama Siswa', 'Alasan',
      'Status', 'Tutor', 'Waktu Tutor', 'Catatan Tutor', 'ID Permohonan'],
    PERM: ['ID', 'Waktu', 'Jenis', 'ID Mapel', 'Semester', 'Jenis Ujian', 'ID Ujian', 'Diajukan Oleh', 'Siswa', 'Alasan',
      'Usulan Tanggal', 'Usulan Jam', 'Status', 'Tujuan', 'Waktu Disposisi', 'Putusan', 'Pemutus', 'Waktu Putusan',
      'Catatan Putusan', 'Akses Mulai', 'Akses Selesai', 'Dibuka Oleh', 'Waktu Dibuka', 'Catatan Admin'],
    AKSES: ['ID', 'ID Ujian', 'ID Rombel', 'Nama Siswa', 'Jenis', 'Mulai', 'Selesai', 'Status', 'ID Permohonan', 'Dibuka Oleh',
      'Waktu Dibuka', 'Ronde'],
    HASIL: ['ID Ujian', 'ID Rombel', 'Nama Siswa', 'Ronde', 'Jenis', 'Nilai', 'Maks', 'Persen', 'Benar', 'Total', 'Waktu']
  },
  MASUK_MENIT: 15,      // siswa boleh MULAI sampai sekian menit setelah jam mulai (waktu tetap penuh sejak ia mulai)
  GRACE_MENIT: 3,       // kelonggaran kirim setelah waktu pengerjaan habis
  JUMLAH_BAWAAN: 50,
  DURASI_MIN: 10,
  DURASI_MAKS: 240,
  PIMPINAN: ['Kepala Sekolah', 'Koordinator Kurikulum'],
  BAWAAN_KOMPOSISI: { mudah: 0.3, sulit: 0.2 }   // sisanya sedang
};

// ---------------- sheet ----------------
function ujTabel_(kunci) {
  var nama = UJ.SH[kunci], head = UJ.H[kunci];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(nama);
  if (!sh) {
    sh = ss.insertSheet(nama);
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(2, 1, 2000, head.length).setNumberFormat('@');
  } else {
    var v0 = sh.getDataRange().getValues();
    var h0 = (v0[0] || []).length;
    if (h0 && h0 < head.length) sh.getRange(1, h0 + 1, 1, head.length - h0).setValues([head.slice(h0)]);
  }
  return sh;
}

function ujBaca_(kunci) {
  var sh = ujTabel_(kunci), head = UJ.H[kunci], v = sh.getDataRange().getValues(), out = [];
  for (var i = 1; i < v.length; i++) {
    if (!sTeks_(v[i][0]).trim()) continue;
    var o = { _baris: i + 1 };
    head.forEach(function (h, j) { o[h] = sTeks_(v[i][j]); });
    out.push(o);
  }
  return out;
}

function ujTambah_(kunci, o) {
  var sh = ujTabel_(kunci), head = UJ.H[kunci];
  var baris = head.map(function (h) { return o[h] === undefined || o[h] === null ? '' : o[h]; });
  var r = sh.getLastRow() + 1;
  sh.getRange(r, 1, 1, head.length).setNumberFormat('@');
  sh.getRange(r, 1, 1, head.length).setValues([baris]);
  return r;
}

function ujUbah_(kunci, baris, o) {
  var sh = ujTabel_(kunci), head = UJ.H[kunci];
  Object.keys(o).forEach(function (k) {
    var j = head.indexOf(k);
    if (j >= 0) sh.getRange(baris, j + 1).setValue(o[k]);
  });
}

// ---------------- waktu ----------------
function ujNow_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'); }

function ujTgl_(s) {
  var m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  return m ? m[1] + '-' + m[2] + '-' + m[3] : '';
}

function ujJam_(s) {
  var t = String(s || '').trim();
  var m = /^\d{4}-\d{2}-\d{2}[ T](\d{1,2}):(\d{2})/.exec(t) || /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return '';
  var j = Number(m[1]), mn = Number(m[2]);
  if (j > 23 || mn > 59) return '';
  return ('0' + j).slice(-2) + ':' + ('0' + mn).slice(-2);
}

function ujMs_(tgl, jam) {
  var t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ujTgl_(tgl));
  var j = /^(\d{2}):(\d{2})$/.exec(ujJam_(jam));
  if (!t || !j) return NaN;
  return new Date(Number(t[1]), Number(t[2]) - 1, Number(t[3]), Number(j[1]), Number(j[2]), 0, 0).getTime();
}

// "yyyy-MM-dd HH:mm[:ss]" (atau Date dari sel) -> ms
function ujMsTeks_(v) {
  if (v instanceof Date) return v.getTime();
  var s = String(v || '').trim();
  if (!s) return NaN;
  var m = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2})/.exec(s);
  return m ? ujMs_(m[1], m[2]) : NaN;
}

function ujFmt_(ms, f) { return Utilities.formatDate(new Date(ms), Session.getScriptTimeZone(), f); }

function ujTeksWaktu_(ms) {
  var hari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  return hari[new Date(ms).getDay()] + ', ' + ujFmt_(ms, 'dd/MM/yyyy HH:mm');
}

// ---------------- jadwal ----------------
function ujKunciJadwal_(idMapel, smt, jenis) { return String(idMapel) + '|' + smt + '|' + jenis; }

function ujJadwalObj_(r) {
  var durasi = parseInt(r['Durasi Menit'], 10) || 0;
  var mulaiMs = ujMs_(r['Tanggal'], r['Jam Mulai']);
  return {
    baris: r._baris, kunci: r['Kunci'], idMapel: r['ID Mapel'], smt: parseInt(r['Semester'], 10) || 0, jenis: r['Jenis'],
    idUjian: r['ID Ujian'], tanggal: ujTgl_(r['Tanggal']), jam: ujJam_(r['Jam Mulai']), durasi: durasi,
    kkm: parseFloat(r['KKM']) || 0, jumlah: parseInt(r['Jumlah Soal'], 10) || 0,
    komposisi: { mudah: parseInt(r['Mudah'], 10) || 0, sedang: parseInt(r['Sedang'], 10) || 0, sulit: parseInt(r['Sulit'], 10) || 0 },
    mode: r['Mode'] === 'Kertas' ? 'Kertas' : 'APK', terpusat: r['Terpusat'] === 'Ya', judulKhusus: r['Judul'] || '',
    dibuatOleh: r['Dibuat Oleh'], dibuatPada: r['Dibuat Pada'], diubahOleh: r['Diubah Oleh'], diubahPada: r['Diubah Pada'], catatan: r['Catatan'],
    mulaiMs: mulaiMs, masukSampaiMs: mulaiMs + UJ.MASUK_MENIT * 60000, akhirMs: mulaiMs + durasi * 60000
  };
}

function ujJadwalSemua_() { return ujBaca_('JADWAL').map(ujJadwalObj_); }

function ujJadwalDariUjian_(idUjian) {
  if (!idUjian) return null;
  var semua = ujJadwalSemua_();
  for (var i = 0; i < semua.length; i++) if (String(semua[i].idUjian) === String(idUjian)) return semua[i];
  return null;
}

// dipakai taGerbang_: ujian yang dikelola jadwal tidak memakai gerbang sesi mingguan
function ujKelola_(idUjian) { return !!ujJadwalDariUjian_(idUjian); }

function ujJudul_(jenis, smt) { if (jenis === 'LAIN') return 'Ujian Lainnya Semester ' + smt; return (jenis === 'UTS' ? 'Ujian Tengah Semester ' : 'Ujian Akhir Semester ') + smt; }

// ---------------- bank soal dan undian ----------------
function ujPool_(idMapel, smt, jenis) {
  var cfg = taBaca_(), nomor = kurDaftarNomorMateri_(cfg);
  var cakupan = kurCakupanUjian_(kurBaca_(idMapel), cfg, smt, jenis, true);
  var sesi = [], tanpaBank = [], rinci = [], total = 0;
  cakupan.forEach(function (x) {
    var no = nomor[x.minggu - 1] || x.minggu, n = x.bank.length;
    rinci.push({ sesi: no, soal: n, bacaan: x.bacaan.length >= KUR.MIN_BACAAN });
    if (n >= KUR.MIN_SOAL_BANK) { sesi.push(x); total += n; } else tanpaBank.push(no);
  });
  return { sesi: sesi, tanpaBank: tanpaBank, rinci: rinci, total: total, jumlahSesi: cakupan.length };
}

function ujRng_(benih) {
  var h = kurBenih_(benih) >>> 0;
  return function () {
    h = (h + 0x6D2B79F5) >>> 0;
    var t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ujAcak_(arr, rnd) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(rnd() * (i + 1)), t = a[i];
    a[i] = a[j]; a[j] = t;
  }
  return a;
}

// Undi soal: tiap tingkat dibagi rata antar sesi (putaran), urutan soal dan pilihan jawaban diacak.
function ujUndi_(sesiList, komp, maksOpsi, benih) {
  var rnd = ujRng_(benih);
  var urutan = ujAcak_(sesiList.map(function (x, i) { return i; }), rnd);
  var terpilih = [], sisa = { mudah: [], sedang: [], sulit: [] }, kurang = {};
  KUR_TINGKAT.forEach(function (t) {
    var antri = urutan.map(function (si) {
      return ujAcak_(sesiList[si].bank.filter(function (q) { return q.tingkat === t; }), rnd).map(function (q) { return { q: q, t: t }; });
    });
    var perlu = komp[t] || 0, ambil = 0, ada = true;
    while (ambil < perlu && ada) {
      ada = false;
      antri.forEach(function (a) { if (ambil < perlu && a.length) { terpilih.push(a.shift()); ambil++; ada = true; } });
    }
    antri.forEach(function (a) { a.forEach(function (e) { sisa[t].push(e); }); });
    if (ambil < perlu) kurang[t] = perlu - ambil;
  });
  Object.keys(kurang).forEach(function (t) {
    var ti = KUR_TINGKAT.indexOf(t), butuh = kurang[t], kand = [];
    KUR_TINGKAT.forEach(function (o) { if (o !== t) sisa[o].forEach(function (e) { kand.push(e); }); });
    kand = ujAcak_(kand, rnd).sort(function (a, b) { return Math.abs(KUR_TINGKAT.indexOf(a.t) - ti) - Math.abs(KUR_TINGKAT.indexOf(b.t) - ti); });
    for (var i = 0; i < kand.length && butuh > 0; i++) {
      if (kand[i].dipakai) continue;
      kand[i].dipakai = true; terpilih.push(kand[i]); butuh--;
    }
  });
  terpilih = ujAcak_(terpilih, rnd);
  return terpilih.map(function (e, i) {
    var q = e.q, daftar = [];
    KM.HURUF_OPSI.forEach(function (h) { if (q.opsi[h]) daftar.push({ t: q.opsi[h], benar: h === q.kunci }); });
    daftar = ujAcak_(daftar, rnd);
    while (daftar.length > maksOpsi) {
      for (var k = daftar.length - 1; k >= 0; k--) { if (!daftar[k].benar) { daftar.splice(k, 1); break; } }
    }
    var opsi = {}, kunci = '';
    daftar.forEach(function (o, j) { opsi[KM.HURUF_OPSI[j]] = o.t; if (o.benar) kunci = KM.HURUF_OPSI[j]; });
    return { id: 'S' + ('00' + (i + 1)).slice(-3), pertanyaan: q.pertanyaan, opsi: opsi, kunci: kunci, tingkat: e.t };
  });
}

function ujNormNama_(n) { return normNama_(n); }

function ujSamaSiswa_(row, idUjian, idRombel, nama) {
  return String(row['ID Ujian']) === String(idUjian) && String(row['ID Rombel']) === String(idRombel) && ujNormNama_(row['Nama Siswa']) === ujNormNama_(nama);
}

// ronde = jumlah akses personal (susulan/remedial) yang sudah dipakai siswa ini; 0 = ujian awal
function ujRonde_(idUjian, idRombel, nama) {
  var n = 0;
  ujBaca_('AKSES').forEach(function (a) { if (ujSamaSiswa_(a, idUjian, idRombel, nama) && a['Status'] === 'Dipakai') n++; });
  return n;
}

function ujJenisSitting_(idUjian, idRombel, nama) {
  var jenis = 'Awal';
  ujBaca_('AKSES').forEach(function (a) { if (ujSamaSiswa_(a, idUjian, idRombel, nama) && a['Status'] === 'Dipakai') jenis = a['Jenis']; });
  return jenis;
}

// daftar soal untuk satu siswa. lengkap=true -> berisi kunci dan poin (untuk penilaian); false -> untuk ditampilkan.
function ujSoalSiswa_(idUjian, idRombel, nama, lengkap) {
  var j = ujJadwalDariUjian_(idUjian);
  if (!j) return lengkap ? getSoalLengkapUntukUjian_(idUjian) : getSoalUntukUjian_(idUjian);
  var pool = ujPool_(j.idMapel, j.smt, j.jenis);
  if (!pool.sesi.length) return [];
  var maksOpsi = kurPaket_(getNamaRombel_(idRombel)) === 'A' ? 4 : 5;
  var benih = [idUjian, idRombel, ujNormNama_(nama), ujRonde_(idUjian, idRombel, nama)].join('|');
  var daftar = ujUndi_(pool.sesi, j.komposisi, maksOpsi, benih);
  var poin = daftar.length ? 100 / daftar.length : 0;   // total selalu 100; nilai dibulatkan 2 desimal saat dicatat
  return daftar.map(function (s) {
    return lengkap ? { id: s.id, poin: poin, kunci: s.kunci } : { id: s.id, pertanyaan: s.pertanyaan, opsi: s.opsi, poin: poin };
  });
}

// ---------------- sitting siswa ----------------
function ujHasilSiswa_(idUjian, idRombel, nama) {
  var baris = ujBaca_('HASIL').filter(function (h) { return ujSamaSiswa_(h, idUjian, idRombel, nama); });
  var terbaik = null, pernahSusulan = false;
  baris.forEach(function (h) {
    var persen = parseFloat(h['Persen']) || 0;
    if (!terbaik || persen > terbaik.persen) terbaik = { nilai: parseFloat(h['Nilai']) || 0, maks: parseFloat(h['Maks']) || 0, persen: persen, ronde: parseInt(h['Ronde'], 10) || 0, jenis: h['Jenis'] };
    if (h['Jenis'] === 'Susulan') pernahSusulan = true;
  });
  return { ada: baris.length > 0, terbaik: terbaik, pernahSusulan: pernahSusulan, jumlah: baris.length, baris: baris };
}

function ujAksesSiswa_(idUjian, idRombel, nama) {
  return ujBaca_('AKSES').filter(function (a) { return ujSamaSiswa_(a, idUjian, idRombel, nama); });
}

function ujAksesTerbuka_(idUjian, idRombel, nama, nowMs) {
  var hasil = null;
  ujAksesSiswa_(idUjian, idRombel, nama).forEach(function (a) {
    if (a['Status'] !== 'Terbuka') return;
    var m = ujMsTeks_(a['Mulai']), s = ujMsTeks_(a['Selesai']);
    if (nowMs >= m && nowMs <= s) hasil = a;
  });
  return hasil;
}

function ujAksesMendatang_(idUjian, idRombel, nama, nowMs) {
  var hasil = null;
  ujAksesSiswa_(idUjian, idRombel, nama).forEach(function (a) {
    if (a['Status'] !== 'Terbuka') return;
    if (ujMsTeks_(a['Mulai']) > nowMs && !hasil) hasil = a;
  });
  return hasil;
}

function ujMsSel_(v) {
  if (v instanceof Date) return v.getTime();
  return ujMsTeks_(v);
}

// siswa memulai tapi tidak mengirim sampai waktunya habis -> dianggap selesai dengan nilai 0
function ujAkhiriKadaluarsa_(j, idRombel, nama, sesi) {
  var sh = sesi.sheet, cols = sesi.cols;
  sh.getRange(sesi.rowIndex, cols.status).setValue('Selesai');
  sh.getRange(sesi.rowIndex, cols.nilaiTotal).setValue(0);
  sh.getRange(sesi.rowIndex, cols.waktuSelesai).setValue(new Date());
  ujCatatHasil_(j, idRombel, nama, 0, 100, 0, 0);
  ujTulisJawaban_(j, idRombel, nama, 'Waktu pengerjaan habis, jawaban tidak terkirim', 0);
}

function ujTulisJawaban_(j, idRombel, nama, ringkasan, nilai) {
  var sheet = getSheet(CONFIG.SHEETS.JAWABAN), v = sheet.getDataRange().getValues();
  var found = getMateriById_(j.idUjian);
  var judul = found ? found.row[found.cols.judul - 1] : ujJudul_(j.jenis, j.smt);
  var namaMapel = getNamaMapel_(j.idMapel), now = new Date();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][3]) === String(j.idUjian) && v[i][6] === nama) {
      sheet.getRange(i + 1, 1, 1, 10).setValues([[idRombel, j.idMapel, namaMapel, j.idUjian, judul, 'Ujian', nama, ringkasan, nilai, now]]);
      return;
    }
  }
  sheet.appendRow([idRombel, j.idMapel, namaMapel, j.idUjian, judul, 'Ujian', nama, ringkasan, nilai, now]);
}

function ujNilaiJawabanLama_(idUjian, nama) {
  var v = getSheet(CONFIG.SHEETS.JAWABAN).getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][3]) === String(idUjian) && v[i][6] === nama) {
      var n = parseFloat(v[i][8]);
      return isNaN(n) ? null : n;
    }
  }
  return null;
}

function ujCatatHasil_(j, idRombel, nama, nilai, maks, benar, total) {
  var persen = maks > 0 ? Math.round((nilai / maks) * 1000) / 10 : 0;
  ujTambah_('HASIL', {
    'ID Ujian': j.idUjian, 'ID Rombel': idRombel, 'Nama Siswa': nama, 'Ronde': ujRonde_(j.idUjian, idRombel, nama),
    'Jenis': ujJenisSitting_(j.idUjian, idRombel, nama), 'Nilai': nilai, 'Maks': maks, 'Persen': persen, 'Benar': benar, 'Total': total, 'Waktu': ujNow_()
  });
  return persen;
}

// ---------------- status untuk siswa ----------------
function ujStatusAju_(a, perm) {
  var s = a['Status'];
  if (s === 'Menunggu Tutor') return 'Menunggu persetujuan tutor.';
  if (s === 'Ditolak Tutor') return 'Ditolak tutor' + (a['Catatan Tutor'] ? ': ' + a['Catatan Tutor'] : '.');
  if (s === 'Ditolak Admin') return 'Ditolak admin' + (perm && perm['Catatan Admin'] ? ': ' + perm['Catatan Admin'] : '.');
  if (s === 'Ditolak Pimpinan') return 'Tidak disetujui' + (perm && perm['Pemutus'] ? ' oleh ' + perm['Pemutus'] : '') + (perm && perm['Catatan Putusan'] ? ': ' + perm['Catatan Putusan'] : '.');
  if (s === 'Akses Dibuka') return 'Disetujui. Akses ujian dibuka.';
  if (s === 'Diteruskan') {
    var ps = perm ? perm['Status'] : '';
    if (ps === 'Didisposisikan') return 'Diteruskan tutor, sedang ditinjau ' + (perm['Tujuan'] || 'pimpinan') + '.';
    if (ps === 'Disetujui') return 'Disetujui pimpinan. Menunggu admin menetapkan tanggal dan jam.';
    return 'Diteruskan tutor ke admin, menunggu disposisi.';
  }
  return s;
}

function ujStatus_(j, idRombel, nama) {
  var now = Date.now();
  var sesi = cariBarisSesiUjian_(j.idUjian, idRombel, nama);
  if (sesi && String(sesi.row[sesi.cols.status - 1]) === 'Berlangsung') {
    var wm = ujMsSel_(sesi.row[sesi.cols.waktuMulai - 1]);
    if (wm && now > wm + (j.durasi + UJ.GRACE_MENIT) * 60000) {
      ujAkhiriKadaluarsa_(j, idRombel, nama, sesi);
      sesi = cariBarisSesiUjian_(j.idUjian, idRombel, nama);
    }
  }
  var st = sesi ? String(sesi.row[sesi.cols.status - 1]) : '';
  var terkunci = !!(sesi && sesi.row[sesi.cols.terkunci - 1] === true);
  var berlangsung = st === 'Berlangsung';
  var hasil = ujHasilSiswa_(j.idUjian, idRombel, nama);
  var fase = now < j.mulaiMs ? 'belum' : (now <= j.masukSampaiMs ? 'masuk' : 'tutup');
  var akses = ujAksesTerbuka_(j.idUjian, idRombel, nama, now);
  var aksesNanti = akses ? null : ujAksesMendatang_(j.idUjian, idRombel, nama, now);
  var aju = null, perm = null;
  ujBaca_('AJU').forEach(function (a) {
    if (String(a['ID Ujian']) === String(j.idUjian) && String(a['ID Rombel']) === String(idRombel) && ujNormNama_(a['Nama Siswa']) === ujNormNama_(nama)) aju = a;
  });
  if (aju && aju['ID Permohonan']) {
    ujBaca_('PERM').forEach(function (p) { if (p['ID'] === aju['ID Permohonan']) perm = p; });
  }
  var ajuTerbuka = !!(aju && (aju['Status'] === 'Menunggu Tutor' || aju['Status'] === 'Diteruskan'));
  var punyaAkses = !!(akses || aksesNanti);
  var tombol = '';
  if (!ajuTerbuka && !punyaAkses && !berlangsung) {
    if (hasil.ada && hasil.terbaik && hasil.terbaik.persen < j.kkm) tombol = hasil.pernahSusulan ? 'remedial_susulan' : 'remedial';
    else if (!hasil.ada && fase === 'tutup') tombol = 'susulan';
  }
  var bolehMulai = j.mode !== 'Kertas' && !terkunci && (berlangsung || !!akses || (!hasil.ada && !st && fase === 'masuk') || (!hasil.ada && st === 'Menunggu' && fase === 'masuk'));
  var out = {
    kunci: j.kunci, mode: j.mode, jenisUjian: j.jenis, smt: j.smt, judul: j.judulKhusus || ujJudul_(j.jenis, j.smt),
    tanggal: j.tanggal, jam: j.jam, durasi: j.durasi, kkm: j.kkm, jumlah: j.jumlah,
    mulaiMs: j.mulaiMs, masukSampaiMs: j.masukSampaiMs, teksMulai: ujTeksWaktu_(j.mulaiMs), masukMenit: UJ.MASUK_MENIT,
    fase: fase, bolehMulai: bolehMulai, berlangsung: berlangsung, terkunci: terkunci, sekarangMs: now,
    sudahMengerjakan: hasil.ada,
    nilai: hasil.terbaik ? { nilai: hasil.terbaik.nilai, maks: hasil.terbaik.maks, persen: hasil.terbaik.persen } : null,
    lulus: !!(hasil.terbaik && hasil.terbaik.persen >= j.kkm),
    ronde: ujRonde_(j.idUjian, idRombel, nama), jumlahSitting: hasil.jumlah, tombol: tombol,
    akses: akses ? { jenis: akses['Jenis'], mulaiMs: ujMsTeks_(akses['Mulai']), selesaiMs: ujMsTeks_(akses['Selesai']), mulai: akses['Mulai'], selesai: akses['Selesai'] } : null,
    aksesNanti: aksesNanti ? { jenis: aksesNanti['Jenis'], mulaiMs: ujMsTeks_(aksesNanti['Mulai']), selesaiMs: ujMsTeks_(aksesNanti['Selesai']), mulai: aksesNanti['Mulai'], selesai: aksesNanti['Selesai'] } : null,
    pengajuan: aju ? { id: aju['ID'], jenis: aju['Jenis'], status: aju['Status'], teks: ujStatusAju_(aju, perm), waktu: aju['Waktu'], terbuka: ajuTerbuka } : null
  };
  return out;
}

// ---------------- pembungkus endpoint siswa ----------------
function waStatusUjian(idUjian, idRombel, idMapel, nama) {
  var r = waStatusUjianAsli_(idUjian, idRombel, idMapel, nama);
  var j = ujJadwalDariUjian_(idUjian);
  if (!j || !r || !r.sukses || String(j.idMapel) !== String(idMapel)) return r;
  var st = ujStatus_(j, idRombel, nama);
  r.uj = st;
  r.jumlahSoal = j.jumlah;
  r.nilaiMaks = 100;
  if (st.nilai) { r.nilaiTotal = st.nilai.nilai; r.nilaiMaks = st.nilai.maks || 100; }
  r.selesai = !st.berlangsung && st.sudahMengerjakan && !st.bolehMulai;
  if (st.berlangsung) r.selesai = false;
  r.aktif = true;
  return r;
}

function waMulaiUjian(idUjian, idRombel, idMapel, nama, kodeAkses) {
  var j = ujJadwalDariUjian_(idUjian);
  var g = { pesan: '' };
  if (j) {
    var nilSy = '';
    try {
      var sxNil = cariBarisSesiUjian_(j.idUjian, idRombel, nama);
      if (!(sxNil && String(sxNil.row[sxNil.cols.status - 1]) === 'Berlangsung')) nilSy = nilGerbangUjian_(j, idRombel, nama);
    } catch (eNil) {}
    if (nilSy) {
      try { catat_('Siswa', idRombel, nama, 'Mulai ujian', 'ujian ' + idUjian + ' - syarat kehadiran', 'GAGAL'); } catch (e) {}
      return { sukses: false, pesan: nilSy };
    }
  }
  if (j) g = ujGerbangMulai_(j, idMapel, idRombel, nama, kodeAkses);
  if (g.pesan) {
    try { catat_('Siswa', idRombel, nama, 'Mulai ujian', 'ujian ' + idUjian + ' - ' + g.pesan, 'GAGAL'); } catch (e) {}
    return { sukses: false, pesan: g.pesan };
  }
  if (j && !g.lanjutMs && String(j.idMapel) === String(idMapel) && !ujPool_(j.idMapel, j.smt, j.jenis).sesi.length) {
    if (g.akses) ujUbah_('AKSES', g.akses._baris, { 'Status': 'Terbuka' });
    return { sukses: false, pesan: 'Soal ujian ini belum disiapkan oleh tutor. Hubungi tutor Anda.' };
  }
  var r = j ? waMulaiUjianAsli_(idUjian, idRombel, idMapel, nama, kodeAkses) : waMulaiUjianLama_(idUjian, idRombel, idMapel, nama, kodeAkses);
  if (!j) return r;
  if (!r || !r.sukses) {
    if (g.akses) ujUbah_('AKSES', g.akses._baris, { 'Status': 'Terbuka' });
    try { catat_('Siswa', idRombel, nama, 'Mulai ujian', 'ujian ' + idUjian + (r && r.pesan ? ' - ' + r.pesan : ''), 'GAGAL'); } catch (e) {}
    return r;
  }
  if (g.lanjutMs) {
    var s2 = cariBarisSesiUjian_(idUjian, idRombel, nama);
    if (s2) s2.sheet.getRange(s2.rowIndex, s2.cols.waktuMulai).setValue(new Date(g.lanjutMs));
    r.waktuMulaiMs = g.lanjutMs;
  }
  r.jenisSitting = ujJenisSitting_(idUjian, idRombel, nama);
  try { catat_('Siswa', idRombel, nama, 'Mulai ujian', 'ujian ' + idUjian + (g.lanjutMs ? ' (lanjut)' : ' (' + r.jenisSitting + ')'), 'OK'); } catch (e) {}
  return r;
}

// Gerbang mulai untuk ujian terjadwal. Mengembalikan {pesan} (kosong = lolos), {akses} bila memakai akses personal,
// {lanjutMs} bila siswa melanjutkan sitting yang sedang berjalan.
function ujGerbangMulai_(j, idMapel, idRombel, nama, kodeAkses) {
  if (String(j.idMapel) !== String(idMapel)) return { pesan: '' };
  if (j.mode === 'Kertas') return { pesan: 'Ujian ini dikerjakan di kertas, di kelas, bersama pengawas. Tidak dikerjakan di aplikasi.' };
  var now = Date.now();
  var sesi = cariBarisSesiUjian_(j.idUjian, idRombel, nama);
  var st = sesi ? String(sesi.row[sesi.cols.status - 1]) : '';
  if (sesi && st === 'Berlangsung') {
    var wm = ujMsSel_(sesi.row[sesi.cols.waktuMulai - 1]);
    if (wm && now <= wm + (j.durasi + UJ.GRACE_MENIT) * 60000) return { pesan: '', lanjutMs: wm };
    ujAkhiriKadaluarsa_(j, idRombel, nama, sesi);
    sesi = cariBarisSesiUjian_(j.idUjian, idRombel, nama);
    st = 'Selesai';
  }
  var ak = ujAksesTerbuka_(j.idUjian, idRombel, nama, now);
  if (ak) {
    if (!cekKodeAksesSiswa_(idRombel, nama, kodeAkses)) return { pesan: '' };
    if (sesi && sesi.row[sesi.cols.terkunci - 1] === true) return { pesan: '' };
    if (sesi && st === 'Selesai') {
      sesi.sheet.getRange(sesi.rowIndex, sesi.cols.status).setValue('Menunggu');
      sesi.sheet.getRange(sesi.rowIndex, sesi.cols.percobaan).setValue(0);
      sesi.sheet.getRange(sesi.rowIndex, sesi.cols.nilaiTotal).setValue('');
      sesi.sheet.getRange(sesi.rowIndex, sesi.cols.waktuSelesai).setValue('');
    }
    ujUbah_('AKSES', ak._baris, { 'Status': 'Dipakai', 'Ronde': ujRonde_(j.idUjian, idRombel, nama) + 1 });
    return { pesan: '', akses: ak };
  }
  if (now < j.mulaiMs) return { pesan: 'Ujian belum dibuka. Dijadwalkan ' + ujTeksWaktu_(j.mulaiMs) + ' (' + j.durasi + ' menit).' };
  if (now > j.masukSampaiMs) {
    return { pesan: 'Waktu masuk ujian sudah ditutup (batas masuk ' + ujFmt_(j.masukSampaiMs, 'HH:mm') + '). Bila Anda belum mengerjakan, ajukan ujian susulan dari halaman ujian ini.' };
  }
  return { pesan: '' };
}

function waSubmitUjian(payload) {
  var j = payload ? ujJadwalDariUjian_(payload.idUjian) : null;
  if (!j) return waSubmitUjianLama_(payload);
  var gs = ujGerbangKirim_(j, payload);
  if (gs) {
    try { catat_('Siswa', payload.idRombel, payload.nama, 'Kirim ujian', 'ujian ' + payload.idUjian + ' - ' + gs, 'GAGAL'); } catch (e) {}
    return { sukses: false, pesan: gs };
  }
  var lama = ujNilaiJawabanLama_(payload.idUjian, payload.nama);
  var r = waSubmitUjianAsli_(payload);
  if (r && r.sukses) r = ujSetelahKirim_(j, payload, r, lama);
  try { catat_('Siswa', payload.idRombel, payload.nama, 'Kirim ujian', 'ujian ' + payload.idUjian + (r && r.sukses ? ' · nilai ' + r.nilaiTotal : ''), r && r.sukses ? 'OK' : 'GAGAL'); } catch (e) {}
  return r;
}

function ujGerbangKirim_(j, payload) {
  if (String(j.idMapel) !== String(payload.idMapel)) return '';
  var sesi = cariBarisSesiUjian_(j.idUjian, payload.idRombel, payload.nama);
  if (!sesi) return 'Ujian belum dimulai. Buka halaman ujian lalu tekan Mulai Ujian.';
  if (String(sesi.row[sesi.cols.status - 1]) !== 'Berlangsung') return '';
  var wm = ujMsSel_(sesi.row[sesi.cols.waktuMulai - 1]);
  if (wm && Date.now() > wm + (j.durasi + UJ.GRACE_MENIT) * 60000) {
    ujAkhiriKadaluarsa_(j, payload.idRombel, payload.nama, sesi);
    return 'Waktu pengerjaan sudah habis sehingga jawaban tidak dapat diterima. Nilai tercatat 0; ajukan remedial dari halaman ujian bila diperlukan.';
  }
  return '';
}

function ujBulat2_(x) { return Math.round((Number(x) || 0) * 100) / 100; }

function ujSetelahKirim_(j, payload, r, lama) {
  var nilai = ujBulat2_(r.nilaiTotal), maks = ujBulat2_(r.nilaiMaks) || 100;
  if (nilai !== r.nilaiTotal) {
    // rapikan galat pembulatan desimal pada sheet Jawaban dan Percobaan Ujian
    ujTulisJawaban_(j, payload.idRombel, payload.nama, r.jumlahBenar + ' dari ' + r.totalSoal + ' soal benar', nilai);
    var sPer = cariBarisSesiUjian_(j.idUjian, payload.idRombel, payload.nama);
    if (sPer) sPer.sheet.getRange(sPer.rowIndex, sPer.cols.nilaiTotal).setValue(nilai);
    r.nilaiTotal = nilai;
  }
  var persen = ujCatatHasil_(j, payload.idRombel, payload.nama, nilai, maks, r.jumlahBenar, r.totalSoal);
  var ronde = ujRonde_(j.idUjian, payload.idRombel, payload.nama);
  var akhir = nilai;
  if (ronde > 0 && lama !== null && lama > nilai) {
    akhir = lama;
    ujTulisJawaban_(j, payload.idRombel, payload.nama, 'Nilai terbaik dipertahankan (ujian ulang: ' + r.jumlahBenar + ' dari ' + r.totalSoal + ' soal benar)', lama);
  }
  var maksTerbaik = maks;
  var persenAkhir = akhir === nilai ? persen : (maks > 0 ? Math.round((akhir / maks) * 1000) / 10 : 0);
  r.nilaiRonde = nilai;
  r.nilaiAkhir = akhir;
  r.nilaiMaks = maksTerbaik;
  r.persen = persenAkhir;
  r.kkm = j.kkm;
  r.lulus = persenAkhir >= j.kkm;
  r.ronde = ronde;
  r.jenisSitting = ujJenisSitting_(j.idUjian, payload.idRombel, payload.nama);
  return r;
}

// daftar materi siswa: tandai ujian terjadwal (tidak ikut terkunci sesi mingguan, bawa info jadwal)
function ujTandaiMateri_(daftar) {
  var jadwal = ujJadwalSemua_();
  if (!jadwal.length) return daftar;
  var peta = {};
  jadwal.forEach(function (j) { peta[j.idUjian] = j; });
  (daftar || []).forEach(function (m) {
    var j = m.jenis === 'Ujian' ? peta[m.id] : null;
    if (!j) return;
    m.terkunciSesi = false;
    m.ujianTerjadwal = true;
    m.jadwalTeks = ujTeksWaktu_(j.mulaiMs) + ' · ' + j.durasi + ' menit';
    m.batasWaktu = j.tanggal + ' ' + j.jam;
  });
  return daftar;
}

// Ujian yang dikelola jadwal tidak boleh diubah/dihapus/ditutup tutor lewat tab Materi (jadwal terkunci).
// Admin boleh; menghapus item ujian oleh admin ikut melepas jadwalnya agar dapat ditetapkan ulang.
function ujJagaItem_(p, ids, hapus) {
  (ids || []).forEach(function (id) {
    var j = ujJadwalDariUjian_(id);
    if (!j) return;
    if (p.peran !== 'Admin') throw new Error('Ujian ini dikelola lewat tab "Jadwal Ujian" dan jadwalnya terkunci. Perubahan hanya lewat permohonan ke admin.');
    if (hapus) ujTabel_('JADWAL').deleteRow(j.baris);
  });
}
