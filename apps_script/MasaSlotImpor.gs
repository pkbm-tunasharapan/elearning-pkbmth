// ============================================================================
// TEMPLAT SLOT MASA UJIAN + PENGAWAS (v1.82.0, v1.82.1)
// - Unduh templat dari layar rincian masa ujian (hanya Draft). Templat sudah berisi slot & pengawas yang ada,
//   sehingga bisa langsung diubah. Kolom MAPEL, ROMBEL, MODE, PENGAWAS punya daftar pilihan (lembar PILIHAN).
// - ROMBEL: "Semua rombel" / kosong, "Semua rombel paket A/B/C" (rombel jenjang itu yang punya mapel tersebut),
//   atau nama rombel dipisah koma.
// - PENGAWAS & RUANG berlaku untuk semua rombel yang dicakup baris itu pada slot itu. Pengawas berbeda per rombel ->
//   tulis baris terpisah per rombel.
// - Unggah -> pratinjau (baris bermasalah ditampilkan) -> Terapkan: seluruh slot diganti, lalu penugasan pengawas
//   masa ini diganti sesuai berkas (bila kolom PENGAWAS/RUANG diisi; bila kosong semua, penugasan lama dibiarkan).
// ============================================================================
var MSI = {
  LEMBAR: 'SLOT', LEMBAR_REF: 'PILIHAN', WARNA: 'FF0F766E', BARIS_KOSONG: 120, CACHE_DETIK: 1200,
  KOLOM: ['NO', 'TANGGAL', 'JAM MULAI', 'DURASI (MENIT)', 'MAPEL', 'ROMBEL', 'JUMLAH SOAL', 'MODE', 'PENGAWAS', 'RUANG'],
  SEMUA: 'Semua rombel', PAKET: 'Semua rombel paket ', IKUT: 'Ikut masa'
};

function msiMapelLabel_(x) { return x.kode + ' - ' + x.nama; }

// Jam dari sel Excel: "07:30", "7.30", angka pecahan hari (0.3125), atau "1899-12-30 07:30".
function msiJam_(v) {
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (!s) return '';
  if (/^0?\.\d+$|^0$/.test(s)) {
    var mnt = Math.round(Number(s) * 1440);
    return ('0' + Math.floor(mnt / 60)).slice(-2) + ':' + ('0' + (mnt % 60)).slice(-2);
  }
  return ujJam_(s.replace(/^(\d{1,2})\.(\d{2})$/, '$1:$2'));
}

// Data dasar templat & pratinjau: masa, slot, mapel (rombelId + paket), staf pengawas (label unik).
function msiData_(token, id) {
  var r = waStafMasaRinci(token, id), rb = honProgramRombel_();
  r.mapel.forEach(function(x) {
    (x.rombelId || []).forEach(function(o) { o.paket = jimJenjang_({ program: rb[o.id] ? rb[o.id].program : '', namaRombel: o.nama }); });
  });
  var hitung = {}, staf = pwStaf_();
  staf.forEach(function(u) { hitung[u.nama.toLowerCase()] = (hitung[u.nama.toLowerCase()] || 0) + 1; });
  staf.forEach(function(u) { u.label = hitung[u.nama.toLowerCase()] > 1 ? u.nama + ' [' + u.id + ']' : u.nama; });
  r.staf = staf;
  return r;
}

