// ============================================================================
// v1.87.0: MASA UJIAN MENGGANTIKAN KEGIATAN YANG BERBENTURAN (tanpa menggeser jadwal lain)
// 1) Tatap muka (TTM) yang berbenturan dengan hari ujian masa otomatis ditiadakan (diganti ujian masa).
//    Peserta "siswa tertentu" tidak meniadakan TTM rombel. Dipakai jadBerlaku_ lewat agLiburPm_.
// 2) Slot ujian ONLINE yang jatuh di minggu sesi materi biasa: sesi itu dinonaktifkan untuk mapel peserta
//    (materi, diskusi, dan absensi sesi), dan kehadiran sesi itu dihitung dari ikut ujian masa.
//    Hanya bila seluruh siswa kelas itu peserta masa dan sesinya belum dimulai. Item yang dinonaktifkan dicatat
//    di kolom SESI NONAKTIF masa ujian (beserta status semula) dan dipulihkan saat penetapan dibatalkan.
// 3) Ujian sejenis dari kalender akademik (jadwal UTS/UAS per mapel di luar masa) DIGANTI masa: jadwal lama ditandai
//    "diganti" (Kunci + "|diganti|ID masa", Jenis + "-DIGANTI") dan item ujiannya dinonaktifkan, tanpa menghapus baris.
//    Nilai rapor otomatis memakai hasil ujian masa. Dipulihkan saat penetapan dibatalkan.
// ============================================================================
var MG = { AKHIRAN: '|diganti|', JENIS_GANTI: '-DIGANTI', KOLOM_SESI: 'SESI NONAKTIF' };

// ---------- 2) sesi materi yang berbenturan dengan ujian online ----------
// Hasil: { target: [{idMapel, smt, n, sesi}], info: [teks] }
function mgSesiRencana_(m, slot, kelas, cfg, nowMs) {
  var target = [], info = [], ada = {}, campur = {}, berjalan = {};
  if (m.peserta.mode === 'siswa') return { target: target, info: info };
  var ikut = muPilihWb_(m), wbRombel = null;
  if (ikut) {   // peserta unit: kelas hanya ikut bila semua siswa aktifnya peserta
    wbRombel = {};
    keuWbSemua_().forEach(function(w) { if (w.aktif) (wbRombel[String(w.idRombel)] = wbRombel[String(w.idRombel)] || []).push(w.id); });
  }
  slot.forEach(function(s) {
    if (muModeSlot_(m, s) !== 'Online' || !s.tanggal) return;
    var ses = ujtSesiDariTanggal_(cfg, s.tanggal);
    if (!ses || taJenis_(cfg, ses.n) !== 'Biasa') return;
    kelas.filter(function(k) { return k.kode === s.kode && muSlotKena_(s, k.idRombelSim); }).forEach(function(k) {
      var kk = k.idMapel + '|' + ses.smt + '|' + ses.n;
      if (ada[kk]) return;
      if (ikut && (wbRombel[String(k.idRombelSim)] || []).some(function(id) { return !ikut[id]; })) { campur[k.idRombelSim] = true; return; }
      if (taInfo_(cfg, ses.smt, ses.n, nowMs).mulaiMs <= nowMs) { berjalan[ses.nama] = true; return; }
      ada[kk] = true;
      target.push({ idMapel: k.idMapel, smt: ses.smt, n: ses.n, sesi: ses.nama });
    });
  });
  if (Object.keys(campur).length) info.push('Sesi materi tidak dinonaktifkan untuk ' + Object.keys(campur).length + ' rombel yang juga berisi siswa di luar peserta masa ini.');
  if (Object.keys(berjalan).length) info.push('Sesi yang sudah dimulai tidak dinonaktifkan: ' + Object.keys(berjalan).join(', ') + '.');
  return { target: target, info: info };
}

// Nonaktifkan item (selain ujian) pada sesi target. Hasil disimpan ke kolom SESI NONAKTIF: [{idMapel, smt, n, item:[[id, status semula]]}]
function mgSesiNonaktifkan_(m, target) {
  if (!target.length) return [];
  var idx = {};
  target.forEach(function(t) { t.item = []; idx[t.idMapel + '|' + t.sesi] = t; });
  var mm = kmMateri_(), vm = mm.sheet.getDataRange().getValues();
  for (var r = 1; r < vm.length; r++) {
    var t = idx[sTeks_(vm[r][mm.c.idMapel - 1]).trim() + '|' + sTeks_(vm[r][mm.c.sesi - 1]).trim()];
    if (!t) continue;
    var jn = sTeks_(vm[r][mm.c.jenis - 1]).trim(), st = sTeks_(vm[r][mm.c.status - 1]).trim();
    if (jn === 'Ujian' || st === 'Nonaktif') continue;
    t.item.push([sTeks_(vm[r][mm.c.id - 1]).trim(), st]);
    mm.sheet.getRange(r + 1, mm.c.status).setValue('Nonaktif');
  }
  var simpan = target.map(function(t) { return { idMapel: t.idMapel, smt: t.smt, n: t.n, item: t.item }; });
  mgTulisKolom_(m, JSON.stringify(simpan));
  MG_TUTUP_ = null;
  return simpan;
}

