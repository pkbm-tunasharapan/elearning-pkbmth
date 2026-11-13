// ============================================================================
// IMPOR JADWAL MINGGUAN DARI EXCEL (v1.70.5)
// Admin / Kepala Sekolah mengunduh templat .xlsx, mengisi satu baris per jadwal (rombel, mapel, tutor, hari, sesi,
// tanggal mulai/selesai, unit), lalu mengunggahnya: pratinjau -> simpan semua.
// - Kolom ROMBEL, MAPEL, TUTOR, HARI, SESI (durasi = slot sesi yang sama dengan form jadwal) dan UNIT punya daftar pilihan
//   (dropdown) dari lembar PILIHAN, sehingga tidak perlu mengetik ulang.
// - Aturan sama dengan form: mapel harus ada di rombel itu, tutor aktif, cek bentrok tutor & rombel (termasuk antarbaris
//   di berkas yang sama). Baris bermasalah tidak disimpan dan ditampilkan alasannya.
// ============================================================================
var JIM = { LEMBAR: 'JADWAL', LEMBAR_REF: 'PILIHAN', WARNA: 'FF5B21B6', BARIS_KOSONG: 300, CACHE_DETIK: 1200,
  KOLOM: ['NO', 'ROMBEL', 'MAPEL', 'TUTOR', 'HARI', 'SESI', 'TANGGAL MULAI', 'TANGGAL SELESAI', 'UNIT', 'MINGGU KE'],
  MINGGU: ['Setiap minggu', '1,3', '2,4', '1', '2', '3', '4'] };   // v1.76.0
var JIM_HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

function jimWajib_(token) {
  var p = stafDariToken_(token);
  if (!jadPeran_(p).kelola) throw new Error('Impor jadwal hanya oleh Admin atau Kepala Sekolah.');
  return p;
}
function jimSlotLabel_(s) { return s.nama + ' (' + s.mulai + '–' + s.selesai + ')'; }
function jimMapelLabel_(kode, nama) { return kode + ' - ' + nama; }
// v1.76.2: jenjang (A/B/C) sebuah kelas dari PAKET/program, atau dari nama rombel (A4, B9, C12).
function jimJenjang_(k) {
  var m = /([ABC])\s*$/i.exec(String(k.program || '').trim()) || /(?:^|[^A-Z])([ABC])\s*\d/i.exec(String(k.namaRombel || ''));
  return m ? m[1].toUpperCase() : '';
}
function jimLabelPaket_(j) { return 'Seluruh Paket ' + j; }

// Data pilihan (dipakai templat & pratinjau).
function jimPilihan_() {
  var kelas = absKelas_(''), rombel = {}, mapel = {};
  kelas.forEach(function(k) { rombel[k.idRombel] = k.namaRombel; mapel[k.kodeMapel] = k.namaMapel; });
  var pt = absPetaTutor_(), tutor = Object.keys(pt).map(function(k) { return pt[k]; }).filter(function(t) { return t.aktif; });
  var hitung = {};
  tutor.forEach(function(t) { hitung[t.nama.toLowerCase()] = (hitung[t.nama.toLowerCase()] || 0) + 1; });
  var unit = [];
  try { unit = ubUnit_().filter(function(u) { return u.aktif; }); } catch (e) {}
  return {
    kelas: kelas,
    rombel: Object.keys(rombel).map(function(id) { return { id: id, nama: rombel[id] }; }).sort(function(a, b) { return a.nama.localeCompare(b.nama, 'id', { numeric: true }); }),
    // v1.76.2: pilihan rombel menyeluruh per jenjang (Seluruh Paket A/B/C)
    paket: (function() { var j = {}; kelas.forEach(function(k) { var x = jimJenjang_(k); if (x) j[x] = true; }); return Object.keys(j).sort(); })(),
    mapel: Object.keys(mapel).map(function(k) { return { kode: k, nama: mapel[k], label: jimMapelLabel_(k, mapel[k]) }; }).sort(function(a, b) { return a.label.localeCompare(b.label); }),
    // nama tutor ganda diberi ID supaya tidak tertukar
    tutor: tutor.map(function(t) { return { id: t.id, nama: t.nama, label: hitung[t.nama.toLowerCase()] > 1 ? t.nama + ' [' + t.id + ']' : t.nama }; }).sort(function(a, b) { return a.label.localeCompare(b.label); }),
    slot: jadAturan_().slot.map(function(s) { return { id: s.id, nama: s.nama, mulai: s.mulai, selesai: s.selesai, label: jimSlotLabel_(s) }; }),
    unit: unit.map(function(u) { return { id: u.id, nama: u.nama }; })
  };
}

