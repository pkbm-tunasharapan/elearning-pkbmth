// ============================================
// JADWAL UJIAN (TUTOR) + PENGAJUAN SUSULAN / REMEDIAL / PERUBAHAN JADWAL
// ============================================
// Alur susulan dan remedial:
//   Siswa mengajukan -> Tutor menyetujui/menolak (mencentang nama siswa).
//   Ditolak = selesai. Disetujui = tutor meneruskan ke admin sebagai satu permohonan.
//   Admin menerima notifikasi, mendisposisikan ke Kepala Sekolah atau Koordinator Kurikulum.
//   Bila disetujui pimpinan, admin membuka akses dengan tanggal dan jam yang ia tentukan.
//   Akses bersifat personal (hanya siswa yang dicentang). Remedial = nilai terbaik < KKM.
// Perubahan jadwal bersifat global: tutor mengajukan, admin mendisposisikan, pimpinan memutuskan,
// admin menerapkan tanggal dan jam baru ke jadwal.

function ujPeta_() {
  var o = {};
  mapelAktifSemua_().forEach(function (m) { o[m.idMapel] = m; });
  return o;
}

function ujMapelTutor_(p) {
  var boleh = {};
  if (p.peran === 'Admin') { mapelAktifSemua_().forEach(function (m) { boleh[m.idMapel] = true; }); return boleh; }
  bacaEnrollment_().forEach(function (e) { if (e.idPengguna === p.id) boleh[e.idMapel] = true; });
  return boleh;
}

function ujPimpinanAda_() {
  var o = {};
  UJ.PIMPINAN.forEach(function (x) { o[x] = 0; });
  bacaPengguna_().forEach(function (p) { if (p.status === 'Aktif' && o[p.peran] !== undefined) o[p.peran]++; });
  return o;
}

function ujCatatan_(t, maks) { return String(t || '').replace(/\s+/g, ' ').trim().slice(0, maks || 300); }

function ujJadwalPeta_() {
  var o = {};
  ujJadwalSemua_().forEach(function (j) { o[j.idUjian] = j; });
  return o;
}

function ujTerbaik_(hasil, idUjian, idRombel, nama) {
  var t = null;
  hasil.forEach(function (h) {
    if (!ujSamaSiswa_(h, idUjian, idRombel, nama)) return;
    var persen = parseFloat(h['Persen']) || 0;
    if (t === null || persen > t) t = persen;
  });
  return t;
}

function ujAjuObj_(a, peta, jpeta, hasil) {
  var m = peta[a['ID Mapel']] || {}, j = jpeta[a['ID Ujian']] || null;
  return {
    id: a['ID'], waktu: a['Waktu'], jenis: a['Jenis'], idMapel: a['ID Mapel'], namaMapel: m.namaMapel || '(mapel nonaktif)', namaRombel: m.namaRombel || '',
    idRombel: a['ID Rombel'], nama: a['Nama Siswa'], smt: parseInt(a['Semester'], 10) || 0, jenisUjian: a['Jenis Ujian'],
    judul: ujJudul_(a['Jenis Ujian'], a['Semester']), alasan: a['Alasan'], status: a['Status'], tutor: a['Tutor'], waktuTutor: a['Waktu Tutor'],
    catatanTutor: a['Catatan Tutor'], idPermohonan: a['ID Permohonan'], idUjian: a['ID Ujian'],
    persen: ujTerbaik_(hasil, a['ID Ujian'], a['ID Rombel'], a['Nama Siswa']), kkm: j ? j.kkm : null
  };
}

function ujPermObj_(r, peta, jpeta) {
  var m = peta[r['ID Mapel']] || {}, j = jpeta[r['ID Ujian']] || null, siswa = [];
  try { siswa = JSON.parse(r['Siswa'] || '[]'); } catch (e) { siswa = []; }
  return {
    id: r['ID'], waktu: r['Waktu'], jenis: r['Jenis'], idMapel: r['ID Mapel'], namaMapel: m.namaMapel || '(mapel nonaktif)', namaRombel: m.namaRombel || '',
    smt: parseInt(r['Semester'], 10) || 0, jenisUjian: r['Jenis Ujian'], judul: ujJudul_(r['Jenis Ujian'], r['Semester']), idUjian: r['ID Ujian'],
    diajukanOleh: r['Diajukan Oleh'], siswa: siswa, alasan: r['Alasan'], usulanTanggal: ujTgl_(r['Usulan Tanggal']), usulanJam: ujJam_(r['Usulan Jam']),
    status: r['Status'], tujuan: r['Tujuan'], waktuDisposisi: r['Waktu Disposisi'], putusan: r['Putusan'], pemutus: r['Pemutus'], waktuPutusan: r['Waktu Putusan'],
    catatanPutusan: r['Catatan Putusan'], aksesMulai: r['Akses Mulai'], aksesSelesai: r['Akses Selesai'], dibukaOleh: r['Dibuka Oleh'], waktuDibuka: r['Waktu Dibuka'],
    catatanAdmin: r['Catatan Admin'],
    jadwal: j ? { tanggal: j.tanggal, jam: j.jam, durasi: j.durasi, teks: ujTeksWaktu_(j.mulaiMs) } : null
  };
}

function ujUrut_(a, b) { return String(b.waktu).localeCompare(String(a.waktu)); }

// satu panggilan untuk panel Pengajuan Ujian (semua peran) dan lencana notifikasi
function waStafUjianKotak(token) {
  var p = stafDariToken_(token);
  var peta = ujPeta_(), jpeta = ujJadwalPeta_(), hasil = ujBaca_('HASIL');
  var out = { peran: p.peran, aju: [], perm: [], hitung: { menungguTutor: 0, remedial: 0, menungguAdmin: 0, siapDibuka: 0, menungguPutusan: 0, total: 0 }, pimpinan: null };
  if (p.peran === 'Tutor' || p.peran === 'Admin') {
    var boleh = ujMapelTutor_(p);
    var aju = ujBaca_('AJU').filter(function (a) { return boleh[a['ID Mapel']] === true; })
      .map(function (a) { return ujAjuObj_(a, peta, jpeta, hasil); }).sort(ujUrut_);
    out.aju = p.peran === 'Tutor' ? aju.slice(0, 300) : [];
    aju.forEach(function (a) {
      if (a.status === 'Menunggu Tutor' && p.peran === 'Tutor') { out.hitung.menungguTutor++; if (a.jenis === 'Remedial') out.hitung.remedial++; }
    });
  }
  var perm = ujBaca_('PERM').map(function (r) { return ujPermObj_(r, peta, jpeta); });
  if (p.peran === 'Tutor') {
    var bl = ujMapelTutor_(p);
    perm = perm.filter(function (x) { return bl[x.idMapel] === true; });
  } else if (UJ.PIMPINAN.indexOf(p.peran) >= 0) {
    perm = perm.filter(function (x) { return x.tujuan === p.peran; });
  }
  perm.sort(ujUrut_);
  out.perm = perm.slice(0, 150);
  perm.forEach(function (x) {
    if (p.peran === 'Admin') {
      if (x.status === 'Menunggu Admin') out.hitung.menungguAdmin++;
      if (x.status === 'Disetujui') out.hitung.siapDibuka++;
    }
    if (UJ.PIMPINAN.indexOf(p.peran) >= 0 && x.status === 'Didisposisikan') out.hitung.menungguPutusan++;
  });
  out.hitung.total = out.hitung.menungguTutor + out.hitung.menungguAdmin + out.hitung.siapDibuka + out.hitung.menungguPutusan;
  if (p.peran === 'Admin') out.pimpinan = ujPimpinanAda_();
  if (['Admin', 'Kepala Sekolah', 'Superadmin'].indexOf(p.peran) >= 0) {   // v1.57.0: pantau remedial; lewat 2 hari boleh diputuskan
    out.remedial = ujBaca_('AJU').filter(function (a) { return a['Jenis'] === 'Remedial' && a['Status'] === 'Menunggu Tutor'; }).map(function (a) {
      var o = ujAjuObj_(a, peta, jpeta, hasil), jam = sbJamSejak_(a['Waktu']);
      o.jamMenunggu = Math.floor(jam); o.bolehPutus = jam >= SB.REMEDIAL_JAM;
      return o;
    }).sort(function (a, b) { return String(a.waktu).localeCompare(String(b.waktu)); });
    out.hitung.remedialLewat = out.remedial.filter(function (x) { return x.bolehPutus; }).length;
  }
  return out;
}

// ---------------- jadwal ujian per mapel (tutor) ----------------
function ujRekap_(j, idRombel) {
  var now = Date.now();
  var fase = now < j.mulaiMs ? 'belum' : (now <= j.masukSampaiMs ? 'masuk' : 'tutup');
  var hasil = ujBaca_('HASIL').filter(function (h) { return String(h['ID Ujian']) === String(j.idUjian); });
  var berlangsung = {};
  var cols = sesiCols_(), v = getSheet(CONFIG.SHEETS.PERCOBAAN_UJIAN).getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][cols.idUjian - 1]) === String(j.idUjian) && String(v[i][cols.idRombel - 1]) === String(idRombel) && String(v[i][cols.status - 1]) === 'Berlangsung') berlangsung[ujNormNama_(v[i][cols.nama - 1])] = true;
  }
  var rows = [], ringkas = { lulus: 0, remedial: 0, belum: 0, tidakIkut: 0, berlangsung: 0 };
  getSheetData(CONFIG.SHEETS.SISWA).forEach(function (r, i) {
    if (i === 0 || String(r[0]).trim() !== String(idRombel) || !String(r[1]).trim()) return;
    var nama = String(r[1]).trim(), terbaik = null, ronde = 0, jenis = '';
    hasil.forEach(function (h) {
      if (String(h['ID Rombel']) !== String(idRombel) || ujNormNama_(h['Nama Siswa']) !== ujNormNama_(nama)) return;
      var persen = parseFloat(h['Persen']) || 0;
      if (terbaik === null || persen > terbaik) { terbaik = persen; ronde = parseInt(h['Ronde'], 10) || 0; jenis = h['Jenis']; }
    });
    var state;
    if (berlangsung[ujNormNama_(nama)]) state = 'berlangsung';
    else if (terbaik !== null) state = terbaik >= j.kkm ? 'lulus' : 'remedial';
    else state = fase === 'tutup' ? 'tidakIkut' : 'belum';
    ringkas[state]++;
    rows.push({ nama: nama, persen: terbaik, state: state, ronde: ronde, jenis: jenis });
  });
  rows.sort(function (a, b) { return String(a.nama).localeCompare(String(b.nama)); });
  return { rows: rows, ringkas: ringkas };
}

function waStafUjianInfo(token, idMapel) {
  var r = wajibMapel_(token, idMapel);
  var cfg = taBaca_(), now = Date.now(), out = { idMapel: String(idMapel), namaMapel: r.m.namaMapel, namaRombel: r.m.namaRombel, kartu: [], bawaan: { jumlah: UJ.JUMLAH_BAWAAN, masukMenit: UJ.MASUK_MENIT, maksSoal: KM.MAKS_SOAL_PER_UJIAN } };
  var jadwalSemua = ujJadwalSemua_(), perm = ujBaca_('PERM');
  for (var smt = 1; smt <= Math.min(2, cfg.jumlahSemester); smt++) {
    ['UTS', 'UAS'].forEach(function (jenis) {
      var n = jenis === 'UTS' ? cfg.uts : cfg.uas, info = taInfo_(cfg, smt, n, now), pool = ujPool_(idMapel, smt, jenis);
      var j = null;
      jadwalSemua.forEach(function (x) { if (x.kunci === ujKunciJadwal_(idMapel, smt, jenis)) j = x; });
      var kartu = {
        smt: smt, jenis: jenis, judul: ujJudul_(jenis, smt), sesiNama: info.nama, sesiLabel: info.label, sesiN: n, mulaiIso: info.mulaiIso, selesaiIso: info.selesaiIso,
        cakupanTeks: jenis === 'UTS' ? 'Sesi materi sebelum Sesi ' + cfg.uts : 'Seluruh sesi materi semester ' + smt,
        bank: { total: pool.total, jumlahSesi: pool.jumlahSesi, sesiTerisi: pool.sesi.length, tanpaBank: pool.tanpaBank, rinci: pool.rinci },
        jadwal: null, rekap: null, perubahan: null
      };
      if (j) {
        kartu.jadwal = {
          idUjian: j.idUjian, tanggal: j.tanggal, jam: j.jam, durasi: j.durasi, kkm: j.kkm, jumlah: j.jumlah, komposisi: j.komposisi,
          teks: ujTeksWaktu_(j.mulaiMs), dibuatOleh: j.dibuatOleh, diubahOleh: j.diubahOleh, catatan: j.catatan, sudahMulai: now >= j.mulaiMs, masukSampai: ujFmt_(j.masukSampaiMs, 'HH:mm')
        };
        kartu.rekap = ujRekap_(j, r.m.idRombel);
        perm.forEach(function (x) {
          if (x['ID Ujian'] === j.idUjian && x['Jenis'] === 'Perubahan' && ['Menunggu Admin', 'Didisposisikan', 'Disetujui'].indexOf(x['Status']) >= 0) {
            kartu.perubahan = { id: x['ID'], status: x['Status'], tujuan: x['Tujuan'], usulanTanggal: ujTgl_(x['Usulan Tanggal']), usulanJam: ujJam_(x['Usulan Jam']), alasan: x['Alasan'] };
          }
        });
      } else {
        var mudah = Math.round(UJ.JUMLAH_BAWAAN * UJ.BAWAAN_KOMPOSISI.mudah), sulit = Math.round(UJ.JUMLAH_BAWAAN * UJ.BAWAAN_KOMPOSISI.sulit);
        kartu.bawaan = { jumlah: UJ.JUMLAH_BAWAAN, mudah: mudah, sedang: UJ.JUMLAH_BAWAAN - mudah - sulit, sulit: sulit, durasi: 60, kkm: 70 };
      }
      out.kartu.push(kartu);
    });
  }
  return out;
}

function ujKomposisi_(jumlah, d) {
  var adaIsi = ['mudah', 'sedang', 'sulit'].some(function (t) { return d[t] !== undefined && d[t] !== null && d[t] !== ''; });
  var k = {};
  if (adaIsi) {
    var tot = 0;
    KUR_TINGKAT.forEach(function (t) { var n = parseInt(d[t], 10); k[t] = n >= 0 ? n : 0; tot += k[t]; });
    if (tot !== jumlah) throw new Error('Jumlah mudah + sedang + sulit (' + tot + ') harus sama dengan jumlah soal (' + jumlah + ').');
  } else {
    k.mudah = Math.round(jumlah * UJ.BAWAAN_KOMPOSISI.mudah);
    k.sulit = Math.round(jumlah * UJ.BAWAAN_KOMPOSISI.sulit);
    k.sedang = jumlah - k.mudah - k.sulit;
  }
  return k;
}

function ujBuatItemUjian_(idMapel, judul, konten, sesiNama, durasi) {
  var m = kmMateri_(), c = m.c, baris = [];
  for (var i = 0; i < m.lebar; i++) baris.push('');
  var id = generateId_('MTR-');
  baris[c.id - 1] = id;
  baris[c.idMapel - 1] = String(idMapel);
  baris[c.jenis - 1] = 'Ujian';
  baris[c.judul - 1] = judul;
  baris[c.konten - 1] = konten;
  baris[c.status - 1] = 'Aktif';
  baris[c.dibuatPada - 1] = waktuSekarang_();
  baris[c.sesi - 1] = sesiNama;
  baris[c.batasWaktu - 1] = kmBatasOtomatis_('Ujian', sesiNama);
  baris[c.durasiMenit - 1] = durasi;
  m.sheet.appendRow(baris);
  return id;
}

// Tutor menetapkan jadwal SEKALI. Setelah tersimpan terkunci; perubahan hanya lewat admin.
function waStafUjianSimpan(token, idMapel, d) {
  var pTm = stafDariToken_(token);
  if (pTm.peran === 'Tutor' && typeof ujtTatapMuka_ === 'function' && ujtTatapMuka_(idMapel)) throw new Error('Jadwal ujian kelas tatap muka ditetapkan terpusat oleh Admin/Kepala Sekolah. Ujian di aplikasi lewat menu Masa Ujian; ujian kertas lewat menu Ujian Kertas Tatap Muka.');
  var r = wajibMapel_(token, idMapel);
  d = d || {};
  var cfg = taBaca_(), now = Date.now();
  var smt = parseInt(d.smt, 10), jenis = String(d.jenis || '').toUpperCase();
  if (!(smt >= 1 && smt <= Math.min(2, cfg.jumlahSemester))) throw new Error('Pilih Semester 1 atau 2.');
  if (jenis !== 'UTS' && jenis !== 'UAS') throw new Error('Pilih UTS atau UAS.');
  var n = jenis === 'UTS' ? cfg.uts : cfg.uas, info = taInfo_(cfg, smt, n, now);
  var tgl = ujTgl_(d.tanggal), jam = ujJam_(d.jam);
  if (!tgl) throw new Error('Tanggal ujian belum diisi.');
  if (!jam) throw new Error('Jam mulai belum diisi (format JJ:MM).');
  var mulaiMs = ujMs_(tgl, jam);
  if (isNaN(mulaiMs)) throw new Error('Tanggal atau jam tidak valid.');
  if (tgl < info.mulaiIso || tgl > info.selesaiIso) throw new Error('Ujian harus dilaksanakan pada ' + info.nama + ' (' + info.rentang + ').');
  if (mulaiMs < now) throw new Error('Waktu mulai sudah lewat. Pilih tanggal dan jam yang akan datang.');
  var durasi = parseInt(d.durasi, 10);
  if (!(durasi >= UJ.DURASI_MIN && durasi <= UJ.DURASI_MAKS)) throw new Error('Durasi pengerjaan ' + UJ.DURASI_MIN + ' sampai ' + UJ.DURASI_MAKS + ' menit.');
  var kkm = parseFloat(d.kkm);
  if (isNaN(kkm) || kkm < 0 || kkm > 100) throw new Error('Nilai minimal (KKM) wajib diisi, 0 sampai 100.');
  var jumlah = parseInt(d.jumlah, 10) || UJ.JUMLAH_BAWAAN;
  if (jumlah < 5 || jumlah > KM.MAKS_SOAL_PER_UJIAN) throw new Error('Jumlah soal 5 sampai ' + KM.MAKS_SOAL_PER_UJIAN + '.');
  var komp = ujKomposisi_(jumlah, d);
  var kunci = kmKunciUnik_();
  kunci.waitLock(30000);
  try {
    var kj = ujKunciJadwal_(idMapel, smt, jenis);
    ujJadwalSemua_().forEach(function (x) {
      if (x.kunci === kj) throw new Error('Jadwal ' + jenis + ' Semester ' + smt + ' sudah ditetapkan dan terkunci. Perubahan hanya lewat permohonan ke admin.');
    });
    var m = kmMateri_(), v = m.sheet.getDataRange().getValues();
    for (var i = 1; i < v.length; i++) {
      if (sTeks_(v[i][m.c.idMapel - 1]).trim() !== String(idMapel)) continue;
      if (sTeks_(v[i][m.c.jenis - 1]).trim() !== 'Ujian') continue;
      if (sTeks_(v[i][m.c.sesi - 1]).trim() !== info.nama) continue;
      throw new Error('Sudah ada ujian pada ' + info.nama + ' ("' + sTeks_(v[i][m.c.judul - 1]).trim() + '"). Hapus ujian itu di tab Materi dulu agar jadwal bisa ditetapkan.');
    }
    var pool = ujPool_(idMapel, smt, jenis);
    var peringatan = '';
    if (pool.total === 0) {
      peringatan = 'Bank soal ' + jenis + ' Semester ' + smt + ' belum ada. Susun soalnya di tab Kurikulum sebelum hari ujian; tanpa soal siswa tidak dapat memulai ujian.';
    } else if (pool.total < jumlah) {
      peringatan = 'Bank soal baru ' + pool.total + ' soal (' + pool.sesi.length + ' dari ' + pool.jumlahSesi + ' sesi), kurang dari ' + jumlah + ' soal per siswa. Lengkapi di tab Kurikulum sebelum hari ujian; bila tetap kurang, siswa hanya menerima soal sebanyak yang tersedia.';
    } else if (pool.tanpaBank.length) {
      peringatan = 'Sesi ' + pool.tanpaBank.join(', ') + ' belum punya bank soal sehingga tidak ikut diundi. Lengkapi di tab Kurikulum.';
    } else if (pool.total < jumlah * 1.5) {
      peringatan = 'Bank soal ' + pool.total + ' soal untuk ' + jumlah + ' soal ujian: soal antar siswa akan banyak yang sama. Lengkapi bank agar lebih bervariasi.';
    }
    var judul = ujJudul_(jenis, smt);
    var konten = 'Kerjakan semua soal dengan teliti. Pilih satu jawaban yang paling tepat. Soal dan urutan jawaban berbeda untuk setiap siswa.\nJadwal: ' + ujTeksWaktu_(mulaiMs) + ', ' + durasi + ' menit. Nilai minimal ' + kkm + '.';
    var idU = ujBuatItemUjian_(idMapel, judul, konten, info.nama, durasi);
    ujTambah_('JADWAL', {
      'Kunci': kj, 'ID Mapel': String(idMapel), 'Semester': smt, 'Jenis': jenis, 'ID Ujian': idU, 'Tanggal': tgl, 'Jam Mulai': jam, 'Durasi Menit': durasi, 'KKM': kkm,
      'Jumlah Soal': jumlah, 'Mudah': komp.mudah, 'Sedang': komp.sedang, 'Sulit': komp.sulit, 'Dibuat Oleh': r.p.nama, 'Dibuat Pada': ujNow_()
    });
    kmCatat_(r.p, idMapel, 'Tetapkan jadwal ' + jenis, 'Semester ' + smt + ' · ' + tgl + ' ' + jam + ' · ' + durasi + ' menit · KKM ' + kkm + ' · ' + jumlah + ' soal', 'OK');
    return { sukses: true, idUjian: idU, judul: judul, teks: ujTeksWaktu_(mulaiMs), peringatan: peringatan, bankSiap: pool.total >= jumlah && !pool.tanpaBank.length };
  } finally {
    kunci.releaseLock();
  }
}

// Tutor mengajukan perubahan jadwal (global) ke admin.
function waStafUjianPerubahanAjukan(token, idMapel, d) {
  var r = wajibMapel_(token, idMapel);
  if (r.p.peran !== 'Tutor' && r.p.peran !== 'Admin') throw new Error('Hanya tutor pengampu yang dapat mengajukan.');
  d = d || {};
  var smt = parseInt(d.smt, 10), jenis = String(d.jenis || '').toUpperCase();
  var j = null;
  ujJadwalSemua_().forEach(function (x) { if (x.kunci === ujKunciJadwal_(idMapel, smt, jenis)) j = x; });
  if (!j) throw new Error('Jadwal belum ditetapkan.');
  if (j.mulaiMs <= Date.now()) throw new Error('Ujian sudah dimulai atau lewat. Siswa yang berhalangan mengajukan susulan.');
  var tgl = ujTgl_(d.tanggal), jam = ujJam_(d.jam), alasan = ujCatatan_(d.alasan, 300);
  if (!tgl || !jam || isNaN(ujMs_(tgl, jam))) throw new Error('Tanggal dan jam usulan wajib diisi.');
  if (ujMs_(tgl, jam) < Date.now()) throw new Error('Usulan waktu sudah lewat.');
  if (alasan.length < 15) throw new Error('Tuliskan alasan perubahan (minimal 15 karakter).');
  var ada = false;
  ujBaca_('PERM').forEach(function (x) {
    if (x['ID Ujian'] === j.idUjian && x['Jenis'] === 'Perubahan' && ['Menunggu Admin', 'Didisposisikan', 'Disetujui'].indexOf(x['Status']) >= 0) ada = true;
  });
  if (ada) throw new Error('Sudah ada permohonan perubahan yang sedang diproses untuk ujian ini.');
  var id = generateId_('PRM-');
  ujTambah_('PERM', {
    'ID': id, 'Waktu': ujNow_(), 'Jenis': 'Perubahan', 'ID Mapel': String(idMapel), 'Semester': smt, 'Jenis Ujian': jenis, 'ID Ujian': j.idUjian, 'Diajukan Oleh': r.p.nama,
    'Siswa': '[]', 'Alasan': alasan, 'Usulan Tanggal': tgl, 'Usulan Jam': jam, 'Status': 'Menunggu Admin'
  });
  kmCatat_(r.p, idMapel, 'Ajukan perubahan jadwal ' + jenis, 'Semester ' + smt + ' · usulan ' + tgl + ' ' + jam, 'OK');
  return { sukses: true, id: id };
}

