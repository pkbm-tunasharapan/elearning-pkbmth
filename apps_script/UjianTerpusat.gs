// ============================================================================
// JADWAL UJIAN TERPUSAT KELAS TATAP MUKA (aplikasi 1.32)
// - Kelas tatap muka = rombel·mapel yang punya jadwal (PEMETAAN) aktif di menu Jadwal.
// - Jadwal UTS/UAS/ujian lainnya untuk kelas tatap muka ditetapkan terpusat oleh Admin, Superadmin,
//   Kepala Sekolah, atau Koordinator Kurikulum. Tutor tidak dapat menetapkan sendiri (dikunci di
//   waStafUjianSimpan), hanya melihat dan mencetak naskah.
// - Usulan otomatis: di dalam rentang ujian (kalender akademik), setiap pertemuan tatap muka menjadi
//   sesi ujian pada tanggal + jam sesi tersebut. Admin memeriksa, mengubah bila perlu, lalu menetapkan.
// - Soal tetap dari bank soal materi kurikulum (diundi seperti ujian online biasa).
// - Mode per jadwal: APK (dikerjakan di aplikasi di kelas) atau Kertas (naskah dicetak dari bank soal,
//   nilai diinput manual tutor di menu Nilai).
// Data: sheet "Jadwal Ujian" (kolom tambahan Mode, Terpusat, Judul).
// v1.59.0: sejak ada Masa Ujian serentak, menu ini khusus UJIAN KERTAS. Jadwal baru selalu mode Kertas;
//   ujian di aplikasi (APK) dijadwalkan lewat Masa Ujian supaya pengawas, token, dan anti-kecurangan berlaku.
//   Jadwal APK lama tetap tampil dan bisa diubah waktunya (tidak bisa diubah dari Kertas ke APK).
//   Jadwal milik Masa Ujian hanya tampil (cetak naskah); ubah/batal lewat menu Masa Ujian.
// ============================================================================
var UJT = { PERAN: ['Admin', 'Superadmin', 'Kepala Sekolah', 'Koordinator Kurikulum'], JENIS: ['UTS', 'UAS', 'LAIN'], MAKS_HARI: 62 };

function ujtKelola_(p) { return UJT.PERAN.indexOf(p.peran) >= 0; }

function ujtTambahHari_(iso, n) {
  var p = String(iso).split('-');
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n);
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

function ujtMenit_(a, b) {
  var x = /^(\d{2}):(\d{2})$/.exec(String(a || '')), y = /^(\d{2}):(\d{2})$/.exec(String(b || ''));
  if (!x || !y) return 0;
  return (Number(y[1]) * 60 + Number(y[2])) - (Number(x[1]) * 60 + Number(x[2]));
}

// Peta kelas tatap muka: pemetaan aktif -> ID mapel e-Learning.
function ujtPeta_() {
  var peta = nilPetaBm_(), aktif = jadKelasAktif_();
  var pm = jadBacaPm_().data.filter(function(x) { return x.aktif && aktif[x.idRombel + '|' + x.kodeMapel]; });
  var keMapel = {}, tm = {};
  pm.forEach(function(x) {
    var key = x.idRombel + '|' + x.kodeMapel;
    (peta.kelas[key] || []).forEach(function(b) {
      if (!b.aktif) return;
      tm[String(b.idMapel)] = key;
      (keMapel[key] = keMapel[key] || {})[String(b.idMapel)] = true;
    });
  });
  return { pm: pm, tm: tm, keMapel: keMapel };
}

var UJT_TM_ = null;
// true bila mapel e-Learning ini termasuk kelas tatap muka (punya jadwal aktif).
function ujtTatapMuka_(idMapel) {
  if (!UJT_TM_) { try { UJT_TM_ = ujtPeta_().tm; } catch (e) { UJT_TM_ = {}; } }
  return !!UJT_TM_[String(idMapel)];
}

function ujtSesiDariTanggal_(cfg, tgl) {
  var now = Date.now();
  for (var smt = 1; smt <= cfg.jumlahSemester; smt++) {
    for (var n = 1; n <= cfg.sesiPerSemester; n++) {
      var info = taInfo_(cfg, smt, n, now);
      if (info.mulaiIso && tgl >= info.mulaiIso && tgl <= info.selesaiIso) return { smt: smt, n: n, nama: info.nama };
    }
  }
  return null;
}

