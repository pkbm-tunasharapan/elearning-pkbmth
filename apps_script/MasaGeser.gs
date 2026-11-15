// ============================================================================
// v1.87.0: MASA UJIAN & KALENDER AKADEMIK
// 1) Tukar minggu ujian: masa UTS/UAS untuk SEMUA siswa yang dilaksanakan di minggu materi biasa menjadikan minggu itu
//    minggu ujian kalender. Sesi materi di antaranya bergeser satu minggu ke minggu ujian semula (mis. UAS di minggu
//    ke-17: materi Sesi 17 pindah ke minggu ke-18). Panjang semester tetap. Disimpan di Script Properties TA_TUKAR
//    (dicap tanggal mulai tahun ajaran) dan dipakai taRentang_. Dilepas saat penetapan masa dibatalkan.
//    Masa per rombel / unit / siswa tidak menggeser materi (kalender materi satu untuk semua).
// 2) Ujian sejenis dari kalender akademik (jadwal UTS/UAS per mapel di luar masa) DIGANTI masa: jadwal lama ditandai
//    "diganti" (Kunci + "|diganti|ID masa", Jenis + "-DIGANTI") dan item ujiannya dinonaktifkan, tanpa menghapus baris.
//    Nilai rapor otomatis memakai hasil ujian masa. Dipulihkan saat penetapan masa dibatalkan.
// 3) Tatap muka (TTM) peserta diliburkan pada hari-hari slot masa (dan sepanjang minggu ujian hasil tukar).
//    Peserta "siswa tertentu" tidak meliburkan TTM rombel. Dipakai jadBerlaku_ lewat agLiburPm_.
// ============================================================================
var MG = { PROP: 'TA_TUKAR', AKHIRAN: '|diganti|', JENIS_GANTI: '-DIGANTI' };

// ---------- 1) tukar minggu ujian ----------
function mgTukarSimpan_(fn) {
  var cfg = taBaca_(), pr = PropertiesService.getScriptProperties(), j = null;
  try { j = JSON.parse(pr.getProperty(MG.PROP) || 'null'); } catch (e) {}
  if (!j || j.mulai !== cfg.mulai || !j.smt) j = { mulai: cfg.mulai, smt: {} };
  fn(j.smt);
  pr.setProperty(MG.PROP, JSON.stringify(j));
  TA_MEMO_ = null;
}

// Rencana tukar untuk masa m. Hasil: null (tidak perlu), {alasan} (tidak bisa digeser), atau {smt, jenis, p, asal}.
function mgTukarRencana_(m, slot, cfg, nowMs) {
  if (m.jenis !== 'UTS' && m.jenis !== 'UAS') return null;
  var tgl = slot.map(function(s) { return s.tanggal; }).filter(String).sort();
  if (!tgl.length) return null;
  var f = taMingguFisik_(cfg, tgl[0]);
  if (!f || f.smt !== m.smt) return null;
  var e = m.jenis === 'UTS' ? cfg.uts : cfg.uas;
  var asal = taPosisi_(cfg, m.smt, e);
  if (f.p === asal) return null;   // sudah di minggu ujian
  if (m.peserta.mode !== 'semua') return { alasan: 'Materi online tidak digeser karena peserta masa bukan semua siswa; hanya tatap muka peserta yang diliburkan.' };
  var lain = (cfg.tukar && cfg.tukar[String(m.smt)] || {})[m.jenis];
  if (lain && lain.masa && lain.masa !== m.id) return { alasan: 'Minggu ' + m.jenis + ' Semester ' + m.smt + ' sudah dipindah oleh masa ujian lain (' + lain.masa + ').' };
  var nDi = 0;
  for (var n = 1; n <= cfg.sesiPerSemester; n++) if (taPosisi_(cfg, m.smt, n) === f.p) nDi = n;
  if (!nDi || taJenis_(cfg, nDi) !== 'Biasa') return { alasan: 'Minggu slot pertama adalah minggu ujian lain, sehingga materi tidak digeser.' };
  var awal = taTgl_(cfg.mulai), g = (m.smt - 1) * cfg.sesiPerSemester + Math.min(f.p, asal) - 1;
  var mulaiTerdampak = new Date(awal.getFullYear(), awal.getMonth(), awal.getDate() + g * TA.HARI_PER_SESI).getTime();
  if (mulaiTerdampak <= nowMs) return { alasan: 'Materi tidak digeser karena minggu yang terdampak sudah berjalan.' };
  return { smt: m.smt, jenis: m.jenis, p: f.p, asal: asal, sesi: nDi };
}

function mgTukarPasang_(m, r) {
  mgTukarSimpan_(function(smt) { var k = String(r.smt); smt[k] = smt[k] || {}; smt[k][r.jenis] = { p: r.p, masa: m.id }; });
}

function mgTukarLepas_(idMasa) {
  var ada = false;
  mgTukarSimpan_(function(smt) {
    Object.keys(smt).forEach(function(k) {
      Object.keys(smt[k] || {}).forEach(function(jn) { if (smt[k][jn] && smt[k][jn].masa === idMasa) { delete smt[k][jn]; ada = true; } });
    });
  });
  return ada;
}

function mgTeksTukar_(cfg, r) {
  var info = taInfo_(cfg, r.smt, r.sesi, Date.now());
  return 'Kalender digeser: minggu ' + r.p + ' Semester ' + r.smt + ' menjadi minggu ' + r.jenis + '; materi Sesi ' + r.sesi + ' pindah ke ' + info.rentang +
    (Math.abs(r.p - r.asal) > 1 ? ' (sesi di antaranya ikut bergeser satu minggu)' : '') + '.';
}

// ---------- 2) ganti ujian sejenis dari kalender akademik ----------
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

// ---------- 3) TTM libur pada hari ujian masa ----------
var MG_LIBUR_ = null;
function mgLiburData_() {
  if (MG_LIBUR_) return MG_LIBUR_;
  var out = [];
  try {
    var masa = muSemua_().filter(function(m) { return m.status === 'Ditetapkan' && m.peserta.mode !== 'siswa'; });
    if (masa.length) {
      var slotAll = muBaca_(MU.TAB_SLOT, MU.HDR_SLOT).map(muSlotObj_), cfg = taBaca_(), wb = null;
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
        var minggu = null, t = (cfg.tukar && cfg.tukar[String(m.smt)] || {})[m.jenis];
        if (t && t.masa === m.id) {
          var rg = taRentang_(cfg, m.smt, m.jenis === 'UTS' ? cfg.uts : cfg.uas);
          minggu = { dari: taIso_(rg.mulai), sampai: taIso_(rg.selesai) };
        }
        out.push({ id: m.id, nama: m.nama, slot: sl, rombel: rombel, unit: unit, minggu: minggu });
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
    var kena = !!(a.minggu && tanggal >= a.minggu.dari && tanggal <= a.minggu.sampai);
    if (!kena) kena = a.slot.some(function(s) { return s.tanggal === tanggal && muSlotKena_(s, x.idRombel); });
    if (kena) return { nama: 'Ujian ' + a.nama, masa: a.id };
  }
  return null;
}