// ---------------- siswa mengajukan ----------------
function waUjianAjukan(idRombel, nama, idUjian, alasan) {
  nama = String(nama || '').trim(); idRombel = String(idRombel || '').trim();
  if (!nama || !idRombel || !siswaTerdaftar_(nama, idRombel)) throw new Error('Siswa tidak dikenali.');
  var j = ujJadwalDariUjian_(idUjian);
  if (!j) throw new Error('Ujian tidak ditemukan.');
  if (!mapelMilikRombel_(j.idMapel, idRombel)) throw new Error('Ujian ini bukan untuk kelas Anda.');
  var kunci = kmKunciUnik_();
  kunci.waitLock(20000);
  try {
    var st = ujStatus_(j, idRombel, nama);
    if (!st.tombol) throw new Error('Saat ini Anda belum dapat mengajukan susulan atau remedial untuk ujian ini.');
    var jenis = st.tombol === 'remedial' ? 'Remedial' : 'Susulan';
    var teks = ujCatatan_(alasan, 300);
    if (jenis === 'Susulan' && teks.length < 10) throw new Error('Tuliskan alasan Anda (minimal 10 karakter).');
    if (st.tombol === 'remedial_susulan') teks = '[Remedial setelah susulan] ' + teks;
    var id = generateId_('AJU-');
    ujTambah_('AJU', {
      'ID': id, 'Waktu': ujNow_(), 'Jenis': jenis, 'ID Mapel': j.idMapel, 'Semester': j.smt, 'Jenis Ujian': j.jenis, 'ID Ujian': j.idUjian, 'ID Rombel': idRombel,
      'Nama Siswa': nama, 'Alasan': teks, 'Status': 'Menunggu Tutor'
    });
    try { catat_('Siswa', idRombel, nama, 'Ajukan ' + jenis.toLowerCase() + ' ujian', j.jenis + ' Semester ' + j.smt, 'OK'); } catch (e) {}
    if (jenis === 'Remedial') sbNotifRemedialBaru_(j, idRombel, nama, id);   // v1.57.0
    return { sukses: true, id: id, jenis: jenis, uj: ujStatus_(j, idRombel, nama) };
  } finally {
    kunci.releaseLock();
  }
}

// ---------------- tutor memproses pengajuan siswa ----------------
// v1.57.0: remedial langsung diputuskan tutor (setuju = akses remedial dibuka, jadwal wajib). Lewat 2 hari tanpa keputusan,
// Admin / Kepala Sekolah / Superadmin dapat memutuskan. Susulan tetap diteruskan ke admin seperti sebelumnya.
function waStafAjuTutorProses(token, ids, keputusan, catatan, jadwal) {
  var p = stafDariToken_(token);
  var pimpinanRem = ['Admin', 'Kepala Sekolah', 'Superadmin'].indexOf(p.peran) >= 0;
  if (p.peran !== 'Tutor' && !pimpinanRem) throw new Error('Hanya tutor pengampu yang dapat memproses pengajuan siswa.');
  var milik = {};
  bacaEnrollment_().forEach(function (e) { if (e.idPengguna === p.id) milik[e.idMapel] = true; });
  ids = (ids || []).map(String);
  if (!ids.length) throw new Error('Centang minimal satu siswa.');
  keputusan = String(keputusan || '');
  if (keputusan !== 'setuju' && keputusan !== 'tolak') throw new Error('Pilih setuju atau tolak.');
  catatan = ujCatatan_(catatan, 300);
  if (keputusan === 'tolak' && catatan.length < 5) throw new Error('Tuliskan alasan penolakan (minimal 5 karakter).');
  var boleh = ujMapelTutor_(p);
  var kunci = kmKunciUnik_();
  kunci.waitLock(20000);
  try {
    var semua = ujBaca_('AJU'), pilih = [];
    ids.forEach(function (id) {
      var a = null;
      semua.forEach(function (x) { if (x['ID'] === id) a = x; });
      if (!a) throw new Error('Pengajuan tidak ditemukan.');
      if (a['Jenis'] === 'Remedial') {
        if (milik[a['ID Mapel']] !== true && !(pimpinanRem && sbJamSejak_(a['Waktu']) >= SB.REMEDIAL_JAM)) {
          throw new Error(pimpinanRem ? 'Remedial ' + a['Nama Siswa'] + ' masih menunggu tutor. Admin / Kepala Sekolah baru dapat memutuskan setelah 2 hari.' : 'Pengajuan ' + a['Nama Siswa'] + ' bukan untuk mapel yang Anda ampu.');
        }
      } else if (boleh[a['ID Mapel']] !== true || p.peran === 'Kepala Sekolah' || p.peran === 'Superadmin') throw new Error('Pengajuan ' + a['Nama Siswa'] + ' bukan untuk mapel yang Anda ampu.');
      if (a['Status'] !== 'Menunggu Tutor') throw new Error('Pengajuan ' + a['Nama Siswa'] + ' sudah diproses.');
      pilih.push(a);
    });
    var now = ujNow_(), permBaru = [];
    var dibuka = 0;
    if (keputusan === 'tolak') {
      pilih.forEach(function (a) {
        ujUbah_('AJU', a._baris, { 'Status': 'Ditolak Tutor', 'Tutor': p.nama, 'Waktu Tutor': now, 'Catatan Tutor': catatan });
        if (a['Jenis'] === 'Remedial') sbNotifRemedialPutus_(a, false, 'Ditolak ' + p.nama + (catatan ? ': ' + catatan : '.'));
      });
    } else {
      var rem = pilih.filter(function (a) { return a['Jenis'] === 'Remedial'; });
      rem.forEach(function (a) {
        var tk = sbBukaRemedial_(a, jadwal, p);
        ujUbah_('AJU', a._baris, { 'Status': 'Akses Dibuka', 'Tutor': p.nama, 'Waktu Tutor': now, 'Catatan Tutor': catatan });
        sbNotifRemedialPutus_(a, true, 'Akses remedial dibuka ' + tk + '.');
        dibuka++;
      });
      var grup = {};
      pilih.forEach(function (a) {
        if (a['Jenis'] === 'Remedial') return;
        var k = a['ID Ujian'] + '|' + a['Jenis'];
        (grup[k] = grup[k] || []).push(a);
      });
      Object.keys(grup).forEach(function (k) {
        var daftar = grup[k], a0 = daftar[0], id = generateId_('PRM-');
        ujTambah_('PERM', {
          'ID': id, 'Waktu': now, 'Jenis': a0['Jenis'], 'ID Mapel': a0['ID Mapel'], 'Semester': a0['Semester'], 'Jenis Ujian': a0['Jenis Ujian'], 'ID Ujian': a0['ID Ujian'],
          'Diajukan Oleh': p.nama, 'Siswa': JSON.stringify(daftar.map(function (a) { return { idRombel: a['ID Rombel'], nama: a['Nama Siswa'], idAju: a['ID'] }; })),
          'Alasan': catatan, 'Status': 'Menunggu Admin'
        });
        permBaru.push(id);
        daftar.forEach(function (a) { ujUbah_('AJU', a._baris, { 'Status': 'Diteruskan', 'Tutor': p.nama, 'Waktu Tutor': now, 'Catatan Tutor': catatan, 'ID Permohonan': id }); });
      });
    }
    kmCatat_(p, pilih[0]['ID Mapel'], keputusan === 'setuju' ? 'Setujui pengajuan ujian' : 'Tolak pengajuan ujian', pilih.length + ' siswa', 'OK');
    return { sukses: true, diproses: pilih.length, permohonan: permBaru, remedialDibuka: dibuka };
  } finally {
    kunci.releaseLock();
  }
}

// ---------------- admin dan pimpinan ----------------
function ujCariPerm_(id) {
  var hasil = null;
  ujBaca_('PERM').forEach(function (x) { if (x['ID'] === String(id)) hasil = x; });
  if (!hasil) throw new Error('Permohonan tidak ditemukan.');
  return hasil;
}

function ujUbahAjuPerm_(idPerm, status) {
  ujBaca_('AJU').forEach(function (a) { if (a['ID Permohonan'] === idPerm) ujUbah_('AJU', a._baris, { 'Status': status }); });
}

function waAdminUjianDisposisi(token, idPerm, tujuan, catatan) {
  var p = wajibAdmin_(token);
  if (UJ.PIMPINAN.indexOf(tujuan) < 0) throw new Error('Pilih tujuan disposisi: Kepala Sekolah atau Koordinator Kurikulum.');
  var kunci = kmKunciUnik_();
  kunci.waitLock(20000);
  try {
    var x = ujCariPerm_(idPerm);
    if (x['Status'] !== 'Menunggu Admin' && x['Status'] !== 'Didisposisikan') throw new Error('Permohonan ini tidak dapat didisposisikan (status: ' + x['Status'] + ').');
    var cat = ujCatatan_(catatan, 300);
    ujUbah_('PERM', x._baris, { 'Status': 'Didisposisikan', 'Tujuan': tujuan, 'Waktu Disposisi': ujNow_(), 'Catatan Admin': cat || x['Catatan Admin'] });
    kmCatat_(p, x['ID Mapel'], 'Disposisi permohonan ujian', x['Jenis'] + ' ke ' + tujuan, 'OK');
    var ada = ujPimpinanAda_()[tujuan];
    return { sukses: true, peringatan: ada ? '' : 'Belum ada akun aktif berperan ' + tujuan + '. Tambahkan di tab Kelola Tutor & Enrollment agar permohonan dapat diputuskan.' };
  } finally {
    kunci.releaseLock();
  }
}

function waAdminUjianTolak(token, idPerm, catatan) {
  var p = wajibAdmin_(token);
  var cat = ujCatatan_(catatan, 300);
  if (cat.length < 5) throw new Error('Tuliskan alasan penolakan (minimal 5 karakter).');
  var kunci = kmKunciUnik_();
  kunci.waitLock(20000);
  try {
    var x = ujCariPerm_(idPerm);
    if (x['Status'] !== 'Menunggu Admin' && x['Status'] !== 'Didisposisikan') throw new Error('Permohonan ini sudah diputuskan (status: ' + x['Status'] + ').');
    ujUbah_('PERM', x._baris, { 'Status': 'Ditolak', 'Putusan': 'Ditolak admin', 'Pemutus': p.nama, 'Waktu Putusan': ujNow_(), 'Catatan Admin': cat });
    ujUbahAjuPerm_(x['ID'], 'Ditolak Admin');
    kmCatat_(p, x['ID Mapel'], 'Tolak permohonan ujian', x['Jenis'], 'OK');
    return { sukses: true };
  } finally {
    kunci.releaseLock();
  }
}

function waPimpinanUjianPutusan(token, idPerm, putusan, catatan) {
  var p = stafDariToken_(token);
  if (UJ.PIMPINAN.indexOf(p.peran) < 0) throw new Error('Fitur ini khusus Kepala Sekolah dan Koordinator Kurikulum.');
  putusan = String(putusan || '');
  if (putusan !== 'Setuju' && putusan !== 'Tolak') throw new Error('Pilih Setuju atau Tolak.');
  var cat = ujCatatan_(catatan, 300);
  if (putusan === 'Tolak' && cat.length < 5) throw new Error('Tuliskan alasan penolakan (minimal 5 karakter).');
  var kunci = kmKunciUnik_();
  kunci.waitLock(20000);
  try {
    var x = ujCariPerm_(idPerm);
    if (x['Tujuan'] !== p.peran) throw new Error('Permohonan ini tidak didisposisikan kepada ' + p.peran + '.');
    if (x['Status'] !== 'Didisposisikan') throw new Error('Permohonan ini sudah diputuskan atau belum didisposisikan (status: ' + x['Status'] + ').');
    ujUbah_('PERM', x._baris, {
      'Status': putusan === 'Setuju' ? 'Disetujui' : 'Ditolak', 'Putusan': putusan === 'Setuju' ? 'Disetujui ' + p.peran : 'Ditolak ' + p.peran,
      'Pemutus': p.nama, 'Waktu Putusan': ujNow_(), 'Catatan Putusan': cat
    });
    if (putusan === 'Tolak') ujUbahAjuPerm_(x['ID'], 'Ditolak Pimpinan');
    try { catat_(p.peran, x['ID Mapel'], p.nama, putusan === 'Setuju' ? 'Setujui permohonan ujian' : 'Tolak permohonan ujian', x['Jenis'] + ' ' + x['Jenis Ujian'] + ' Semester ' + x['Semester'], 'OK'); } catch (e) {}
    return { sukses: true };
  } finally {
    kunci.releaseLock();
  }
}

// Admin membuka akses (susulan/remedial) atau menerapkan perubahan jadwal setelah pimpinan menyetujui.
function waAdminUjianBukaAkses(token, idPerm, d) {
  var p = wajibAdmin_(token);
  d = d || {};
  var kunci = kmKunciUnik_();
  kunci.waitLock(30000);
  try {
    var x = ujCariPerm_(idPerm);
    if (x['Status'] !== 'Disetujui') throw new Error('Permohonan ini belum disetujui pimpinan (status: ' + x['Status'] + ').');
    var j = ujJadwalDariUjian_(x['ID Ujian']);
    if (!j) throw new Error('Jadwal ujian tidak ditemukan.');
    var now = Date.now(), cat = ujCatatan_(d.catatan, 300);
    if (x['Jenis'] === 'Perubahan') {
      var tgl = ujTgl_(d.tanggal) || ujTgl_(x['Usulan Tanggal']), jam = ujJam_(d.jam) || ujJam_(x['Usulan Jam']);
      var ms = ujMs_(tgl, jam);
      if (isNaN(ms)) throw new Error('Tanggal dan jam baru wajib diisi.');
      if (ms < now) throw new Error('Waktu baru sudah lewat.');
      var lama = j.tanggal + ' ' + j.jam;
      ujUbah_('JADWAL', j.baris, { 'Tanggal': tgl, 'Jam Mulai': jam, 'Diubah Oleh': p.nama, 'Diubah Pada': ujNow_(), 'Catatan': 'Dipindah dari ' + lama + ' ke ' + tgl + ' ' + jam + ' (' + x['Alasan'] + ')' });
      ujUbah_('PERM', x._baris, { 'Status': 'Terlaksana', 'Akses Mulai': tgl + ' ' + jam, 'Dibuka Oleh': p.nama, 'Waktu Dibuka': ujNow_(), 'Catatan Admin': cat || x['Catatan Admin'] });
      kmCatat_(p, x['ID Mapel'], 'Terapkan perubahan jadwal ujian', lama + ' -> ' + tgl + ' ' + jam, 'OK');
      return { sukses: true, jenis: 'Perubahan', baru: ujTeksWaktu_(ms) };
    }
    var mulai = ujMs_(d.mulaiTanggal, d.mulaiJam), selesai = ujMs_(d.selesaiTanggal, d.selesaiJam);
    if (isNaN(mulai) || isNaN(selesai)) throw new Error('Isi tanggal dan jam akses dibuka serta ditutup.');
    if (selesai <= mulai) throw new Error('Waktu akses ditutup harus setelah waktu dibuka.');
    if (selesai < now) throw new Error('Waktu akses sudah lewat.');
    if (selesai - mulai > 60 * 24 * 3600000) throw new Error('Rentang akses maksimal 60 hari.');
    var siswa = [];
    try { siswa = JSON.parse(x['Siswa'] || '[]'); } catch (e) { siswa = []; }
    if (!siswa.length) throw new Error('Permohonan tidak memuat siswa.');
    var tm = ujFmt_(mulai, 'yyyy-MM-dd HH:mm'), ts = ujFmt_(selesai, 'yyyy-MM-dd HH:mm');
    siswa.forEach(function (s) {
      ujAksesSiswa_(x['ID Ujian'], s.idRombel, s.nama).forEach(function (a) { if (a['Status'] === 'Terbuka') ujUbah_('AKSES', a._baris, { 'Status': 'Dicabut' }); });
      ujTambah_('AKSES', {
        'ID': generateId_('AKS-'), 'ID Ujian': x['ID Ujian'], 'ID Rombel': s.idRombel, 'Nama Siswa': s.nama, 'Jenis': x['Jenis'], 'Mulai': tm, 'Selesai': ts,
        'Status': 'Terbuka', 'ID Permohonan': x['ID'], 'Dibuka Oleh': p.nama, 'Waktu Dibuka': ujNow_()
      });
    });
    ujUbah_('PERM', x._baris, { 'Status': 'Akses Dibuka', 'Akses Mulai': tm, 'Akses Selesai': ts, 'Dibuka Oleh': p.nama, 'Waktu Dibuka': ujNow_(), 'Catatan Admin': cat || x['Catatan Admin'] });
    ujUbahAjuPerm_(x['ID'], 'Akses Dibuka');
    kmCatat_(p, x['ID Mapel'], 'Buka akses ujian ' + x['Jenis'].toLowerCase(), siswa.length + ' siswa · ' + tm + ' s/d ' + ts, 'OK');
    return { sukses: true, jenis: x['Jenis'], siswa: siswa.length, mulai: ujTeksWaktu_(mulai), selesai: ujTeksWaktu_(selesai) };
  } finally {
    kunci.releaseLock();
  }
}

// ---------- pratinjau ujian untuk tutor: contoh satu set soal hasil undian (tidak disimpan) ----------
function waStafUjianPratinjau(token, idMapel, smt, jenis, putaran) {
  var r = wajibMapel_(token, idMapel);
  var cfg = taBaca_();
  smt = parseInt(smt, 10); jenis = String(jenis || '').toUpperCase();
  if (!(smt >= 1 && smt <= Math.min(2, cfg.jumlahSemester))) throw new Error('Pilih Semester 1 atau 2.');
  if (jenis !== 'UTS' && jenis !== 'UAS') throw new Error('Pilih UTS atau UAS.');
  var pool = ujPool_(idMapel, smt, jenis), j = null, kunciJ = ujKunciJadwal_(idMapel, smt, jenis);
  ujJadwalSemua_().forEach(function (x) { if (x.kunci === kunciJ) j = x; });
  var jumlah = j ? j.jumlah : UJ.JUMLAH_BAWAAN;
  var komp = j ? j.komposisi : ujKomposisi_(jumlah, {});
  var rond = parseInt(putaran, 10) || 0;
  var out = {
    sukses: true, judul: ujJudul_(jenis, smt), jumlah: jumlah, komposisi: komp, terjadwal: !!j, putaran: rond,
    bank: { total: pool.total, jumlahSesi: pool.jumlahSesi, sesiTerisi: pool.sesi.length, tanpaBank: pool.tanpaBank, rinci: pool.rinci }, soal: []
  };
  if (pool.sesi.length) {
    var maksOpsi = kurPaket_(r.m.namaRombel) === 'A' ? 4 : 5;
    var daftar = ujUndi_(pool.sesi, komp, maksOpsi, ['pratinjau', idMapel, smt, jenis, rond].join('|'));
    out.soal = daftar.map(function (s, i) { return { no: i + 1, tingkat: s.tingkat, pertanyaan: s.pertanyaan, opsi: s.opsi, kunci: s.kunci }; });
  }
  return out;
}

// ============================================================
// ABSENSI SISWA PER SESI
// ------------------------------------------------------------
// Aturan:
//  - Setiap sesi materi (bukan sesi UTS/UAS) siswa wajib mengisi absensi di setiap mapelnya.
//  - Absensi diisi SATU kali, hanya selama sesi berjalan (Senin 00:01 sampai Minggu 23:59 sesuai Tahun Ajaran).
//    Tidak bisa diubah atau diisi ulang. Sesi yang sudah berakhir tertutup, kecuali tutor membukakan sesi itu untuk
//    siswa tersebut lewat fitur "Buka Sesi" yang sudah ada (alasan tertulis).
//  - Kehadiran menjadi bobot penilaian (nilai akhir dibangun kemudian). Data disimpan di sheet "Absensi".
// Absensi tampil di sisi siswa sebagai item bawaan "Absensi Sesi N" di tiap sesi (id "ABS|semester|sesi"),
// tanpa baris di sheet Materi, jadi tutor tidak perlu membuatnya.
// ============================================================
var AB = {
  SHEET: 'Absensi',
  HEADERS: ['ID Rombel', 'ID Mapel', 'Nama Mapel', 'Semester', 'Sesi', 'Nama Siswa', 'Status', 'Waktu Absen', 'Catatan'],
  AWALAN: 'ABS|',
  HADIR: 'Hadir'
};

function abSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(AB.SHEET);
  if (!sh) {
    sh = ss.insertSheet(AB.SHEET);
    sh.getRange(1, 1, 1, AB.HEADERS.length).setValues([AB.HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    // kolom waktu berformat teks agar "2026-09-21 09:15:00" tidak diubah Sheets menjadi tanggal
    try { sh.getRange(2, 8, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@'); } catch (e) {}
  }
  return sh;
}

function abIdItem_(smt, n) { return AB.AWALAN + smt + '|' + n; }

function abParseId_(id) {
  var m = /^ABS\|(\d+)\|(\d+)$/.exec(String(id || ''));
  return m ? { smt: parseInt(m[1], 10), n: parseInt(m[2], 10) } : null;
}

// Sesi yang wajib absensi: sesi materi (UTS/UAS tidak, karena kehadirannya terbukti dari ujian itu sendiri).
function abSesiWajib_(cfg, smt, n) {
  return smt >= 1 && smt <= cfg.jumlahSemester && n >= 1 && n <= cfg.sesiPerSemester && n !== cfg.uts && n !== cfg.uas;
}

function abWaktuTeks_(v) {
  if (v instanceof Date) return taWaktuTeks_(v.getTime());
  return String(v === null || v === undefined ? '' : v).trim();
}

// Semua baris absensi satu mapel: [{ idRombel, smt, n, nama, kunciNama, status, waktu, waktuMs, catatan }]
function abBaca_(idMapel) {
  var v = abSheet_().getDataRange().getValues(), out = [];
  for (var i = 1; i < v.length; i++) {
    var r = v[i];
    if (idMapel !== null && String(r[1]).trim() !== String(idMapel)) continue;
    if (!String(r[5] || '').trim()) continue;
    var w = abWaktuTeks_(r[7]);
    out.push({
      idRombel: String(r[0]).trim(), idMapel: String(r[1]).trim(), smt: Number(r[3]) || 0, n: Number(r[4]) || 0,
      nama: String(r[5]).trim(), kunciNama: normNama_(r[5]), status: String(r[6] || AB.HADIR).trim(),
      waktu: w, waktuMs: taWaktuMs_(w), catatan: String(r[8] || '')
    });
  }
  return out;
}

// Item bawaan "Absensi Sesi N" untuk setiap sesi materi yang sudah dimulai, disisipkan ke daftar materi siswa.
function abSisipItem_(idMapel, daftar) {
  var cfg = taBaca_(), now = new Date().getTime();
  var urut = [];
  (daftar || []).forEach(function(m, idx) {
    if (m && m.jenis === 'Absensi') return;     // sisa data lama: diganti item bawaan
    var p = taParse_(cfg, m.sesiKey || '');
    urut.push({ m: m, smt: p ? p.smt : 99, n: p ? p.n : 999, rank: 1, idx: idx });
  });
  for (var smt = 1; smt <= cfg.jumlahSemester; smt++) {
    for (var n = 1; n <= cfg.sesiPerSemester; n++) {
      if (!abSesiWajib_(cfg, smt, n)) continue;
      var info = taInfo_(cfg, smt, n, now);
      if (info.status === 'mendatang') continue;
      urut.push({
        m: {
          id: abIdItem_(smt, n), idMapel: String(idMapel), jenis: 'Absensi', judul: 'Absensi Sesi ' + n, konten: '',
          status: 'Aktif', sesi: info.label + (info.status === 'berjalan' ? ' · berjalan' : ' · berakhir'), sesiKey: info.nama,
          jenisSesi: 'Biasa', sesiBerakhirMs: info.selesaiMs, terkunciSesi: false,
          absen: { smt: smt, n: n, status: info.status, mulaiMs: info.mulaiMs, selesaiMs: info.selesaiMs, rentang: info.rentang }
        },
        smt: smt, n: n, rank: 0, idx: -1
      });
    }
  }
  urut.sort(function(a, b) { return (a.smt - b.smt) || (a.n - b.n) || (a.rank - b.rank) || (a.idx - b.idx); });
  return urut.map(function(x) { return x.m; });
}

// Riwayat absensi seorang siswa pada satu mapel dalam bentuk yang sama dengan riwayat jawaban: { "ABS|1|3": {...} }.
function abRiwayatSiswa_(idMapel, nama) {
  var out = {}, kunci = normNama_(nama);
  abBaca_(idMapel).forEach(function(r) {
    if (r.kunciNama !== kunci) return;
    out[abIdItem_(r.smt, r.n)] = { jawaban: r.status, nilai: '', waktu: r.waktu, waktuMs: r.waktuMs, catatan: r.catatan };
  });
  return out;
}

// payload: { idRombel, idMapel, nama, idMateri }  (idMateri = "ABS|semester|sesi")
function waAbsenIsi(payload) {
  var p = payload || {};
  var idRombel = String(p.idRombel || '').trim(), idMapel = String(p.idMapel || '').trim(), nama = String(p.nama || '').trim();
  var gagal = function(pesan) {
    try { catat_('Siswa', idRombel, nama, 'Absensi', 'mapel ' + idMapel + ', ' + (p.idMateri || '') + ' - ' + pesan, 'GAGAL'); } catch (e) {}
    return { sukses: false, pesan: pesan };
  };
  var ref = abParseId_(p.idMateri);
  if (!ref) return gagal('Absensi tidak dikenali.');
  var cfg = taBaca_();
  if (!abSesiWajib_(cfg, ref.smt, ref.n)) return gagal('Sesi ini tidak memerlukan absensi.');
  try { ruangSiswa_(nama, idRombel, RUANG.AWALAN_MAPEL + idMapel); } catch (e) {
    // v1.38.7: bedakan mapel yang sudah dinonaktifkan sekolah dari data siswa yang tidak cocok
    var mapelAda = false;
    try { getSheetData(CONFIG.SHEETS.MAPEL).forEach(function(r, i) { if (i > 0 && sTeks_(r[0]).trim() === idMapel && sTeks_(r[1]).trim() === idRombel) mapelAda = true; }); } catch (e2) {}
    if (mapelAda && !mapelMilikRombel_(idMapel, idRombel)) return gagal('Mata pelajaran ini sudah tidak aktif untuk kelas Anda, jadi absensinya tidak diperlukan. Daftar mata pelajaran Anda akan diperbarui.');
    return gagal('Data siswa atau mata pelajaran tidak sesuai. Muat ulang halaman lalu coba lagi.'); }

  var now = new Date().getTime();
  var info = taInfo_(cfg, ref.smt, ref.n, now);
  var dibuka = null;
  if (now < info.mulaiMs) return gagal('Sesi ini belum dibuka. Absensi dapat diisi mulai ' + info.mulaiIso.split('-').reverse().join('/') + '.');
  if (now > info.selesaiMs) {
    dibuka = taAdaBuka_(idMapel, nama, info.nama, now);
    if (!dibuka) return gagal('Sesi ini sudah berakhir pada ' + info.selesaiIso.split('-').reverse().join('/') + ', jadi absensi ditutup. Bila Anda berhalangan, minta tutor pengampu untuk membukakan sesi ini.');
  }

  var kunci = LockService.getScriptLock();
  kunci.waitLock(15000);
  try {
    var kn = normNama_(nama);
    var sudah = abBaca_(idMapel).filter(function(r) { return r.smt === ref.smt && r.n === ref.n && r.kunciNama === kn; })[0];
    if (sudah) {
      return { sukses: true, sudah: true, pesan: 'Absensi Anda untuk sesi ini sudah tercatat pada ' + sudah.waktu + '. Absensi hanya dapat diisi satu kali.', waktu: sudah.waktu, id: abIdItem_(ref.smt, ref.n) };
    }
    var waktu = taWaktuTeks_(now);
    var sh = abSheet_();
    var baris = sh.getLastRow() + 1;
    try { sh.getRange(baris, 8).setNumberFormat('@'); } catch (e) {}   // format teks DULU, baru isi, supaya waktu tidak berubah menjadi tanggal
    sh.getRange(baris, 1, 1, AB.HEADERS.length).setValues([[idRombel, idMapel, getNamaMapel_(idMapel), ref.smt, ref.n, nama, AB.HADIR, waktu, dibuka ? (dibuka.sumber === 'susulan' ? 'Masa susulan' : 'Dibuka tutor') : '']]);
    try { catat_('Siswa', idRombel, nama, 'Absensi', 'mapel ' + idMapel + ', ' + info.nama, 'OK'); } catch (e) {}
    return { sukses: true, sudah: false, pesan: 'Kehadiran Anda tercatat.', waktu: waktu, id: abIdItem_(ref.smt, ref.n) };
  } finally {
    try { kunci.releaseLock(); } catch (e) {}
  }
}

// ---------- rekap untuk tutor/admin ----------
// Sesi wajib yang sudah dimulai (urut) lengkap dengan statusnya.
function abSesiBerjalan_(cfg, now) {
  var out = [];
  for (var smt = 1; smt <= cfg.jumlahSemester; smt++) {
    for (var n = 1; n <= cfg.sesiPerSemester; n++) {
      if (!abSesiWajib_(cfg, smt, n)) continue;
      var info = taInfo_(cfg, smt, n, now);
      if (info.status === 'mendatang') continue;
      out.push({ smt: smt, n: n, key: smt + '|' + n, nama: info.nama, status: info.status, rentang: info.rentang, mulaiMs: info.mulaiMs, selesaiMs: info.selesaiMs });
    }
  }
  return out;
}

function abDaftarSiswa_(idRombel) {
  var v = getSheetData(CONFIG.SHEETS.SISWA), out = [];
  for (var i = 1; i < v.length; i++) {
    if (sTeks_(v[i][0]).trim() !== String(idRombel)) continue;
    if (!String(v[i][1]).trim()) continue;
    out.push(sTeks_(v[i][1]).trim());
  }
  out.sort();
  return out;
}

// Hadir dan persen dihitung dari sesi yang SUDAH BERAKHIR; sesi yang sedang berjalan ditampilkan terpisah dan belum menurunkan persen.
function abRekapMapel_(idMapel, idRombel, cfg, now) {
  var sesi = abSesiBerjalan_(cfg, now);
  var baris = abBaca_(idMapel), peta = {};
  baris.forEach(function(r) { (peta[r.kunciNama] = peta[r.kunciNama] || {})[r.smt + '|' + r.n] = r; });
  var berakhir = sesi.filter(function(s) { return s.status === 'lewat'; });
  var siswa = abDaftarSiswa_(idRombel).map(function(nama) {
    var h = peta[normNama_(nama)] || {}, hadir = {}, jml = 0;
    sesi.forEach(function(s) { if (h[s.key]) hadir[s.key] = h[s.key].waktu; });
    berakhir.forEach(function(s) { if (h[s.key]) jml++; });
    var kini = sesi.filter(function(s) { return s.status === 'berjalan'; })[0];
    return { nama: nama, hadir: hadir, jumlah: jml, dari: berakhir.length, persen: berakhir.length ? Math.round(jml * 1000 / berakhir.length) / 10 : null, sudahKini: !!(kini && h[kini.key]) };
  });
  return { sesi: sesi, siswa: siswa, sesiBerakhir: berakhir.length };
}

function waStafAbsensi(token, idMapel) {
  var r = wajibMapel_(token, idMapel);
  var cfg = taBaca_(), now = new Date().getTime();
  var rek = abRekapMapel_(idMapel, r.m.idRombel, cfg, now);
  var kini = rek.sesi.filter(function(s) { return s.status === 'berjalan'; })[0] || null;
  return {
    namaMapel: r.m.namaMapel, namaRombel: r.m.namaRombel, sekarangMs: now,
    sesi: rek.sesi, siswa: rek.siswa, sesiBerakhir: rek.sesiBerakhir,
    kini: kini ? { nama: kini.nama, rentang: kini.rentang, hadir: rek.siswa.filter(function(x) { return x.sudahKini; }).length, dari: rek.siswa.length } : null
  };
}

// ============================================================
// PROGRES KEGIATAN PER KELAS (hanya baca)
// Untuk Admin, Kepala Sekolah, dan Koordinator Kurikulum. Menampilkan, per rombel dan per sesi:
// materi terbit, diskusi dijawab/dinilai, ujian (UTS/UAS), dan absensi siswa.
// ============================================================
var PG = { PERAN: ['Admin', 'Kepala Sekolah', 'Koordinator Kurikulum'] };

function pgPeran_(token) {
  var p = stafDariToken_(token);
  if (PG.PERAN.indexOf(p.peran) < 0) throw new Error('Progres kelas hanya dapat dibuka oleh admin, Kepala Sekolah, atau Koordinator Kurikulum.');
  return p;
}

function pgPersen_(a, b) { return b > 0 ? Math.round(a * 1000 / b) / 10 : null; }

// Sesi yang sudah dimulai, urut.
function pgSesi_(cfg, now) {
  var out = [];
  for (var smt = 1; smt <= cfg.jumlahSemester; smt++) {
    for (var n = 1; n <= cfg.sesiPerSemester; n++) {
      var info = taInfo_(cfg, smt, n, now);
      if (info.status === 'mendatang') continue;
      out.push({ smt: smt, n: n, key: smt + '|' + n, nama: info.nama, jenis: info.jenis, status: info.status, rentang: info.rentang, mulaiMs: info.mulaiMs, selesaiMs: info.selesaiMs });
    }
  }
  return out;
}

function pgTutorPeta_() {
  var nama = {}, peta = {};
  bacaPengguna_().forEach(function(u) { if (u.status === 'Aktif' && u.peran && u.peran !== 'Admin') nama[u.id] = u.nama; });
  bacaEnrollment_().forEach(function(e) { if (nama[e.idPengguna]) (peta[e.idMapel] = peta[e.idMapel] || []).push(nama[e.idPengguna]); });
  return peta;
}

function pgRombelAktif_() {
  var out = [];
  getSheetData(CONFIG.SHEETS.ROMBEL).forEach(function(r, i) {
    if (i === 0 || !String(r[0]).trim()) return;
    if (sTeks_(r[3]).trim() !== 'Aktif') return;
    out.push({ id: sTeks_(r[0]).trim(), nama: sTeks_(r[1]).trim() });
  });
  return out;
}

// Menghitung semua rombel sekaligus (sheet dibaca satu kali).
function pgHitung_(idRombelSaja) {
  var cfg = taBaca_(), now = new Date().getTime();
  var sesi = pgSesi_(cfg, now);
  var kini = null;
  sesi.forEach(function(s) { if (s.status === 'berjalan') kini = s; });
  var sesiBiasa = sesi.filter(function(s) { return s.jenis === 'Biasa'; });
  var sesiAbsen = sesi.filter(function(s) { return abSesiWajib_(cfg, s.smt, s.n); });
  var berakhirAbsen = sesiAbsen.filter(function(s) { return s.status === 'lewat'; });

  var mapelSemua = mapelAktifSemua_(), tutor = pgTutorPeta_();
  var siswaRombel = {};
  getSheetData(CONFIG.SHEETS.SISWA).forEach(function(r, i) {
    if (i === 0 || !String(r[1]).trim()) return;
    var id = sTeks_(r[0]).trim();
    (siswaRombel[id] = siswaRombel[id] || []).push(sTeks_(r[1]).trim());
  });

  // materi: peta idMapel|sesiKey -> { materi:{terbit,draft}, diskusi:[idMateri...], ujian:[idMateri...] }
  var mm = kmMateri_(), vm = mm.sheet.getDataRange().getValues(), c = mm.c, itemMapel = {};
  for (var i = 1; i < vm.length; i++) {
    var id = sTeks_(vm[i][c.id - 1]).trim();
    if (!id) continue;
    var idM = sTeks_(vm[i][c.idMapel - 1]).trim();
    var ps = taParse_(cfg, sTeks_(vm[i][c.sesi - 1]).trim() || 'Sesi 1');
    if (!ps) continue;
    var jenis = sTeks_(vm[i][c.jenis - 1]).trim(), aktif = sTeks_(vm[i][c.status - 1]).trim() === 'Aktif';
    var kunci = idM + '|' + ps.smt + '|' + ps.n;
    var h = itemMapel[kunci] || (itemMapel[kunci] = { terbit: 0, draft: 0, diskusi: [], ujian: [] });
    if (jenis === 'Diskusi') { if (aktif) h.diskusi.push(id); }
    else if (jenis === 'Ujian') { if (aktif) h.ujian.push(id); }
    else if (jenis === 'Absensi') { /* item lama, diabaikan */ }
    else if (aktif) h.terbit++; else h.draft++;
  }

  // jawaban: peta idMateri -> { siswaNorm: {nilai:boolean} } (hanya Diskusi dan Ujian), per rombel
  var vj = getSheet(CONFIG.SHEETS.JAWABAN).getDataRange().getValues(), jawab = {};
  if (vj.length > 1) {
    var hd = vj[0].map(function(x) { return String(x).trim(); });
    var kR = hd.indexOf('ID Rombel'), kM = hd.indexOf('ID Materi'), kJ = hd.indexOf('Jenis'), kS = hd.indexOf('Nama Siswa'), kA = hd.indexOf('Jawaban'), kN = hd.indexOf('Nilai');
    for (var j = 1; j < vj.length; j++) {
      var jn = sTeks_(vj[j][kJ]).trim();
      if (jn !== 'Diskusi' && jn !== 'Ujian') continue;
      if (!sTeks_(vj[j][kA]).trim() && jn === 'Diskusi') continue;
      var idT = sTeks_(vj[j][kM]).trim();
      var s = jawab[idT] || (jawab[idT] = {});
      s[sTeks_(vj[j][kR]).trim() + '|' + normNama_(vj[j][kS])] = sTeks_(vj[j][kN]).trim() !== '';
    }
  }

  // absensi: peta idMapel|smt|n -> { norm: true }
  var absen = {};
  abBaca_(null).forEach(function(r) { (absen[r.idMapel + '|' + r.smt + '|' + r.n] = absen[r.idMapel + '|' + r.smt + '|' + r.n] || {})[r.kunciNama] = true; });

  // jadwal ujian
  var jadwal = {};
  try { ujJadwalSemua_().forEach(function(x) { jadwal[x.idMapel + '|' + x.smt + '|' + x.jenis] = x; }); } catch (e) {}

  var hasil = [];
  pgRombelAktif_().forEach(function(rb) {
    if (idRombelSaja && rb.id !== idRombelSaja) return;
    var siswa = siswaRombel[rb.id] || [], normSiswa = siswa.map(normNama_);
    var mapelRombel = mapelSemua.filter(function(m) { return m.idRombel === rb.id; });
    var mapelOut = mapelRombel.map(function(m) {
      var sel = {}, tot = { absenHadir: 0, absenTarget: 0, diskusiTarget: 0, diskusiDijawab: 0, diskusiDinilai: 0, sesiAdaMateri: 0, sesiTotal: 0 };
      sesi.forEach(function(s) {
        var h = itemMapel[m.idMapel + '|' + s.key] || { terbit: 0, draft: 0, diskusi: [], ujian: [] };
        var cell = { materi: { terbit: h.terbit, draft: h.draft } };
        if (s.jenis === 'Biasa') {
          tot.sesiTotal++;
          if (h.terbit > 0) tot.sesiAdaMateri++;
        }
        if (h.diskusi.length) {
          var dj = 0, dn = 0;
          h.diskusi.forEach(function(idT) {
            var peta = jawab[idT] || {};
            normSiswa.forEach(function(ns) { var k = rb.id + '|' + ns; if (k in peta) { dj++; if (peta[k]) dn++; } });
          });
          cell.diskusi = { item: h.diskusi.length, dijawab: dj, dinilai: dn, target: h.diskusi.length * siswa.length };
          tot.diskusiTarget += cell.diskusi.target; tot.diskusiDijawab += dj; tot.diskusiDinilai += dn;
        }
        if (s.jenis !== 'Biasa') {
          var jd = jadwal[m.idMapel + '|' + s.smt + '|' + s.jenis] || null, mk = 0;
          var idUjian = jd ? String(jd.idUjian) : (h.ujian[0] || '');
          if (idUjian) { var pu = jawab[idUjian] || {}; normSiswa.forEach(function(ns) { if ((rb.id + '|' + ns) in pu) mk++; }); }
          var st = 'belum';
          if (jd) st = now < jd.mulaiMs ? 'terjadwal' : (now <= jd.akhirMs ? 'berlangsung' : 'selesai');
          cell.ujian = { jenis: s.jenis, status: st, tanggal: jd ? jd.tanggal : '', jam: jd ? jd.jam : '', durasi: jd ? jd.durasi : 0, kkm: jd ? jd.kkm : 0, soal: jd ? jd.jumlah : 0, mengerjakan: mk, target: siswa.length, adaItem: h.ujian.length > 0 };
        }
        if (abSesiWajib_(cfg, s.smt, s.n)) {
          var pa = absen[m.idMapel + '|' + s.smt + '|' + s.n] || {}, hd2 = 0;
          normSiswa.forEach(function(ns) { if (pa[ns]) hd2++; });
          cell.absen = { hadir: hd2, target: siswa.length, status: s.status };
          if (s.status === 'lewat') { tot.absenHadir += hd2; tot.absenTarget += siswa.length; }
        }
        sel[s.key] = cell;
      });
      return {
        idMapel: m.idMapel, namaMapel: m.namaMapel, tutor: tutor[m.idMapel] || (m.tutorTeks ? [m.tutorTeks] : []),
        sel: sel,
        ringkas: {
          absenPersen: pgPersen_(tot.absenHadir, tot.absenTarget),
          diskusiDijawab: tot.diskusiDijawab, diskusiTarget: tot.diskusiTarget, diskusiDinilai: tot.diskusiDinilai, diskusiBelumDinilai: tot.diskusiDijawab - tot.diskusiDinilai,
          sesiAdaMateri: tot.sesiAdaMateri, sesiTotal: tot.sesiTotal
        }
      };
    });
    var rAbsH = 0, rAbsT = 0, rBelum = 0, rKosong = 0;
    mapelOut.forEach(function(m) {
      var mt = mapelRombel.filter(function(x) { return x.idMapel === m.idMapel; })[0];
      berakhirAbsen.forEach(function(s) { var ab = m.sel[s.key].absen; if (ab) { rAbsH += ab.hadir; rAbsT += ab.target; } });
      rBelum += m.ringkas.diskusiBelumDinilai;
      if (kini && kini.jenis === 'Biasa' && !(m.sel[kini.key].materi.terbit > 0)) rKosong++;
    });
    var absKini = { hadir: 0, target: 0 };
    if (kini && abSesiWajib_(cfg, kini.smt, kini.n)) mapelOut.forEach(function(m) { var ab = m.sel[kini.key].absen; if (ab) { absKini.hadir += ab.hadir; absKini.target += ab.target; } });
    hasil.push({
      idRombel: rb.id, namaRombel: rb.nama, siswa: siswa.length, mapel: mapelOut,
      ringkas: { absenPersen: pgPersen_(rAbsH, rAbsT), absenKini: absKini, diskusiBelumDinilai: rBelum, mapelTanpaMateriKini: rKosong, jumlahMapel: mapelOut.length }
    });
  });
  return { sekarangMs: now, sesi: sesi, kini: kini ? { nama: kini.nama, key: kini.key, rentang: kini.rentang, jenis: kini.jenis } : null, rombel: hasil };
}

// Daftar rombel dengan ringkasan singkat.
function waStafProgresDaftar(token) {
  pgPeran_(token);
  var d = pgHitung_(null);
  return {
    sekarangMs: d.sekarangMs, kini: d.kini, jumlahSesi: d.sesi.length,
    rombel: d.rombel.map(function(r) { return { idRombel: r.idRombel, namaRombel: r.namaRombel, siswa: r.siswa, ringkas: r.ringkas }; })
  };
}

// Detail satu rombel: tabel mapel x sesi.
function waStafProgresKelas(token, idRombel) {
  pgPeran_(token);
  var d = pgHitung_(String(idRombel || ''));
  if (!d.rombel.length) throw new Error('Rombel tidak ditemukan atau tidak aktif.');
  var r = d.rombel[0];
  return { sekarangMs: d.sekarangMs, kini: d.kini, sesi: d.sesi, idRombel: r.idRombel, namaRombel: r.namaRombel, siswa: r.siswa, mapel: r.mapel, ringkas: r.ringkas };
}

// ============================================================
// KALENDER AKADEMIK PER ROMBEL
// Menampilkan seluruh sesi tahun ajaran (tanggal, jenis UTS/UAS), materi/topik tiap mata pelajaran,
// jadwal ujian, dan tutor pengampu. Dipakai halaman staf dan halaman siswa; keduanya hanya membaca.
// ============================================================
function kalSekolah_() {
  var nama = 'PKBM Tunas Harapan';
  try { var s = getIdentitasSekolah_(); if (s && s.namaSatuan) nama = s.namaSatuan; } catch (e) {}
  return nama;
}

function kalRombel_(idRombel) {
  var hasil = null;
  pgRombelAktif_().forEach(function(r) { if (r.id === String(idRombel)) hasil = r; });
  return hasil;
}

// Membaca hanya kolom tertentu (tanpa kolom isi yang besar seperti konten materi). kolom: nomor kolom 1-based.
// Hasil: baris-baris dengan indeks = nomor kolom - 1; kolom lain dibiarkan kosong.
function kalBacaKolom_(sh, kolom, barisAwal) {
  var n = sh.getLastRow() - barisAwal + 1, out = [], i, j;
  if (n < 1) return out;
  for (i = 0; i < n; i++) out.push([]);
  var urut = kolom.slice().sort(function(a, b) { return a - b; }), grup = [];
  urut.forEach(function(k) {
    var g = grup[grup.length - 1];
    if (g && k === g.sampai + 1) g.sampai = k; else if (!g || k > g.sampai) grup.push({ dari: k, sampai: k });
  });
  grup.forEach(function(g) {
    var v = sh.getRange(barisAwal, g.dari, n, g.sampai - g.dari + 1).getValues();
    for (i = 0; i < n; i++) for (j = 0; j < v[i].length; j++) out[i][g.dari - 1 + j] = v[i][j];
  });
  return out;
}

// Rencana kurikulum semua mapel sekaligus, dibaca satu kali dan hanya kolom yang dibutuhkan kalender.
function kalRencanaSemua_(adaMapel) {
  var K = KUR.K, hasil = {};
  var v = kalBacaKolom_(kurSheet_(), [K.mapel + 1, K.smt + 1, K.minggu + 1, K.bab + 1, K.judulBab + 1, K.topik + 1, K.halaman + 1], 2);
  for (var i = 0; i < v.length; i++) {
    var idM = sTeks_(v[i][K.mapel]).trim();
    if (!adaMapel[idM]) continue;
    var smt = Number(v[i][K.smt]) || 0, minggu = Number(v[i][K.minggu]) || 0;
    if (smt < 1 || minggu < 1) continue;
    (hasil[idM] = hasil[idM] || []).push({ smt: smt, minggu: minggu, bab: sTeks_(v[i][K.bab]).trim(), judulBab: sTeks_(v[i][K.judulBab]).trim(), topik: sTeks_(v[i][K.topik]).trim(), halaman: sTeks_(v[i][K.halaman]).trim() });
  }
  return hasil;
}

function kalBangun_(idRombel) {
  var id = String(idRombel);
  var mapel = mapelAktifSemua_().filter(function(m) { return m.idRombel === id; });
  // rombel aktif yang punya mapel dikenali dari daftar mapel (tanpa membaca sheet Rombel lagi)
  var rb = mapel.length ? { id: id, nama: mapel[0].namaRombel } : kalRombel_(id);
  if (!rb) throw new Error('Rombel tidak ditemukan atau tidak aktif.');
  var cfg = taBaca_(), now = new Date().getTime();
  var nomor = kurDaftarNomorMateri_(cfg);
  var tutor = pgTutorPeta_();

  // materi aktif per mapel dan sesi (judul saja)
  var mm = kmMateri_(), c = mm.c, item = {};
  var adaMapel = {};
  mapel.forEach(function(m) { adaMapel[m.idMapel] = true; });
  var vm = kalBacaKolom_(mm.sheet, [c.idMapel, c.status, c.sesi, c.jenis, c.judul], 2);
  for (var i = 0; i < vm.length; i++) {
    var idM = sTeks_(vm[i][c.idMapel - 1]).trim();
    if (!adaMapel[idM]) continue;
    if (sTeks_(vm[i][c.status - 1]).trim() !== 'Aktif') continue;
    var ps = taParse_(cfg, sTeks_(vm[i][c.sesi - 1]).trim() || 'Sesi 1');
    if (!ps) continue;
    var jenis = sTeks_(vm[i][c.jenis - 1]).trim();
    if (jenis === 'Absensi' || jenis === 'Ujian') continue;
    var k = idM + '|' + ps.smt + '|' + ps.n;
    var o = item[k] || (item[k] = { materi: [], diskusi: [] });
    var judul = sTeks_(vm[i][c.judul - 1]).trim();
    if (jenis === 'Diskusi') o.diskusi.push(judul); else o.materi.push(judul);
  }

  var jadwal = {};
  try { ujJadwalSemua_().forEach(function(x) { jadwal[x.idMapel + '|' + x.smt + '|' + x.jenis] = x; }); } catch (e) {}

  var sesi = [];
  for (var smt = 1; smt <= cfg.jumlahSemester; smt++) {
    for (var n = 1; n <= cfg.sesiPerSemester; n++) {
      var info = taInfo_(cfg, smt, n, now);
      sesi.push({ smt: smt, n: n, key: smt + '|' + n, nama: info.nama, jenis: info.jenis, status: info.status, mulai: info.mulaiIso, selesai: info.selesaiIso, rentang: info.rentang });
    }
  }

  var isi = {}, rencana = {};
  try { rencana = kalRencanaSemua_(adaMapel); } catch (e) {}
  // v1.53.0: jadwal tatap muka mingguan, asesmen tatap muka, dan ujian lain (Tryout / Ujian Lainnya) per sesi
  var tmPm = {}, tmAs = {}, ujLain = {}, tmTutor = {};
  try {
    var pt = ujtPeta_();
    try { tmTutor = absPetaTutor_(); } catch (eT) {}
    mapel.forEach(function(m) {
      var key = pt.tm[String(m.idMapel)];
      if (key) tmPm[m.idMapel] = pt.pm.filter(function(x) { return x.idRombel + '|' + x.kodeMapel === key; });
    });
    var keKey = {};
    Object.keys(tmPm).forEach(function(idM) { keKey[pt.tm[String(idM)]] = idM; });
    nilAsSemua_(null).forEach(function(a) {
      var idM = keKey[a.idRombel + '|' + a.kodeMapel];
      if (idM) (tmAs[idM] = tmAs[idM] || []).push({ jenis: a.jenis, tanggal: a.tanggal, mulai: a.mulai, selesai: a.selesai, ruang: a.ruang || '' });
    });
  } catch (eTm) {}
  try {
    ujJadwalSemua_().forEach(function(x) {
      if (!adaMapel[x.idMapel] || x.jenis === 'UTS' || x.jenis === 'UAS' || !x.tanggal) return;
      (ujLain[x.idMapel] = ujLain[x.idMapel] || []).push({ jenis: x.jenis === 'TRYOUT' ? 'Tryout' : 'Ujian', judul: x.judulKhusus || ujJudul_(x.jenis, x.smt), tanggal: x.tanggal, jam: x.jam, durasi: x.durasi, kkm: x.kkm });
    });
  } catch (eL) {}
  mapel.forEach(function(m) {
    var plan = {};
    try {
      (rencana[m.idMapel] || []).forEach(function(r) {
        var n = nomor[r.minggu - 1];
        if (n) plan[r.smt + '|' + n] = { topik: r.topik, bab: r.bab, judulBab: r.judulBab, halaman: r.halaman };
      });
    } catch (e) {}
    var peta = {};
    sesi.forEach(function(s) {
      var it = item[m.idMapel + '|' + s.key] || { materi: [], diskusi: [] };
      var p = plan[s.key] || null;
      var cell = { topik: p ? p.topik : '', bab: p ? p.judulBab : '', halaman: p ? p.halaman : '', materi: it.materi, diskusi: it.diskusi };
      if (s.jenis !== 'Biasa') {
        var jd = jadwal[m.idMapel + '|' + s.smt + '|' + s.jenis] || null;
        cell.ujian = { jenis: s.jenis, tanggal: jd ? jd.tanggal : '', jam: jd ? jd.jam : '', durasi: jd ? jd.durasi : 0, kkm: jd ? jd.kkm : 0 };
      }
      if (s.mulai && s.selesai) {
        var tm = [];
        (tmPm[m.idMapel] || []).forEach(function(x) {
          for (var tg = s.mulai, h = 0; tg <= s.selesai && h < 14; tg = ujtTambahHari_(tg, 1), h++) {
            if (jadBerlaku_(x, tg)) tm.push({ tanggal: tg, hari: jadHariDari_(tg), mulai: x.mulai, selesai: x.selesai, tutor: tmTutor[x.idTutor] ? tmTutor[x.idTutor].nama : '' });
          }
        });
        if (tm.length) cell.tatapMuka = tm.sort(function(a, b) { return (a.tanggal + a.mulai).localeCompare(b.tanggal + b.mulai); });
        var as = (tmAs[m.idMapel] || []).filter(function(a) { return a.tanggal >= s.mulai && a.tanggal <= s.selesai; });
        if (as.length) cell.asesmen = as;
        var ul = (ujLain[m.idMapel] || []).filter(function(a) { return a.tanggal >= s.mulai && a.tanggal <= s.selesai; });
        if (ul.length) cell.ujianLain = ul;
      }
      peta[s.key] = cell;
    });
    isi[m.idMapel] = peta;
  });

  return {
    sekolah: kalSekolah_(), tahunAjaran: cfg.label || '', idRombel: rb.id, namaRombel: rb.nama, sekarangMs: now,
    mulai: sesi[0].mulai, selesai: sesi[sesi.length - 1].selesai, uts: cfg.uts, uas: cfg.uas,
    mapel: mapel.map(function(m) { return { idMapel: m.idMapel, namaMapel: m.namaMapel, tutor: tutor[m.idMapel] || (m.tutorTeks ? [m.tutorTeks] : []) }; }),
    sesi: sesi, isi: isi
  };
}

// Hasil kalender disimpan sementara (90 detik, terkompresi) agar pembukaan berikutnya tidak membaca banyak sheet lagi.
// segar = true melewati simpanan (tombol Muat ulang).
var KAL_CACHE_DETIK = 90;
function kalCacheAmbil_(id) {
  try {
    var s = CacheService.getScriptCache().get('kal_' + id);
    if (!s) return null;
    return JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(s), 'application/x-gzip')).getDataAsString());
  } catch (e) { return null; }
}
function kalCacheSimpan_(id, d) {
  try {
    var b = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(d), 'application/json', 'kal.json')).getBytes());
    if (b.length < 90000) CacheService.getScriptCache().put('kal_' + id, b, KAL_CACHE_DETIK);
  } catch (e) {}
}
function kalDapat_(id, segar) {
  if (segar !== true) { var c = kalCacheAmbil_(id); if (c) return c; }
  var d = kalBangun_(id);
  kalCacheSimpan_(id, d);
  return d;
}

