// ============================================================
// KELOLA MATERI / DISKUSI / UJIAN (CRUD) UNTUK TUTOR & ADMIN
// ------------------------------------------------------------
// Meniru alur Master Control: isi dibuat dulu sebagai PENDING (Status "Draft", perlu direview),
// tutor mengedit seperlunya, lalu menekan POST (Status "Aktif" = tampil ke siswa).
// Status "Selesai" = diarsipkan. Siswa hanya melihat yang Aktif (aturan lama tidak berubah).
//
// Semua fungsi menerima token sesi staf dan memeriksa hak atas mapelnya (wajibMapel_):
// tutor hanya mapel yang di-enroll, admin semua mapel aktif.
// ============================================================

var KM = {
  JENIS_BOLEH: ['Materi', 'Diskusi', 'Ujian'],
  STATUS_BOLEH: ['Draft', 'Aktif', 'Selesai'],
  MAKS_JUDUL: 200,
  MAKS_KONTEN: 30000,
  MAKS_SOAL_PER_UJIAN: 100,
  MAKS_TEKS_SOAL: 1500,
  MAKS_TEKS_OPSI: 400,
  HURUF_OPSI: ['A', 'B', 'C', 'D', 'E']
};

function kmMateri_() {
  var c = materiCols_();
  return { sheet: getSheet(CONFIG.SHEETS.MATERI), c: c, lebar: CONFIG.HEADERS.MATERI.length };
}

function kmSoal_() {
  var c = soalCols_();
  return { sheet: getSheet(CONFIG.SHEETS.SOAL_UJIAN), c: c, lebar: CONFIG.HEADERS.SOAL_UJIAN.length };
}

function kmKunciUnik_() {
  return LockService.getScriptLock();
}

function kmBersih_(v, maks) {
  var t = (v === null || v === undefined) ? '' : String(v);
  t = bersihCite_(t.replace(/\r\n?/g, '\n').replace(/\u0000/g, ''));
  if (t.length > maks) t = t.substring(0, maks);
  return t;
}

// Penanda sitasi hasil Gemini, mis. [cite: 198], [cite: 1, 2], [cite_start], [cite_end]. Dihapus dari semua teks materi.
function bersihCite_(t) {
  if (typeof t !== 'string' || t.indexOf('[') < 0) return t;
  return t.replace(/[ \t]*\[\s*cite(?:_start|_end)?\s*(?::[^\]]*)?\]/gi, '');
}

function kmUrlValid_(u) {
  if (!u) return true;
  return /^https?:\/\/[^\s]+$/i.test(String(u).trim());
}

function kmJumlahSoalPerUjian_() {
  var s = kmSoal_();
  var v = s.sheet.getDataRange().getValues();
  var peta = {};
  for (var i = 1; i < v.length; i++) {
    if (!v[i][s.c.pertanyaan - 1]) continue;
    var id = String(v[i][s.c.idUjian - 1]);
    if (!id) continue;
    peta[id] = (peta[id] || 0) + 1;
  }
  return peta;
}

function kmItemDariBaris_(row, c, jumlahSoal) {
  var jenis = sTeks_(row[c.jenis - 1]).trim();
  var item = {
    id: sTeks_(row[c.id - 1]).trim(),
    jenis: jenis,
    judul: bersihCite_(sTeks_(row[c.judul - 1])),
    konten: bersihCite_(sTeks_(row[c.konten - 1])),
    youtube: sTeks_(row[c.youtube - 1]),
    file: sTeks_(row[c.file - 1]),
    status: sTeks_(row[c.status - 1]).trim() || 'Draft',
    sesi: sTeks_(row[c.sesi - 1]).trim() || 'Sesi 1',
    dibuat: sTeks_(row[c.dibuatPada - 1]),
    durasi: Number(row[c.durasiMenit - 1]) || 0,
    batas: sTeks_(row[c.batasWaktu - 1]),
    boleh: KM.JENIS_BOLEH.indexOf(jenis) >= 0
  };
  if (jenis === 'Ujian') item.jumlahSoal = jumlahSoal[item.id] || 0;
  var ps = taParse_(taBaca_(), item.sesi);
  if (ps) { item.sesiKey = taNama_(ps.smt, ps.n); item.jenisSesi = taJenis_(taBaca_(), ps.n); }
  else { item.sesiKey = ''; item.jenisSesi = ''; }
  return item;
}