function waStafMasaSlotTemplat(token, id) {
  var p = stafDariToken_(token);
  muWajib_(p);
  var r = msiData_(token, id), m = r.masa, rbNama = {}, paket = {};
  r.mapel.forEach(function(x) { (x.rombelId || []).forEach(function(o) { rbNama[o.id] = o.nama; if (o.paket) paket[o.paket] = true; }); });
  var nmMapel = {}, lbStaf = {};
  r.mapel.forEach(function(x) { nmMapel[x.kode] = msiMapelLabel_(x); });
  r.staf.forEach(function(u) { lbStaf[u.id] = u.label; });
  // pengawas yang berlaku sekarang per slot x rombel
  var tugas = pwTugasMasa_(m.id), per = pwRombelSlot_(m, r.slot, muKelas_(m));
  var judul = [{ v: 'TEMPLAT SLOT MASA UJIAN & PENGAWAS', s: 1 }];
  for (var i = 1; i < MSI.KOLOM.length; i++) judul.push({ v: '', s: 1 });
  var b = [
    judul,
    [{ v: 'Masa ujian', s: 2 }, { v: m.nama + ' (' + m.jenis + ') · ' + m.dari + ' s.d. ' + m.sampai + ' · mode ' + m.mode + ' · ID ' + m.id }],
    [{ v: 'Diunduh', s: 2 }, { v: absWaktu_() + ' oleh ' + p.nama }],
    [{ v: 'Satu baris = satu slot (satu mapel, satu tanggal & jam), serentak untuk rombel yang dicakup. Slot & pengawas yang ada ikut tertulis; isi berkas ini MENGGANTIKAN seluruh slot dan penugasan pengawas masa ini.', s: 6 }],
    [{ v: 'TANGGAL TTTT-BB-HH (mis. ' + m.dari + '), di dalam masa ujian. JAM MULAI JJ:MM. DURASI ' + UJ.DURASI_MIN + '–' + UJ.DURASI_MAKS + ' menit (kosong = 90). JUMLAH SOAL 5–' + KM.MAKS_SOAL_PER_UJIAN + ' (kosong = ' + UJ.JUMLAH_BAWAAN + '). MODE: Ikut masa / Online / Offline.', s: 6 }],
    [{ v: 'ROMBEL: "' + MSI.SEMUA + '" / kosong, "' + MSI.PAKET + 'A/B/C", atau nama rombel dipisah koma (C10, C11). PENGAWAS & RUANG berlaku untuk semua rombel di baris itu; pengawas beda per rombel = baris terpisah per rombel. Satu mapel hanya sekali per rombel.', s: 6 }],
    [],
    MSI.KOLOM.map(function(k) { return { v: k, s: 3 }; })
  ];
  var n = 0;
  var tulis = function(s, rombelTeks, ef) {
    n++;
    b.push([{ v: n, n: true, s: 4 }, { v: s.tanggal, s: 5 }, { v: s.jam, s: 5 }, { v: s.durasi, n: true, s: 7 }, { v: nmMapel[s.kode] || s.kode, s: 5 },
      { v: rombelTeks, s: 5 }, { v: s.jumlah, n: true, s: 7 }, { v: s.mode || MSI.IKUT, s: 5 },
      { v: ef && ef.idPengawas ? (lbStaf[ef.idPengawas] || ef.namaPengawas || '') : '', s: 5 }, { v: ef ? ef.ruang || '' : '', s: 5 }]);
  };
  r.slot.forEach(function(s) {
    var kunci = Object.keys(per[s.id] || {}), efs = kunci.map(function(k) { return pwEfektif_(tugas, s.id, k); });
    var sidik = efs.map(function(e) { return e ? (e.idPengawas || '') + '|' + (e.ruang || '') : '|'; });
    var seragam = sidik.every(function(x) { return x === sidik[0]; });
    if (seragam || !kunci.length) {
      tulis(s, s.rombel && s.rombel.length ? s.rombel.map(function(x) { return rbNama[x] || x; }).join(', ') : MSI.SEMUA, efs[0]);
      return;
    }
    // pengawas berbeda antar-rombel -> satu baris per rombel
    var sudah = {};
    kunci.forEach(function(k, j) {
      var idR = k.split('~')[0];
      if (sudah[idR]) return;
      sudah[idR] = true;
      tulis(s, rbNama[idR] || idR, efs[j]);
    });
  });
  for (var k = 0; k < MSI.BARIS_KOSONG; k++) {
    n++;
    var kosong = [{ v: n, n: true, s: 4 }];
    for (var c = 1; c < MSI.KOLOM.length; c++) kosong.push({ v: '', s: 5 });
    b.push(kosong);
  }
  var rombelUrut = Object.keys(rbNama).map(function(x) { return rbNama[x]; }).sort(function(a, c) { return a.localeCompare(c, 'id', { numeric: true }); });
  var kol = [r.mapel.map(msiMapelLabel_), [MSI.SEMUA].concat(Object.keys(paket).sort().map(function(j) { return MSI.PAKET + j; }), rombelUrut),
    [MSI.IKUT, 'Online', 'Offline'], r.staf.map(function(u) { return u.label; })];
  var ref = [['MAPEL', 'ROMBEL', 'MODE', 'PENGAWAS'].map(function(x) { return { v: x, s: 3 }; })];
  var maks = Math.max.apply(null, kol.map(function(c) { return c.length; }));
  for (var j = 0; j < maks; j++) ref.push(kol.map(function(c) { return { v: c[j] || '', s: 4 }; }));
  var akhir = 8 + n, val = [['E', 'A', kol[0].length, true], ['F', 'B', kol[1].length, false], ['H', 'C', kol[2].length, true], ['I', 'D', kol[3].length, true]].map(function(x) {
    return '<dataValidation type="list" allowBlank="1" showErrorMessage="' + (x[3] ? '1' : '0') + '" sqref="' + x[0] + '9:' + x[0] + akhir + '">' +
      '<formula1>' + MSI.LEMBAR_REF + '!$' + x[1] + '$2:$' + x[1] + '$' + Math.max(2, x[2] + 1) + '</formula1></dataValidation>';
  });
  var xml = nxlSheetXml_(b, [5, 14, 12, 15, 34, 30, 13, 13, 28, 20], ['A1:J1']).replace('</worksheet>', '<dataValidations count="' + val.length + '">' + val.join('') + '</dataValidations></worksheet>');
  var nama = 'Templat_Slot_' + String(m.nama || m.id).replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40) + '.xlsx';
  var blob = oflZip_([{ nama: MSI.LEMBAR, xml: xml }, { nama: MSI.LEMBAR_REF, xml: nxlSheetXml_(ref, [40, 26, 14, 30], []) }], nxlStylesXml_(MSI.WARNA), nama);
  return { nama: nama, b64: Utilities.base64Encode(blob.getBytes()) };
}

