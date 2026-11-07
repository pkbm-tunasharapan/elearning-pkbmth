// ============================================================================
// ULANG TAHUN (aplikasi 1.22): daftar warga belajar yang berulang tahun hari ini
// (dari TANGGAL LAHIR di tab WARGA BELAJAR) untuk semua pengguna (staf & siswa),
// plus kirim ucapan selamat ke Chatroom Rombel warga belajar yang berulang tahun,
// sehingga ia dan teman sekelasnya ikut membaca (dan mendapat notifikasi chat).
// - Satu ucapan per pengirim per orang per hari (mencegah spam).
// - Siswa dari rombel lain boleh mengucapkan; pesannya diberi keterangan asal rombel.
// ============================================================================
var ULT = {
  TTL_DETIK: 21600,
  MAKS_TEKS: 300,
  BAWAAN: 'Selamat ulang tahun, {nama}! Semoga sehat selalu, bahagia, dan makin semangat belajar.'
};

// Fungsi siswa (tanpa token staf) didaftarkan ke pintu API Flutter.
if (typeof API_FLUTTER !== 'undefined' && API_FLUTTER && API_FLUTTER.TAMBAHAN) {
  API_FLUTTER.TAMBAHAN.waUlangTahun = true;
  API_FLUTTER.TAMBAHAN.waUcapkanUlangTahun = true;
}

