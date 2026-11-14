// ============================================================================
// MASA UJIAN PER UNIT (v1.83.0)
// Siswa beberapa unit belajar berada di rombel yang sama, sedangkan UTS/UAS hanya satu per mapel per semester
// (satu jadwal & satu item ujian -> rapor, nilai, kelayakan, susulan, remedial tetap satu).
// - Peserta masa ujian dapat dipilih per UNIT (boleh lebih dari satu unit).
// - Masa per unit yang ditetapkan untuk mapel yang SUDAH terjadwal oleh masa lain tidak membuat jadwal baru, melainkan
//   menambah "jadwal khusus unit" (tab JADWAL UNIT UJIAN) pada ujian yang sama: tanggal, jam, durasi, mode, masa, slot.
// - Di jalur ujian siswa (status, mulai, kirim), jadwal diganti dengan jadwal khusus unit siswa itu bila ada
//   (ujJadwalSiswa_), lalu gerbang peserta memeriksa unit siswa terhadap masa yang berlaku.
// - Membatalkan masa: jadwal khusus unit miliknya dihapus; jadwal dasar yang dipakai masa unit lain dipindahkan ke
//   jadwal khusus unit pertama (tidak dihapus).
// ============================================================================
var MUN = {
  TAB: 'JADWAL UNIT UJIAN',
  HDR: ['ID', 'ID UJIAN', 'MASA', 'SLOT', 'UNIT', 'TANGGAL', 'JAM', 'DURASI', 'MODE', 'DIBUAT OLEH', 'DIBUAT PADA']
};
var MUN_MEMO_ = null;

function munObj_(r) {
  return { id: r['ID'], idUjian: String(r['ID UJIAN'] || ''), masa: r['MASA'], slot: r['SLOT'], unit: String(r['UNIT'] || '').split(',').map(function(x) { return x.trim(); }).filter(String),
    tanggal: ujTgl_(r['TANGGAL']), jam: ujJam_(r['JAM']), durasi: parseInt(r['DURASI'], 10) || 0, mode: r['MODE'] === 'Kertas' ? 'Kertas' : 'APK', baris: r._baris };
}
function munSemua_() {
  if (MUN_MEMO_) return MUN_MEMO_;
  var out = [];
  try { out = muBaca_(MUN.TAB, MUN.HDR).map(munObj_); } catch (e) {}
  return (MUN_MEMO_ = out);
}
function munReset_() { MUN_MEMO_ = null; }

// Jadwal dasar + isian jadwal khusus unit (objek baru; jadwal dasar tidak diubah).
function munTerapkan_(j, w) {
  var o = {};
  Object.keys(j).forEach(function(k) { o[k] = j[k]; });
  o.tanggal = w.tanggal; o.jam = w.jam; o.durasi = w.durasi; o.mode = w.mode; o.masa = w.masa; o.slot = w.slot; o.jadwalUnit = w.id;
  o.mulaiMs = ujMs_(w.tanggal, w.jam);
  o.masukSampaiMs = o.mulaiMs + UJ.MASUK_MENIT * 60000;
  o.akhirMs = o.mulaiMs + w.durasi * 60000;
  return o;
}

// Unit efektif siswa (idRombel e-learning + nama). '' bila tidak terhubung ke Data Induk.
var MUN_UNIT_MEMO_ = {};
function munUnitSiswa_(idRombel, nama) {
  var k = String(idRombel) + '|' + normNama_(nama);
  if (MUN_UNIT_MEMO_[k] !== undefined) return MUN_UNIT_MEMO_[k];
  var u = '';
  try { u = ubUnitEf_(ksWb_({ nama: nama, idRombel: idRombel }).id, ubPetaSiswa_()); } catch (e) {}
  return (MUN_UNIT_MEMO_[k] = u);
}

// Jadwal yang berlaku untuk satu siswa: jadwal khusus unitnya bila ada, selain itu jadwal dasar.
function ujJadwalSiswa_(j, idRombel, nama) {
  if (!j || !j.idUjian) return j;
  var ws = munSemua_().filter(function(w) { return w.idUjian === String(j.idUjian); });
  if (!ws.length) return j;
  var u = munUnitSiswa_(idRombel, nama);
  var w = u ? ws.filter(function(x) { return x.unit.indexOf(u) >= 0; })[0] : null;
  return w ? munTerapkan_(j, w) : j;
}