// Rencana (murni, diuji). baris: [[sel...]]; m: masa {dari, sampai};
// mapel: [{kode, nama, rombelId:[{id,nama,paket}]}]; staf: [{id, nama, label}]
function msiRencana_(baris, m, mapel, staf) {
  var h = -1, kol = {};
  for (var i = 0; i < Math.min(baris.length, 20) && h < 0; i++) {
    var r = (baris[i] || []).map(function(x) { return String(x || '').trim().toUpperCase(); });
    if (r.indexOf('TANGGAL') >= 0 && r.indexOf('MAPEL') >= 0) { h = i; r.forEach(function(k, j) { if (k) kol[k] = j; }); }
  }
  if (h < 0) throw new Error('Baris judul kolom (TANGGAL, JAM MULAI, MAPEL, ...) tidak ditemukan. Pakai templat dari aplikasi.');
  var norm = function(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); };
  var pMapel = {};
  mapel.forEach(function(x) { pMapel[norm(msiMapelLabel_(x))] = x; pMapel[norm(x.kode)] = x; if (!pMapel[norm(x.nama)]) pMapel[norm(x.nama)] = x; });
  var pStaf = {}, ganda = {};
  (staf || []).forEach(function(u) {
    pStaf[norm(u.label)] = u; pStaf[norm(u.id)] = u;
    var nn = norm(u.nama);
    if (pStaf[nn] && pStaf[nn] !== u) ganda[nn] = true; else pStaf[nn] = u;
  });
  Object.keys(ganda).forEach(function(nn) { delete pStaf[nn]; });   // nama ganda wajib dipilih dengan ID
  var sel = function(row, k) { var j = kol[k]; return j === undefined ? '' : row[j]; };
  var out = { slot: [], galat: [], kosong: 0, adaPengawas: false }, tabrak = {};
  for (var b = h + 1; b < baris.length; b++) {
    var row = baris[b] || [], no = b + 1;
    var tT = String(sel(row, 'TANGGAL') || '').trim(), tM = String(sel(row, 'MAPEL') || '').trim(), tJ = sel(row, 'JAM MULAI');
    if (!tT && !tM && !String(tJ || '').trim()) { out.kosong++; continue; }
    var e = [];
    var tgl = jimTgl_(tT);
    if (!tgl) e.push(tT ? 'tanggal "' + tT + '" tidak dikenali (TTTT-BB-HH)' : 'tanggal kosong');
    else if (tgl < m.dari || tgl > m.sampai) e.push('tanggal ' + tgl + ' di luar masa ujian (' + m.dari + ' s.d. ' + m.sampai + ')');
    var jam = msiJam_(tJ);
    if (!jam) e.push('jam mulai kosong / tidak dikenali (JJ:MM)');
    var tD = String(sel(row, 'DURASI (MENIT)') || sel(row, 'DURASI') || '').trim(), dur = tD ? parseInt(tD, 10) : 90;
    if (!(dur >= UJ.DURASI_MIN && dur <= UJ.DURASI_MAKS)) e.push('durasi ' + UJ.DURASI_MIN + '–' + UJ.DURASI_MAKS + ' menit');
    var tS = String(sel(row, 'JUMLAH SOAL') || '').trim(), jml = tS ? parseInt(tS, 10) : UJ.JUMLAH_BAWAAN;
    if (!(jml >= 5 && jml <= KM.MAKS_SOAL_PER_UJIAN)) e.push('jumlah soal 5–' + KM.MAKS_SOAL_PER_UJIAN);
    var mp = pMapel[norm(tM)] || pMapel[norm(tM.split(' - ')[0])];
    if (!mp) e.push(tM ? 'mapel "' + tM + '" tidak ada di peserta masa ini' : 'mapel kosong');
    var tR = String(sel(row, 'ROMBEL') || '').trim(), rombel = [], teksRombel = 'Semua rombel';
    var mPaket = /^(?:semua rombel paket|seluruh paket|semua paket|paket)\s*([abc])$/i.exec(tR);
    if (mp && mPaket) {
      var j = mPaket[1].toUpperCase();
      rombel = (mp.rombelId || []).filter(function(o) { return o.paket === j; }).map(function(o) { return o.id; });
      teksRombel = 'Semua rombel paket ' + j;
      if (!rombel.length) e.push('mapel ' + mp.nama + ' tidak ada di rombel paket ' + j + ' masa ini');
    } else if (mp && tR && norm(tR) !== norm(MSI.SEMUA) && norm(tR) !== 'semua') {
      var pR = {}, nmR = [];
      (mp.rombelId || []).forEach(function(o) { pR[norm(o.nama)] = o; pR[norm(o.id)] = o; });
      tR.split(/[,;]/).map(function(x) { return x.trim(); }).filter(String).forEach(function(x) {
        var o = pR[norm(x)];
        if (!o) e.push('rombel "' + x + '" tidak punya mapel ' + mp.nama + ' di masa ini');
        else if (rombel.indexOf(o.id) < 0) { rombel.push(o.id); nmR.push(o.nama); }
      });
      teksRombel = nmR.join(', ');
    }
    var tMo = norm(sel(row, 'MODE')), mode = '';
    if (tMo === 'online') mode = 'Online'; else if (tMo === 'offline') mode = 'Offline';
    else if (tMo && tMo !== norm(MSI.IKUT)) e.push('mode "' + sel(row, 'MODE') + '" tidak dikenal (Ikut masa / Online / Offline)');
    var tP = String(sel(row, 'PENGAWAS') || '').trim(), pw = null;
    if (tP) {
      var mId = /\[([^\]]+)\]\s*$/.exec(tP);
      pw = pStaf[norm(tP)] || (mId ? pStaf[norm(mId[1])] : null);
      if (!pw) e.push(ganda[norm(tP)] ? 'nama pengawas "' + tP + '" ganda, pilih dari daftar (dengan ID)' : 'pengawas "' + tP + '" tidak ditemukan / tidak aktif');
    }
    var ruang = String(sel(row, 'RUANG') || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (mp && !e.length) {
      var bentrok = (tabrak[mp.kode] || []).some(function(lain) { return !lain.r.length || !rombel.length || lain.r.some(function(x) { return rombel.indexOf(x) >= 0; }); });
      if (bentrok) e.push('mapel ' + mp.nama + ' sudah dijadwalkan di baris ' + tabrak[mp.kode].map(function(x) { return x.no; }).join(', ') + ' untuk rombel yang sama');
    }
    if (e.length) { out.galat.push({ baris: no, pesan: e.join('; ') }); continue; }
    (tabrak[mp.kode] = tabrak[mp.kode] || []).push({ r: rombel, no: no });
    if (pw || ruang) out.adaPengawas = true;
    out.slot.push({ baris: no, tanggal: tgl, jam: jam, durasi: dur, kode: mp.kode, namaMapel: mp.nama, jumlah: jml, komposisi: ujKomposisi_(jml, {}), rombel: rombel,
      teksRombel: teksRombel, mode: mode, idPengawas: pw ? pw.id : '', namaPengawas: pw ? pw.nama : '', ruang: ruang });
  }
  return out;
}