// Cari baris materi berdasarkan ID dan pastikan milik mapel yang diizinkan.
function kmCariMateri_(idMapel, idMateri) {
  var m = kmMateri_();
  var v = m.sheet.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (sTeks_(v[i][m.c.id - 1]).trim() === String(idMateri)) {
      if (sTeks_(v[i][m.c.idMapel - 1]).trim() !== String(idMapel)) throw new Error('Item ini bukan milik mapel yang dipilih.');
      return { m: m, baris: i + 1, row: v[i] };
    }
  }
  throw new Error('Item tidak ditemukan (mungkin sudah dihapus).');
}

// Batas pengumpulan diskusi/ujian = akhir sesi (Minggu 23:59), seperti Master Control. Materi tidak punya batas.
function kmBatasOtomatis_(jenis, sesiNama) {
  if (jenis !== 'Diskusi' && jenis !== 'Ujian') return '';
  var p = taParse_(taBaca_(), sesiNama);
  if (!p) return '';
  return taIso_(new Date(taRentang_(taBaca_(), p.smt, p.n).selesaiMs)) + ' ' + taBaca_().jamBatas;
}

function kmCatat_(p, idMapel, aksi, detail, hasil) {
  try { catat_(p.peran, idMapel, p.nama, aksi, detail, hasil); } catch (e) {}
}

// ---------- daftar ----------
function waStafMateriLengkap(token, idMapel) {
  var r = wajibMapel_(token, idMapel);
  try { pastikanIdMateri_(); } catch (e) {}
  try { pastikanIdSoal_(); } catch (e) {}
  var m = kmMateri_();
  var v = m.sheet.getDataRange().getValues();
  var jumlah = kmJumlahSoalPerUjian_();
  var out = [];
  var pengampuIni = ndBolehNilai_(r.p, idMapel), namaPengampu = ndAdalahPengampu_(r.p, idMapel) ? '' : ndNamaPengampu_(idMapel).join(', ');
  var jadwalSet = {};
  try { ujJadwalSemua_().forEach(function(j) { jadwalSet[String(j.idUjian)] = true; }); } catch (e) {}
  for (var i = 1; i < v.length; i++) {
    if (sTeks_(v[i][m.c.idMapel - 1]).trim() !== String(idMapel)) continue;
    if (!sTeks_(v[i][m.c.id - 1]).trim()) continue;
    var itm = kmItemDariBaris_(v[i], m.c, jumlah);
    if (itm.jenis === 'Ujian') itm.terjadwal = !!jadwalSet[String(itm.id)];
    if (itm.jenis === 'Diskusi') { itm.bolehNilai = pengampuIni; itm.pengampu = namaPengampu; }
    out.push(itm);
  }
  return { mapel: r.m.namaMapel, rombel: r.m.namaRombel, items: out, sesiPaket: taPaket_(taBaca_(), new Date().getTime()) };
}

// ---------- validasi kesiapan Post ----------
function kmSoalDariBaris_(row, c) {
  var opsi = {};
  KM.HURUF_OPSI.forEach(function(h) {
    var val = row[c['opsi' + h] - 1];
    if (val !== '' && val !== null && val !== undefined && String(val).trim()) opsi[h] = String(val);
  });
  return {
    id: sTeks_(row[c.id - 1]),
    pertanyaan: sTeks_(row[c.pertanyaan - 1]),
    opsi: opsi,
    kunci: String(row[c.kunci - 1] || '').trim().toUpperCase(),
    poin: Number(row[c.poin - 1]) || 100
  };
}

function kmAlasanSoalTidakValid_(s) {
  if (!String(s.pertanyaan).trim()) return 'pertanyaan kosong';
  var n = Object.keys(s.opsi).length;
  if (n < 2) return 'opsi kurang dari 2';
  if (!s.kunci || !s.opsi.hasOwnProperty(s.kunci)) return 'kunci jawaban belum dipilih/tidak cocok dengan opsi';
  return '';
}

function kmDaftarSoalUjian_(idUjian) {
  var s = kmSoal_();
  var v = s.sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][s.c.idUjian - 1]) !== String(idUjian)) continue;
    if (!v[i][s.c.pertanyaan - 1] && !v[i][s.c.id - 1]) continue;
    out.push(kmSoalDariBaris_(v[i], s.c));
  }
  return out;
}