// Jadwal milik satu masa: baris jadwal dasar bermasa itu + jadwal khusus unit masa itu (sudah diterapkan).
function muJadwalMasa_(idMasa) {
  var semua = ujJadwalSemua_(), per = {};
  semua.forEach(function(j) { per[String(j.idUjian)] = j; });
  var out = semua.filter(function(j) { return j.masa === String(idMasa); });
  munSemua_().forEach(function(w) {
    if (w.masa === String(idMasa) && per[w.idUjian]) out.push(munTerapkan_(per[w.idUjian], w));
  });
  return out;
}

// Peserta terpilih: null = semua siswa rombel peserta; selain itu {idWb: true}.
function muPilihWb_(m) {
  if (m.peserta.mode === 'siswa') { var o = {}; m.peserta.siswa.forEach(function(x) { o[String(x)] = true; }); return o; }
  if (m.peserta.mode === 'unit') {
    var lab = ubPetaSiswa_(), u = {}, p = {};
    (m.peserta.unit || []).forEach(function(x) { u[String(x)] = true; });
    keuWbSemua_().forEach(function(w) { if (w.aktif && u[ubUnitEf_(w.id, lab)]) p[w.id] = true; });
    return p;
  }
  return null;
}
// Sama, dikunci nama ternormalisasi (untuk data e-learning yang hanya punya nama).
function muPilihNama_(m) {
  var ids = muPilihWb_(m);
  if (!ids) return null;
  var o = {};
  keuWbSemua_().forEach(function(w) { if (ids[w.id]) o[normNama_(w.nama)] = true; });
  return o;
}

// Penetapan masa per unit untuk mapel yang sudah terjadwal: tambah jadwal khusus unit. Melempar galat bila bentrok.
function munTambah_(p, m, s, jb, modeJ) {
  var irisan = function(a, b) { return a.filter(function(x) { return b.indexOf(x) >= 0; }); };
  var nmU = {};
  try { ubUnit_().forEach(function(u) { nmU[u.id] = u.nama; }); } catch (e) {}
  var namaUnit = function(l) { return l.map(function(x) { return nmU[x] || x; }).join(', '); };
  if (jb.masa && jb.masa !== m.id) {
    var mb = null;
    try { mb = muCari_(jb.masa); } catch (e1) {}
    if (mb && mb.peserta.mode === 'unit') {
      var b1 = irisan(mb.peserta.unit || [], m.peserta.unit);
      if (b1.length) throw new Error('unit ' + namaUnit(b1) + ' sudah dijadwalkan di ' + mb.nama);
    }
  }
  munSemua_().forEach(function(w) {
    if (w.idUjian !== String(jb.idUjian)) return;
    var b2 = irisan(w.unit, m.peserta.unit);
    if (b2.length) throw new Error('unit ' + namaUnit(b2) + ' sudah punya jadwal khusus untuk ujian ini');
  });
  muTab_(MUN.TAB, MUN.HDR).appendRow(['JU-' + absId_().toUpperCase(), pwTeks_(jb.idUjian), m.id, s.id, m.peserta.unit.join(','), pwTeks_(s.tanggal), pwTeks_(s.jam), s.durasi, modeJ, p.nama, pwTeks_(ujNow_())]);
  munReset_();
}

// Aktivitas siswa (percobaan & hasil) untuk ujian-ujian ini: [{idUjian, idRombel, nama}]
function munAktivitas_(ids) {
  var out = [];
  try {
    var v = getSheetData(CONFIG.SHEETS.PERCOBAAN_UJIAN), c = sesiCols_();
    for (var i = 1; i < v.length; i++) if (ids[String(v[i][c.idUjian - 1])]) out.push({ idUjian: String(v[i][c.idUjian - 1]), idRombel: String(v[i][c.idRombel - 1]), nama: String(v[i][c.nama - 1]) });
  } catch (e) {}
  ujBaca_('HASIL').forEach(function(h) { if (ids[String(h['ID Ujian'])]) out.push({ idUjian: String(h['ID Ujian']), idRombel: String(h['ID Rombel']), nama: String(h['Nama Siswa']) }); });
  return out;
}