// Daftar pilihan (dropdown) untuk kolom B..I dari lembar PILIHAN.
function jimValidasi_(n) {
  var akhir = 8 + JIM.BARIS_KOSONG, kol = { B: 'A', C: 'B', D: 'C', E: 'D', F: 'E', I: 'F', J: 'G' }, x = [];
  Object.keys(kol).forEach(function(c) {
    var ref = kol[c];
    x.push('<dataValidation type="list" allowBlank="1" showErrorMessage="' + (c === 'I' ? '0' : '1') + '" sqref="' + c + '9:' + c + akhir + '">' +
      '<formula1>' + JIM.LEMBAR_REF + '!$' + ref + '$2:$' + ref + '$' + (Math.max(2, n[ref] + 1)) + '</formula1></dataValidation>');
  });
  return '<dataValidations count="' + x.length + '">' + x.join('') + '</dataValidations>';
}

function waStafPemetaanTemplat(token) {
  var p = jimWajib_(token), d = jimPilihan_();
  var isiJudul = [{ v: 'TEMPLAT JADWAL MINGGUAN TATAP MUKA', s: 1 }];
  for (var i = 1; i < JIM.KOLOM.length; i++) isiJudul.push({ v: '', s: 1 });
  var b = [
    isiJudul,
    [{ v: 'Diunduh', s: 2 }, { v: absWaktu_() + ' oleh ' + p.nama }],
    [{ v: 'Sesi (durasi)', s: 2 }, { v: d.slot.map(function(s) { return s.label; }).join(', ') }],
    [{ v: 'Satu baris = satu jadwal (satu rombel, satu mapel). ROMBEL "Seluruh Paket A/B/C" = semua rombel jenjang itu yang punya mapel tersebut (kelas gabungan). Pilih isian dari daftar (ketuk sel kuning).', s: 6 }],
    [{ v: 'TANGGAL ditulis TTTT-BB-HH (mis. 2026-11-16). TANGGAL MULAI kosong = mulai hari ini (juga untuk jadwal selang-seling). TANGGAL SELESAI kosong = berlaku terus. UNIT kosong = seluruh siswa rombel.', s: 6 }],
    [{ v: 'MINGGU KE: kosong / "Setiap minggu" = tiap pekan; "1,3" = minggu ke-1 & 3 bulan itu; "2,4" = minggu ke-2 & 4. Minggu ke-5 (tgl 29–31) ikut 1,3. Jangan ubah baris 1–8 atau nama lembar.', s: 6 }],
    [],
    JIM.KOLOM.map(function(k) { return { v: k, s: 3 }; })
  ];
  for (var n = 1; n <= JIM.BARIS_KOSONG; n++) {
    b.push([{ v: n, n: true, s: 4 }, { v: '', s: 5 }, { v: '', s: 5 }, { v: '', s: 5 }, { v: '', s: 5 }, { v: '', s: 5 }, { v: '', s: 5 }, { v: '', s: 5 }, { v: '', s: 5 }, { v: '', s: 5 }]);
  }
  var kol = [(d.paket || []).map(jimLabelPaket_).concat(d.rombel.map(function(x) { return x.nama; })), d.mapel.map(function(x) { return x.label; }), d.tutor.map(function(x) { return x.label; }),
    JIM_HARI.slice(), d.slot.map(function(x) { return x.label; }), d.unit.map(function(x) { return x.nama; }), JIM.MINGGU.slice()];
  var ref = [['ROMBEL', 'MAPEL', 'TUTOR', 'HARI', 'SESI', 'UNIT', 'MINGGU KE'].map(function(k) { return { v: k, s: 3 }; })];
  var maks = Math.max.apply(null, kol.map(function(c) { return c.length; }));
  for (var j = 0; j < maks; j++) ref.push(kol.map(function(c) { return { v: c[j] || '', s: 4 }; }));
  var jml = { A: kol[0].length, B: kol[1].length, C: kol[2].length, D: kol[3].length, E: kol[4].length, F: kol[5].length, G: kol[6].length };
  var xmlJadwal = nxlSheetXml_(b, [5, 14, 30, 26, 10, 22, 15, 15, 24, 15], ['A1:J1']).replace('</worksheet>', jimValidasi_(jml) + '</worksheet>');
  var lembar = [
    { nama: JIM.LEMBAR, xml: xmlJadwal },
    { nama: JIM.LEMBAR_REF, xml: nxlSheetXml_(ref, [16, 34, 30, 12, 24, 24, 15], []) }
  ];
  var nama = 'Templat_Jadwal_' + absHariIni_() + '.xlsx';
  var blob = oflZip_(lembar, nxlStylesXml_(JIM.WARNA), nama);
  return { nama: nama, b64: Utilities.base64Encode(blob.getBytes()) };
}