// d: {b64}. Hasil: slot sah (belum disimpan) + baris bermasalah + kunci untuk Terapkan.
function waStafMasaSlotImporPratinjau(token, id, d) {
  var p = stafDariToken_(token);
  muWajib_(p);
  d = d || {};
  if (String(d.b64 || '').length > 4 * 1024 * 1024 * 1.4) throw new Error('File terlalu besar (maksimal 4 MB).');
  var r = msiData_(token, id);
  if (r.masa.status !== 'Draft') throw new Error('Slot masa ujian yang sudah ditetapkan tidak bisa diubah. Batalkan penetapannya dulu.');
  var lembar = oflBacaXlsx_(d.b64), baris = lembar[MSI.LEMBAR];
  if (!baris) { var k = Object.keys(lembar); baris = lembar[k[0]]; }
  var h = msiRencana_(baris || [], r.masa, r.mapel, r.staf);
  if (h.slot.length > MU.MAKS_SLOT) throw new Error('Maksimal ' + MU.MAKS_SLOT + ' slot (berkas berisi ' + h.slot.length + ').');
  var kunci = 'msi_' + p.id + '_' + absId_();
  CacheService.getScriptCache().put(kunci, JSON.stringify({ masa: r.masa.id, oleh: p.id, slot: h.slot, adaPengawas: h.adaPengawas }), MSI.CACHE_DETIK);
  h.kunci = kunci;
  return h;
}