function ujtPetaMapel_() {
  var o = {};
  mapelAktifSemua_().forEach(function(m) { o[String(m.idMapel)] = m; });
  return o;
}

// Data halaman: rentang dari kalender akademik, jadwal yang sudah ada, usulan dari jadwal tatap muka,
// dan kelas tatap muka yang belum punya pertemuan di rentang itu. Tutor: hanya jadwal mapel miliknya.
// q: {smt, jenis: 'UTS'|'UAS'|'LAIN', dari, sampai}
function waStafUjtData(token, q) {
  var p = stafDariToken_(token);
  var kelola = ujtKelola_(p);
  if (!kelola && p.peran !== 'Tutor') throw new Error('Peran Anda tidak dapat melihat jadwal ujian.');
  q = q || {};
  var cfg = taBaca_(), now = Date.now(), maksSmt = Math.min(2, cfg.jumlahSemester);
  var kini = ujtSesiDariTanggal_(cfg, absHariIni_());
  var smt = parseInt(q.smt, 10) || (kini ? kini.smt : 1);
  if (smt < 1 || smt > maksSmt) smt = 1;
  var jenis = String(q.jenis || 'UTS').toUpperCase();
  if (UJT.JENIS.indexOf(jenis) < 0) jenis = 'UTS';
  var rentang = { dari: '', sampai: '', nama: '' };
  if (jenis !== 'LAIN') {
    var info = taInfo_(cfg, smt, jenis === 'UTS' ? cfg.uts : cfg.uas, now);
    rentang = { dari: info.mulaiIso, sampai: info.selesaiIso, nama: info.nama };
  }
  var dari = q.dari ? absTglSah_(q.dari) : rentang.dari, sampai = q.sampai ? absTglSah_(q.sampai) : rentang.sampai;
  var mapel = ujtPetaMapel_(), tutor = absPetaTutor_(), pt = ujtPeta_();
  var ada = {};
  var terjadwal = ujJadwalSemua_().filter(function(j) { return j.smt === smt && j.jenis === jenis && mapel[String(j.idMapel)]; }).map(function(j) {
    var m = mapel[String(j.idMapel)];
    ada[String(j.idMapel)] = true;
    return {
      idUjian: j.idUjian, idMapel: j.idMapel, namaMapel: m.namaMapel, namaRombel: m.namaRombel, tanggal: j.tanggal, jam: j.jam, durasi: j.durasi,
      kkm: j.kkm, jumlah: j.jumlah, mode: j.mode, terpusat: j.terpusat, judul: j.judulKhusus || ujJudul_(j.jenis, j.smt),
      teks: ujTeksWaktu_(j.mulaiMs), sudahMulai: now >= j.mulaiMs, tatapMuka: !!pt.tm[String(j.idMapel)], dibuatOleh: j.dibuatOleh, masa: j.masa || ''
    };
  });
  terjadwal.sort(function(a, b) { return (a.tanggal + a.jam + a.namaRombel).localeCompare(b.tanggal + b.jam + b.namaRombel); });
  var dasar = { smt: smt, jenis: jenis, jumlahSemester: maksSmt, rentang: rentang, dari: dari, sampai: sampai };
  if (!kelola) {
    var boleh = ujMapelTutor_(p);
    dasar.kelola = false;
    dasar.terjadwal = terjadwal.filter(function(x) { return boleh[String(x.idMapel)] === true; });
    dasar.usulan = []; dasar.belum = [];
    return dasar;
  }
  var usulan = [], sudah = {};
  if (dari && sampai && dari <= sampai) {
    for (var tgl = dari, i = 0; tgl <= sampai && i < UJT.MAKS_HARI; tgl = ujtTambahHari_(tgl, 1), i++) {
      pt.pm.forEach(function(x) {
        if (!jadBerlaku_(x, tgl)) return;
        Object.keys(pt.keMapel[x.idRombel + '|' + x.kodeMapel] || {}).forEach(function(idM) {
          if (ada[idM] || sudah[idM] || !mapel[idM]) return;
          sudah[idM] = true;
          var m = mapel[idM];
          usulan.push({
            idMapel: idM, namaMapel: m.namaMapel, namaRombel: m.namaRombel, tanggal: tgl, hari: jadHariDari_(tgl), jam: x.mulai, selesai: x.selesai,
            slot: x.slot, namaTutor: tutor[x.idTutor] ? tutor[x.idTutor].nama : x.idTutor, durasiSesi: ujtMenit_(x.mulai, x.selesai)
          });
        });
      });
    }
  }
  usulan.sort(function(a, b) { return (a.tanggal + a.jam + a.namaRombel + a.namaMapel).localeCompare(b.tanggal + b.jam + b.namaRombel + b.namaMapel); });
  var belum = Object.keys(pt.tm).filter(function(idM) { return !ada[idM] && !sudah[idM] && mapel[idM]; }).map(function(idM) {
    var m = mapel[idM];
    return { idMapel: idM, namaMapel: m.namaMapel, namaRombel: m.namaRombel };
  }).sort(function(a, b) { return (a.namaRombel + a.namaMapel).localeCompare(b.namaRombel + b.namaMapel); });
  var kkm = 70;
  try { kkm = nilAturan_().kkm; } catch (e) {}
  dasar.kelola = true;
  dasar.terjadwal = terjadwal;
  dasar.usulan = usulan;
  dasar.belum = belum;
  dasar.bawaan = { durasi: 60, jumlah: UJ.JUMLAH_BAWAAN, kkm: kkm, maksSoal: KM.MAKS_SOAL_PER_UJIAN, durasiMin: UJ.DURASI_MIN, durasiMaks: UJ.DURASI_MAKS };
  return dasar;
}