// Mengembalikan '' bila boleh di-Post, selain itu alasannya.
function kmAlasanBelumSiap_(item) {
  if (!String(item.judul).trim()) return 'Judul masih kosong.';
  if (item.jenis === 'Materi') {
    if (!String(item.konten).trim() && !String(item.youtube).trim() && !String(item.file).trim()) return 'Materi belum punya isi, tautan video, atau tautan file.';
  } else if (item.jenis === 'Diskusi') {
    if (!String(item.konten).trim()) return 'Pertanyaan/instruksi diskusi masih kosong.';
  } else if (item.jenis === 'Ujian') {
    var soal = kmDaftarSoalUjian_(item.id);
    if (!soal.length) return 'Ujian belum punya soal.';
    for (var i = 0; i < soal.length; i++) {
      var a = kmAlasanSoalTidakValid_(soal[i]);
      if (a) return 'Soal ke-' + (i + 1) + ': ' + a + '.';
    }
  }
  return '';
}

// ---------- simpan (tambah / ubah) ----------
function waStafMateriSimpan(token, idMapel, d) {
  var r = wajibMapel_(token, idMapel);
  d = d || {};
  if (d.id && typeof ujJagaItem_ === 'function') ujJagaItem_(r.p, [d.id], false);
  var judul = kmBersih_(d.judul, KM.MAKS_JUDUL).trim();
  if (!judul) throw new Error('Judul wajib diisi.');
  var konten = kmBersih_(d.konten, KM.MAKS_KONTEN);
  var youtube = kmBersih_(d.youtube, 300).trim();
  var file = kmBersih_(d.file, 500).trim();
  if (!kmUrlValid_(youtube)) throw new Error('Tautan YouTube harus diawali http:// atau https://');
  if (!kmUrlValid_(file)) throw new Error('Tautan file harus diawali http:// atau https://');
  var sesiMasuk = kmBersih_(d.sesi, 60).trim();
  var durasi = Number(d.durasi) || 0;
  if (durasi < 0 || durasi > 600) throw new Error('Durasi ujian harus antara 0 dan 600 menit.');

  var kunci = kmKunciUnik_();
  kunci.waitLock(20000);
  try {
    var m = kmMateri_();
    var c = m.c;
    if (d.id) {
      var f = kmCariMateri_(idMapel, d.id);
      var jenisLama = sTeks_(f.row[c.jenis - 1]).trim();
      if (KM.JENIS_BOLEH.indexOf(jenisLama) < 0) throw new Error('Jenis "' + jenisLama + '" tidak bisa diedit dari halaman ini.');
      var sesi = taValidasiSesiItem_(jenisLama, sesiMasuk);
      var batas = kmBatasOtomatis_(jenisLama, sesi);
      var baru = f.row.slice();
      while (baru.length < m.lebar) baru.push('');
      baru[c.judul - 1] = judul;
      baru[c.konten - 1] = konten;
      baru[c.youtube - 1] = youtube;
      baru[c.file - 1] = file;
      baru[c.sesi - 1] = sesi;
      baru[c.batasWaktu - 1] = batas;
      if (jenisLama === 'Ujian') baru[c.durasiMenit - 1] = durasi || '';
      m.sheet.getRange(f.baris, 1, 1, m.lebar).setValues([baru]);
      kmCatat_(r.p, idMapel, 'Materi ubah', jenisLama + ': ' + judul, 'OK');
      return kmItemDariBaris_(baru, c, kmJumlahSoalPerUjian_());
    }
    var jenis = String(d.jenis || '').trim();
    if (KM.JENIS_BOLEH.indexOf(jenis) < 0) throw new Error('Jenis harus Materi, Diskusi, atau Ujian.');
    var sesi = taValidasiSesiItem_(jenis, sesiMasuk);
    var batas = kmBatasOtomatis_(jenis, sesi);
    var id = generateId_('MTR-');
    var baris = [];
    for (var i = 0; i < m.lebar; i++) baris.push('');
    baris[c.id - 1] = id;
    baris[c.idMapel - 1] = String(idMapel);
    baris[c.jenis - 1] = jenis;
    baris[c.judul - 1] = judul;
    baris[c.konten - 1] = konten;
    baris[c.youtube - 1] = youtube;
    baris[c.file - 1] = file;
    baris[c.batasWaktu - 1] = batas;
    baris[c.status - 1] = 'Draft';
    baris[c.dibuatPada - 1] = waktuSekarang_();
    baris[c.sesi - 1] = sesi;
    if (jenis === 'Ujian') baris[c.durasiMenit - 1] = durasi || '';
    m.sheet.appendRow(baris);
    kmCatat_(r.p, idMapel, 'Materi tambah', jenis + ': ' + judul, 'OK');
    return kmItemDariBaris_(baris, c, {});
  } finally {
    kunci.releaseLock();
  }
}