// Simpan hasil pratinjau: seluruh slot diganti; penugasan pengawas diganti bila berkas mengisi PENGAWAS/RUANG.
function waStafMasaSlotImporTerapkan(token, id, kunci) {
  var p = stafDariToken_(token);
  muWajib_(p);
  var s = CacheService.getScriptCache().get(String(kunci || ''));
  if (!s) throw new Error('Pratinjau kedaluwarsa. Unggah ulang berkasnya.');
  var d = JSON.parse(s);
  if (d.oleh !== p.id || d.masa !== String(id)) throw new Error('Pratinjau ini bukan untuk masa ujian / pengguna ini.');
  var m = muCari_(id);
  if (m.status !== 'Draft') throw new Error('Slot masa ujian yang sudah ditetapkan tidak bisa diubah. Batalkan penetapannya dulu.');
  var h = muSlotTulis_(p, m, d.slot), jPw = null;
  if (d.adaPengawas) {
    var baru = muSlot_(m.id), per = pwRombelSlot_(m, baru, muKelas_(m)), tugas = [];
    d.slot.forEach(function(x, i) {
      if (!x.idPengawas && !x.ruang) return;
      Object.keys(per[h.ids[i]] || {}).forEach(function(k) { tugas.push({ slot: h.ids[i], rombel: k, ruang: x.ruang, idPengawas: x.idPengawas }); });
    });
    jPw = pwTugasTulis_(p, m, tugas);
  }
  CacheService.getScriptCache().remove(String(kunci));
  return { sukses: true, slot: h.jumlah, pengawas: jPw };
}