// Halaman staf: admin dan pimpinan boleh semua rombel; tutor hanya rombel yang mapelnya ia ampu.
function kalRombelStaf_(p) {
  var semua = pgRombelAktif_();
  if (p.peran === 'Admin' || p.peran === 'Kepala Sekolah' || p.peran === 'Koordinator Kurikulum' || p.peran === 'Koordinator Unit') return semua;   // v1.62.0: koordinator unit (siswa unit tersebar di banyak rombel)
  var milik = {};
  bacaEnrollment_().forEach(function(e) { if (e.idPengguna === p.id) milik[e.idMapel] = true; });
  var rombel = {};
  mapelAktifSemua_().forEach(function(m) { if (milik[m.idMapel] === true) rombel[m.idRombel] = true; });
  return semua.filter(function(r) { return rombel[r.id] === true; });
}

function waStafKalenderDaftar(token) {
  var p = stafDariToken_(token);
  return { rombel: kalRombelStaf_(p).map(function(r) { return { idRombel: r.id, namaRombel: r.nama }; }) };
}

function waStafKalender(token, idRombel, segar) {
  var p = stafDariToken_(token);
  // admin dan pimpinan boleh semua rombel: tidak perlu membaca daftar rombel dua kali
  if (p.peran === 'Admin' || p.peran === 'Kepala Sekolah' || p.peran === 'Koordinator Kurikulum' || p.peran === 'Koordinator Unit') return kalDapat_(String(idRombel), segar);
  var boleh = kalRombelStaf_(p).filter(function(r) { return r.id === String(idRombel); });
  if (!boleh.length) throw new Error('Anda tidak memiliki akses ke kalender rombel ini.');
  return kalDapat_(boleh[0].id, segar);
}

// Halaman siswa: hanya siswa yang terdaftar pada rombel itu.
function waSiswaKalender(idRombel, nama, segar) {
  var id = String(idRombel || '').trim(), kn = normNama_(nama), sah = false;
  getSheetData(CONFIG.SHEETS.SISWA).forEach(function(r, i) {
    if (i === 0) return;
    if (sTeks_(r[0]).trim() === id && normNama_(r[1]) === kn && kn) sah = true;
  });
  if (!sah) throw new Error('Data siswa tidak sesuai. Muat ulang halaman lalu coba lagi.');
  return kalDapat_(id, segar);
}

// ============================================================
// RPP / MODUL AJAR PER SESI (meniru "Cetak RPP / Modul Ajar" di Master Control V1)
// ------------------------------------------------------------
// Sama seperti V1, dokumen RPP menggabungkan tiga sumber:
//   1. Identitas satuan pendidikan -> sheet "Identitas_Sekolah" (kop dan tanda tangan)
//   2. Rencana sesi (sheet "Kurikulum": topik, bab, halaman, tujuan pembelajaran, narasi, pertanyaan diskusi)
//   3. Tahun Ajaran -> tanggal pelaksanaan tiap sesi
// Isi khas RPP (model, metode, dimensi profil, pemahaman bermakna, pertanyaan pemantik, kegiatan, asesmen, media)
// disimpan di sheet "RPP" (satu baris per mapel + semester + minggu). Bisa disusun AI per sesi atau diisi tutor.
// Capaian Pembelajaran disimpan di sheet "Identitas_CP" (Mata Pelajaran, Fase, Capaian Pembelajaran, Sumber/Acuan),
// sama dengan V1. Bagian yang kosong tetap tercetak sebagai garis isian (tidak disembunyikan), seperti V1.
// ============================================================
var RPP = {
  SHEET: 'RPP',
  HEADERS: ['ID Mapel', 'Semester', 'Minggu', 'Alokasi JP', 'Model Pembelajaran', 'Metode', 'Dimensi Profil', 'Pemahaman Bermakna',
    'Pertanyaan Pemantik', 'Pendahuluan', 'Kegiatan Inti', 'Penutup', 'Asesmen Diagnostik', 'Asesmen Formatif', 'Asesmen Sumatif',
    'Media dan Alat', 'Diperbarui', 'Oleh'],
  K: { mapel: 0, smt: 1, minggu: 2, jp: 3, model: 4, metode: 5, dimensi: 6, pemahaman: 7, pemantik: 8, pendahuluan: 9, inti: 10,
    penutup: 11, diagnostik: 12, formatif: 13, sumatif: 14, media: 15, waktu: 16, oleh: 17 },
  CP_SHEET: 'Identitas_CP',
  CP_HEADERS: ['Mata Pelajaran', 'Fase', 'Capaian Pembelajaran', 'Sumber/Acuan'],
  PER_AI: 3,
  MAKS_AI_SEKALI: 40,
  MAKS_TEKS: 900,
  MAKS_BUTIR: 600,
  MAKS_CP: 6000,
  MAKS_JP: 12,
  PIKIR: 'low'
};