function mgSesiPulihkan_(m) {
  var d = mgBacaSesi_(m), n = 0;
  if (!d.length) return 0;
  var asal = {};
  d.forEach(function(t) { (t.item || []).forEach(function(x) { asal[x[0]] = x[1] || 'Aktif'; }); });
  var mm = kmMateri_(), vm = mm.sheet.getDataRange().getValues();
  for (var r = 1; r < vm.length; r++) {
    var id = sTeks_(vm[r][mm.c.id - 1]).trim();
    if (!asal.hasOwnProperty(id) || sTeks_(vm[r][mm.c.status - 1]).trim() !== 'Nonaktif') continue;
    mm.sheet.getRange(r + 1, mm.c.status).setValue(asal[id]);
    n++;
  }
  mgTulisKolom_(m, '');
  MG_TUTUP_ = null;
  return n;
}

function mgTulisKolom_(m, nilai) {
  var sh = muTab_(MU.TAB, MU.HDR);
  sh.getRange(m.baris, MU.HDR.indexOf(MG.KOLOM_SESI) + 1).setNumberFormat('@').setValue(nilai);
}

function mgBacaSesi_(m) {
  try { var d = JSON.parse(m.sesiNonaktif || '[]'); return d instanceof Array ? d : []; } catch (e) { return []; }
}

// Sesi yang ditutup masa ujian: { "idMapel|smt|n": idMasa }
var MG_TUTUP_ = null;
function mgSesiTutup_() {
  if (MG_TUTUP_) return MG_TUTUP_;
  var out = {};
  try {
    muSemua_().forEach(function(m) {
      if (m.status !== 'Ditetapkan') return;
      mgBacaSesi_(m).forEach(function(t) { out[t.idMapel + '|' + t.smt + '|' + t.n] = m.id; });
    });
  } catch (e) {}
  return (MG_TUTUP_ = out);
}

// Kehadiran online dari ujian masa: siswa yang punya hasil ujian masa pada sesi yang ditutup dihitung hadir di sesi itu.
// Hasil: [{ idMapel, kunciNama, smt, n }]
function mgHadirUjian_(smt) {
  var tutup = mgSesiTutup_(), keys = Object.keys(tutup), out = [];
  if (!keys.length) return out;
  var perMapel = {};   // idMapel|idMasa -> [smt|n]
  keys.forEach(function(k) {
    var p = k.split('|');
    if (Number(p[1]) !== smt) return;
    var mk = p[0] + '|' + tutup[k];
    (perMapel[mk] = perMapel[mk] || []).push(Number(p[2]));
  });
  if (!Object.keys(perMapel).length) return out;
  var uj = {}, perId = {};   // idUjian -> idMapel|idMasa
  ujJadwalSemua_().forEach(function(j) {
    perId[String(j.idUjian)] = j;
    if (j.masa && perMapel[j.idMapel + '|' + j.masa]) (uj[String(j.idUjian)] = uj[String(j.idUjian)] || []).push(j.idMapel + '|' + j.masa);
  });
  munSemua_().forEach(function(w) {   // jadwal khusus unit: ujian yang sama, masa unit lain
    var j = perId[String(w.idUjian)];
    if (j && perMapel[j.idMapel + '|' + w.masa]) (uj[String(j.idUjian)] = uj[String(j.idUjian)] || []).push(j.idMapel + '|' + w.masa);
  });
  var sudah = {};
  ujBaca_('HASIL').forEach(function(h) {
    var kn = normNama_(h['Nama Siswa']);
    (uj[String(h['ID Ujian'])] || []).forEach(function(mk) {
      var idMapel = mk.split('|')[0];
      perMapel[mk].forEach(function(n) {
        var k = idMapel + '|' + kn + '|' + n;
        if (sudah[k]) return;
        sudah[k] = true;
        out.push({ idMapel: idMapel, kunciNama: kn, smt: smt, n: n });
      });
    });
  });
  return out;
}