// ---------- hapus ----------
function waStafMateriHapus(token, idMapel, idMateri) {
  var r = wajibMapel_(token, idMapel);
  if (typeof ujJagaItem_ === 'function') ujJagaItem_(r.p, [idMateri], true);
  var kunci = kmKunciUnik_();
  kunci.waitLock(20000);
  try {
    var f = kmCariMateri_(idMapel, idMateri);
    var c = f.m.c;
    var jenis = sTeks_(f.row[c.jenis - 1]).trim();
    var judul = sTeks_(f.row[c.judul - 1]);
    if (jenis === 'Ujian') {
      var s = kmSoal_();
      var v = s.sheet.getDataRange().getValues();
      for (var i = v.length - 1; i >= 1; i--) {
        if (String(v[i][s.c.idUjian - 1]) === String(idMateri)) s.sheet.deleteRow(i + 1);
      }
    }
    f.m.sheet.deleteRow(f.baris);
    kmCatat_(r.p, idMapel, 'Materi hapus', jenis + ': ' + judul, 'OK');
    return { sukses: true };
  } finally {
    kunci.releaseLock();
  }
}

// ---------- status: Post (Aktif) / tarik kembali (Draft) / arsip (Selesai) ----------
function waStafMateriStatus(token, idMapel, daftarId, status) {
  var r = wajibMapel_(token, idMapel);
  if (typeof ujJagaItem_ === 'function') ujJagaItem_(r.p, daftarId, false);
  if (KM.STATUS_BOLEH.indexOf(status) < 0) throw new Error('Status tidak dikenal.');
  if (!daftarId || !daftarId.length) throw new Error('Tidak ada item yang dipilih.');
  var kunci = kmKunciUnik_();
  kunci.waitLock(20000);
  try {
    var berhasil = [], gagal = [];
    daftarId.forEach(function(id) {
      try {
        var f = kmCariMateri_(idMapel, id);
        var c = f.m.c;
        var item = kmItemDariBaris_(f.row, c, {});
        if (status === 'Aktif') {
          if (!item.boleh) throw new Error('Jenis ' + item.jenis + ' tidak dikelola dari sini.');
          var alasan = kmAlasanBelumSiap_(item);
          if (alasan) throw new Error(alasan);
        }
        f.m.sheet.getRange(f.baris, c.status).setValue(status);
        berhasil.push(id);
        kmCatat_(r.p, idMapel, 'Status ' + status, item.jenis + ': ' + item.judul, 'OK');
      } catch (e) {
        var judul = '';
        try { judul = kmCariMateri_(idMapel, id).row[materiCols_().judul - 1]; } catch (x) {}
        gagal.push({ id: id, judul: String(judul || id), alasan: String(e.message || e).replace(/^Error:\s*/, '') });
      }
    });
    return { berhasil: berhasil, gagal: gagal };
  } finally {
    kunci.releaseLock();
  }
}

// ---------- soal ujian ----------
function kmPastikanUjian_(idMapel, idUjian) {
  var f = kmCariMateri_(idMapel, idUjian);
  if (sTeks_(f.row[f.m.c.jenis - 1]).trim() !== 'Ujian') throw new Error('Item ini bukan ujian.');
  return f;
}

function waStafSoalDaftar(token, idMapel, idUjian) {
  wajibMapel_(token, idMapel);
  var f = kmPastikanUjian_(idMapel, idUjian);
  try { pastikanIdSoal_(); } catch (e) {}
  return {
    judul: sTeks_(f.row[f.m.c.judul - 1]),
    status: sTeks_(f.row[f.m.c.status - 1]).trim() || 'Draft',
    soal: kmDaftarSoalUjian_(idUjian)
  };
}

