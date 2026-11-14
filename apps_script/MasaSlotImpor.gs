// ============================================================================
// TEMPLAT SLOT MASA UJIAN (v1.82.0): susun banyak slot sekaligus lewat Excel.
// - Unduh templat dari layar rincian masa ujian (hanya Draft). Templat sudah berisi slot yang ada, sehingga bisa
//   langsung diubah. Kolom MAPEL, ROMBEL, dan MODE punya daftar pilihan (lembar PILIHAN).
// - Unggah -> server memeriksa setiap baris (aturan sama dengan form slot) -> slot yang sah menggantikan daftar slot
//   di layar -> Admin memeriksa lalu menekan "Simpan slot" (penyimpanan tetap lewat waStafMasaSlotSimpan).
// ============================================================================
var MSI = {
  LEMBAR: 'SLOT', LEMBAR_REF: 'PILIHAN', WARNA: 'FF0F766E', BARIS_KOSONG: 120,
  KOLOM: ['NO', 'TANGGAL', 'JAM MULAI', 'DURASI (MENIT)', 'MAPEL', 'ROMBEL', 'JUMLAH SOAL', 'MODE'],
  SEMUA: 'Semua rombel', IKUT: 'Ikut masa'
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

function waStafMasaSlotTemplat(token, id) {
  var p = stafDariToken_(token);
  muWajib_(p);
  var r = waStafMasaRinci(token, id), m = r.masa, rbNama = {};
  r.mapel.forEach(function(x) { (x.rombelId || []).forEach(function(o) { rbNama[o.id] = o.nama; }); });
  var nmMapel = {};
  r.mapel.forEach(function(x) { nmMapel[x.kode] = msiMapelLabel_(x); });
  var judul = [{ v: 'TEMPLAT SLOT MASA UJIAN', s: 1 }];
  for (var i = 1; i < MSI.KOLOM.length; i++) judul.push({ v: '', s: 1 });
  var b = [
    judul,
    [{ v: 'Masa ujian', s: 2 }, { v: m.nama + ' (' + m.jenis + ') · ' + m.dari + ' s.d. ' + m.sampai + ' · mode ' + m.mode + ' · ID ' + m.id }],
    [{ v: 'Diunduh', s: 2 }, { v: absWaktu_() + ' oleh ' + p.nama }],
    [{ v: 'Satu baris = satu slot (satu mapel, satu tanggal & jam), berlaku serentak untuk rombel peserta yang punya mapel itu. Slot yang sudah ada ikut tertulis di bawah; isi berkas ini MENGGANTIKAN seluruh daftar slot.', s: 6 }],
    [{ v: 'TANGGAL TTTT-BB-HH (mis. ' + m.dari + '), harus di dalam masa ujian. JAM MULAI JJ:MM (mis. 07:30). DURASI ' + UJ.DURASI_MIN + '–' + UJ.DURASI_MAKS + ' menit (kosong = 90). JUMLAH SOAL 5–' + KM.MAKS_SOAL_PER_UJIAN + ' (kosong = ' + UJ.JUMLAH_BAWAAN + ').', s: 6 }],
    [{ v: 'ROMBEL: "' + MSI.SEMUA + '" / kosong = semua rombel peserta yang punya mapel itu; atau tulis nama rombel dipisah koma (mis. C10, C11). MODE: "' + MSI.IKUT + '" / kosong, Online, atau Offline (ujian tulis). Satu mapel hanya sekali per rombel.', s: 6 }],
    [],
    MSI.KOLOM.map(function(k) { return { v: k, s: 3 }; })
  ];
  var n = 0;
  r.slot.forEach(function(s) {
    n++;
    b.push([{ v: n, n: true, s: 4 }, { v: s.tanggal, s: 5 }, { v: s.jam, s: 5 }, { v: s.durasi, n: true, s: 7 }, { v: nmMapel[s.kode] || s.kode, s: 5 },
      { v: s.rombel && s.rombel.length ? s.rombel.map(function(x) { return rbNama[x] || x; }).join(', ') : MSI.SEMUA, s: 5 }, { v: s.jumlah, n: true, s: 7 },
      { v: s.mode || MSI.IKUT, s: 5 }]);
  });
  for (var k = 0; k < MSI.BARIS_KOSONG; k++) {
    n++;
    b.push([{ v: n, n: true, s: 4 }, { v: '', s: 5 }, { v: '', s: 5 }, { v: '', s: 5 }, { v: '', s: 5 }, { v: '', s: 5 }, { v: '', s: 5 }, { v: '', s: 5 }]);
  }
  var rombelUrut = Object.keys(rbNama).map(function(x) { return rbNama[x]; }).sort(function(a, c) { return a.localeCompare(c, 'id', { numeric: true }); });
  var kol = [r.mapel.map(msiMapelLabel_), [MSI.SEMUA].concat(rombelUrut), [MSI.IKUT, 'Online', 'Offline']];
  var ref = [[{ v: 'MAPEL', s: 3 }, { v: 'ROMBEL', s: 3 }, { v: 'MODE', s: 3 }]];
  var maks = Math.max.apply(null, kol.map(function(c) { return c.length; }));
  for (var j = 0; j < maks; j++) ref.push(kol.map(function(c) { return { v: c[j] || '', s: 4 }; }));
  var akhir = 8 + n, val = [['E', 'A', kol[0].length, true], ['F', 'B', kol[1].length, false], ['H', 'C', kol[2].length, true]].map(function(x) {
    return '<dataValidation type="list" allowBlank="1" showErrorMessage="' + (x[3] ? '1' : '0') + '" sqref="' + x[0] + '9:' + x[0] + akhir + '">' +
      '<formula1>' + MSI.LEMBAR_REF + '!$' + x[1] + '$2:$' + x[1] + '$' + Math.max(2, x[2] + 1) + '</formula1></dataValidation>';
  });
  var xml = nxlSheetXml_(b, [5, 14, 12, 15, 34, 30, 13, 13], ['A1:H1']).replace('</worksheet>', '<dataValidations count="' + val.length + '">' + val.join('') + '</dataValidations></worksheet>');
  var nama = 'Templat_Slot_' + String(m.nama || m.id).replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40) + '.xlsx';
  var blob = oflZip_([{ nama: MSI.LEMBAR, xml: xml }, { nama: MSI.LEMBAR_REF, xml: nxlSheetXml_(ref, [40, 24, 14], []) }], nxlStylesXml_(MSI.WARNA), nama);
  return { nama: nama, b64: Utilities.base64Encode(blob.getBytes()) };
}