function jimTgl_(v) {
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (!s) return '';
  var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(s);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  if (/^\d{5}(\.\d+)?$/.test(s)) {   // nomor seri tanggal Excel
    var d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000);
    return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
  }
  return null;
}

// Rencana impor (murni, diuji). baris: [[sel...]]; d: jimPilihan_(); ada: pemetaan yang sudah ada; hariIni: 'yyyy-MM-dd'
function jimRencana_(baris, d, ada, hariIni) {
  var h = -1, kol = {};
  for (var i = 0; i < Math.min(baris.length, 20) && h < 0; i++) {
    var r = (baris[i] || []).map(function(x) { return String(x || '').trim().toUpperCase(); });
    if (r.indexOf('ROMBEL') >= 0 && r.indexOf('MAPEL') >= 0 && r.indexOf('HARI') >= 0) { h = i; r.forEach(function(k, j) { if (k) kol[k] = j; }); }
  }
  if (h < 0) throw new Error('Baris judul kolom (ROMBEL, MAPEL, HARI, ...) tidak ditemukan. Pakai templat dari aplikasi.');
  var norm = function(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); };
  var pRombel = {}, pMapel = {}, pTutor = {}, pSlot = {}, pUnit = {}, pHari = {};
  d.rombel.forEach(function(x) { pRombel[norm(x.nama)] = x.id; pRombel[norm(x.id)] = x.id; });
  // nama yang dipakai lebih dari satu (mapel / tutor) tidak boleh ditebak: null = ambigu
  var pasang = function(peta, k, v) { k = norm(k); if (peta[k] === undefined) peta[k] = v; else if (peta[k] !== v) peta[k] = null; };
  d.mapel.forEach(function(x) { pMapel[norm(x.label)] = x.kode; pMapel[norm(x.kode)] = x.kode; pasang(pMapel, x.nama, x.kode); });
  d.tutor.forEach(function(x) { pTutor[norm(x.label)] = x.id; pTutor[norm(x.id)] = x.id; pasang(pTutor, x.nama, x.id); });
  d.slot.forEach(function(x) { pSlot[norm(x.label)] = x; pSlot[norm(x.nama)] = x; pSlot[norm(x.id)] = x; });
  d.unit.forEach(function(x) { pUnit[norm(x.nama)] = x.id; pUnit[norm(x.id)] = x.id; });
  JIM_HARI.forEach(function(x) { pHari[norm(x)] = x; });
  pHari['jum\'at'] = 'Jumat';
  var sel = function(r, k) { return kol[k] === undefined ? '' : String(r[kol[k]] === undefined || r[kol[k]] === null ? '' : r[kol[k]]).trim(); };
  var out = { item: [], galat: [], kosong: 0 }, rencana = ada.slice();
  for (var n = h + 1; n < baris.length; n++) {
    var r2 = baris[n] || [], no = n + 1;
    var tR = sel(r2, 'ROMBEL'), tM = sel(r2, 'MAPEL'), tT = sel(r2, 'TUTOR'), tH = sel(r2, 'HARI'), tS = sel(r2, 'SESI');
    var tD = sel(r2, 'TANGGAL MULAI'), tE = sel(r2, 'TANGGAL SELESAI'), tU = sel(r2, 'UNIT'), tW = sel(r2, 'MINGGU KE');
    if (!tR && !tM && !tT && !tH && !tS && !tD && !tE && !tU) { out.kosong++; continue; }
    var galat = function(a) { out.galat.push({ baris: no, isi: [tR, tM, tH, tS].filter(String).join(' · '), alasan: a }); };
    var idR = pRombel[norm(tR)], km = pMapel[norm(tM)] || (/^([A-Za-z0-9]+)\s*-/.exec(tM) ? pMapel[norm(/^([A-Za-z0-9]+)\s*-/.exec(tM)[1])] : null);
    var pkt = /^(?:seluruh|semua)\s+paket\s+([abc])$/i.exec(norm(tR));   // v1.76.2: rombel menyeluruh
    if (!idR && !pkt) { galat('rombel "' + tR + '" tidak dikenal'); continue; }
    if (!km) { galat('mapel "' + tM + '" tidak dikenal'); continue; }
    var target = [];
    if (pkt) {
      var adaR = {};
      d.kelas.forEach(function(x) { if (x.kodeMapel === km && jimJenjang_(x) === pkt[1].toUpperCase() && !adaR[x.idRombel]) { adaR[x.idRombel] = true; target.push(x); } });
      target.sort(function(a, b) { return String(a.namaRombel).localeCompare(String(b.namaRombel), 'id', { numeric: true }); });
      if (!target.length) { galat('tidak ada rombel Paket ' + pkt[1].toUpperCase() + ' yang punya mapel ' + km); continue; }
    } else {
      var k0 = absKelasCek_(d.kelas, idR, km);
      if (!k0) { galat('mapel ' + km + ' tidak ada di rombel ' + tR); continue; }
      target = [k0];
    }
    var idT0 = tT ? pTutor[norm(tT)] || (/\[([^\]]+)\]/.exec(tT) ? pTutor[norm(/\[([^\]]+)\]/.exec(tT)[1])] : null) : '';
    if (tT && !idT0) { galat('tutor "' + tT + '" tidak dikenal / tidak aktif / nama ganda (pilih dari daftar)'); continue; }
    var hari = pHari[norm(tH)];
    if (!hari) { galat('hari "' + tH + '" tidak dikenal'); continue; }
    var slot = pSlot[norm(tS)] || pSlot[norm(tS.replace(/\s*\(.*$/, ''))];
    if (!slot) { galat('sesi "' + tS + '" tidak dikenal (pilih dari daftar)'); continue; }
    var dari = tD ? jimTgl_(tD) : hariIni, sampai = tE ? jimTgl_(tE) : '';
    if (dari === null) { galat('tanggal mulai "' + tD + '" tidak sah (TTTT-BB-HH)'); continue; }
    if (sampai === null) { galat('tanggal selesai "' + tE + '" tidak sah (TTTT-BB-HH)'); continue; }
    if (sampai && sampai < dari) { galat('tanggal selesai sebelum tanggal mulai'); continue; }
    if (sampai && sampai < hariIni) { galat('jadwal sudah berakhir (tanggal selesai lewat)'); continue; }
    var unit = '';
    if (tU && tU !== '-') {
      var ids = [], salah = '';
      tU.split(',').forEach(function(u) { var id = pUnit[norm(u)]; if (id) ids.push(id); else if (norm(u)) salah = u; });
      if (salah) { galat('unit "' + salah.trim() + '" tidak dikenal / nonaktif'); continue; }
      unit = ubKunci_(ids);
    }
    // v1.76.0: Excel bisa mengubah "1,3" menjadi angka 13 / 1.3: digit diambil satu per satu
    var tW2 = tW.replace(/minggu|ke|dan|-/gi, '').replace(/[\s,.;&]/g, '');
    if (tW && !/^\s*setiap/i.test(tW) && !/^[1-4]+$/.test(tW2)) { galat('minggu ke "' + tW + '" tidak sah (pilih Setiap minggu, 1,3, atau 2,4)'); continue; }
    var minggu = jadMingguSah_(tW);
    target.forEach(function(k) {
      var awal = pkt ? k.namaRombel + ': ' : '';
      var idT = idT0 || k.idTutor || '';
      if (!idT) { galat(awal + 'isi tutor'); return; }
      var baru = { id: 'baris' + no + '|' + k.idRombel, aktif: true, idRombel: k.idRombel, kodeMapel: k.kodeMapel, idTutor: idT, hari: hari, mulai: slot.mulai, selesai: slot.selesai,
        dari: dari, sampai: sampai, unit: unit, minggu: minggu };
      var b = jadBentrok_(rencana, baru, '');
      if (b.length) { galat(awal + 'bentrok: ' + b.join('; ')); return; }
      rencana.push(baru);
      var tt = d.tutor.filter(function(x) { return x.id === idT; })[0];
      out.item.push({ baris: no, idRombel: k.idRombel, kodeMapel: k.kodeMapel, idTutor: idT, hari: hari, slot: slot.id, namaSlot: slot.nama, mulai: slot.mulai, selesai: slot.selesai,
        dari: dari, sampai: sampai, unit: unit, minggu: minggu, program: k.program || '', namaRombel: k.namaRombel, namaMapel: k.namaMapel, namaTutor: tt ? tt.nama : idT });
    });
  }
  return out;
}