// ---------- sheet ----------
function rppSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(RPP.SHEET);
  if (!sh) {
    sh = ss.insertSheet(RPP.SHEET);
    sh.getRange(1, 1, 1, RPP.HEADERS.length).setValues([RPP.HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function rppCpSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(RPP.CP_SHEET);
  if (!sh) {
    sh = ss.insertSheet(RPP.CP_SHEET);
    sh.getRange(1, 1, 1, RPP.CP_HEADERS.length).setValues([RPP.CP_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function rppWaktu_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'); }

// ---------- pembacaan blok RPP (seperti bacaBlokRpp_ di V1) ----------
function rppDaftar_(v) {
  return String(v === null || v === undefined ? '' : v).replace(/\r\n?/g, '\n').split('\n')
    .map(function(x) { return x.trim(); }).filter(function(x) { return x; });
}

function rppBlokKosong_() {
  return { alokasiJp: '', model: '', metode: [], dimensi: [], pemahaman: '', pemantik: [], pendahuluan: [], inti: [], penutup: [],
    diagnostik: '', formatif: '', sumatif: '', media: [] };
}

function rppBarisKeBlok_(r) {
  var K = RPP.K;
  var jp = r[K.jp];
  return {
    alokasiJp: (jp === '' || jp === null || jp === undefined) ? '' : String(jp).trim(),
    model: sTeks_(r[K.model]).trim(), metode: rppDaftar_(r[K.metode]), dimensi: rppDaftar_(r[K.dimensi]),
    pemahaman: sTeks_(r[K.pemahaman]).trim(), pemantik: rppDaftar_(r[K.pemantik]),
    pendahuluan: rppDaftar_(r[K.pendahuluan]), inti: rppDaftar_(r[K.inti]), penutup: rppDaftar_(r[K.penutup]),
    diagnostik: sTeks_(r[K.diagnostik]).trim(), formatif: sTeks_(r[K.formatif]).trim(), sumatif: sTeks_(r[K.sumatif]).trim(),
    media: rppDaftar_(r[K.media])
  };
}

// { 'smt|minggu': { baris, blok } } untuk satu mapel
function rppBaca_(idMapel) {
  var v = rppSheet_().getDataRange().getValues(), out = {};
  for (var i = 1; i < v.length; i++) {
    if (sTeks_(v[i][RPP.K.mapel]).trim() !== String(idMapel)) continue;
    var smt = Number(v[i][RPP.K.smt]) || 0, mg = Number(v[i][RPP.K.minggu]) || 0;
    if (smt < 1 || mg < 1) continue;
    out[smt + '|' + mg] = { baris: i + 1, blok: rppBarisKeBlok_(v[i]) };
  }
  return out;
}

// Kelengkapan 0..6 (tujuan, pendahuluan, inti, penutup, asesmen formatif, model), sama dengan skor di V1.
function rppSkor_(blok, tujuan) {
  var p = 0;
  if (tujuan && tujuan.length) p++;
  if (blok.pendahuluan.length) p++;
  if (blok.inti.length) p++;
  if (blok.penutup.length) p++;
  if (blok.formatif) p++;
  if (blok.model) p++;
  return p;
}

// ---------- identitas ----------
function rppSekolah_() {
  var s = { namaSatuan: 'PKBM Tunas Harapan', npsn: '', jenjang: '', alamat: '', namaKepala: '', nipKepala: '', kotaTtd: '', kurikulum: '' };
  try {
    var v = getSheet(CONFIG.SHEETS.IDENTITAS_SEKOLAH).getDataRange().getValues();
    for (var i = 1; i < v.length; i++) {
      var k = sTeks_(v[i][0]).trim();
      if (k && s.hasOwnProperty(k)) {
        var nilai = sTeks_(v[i][1]).trim();
        if (nilai) s[k] = nilai;
      }
    }
  } catch (e) {}
  return s;
}

// "Kelas A5" -> paket A, kelas 5 -> Fase C. Kelas 1-2 A, 3-4 B, 5-6 C, 7-9 D, 10 E, 11-12 F.
function rppFase_(namaRombel) {
  var m = String(namaRombel || '').match(/([ABC])\s*-?\s*(\d{1,2})/i);
  if (!m) return '';
  var n = parseInt(m[2], 10);
  if (n <= 2) return 'A';
  if (n <= 4) return 'B';
  if (n <= 6) return 'C';
  if (n <= 9) return 'D';
  if (n === 10) return 'E';
  return 'F';
}

function rppJenjang_(namaRombel) {
  var p = (typeof kurPaket_ === 'function') ? kurPaket_(namaRombel) : '';
  if (p === 'A') return 'SD/MI/Program Paket A';
  if (p === 'B') return 'SMP/MTs/Program Paket B';
  if (p === 'C') return 'SMA/MA/SMK/Program Paket C';
  return '';
}

// Kode mapel di depan nama (mis. "C10 - Ekonomi") diabaikan supaya CP yang diisi tanpa kode tetap cocok.
function rppNormMapel_(t) { return String(t || '').replace(/\s+/g, ' ').trim().replace(/^[A-Za-z]\d{1,2}\s*[-–]\s*/, '').replace(/[.\s]+$/, '').toLowerCase(); }

// Seperti getCpFor_ di V1: cocok mapel + fase lebih diutamakan, lalu cocok mapel saja.
function rppCariCp_(namaMapel, fase) {
  var v = rppCpSheet_().getDataRange().getValues();
  var m = rppNormMapel_(namaMapel), f = String(fase || '').trim().toUpperCase();
  var penuh = null, mapelSaja = null;
  for (var i = 1; i < v.length; i++) {
    if (rppNormMapel_(v[i][0]) !== m || !m) continue;
    var o = { baris: i + 1, teks: sTeks_(v[i][2]).trim(), sumber: sTeks_(v[i][3]).trim(), fase: sTeks_(v[i][1]).trim() };
    if (f && o.fase.toUpperCase() === f) { penuh = o; break; }
    if (!mapelSaja) mapelSaja = o;
  }
  return penuh || mapelSaja || null;
}

function rppJumlahSiswa_(idRombel) {
  var n = 0;
  getSheetData(CONFIG.SHEETS.SISWA).forEach(function(r, i) {
    if (i === 0 || !String(r[1]).trim()) return;
    if (sTeks_(r[0]).trim() === String(idRombel)) n++;
  });
  return n;
}

// ---------- akses ----------
// Admin dan tutor pengampu boleh mengubah; Kepala Sekolah dan Koordinator Kurikulum hanya membaca.
function rppAkses_(token, idMapel, perluUbah) {
  var p = stafDariToken_(token);
  var m = null;
  mapelAktifSemua_().forEach(function(x) { if (x.idMapel === String(idMapel)) m = x; });
  if (!m) throw new Error('Mapel tidak ditemukan atau sudah tidak aktif.');
  var pimpinan = (p.peran === 'Kepala Sekolah' || p.peran === 'Koordinator Kurikulum' || p.peran === 'Superadmin');
  if (p.peran !== 'Admin' && !pimpinan) {
    var boleh = false;
    bacaEnrollment_().forEach(function(e) { if (e.idPengguna === p.id && e.idMapel === m.idMapel) boleh = true; });
    if (!boleh) throw new Error('Anda tidak mengampu mapel ini.');
  }
  var ubah = !pimpinan;
  if (perluUbah && !ubah) throw new Error('Peran Anda hanya dapat melihat RPP, tidak dapat mengubahnya.');
  return { p: p, m: m, ubah: ubah };
}

// ---------- pembangunan data ----------
function rppBangun_(m, ubah) {
  var cfg = taBaca_(), now = new Date().getTime();
  var nomor = kurDaftarNomorMateri_(cfg);
  var simpan = rppBaca_(m.idMapel);
  var tutor = [];
  try { tutor = pgTutorPeta_()[m.idMapel] || []; } catch (e) {}
  if (!tutor.length && m.tutorTeks) tutor = [m.tutorTeks];
  var sekolah = rppSekolah_();
  var fase = rppFase_(m.namaRombel);
  var cp = rppCariCp_(m.namaMapel, fase);
  // Kerangka CP-TP-ATP yang disetujui admin (Kerangka.gs) menjadi sumber utama CP; Identitas_CP dipakai bila belum ada.
  var kerangka = null;
  try { kerangka = kfUntukMapel_(m); } catch (e) { kerangka = null; }
  if (kerangka) cp = { baris: cp ? cp.baris : 0, teks: kfTeksCp_(kerangka.cp), sumber: kerangka.sumber || 'Kerangka Kurikulum (disetujui admin)', fase: kerangka.fase };
  var rows = [], buku = '';
  kurBaca_(m.idMapel).forEach(function(r) {
    var n = nomor[r.minggu - 1] || 0;
    var info = n ? taInfo_(cfg, r.smt, n, now) : null;
    var s = simpan[r.smt + '|' + r.minggu];
    var blok = s ? s.blok : rppBlokKosong_();
    var tujuan = rppDaftar_(r.tp);
    if (!buku && r.buku) buku = r.buku;
    rows.push({
      smt: r.smt, minggu: r.minggu, n: n, nama: n ? taNama_(r.smt, n) : '', rentang: info ? info.rentang : '',
      statusSesi: info ? info.status : '', bab: r.bab, judulBab: r.judulBab, topik: r.topik, halaman: r.halaman,
      tujuan: tujuan, narasi: r.narasi, tanya: r.tanya, rpp: blok, skor: rppSkor_(blok, tujuan), ada: !!s
    });
  });
  var peringatan = [];
  if (!tutor.length) peringatan.push('Nama tutor pengampu belum terdaftar pada mapel ini. Kolom tanda tangan tutor tercetak kosong.');
  if (!cp || !cp.teks) peringatan.push('Capaian Pembelajaran belum diisi. Minta admin menyusunnya di tab "CP · TP · ATP" (unggah PDF Panduan, AI menyusun), atau isi sendiri lewat tombol "Ubah CP" dengan teks resmi dari dokumen pemerintah.');
  if (!sekolah.namaKepala) peringatan.push('Nama kepala satuan pendidikan belum diisi di sheet Identitas_Sekolah (kunci namaKepala). Kolom tanda tangan kepala tercetak kosong.');
  if (!fase) peringatan.push('Fase tidak dapat ditebak dari nama kelas "' + m.namaRombel + '". Kolom Fase tercetak kosong.');
  return {
    idMapel: m.idMapel, namaMapel: m.namaMapel, idRombel: m.idRombel, namaRombel: m.namaRombel, tahunAjaran: cfg.label || '',
    fase: fase, jenjang: sekolah.jenjang || rppJenjang_(m.namaRombel), kurikulum: sekolah.kurikulum || 'Kurikulum Merdeka',
    bukuAcuan: buku, jumlahSiswa: rppJumlahSiswa_(m.idRombel), tutor: tutor, sekolah: sekolah,
    cp: { teks: cp ? cp.teks : '', sumber: cp ? cp.sumber : '', fase: cp ? cp.fase : '' },
    kerangka: kerangka, rows: rows, dapatUbah: !!ubah, siapAi: !!aiKunci_(), perAi: RPP.PER_AI, peringatan: peringatan
  };
}

function waStafRppBaca(token, idMapel) {
  var a = rppAkses_(token, idMapel, false);
  return rppBangun_(a.m, a.ubah);
}

// ---------- simpan ----------
function rppBersihBlok_(d) {
  d = d || {};
  var jp = parseInt(d.alokasiJp, 10);
  return {
    alokasiJp: (jp >= 1 && jp <= RPP.MAKS_JP) ? jp : '',
    model: aiTeks_(d.model, 200),
    metode: aiDaftarTeks_(rppDaftarDariIsi_(d.metode), 100, 8),
    dimensi: aiDaftarTeks_(rppDaftarDariIsi_(d.dimensi), 100, 8),
    pemahaman: aiTeks_(d.pemahaman, RPP.MAKS_TEKS),
    pemantik: aiDaftarTeks_(rppDaftarDariIsi_(d.pemantik), RPP.MAKS_BUTIR, 6),
    pendahuluan: aiDaftarTeks_(rppDaftarDariIsi_(d.pendahuluan), RPP.MAKS_BUTIR, 8),
    inti: aiDaftarTeks_(rppDaftarDariIsi_(d.inti), RPP.MAKS_BUTIR, 12),
    penutup: aiDaftarTeks_(rppDaftarDariIsi_(d.penutup), RPP.MAKS_BUTIR, 8),
    diagnostik: aiTeks_(d.diagnostik, RPP.MAKS_TEKS),
    formatif: aiTeks_(d.formatif, RPP.MAKS_TEKS),
    sumatif: aiTeks_(d.sumatif, RPP.MAKS_TEKS),
    media: aiDaftarTeks_(rppDaftarDariIsi_(d.media), 120, 10)
  };
}

// isian layar berupa teks (satu butir per baris); keluaran AI berupa larik
function rppDaftarDariIsi_(v) {
  if (Object.prototype.toString.call(v) === '[object Array]') return [].slice.call(v);
  return String(v === null || v === undefined ? '' : v).replace(/\r\n?/g, '\n').split('\n');
}

function rppTulisBlok_(sh, idMapel, smt, minggu, blok, nama, adaBaris) {
  var K = RPP.K;
  var baris = [idMapel, smt, minggu, blok.alokasiJp, blok.model, blok.metode.join('\n'), blok.dimensi.join('\n'), blok.pemahaman,
    blok.pemantik.join('\n'), blok.pendahuluan.join('\n'), blok.inti.join('\n'), blok.penutup.join('\n'), blok.diagnostik,
    blok.formatif, blok.sumatif, blok.media.join('\n'), rppWaktu_(), nama];
  if (adaBaris) sh.getRange(adaBaris, 1, 1, baris.length).setValues([baris]);
  else sh.appendRow(baris);
}

function waStafRppSimpan(token, idMapel, smt, minggu, d) {
  var a = rppAkses_(token, idMapel, true);
  smt = parseInt(smt, 10); minggu = parseInt(minggu, 10);
  var rencana = kurBaca_(idMapel).filter(function(x) { return x.smt === smt && x.minggu === minggu; })[0];
  if (!rencana) throw new Error('Sesi tidak ditemukan di rencana kurikulum. Susun rencananya dulu di tab Kurikulum.');
  var blok = rppBersihBlok_(d);
  var kunci = kmKunciUnik_();
  kunci.waitLock(20000);
  try {
    var ada = rppBaca_(idMapel)[smt + '|' + minggu];
    rppTulisBlok_(rppSheet_(), idMapel, smt, minggu, blok, a.p.nama, ada ? ada.baris : 0);
    kmCatat_(a.p, idMapel, 'Ubah RPP', 'Semester ' + smt + ' sesi ke-' + minggu + ': ' + rencana.topik, 'OK');
  } finally {
    kunci.releaseLock();
  }
  return { sukses: true, skor: rppSkor_(blok, rppDaftar_(rencana.tp)) };
}

function waStafRppCp(token, idMapel, teks, sumber) {
  var a = rppAkses_(token, idMapel, true);
  var fase = rppFase_(a.m.namaRombel);
  var t = aiTeks_(teks, RPP.MAKS_CP), s = aiTeks_(sumber, 300);
  var kunci = kmKunciUnik_();
  kunci.waitLock(20000);
  try {
    var sh = rppCpSheet_();
    var ada = rppCariCp_(a.m.namaMapel, fase);
    var baris = [a.m.namaMapel, fase, t, s];
    // hanya timpa baris yang fasenya sama; bila yang ada fase lain (atau kosong), tambahkan baris baru untuk fase ini
    if (ada && (String(ada.fase).toUpperCase() === String(fase).toUpperCase())) sh.getRange(ada.baris, 1, 1, baris.length).setValues([baris]);
    else sh.appendRow(baris);
    kmCatat_(a.p, idMapel, 'Ubah CP', a.m.namaMapel + (fase ? ' (Fase ' + fase + ')' : ''), 'OK');
  } finally {
    kunci.releaseLock();
  }
  return { sukses: true, cp: { teks: t, sumber: s, fase: fase } };
}

// ---------- susun dengan AI (teks saja, tanpa PDF) ----------
function rppPrompt_(data, sesi) {
  var daftar = sesi.map(function(x) {
    return '- id "' + x.smt + '-' + x.minggu + '": topik "' + x.topik + '"' + (x.judulBab ? ', bab "' + x.judulBab + '"' : '') +
      (x.halaman ? ', halaman buku ' + x.halaman : '') +
      (x.tujuan.length ? '\n  tujuan pembelajaran: ' + x.tujuan.join(' | ') : '') +
      (x.narasi ? '\n  pengantar: ' + x.narasi : '') + (x.tanya ? '\n  pertanyaan diskusi: ' + x.tanya : '');
  }).join('\n');
  var pagar = String.fromCharCode(96, 96, 96);
  return 'Anda membantu tutor PKBM (pendidikan kesetaraan) menyusun Modul Ajar / RPP per sesi.\n' +
    'Mata pelajaran: ' + data.namaMapel + '. Kelas: ' + data.namaRombel + (data.fase ? ' (Fase ' + data.fase + ')' : '') +
    (data.jenjang ? ', ' + data.jenjang : '') + '. ' + data.kurikulum + '.' +
    (data.bukuAcuan ? ' Buku acuan: ' + data.bukuAcuan + '.' : '') + '\n' +
    (data.cp.teks ? 'Capaian Pembelajaran: ' + data.cp.teks.slice(0, 1500) + '\n' : '') +
    'Peserta didik adalah warga belajar remaja dan dewasa yang banyak bekerja. Satu sesi berlangsung satu pekan: siswa belajar mandiri lewat bacaan dan diskusi tertulis, ' +
    'dengan pendampingan tutor. Gunakan pendekatan Pembelajaran Mendalam (berkesadaran, bermakna, menggembirakan).\n\n' +
    'Susun blok RPP untuk sesi berikut (jangan mengubah topiknya):\n' + daftar + '\n\n' +
    'Aturan isi:\n' +
    '- alokasi_jp: bilangan bulat 2 sampai 4. model_pembelajaran: satu kalimat pendek. metode: 2 sampai 4 butir pendek.\n' +
    '- dimensi_profil: 2 sampai 3 dari: Keimanan dan Ketakwaan, Kewargaan, Penalaran Kritis, Kreativitas, Kolaborasi, Kemandirian, Kesehatan, Komunikasi.\n' +
    '- pemahaman_bermakna: 1 sampai 2 kalimat. pertanyaan_pemantik: 2 sampai 3 pertanyaan dekat dengan kehidupan sehari-hari.\n' +
    '- kegiatan.pendahuluan 2 sampai 3 butir, kegiatan.inti 3 sampai 5 butir, kegiatan.penutup 2 butir; tiap butir satu kalimat jelas yang bisa dikerjakan tutor.\n' +
    '- asesmen: diagnostik, formatif, sumatif masing-masing satu kalimat. media_alat: 2 sampai 5 butir.\n' +
    '- Bahasa Indonesia, tanpa Markdown, tanpa huruf tebal, tanpa penomoran di dalam butir.\n' +
    'Jawab HANYA JSON (tanpa teks lain, tanpa pagar kode ' + pagar + '), persis bentuk ini:\n' +
    '{"hasil":[{"id":"1-1","alokasi_jp":3,"model_pembelajaran":"...","metode":["..."],"dimensi_profil":["..."],"pemahaman_bermakna":"...",' +
    '"pertanyaan_pemantik":["..."],"kegiatan":{"pendahuluan":["..."],"inti":["..."],"penutup":["..."]},' +
    '"asesmen":{"diagnostik":"...","formatif":"...","sumatif":"..."},"media_alat":["..."]}]}';
}

function waStafRppAi(token, idMapel, daftarKunci, opsi) {
  return aiLindungi_(token, function() { return rppAiInti_(token, idMapel, daftarKunci, opsi); });
}

function rppAiInti_(token, idMapel, daftarKunci, opsi) {
  var a = rppAkses_(token, idMapel, true);
  aiWajibSiap_();
  opsi = opsi || {};
  var data = rppBangun_(a.m, true);
  var minta = {};
  (Object.prototype.toString.call(daftarKunci) === '[object Array]' ? [].slice.call(daftarKunci) : []).slice(0, RPP.PER_AI).forEach(function(k) { minta[String(k)] = true; });
  var target = [], dilewati = 0;
  data.rows.forEach(function(x) {
    if (!minta[x.smt + '-' + x.minggu]) return;
    if (x.rpp.inti.length && !opsi.timpa) { dilewati++; return; }
    target.push(x);
  });
  if (!target.length) return { terisi: 0, dilewati: dilewati, hasil: [] };
  if (hitung_('aip|' + a.p.id, 3600) > AI.MAKS_PROSES_PER_JAM) throw new Error('Terlalu banyak proses AI dalam satu jam. Coba lagi nanti.');
  var mulai = Date.now();
  var res = aiPanggil_('POST', AI.BASE + '/v1beta/models/' + aiModel_() + ':generateContent', {
    contents: [{ role: 'user', parts: [{ text: rppPrompt_(data, target) }] }],
    generationConfig: { temperature: 0.4, responseMimeType: 'application/json', maxOutputTokens: 16384 }
  }, { mulai: mulai, pikir: RPP.PIKIR, penanda: true });
  var pakai = aiRingkasPakai_(res, mulai);
  var j = aiParseJson_(aiTeksDariRespons_(res.json));
  var peta = {};
  ((j && j.hasil) || []).forEach(function(h) {
    var id = String(h && h.id || '').trim();
    if (!id || !h) return;
    var keg = h.kegiatan || {}, ase = h.asesmen || {};
    var blok = rppBersihBlok_({
      alokasiJp: h.alokasi_jp, model: h.model_pembelajaran, metode: h.metode, dimensi: h.dimensi_profil, pemahaman: h.pemahaman_bermakna,
      pemantik: h.pertanyaan_pemantik, pendahuluan: keg.pendahuluan, inti: keg.inti, penutup: keg.penutup,
      diagnostik: ase.diagnostik, formatif: ase.formatif, sumatif: ase.sumatif, media: h.media_alat
    });
    if (blok.inti.length) peta[id] = blok;
  });
  var terisi = 0, hasil = [];
  var kunci = kmKunciUnik_();
  kunci.waitLock(20000);
  try {
    var sh = rppSheet_();
    var terbaru = rppBaca_(idMapel);
    target.forEach(function(x) {
      var b = peta[x.smt + '-' + x.minggu];
      if (!b) return;
      var ada = terbaru[x.smt + '|' + x.minggu];
      if (ada && ada.blok.inti.length && !opsi.timpa) return;   // diisi orang lain saat AI bekerja
      rppTulisBlok_(sh, idMapel, x.smt, x.minggu, b, a.p.nama + ' (AI)', ada ? ada.baris : 0);
      terisi++;
      hasil.push(x.smt + '-' + x.minggu);
    });
    kmCatat_(a.p, idMapel, 'AI RPP', terisi + ' sesi · ' + pakai, 'OK');
  } finally {
    kunci.releaseLock();
  }
  if (!terisi) throw new Error('AI tidak menghasilkan RPP yang lengkap untuk sesi ini. Coba lagi, atau isi manual lewat tombol Ubah.');
  return { terisi: terisi, dilewati: dilewati, hasil: hasil };
}

// ============================================================
// PENDAFTARAN TUTOR MANDIRI + PENGAJUAN ENROLLMENT, dan RESET DATA UJI COBA
// ------------------------------------------------------------
// Halaman publik ?halaman=daftartutor (dibuka/ditutup admin):
//   1. Calon tutor mengisi nama dan email, lalu mencentang mata pelajaran yang diampu
//      (dikelompokkan per Paket A/B/C, lalu per rombel).
//   2. OTP 6 angka dikirim ke email (aturan dan pembatas sama dengan pendaftaran siswa).
//   3. OTP benar -> akun Tutor dibuat (Aktif) dengan Kode Akses, dan setiap mapel yang dicentang
//      disimpan sebagai PENGAJUAN (status Menunggu) di sheet "Pengajuan Enrollment".
//      Tutor BELUM mengampu apa pun: enrollment baru dibuat setelah admin menyetujui.
// Admin memutuskan per mapel (setuju/tolak) di tab "Pengajuan Tutor". Pengaturan enrollment manual tetap ada.
//
// Reset data: waAdminResetRencana (pratinjau) dan waAdminResetData (eksekusi, wajib mengetik frasa).
// ============================================================

var DT = {
  SHEET: 'Pengajuan Enrollment',
  HEADERS: ['ID Pengajuan', 'ID Pengguna', 'Nama Tutor', 'ID Mapel', 'Nama Mapel', 'Kelas/Rombel', 'Status', 'Diajukan Pada', 'Diputuskan Pada', 'Diputuskan Oleh', 'Catatan'],
  PROP_BUKA: 'DAFTAR_TUTOR_BUKA',
  MAKS_MAPEL: 80,
  RIWAYAT: 25
};

var RESET = {
  FRASA: 'RESET DATA',
  // Data uji coba yang dikosongkan (baris data; baris judul kolom tetap).
  BERSIH: ['Siswa', 'Materi', 'Jawaban', 'Chat', 'Kehadiran', 'Soal Ujian', 'Percobaan Ujian', 'Jadwal Ujian', 'Pengajuan Ujian', 'Hasil Ujian',
    'Permohonan Ujian', 'Penilaian Diskusi', 'Notifikasi', 'Draft Diskusi', 'Buka Sesi', 'Absensi', 'RPP', 'Log Aktivitas'],
  // Dipertahankan.
  SIMPAN: ['Pengguna', 'Enrollment Tutor', 'Pengajuan Enrollment', 'Rombel', 'Mapel', 'Kurikulum', 'Kerangka Kurikulum', 'Identitas_CP', 'Identitas_Sekolah', 'Pendaftaran Rombel']
};

// ---------- sheet & pengaturan ----------
function pastikanSheetPengajuan_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(DT.SHEET);
  if (!sh) {
    sh = ss.insertSheet(DT.SHEET);
    sh.getRange(1, 1, 1, DT.HEADERS.length).setValues([DT.HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(2, 1, 500, DT.HEADERS.length).setNumberFormat('@');
  }
  return sh;
}

function dtTerbuka_() {
  // Tautan pendaftaran umum tetap tertutup (enrollment diatur admin, selaras SIM SETARA).
  // Pengecualian: calon tutor yang memakai KODE UNDANGAN dari admin di aplikasi E-Course TH, selama admin membukanya.
  return DT_LEWAT_UNDANGAN_ === true && dtUndanganBuka_();
}

function dtNamaPaket_(kode) { return kode ? 'Paket ' + kode : 'Lainnya'; }

// Mapel aktif dikelompokkan: [{ kode, nama, rombel: [{ idRombel, namaRombel, mapel: [{ idMapel, namaMapel }] }] }]
function dtDaftarMapel_() {
  var perPaket = {}, perRombel = {};
  mapelAktifSemua_().forEach(function(m) {
    var kode = kurPaket_(m.namaRombel);
    var p = perPaket[kode] = perPaket[kode] || { kode: kode, nama: dtNamaPaket_(kode), rombel: [] };
    var r = perRombel[m.idRombel];
    if (!r) { r = perRombel[m.idRombel] = { idRombel: m.idRombel, namaRombel: m.namaRombel, mapel: [] }; p.rombel.push(r); }
    r.mapel.push({ idMapel: m.idMapel, namaMapel: m.namaMapel });
  });
  var urut = function(a, b) { return String(a).localeCompare(String(b), 'id', { numeric: true, sensitivity: 'base' }); };
  var out = Object.keys(perPaket).map(function(k) { return perPaket[k]; });
  out.sort(function(a, b) {
    if (!a.kode) return 1;
    if (!b.kode) return -1;
    return urut(a.kode, b.kode);
  });
  out.forEach(function(p) {
    p.rombel.sort(function(a, b) { return urut(a.namaRombel, b.namaRombel); });
    p.rombel.forEach(function(r) { r.mapel.sort(function(a, b) { return urut(a.namaMapel, b.namaMapel); }); });
  });
  return out;
}

// ---------- halaman publik ----------
function waDaftarTutorInfo() {
  if (!dtTerbuka_()) return { terbuka: false, paket: [] };
  return { terbuka: true, paket: dtDaftarMapel_() };
}

function dtNamaValid_(nama) {
  return /^[À-ɏA-Za-z][À-ɏA-Za-z\s.'’,\-]{2,79}$/.test(nama);
}

function dtNamaSudahAda_(nama) {
  var ada = false;
  bacaPengguna_().forEach(function(p) { if (normNama_(p.nama) === normNama_(nama)) ada = true; });
  return ada;
}

function waDaftarTutorMulai(data) {
  pastikanSheetPeran_();
  data = data || {};
  if (!dtTerbuka_()) return { sukses: false, pesan: 'Pendaftaran tutor sedang ditutup. Hubungi admin.' };
  var nama = String(data.nama || '').trim().replace(/\s+/g, ' ');
  var email = String(data.email || '').trim().toLowerCase();
  if (!dtNamaValid_(nama)) return { sukses: false, pesan: 'Tulis nama lengkap (minimal 3 huruf, tanpa angka).' };
  if (!emailValid_(email)) return { sukses: false, pesan: 'Alamat email tidak valid.' };
  var dipilih = [], lihat = {};
  (Array.isArray(data.mapel) ? data.mapel : []).forEach(function(id) {
    id = String(id || '').trim();
    if (id && !lihat[id]) { lihat[id] = true; dipilih.push(id); }
  });
  if (!dipilih.length) return { sukses: false, pesan: 'Centang minimal satu mata pelajaran yang Anda ampu.' };
  if (dipilih.length > DT.MAKS_MAPEL) return { sukses: false, pesan: 'Terlalu banyak mapel dipilih (maksimal ' + DT.MAKS_MAPEL + ').' };
  var aktif = {};
  mapelAktifSemua_().forEach(function(m) { aktif[m.idMapel] = true; });
  for (var i = 0; i < dipilih.length; i++) {
    if (!aktif[dipilih[i]]) return { sukses: false, pesan: 'Ada mata pelajaran yang sudah tidak tersedia. Muat ulang halaman lalu pilih lagi.' };
  }
  if (dtNamaSudahAda_(nama)) {
    return { sukses: false, pesan: 'Nama ini sudah terdaftar sebagai pengguna. Bila Anda lupa Kode Akses atau ingin menambah mapel, hubungi admin.' };
  }
  if (bacaHitung_('otpglobal') >= PEND.EMAIL_MAKS_GLOBAL_JAM) {
    return { sukses: false, pesan: 'Terlalu banyak permintaan pendaftaran saat ini. Coba lagi beberapa saat lagi, atau hubungi admin.' };
  }
  if (hitung_('otpemail_' + sha256_(email).slice(0, 24), 3600) > PEND.EMAIL_MAKS_PER_JAM) {
    return { sukses: false, pesan: 'Terlalu sering meminta kode untuk email ini. Coba lagi satu jam lagi.' };
  }
  if (hitung_('otpnama_' + normNama_(nama).replace(/[^a-z0-9]/g, '').slice(0, 40), 3600) > PEND.EMAIL_MAKS_PER_NAMA_JAM) {
    return { sukses: false, pesan: 'Terlalu sering mendaftar dengan nama ini. Coba lagi satu jam lagi.' };
  }
  var sesi = Utilities.getUuid();
  var otp = buatOtp_();
  try {
    kirimOtpEmail_(email, otp, nama);
  } catch (e) {
    catat_('Calon tutor', '', nama, 'Daftar tutor', 'Gagal kirim OTP: ' + (e && e.message), 'GAGAL');
    return { sukses: false, pesan: pesanEmailGagal_(e) };
  }
  hitung_('otpglobal', 3600);
  CacheService.getScriptCache().put('otptutor_' + sesi, JSON.stringify({
    h: hashOtp_(sesi, otp), a: 0, kirim: 1, t: Date.now(), d: { nama: nama, email: email, mapel: dipilih }
  }), PEND.OTP_DETIK);
  catat_('Calon tutor', '', nama, 'Daftar tutor - OTP dikirim', maskEmail_(email) + ', ' + dipilih.length + ' mapel diajukan', 'OK');
  return { sukses: true, sesi: sesi, emailMasked: maskEmail_(email) };
}

function waDaftarTutorKirimUlang(sesi) {
  var cache = CacheService.getScriptCache();
  var raw = cache.get('otptutor_' + sesi);
  if (!raw) return { sukses: false, pesan: 'Sesi pendaftaran habis. Mulai lagi dari awal.' };
  var o = JSON.parse(raw);
  if (o.kirim >= PEND.OTP_MAKS_KIRIM) return { sukses: false, pesan: 'Kode sudah dikirim beberapa kali. Mulai lagi dari awal bila belum menerima.' };
  var jeda = PEND.OTP_JEDA_DETIK - Math.floor((Date.now() - o.t) / 1000);
  if (jeda > 0) return { sukses: false, pesan: 'Tunggu ' + jeda + ' detik sebelum kirim ulang.' };
  if (bacaHitung_('otpglobal') >= PEND.EMAIL_MAKS_GLOBAL_JAM) return { sukses: false, pesan: 'Terlalu banyak permintaan pendaftaran saat ini. Coba lagi beberapa saat lagi, atau hubungi admin.' };
  var otp = buatOtp_();
  try { kirimOtpEmail_(o.d.email, otp, o.d.nama); }
  catch (e) { return { sukses: false, pesan: pesanEmailGagal_(e) }; }
  hitung_('otpglobal', 3600);
  o.h = hashOtp_(sesi, otp); o.a = 0; o.kirim++; o.t = Date.now();
  cache.put('otptutor_' + sesi, JSON.stringify(o), PEND.OTP_DETIK);
  catat_('Calon tutor', '', o.d.nama, 'Daftar tutor - OTP dikirim ulang', maskEmail_(o.d.email), 'OK');
  return { sukses: true };
}

function waDaftarTutorVerifikasi(sesi, kodeOtp) {
  var cache = CacheService.getScriptCache();
  var raw = cache.get('otptutor_' + sesi);
  if (!raw) return { sukses: false, pesan: 'Kode sudah kedaluwarsa. Mulai lagi dari awal.', ulang: true };
  var o = JSON.parse(raw);
  if (o.a >= PEND.OTP_MAKS_SALAH) {
    cache.remove('otptutor_' + sesi);
    return { sukses: false, pesan: 'Terlalu banyak salah. Mulai lagi dari awal.', ulang: true };
  }
  if (hashOtp_(sesi, kodeOtp) !== o.h) {
    o.a++;
    cache.put('otptutor_' + sesi, JSON.stringify(o), PEND.OTP_DETIK);
    catat_('Calon tutor', '', o.d.nama, 'Daftar tutor - OTP salah', 'percobaan ' + o.a, 'GAGAL');
    return { sukses: false, pesan: 'Kode salah. Sisa percobaan: ' + (PEND.OTP_MAKS_SALAH - o.a) + '.' };
  }
  var kunci = LockService.getScriptLock();
  kunci.waitLock(20000);
  var kode = '', jumlah = 0;
  try {
    if (!dtTerbuka_()) {
      cache.remove('otptutor_' + sesi);
      return { sukses: false, pesan: 'Pendaftaran tutor baru saja ditutup. Hubungi admin.', ulang: true };
    }
    if (dtNamaSudahAda_(o.d.nama)) {
      cache.remove('otptutor_' + sesi);
      return { sukses: false, pesan: 'Nama ini sudah terdaftar sebagai pengguna. Hubungi admin.', ulang: true };
    }
    var peta = {};
    mapelAktifSemua_().forEach(function(m) { peta[m.idMapel] = m; });
    var waktu = waktuSekarang_();
    var idPengguna = buatIdPengguna_();
    kode = buatKodeStaf_();
    var sp = getSheet(PERAN.SHEET_PENGGUNA);
    var b = sp.getLastRow() + 1;
    sp.getRange(b, 1, 1, 7).setNumberFormat('@');
    sp.getRange(b, 1, 1, 7).setValues([[idPengguna, o.d.nama, 'Tutor', kode, o.d.email, 'Aktif', waktu]]);
    try { indukSelarasTutor_(idPengguna); } catch (eInduk) {}   // v1.38.5: tutor baru langsung tercatat di Data Induk
    var baris = [];
    o.d.mapel.forEach(function(id) {
      var m = peta[id];
      if (!m) return;
      baris.push(['PGJ-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase(), idPengguna, o.d.nama, m.idMapel, m.namaMapel, m.namaRombel, 'Menunggu', waktu, '', '', '']);
    });
    if (baris.length) {
      var sh = pastikanSheetPengajuan_();
      var awal = sh.getLastRow() + 1;
      sh.getRange(awal, 1, baris.length, DT.HEADERS.length).setNumberFormat('@');
      sh.getRange(awal, 1, baris.length, DT.HEADERS.length).setValues(baris);
    }
    jumlah = baris.length;
  } finally {
    kunci.releaseLock();
  }
  cache.remove('otptutor_' + sesi);
  catat_('Tutor', '', o.d.nama, 'Daftar tutor - berhasil', 'email ' + maskEmail_(o.d.email) + ', ' + jumlah + ' mapel diajukan', 'OK');
  if (jumlah) {
    var daftarMapel = baris.map(function(x) { return x[4] + ' (' + x[5] + ')'; });
    npKirim_('tutor_mapel_baru', { judul: 'Pengajuan mapel dari tutor baru', isi: o.d.nama + ' mendaftar sebagai tutor dan mengajukan ' + jumlah + ' mapel: ' + daftarMapel.slice(0, 6).join(', ') +
      (daftarMapel.length > 6 ? ', dan ' + (daftarMapel.length - 6) + ' lainnya' : '') + '. Periksa di menu Pengajuan Tutor.', aksi: 'pengajuan_tutor', ref: 'tutor|' + idPengguna });   // v1.53.0: notifikasi
  }
  return { sukses: true, nama: o.d.nama, kodeAkses: kode, jumlah: jumlah };
}

// Tautan halaman pendaftaran tutor dan halaman staf (untuk admin).
function dtTautan_() {
  var url = '';
  try { url = ScriptApp.getService().getUrl(); } catch (e) {}
  return { daftar: url ? url + '?halaman=daftartutor' : '', staf: url ? url + '?halaman=staf' : '' };
}

// ---------- admin ----------
function waAdminTutorPengajuan(token) {
  wajibAdmin_(token);
  var sh = pastikanSheetPengajuan_();
  var v = sh.getDataRange().getValues();
  var pengguna = {};
  bacaPengguna_().forEach(function(p) { pengguna[p.id] = p; });
  var nama = {}, enr = {};
  mapelAktifSemua_().forEach(function(m) { nama[m.idMapel] = m; });
  bacaEnrollment_().forEach(function(e) {
    var p = pengguna[e.idPengguna];
    if (!p || p.status !== 'Aktif' || p.peran !== 'Tutor') return;
    (enr[e.idMapel] = enr[e.idMapel] || []).push(p.nama);
  });
  var grup = {}, urut = [], riwayat = [], menunggu = 0;
  for (var i = 1; i < v.length; i++) {
    var r = v[i];
    var id = sTeks_(r[0]).trim();
    if (!id) continue;
    var status = sTeks_(r[6]).trim();
    var idP = sTeks_(r[1]).trim();
    var idMapel = sTeks_(r[3]).trim();
    if (status === 'Menunggu') {
      menunggu++;
      var g = grup[idP];
      var u = pengguna[idP];
      if (!g) {
        g = grup[idP] = { idPengguna: idP, nama: sTeks_(r[2]).trim(), email: u ? u.hp : '', statusAkun: u ? u.status : 'Dihapus', diajukan: sTeks_(r[7]), item: [] };
        urut.push(g);
      }
      var m = nama[idMapel];
      var lain = (enr[idMapel] || []).filter(function(n) { return normNama_(n) !== normNama_(g.nama); });
      g.item.push({ idPengajuan: id, idMapel: idMapel, namaMapel: sTeks_(r[4]).trim(), namaRombel: sTeks_(r[5]).trim(), paket: kurPaket_(sTeks_(r[5])), aktif: !!m, tutorLain: lain });
    } else {
      riwayat.push({ nama: sTeks_(r[2]).trim(), namaMapel: sTeks_(r[4]).trim(), namaRombel: sTeks_(r[5]).trim(), status: status, waktu: sTeks_(r[8]), oleh: sTeks_(r[9]) });
    }
  }
  riwayat = riwayat.slice(-DT.RIWAYAT).reverse();
  var t = dtTautan_();
  return { terbuka: dtTerbuka_(), menunggu: menunggu, tutor: urut, riwayat: riwayat, tautanDaftar: t.daftar };
}

function waAdminTutorBuka(token, buka) {
  var adm = wajibAdmin_(token);
  PropertiesService.getScriptProperties().setProperty(DT.PROP_BUKA, buka === true ? '1' : '0');
  catat_('Admin', adm.id, adm.nama, 'Pendaftaran tutor', buka === true ? 'dibuka' : 'ditutup', 'OK');
  return { terbuka: buka === true };
}

// Menambah enrollment tanpa menghapus yang sudah ada.
function dtTambahEnrollment_(tutor, daftarIdMapel, peta) {
  var sheet = getSheet(PERAN.SHEET_ENROLLMENT);
  var v = sheet.getDataRange().getValues();
  var ada = {};
  for (var i = 1; i < v.length; i++) {
    if (sTeks_(v[i][0]).trim() === tutor.id) ada[sTeks_(v[i][2]).trim()] = true;
  }
  var tgl = waktuSekarang_();
  var baris = [], baru = [];
  daftarIdMapel.forEach(function(id) {
    if (ada[id] || !peta[id]) return;
    ada[id] = true;
    baru.push(id);
    baris.push([tutor.id, tutor.nama, id, peta[id].namaMapel, peta[id].namaRombel, tgl]);
  });
  if (baris.length) {
    var awal = sheet.getLastRow() + 1;
    sheet.getRange(awal, 1, baris.length, 6).setNumberFormat('@');
    sheet.getRange(awal, 1, baris.length, 6).setValues(baris);
  }
  segarkanKolomTutorMapel_(daftarIdMapel);
  indukSelarasTutor_(tutor.id);   // v1.38.5: tutor & penugasan yang disetujui tercatat di Data Induk
  return baru.length;
}

// daftar: [{ idPengajuan, aksi: 'setuju' | 'tolak' }]
function waAdminTutorKeputusan(token, daftar, catatan) {
  var adm = wajibAdmin_(token);
  if (!Array.isArray(daftar) || !daftar.length) throw new Error('Tidak ada pengajuan yang dipilih.');
  var aksiPer = {};
  daftar.forEach(function(x) {
    var a = String(x && x.aksi || '');
    if (a !== 'setuju' && a !== 'tolak') throw new Error('Aksi tidak dikenal.');
    aksiPer[String(x.idPengajuan || '').trim()] = a;
  });
  var kunci = LockService.getScriptLock();
  kunci.waitLock(20000);
  var hasil = { disetujui: 0, ditolak: 0, dilewati: 0 };
  try {
    var sh = pastikanSheetPengajuan_();
    var v = sh.getDataRange().getValues();
    var pengguna = {};
    bacaPengguna_().forEach(function(p) { pengguna[p.id] = p; });
    var peta = {};
    mapelAktifSemua_().forEach(function(m) { peta[m.idMapel] = m; });
    var waktu = waktuSekarang_();
    var cat = String(catatan || '').slice(0, 200);
    var tambah = {};
    for (var i = 1; i < v.length; i++) {
      var id = sTeks_(v[i][0]).trim();
      var a = aksiPer[id];
      if (!a) continue;
      if (sTeks_(v[i][6]).trim() !== 'Menunggu') { hasil.dilewati++; continue; }
      var idP = sTeks_(v[i][1]).trim(), idMapel = sTeks_(v[i][3]).trim();
      var status = a === 'setuju' ? 'Disetujui' : 'Ditolak';
      var ket = cat;
      if (a === 'setuju') {
        var u = pengguna[idP];
        if (!u || u.peran !== 'Tutor' || u.status !== 'Aktif') { status = 'Ditolak'; ket = 'Akun tutor tidak aktif'; }
        else if (!peta[idMapel]) { status = 'Ditolak'; ket = 'Mapel sudah tidak aktif'; }
        else (tambah[idP] = tambah[idP] || { tutor: u, ids: [] }).ids.push(idMapel);
      }
      sh.getRange(i + 1, 7).setValue(status);
      sh.getRange(i + 1, 9, 1, 3).setValues([[waktu, adm.nama, ket]]);
      if (status === 'Disetujui') hasil.disetujui++; else hasil.ditolak++;
    }
    Object.keys(tambah).forEach(function(idP) { dtTambahEnrollment_(tambah[idP].tutor, tambah[idP].ids, peta); });
  } finally {
    kunci.releaseLock();
  }
  catat_('Admin', adm.id, adm.nama, 'Keputusan pengajuan tutor', hasil.disetujui + ' disetujui, ' + hasil.ditolak + ' ditolak', 'OK');
  return hasil;
}

// Tutor yang masuk melihat status pengajuannya sendiri (layar "belum ada mapel").
// Pembungkus berbasis nama: fungsi asli di Peran.gs dinamai ulang menjadi waStafProfilAsliDt_ (urutan berkas tidak berpengaruh).
function waStafProfil(token) {
  var r = waStafProfilAsliDt_(token);
  // v1.41.0: izin per fitur untuk menu aplikasi + nama peran kustom
  try { var pz = stafDariToken_(token); if (r && typeof r === 'object') { r.izin = izPetaPengguna_(pz); r.peranKustom = pz.peranKustom || ''; } } catch (eZ) {}
  try {
    if (r && r.peran === 'Tutor') {
      var p = stafDariToken_(token);
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var sh = ss.getSheetByName(DT.SHEET);
      var out = [];
      if (sh && sh.getLastRow() >= 2) {
        sh.getRange(2, 1, sh.getLastRow() - 1, DT.HEADERS.length).getValues().forEach(function(x) {
          if (sTeks_(x[1]).trim() === p.id && sTeks_(x[6]).trim() === 'Menunggu') out.push({ namaMapel: sTeks_(x[4]).trim(), namaRombel: sTeks_(x[5]).trim() });
        });
      }
      r.pengajuan = out;
    }
  } catch (e) { r.pengajuan = []; }
  return r;
}

// ---------- reset data uji coba ----------
function resetBarisData_(nama) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nama);
  return sh ? Math.max(0, sh.getLastRow() - 1) : 0;
}

function waAdminResetRencana(token) {
  wajibAdmin_(token);
  var bersih = RESET.BERSIH.map(function(n) { return { nama: n, baris: resetBarisData_(n) }; });
  var simpan = RESET.SIMPAN.map(function(n) { return { nama: n, baris: resetBarisData_(n) }; });
  var total = 0;
  bersih.forEach(function(x) { total += x.baris; });
  return { frasa: RESET.FRASA, bersih: bersih, simpan: simpan, total: total };
}

function waAdminResetData(token, frasa, pilihan) {
  var adm = wajibAdmin_(token);
  if (String(frasa || '').trim() !== RESET.FRASA) throw new Error('Ketik persis: ' + RESET.FRASA);
  var kunci = LockService.getScriptLock();
  kunci.waitLock(30000);
  var ringkas = [], total = 0;
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var daftarN = Array.isArray(pilihan) ? RESET.BERSIH.filter(function(n) { return pilihan.indexOf(n) >= 0; }) : RESET.BERSIH;
    if (Array.isArray(pilihan) && !daftarN.length) throw new Error('Tidak ada data yang dipilih.');
    daftarN.forEach(function(n) {
      var sh = ss.getSheetByName(n);   // sengaja tidak memakai getSheet(): sheet yang belum ada tidak dibuat
      if (!sh) return;
      var akhir = sh.getLastRow(), kolom = Math.max(1, sh.getLastColumn());
      if (akhir < 2) return;
      sh.getRange(2, 1, akhir - 1, kolom).clearContent();
      total += akhir - 1;
      ringkas.push({ nama: n, baris: akhir - 1 });
    });
    // Rencana Kurikulum dipertahankan, tetapi tautan ke materi/diskusi yang baru dihapus dikosongkan.
    var kur = (Array.isArray(pilihan) && !daftarN.some(function(n) { return /Materi|Diskusi/i.test(n); })) ? null : ss.getSheetByName('Kurikulum');
    if (kur && kur.getLastRow() >= 2) {
      var hd = kur.getRange(1, 1, 1, Math.max(1, kur.getLastColumn())).getValues()[0].map(function(x) { return String(x).trim(); });
      ['ID Materi', 'ID Diskusi'].forEach(function(nm) {
        var k = hd.indexOf(nm);
        if (k >= 0) kur.getRange(2, k + 1, kur.getLastRow() - 1, 1).clearContent();
      });
    }
  } finally {
    kunci.releaseLock();
  }
  try { CacheService.getScriptCache().removeAll(['kal_all', 'otpglobal']); } catch (e) {}
  catat_('Admin', adm.id, adm.nama, 'Reset data uji coba', total + ' baris dikosongkan dari ' + ringkas.length + ' sheet', 'OK');
  return { total: total, sheet: ringkas };
}

// ---------- halaman publik ?halaman=daftartutor (HTML disimpan sebagai teks supaya tidak perlu berkas HTML baru) ----------
var DT_HTML_ = "<!DOCTYPE html>\n<html lang=\"id\">\n<head>\n<base target=\"_top\">\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<title>Daftar Tutor</title>\n<style>\n  :root { --hijau:#1b7a4d; --hijau-gelap:#145c3a; --hijau-muda:#e8f5ee; --abu:#6b7280; --border:#e2e5e9; }\n  * { box-sizing: border-box; }\n  body { margin:0; font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif; background:#f7f8fa; color:#1f2937; font-size:15px; }\n  .topbar { background:linear-gradient(135deg,var(--hijau),var(--hijau-gelap)); color:#fff; padding:18px 20px; text-align:center; box-shadow:0 2px 8px rgba(0,0,0,.12); }\n  .topbar h1 { margin:0; font-size:18px; font-weight:700; }\n  .topbar p { margin:4px 0 0; font-size:12.5px; opacity:.9; }\n  .wrap { max-width:560px; margin:0 auto; padding:18px 14px 110px; }\n  .card { background:#fff; border:1px solid var(--border); border-radius:14px; padding:18px; margin-bottom:14px; box-shadow:0 1px 3px rgba(0,0,0,.04); }\n  label.f { display:block; font-size:13px; font-weight:600; color:#374151; margin:14px 0 6px; }\n  label.f.pertama { margin-top:0; }\n  input[type=text], input[type=email] { width:100%; padding:11px 12px; border:1.5px solid var(--border); border-radius:10px; font-size:15px; font-family:inherit; background:#fff; }\n  input[type=text]:focus, input[type=email]:focus { outline:none; border-color:var(--hijau); }\n  .hint { font-size:12.5px; color:var(--abu); margin-top:6px; line-height:1.45; }\n  .btn { display:inline-block; width:100%; padding:12px; margin-top:18px; background:var(--hijau); color:#fff; border:none; border-radius:10px; font-size:15px; font-weight:700; cursor:pointer; text-align:center; text-decoration:none; }\n  .btn:disabled { background:#9ca3af; cursor:default; }\n  .btn-secondary { background:#fff; color:var(--hijau); border:1.5px solid var(--hijau); margin-top:10px; }\n  .btn-secondary:disabled { background:#fff; color:#9ca3af; border-color:#d1d5db; }\n  .pesan { display:none; padding:11px 14px; border-radius:10px; font-size:14px; margin-bottom:14px; line-height:1.45; }\n  .pesan.tampil { display:block; }\n  .pesan.error { background:#fef2f2; color:#991b1b; border:1px solid #fecaca; }\n  .pesan.info { background:var(--hijau-muda); color:var(--hijau-gelap); border:1px solid #b7e1c9; }\n  .hidden { display:none !important; }\n  .langkah { font-size:12.5px; color:var(--abu); margin-bottom:10px; }\n  .otp { text-align:center; letter-spacing:8px; font-size:24px !important; font-weight:700; }\n  .kode-besar { font-size:30px; font-weight:800; letter-spacing:4px; text-align:center; background:var(--hijau-muda); color:var(--hijau-gelap); border:2px dashed var(--hijau); border-radius:12px; padding:16px 8px; margin:14px 0 6px; user-select:all; }\n  .peringatan { background:#fffbeb; border:1px solid #fde68a; color:#92400e; border-radius:10px; padding:11px 14px; font-size:13px; line-height:1.5; margin-top:12px; }\n  .spinner { display:inline-block; width:14px; height:14px; border:2px solid rgba(255,255,255,.5); border-top-color:#fff; border-radius:50%; animation:putar .7s linear infinite; vertical-align:-2px; margin-right:8px; }\n  @keyframes putar { to { transform:rotate(360deg); } }\n  .link { text-align:center; margin-top:14px; font-size:12.5px; color:var(--abu); }\n  a { color:var(--hijau); }\n  .judul-mapel { font-size:15px; font-weight:700; margin:0 0 4px; }\n  .cari { margin:10px 0 8px; }\n  .pintasan { display:flex; flex-wrap:wrap; gap:6px; margin:6px 0 10px; }\n  .chip { border:1.5px solid var(--border); background:#fff; color:#374151; border-radius:999px; padding:5px 11px; font-size:12.5px; cursor:pointer; font-family:inherit; }\n  .chip.aktif { background:var(--hijau-muda); border-color:var(--hijau); color:var(--hijau-gelap); font-weight:700; }\n  details.paket { border:1px solid var(--border); border-radius:12px; margin:10px 0; background:#fff; overflow:hidden; }\n  details.paket > summary { cursor:pointer; padding:11px 14px; font-weight:700; background:#f3f7f5; display:flex; align-items:center; justify-content:space-between; gap:8px; list-style:none; }\n  details.paket > summary::-webkit-details-marker { display:none; }\n  .hitung { font-size:12px; font-weight:600; color:var(--abu); background:#fff; border:1px solid var(--border); border-radius:999px; padding:2px 9px; white-space:nowrap; }\n  .hitung.ada { color:var(--hijau-gelap); border-color:var(--hijau); background:var(--hijau-muda); }\n  .rombel { padding:8px 14px 10px; border-top:1px solid var(--border); }\n  .rombel-kepala { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:4px; }\n  .rombel-kepala b { font-size:14px; }\n  .semua { font-size:12px; color:var(--hijau); background:none; border:none; cursor:pointer; text-decoration:underline; padding:2px; font-family:inherit; }\n  .cb { display:flex; align-items:flex-start; gap:9px; padding:7px 2px; font-size:14px; cursor:pointer; line-height:1.35; }\n  .cb input { margin-top:3px; width:18px; height:18px; flex:0 0 auto; }\n  .kosong { color:var(--abu); font-size:13.5px; padding:10px 2px; }\n  .bar-bawah { position:fixed; left:0; right:0; bottom:0; background:#fff; border-top:1px solid var(--border); padding:10px 14px; box-shadow:0 -2px 10px rgba(0,0,0,.06); z-index:5; }\n  .bar-bawah .dalam { max-width:560px; margin:0 auto; display:flex; align-items:center; gap:12px; }\n  .bar-bawah .btn { margin:0; flex:1; }\n  .bar-bawah .ringkas { font-size:13px; color:#374151; flex:0 0 auto; }\n</style>\n</head>\n<body>\n<div class=\"topbar\">\n  <h1>🎓 Daftar Tutor</h1>\n  <p>PKBM Tunas Harapan - Belajar Mandiri</p>\n</div>\n\n<div class=\"wrap\">\n  <div id=\"pesanGlobal\" class=\"pesan\"></div>\n\n  <div id=\"langkahTutup\" class=\"card hidden\">\n    <div style=\"font-size:17px;font-weight:700\">Pendaftaran tutor belum dibuka</div>\n    <div class=\"hint\" style=\"font-size:14px;margin-top:8px\">Hubungi admin PKBM untuk membuka pendaftaran, atau untuk ditambahkan langsung ke mata pelajaran.</div>\n  </div>\n\n  <div id=\"langkahMuat\" class=\"card\"><div class=\"hint\" style=\"font-size:14px\">Memuat daftar mata pelajaran...</div></div>\n\n  <!-- LANGKAH 1 -->\n  <div id=\"langkah1\" class=\"card hidden\">\n    <div class=\"langkah\">Langkah 1 dari 2 - data diri dan mata pelajaran yang Anda ampu</div>\n    <label class=\"f pertama\" for=\"inNama\">Nama Lengkap</label>\n    <input type=\"text\" id=\"inNama\" placeholder=\"Tulis nama lengkap beserta gelar bila perlu\" autocomplete=\"off\" maxlength=\"80\">\n    <label class=\"f\" for=\"inEmail\">Email</label>\n    <input type=\"email\" id=\"inEmail\" placeholder=\"nama@gmail.com\" autocomplete=\"email\" maxlength=\"120\">\n    <div class=\"hint\">Kode verifikasi 6 angka akan dikirim ke email ini. Pakai email yang aktif dan bisa Anda buka sekarang.</div>\n\n    <label class=\"f\">Mata pelajaran yang Anda ampu</label>\n    <div class=\"hint\" style=\"margin-top:0\">Centang semua yang Anda ampu, per Paket dan kelas. Ini berupa <b>pengajuan</b>: admin akan memeriksa dan menyetujuinya sebelum mapel muncul di akun Anda.</div>\n    <input type=\"text\" id=\"inCari\" class=\"cari\" placeholder=\"Cari mata pelajaran, mis. Bahasa Indonesia\" autocomplete=\"off\">\n    <div class=\"hint\" id=\"teksPintasan\" style=\"margin:2px 0 0\">Pintasan: ketuk nama mapel untuk mencentangnya di semua kelas.</div>\n    <div class=\"pintasan\" id=\"pintasan\"></div>\n    <div id=\"daftarPaket\"></div>\n    <div class=\"kosong hidden\" id=\"tidakAda\">Tidak ada mata pelajaran yang cocok.</div>\n  </div>\n\n  <!-- LANGKAH 2 -->\n  <div id=\"langkah2\" class=\"card hidden\">\n    <div class=\"langkah\">Langkah 2 dari 2 - verifikasi email</div>\n    <div style=\"font-size:14px;line-height:1.5\">Kode 6 angka sudah dikirim ke <b id=\"tampilEmail\"></b>. Cek kotak masuk, dan folder Spam bila belum terlihat. Kode berlaku 10 menit.</div>\n    <label class=\"f\" for=\"inOtp\">Kode Verifikasi</label>\n    <input type=\"text\" id=\"inOtp\" class=\"otp\" inputmode=\"numeric\" autocomplete=\"one-time-code\" maxlength=\"6\" placeholder=\"------\">\n    <button class=\"btn\" id=\"btnOtp\" onclick=\"verifikasi()\">Verifikasi dan Daftar</button>\n    <button class=\"btn btn-secondary\" id=\"btnKirimUlang\" onclick=\"kirimUlang()\">Kirim ulang kode</button>\n    <div class=\"link\"><a href=\"#\" onclick=\"kembaliKeForm();return false;\">Ubah data / email</a></div>\n  </div>\n\n  <!-- LANGKAH 3 -->\n  <div id=\"langkah3\" class=\"card hidden\">\n    <div style=\"font-size:18px;font-weight:700;color:var(--hijau-gelap)\">Pendaftaran berhasil ✅</div>\n    <div style=\"margin-top:6px;font-size:14px;line-height:1.5\"><b id=\"hasilNama\"></b><br><span id=\"hasilJumlah\"></span></div>\n    <div class=\"hint\" style=\"margin-top:12px\">Kode Akses Anda untuk masuk (bersama nama lengkap):</div>\n    <div class=\"kode-besar\" id=\"hasilKode\"></div>\n    <button class=\"btn btn-secondary\" id=\"btnSalin\" onclick=\"salinKode()\" style=\"margin-top:6px\">Salin kode</button>\n    <div class=\"peringatan\"><b>Simpan Kode Akses ini sekarang</b> (catat atau tangkap layar). Kode tidak ditampilkan lagi; bila hilang, minta admin mengatur ulang.<br>\n    Mata pelajaran yang Anda ajukan <b>belum aktif</b> sampai admin menyetujuinya. Anda bisa masuk lebih dulu; halaman akan menampilkan status pengajuan Anda.</div>\n    <a class=\"btn\" id=\"linkMasuk\" href=\"#\" target=\"_top\">Masuk sebagai Tutor</a>\n  </div>\n</div>\n\n<div class=\"bar-bawah hidden\" id=\"barBawah\">\n  <div class=\"dalam\">\n    <div class=\"ringkas\"><b id=\"jumlahDipilih\">0</b> mapel dipilih</div>\n    <button class=\"btn\" id=\"btnDaftar\" onclick=\"mulaiDaftar()\">Kirim Kode ke Email</button>\n  </div>\n</div>\n\n<script>\n  var sesi = '';\n  var cooldownTimer = null;\n  var DATA = [];            // paket -> rombel -> mapel\n  var SEMUA = [];           // { id, nama, namaRombel, paket, cb, baris }\n\n  function el(id) { return document.getElementById(id); }\n  function buat(tag, kelas, teks) {\n    var e = document.createElement(tag);\n    if (kelas) e.className = kelas;\n    if (teks !== undefined && teks !== null) e.textContent = teks;\n    return e;\n  }\n  function pesan(teks, jenis) {\n    var e = el('pesanGlobal');\n    e.textContent = teks;\n    e.className = 'pesan tampil ' + (jenis || 'error');\n    try { e.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (x) {}\n  }\n  function sembunyi() { el('pesanGlobal').className = 'pesan'; }\n  function langkah(n) {\n    ['langkah1', 'langkah2', 'langkah3'].forEach(function(id, i) { el(id).classList.toggle('hidden', i !== n - 1); });\n    el('barBawah').classList.toggle('hidden', n !== 1);\n    try { window.scrollTo(0, 0); } catch (x) {}\n  }\n  function tombolKerja(id, aktif, teksAsli, teksKerja) {\n    var b = el(id);\n    b.disabled = !aktif;\n    if (aktif) b.textContent = teksAsli;\n    else { b.textContent = ''; var s = buat('span', 'spinner'); b.appendChild(s); b.appendChild(document.createTextNode(teksKerja)); }\n  }\n  function normNamaMapel(t) { return String(t || '').toLowerCase().replace(/\\s+/g, ' ').trim(); }\n\n  // ---------- daftar mapel (checkbox) ----------\n  function dipilih() { return SEMUA.filter(function(m) { return m.cb.checked; }).map(function(m) { return m.id; }); }\n\n  function segarkanHitung() {\n    var n = 0;\n    DATA.forEach(function(p) {\n      var c = 0;\n      SEMUA.forEach(function(m) { if (m.paket === p.kode && m.cb.checked) c++; });\n      n += c;\n      if (p.hitung) { p.hitung.textContent = c ? c + ' dipilih' : 'belum ada'; p.hitung.className = 'hitung' + (c ? ' ada' : ''); }\n    });\n    el('jumlahDipilih').textContent = String(n);\n    // status chip pintasan: aktif bila semua mapel bernama itu tercentang\n    Array.prototype.forEach.call(el('pintasan').children, function(chip) {\n      var kunci = chip.getAttribute('data-kunci');\n      var punya = SEMUA.filter(function(m) { return normNamaMapel(m.nama) === kunci; });\n      var semua = punya.length > 0 && punya.every(function(m) { return m.cb.checked; });\n      chip.className = 'chip' + (semua ? ' aktif' : '');\n    });\n  }\n\n  function gambarDaftar(paket) {\n    DATA = paket;\n    SEMUA = [];\n    var area = el('daftarPaket');\n    while (area.firstChild) area.removeChild(area.firstChild);\n    var nama = {};\n    paket.forEach(function(p, pi) {\n      var det = buat('details', 'paket');\n      det.setAttribute('data-paket', p.kode);\n      if (paket.length <= 3 || pi === 0) det.open = true;\n      var sum = buat('summary');\n      sum.appendChild(buat('span', null, p.nama));\n      p.hitung = buat('span', 'hitung', 'belum ada');\n      sum.appendChild(p.hitung);\n      det.appendChild(sum);\n      p.rombel.forEach(function(r) {\n        var box = buat('div', 'rombel');\n        box.setAttribute('data-rombel', r.idRombel);\n        var kepala = buat('div', 'rombel-kepala');\n        kepala.appendChild(buat('b', null, r.namaRombel));\n        var semua = buat('button', 'semua', 'Pilih semua');\n        semua.type = 'button';\n        var anggota = [];\n        semua.onclick = function() {\n          var tampil = anggota.filter(function(m) { return !m.baris.classList.contains('hidden'); });\n          var penuh = tampil.length > 0 && tampil.every(function(m) { return m.cb.checked; });\n          tampil.forEach(function(m) { m.cb.checked = !penuh; });\n          segarkanHitung();\n        };\n        kepala.appendChild(semua);\n        box.appendChild(kepala);\n        r.mapel.forEach(function(m) {\n          var baris = buat('label', 'cb');\n          var cb = document.createElement('input');\n          cb.type = 'checkbox'; cb.value = m.idMapel;\n          cb.onchange = segarkanHitung;\n          baris.appendChild(cb);\n          baris.appendChild(buat('span', null, m.namaMapel));\n          box.appendChild(baris);\n          var o = { id: m.idMapel, nama: m.namaMapel, namaRombel: r.namaRombel, paket: p.kode, cb: cb, baris: baris, box: box, det: det };\n          anggota.push(o); SEMUA.push(o);\n          var k = normNamaMapel(m.namaMapel);\n          if (!nama[k]) nama[k] = { teks: m.namaMapel, n: 0 };\n          nama[k].n++;\n        });\n        det.appendChild(box);\n      });\n      area.appendChild(det);\n    });\n    var pin = el('pintasan');\n    while (pin.firstChild) pin.removeChild(pin.firstChild);\n    Object.keys(nama).sort(function(a, b) { return a.localeCompare(b, 'id'); }).forEach(function(k) {\n      var chip = buat('button', 'chip', nama[k].teks + (nama[k].n > 1 ? ' (' + nama[k].n + ' kelas)' : ''));\n      chip.type = 'button';\n      chip.setAttribute('data-kunci', k);\n      chip.onclick = function() {\n        var punya = SEMUA.filter(function(m) { return normNamaMapel(m.nama) === k; });\n        var penuh = punya.every(function(m) { return m.cb.checked; });\n        punya.forEach(function(m) { m.cb.checked = !penuh; });\n        segarkanHitung();\n      };\n      pin.appendChild(chip);\n    });\n    el('teksPintasan').classList.toggle('hidden', !Object.keys(nama).length);\n    segarkanHitung();\n  }\n\n  function saring() {\n    var q = normNamaMapel(el('inCari').value);\n    var adaCocok = false;\n    SEMUA.forEach(function(m) {\n      var cocok = !q || normNamaMapel(m.nama).indexOf(q) >= 0 || normNamaMapel(m.namaRombel).indexOf(q) >= 0;\n      m.baris.classList.toggle('hidden', !cocok);\n      if (cocok) adaCocok = true;\n    });\n    Array.prototype.forEach.call(document.querySelectorAll('.rombel'), function(box) {\n      var ada = Array.prototype.some.call(box.querySelectorAll('.cb'), function(b) { return !b.classList.contains('hidden'); });\n      box.classList.toggle('hidden', !ada);\n    });\n    Array.prototype.forEach.call(document.querySelectorAll('details.paket'), function(d) {\n      var ada = Array.prototype.some.call(d.querySelectorAll('.rombel'), function(b) { return !b.classList.contains('hidden'); });\n      d.classList.toggle('hidden', !ada);\n      if (q && ada) d.open = true;\n    });\n    el('tidakAda').classList.toggle('hidden', adaCocok || !SEMUA.length);\n  }\n\n  // ---------- alur ----------\n  function mulaiCooldown(detik) {\n    var b = el('btnKirimUlang');\n    clearInterval(cooldownTimer);\n    var sisa = detik;\n    function tampil() {\n      if (sisa > 0) { b.disabled = true; b.textContent = 'Kirim ulang kode (' + sisa + ' dtk)'; }\n      else { b.disabled = false; b.textContent = 'Kirim ulang kode'; clearInterval(cooldownTimer); }\n    }\n    tampil();\n    cooldownTimer = setInterval(function() { sisa--; tampil(); }, 1000);\n  }\n\n  function mulaiDaftar() {\n    sembunyi();\n    var data = { nama: el('inNama').value.trim(), email: el('inEmail').value.trim(), mapel: dipilih() };\n    if (data.nama.length < 3) { pesan('Tulis nama lengkap Anda.'); return; }\n    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(data.email)) { pesan('Alamat email belum benar.'); return; }\n    if (!data.mapel.length) { pesan('Centang minimal satu mata pelajaran yang Anda ampu.'); return; }\n    tombolKerja('btnDaftar', false, '', 'Mengirim kode...');\n    google.script.run.withSuccessHandler(function(h) {\n      tombolKerja('btnDaftar', true, 'Kirim Kode ke Email');\n      if (!h || !h.sukses) { pesan((h && h.pesan) || 'Pendaftaran gagal. Coba lagi.'); return; }\n      sesi = h.sesi;\n      el('tampilEmail').textContent = h.emailMasked;\n      el('inOtp').value = '';\n      langkah(2);\n      mulaiCooldown(45);\n      el('inOtp').focus();\n    }).withFailureHandler(function(e) {\n      tombolKerja('btnDaftar', true, 'Kirim Kode ke Email');\n      pesan('Terjadi kesalahan: ' + (e && e.message ? e.message : e));\n    }).waDaftarTutorMulai(data);\n  }\n\n  function kembaliKeForm() { sembunyi(); sesi = ''; clearInterval(cooldownTimer); langkah(1); }\n\n  function kirimUlang() {\n    sembunyi();\n    var b = el('btnKirimUlang');\n    b.disabled = true;\n    google.script.run.withSuccessHandler(function(h) {\n      if (!h || !h.sukses) { pesan((h && h.pesan) || 'Gagal mengirim ulang.'); b.disabled = false; return; }\n      pesan('Kode baru sudah dikirim.', 'info');\n      mulaiCooldown(45);\n    }).withFailureHandler(function(e) {\n      b.disabled = false;\n      pesan('Terjadi kesalahan: ' + (e && e.message ? e.message : e));\n    }).waDaftarTutorKirimUlang(sesi);\n  }\n\n  function verifikasi() {\n    sembunyi();\n    var kode = el('inOtp').value.replace(/\\D/g, '');\n    if (kode.length !== 6) { pesan('Kode verifikasi terdiri dari 6 angka.'); return; }\n    tombolKerja('btnOtp', false, '', 'Memeriksa...');\n    google.script.run.withSuccessHandler(function(h) {\n      tombolKerja('btnOtp', true, 'Verifikasi dan Daftar');\n      if (!h || !h.sukses) {\n        pesan((h && h.pesan) || 'Verifikasi gagal.');\n        if (h && h.ulang) kembaliKeForm();\n        return;\n      }\n      clearInterval(cooldownTimer);\n      el('hasilNama').textContent = h.nama;\n      el('hasilJumlah').textContent = h.jumlah + ' mata pelajaran diajukan, menunggu persetujuan admin.';\n      el('hasilKode').textContent = h.kodeAkses;\n      langkah(3);\n    }).withFailureHandler(function(e) {\n      tombolKerja('btnOtp', true, 'Verifikasi dan Daftar');\n      pesan('Terjadi kesalahan: ' + (e && e.message ? e.message : e));\n    }).waDaftarTutorVerifikasi(sesi, kode);\n  }\n\n  function salinKode() {\n    var kode = el('hasilKode').textContent;\n    var b = el('btnSalin');\n    try {\n      if (navigator.clipboard && navigator.clipboard.writeText) {\n        navigator.clipboard.writeText(kode).then(function() { b.textContent = 'Tersalin ✓'; }, function() { pesan('Tidak bisa menyalin otomatis. Tekan lama pada kode lalu pilih Salin.', 'info'); });\n        return;\n      }\n    } catch (x) {}\n    pesan('Tidak bisa menyalin otomatis. Tekan lama pada kode lalu pilih Salin.', 'info');\n  }\n\n  el('inOtp').addEventListener('keydown', function(ev) { if (ev.key === 'Enter') verifikasi(); });\n  el('inCari').addEventListener('input', saring);\n\n  google.script.run.withSuccessHandler(function(d) {\n    el('langkahMuat').classList.add('hidden');\n    if (!d || !d.terbuka) { el('langkahTutup').classList.remove('hidden'); return; }\n    if (!d.paket || !d.paket.length) { el('langkahTutup').classList.remove('hidden'); return; }\n    gambarDaftar(d.paket);\n    langkah(1);\n  }).withFailureHandler(function() {\n    el('langkahMuat').classList.add('hidden');\n    pesan('Gagal memuat daftar mata pelajaran. Muat ulang halaman.');\n  }).waDaftarTutorInfo();\n\n  google.script.run.withSuccessHandler(function(u) {\n    if (u && u.staf) el('linkMasuk').href = u.staf;\n  }).waUrlStaf();\n</script>\n</body>\n</html>\n";

function dtHalaman_() {
  return HtmlService.createHtmlOutput(DT_HTML_)
    .setTitle('PKBM Tunas Harapan - Daftar Tutor')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ============================================================
// KERANGKA KURIKULUM: CP - TP - ATP oleh ADMIN (unggah sumber -> Gemini -> periksa -> setujui -> dipakai tutor)
// ------------------------------------------------------------
// Latar belakang: di Master Control V1 sheet "Identitas_CP" hanyalah tabel datar (Mata Pelajaran, Fase, Capaian Pembelajaran,
// Sumber/Acuan) tanpa TP dan ATP. Di sini penentuan CP, TP, dan ATP dipindah ke admin, satu kali per Mata Pelajaran + Fase,
// lalu dipakai bersama oleh semua rombel/tutor pada fase itu.
//
// Alur:
//   1. Admin membuka tab "CP · TP · ATP", memilih mapel + fase, mengunggah PDF sumber (mis. Panduan Mata Pelajaran
//      Kemendikdasmen: bagian Capaian Pembelajaran dan contoh Alur Tujuan Pembelajaran). Gemini menyusun CP (dikutip apa adanya),
//      TP, dan urutan ATP. Mode manual (Gemini web) tersedia bila kuota API habis.
//   2. Hasil disimpan sebagai DRAF (tidak dilihat tutor). Admin memeriksa dan mengubah, lalu menekan "Setujui".
//   3. Yang DISETUJUI dipakai: (a) CP otomatis tersalin ke sheet "Identitas_CP" sehingga RPP/Modul Ajar langsung terisi;
//      (b) daftar TP resmi ikut dikirim ke Gemini saat tutor menyusun rencana sesi (tab Kurikulum), supaya tujuan tiap sesi
//      memakai nomor dan bunyi TP resmi; (c) tutor melihat kerangka di tab RPP dan dapat memilih TP saat mengubah sesi.
//
// Sheet "Kerangka Kurikulum" (dibuat otomatis), satu baris per butir:
//   Kunci | Mata Pelajaran | Fase | Jenis (CP/TP) | Urut | Nomor | Elemen | Teks | Kelas | Semester | Alokasi JP | Status | Sumber | Diperbarui | Oleh
//   Jenis CP = satu baris per elemen CP. Jenis TP = satu baris per tujuan pembelajaran; urutan kolom Urut adalah urutan ATP.
//   Status: "Draf" (admin saja) atau "Disetujui" (dipakai tutor). Satu kunci boleh punya satu set Draf dan satu set Disetujui.
// ============================================================

var KF = {
  SHEET: 'Kerangka Kurikulum',
  HEADERS: ['Kunci', 'Mata Pelajaran', 'Fase', 'Jenis', 'Urut', 'Nomor', 'Elemen', 'Teks', 'Kelas', 'Semester', 'Alokasi JP', 'Status', 'Sumber', 'Diperbarui', 'Oleh'],
  K: { kunci: 0, mapel: 1, fase: 2, jenis: 3, urut: 4, nomor: 5, elemen: 6, teks: 7, kelas: 8, smt: 9, jp: 10, status: 11, sumber: 12, waktu: 13, oleh: 14 },
  DRAF: 'Draf',
  SETUJU: 'Disetujui',
  MAKS_ELEMEN: 10,
  MAKS_TP: 80,
  MAKS_CP_TEKS: 4000,
  MAKS_TP_TEKS: 600,
  MAKS_NAMA_ELEMEN: 80,
  MAKS_SUMBER: 300,
  MAKS_PDF: 3,
  MAKS_CATATAN: 500,
  PIKIR: 'low'
};

// ---------- sheet & nama ----------
function kfSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(KF.SHEET);
  if (!sh) {
    sh = ss.insertSheet(KF.SHEET);
    sh.getRange(1, 1, 1, KF.HEADERS.length).setValues([KF.HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function kfWaktu_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'); }

// "C10 - Ekonomi" -> "Ekonomi" (nama polos dipakai sebagai kunci supaya satu mapel di beberapa kelas berbagi satu kerangka)
function kfNamaPolos_(nama) {
  return String(nama === null || nama === undefined ? '' : nama).replace(/\s+/g, ' ').trim()
    .replace(/^[A-Za-z]\d{1,2}\s*[-–]\s*/, '').replace(/[.\s]+$/, '').trim();
}

function kfKunci_(namaMapel, fase) {
  return kfNamaPolos_(namaMapel).toLowerCase() + '|' + String(fase || '').trim().toUpperCase();
}

// Kelas pada nama rombel: "Kelas C11" -> "11"
function kfKelasRombel_(namaRombel) {
  var m = String(namaRombel || '').match(/([ABC])\s*-?\s*(\d{1,2})/i);
  return m ? String(parseInt(m[2], 10)) : '';
}

var KF_ROMAWI_ = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12 };

// "XI", "Kelas 11", "11" -> "11"; tidak dikenal -> ""
function kfNormKelas_(v) {
  var t = String(v === null || v === undefined ? '' : v).trim().toUpperCase().replace(/^KELAS\s*/, '');
  if (/^\d{1,2}$/.test(t)) { var n = parseInt(t, 10); return n >= 1 && n <= 12 ? String(n) : ''; }
  return KF_ROMAWI_.hasOwnProperty(t) ? String(KF_ROMAWI_[t]) : '';
}

function kfNormSmt_(v) {
  var n = parseInt(v, 10);
  return n === 1 || n === 2 ? String(n) : '';
}

// ---------- kombinasi mapel + fase dari data sekolah ----------
// [{ kunci, mapel, fase, rombel: [nama], kelas: ['10', ...] }]
function kfKombinasi_() {
  var peta = {}, urut = [];
  mapelAktifSemua_().forEach(function(m) {
    var nama = kfNamaPolos_(m.namaMapel);
    if (!nama) return;
    var fase = rppFase_(m.namaRombel);
    var k = kfKunci_(nama, fase);
    var g = peta[k];
    if (!g) { g = peta[k] = { kunci: k, mapel: nama, fase: fase, rombel: [], kelas: [] }; urut.push(g); }
    if (g.rombel.indexOf(m.namaRombel) < 0) g.rombel.push(m.namaRombel);
    var kl = kfKelasRombel_(m.namaRombel);
    if (kl && g.kelas.indexOf(kl) < 0) g.kelas.push(kl);
  });
  var cmp = function(a, b) { return String(a).localeCompare(String(b), 'id', { numeric: true, sensitivity: 'base' }); };
  urut.forEach(function(g) { g.rombel.sort(cmp); g.kelas.sort(function(a, b) { return parseInt(a, 10) - parseInt(b, 10); }); });
  urut.sort(function(a, b) {
    var fa = a.fase || 'Z', fb = b.fase || 'Z';
    return fa !== fb ? cmp(fa, fb) : cmp(a.mapel, b.mapel);
  });
  return urut;
}

function kfCariKombinasi_(kunci) {
  var hasil = null;
  kfKombinasi_().forEach(function(g) { if (g.kunci === String(kunci || '')) hasil = g; });
  if (!hasil) throw new Error('Mata pelajaran dan fase itu tidak ditemukan (mungkin sudah tidak aktif).');
  return hasil;
}

// ---------- baca dari sheet ----------
// { 'kunci|Status': { cp: [{elemen, teks}], tp: [{nomor, elemen, teks, kelas, smt, jp}], sumber, waktu, oleh } }
function kfBacaSemua_() {
  var sh = kfSheet_();
  var hasil = {};
  if (sh.getLastRow() < 2) return hasil;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, KF.HEADERS.length).getValues();
  var K = KF.K;
  var butir = [];
  v.forEach(function(r) {
    var kunci = sTeks_(r[K.kunci]).trim(), status = sTeks_(r[K.status]).trim();
    if (!kunci || !status) return;
    butir.push({ kunci: kunci, status: status, jenis: sTeks_(r[K.jenis]).trim(), urut: parseInt(sTeks_(r[K.urut]), 10) || 0, r: r });
  });
  butir.sort(function(a, b) { return a.urut - b.urut; });
  butir.forEach(function(b) {
    var id = b.kunci + '|' + b.status;
    var s = hasil[id] = hasil[id] || { cp: [], tp: [], sumber: '', waktu: '', oleh: '' };
    var r = b.r;
    s.sumber = sTeks_(r[K.sumber]).trim() || s.sumber;
    s.waktu = sTeks_(r[K.waktu]).trim() || s.waktu;
    s.oleh = sTeks_(r[K.oleh]).trim() || s.oleh;
    if (b.jenis === 'CP') s.cp.push({ elemen: sTeks_(r[K.elemen]).trim(), teks: sTeks_(r[K.teks]).trim() });
    else if (b.jenis === 'TP') s.tp.push({
      nomor: sTeks_(r[K.nomor]).trim(), elemen: sTeks_(r[K.elemen]).trim(), teks: sTeks_(r[K.teks]).trim(),
      kelas: kfNormKelas_(sTeks_(r[K.kelas])), smt: kfNormSmt_(sTeks_(r[K.smt])), jp: sTeks_(r[K.jp]).trim()
    });
  });
  return hasil;
}

function kfSetuju_(kunci) {
  var s = kfBacaSemua_()[kunci + '|' + KF.SETUJU];
  return s && s.cp.length && s.tp.length ? s : null;
}

// ---------- validasi / pembersihan masukan ----------
function kfBersih_(d, status) {
  d = d || {};
  var cp = [], tp = [];
  (Object.prototype.toString.call(d.cp) === '[object Array]' ? d.cp : []).forEach(function(x) {
    if (!x) return;
    var teks = aiTeks_(x.teks, KF.MAKS_CP_TEKS);
    if (!teks) return;
    cp.push({ elemen: aiTeks_(x.elemen, KF.MAKS_NAMA_ELEMEN), teks: teks });
  });
  (Object.prototype.toString.call(d.tp) === '[object Array]' ? d.tp : []).forEach(function(x) {
    if (!x) return;
    var teks = aiTeks_(x.teks, KF.MAKS_TP_TEKS);
    if (!teks) return;
    var jp = parseInt(x.jp, 10);
    tp.push({
      nomor: aiTeks_(x.nomor, 12), elemen: aiTeks_(x.elemen, KF.MAKS_NAMA_ELEMEN), teks: teks,
      kelas: kfNormKelas_(x.kelas), smt: kfNormSmt_(x.smt), jp: jp >= 1 && jp <= 40 ? String(jp) : ''
    });
  });
  if (cp.length > KF.MAKS_ELEMEN) throw new Error('Terlalu banyak elemen CP (maksimal ' + KF.MAKS_ELEMEN + ').');
  if (tp.length > KF.MAKS_TP) throw new Error('Terlalu banyak TP (maksimal ' + KF.MAKS_TP + ').');
  if (status === KF.SETUJU) {
    if (!cp.length) throw new Error('Isi minimal satu Capaian Pembelajaran sebelum menyetujui.');
    if (!tp.length) throw new Error('Isi minimal satu Tujuan Pembelajaran sebelum menyetujui.');
  } else if (!cp.length && !tp.length) {
    throw new Error('Draf masih kosong.');
  }
  // nomor kosong diisi urutan; nomor ganda ditolak supaya rujukan "TP n" tidak ambigu
  var dipakai = {};
  tp.forEach(function(x, i) {
    if (!x.nomor) x.nomor = String(i + 1);
    var k = x.nomor.toLowerCase();
    if (dipakai[k]) throw new Error('Nomor TP "' + x.nomor + '" dipakai dua kali. Setiap TP harus punya nomor berbeda.');
    dipakai[k] = true;
  });
  return { cp: cp, tp: tp, sumber: aiTeks_(d.sumber, KF.MAKS_SUMBER) };
}

// ---------- tulis ----------
// Mengganti seluruh set (kunci + status) dengan isi baru; set lain tidak disentuh. Pemanggil memegang kunci skrip.
function kfTulis_(g, status, bersih, nama) {
  var sh = kfSheet_();
  var kolom = KF.HEADERS.length;
  var simpan = [];
  if (sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, kolom).getValues().forEach(function(r) {
      if (!(sTeks_(r[KF.K.kunci]).trim() === g.kunci && sTeks_(r[KF.K.status]).trim() === status)) simpan.push(r);
    });
  }
  var waktu = kfWaktu_(), baru = [], u = 0;
  bersih.cp.forEach(function(x) {
    baru.push([g.kunci, g.mapel, g.fase, 'CP', ++u, '', x.elemen, x.teks, '', '', '', status, bersih.sumber, waktu, nama]);
  });
  bersih.tp.forEach(function(x) {
    baru.push([g.kunci, g.mapel, g.fase, 'TP', ++u, x.nomor, x.elemen, x.teks, x.kelas, x.smt, x.jp, status, bersih.sumber, waktu, nama]);
  });
  var semua = simpan.concat(baru);
  var akhir = sh.getLastRow();
  if (akhir >= 2) sh.getRange(2, 1, akhir - 1, kolom).clearContent();
  if (semua.length) {
    sh.getRange(2, 1, semua.length, kolom).setNumberFormat('@');
    sh.getRange(2, 1, semua.length, kolom).setValues(semua.map(function(r) { return r.map(function(c) { return c === null || c === undefined ? '' : String(c); }); }));
  }
}

function kfHapusSet_(g, status) {
  var sh = kfSheet_();
  var kolom = KF.HEADERS.length;
  if (sh.getLastRow() < 2) return 0;
  var simpan = [], buang = 0;
  sh.getRange(2, 1, sh.getLastRow() - 1, kolom).getValues().forEach(function(r) {
    if (sTeks_(r[KF.K.kunci]).trim() === g.kunci && sTeks_(r[KF.K.status]).trim() === status) buang++;
    else simpan.push(r);
  });
  if (!buang) return 0;
  sh.getRange(2, 1, sh.getLastRow() - 1, kolom).clearContent();
  if (simpan.length) {
    sh.getRange(2, 1, simpan.length, kolom).setNumberFormat('@');
    sh.getRange(2, 1, simpan.length, kolom).setValues(simpan.map(function(r) { return r.map(function(c) { return c === null || c === undefined ? '' : String(c); }); }));
  }
  return buang;
}

// Teks CP untuk sheet Identitas_CP / dokumen RPP
function kfTeksCp_(cp) {
  return cp.map(function(x) { return x.elemen ? x.elemen + ': ' + x.teks : x.teks; }).join('\n');
}

// Menyalin CP yang disetujui ke Identitas_CP (satu baris per nama mapel + fase) agar RPP langsung terisi.
function kfSalinKeIdentitasCp_(g, cp, sumber) {
  var sh = rppCpSheet_();
  var teks = kfTeksCp_(cp).slice(0, RPP.MAKS_CP);
  var baris = [g.mapel, g.fase, teks, sumber || 'Kerangka Kurikulum (disetujui admin)'];
  var ada = null;
  if (sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().forEach(function(r, i) {
      if (ada) return;
      if (kfNamaPolos_(r[0]).toLowerCase() === g.mapel.toLowerCase() && String(r[1]).trim().toUpperCase() === String(g.fase).toUpperCase()) ada = i + 2;
    });
  }
  if (ada) sh.getRange(ada, 1, 1, 4).setValues([baris]);
  else sh.appendRow(baris);
}

// ---------- tampilan data untuk klien ----------
function kfDataSet_(s) {
  if (!s) return null;
  return { cp: s.cp, tp: s.tp, sumber: s.sumber, waktu: s.waktu, oleh: s.oleh };
}

function kfRingkasStatus_(draf, setuju) {
  if (setuju && draf) return 'Disetujui + draf baru';
  if (setuju) return 'Disetujui';
  if (draf) return 'Draf';
  return 'Belum ada';
}

function waAdminKerangkaDaftar(token) {
  wajibAdmin_(token);
  var semua = kfBacaSemua_();
  return {
    siapAi: !!aiKunci_(),
    item: kfKombinasi_().map(function(g) {
      var d = semua[g.kunci + '|' + KF.DRAF] || null, s = semua[g.kunci + '|' + KF.SETUJU] || null;
      var cpLama = rppCariCp_(g.mapel, g.fase);
      return {
        kunci: g.kunci, mapel: g.mapel, fase: g.fase, rombel: g.rombel, kelas: g.kelas,
        status: kfRingkasStatus_(d, s), jumlahCp: s ? s.cp.length : 0, jumlahTp: s ? s.tp.length : 0,
        jumlahTpDraf: d ? d.tp.length : 0, waktu: s ? s.waktu : (d ? d.waktu : ''),
        cpSudahAda: !!(cpLama && cpLama.teks)
      };
    })
  };
}

function waAdminKerangkaBaca(token, kunci) {
  wajibAdmin_(token);
  var g = kfCariKombinasi_(kunci);
  var semua = kfBacaSemua_();
  var cpLama = rppCariCp_(g.mapel, g.fase);
  return {
    kunci: g.kunci, mapel: g.mapel, fase: g.fase, rombel: g.rombel, kelas: g.kelas,
    draf: kfDataSet_(semua[g.kunci + '|' + KF.DRAF]), setuju: kfDataSet_(semua[g.kunci + '|' + KF.SETUJU]),
    cpIdentitas: cpLama && cpLama.teks ? { teks: cpLama.teks, sumber: cpLama.sumber } : null,
    siapAi: !!aiKunci_(), maksMB: Math.floor(AI.MAKS_BYTE_PDF / 1048576), maksPdf: KF.MAKS_PDF
  };
}

// ---------- simpan / setujui / hapus ----------
// data: { cp: [{elemen, teks}], tp: [{nomor, elemen, teks, kelas, smt, jp}], sumber }
// setujui=true: jadikan resmi (tutor memakainya), hapus draf, salin CP ke Identitas_CP.
function waAdminKerangkaSimpan(token, kunci, data, setujui) {
  var adm = wajibAdmin_(token);
  var g = kfCariKombinasi_(kunci);
  var status = setujui === true ? KF.SETUJU : KF.DRAF;
  var bersih = kfBersih_(data, status);
  var kunciSkrip = kmKunciUnik_();
  kunciSkrip.waitLock(20000);
  try {
    kfTulis_(g, status, bersih, adm.nama);
    if (status === KF.SETUJU) {
      kfHapusSet_(g, KF.DRAF);
      kfSalinKeIdentitasCp_(g, bersih.cp, bersih.sumber);
    }
  } finally {
    kunciSkrip.releaseLock();
  }
  catat_('Admin', adm.id, adm.nama, status === KF.SETUJU ? 'Setujui kerangka CP-TP-ATP' : 'Simpan draf kerangka CP-TP-ATP',
    g.mapel + (g.fase ? ' (Fase ' + g.fase + ')' : '') + ': ' + bersih.cp.length + ' CP, ' + bersih.tp.length + ' TP', 'OK');
  return waAdminKerangkaBaca(token, kunci);
}

function waAdminKerangkaHapus(token, kunci, status) {
  var adm = wajibAdmin_(token);
  var g = kfCariKombinasi_(kunci);
  if (status !== KF.DRAF && status !== KF.SETUJU) throw new Error('Status tidak dikenal.');
  var n;
  var kunciSkrip = kmKunciUnik_();
  kunciSkrip.waitLock(20000);
  try { n = kfHapusSet_(g, status); } finally { kunciSkrip.releaseLock(); }
  catat_('Admin', adm.id, adm.nama, 'Hapus ' + (status === KF.DRAF ? 'draf' : 'kerangka') + ' CP-TP-ATP', g.mapel + (g.fase ? ' (Fase ' + g.fase + ')' : '') + ': ' + n + ' baris', 'OK');
  return waAdminKerangkaBaca(token, kunci);
}

// ---------- prompt ----------
function kfDaftarFase_(fase) {
  return { A: 'kelas 1-2', B: 'kelas 3-4', C: 'kelas 5-6', D: 'kelas 7-9', E: 'kelas 10', F: 'kelas 11-12' }[String(fase || '').toUpperCase()] || '';
}

function kfPrompt_(g, opsi, web) {
  opsi = opsi || {};
  var fl = (opsi.fasesSemua && opsi.fasesSemua.length > 1) ? opsi.fasesSemua : null;
  var flTeks = fl ? fl.map(function (f) { return f + (kfDaftarFase_(f) ? ' (' + kfDaftarFase_(f) + ')' : ''); }).join(', ') : '';
  var tingkat = { A: 'SD/MI/Program Paket A', B: 'SMP/MTs/Program Paket B', C: 'SMA/MA/SMK/Program Paket C' }[kurPaket_(g.rombel[0])] || 'Pendidikan Kesetaraan (PKBM)';
  var kelas = kfDaftarFase_(g.fase);
  var skema = '{"mata_pelajaran":"' + g.mapel + '","fase":"' + (fl ? '<huruf fase>' : (g.fase || '')) + '","capaian_pembelajaran":[{"elemen":"...","teks":"..."}],' +
    '"alur_tujuan_pembelajaran":[{"nomor":1,"elemen":"...","tujuan":"...","kelas":"11","semester":1,"alokasi_jp":null}]}';
  var catat = aiBersihCatatan_(opsi.catatan);
  return 'Anda adalah ahli kurikulum mata pelajaran ' + g.mapel + ' untuk ' + tingkat + ' (Kurikulum Merdeka)' + (fl ? ', Fase ' + flTeks : (g.fase ? ', Fase ' + g.fase + (kelas ? ' (' + kelas + ')' : '') : '')) +
    ' dan memahami pendidikan kesetaraan (PKBM).\n' +
    (web ? 'Baca SELURUH halaman file PDF yang saya lampirkan pada percakapan ini (jangan hanya sebagian) sebelum menjawab.\n' : '') +
    'Sumber: dokumen terlampir (biasanya Panduan Mata Pelajaran resmi Kemendikdasmen). Gunakan HANYA isi dokumen sebagai sumber. Jangan mengarang nomor, bunyi, atau halaman.\n\n' +
    (fl ? 'PERHATIAN: dokumen ini mencakup BANYAK fase. Kerjakan fase-fase berikut SATU PER SATU, berurutan: ' + flTeks + ', untuk mata pelajaran ' + g.mapel + '. Untuk setiap fase ambil HANYA data fase itu dan jangan mencampurnya dengan fase lain. ' : 'PERHATIAN: dokumen ini bisa mencakup BANYAK fase (A sampai F) dan banyak bagian. Ambil HANYA data Fase ' + (g.fase || '') + (kelas ? ' (' + kelas + ')' : '') + ' untuk mata pelajaran ' + g.mapel + ', abaikan fase lain. ') +
    'Untuk CP: cari bagian CP fase itu (per elemen); bila yang ada hanya tabel yang membandingkan semua fase, ambil hanya kolom fase tersebut. ' +
    'Untuk ATP: cari tabel contoh rumusan ATP fase itu. Bila tabel dikelompokkan per kelas (misalnya Kelas III lalu Kelas IV), isi kelas pada tiap butir dengan angka kelasnya (III=3, IV=4, dan seterusnya) dan pertahankan nomor urut yang berlanjut persis seperti tertulis di dokumen; jangan memulai nomor dari 1 lagi pada kelas berikutnya.\n\n' +
    'TUGAS:\n' +
    '1. capaian_pembelajaran: kutip Capaian Pembelajaran (CP) ' + (fl ? 'tiap fase' : 'Fase ' + (g.fase || '')) + ' APA ADANYA dari dokumen (jangan diringkas atau diubah maknanya). Bila CP terbagi menjadi elemen, buat satu objek per elemen dengan nama elemen yang tertulis; bila tidak terbagi, buat satu objek dengan elemen "".\n' +
    '2. alur_tujuan_pembelajaran: bila dokumen memuat tabel contoh Alur Tujuan Pembelajaran (ATP, biasanya bagian "Penyusunan Alur Tujuan Pembelajaran"), salin nomor urut dan bunyi tujuannya APA ADANYA dan pertahankan urutannya. ' +
    'Bila dokumen tidak memuat ATP, turunkan Tujuan Pembelajaran (TP) dari CP dengan urutan dari mudah ke sulit dan beri nomor urut 1, 2, 3, dan seterusnya.\n' +
    '   - nomor: bilangan urut (angka saja, tanpa awalan "TP").\n' +
    '   - elemen: nama elemen CP yang menjadi dasar TP itu ("" bila tidak ada).\n' +
    '   - tujuan: satu kalimat tujuan pembelajaran yang dapat diamati, diawali kata kerja operasional.\n' +
    '   - kelas: angka kelas (mis. 11 atau 12) bila dokumen menetapkan TP itu untuk kelas tertentu, selain itu "".\n' +
    '   - semester: 1 atau 2 bila dokumen menetapkannya, selain itu null. alokasi_jp: bilangan bila ada di dokumen, selain itu null.\n' +
    '3. Tulis dalam bahasa Indonesia, teks biasa tanpa Markdown. Jangan menambah TP di luar yang didukung dokumen.\n\n' +
    (web && fl ? 'FORMAT KELUARAN: tulis SATU blok kode ' + kurPagar_() + 'json UNTUK SETIAP FASE (' + fl.join(', ') + '), berurutan sesuai daftar itu; tiap blok berisi satu objek JSON valid dan tanpa penjelasan di luar blok. Isi "fase" dengan huruf fasenya. Di dalam string jangan ada baris baru mentah dan jangan ada tanda kutip ganda yang belum di-escape. Skema tiap blok:\n' : web
      ? 'FORMAT KELUARAN: tulis HANYA SATU blok kode ' + kurPagar_() + 'json yang berisi satu objek JSON valid, tanpa penjelasan sebelum atau sesudahnya. Di dalam string jangan ada baris baru mentah dan jangan ada tanda kutip ganda yang belum di-escape. Skema:\n'
      : 'FORMAT KELUARAN: balas HANYA dengan satu objek JSON valid (tanpa pagar kode markdown, tanpa penjelasan). Skema:\n') + skema +
    (catat ? '\n\nCatatan tambahan dari admin (ikuti selama tidak bertentangan dengan isi dokumen): ' + catat : '');
}

// Dari JSON Gemini ke bentuk { cp, tp, sumber } (belum divalidasi penuh; kfBersih_ yang memutuskan)
function kfSusunDariJson_(j, sumber) {
  if (!j || typeof j !== 'object') throw new Error('Jawaban tidak berupa objek JSON.');
  var cpIn = j.capaian_pembelajaran, tpIn = j.alur_tujuan_pembelajaran || j.tujuan_pembelajaran || j.atp;
  if (typeof cpIn === 'string') cpIn = [{ elemen: '', teks: cpIn }];
  if (cpIn && !(cpIn instanceof Array) && typeof cpIn === 'object') cpIn = [cpIn];
  var cp = [];
  (cpIn || []).forEach(function(x) {
    if (typeof x === 'string') cp.push({ elemen: '', teks: x });
    else if (x) cp.push({ elemen: x.elemen || x.nama || '', teks: x.teks || x.cp || x.capaian || '' });
  });
  var tp = [];
  (tpIn || []).forEach(function(x) {
    if (typeof x === 'string') tp.push({ nomor: '', elemen: '', teks: x, kelas: '', smt: '', jp: '' });
    else if (x) tp.push({
      nomor: String(x.nomor === undefined || x.nomor === null ? '' : x.nomor).replace(/^\s*TP\s*/i, ''),
      elemen: x.elemen || '', teks: x.tujuan || x.teks || x.tp || '', kelas: x.kelas, smt: x.semester !== undefined ? x.semester : x.smt, jp: x.alokasi_jp !== undefined ? x.alokasi_jp : x.jp
    });
  });
  return { cp: cp, tp: tp, sumber: sumber || '' };
}

// ---------- unggah PDF sumber (khusus admin) ----------
function waAdminKerangkaMulaiUnggah(token, namaFile, ukuran, mime) {
  return aiLindungi_(token, function() { return kfMulaiUnggahInti_(token, namaFile, ukuran, mime); });
}

function kfMulaiUnggahInti_(token, namaFile, ukuran, mime) {
  wajibAdmin_(token);
  aiWajibSiap_();
  ukuran = Number(ukuran) || 0;
  if (String(mime) !== 'application/pdf') throw new Error('Berkas harus berformat PDF.');
  if (ukuran <= 0) throw new Error('Berkas kosong.');
  if (ukuran > AI.MAKS_BYTE_PDF) throw new Error('PDF terlalu besar. Maksimal ' + Math.floor(AI.MAKS_BYTE_PDF / 1048576) + ' MB.');
  var nama = String(namaFile || 'dokumen.pdf').replace(/[^\w.\- ]/g, '_').slice(0, 80);
  var resp = UrlFetchApp.fetch(AI.BASE + '/upload/v1beta/files', {
    method: 'post',
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      'x-goog-api-key': aiKunci_(),
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(ukuran),
      'X-Goog-Upload-Header-Content-Type': 'application/pdf'
    },
    payload: JSON.stringify({ file: { display_name: 'bm-kerangka-' + nama } })
  });
  var kode = resp.getResponseCode();
  if (kode < 200 || kode >= 300) {
    var j = null;
    try { j = JSON.parse(resp.getContentText()); } catch (e) {}
    throw new Error(aiPesanGalat_({ kode: kode, json: j }));
  }
  var url = String(aiHeaderCari_(resp.getAllHeaders(), 'x-goog-upload-url') || '');
  if (url.indexOf(AI.BASE + '/') !== 0) throw new Error('Gemini tidak memberikan tautan unggah. Coba lagi.');
  return { uploadUrl: url };
}

// ---------- susun dengan AI dari PDF ----------
// refs: [{ name, uri }] (1 sampai KF.MAKS_PDF berkas). Hasil disimpan sebagai DRAF.
function waAdminKerangkaAi(token, kunci, refs, opsi) {
  return aiLindungi_(token, function() { return kfAiInti_(token, kunci, refs, opsi); });
}

function kfAiInti_(token, kunci, refs, opsi) {
  var adm = wajibAdmin_(token);
  aiWajibSiap_();
  opsi = opsi || {};
  var g = kfCariKombinasi_(kunci);
  refs = Object.prototype.toString.call(refs) === '[object Array]' ? refs : [];
  if (!refs.length) throw new Error('Unggah dulu PDF sumber (mis. Panduan Mata Pelajaran).');
  if (refs.length > KF.MAKS_PDF) throw new Error('Maksimal ' + KF.MAKS_PDF + ' PDF sekali proses.');
  refs.forEach(function(r) { if (!aiRefFileValid_(r)) throw new Error('Referensi PDF tidak valid. Unggah ulang PDF-nya.'); });
  if (hitung_('aip|' + adm.id, 3600) > AI.MAKS_PROSES_PER_JAM) throw new Error('Terlalu banyak proses AI dalam satu jam. Coba lagi nanti.');
  var mulai = Date.now();
  refs.forEach(function(r) { aiTungguAktif_(r.name); });
  var parts = refs.map(function(r) { return { fileData: { mimeType: 'application/pdf', fileUri: r.uri } }; });
  parts.push({ text: kfPrompt_(g, opsi, false) });
  var res = aiPanggil_('POST', AI.BASE + '/v1beta/models/' + aiModel_() + ':generateContent', {
    contents: [{ role: 'user', parts: parts }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json', maxOutputTokens: 16384 }
  }, { mulai: mulai, pikir: KF.PIKIR, penanda: true });
  var pakai = aiRingkasPakai_(res, mulai);
  var j = aiParseJson_(aiTeksDariRespons_(res.json));
  var bersih = kfBersih_(kfSusunDariJson_(j, aiTeks_(opsi.sumber, KF.MAKS_SUMBER) || 'PDF sumber (AI)'), KF.DRAF);
  if (!bersih.cp.length || !bersih.tp.length) throw new Error('AI belum menghasilkan CP dan TP yang lengkap. Coba proses lagi atau pakai PDF yang memuat Capaian Pembelajaran.');
  var kunciSkrip = kmKunciUnik_();
  kunciSkrip.waitLock(20000);
  try { kfTulis_(g, KF.DRAF, bersih, adm.nama + ' (AI)'); } finally { kunciSkrip.releaseLock(); }
  catat_('Admin', adm.id, adm.nama, 'AI kerangka CP-TP-ATP', g.mapel + (g.fase ? ' (Fase ' + g.fase + ')' : '') + ': ' + bersih.cp.length + ' CP, ' + bersih.tp.length + ' TP · ' + pakai, 'OK');
  return waAdminKerangkaBaca(token, kunci);
}

// ---------- mode manual (Gemini web) ----------
function waAdminKerangkaPromptManual(token, kunci, opsi) {
  wajibAdmin_(token);
  var g = kfCariKombinasi_(kunci);
  opsi = opsi || {};
  if (opsi.semuaFase) {
    var fl = [];
    kfKombinasi_().forEach(function (x) { if (x.mapel === g.mapel && x.fase && fl.indexOf(x.fase) < 0) fl.push(x.fase); });
    fl.sort();
    if (fl.length > 1) return { prompt: kfPrompt_(g, { catatan: opsi.catatan, fasesSemua: fl }, true), fase: fl };
  }
  return { prompt: kfPrompt_(g, opsi, true) };
}

function waAdminKerangkaImporManual(token, kunci, teks, semuaFase) {
  var adm = wajibAdmin_(token);
  var g = kfCariKombinasi_(kunci);
  teks = String(teks || '');
  if (!teks.trim()) throw new Error('Tempel dulu jawaban JSON dari Gemini.');
  // Deteksi otomatis: bila jawaban memuat beberapa fase (atau fase lain dari yang sedang dibuka), semua fase di dalamnya diproses sekaligus.
  var objs = [];
  try { objs = kfObjekFase_(teks); } catch (e) { objs = []; }
  var adaFase = objs.filter(function (o) { return String(o.fase || '').trim() !== ''; });
  var faseKini = String(g.fase || '').toUpperCase();
  var faseObjek = adaFase.length ? String(adaFase[0].fase).toUpperCase().replace(/^FASE\s*/, '').trim() : '';
  if (semuaFase || adaFase.length > 1 || (adaFase.length === 1 && faseObjek !== faseKini)) return kfImporSemuaFase_(adm, g, teks, objs.length ? objs : null);
  if (teks.length > 200000) throw new Error('Teks terlalu panjang.');
  var j = null;
  try { j = aiParseJson_(teks); } catch (e) {}
  if (!j) { var p = kurParseLonggar_(teks); j = p ? p.obj : null; }
  if (!j) throw new Error('Teks yang ditempel bukan JSON yang valid. Salin ulang seluruh blok jawaban Gemini.');
  var bersih = kfBersih_(kfSusunDariJson_(j, 'Gemini web (manual)'), KF.DRAF);
  if (!bersih.cp.length || !bersih.tp.length) throw new Error('JSON belum memuat CP dan TP yang lengkap.');
  var kunciSkrip = kmKunciUnik_();
  kunciSkrip.waitLock(20000);
  try { kfTulis_(g, KF.DRAF, bersih, adm.nama + ' (manual)'); } finally { kunciSkrip.releaseLock(); }
  catat_('Admin', adm.id, adm.nama, 'Impor manual kerangka CP-TP-ATP', g.mapel + (g.fase ? ' (Fase ' + g.fase + ')' : '') + ': ' + bersih.cp.length + ' CP, ' + bersih.tp.length + ' TP', 'OK');
  return waAdminKerangkaBaca(token, kunci);
}

// ---------- dipakai tutor ----------
// TP yang berlaku untuk kelas rombel: kelas kosong berlaku untuk semua kelas pada fase itu.
function kfUntukMapel_(m) {
  var fase = rppFase_(m.namaRombel);
  var g = kfKunci_(m.namaMapel, fase);
  var s = kfSetuju_(g);
  if (!s) return null;
  var kelas = kfKelasRombel_(m.namaRombel);
  return {
    mapel: kfNamaPolos_(m.namaMapel), fase: fase, kelas: kelas, cp: s.cp, sumber: s.sumber, waktu: s.waktu, oleh: s.oleh,
    tp: s.tp.map(function(x) {
      return { nomor: x.nomor, elemen: x.elemen, teks: x.teks, kelas: x.kelas, smt: x.smt, jp: x.jp, untukKelas: !x.kelas || !kelas || x.kelas === kelas };
    })
  };
}

// Dibaca tutor pengampu, admin, dan pimpinan (hanya yang SUDAH disetujui).
function waStafKerangka(token, idMapel) {
  var a = rppAkses_(token, idMapel, false);
  var k = kfUntukMapel_(a.m);
  return k ? { ada: true, kerangka: k } : { ada: false, kerangka: null };
}

function kfLabelTp_(x) {
  return (/^\d/.test(x.nomor) ? 'TP ' : '') + x.nomor;
}

// Blok teks untuk prompt penyusunan rencana sesi (tab Kurikulum). '' bila belum ada kerangka yang disetujui.
function kfBlokPrompt_(m) {
  var k = null;
  try { k = kfUntukMapel_(m); } catch (e) { k = null; }
  if (!k) return '';
  var daftar = k.tp.filter(function(x) { return x.untukKelas; });
  if (!daftar.length) daftar = k.tp;
  var cp = k.cp.map(function(x) { return '- ' + (x.elemen ? x.elemen + ': ' : '') + x.teks.slice(0, 1200); }).join('\n');
  var tp = daftar.map(function(x) {
    return kfLabelTp_(x) + (x.elemen ? ' [' + x.elemen + ']' : '') + (x.smt ? ' (semester ' + x.smt + ')' : '') + ': ' + x.teks;
  }).join('\n');
  return 'KERANGKA RESMI dari admin (sudah disetujui, WAJIB diikuti):\nCapaian Pembelajaran:\n' + cp + '\n\nAlur Tujuan Pembelajaran' +
    (k.kelas ? ' untuk kelas ' + k.kelas : '') + ' (urutan mudah ke sulit):\n' + tp + '\n\n' +
    'Aturan: isi tujuan_pembelajaran tiap sesi dengan 1 sampai 3 butir yang dipilih dari daftar TP di atas, ditulis persis "' + (/^\d/.test(daftar[0].nomor) ? 'TP ' : '') + 'nomor: bunyi TP" tanpa mengubah bunyinya dan tanpa membuat TP baru. ' +
    'Urutan sesi mengikuti urutan ATP, dan seluruh TP pada daftar harus tercakup selama dua semester.\n\n';
}


// Impor manual satu jawaban Gemini yang berisi beberapa blok JSON (satu per fase) untuk satu mata pelajaran.
function kfImporSemuaFase_(adm, g, teks, objs) {
  if (teks.length > 400000) throw new Error('Teks terlalu panjang.');
  var semua = kfKombinasi_().filter(function (x) { return x.mapel === g.mapel; });
  var tersimpan = [], dilewati = [], gagal = 0;
  (objs || kfObjekFase_(teks)).forEach(function (j) {
    var fase = String(j.fase || '').toUpperCase().replace(/^FASE\s*/, '').trim();
    var tujuan = null;
    semua.forEach(function (x) { if (String(x.fase || '').toUpperCase() === fase) tujuan = x; });
    if (!tujuan) { dilewati.push('Fase ' + (fase || '?') + ' (tidak ada rombel aktif atau fase tidak dikenali)'); return; }
    var bersih = null;
    try { bersih = kfBersih_(kfSusunDariJson_(j, 'Gemini web (manual)'), KF.DRAF); } catch (eb) { bersih = { cp: [], tp: [] }; }
    if (!bersih.cp.length || !bersih.tp.length) { dilewati.push('Fase ' + fase + ' (CP atau TP belum lengkap)'); return; }
    var kunciSkrip = kmKunciUnik_();
    kunciSkrip.waitLock(20000);
    try { kfTulis_(tujuan, KF.DRAF, bersih, adm.nama + ' (manual)'); } finally { kunciSkrip.releaseLock(); }
    catat_('Admin', adm.id, adm.nama, 'Impor manual kerangka CP-TP-ATP', tujuan.mapel + ' (Fase ' + tujuan.fase + '): ' + bersih.cp.length + ' CP; ' + bersih.tp.length + ' TP', 'OK');
    tersimpan.push('Fase ' + tujuan.fase);
  });
  if (!tersimpan.length) throw new Error('Tidak ada fase yang berhasil dibaca' + (dilewati.length ? ': ' + dilewati.join('; ') : '') + '. Pastikan tiap blok JSON memuat "fase" dan salin seluruh jawaban Gemini.');
  var pesan = 'Draf tersimpan untuk ' + tersimpan.join(', ') + '.' + (dilewati.length ? ' Dilewati: ' + dilewati.join('; ') + '.' : '') + (gagal ? ' ' + gagal + ' bagian tidak terbaca sebagai JSON.' : '') + ' Buka tiap fase untuk memeriksa lalu menyetujui.';
  return { semua: true, tersimpan: tersimpan, dilewati: dilewati, pesan: pesan };
}


// Mengurai teks jawaban Gemini menjadi daftar objek per fase: blok terpisah, larik objek, atau objek dengan fase_list.
function kfObjekFase_(teks) {
  var out = [];
  function tambah(j) {
    if (!j || typeof j !== 'object') return;
    if (j instanceof Array) { j.forEach(tambah); return; }
    var daftar = j.fase_list || j.daftar_fase || j.fases;
    if (daftar instanceof Array && !j.capaian_pembelajaran) {
      daftar.forEach(function (x) {
        if (x && typeof x === 'object' && !(x instanceof Array) && !x.mata_pelajaran && j.mata_pelajaran) x.mata_pelajaran = j.mata_pelajaran;
        tambah(x);
      });
      return;
    }
    out.push(j);
  }
  kurPecahObjek_(String(teks || '')).forEach(function (bagian) {
    var hsl = kurParseLonggar_(bagian);
    if (hsl && hsl.obj) tambah(hsl.obj);
  });
  if (!out.length) { var p = null; try { p = aiParseJson_(teks); } catch (e) {} if (p) tambah(p); }
  return out;
}


// Setujui dan pakai: semua draf kerangka CP-TP-ATP untuk satu mata pelajaran di seluruh fasenya sekaligus.
function waAdminKerangkaSetujuiSemua(token, kunci) {
  var adm = wajibAdmin_(token);
  var g = kfCariKombinasi_(kunci);
  var semua = kfBacaSemua_();
  var disetujui = [], dilewati = [];
  var kunciSkrip = kmKunciUnik_();
  kunciSkrip.waitLock(30000);
  try {
    kfKombinasi_().filter(function (x) { return x.mapel === g.mapel; }).forEach(function (x) {
      var data = kfDataSet_(semua[x.kunci + '|' + KF.DRAF]);
      if (!data || !data.cp || !data.tp || !data.cp.length || !data.tp.length) { dilewati.push('Fase ' + (x.fase || '-') + ' (belum ada draf)'); return; }
      var bersih = kfBersih_({ cp: data.cp, tp: data.tp, sumber: data.sumber }, KF.SETUJU);
      if (!bersih.cp.length || !bersih.tp.length) { dilewati.push('Fase ' + (x.fase || '-') + ' (CP atau TP belum lengkap)'); return; }
      kfTulis_(x, KF.SETUJU, bersih, adm.nama);
      kfHapusSet_(x, KF.DRAF);
      kfSalinKeIdentitasCp_(x, bersih.cp, bersih.sumber);
      catat_('Admin', adm.id, adm.nama, 'Setujui kerangka CP-TP-ATP', x.mapel + ' (Fase ' + x.fase + '): ' + bersih.cp.length + ' CP; ' + bersih.tp.length + ' TP (setujui semua fase)', 'OK');
      disetujui.push('Fase ' + (x.fase || '-'));
    });
  } finally {
    kunciSkrip.releaseLock();
  }
  if (!disetujui.length) throw new Error('Belum ada draf yang bisa disetujui untuk ' + g.mapel + '.');
  return { disetujui: disetujui, dilewati: dilewati, pesan: 'Kerangka ' + g.mapel + ' disetujui dan dipakai tutor untuk ' + disetujui.join(', ') + '.' + (dilewati.length ? ' Dilewati: ' + dilewati.join('; ') + '.' : '') };
}