// Rencana (murni, diuji). baris: [[sel...]]; m: masa {dari, sampai}; mapel: [{kode, nama, rombelId:[{id,nama}]}]
function msiRencana_(baris, m, mapel) {
  var h = -1, kol = {};
  for (var i = 0; i < Math.min(baris.length, 20) && h < 0; i++) {
    var r = (baris[i] || []).map(function(x) { return String(x || '').trim().toUpperCase(); });
    if (r.indexOf('TANGGAL') >= 0 && r.indexOf('MAPEL') >= 0) { h = i; r.forEach(function(k, j) { if (k) kol[k] = j; }); }
  }
  if (h < 0) throw new Error('Baris judul kolom (TANGGAL, JAM MULAI, MAPEL, ...) tidak ditemukan. Pakai templat dari aplikasi.');
  var norm = function(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); };
  var pMapel = {};
  mapel.forEach(function(x) { pMapel[norm(msiMapelLabel_(x))] = x; pMapel[norm(x.kode)] = x; if (!pMapel[norm(x.nama)]) pMapel[norm(x.nama)] = x; });
  var sel = function(row, k) { var j = kol[k]; return j === undefined ? '' : row[j]; };
  var out = { slot: [], galat: [], kosong: 0 }, tabrak = {};
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
    var tR = String(sel(row, 'ROMBEL') || '').trim(), rombel = [];
    if (mp && tR && norm(tR) !== norm(MSI.SEMUA) && norm(tR) !== 'semua') {
      var pR = {};
      (mp.rombelId || []).forEach(function(o) { pR[norm(o.nama)] = o.id; pR[norm(o.id)] = o.id; });
      tR.split(/[,;]/).map(function(x) { return x.trim(); }).filter(String).forEach(function(x) {
        var idR = pR[norm(x)];
        if (!idR) e.push('rombel "' + x + '" tidak punya mapel ' + mp.nama + ' di masa ini');
        else if (rombel.indexOf(idR) < 0) rombel.push(idR);
      });
    }
    var tMo = norm(sel(row, 'MODE')), mode = '';
    if (tMo === 'online') mode = 'Online'; else if (tMo === 'offline') mode = 'Offline';
    else if (tMo && tMo !== norm(MSI.IKUT)) e.push('mode "' + sel(row, 'MODE') + '" tidak dikenal (Ikut masa / Online / Offline)');
    if (mp && !e.length) {
      var bentrok = (tabrak[mp.kode] || []).some(function(lain) { return !lain.r.length || !rombel.length || lain.r.some(function(x) { return rombel.indexOf(x) >= 0; }); });
      if (bentrok) e.push('mapel ' + mp.nama + ' sudah dijadwalkan di baris ' + tabrak[mp.kode].map(function(x) { return x.no; }).join(', ') + ' untuk rombel yang sama');
    }
    if (e.length) { out.galat.push({ baris: no, pesan: e.join('; ') }); continue; }
    (tabrak[mp.kode] = tabrak[mp.kode] || []).push({ r: rombel, no: no });
    out.slot.push({ baris: no, tanggal: tgl, jam: jam, durasi: dur, kode: mp.kode, namaMapel: mp.nama, jumlah: jml, komposisi: ujKomposisi_(jml, {}), rombel: rombel, mode: mode });
  }
  return out;
}

// d: {b64}. Hasil: slot sah (belum disimpan) + baris bermasalah.
function waStafMasaSlotImporPratinjau(token, id, d) {
  var p = stafDariToken_(token);
  muWajib_(p);
  d = d || {};
  if (String(d.b64 || '').length > 4 * 1024 * 1024 * 1.4) throw new Error('File terlalu besar (maksimal 4 MB).');
  var r = waStafMasaRinci(token, id);
  if (r.masa.status !== 'Draft') throw new Error('Slot masa ujian yang sudah ditetapkan tidak bisa diubah. Batalkan penetapannya dulu.');
  var lembar = oflBacaXlsx_(d.b64), baris = lembar[MSI.LEMBAR];
  if (!baris) { var k = Object.keys(lembar); baris = lembar[k[0]]; }
  var h = msiRencana_(baris || [], r.masa, r.mapel);
  if (h.slot.length > MU.MAKS_SLOT) throw new Error('Maksimal ' + MU.MAKS_SLOT + ' slot (berkas berisi ' + h.slot.length + ').');
  return h;
}