function kmRapikanSoal_(s) {
  s = s || {};
  var out = { pertanyaan: kmBersih_(s.pertanyaan, KM.MAKS_TEKS_SOAL).trim(), opsi: {}, kunci: String(s.kunci || '').trim().toUpperCase(), poin: Number(s.poin) };
  var opsiMasuk = s.opsi || {};
  KM.HURUF_OPSI.forEach(function(h) {
    var t = kmBersih_(opsiMasuk[h], KM.MAKS_TEKS_OPSI).trim();
    if (t) out.opsi[h] = t;
  });
  if (!out.pertanyaan) throw new Error('Pertanyaan wajib diisi.');
  if (Object.keys(out.opsi).length < 2) throw new Error('Isi minimal 2 opsi jawaban.');
  if (!out.kunci || !out.opsi.hasOwnProperty(out.kunci)) throw new Error('Pilih kunci jawaban yang ada di antara opsi.');
  if (!(out.poin > 0)) out.poin = 100;
  if (out.poin > 1000) out.poin = 1000;
  return out;
}

function waStafSoalSimpan(token, idMapel, idUjian, s) {
  var r = wajibMapel_(token, idMapel);
  var rapi = kmRapikanSoal_(s);
  var kunci = kmKunciUnik_();
  kunci.waitLock(20000);
  try {
    kmPastikanUjian_(idMapel, idUjian);
    var q = kmSoal_();
    var c = q.c;
    var v = q.sheet.getDataRange().getValues();
    var barisBaru = [];
    for (var i = 0; i < q.lebar; i++) barisBaru.push('');
    barisBaru[c.idUjian - 1] = String(idUjian);
    barisBaru[c.pertanyaan - 1] = rapi.pertanyaan;
    KM.HURUF_OPSI.forEach(function(h) { barisBaru[c['opsi' + h] - 1] = rapi.opsi[h] || ''; });
    barisBaru[c.kunci - 1] = rapi.kunci;
    barisBaru[c.poin - 1] = rapi.poin;
    if (s && s.id) {
      for (var j = 1; j < v.length; j++) {
        if (String(v[j][c.id - 1]) === String(s.id)) {
          if (String(v[j][c.idUjian - 1]) !== String(idUjian)) throw new Error('Soal ini bukan milik ujian yang dipilih.');
          barisBaru[c.id - 1] = String(s.id);
          q.sheet.getRange(j + 1, 1, 1, q.lebar).setValues([barisBaru]);
          kmCatat_(r.p, idMapel, 'Soal ubah', idUjian, 'OK');
          return kmSoalDariBaris_(barisBaru, c);
        }
      }
      throw new Error('Soal tidak ditemukan.');
    }
    var jumlah = 0;
    for (var k = 1; k < v.length; k++) if (String(v[k][c.idUjian - 1]) === String(idUjian) && v[k][c.pertanyaan - 1]) jumlah++;
    if (jumlah >= KM.MAKS_SOAL_PER_UJIAN) throw new Error('Satu ujian maksimal ' + KM.MAKS_SOAL_PER_UJIAN + ' soal.');
    barisBaru[c.id - 1] = generateId_('SOAL-');
    q.sheet.appendRow(barisBaru);
    kmCatat_(r.p, idMapel, 'Soal tambah', idUjian, 'OK');
    return kmSoalDariBaris_(barisBaru, c);
  } finally {
    kunci.releaseLock();
  }
}

function waStafSoalHapus(token, idMapel, idUjian, idSoal) {
  var r = wajibMapel_(token, idMapel);
  var kunci = kmKunciUnik_();
  kunci.waitLock(20000);
  try {
    kmPastikanUjian_(idMapel, idUjian);
    var q = kmSoal_();
    var v = q.sheet.getDataRange().getValues();
    for (var i = 1; i < v.length; i++) {
      if (String(v[i][q.c.id - 1]) === String(idSoal)) {
        if (String(v[i][q.c.idUjian - 1]) !== String(idUjian)) throw new Error('Soal ini bukan milik ujian yang dipilih.');
        q.sheet.deleteRow(i + 1);
        kmCatat_(r.p, idMapel, 'Soal hapus', idUjian, 'OK');
        return { sukses: true };
      }
    }
    throw new Error('Soal tidak ditemukan.');
  } finally {
    kunci.releaseLock();
  }
}