// d: {b64}
function waStafPemetaanImporPratinjau(token, d) {
  var p = jimWajib_(token);
  d = d || {};
  if (String(d.b64 || '').length > 4 * 1024 * 1024 * 1.4) throw new Error('File terlalu besar (maksimal 4 MB).');
  var lembar = oflBacaXlsx_(d.b64), baris = lembar[JIM.LEMBAR];
  if (!baris) { var k = Object.keys(lembar); baris = lembar[k[0]]; }
  var r = jimRencana_(baris, jimPilihan_(), jadBacaPm_().data, absHariIni_());
  var kunci = 'jim_' + p.id + '_' + absId_();
  CacheService.getScriptCache().put(kunci, JSON.stringify({ item: r.item, oleh: p.id }), JIM.CACHE_DETIK);
  return {
    kunci: kunci, jumlah: { siap: r.item.length, galat: r.galat.length, kosong: r.kosong },
    item: r.item.slice(0, 400).map(function(x) {
      return { baris: x.baris, rombel: x.namaRombel, mapel: x.namaMapel, tutor: x.namaTutor, hari: x.hari, sesi: x.namaSlot + ' ' + x.mulai + '–' + x.selesai,
        dari: x.dari, sampai: x.sampai, unit: x.unit ? ubNamaKunci_(x.unit) : 'Semua siswa', minggu: jadMingguTeks_(x.minggu || '') };
    }),
    galat: r.galat.slice(0, 300)
  };
}