// Batalkan masa: rencana (murni, diuji). jad: jadwal dasar bermasa ini; win: semua jadwal khusus unit; akt: aktivitas;
// unitSiswa(idRombel, nama) -> unit. Hasil: {hapusJadwal:[jadwal], pindah:[{j, w}], hapusWin:[w], mulai: bool}
function munRencanaBatal_(m, jad, win, akt, unitSiswa) {
  var milik = win.filter(function(w) { return w.masa === m.id; });
  var lain = {};
  win.forEach(function(w) { if (w.masa !== m.id) (lain[w.idUjian] = lain[w.idUjian] || []).push(w); });
  var out = { hapusJadwal: [], pindah: [], hapusWin: milik.slice(), mulai: false };
  var unitLain = function(idU) { var u = []; (lain[idU] || []).forEach(function(w) { u = u.concat(w.unit); }); return u; };
  akt.forEach(function(a) {
    var isMilikWin = milik.filter(function(w) { return w.idUjian === a.idUjian; });
    var isDasar = jad.some(function(j) { return String(j.idUjian) === a.idUjian; });
    if (!isMilikWin.length && !isDasar) return;
    var u = unitSiswa(a.idRombel, a.nama);
    if (isMilikWin.some(function(w) { return w.unit.indexOf(u) >= 0; })) { out.mulai = true; return; }
    if (isDasar && unitLain(a.idUjian).indexOf(u) < 0) out.mulai = true;
  });
  jad.forEach(function(j) {
    var l = lain[String(j.idUjian)];
    if (l && l.length) out.pindah.push({ j: j, w: l[0] });
    else out.hapusJadwal.push(j);
  });
  return out;
}

// ============================================================================
// v1.83.2: PERINGATAN SLOT TERLALU RAPAT (tidak memblokir)
// Untuk tiap rombel, slot berikutnya sebaiknya mulai >= jam mulai slot sebelumnya + durasi + batas masuk (15 menit),
// supaya siswa yang mulai di akhir batas masuk tetap sempat masuk ujian berikutnya.
// slot: [{tanggal, jam, durasi, kode, namaMapel, rombel[]}]; petaKode: {kode: [idRombel]}; nmRombel: {idRombel: nama}
// ============================================================================
function muSlotRapat_(slot, petaKode, nmRombel) {
  var menit = function(j) { var m = /^(\d{1,2}):(\d{2})/.exec(String(j || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  var jeda = UJ.MASUK_MENIT, per = {};
  slot.forEach(function(s) {
    var ids = s.rombel && s.rombel.length ? s.rombel : (petaKode[s.kode] || []);
    ids.forEach(function(r) { (per[r + '|' + s.tanggal] = per[r + '|' + s.tanggal] || []).push(s); });
  });
  var out = [];
  Object.keys(per).sort().forEach(function(k) {
    var l = per[k].filter(function(s) { return menit(s.jam) !== null; }).sort(function(a, b) { return menit(a.jam) - menit(b.jam); });
    for (var i = 1; i < l.length; i++) {
      var a = l[i - 1], b = l[i], aman = menit(a.jam) + (Number(a.durasi) || 0) + jeda;
      if (menit(b.jam) < aman) {
        var r = k.split('|')[0], hh = ('0' + Math.floor(aman / 60)).slice(-2) + ':' + ('0' + (aman % 60)).slice(-2);
        out.push({ rombel: nmRombel[r] || r, tanggal: a.tanggal, pesan: (nmRombel[r] || r) + ' ' + a.tanggal + ': ' + (a.namaMapel || a.kode) + ' ' + a.jam + ' (' + a.durasi + ' mnt) lalu ' +
          (b.namaMapel || b.kode) + ' ' + b.jam + ' — sebaiknya mulai paling cepat ' + hh + ' (selesai + batas masuk ' + jeda + ' menit).' });
      }
    }
  });
  return out;
}
function muPetaKode_(mapel) {
  var pk = {}, nm = {};
  (mapel || []).forEach(function(x) { pk[x.kode] = (x.rombelId || []).map(function(o) { nm[o.id] = o.nama; return o.id; }); });
  return { pk: pk, nm: nm };
}