// d: {smt, jenis, judul (khusus LAIN), durasi, kkm, jumlah, item: [{idMapel, tanggal, jam, mode: 'APK'|'Kertas', durasi?}]}
function waStafUjtTetapkan(token, d) {
  var p = stafDariToken_(token);
  if (!ujtKelola_(p)) throw new Error('Penetapan jadwal ujian terpusat hanya oleh Admin, Kepala Sekolah, atau Koordinator Kurikulum.');
  d = d || {};
  var cfg = taBaca_(), now = Date.now();
  var smt = parseInt(d.smt, 10), jenis = String(d.jenis || '').toUpperCase();
  if (!(smt >= 1 && smt <= Math.min(2, cfg.jumlahSemester))) throw new Error('Pilih Semester 1 atau 2.');
  if (UJT.JENIS.indexOf(jenis) < 0) throw new Error('Jenis ujian tidak dikenal.');
  var judulLain = String(d.judul || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (jenis === 'LAIN' && judulLain.length < 3) throw new Error('Isi nama ujian (mis. Ujian Kesetaraan).');
  var durasi = parseInt(d.durasi, 10);
  if (!(durasi >= UJ.DURASI_MIN && durasi <= UJ.DURASI_MAKS)) throw new Error('Durasi ' + UJ.DURASI_MIN + ' sampai ' + UJ.DURASI_MAKS + ' menit.');
  var kkm = parseFloat(d.kkm);
  if (isNaN(kkm) || kkm < 0 || kkm > 100) throw new Error('KKM 0 sampai 100.');
  var jumlah = parseInt(d.jumlah, 10) || UJ.JUMLAH_BAWAAN;
  if (jumlah < 5 || jumlah > KM.MAKS_SOAL_PER_UJIAN) throw new Error('Jumlah soal 5 sampai ' + KM.MAKS_SOAL_PER_UJIAN + '.');
  var komp = ujKomposisi_(jumlah, {});
  var item = Array.isArray(d.item) ? d.item : [];
  if (!item.length) throw new Error('Pilih minimal satu jadwal.');
  if (item.length > 200) throw new Error('Maksimal 200 jadwal sekali tetapkan.');
  var mapel = ujtPetaMapel_();
  var sesiUjian = jenis === 'LAIN' ? '' : taInfo_(cfg, smt, jenis === 'UTS' ? cfg.uts : cfg.uas, now).nama;
  var hasil = [], lewat = [];
  var kunci = kmKunciUnik_();
  kunci.waitLock(30000);
  try {
    var adaKunci = {};
    ujJadwalSemua_().forEach(function(x) { adaKunci[x.kunci] = true; });
    var mm = kmMateri_(), v = mm.sheet.getDataRange().getValues(), ujianSesi = {};
    for (var i = 1; i < v.length; i++) {
      if (sTeks_(v[i][mm.c.jenis - 1]).trim() !== 'Ujian' || sTeks_(v[i][mm.c.status - 1]).trim() !== 'Aktif') continue;
      ujianSesi[sTeks_(v[i][mm.c.idMapel - 1]).trim() + '|' + sTeks_(v[i][mm.c.sesi - 1]).trim()] = sTeks_(v[i][mm.c.judul - 1]).trim();
    }
    item.forEach(function(it) {
      var idM = String((it && it.idMapel) || ''), m = mapel[idM];
      var nm = m ? m.namaMapel + ' · ' + m.namaRombel : idM;
      try {
        if (!m) throw new Error('mapel tidak aktif');
        var tgl = ujTgl_(it.tanggal), jam = ujJam_(it.jam);
        if (!tgl || !jam) throw new Error('tanggal atau jam belum diisi');
        var mulaiMs = ujMs_(tgl, jam);
        if (isNaN(mulaiMs)) throw new Error('tanggal atau jam tidak valid');
        if (mulaiMs < now) throw new Error('waktu mulai sudah lewat');
        var kj = ujKunciJadwal_(idM, smt, jenis);
        if (adaKunci[kj]) throw new Error('sudah terjadwal');
        var sesiNama = sesiUjian;
        if (!sesiNama) { var ses = ujtSesiDariTanggal_(cfg, tgl); sesiNama = ses ? ses.nama : ''; }
        if (!sesiNama) throw new Error('tanggal di luar kalender akademik');
        if (ujianSesi[idM + '|' + sesiNama]) throw new Error('sudah ada ujian "' + ujianSesi[idM + '|' + sesiNama] + '" pada ' + sesiNama);
        var mode = 'Kertas'; // v1.59.0: ujian APK lewat Masa Ujian
        var dur = parseInt(it.durasi, 10);
        if (!(dur >= UJ.DURASI_MIN && dur <= UJ.DURASI_MAKS)) dur = durasi;
        var judul = jenis === 'LAIN' ? judulLain + ' Semester ' + smt : ujJudul_(jenis, smt);
        var konten = mode === 'Kertas'
          ? 'Ujian dikerjakan di kertas, di kelas, bersama pengawas.\nJadwal: ' + ujTeksWaktu_(mulaiMs) + ', ' + dur + ' menit. Nilai minimal ' + kkm + '.'
          : 'Kerjakan semua soal dengan teliti. Pilih satu jawaban yang paling tepat. Soal dan urutan jawaban berbeda untuk setiap siswa.\nUjian dikerjakan di kelas melalui aplikasi, dengan kode akses dari pengawas.\nJadwal: ' + ujTeksWaktu_(mulaiMs) + ', ' + dur + ' menit. Nilai minimal ' + kkm + '.';
        var idU = ujBuatItemUjian_(idM, judul, konten, sesiNama, dur);
        ujTambah_('JADWAL', {
          'Kunci': kj, 'ID Mapel': idM, 'Semester': smt, 'Jenis': jenis, 'ID Ujian': idU, 'Tanggal': tgl, 'Jam Mulai': jam, 'Durasi Menit': dur, 'KKM': kkm,
          'Jumlah Soal': jumlah, 'Mudah': komp.mudah, 'Sedang': komp.sedang, 'Sulit': komp.sulit, 'Dibuat Oleh': p.nama, 'Dibuat Pada': ujNow_(),
          'Catatan': 'Ditetapkan terpusat', 'Mode': mode, 'Terpusat': 'Ya', 'Judul': jenis === 'LAIN' ? judul : ''
        });
        adaKunci[kj] = true;
        ujianSesi[idM + '|' + sesiNama] = judul;
        hasil.push({ idMapel: idM, nama: nm, idUjian: idU, teks: ujTeksWaktu_(mulaiMs), mode: mode });
      } catch (e) {
        lewat.push({ nama: nm, alasan: String((e && e.message) || e) });
      }
    });
  } finally {
    kunci.releaseLock();
  }
  try { catat_(p.peran, '', p.nama, 'Jadwal ujian terpusat', jenis + ' smt ' + smt + ': ' + hasil.length + ' ditetapkan, ' + lewat.length + ' dilewati', 'OK'); } catch (e) {}
  return { ditetapkan: hasil, lewat: lewat };
}

function ujtCariJadwal_(idUjian) {
  var j = ujJadwalDariUjian_(idUjian);
  if (!j) throw new Error('Jadwal ujian tidak ditemukan.');
  return j;
}

// Ubah tanggal/jam/durasi/mode sebelum ujian dimulai. d: {tanggal, jam, durasi, mode}
function waStafUjtUbah(token, idUjian, d) {
  var p = stafDariToken_(token);
  if (!ujtKelola_(p)) throw new Error('Hanya Admin, Kepala Sekolah, atau Koordinator Kurikulum.');
  d = d || {};
  var j = ujtCariJadwal_(idUjian);
  if (j.masa) throw new Error('Jadwal ini bagian dari Masa Ujian. Ubah lewat menu Masa Ujian.');
  if (Date.now() >= j.mulaiMs) throw new Error('Ujian sudah dimulai atau lewat; jadwal tidak dapat diubah. Gunakan susulan.');
  var tgl = ujTgl_(d.tanggal || j.tanggal), jam = ujJam_(d.jam || j.jam);
  var mulaiMs = ujMs_(tgl, jam);
  if (isNaN(mulaiMs) || mulaiMs < Date.now()) throw new Error('Tanggal dan jam baru harus di masa mendatang.');
  var dur = parseInt(d.durasi, 10) || j.durasi;
  if (!(dur >= UJ.DURASI_MIN && dur <= UJ.DURASI_MAKS)) throw new Error('Durasi ' + UJ.DURASI_MIN + ' sampai ' + UJ.DURASI_MAKS + ' menit.');
  // v1.59.0: boleh APK -> Kertas, tidak sebaliknya (ujian APK baru lewat Masa Ujian)
  var mode = d.mode === 'Kertas' ? 'Kertas' : j.mode;
  ujUbah_('JADWAL', j.baris, { 'Tanggal': tgl, 'Jam Mulai': jam, 'Durasi Menit': dur, 'Mode': mode, 'Diubah Oleh': p.nama, 'Diubah Pada': ujNow_() });
  try { catat_(p.peran, '', p.nama, 'Ubah jadwal ujian', j.jenis + ' ' + j.idMapel + ' -> ' + tgl + ' ' + jam + ' ' + mode, 'OK'); } catch (e) {}
  return { sukses: true, teks: ujTeksWaktu_(mulaiMs) };
}

// Batalkan jadwal sebelum dimulai (baris jadwal dikosongkan, item ujian di materi dinonaktifkan).
function waStafUjtHapus(token, idUjian) {
  var p = stafDariToken_(token);
  if (!ujtKelola_(p)) throw new Error('Hanya Admin, Kepala Sekolah, atau Koordinator Kurikulum.');
  var j = ujtCariJadwal_(idUjian);
  if (j.masa) throw new Error('Jadwal ini bagian dari Masa Ujian. Batalkan lewat menu Masa Ujian.');
  if (Date.now() >= j.mulaiMs) throw new Error('Ujian sudah dimulai atau lewat; tidak dapat dibatalkan.');
  if (ujBaca_('HASIL').some(function(h) { return String(h['ID Ujian']) === String(idUjian); })) throw new Error('Sudah ada hasil ujian; tidak dapat dibatalkan.');
  var kunci = kmKunciUnik_();
  kunci.waitLock(20000);
  try {
    ujUbah_('JADWAL', j.baris, { 'Kunci': '', 'Catatan': 'Dibatalkan ' + p.nama + ' ' + ujNow_() });
    var mm = kmMateri_(), v = mm.sheet.getDataRange().getValues();
    for (var i = 1; i < v.length; i++) {
      if (sTeks_(v[i][mm.c.id - 1]).trim() === String(idUjian)) { mm.sheet.getRange(i + 1, mm.c.status).setValue('Nonaktif'); break; }
    }
  } finally {
    kunci.releaseLock();
  }
  try { catat_(p.peran, '', p.nama, 'Batalkan jadwal ujian', j.jenis + ' ' + j.idMapel + ' ' + j.tanggal, 'OK'); } catch (e) {}
  return { sukses: true };
}

// Naskah ujian kertas (PDF) dari bank soal; satu versi per ujian. kunciJawaban = true -> lembar kunci untuk tutor.
function waStafUjtNaskah(token, idUjian, kunciJawaban) {
  var p = stafDariToken_(token);
  var j = ujtCariJadwal_(idUjian);
  if (!ujtKelola_(p) && ujMapelTutor_(p)[String(j.idMapel)] !== true) throw new Error('Anda tidak berhak mencetak naskah ujian ini.');
  var m = ujtPetaMapel_()[String(j.idMapel)] || { namaMapel: j.idMapel, namaRombel: '', idRombel: '' };
  var pool = ujPool_(j.idMapel, j.smt, j.jenisPool);
  if (!pool.sesi.length) throw new Error('Bank soal untuk ujian ini belum ada. Susun soal di tab Kurikulum dulu.');
  var maksOpsi = 5;
  try { maksOpsi = kurPaket_(getNamaRombel_(m.idRombel)) === 'A' ? 4 : 5; } catch (e) {}
  var soal = ujUndi_(pool.sesi, j.komposisi, maksOpsi, [j.idUjian, 'KERTAS'].join('|'));
  var e = function(s) { return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var lembaga = 'PKBM Tunas Harapan';
  try { lembaga = kNamaLembaga_(); } catch (e0) {}
  var judul = j.judulKhusus || ujJudul_(j.jenis, j.smt);
  var h = '<html><head><meta charset="utf-8"><style>@page{size:215mm 330mm;margin:14mm}body{font-family:Arial,Helvetica,sans-serif;font-size:11pt;color:#111;line-height:1.4}' +
    'td{vertical-align:top}.k{font-size:9.5pt;color:#333}</style></head><body>' +
    '<div style="text-align:center;font-weight:bold;font-size:13pt">' + e(lembaga) + '</div>' +
    '<div style="text-align:center;font-weight:bold;font-size:12pt;margin-top:2px">' + e(judul) + (kunciJawaban ? ' — KUNCI JAWABAN' : '') + '</div>' +
    '<table style="width:100%;border-collapse:collapse;margin:10px 0 12px;font-size:10.5pt"><tr>' +
    '<td style="border:1px solid #999;padding:5px 8px">Mata pelajaran: <b>' + e(m.namaMapel) + '</b></td>' +
    '<td style="border:1px solid #999;padding:5px 8px">Rombel: <b>' + e(m.namaRombel) + '</b></td></tr><tr>' +
    '<td style="border:1px solid #999;padding:5px 8px">Hari/tanggal: ' + e(ujTeksWaktu_(j.mulaiMs)) + '</td>' +
    '<td style="border:1px solid #999;padding:5px 8px">Waktu: ' + j.durasi + ' menit</td></tr>' +
    (kunciJawaban ? '' : '<tr><td style="border:1px solid #999;padding:8px">Nama: ....................................................</td><td style="border:1px solid #999;padding:8px">No. absen: ..........</td></tr>') +
    '</table>';
  if (kunciJawaban) {
    var baris = [];
    for (var i = 0; i < soal.length; i += 5) {
      baris.push('<tr>' + soal.slice(i, i + 5).map(function(s, k) { return '<td style="border:1px solid #999;padding:5px 10px">' + (i + k + 1) + '. <b>' + e(s.kunci) + '</b></td>'; }).join('') + '</tr>');
    }
    h += '<table style="border-collapse:collapse">' + baris.join('') + '</table>' +
      '<p class="k">Jumlah soal ' + soal.length + ', skor per soal ' + (Math.round(10000 / Math.max(1, soal.length)) / 100) + ' (total 100). KKM ' + j.kkm + '. Rahasia: hanya untuk tutor/pengawas.</p>';
  } else {
    h += '<div class="k" style="margin-bottom:8px">Petunjuk: pilih satu jawaban yang paling tepat dengan memberi tanda silang (X) pada huruf A, B, C' + (maksOpsi > 4 ? ', D, atau E' : ', atau D') + '.</div>';
    soal.forEach(function(s, i) {
      h += '<table style="width:100%;border-collapse:collapse;margin-bottom:7px;page-break-inside:avoid"><tr><td style="width:26px;font-weight:bold">' + (i + 1) + '.</td><td>' + e(s.pertanyaan) +
        '<br>' + Object.keys(s.opsi).map(function(hf) { return hf + '. ' + e(s.opsi[hf]); }).join('<br>') + '</td></tr></table>';
    });
  }
  h += '<div class="k" style="margin-top:12px;border-top:1px solid #bbb;padding-top:4px">© ' + e(lembaga) + '. Naskah ujian milik lembaga; tidak untuk disebarluaskan.</div></body></html>';
  var nama = (kunciJawaban ? 'Kunci ' : 'Naskah ') + judul + ' - ' + m.namaMapel + ' ' + m.namaRombel;
  nama = nama.replace(/[\\\/:*?"<>|#%]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  var blob = Utilities.newBlob(h, 'text/html', nama + '.html').getAs('application/pdf');
  return { b64: Utilities.base64Encode(blob.getBytes()), nama: nama + '.pdf', jumlahSoal: soal.length };
}