// ---------- 3) ganti ujian sejenis dari kalender akademik ----------
function mgBolehGanti_(lama, nowMs) {
  if (!lama || lama.masa) return false;
  return !(lama.mulaiMs <= nowMs && nowMs <= lama.akhirMs + UJ.GRACE_MENIT * 60000);   // jangan ganti yang sedang berlangsung
}

function mgGantiLama_(m, lama) {
  ujUbah_('JADWAL', lama.baris, {
    'Kunci': lama.kunci + MG.AKHIRAN + m.id, 'Jenis': lama.jenis + MG.JENIS_GANTI,
    'Catatan': ('Diganti masa ujian ' + m.id + ' (' + m.nama + ') ' + ujNow_() + '. ' + (lama.catatan || '')).slice(0, 500)
  });
  mgStatusItem_(lama.idUjian, 'Nonaktif');
}

// Saat masa dibatalkan: pulihkan jadwal lama yang diganti masa ini (bila kuncinya tidak dipakai jadwal lain).
function mgPulihkanLama_(idMasa) {
  var semua = ujJadwalSemua_(), dipakai = {}, n = 0;
  semua.forEach(function(j) { dipakai[j.kunci] = true; });
  semua.forEach(function(j) {
    var a = String(j.kunci || ''), akhir = MG.AKHIRAN + idMasa;
    if (a.slice(-akhir.length) !== akhir) return;
    var asli = a.slice(0, -akhir.length);
    if (dipakai[asli]) return;
    ujUbah_('JADWAL', j.baris, { 'Kunci': asli, 'Jenis': String(j.jenis).replace(MG.JENIS_GANTI, ''), 'Catatan': ('Dipulihkan (masa ' + idMasa + ' dibatalkan) ' + ujNow_()).slice(0, 500) });
    mgStatusItem_(j.idUjian, 'Aktif');
    dipakai[asli] = true;
    n++;
  });
  return n;
}

function mgStatusItem_(idUjian, status) {
  if (!idUjian) return;
  var mm = kmMateri_(), vm = mm.sheet.getDataRange().getValues();
  for (var r = 1; r < vm.length; r++) {
    if (sTeks_(vm[r][mm.c.id - 1]).trim() === String(idUjian)) { mm.sheet.getRange(r + 1, mm.c.status).setValue(status); return; }
  }
}

// ---------- 1) TTM ditiadakan pada hari ujian masa ----------
var MG_LIBUR_ = null;
function mgLiburData_() {
  if (MG_LIBUR_) return MG_LIBUR_;
  var out = [];
  try {
    var masa = muSemua_().filter(function(m) { return m.status === 'Ditetapkan' && m.peserta.mode !== 'siswa'; });
    if (masa.length) {
      var slotAll = muBaca_(MU.TAB_SLOT, MU.HDR_SLOT).map(muSlotObj_), wb = null;
      masa.forEach(function(m) {
        var sl = slotAll.filter(function(s) { return s.masa === m.id && s.tanggal; });
        if (!sl.length) return;
        var rombel = null, unit = null;
        if (m.peserta.mode === 'rombel') { rombel = {}; m.peserta.rombel.forEach(function(r) { rombel[String(r)] = true; }); }
        if (m.peserta.mode === 'unit') {
          rombel = {}; unit = m.peserta.unit.map(String);
          var ids = muPilihWb_(m) || {};
          wb = wb || keuWbSemua_();
          wb.forEach(function(w) { if (ids[w.id]) rombel[String(w.idRombel)] = true; });
        }
        out.push({ id: m.id, nama: m.nama, tempat: muTeksTempat_(m, true), slot: sl, rombel: rombel, unit: unit });
      });
    }
  } catch (e) {}
  return (MG_LIBUR_ = out);
}

// x: pemetaan tatap muka {idRombel (SIM), unit}. Hasil: {nama, masa} bila ditiadakan karena masa ujian, selain itu null.
function mgLiburPm_(x, tanggal) {
  var d = mgLiburData_();
  for (var i = 0; i < d.length; i++) {
    var a = d[i];
    if (a.rombel && !a.rombel[String(x.idRombel)]) continue;
    if (a.unit && x.unit && !String(x.unit).split(',').some(function(u) { return a.unit.indexOf(u.trim()) >= 0; })) continue;
    if (a.slot.some(function(s) { return s.tanggal === tanggal && muSlotKena_(s, x.idRombel); })) {
      return { nama: 'diganti ujian ' + a.nama + (a.tempat ? ' (' + a.tempat + ')' : ''), masa: a.id };
    }
  }
  return null;
}