function ultKabisat_(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

// [{idWb, nama, rombel, usia, ruang (ID rombel e-learning = kunci Chatroom Rombel), namaEl}]
function ultDaftar_() {
  var hari = absHariIni_(); // yyyy-mm-dd (zona waktu lembaga)
  var cache = CacheService.getScriptCache(), ck = 'ult2|' + hari;
  var s = cache.get(ck);
  if (s) { try { return JSON.parse(s); } catch (e) {} }
  var th = Number(hari.slice(0, 4)), md = hari.slice(5);
  var cocok = {};
  cocok[md] = true;
  if (md === '02-28' && !ultKabisat_(th)) cocok['02-29'] = true;
  var rb = ahPetaRombel_();
  // Peta siswa e-learning (sheet Siswa: A = ID Rombel, B = Nama, G = NISN) untuk menemukan Chatroom Rombel.
  var perNisn = {}, perNama = {};
  getSheetData(CONFIG.SHEETS.SISWA).forEach(function(r, i) {
    if (!i || !String(r[1]).trim()) return;
    var x = { ruang: sTeks_(r[0]).trim(), nama: sTeks_(r[1]).trim() };
    var nisn = sTeks_(r[6]).replace(/\D/g, '');
    if (nisn) perNisn[nisn] = x;
    var k = normNama_(x.nama);
    (perNama[k] = perNama[k] || []).push(x);
  });
  var w = absBaca_('WARGA BELAJAR'), out = [];
  for (var j = 1; j < w.v.length; j++) {
    var r2 = w.v[j];
    var st = sTeks_(absNilai_(w, r2, 'STATUS')).trim();
    if (st && st !== 'Aktif') continue;
    var tgl = absTgl_(absNilai_(w, r2, 'TANGGAL LAHIR'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl) || !cocok[tgl.slice(5)]) continue;
    var nama = sTeks_(absNilai_(w, r2, 'NAMA WB')).trim();
    if (!nama) continue;
    var nisn2 = sTeks_(absNilai_(w, r2, 'NISN')).replace(/\D/g, '');
    var el = (nisn2 && perNisn[nisn2]) || ((perNama[normNama_(nama)] || []).length === 1 ? perNama[normNama_(nama)][0] : null);
    var idRb = sTeks_(absNilai_(w, r2, 'ROMBEL')).trim();
    out.push({
      idWb: sTeks_(absNilai_(w, r2, 'ID WB')).trim(), nama: nama, rombel: (rb[idRb] || {}).nama || idRb,
      usia: th - Number(tgl.slice(0, 4)), ruang: el ? el.ruang : '', namaEl: el ? el.nama : ''
    });
  }
  out.sort(function(a, b) { return a.rombel.localeCompare(b.rombel, 'id', { numeric: true }) || a.nama.localeCompare(b.nama); });
  cache.put(ck, JSON.stringify(out), ULT.TTL_DETIK);
  return out;
}

function ultPublik_(daftarUlt, siswa) {
  return daftarUlt.map(function(x) {
    var o = { idWb: x.idWb, nama: x.nama, rombel: x.rombel, bisaUcap: !!x.ruang };
    if (!siswa) o.usia = x.usia;
    return o;
  });
}

function ultKirim_(idWb, pengirim, peran, asal, pesan) {
  var x = ultDaftar_().filter(function(u) { return u.idWb === String(idWb || ''); })[0];
  if (!x) throw new Error('Warga belajar ini tidak berulang tahun hari ini.');
  if (!x.ruang) throw new Error('Chatroom rombel ' + x.nama + ' belum ditemukan di e-learning.');
  var cache = CacheService.getScriptCache();
  var ck = 'ultk|' + absHariIni_() + '|' + peran + '|' + normNama_(pengirim) + '|' + x.idWb;
  if (cache.get(ck) === '1') throw new Error('Anda sudah mengucapkan selamat kepada ' + x.nama + ' hari ini.');
  var depan = x.nama.split(/\s+/)[0];
  var teks = String(pesan === null || pesan === undefined ? '' : pesan).trim().slice(0, ULT.MAKS_TEKS) || ULT.BAWAAN.replace('{nama}', depan);
  var h = kirimRuang_(x.ruang, pengirim, peran, '🎂 ' + teks + (asal ? ' (dari ' + asal + ')' : ''));
  if (!h || h.sukses === false) throw new Error((h && h.pesan) || 'Ucapan gagal dikirim.');
  cache.put(ck, '1', 21600);
  return { sukses: true, nama: x.nama, rombel: x.rombel };
}

// ---------- staf ----------
function waStafUlangTahun(token) {
  stafDariToken_(token);
  return { tanggal: absHariIni_(), daftar: ultPublik_(ultDaftar_(), false) };
}

function waStafUcapkanUlangTahun(token, idWb, pesan) {
  var p = stafDariToken_(token);
  return ultKirim_(idWb, p.nama, p.peran, '', pesan);
}

// ---------- siswa (nama + ID rombel e-learning, sama seperti Chatroom Rombel) ----------
function waUlangTahun(nama, idRombel) {
  ruangSiswa_(nama, idRombel, 'ROMBEL');
  var saya = normNama_(nama), rbSaya = String(idRombel).trim();
  var d = ultDaftar_();
  var out = ultPublik_(d, true);
  out.forEach(function(o, i) {
    o.sekelas = d[i].ruang === rbSaya;
    o.sendiri = o.sekelas && (normNama_(d[i].namaEl) === saya || normNama_(d[i].nama) === saya);
    if (o.sendiri) o.bisaUcap = false;
  });
  return { tanggal: absHariIni_(), daftar: out };
}

function waUcapkanUlangTahun(nama, idRombel, idWb, pesan) {
  var k = ruangSiswa_(nama, idRombel, 'ROMBEL');
  nama = String(nama).trim();
  var x = ultDaftar_().filter(function(u) { return u.idWb === String(idWb || ''); })[0];
  if (x && x.ruang === k && (normNama_(x.namaEl) === normNama_(nama) || normNama_(x.nama) === normNama_(nama))) {
    throw new Error('Ini ulang tahun Anda sendiri. Selamat ulang tahun!');
  }
  var asal = '';
  if (x && x.ruang !== k) {
    getSheetData(CONFIG.SHEETS.ROMBEL).forEach(function(r, i) { if (i && sTeks_(r[0]).trim() === k) asal = 'rombel ' + (sTeks_(r[1]).trim() || k); });
    if (!asal) asal = 'rombel lain';
  }
  return ultKirim_(idWb, nama, 'Siswa', asal, pesan);
}