function waStafPemetaanImporTerapkan(token, kunci) {
  var p = jimWajib_(token);
  var c = CacheService.getScriptCache(), s = c.get(String(kunci || ''));
  if (!s) throw new Error('Pratinjau kedaluwarsa. Unggah ulang berkasnya.');
  var d = JSON.parse(s);
  if (d.oleh !== p.id) throw new Error('Pratinjau ini milik pengguna lain.');
  if (!d.item.length) throw new Error('Tidak ada jadwal yang siap disimpan.');
  if (d.item.some(function(x) { return x.unit; })) ubPastikanKolom_(JAD.TAB_PM, 'UNIT');
  if (d.item.some(function(x) { return x.minggu; })) ubPastikanKolom_(JAD.TAB_PM, 'MINGGU KE');
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var pm = jadBacaPm_(), rencana = pm.data.slice(), rows = [], lewat = [];
    d.item.forEach(function(x) {
      var baru = { id: '', aktif: true, idRombel: x.idRombel, kodeMapel: x.kodeMapel, idTutor: x.idTutor, hari: x.hari, mulai: x.mulai, selesai: x.selesai, dari: x.dari, sampai: x.sampai, unit: x.unit, minggu: x.minggu || '' };
      var b = jadBentrok_(rencana, baru, '');
      if (b.length) { lewat.push({ baris: x.baris, alasan: b.join('; ') }); return; }
      rencana.push(baru);
      rows.push(absBaris_(pm.t, { 'ID PEMETAAN': absId_(), 'ROMBEL': x.idRombel, 'MAPEL': x.kodeMapel, 'TUTOR': x.idTutor, 'HARI': x.hari, 'JAM MULAI': x.mulai,
        'JAM SELESAI': x.selesai, 'TANGGAL MULAI': x.dari, 'TANGGAL SELESAI': x.sampai, 'AKTIF': true, 'SESI': x.namaSlot, 'PAKET': x.program, 'UNIT': x.unit, 'MINGGU KE': x.minggu || '' }));
    });
    if (rows.length) pm.t.sh.getRange(pm.t.sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    c.remove(String(kunci));
    try { absLupakan_(JAD.TAB_PM); } catch (e) {}
    catat_(p.peran, '-', p.nama, 'Impor jadwal Excel', rows.length + ' jadwal disimpan, ' + lewat.length + ' dilewati', 'OK');
    return { sukses: true, disimpan: rows.length, lewat: lewat };
  } finally { try { SpreadsheetApp.flush(); } catch (eF) {} lock.releaseLock(); }
}