// ---------- hapus serentak materi/diskusi yang belum terpakai ----------
// Hanya jenis Materi dan Diskusi. Item yang sudah punya jawaban/nilai siswa tidak pernah ikut. Ujian dan Absensi tidak tersentuh.
// Baris yang dihapus disalin dulu ke sheet "Cadangan_Hapus_Materi" supaya bisa dipulihkan.
function kmCalonHapusMassal_(idMapel, jenisPilih, termasukPost) {
  var m = kmMateri_();
  var v = m.sheet.getDataRange().getValues();
  var h = CONFIG.HEADERS.MATERI;
  var iId = h.indexOf('ID Materi'), iMapel = h.indexOf('ID Mapel'), iJenis = h.indexOf('Jenis'),
      iJudul = h.indexOf('Judul'), iStatus = h.indexOf('Status'), iSesi = h.indexOf('Sesi');
  var pakai = {};
  var jw = getSheetData(CONFIG.SHEETS.JAWABAN);
  var iJm = CONFIG.HEADERS.JAWABAN.indexOf('ID Materi');
  for (var k = 1; k < jw.length; k++) {
    var idj = sTeks_(jw[k][iJm]).trim();
    if (idj) pakai[idj] = true;
  }
  var daftar = [], dipakai = 0, sudahPost = 0;
  for (var i = 1; i < v.length; i++) {
    if (sTeks_(v[i][iMapel]).trim() !== String(idMapel)) continue;
    var jenis = sTeks_(v[i][iJenis]).trim();
    if (jenis !== 'Materi' && jenis !== 'Diskusi') continue;
    if (jenisPilih !== 'semua' && jenis !== jenisPilih) continue;
    var id = sTeks_(v[i][iId]).trim();
    var status = sTeks_(v[i][iStatus]).trim();
    if (pakai[id]) { dipakai++; continue; }
    if (status !== 'Draft' && !termasukPost) { sudahPost++; continue; }
    daftar.push({ id: id, jenis: jenis, judul: sTeks_(v[i][iJudul]), sesi: sTeks_(v[i][iSesi]) || 'Sesi 1', status: status, baris: i + 1, isi: v[i] });
  }
  return { sheet: m.sheet, daftar: daftar, dipakai: dipakai, sudahPost: sudahPost };
}

function waStafMateriHapusMassal(token, idMapel, opsi) {
  var r = wajibMapel_(token, idMapel);
  opsi = opsi || {};
  var jenisPilih = (opsi.jenis === 'Materi' || opsi.jenis === 'Diskusi') ? opsi.jenis : 'semua';
  var post = !!opsi.termasukPost;
  var kunci = kmKunciUnik_();
  kunci.waitLock(30000);
  try {
    var cal = kmCalonHapusMassal_(idMapel, jenisPilih, post);
    var ringkas = cal.daftar.map(function(x) { return { id: x.id, jenis: x.jenis, judul: x.judul, sesi: x.sesi, status: x.status }; });
    if (!opsi.hapus) return { sukses: true, hapus: false, calon: ringkas, dipakai: cal.dipakai, sudahPost: cal.sudahPost };
    var boleh = {};
    (opsi.ids || []).forEach(function(id) { boleh[String(id)] = true; });
    var target = cal.daftar.filter(function(x) { return boleh[x.id]; });
    if (!target.length) return { sukses: true, hapus: true, jumlah: 0 };
    var ss = cal.sheet.getParent();
    var cad = ss.getSheetByName('Cadangan_Hapus_Materi');
    var kepala = ['Waktu Hapus', 'Dihapus Oleh'].concat(CONFIG.HEADERS.MATERI);
    if (!cad) { cad = ss.insertSheet('Cadangan_Hapus_Materi'); cad.getRange(1, 1, 1, kepala.length).setValues([kepala]); }
    var waktu = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    var salin = target.map(function(x) {
      var baris = [waktu, r.p.nama || r.p.id];
      for (var q = 0; q < CONFIG.HEADERS.MATERI.length; q++) baris.push(x.isi[q] === undefined ? '' : x.isi[q]);
      return baris;
    });
    cad.getRange(cad.getLastRow() + 1, 1, salin.length, kepala.length).setValues(salin);
    target.sort(function(a, b) { return b.baris - a.baris; }).forEach(function(x) { cal.sheet.deleteRow(x.baris); });
    kmCatat_(r.p, idMapel, 'Materi hapus serentak', target.length + ' item (' + jenisPilih + ')', 'OK');
    return { sukses: true, hapus: true, jumlah: target.length };
  } finally {
    kunci.releaseLock();
  }
}
