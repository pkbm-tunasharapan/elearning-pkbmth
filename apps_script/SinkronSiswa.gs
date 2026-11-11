// ============================================================================
// SINKRON SISWA DUA ARAH (Belajar Mandiri <-> MENU / SIM SETARA) + ANALISA DATA GANDA
// ----------------------------------------------------------------------------
// Prinsip: TIDAK SALING MENIMPA. Data hanya MELENGKAPI kolom yang masih kosong di
// sisi lain. Bila kedua sisi terisi tetapi isinya berbeda, tidak ada yang diubah;
// perbedaan dicatat sebagai "Perlu dicek" untuk diputuskan admin.
// Pengecualian yang disetujui admin: tanggal lahir yang mundur/maju TEPAT 1 hari
// (akibat zona waktu saat impor lama) pada baris yang BELUM pernah dipakai login
// (belum ada kode akses/email) disamakan dengan MENU.
// Siswa yang hanya ada di Belajar Mandiri TIDAK otomatis dikirim ke MENU; admin
// menyetujuinya satu per satu (tombol "Kirim ke MENU").
// ============================================================================

var SSW = {
  TAB_WB: 'WARGA BELAJAR',
  TAB_ROMBEL: 'ROMBEL',
  TAB_RIWAYAT: 'Sinkron Siswa',
  TAB_CADANGAN: 'Cadangan_Hapus_Siswa',
  PROP_ABAIKAN: 'GANDA_ABAIKAN',
  // kolom tab Siswa (0-based)
  S_ROMBEL: 0, S_NAMA: 1, S_TGL: 2, S_KODE: 3, S_KONTAK: 4, S_DAFTAR: 5, S_NISN: 6
};

// ---------------------------------------------------------------- utilitas
function sswKompak_(n) { return String(n || '').toLowerCase().replace(/[^a-z]/g, ''); }
function sswNisn_(v) { var s = String(v == null ? '' : v).replace(/\D/g, ''); return s.length >= 8 ? s : ''; }
function sswEmail_(v) { var s = String(v || '').trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : ''; }
function sswHp_(v) { var s = String(v || '').replace(/[^\d+]/g, ''); return /^(\+?62|0)8\d{7,12}$/.test(s) ? s : ''; }
function sswTgl_(v, tz) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  var s = String(v == null ? '' : v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return s;
}
function sswSelisihHari_(a, b) {
  var x = Date.parse(a), y = Date.parse(b);
  if (isNaN(x) || isNaN(y)) return 9999;
  return Math.round(Math.abs(x - y) / 86400000);
}
function sswLev_(a, b) {
  if (a === b) return 0;
  if (!a || !b) return 99;
  if (Math.abs(a.length - b.length) > 3) return 99;
  var prev = [], cur, i, j;
  for (j = 0; j <= b.length; j++) prev[j] = j;
  for (i = 1; i <= a.length; i++) {
    cur = [i];
    for (j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
// nama dianggap mirip: kompak sama, atau beda <= 2 huruf untuk nama >= 8 huruf (<=1 untuk nama pendek)
function sswMirip_(a, b) {
  var x = sswKompak_(a), y = sswKompak_(b);
  if (!x || !y) return false;
  if (x === y) return true;
  var batas = Math.min(x.length, y.length) >= 8 ? 2 : (Math.min(x.length, y.length) >= 5 ? 1 : 0);
  return sswLev_(x, y) <= batas;
}
function sswKunciKelas_(n) { return String(n || '').toLowerCase().replace(/^\s*kelas\s+/, '').replace(/[^a-z0-9]/g, ''); }
// kunci baris = nomor baris + isi; dicek ulang sebelum menulis supaya tidak salah baris bila sheet berubah
function sswKunciBaris_(r) { return [r.baris, String(r.rombel), String(r.nama), String(r.tgl)].join('|'); }

// ---------------------------------------------------------------- baca data
function sswBacaMenu_() {
  var ss = simSs_();
  var tz = ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone();
  var sh = simTab_(SSW.TAB_WB);
  if (!sh) throw new Error('Tab "' + simNamaTab_(SSW.TAB_WB) + '" tidak ditemukan di database.');
  var v = sh.getDataRange().getValues();
  var head = v[0].map(function (x) { return String(x).trim().toUpperCase(); });
  function kol(n) { return head.indexOf(n); }
  var K = { id: kol('ID WB'), nisn: kol('NISN'), nik: kol('NIK'), nama: kol('NAMA WB'), tgl: kol('TANGGAL LAHIR'), rombel: kol('ROMBEL'), hp: kol('NO HP'), status: kol('STATUS'), email: kol('EMAIL') };
  if (K.nama < 0 || K.tgl < 0) throw new Error('Kolom NAMA WB / TANGGAL LAHIR tidak ditemukan di tab WARGA BELAJAR.');
  var rombel = {};
  var shR = simTab_(SSW.TAB_ROMBEL);
  if (shR) shR.getDataRange().getValues().slice(1).forEach(function (r) { var id = String(r[0]).trim(); if (id) rombel[id] = String(r[1] || '').trim(); });
  var wb = [];
  for (var i = 1; i < v.length; i++) {
    var r = v[i], nama = String(r[K.nama] || '').trim().replace(/\s+/g, ' ');
    if (!nama) continue;
    var idR = K.rombel >= 0 ? String(r[K.rombel] || '').trim() : '';
    wb.push({
      baris: i + 1, id: K.id >= 0 ? String(r[K.id] || '').trim() : '', nama: nama,
      nisn: K.nisn >= 0 ? sswNisn_(r[K.nisn]) : '', nik: K.nik >= 0 ? String(r[K.nik] == null ? '' : r[K.nik]).replace(/\D/g, '') : '', tgl: sswTgl_(r[K.tgl], tz),
      idRombel: idR, namaRombel: rombel[idR] || '', hp: K.hp >= 0 ? String(r[K.hp] || '').trim() : '',
      email: K.email >= 0 ? String(r[K.email] || '').trim() : '', status: K.status >= 0 ? String(r[K.status] || '').trim() : ''
    });
  }
  return { ss: ss, sh: sh, tz: tz, head: head, K: K, wb: wb, rombel: rombel };
}

function sswBacaBm_() {
  var v = getSheetData(CONFIG.SHEETS.SISWA);
  var tz = Session.getScriptTimeZone();
  var namaRombel = {};
  getSheetData(CONFIG.SHEETS.ROMBEL).slice(1).forEach(function (r) { var id = sTeks_(r[0]).trim(); if (id) namaRombel[id] = sTeks_(r[1]).trim(); });
  var rows = [];
  for (var i = 1; i < v.length; i++) {
    var r = v[i], nama = sTeks_(r[SSW.S_NAMA]).trim();
    if (!nama) continue;
    var kontak = String(r[SSW.S_KONTAK] || '').trim();
    rows.push({
      baris: i + 1, rombel: sTeks_(r[SSW.S_ROMBEL]).trim(), namaRombel: namaRombel[sTeks_(r[SSW.S_ROMBEL]).trim()] || sTeks_(r[SSW.S_ROMBEL]).trim(),
      nama: nama, tgl: sswTgl_(r[SSW.S_TGL], tz), kode: String(r[SSW.S_KODE] || '').trim(), kontak: kontak,
      email: sswEmail_(kontak), hp: sswHp_(kontak), daftar: sTeks_(r[SSW.S_DAFTAR]).trim(), nisn: sswNisn_(r[SSW.S_NISN])
    });
  }
  rows.forEach(function (x) { x.terdaftar = !!(x.kode || x.email || x.daftar); x.kunci = sswKunciBaris_(x); });
  return { rows: rows, namaRombel: namaRombel };
}

// Cocokkan setiap baris Belajar Mandiri dengan satu warga belajar MENU.
function sswCocokkan_(bm, menu) {
  var perNisn = {}, perKompak = {};
  menu.wb.forEach(function (w) {
    if (w.nisn) perNisn[w.nisn] = w;
    var k = sswKompak_(w.nama); (perKompak[k] = perKompak[k] || []).push(w);
  });
  bm.rows.forEach(function (r) {
    var w = r.nisn ? perNisn[r.nisn] : null, cara = w ? 'NISN' : '';
    if (!w) {
      var kand = perKompak[sswKompak_(r.nama)] || [];
      var dekat = kand.filter(function (x) { return sswSelisihHari_(x.tgl, r.tgl) <= 1; });
      if (dekat.length === 1) { w = dekat[0]; cara = 'Nama + tgl lahir'; }
      else if (kand.length === 1) { w = kand[0]; cara = 'Nama sama (tgl lahir beda)'; }
    }
    if (!w) {
      var mirip = menu.wb.filter(function (x) { return sswMirip_(x.nama, r.nama) && sswSelisihHari_(x.tgl, r.tgl) <= 1; });
      if (mirip.length === 1) { w = mirip[0]; cara = 'Nama mirip + tgl lahir'; }
    }
    r.wb = w || null; r.caraCocok = cara;
  });
}

// ---------------------------------------------------------------- rencana sinkron
function sswRencana_() {
  var menu = sswBacaMenu_(), bm = sswBacaBm_();
  sswCocokkan_(bm, menu);
  var rencana = { keBm: [], keMenu: [], tglDibetulkan: [], perluCek: [], calonKeMenu: [], hanyaMenu: 0, adaKolomEmail: menu.K.email >= 0 };
  var dipakaiWb = {};
  bm.rows.forEach(function (r) {
    var w = r.wb;
    if (!w) return;
    dipakaiWb[w.baris] = dipakaiWb[w.baris] || [];
    dipakaiWb[w.baris].push(r);
    // MENU -> BM: lengkapi yang kosong
    if (!r.nisn && w.nisn) rencana.keBm.push({ baris: r.baris, kunci: r.kunci, nama: r.nama, kolom: 'NISN', nilai: w.nisn, kol: SSW.S_NISN + 1 });
    if (!r.tgl && w.tgl) rencana.keBm.push({ baris: r.baris, kunci: r.kunci, nama: r.nama, kolom: 'Tanggal Lahir', nilai: w.tgl, kol: SSW.S_TGL + 1 });
    // tanggal lahir selisih tepat 1 hari pada baris yang belum pernah login -> samakan dengan MENU
    var sel = (r.tgl && w.tgl) ? sswSelisihHari_(r.tgl, w.tgl) : 0;
    var adaKembar = bm.rows.some(function (o) { return o !== r && o.rombel === r.rombel && sswKompak_(o.nama) === sswKompak_(r.nama); });
    if (sel === 1 && !r.terdaftar && !adaKembar) rencana.tglDibetulkan.push({ baris: r.baris, kunci: r.kunci, nama: r.nama, lama: r.tgl, baru: w.tgl });
    // perbedaan yang tidak boleh diputuskan otomatis
    if (r.nisn && w.nisn && r.nisn !== w.nisn) rencana.perluCek.push({ nama: r.nama, kolom: 'NISN', bm: r.nisn, menu: w.nisn, ket: '' });
    if (sel > 1 || (sel === 1 && (r.terdaftar || adaKembar))) rencana.perluCek.push({ nama: r.nama, kolom: 'Tanggal Lahir', bm: r.tgl, menu: w.tgl, ket: adaKembar ? 'Ada data ganda, selesaikan lewat Analisa Data Ganda' : (r.terdaftar ? 'Baris BM sudah dipakai login (kata sandi = tanggal ini)' : '') });
    if (w.namaRombel && sswKunciKelas_(w.namaRombel) !== sswKunciKelas_(r.namaRombel)) rencana.perluCek.push({ nama: r.nama, kolom: 'Rombel', bm: r.namaRombel, menu: w.namaRombel, ket: '', kunci: r.kunci, bisaSamakan: true });
    if (normNama_(r.nama) !== normNama_(w.nama)) rencana.perluCek.push({ nama: r.nama, kolom: 'Nama', bm: r.nama, menu: w.nama, ket: 'Ejaan nama berbeda', kunci: r.kunci, bisaSamakan: true });
  });
  // BM -> MENU: lengkapi yang kosong (ambil dari baris BM yang sudah terdaftar lebih dulu)
  menu.wb.forEach(function (w) {
    var daftar = dipakaiWb[w.baris];
    if (!daftar) { rencana.hanyaMenu++; return; }
    daftar = daftar.slice().sort(function (a, b) { return (b.terdaftar ? 1 : 0) - (a.terdaftar ? 1 : 0); });
    function ambil(f) { for (var i = 0; i < daftar.length; i++) if (daftar[i][f]) return daftar[i][f]; return ''; }
    if (!w.nisn && ambil('nisn') && menu.K.nisn >= 0) rencana.keMenu.push({ baris: w.baris, nama: w.nama, kolom: 'NISN', nilai: ambil('nisn'), kol: menu.K.nisn + 1 });
    if (!w.tgl && ambil('tgl')) rencana.keMenu.push({ baris: w.baris, nama: w.nama, kolom: 'TANGGAL LAHIR', nilai: ambil('tgl'), kol: menu.K.tgl + 1 });
    if (!w.hp && ambil('hp') && menu.K.hp >= 0) rencana.keMenu.push({ baris: w.baris, nama: w.nama, kolom: 'NO HP', nilai: ambil('hp'), kol: menu.K.hp + 1 });
    if (!w.email && ambil('email')) rencana.keMenu.push({ baris: w.baris, nama: w.nama, kolom: 'EMAIL', nilai: ambil('email'), kol: menu.K.email >= 0 ? menu.K.email + 1 : 0 });
  });
  // siswa yang hanya ada di BM: calon dikirim ke MENU (butuh persetujuan admin)
  bm.rows.forEach(function (r) {
    if (r.wb) return;
    var kembar = bm.rows.some(function (o) { return o !== r && o.wb && sswMirip_(o.nama, r.nama); });
    rencana.calonKeMenu.push({ kunci: r.kunci, nama: r.nama, rombel: r.namaRombel, tgl: r.tgl, nisn: r.nisn, kontak: r.kontak, terdaftar: r.terdaftar, curigaGanda: kembar });
  });
  return { rencana: rencana, menu: menu, bm: bm };
}

// ---------------------------------------------------------------- terapkan
function sswRiwayat_(baris) {
  if (!baris.length) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SSW.TAB_RIWAYAT);
  if (!sh) {
    sh = ss.insertSheet(SSW.TAB_RIWAYAT);
    sh.getRange(1, 1, 1, 7).setValues([['Waktu', 'Arah', 'Nama', 'Kolom', 'Nilai lama', 'Nilai baru', 'Oleh']]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  var awal = sh.getLastRow() + 1;
  sh.getRange(awal, 1, baris.length, 7).setNumberFormat('@').setValues(baris);
}

function sswTerapkan_(oleh) {
  var kunci = LockService.getScriptLock();
  kunci.waitLock(30000);
  try {
    var x = sswRencana_(), r = x.rencana, menu = x.menu;
    var waktu = waktuSekarang_(), log = [];
    var shS = getSheet(CONFIG.SHEETS.SISWA);
    // MENU -> BM (hanya sel kosong; cek ulang sebelum menulis)
    r.keBm.forEach(function (u) {
      var c = shS.getRange(u.baris, u.kol);
      if (String(c.getValue()).trim() !== '') return;
      c.setNumberFormat('@').setValue(u.nilai);
      log.push([waktu, 'Data Induk → BM', u.nama, u.kolom, '', u.nilai, oleh]);
    });
    r.tglDibetulkan.forEach(function (u) {
      var c = shS.getRange(u.baris, SSW.S_TGL + 1);
      if (sswTgl_(c.getValue(), Session.getScriptTimeZone()) !== u.lama) return;
      if (String(shS.getRange(u.baris, SSW.S_KODE + 1).getValue()).trim()) return;
      c.setNumberFormat('@').setValue(u.baru);
      log.push([waktu, 'Data Induk → BM (betulkan tgl)', u.nama, 'Tanggal Lahir', u.lama, u.baru, oleh]);
    });
    // BM -> MENU (hanya sel kosong)
    var perluEmail = r.keMenu.some(function (u) { return u.kolom === 'EMAIL'; });
    var kolEmail = menu.K.email >= 0 ? menu.K.email + 1 : 0;
    if (perluEmail && !kolEmail) {
      var lastCol = menu.sh.getLastColumn();
      if (menu.sh.getMaxColumns() <= lastCol) menu.sh.insertColumnAfter(lastCol);
      kolEmail = lastCol + 1;
      menu.sh.getRange(1, kolEmail).setValue('EMAIL').setFontWeight('bold');
      log.push([waktu, 'BM → Data Induk', '-', 'EMAIL', '', 'kolom EMAIL ditambahkan di WARGA BELAJAR', oleh]);
    }
    r.keMenu.forEach(function (u) {
      var kol = u.kolom === 'EMAIL' ? kolEmail : u.kol;
      if (!kol) return;
      var c = menu.sh.getRange(u.baris, kol);
      if (String(c.getValue()).trim() !== '') return;
      if (u.kolom !== 'TANGGAL LAHIR') c.setNumberFormat('@');
      c.setValue(u.nilai);
      log.push([waktu, 'BM → Data Induk', u.nama, u.kolom, '', u.nilai, oleh]);
    });
    sswRiwayat_(log);
    PropertiesService.getScriptProperties().setProperty('SINKRON_SISWA_TERAKHIR', waktu);
    return { dilengkapiBm: r.keBm.length, tglDibetulkan: r.tglDibetulkan.length, dilengkapiMenu: r.keMenu.length, perluCek: r.perluCek.length, calonKeMenu: r.calonKeMenu.length, tercatat: log.length, waktu: waktu };
  } finally {
    kunci.releaseLock();
  }
}

// dipanggil dari jalankanSinkron_ (trigger 15 menit)
function sinkronSiswaDuaArah_() {
  var h = sswTerapkan_('Sistem');
  var out = [];
  if (h.tercatat) out.push(h.tercatat + ' isian siswa dilengkapi (lihat tab ' + SSW.TAB_RIWAYAT + ')');
  return out;
}

// ---------------------------------------------------------------- API admin: sinkron
function waAdminSinkronSiswaPratinjau(token) {
  wajibAdmin_(token);
  var r = sswRencana_().rencana;
  r.terakhir = PropertiesService.getScriptProperties().getProperty('SINKRON_SISWA_TERAKHIR') || '';
  return r;
}

function waAdminSinkronSiswaTerapkan(token) {
  var adm = wajibAdmin_(token);
  var h = sswTerapkan_(adm.nama || 'Admin');
  catat_('Admin', adm.id, adm.nama, 'Sinkron siswa dua arah', h.tercatat + ' isian dilengkapi, ' + h.perluCek + ' perlu dicek', 'OK');
  return h;
}

function waAdminKirimKeMenu(token, kunciBaris) {
  var adm = wajibAdmin_(token);
  var kunci = LockService.getScriptLock();
  kunci.waitLock(30000);
  try {
    var x = sswRencana_();
    var r = x.bm.rows.filter(function (b) { return b.kunci === kunciBaris; })[0];
    if (!r) throw new Error('Data siswa sudah berubah. Muat ulang daftar lalu coba lagi.');
    if (r.wb) throw new Error(r.nama + ' sudah ada di Data Induk.');
    var menu = x.menu, head = menu.head;
    var idRombel = '';
    Object.keys(menu.rombel).forEach(function (id) { if (sswKunciKelas_(menu.rombel[id]) === sswKunciKelas_(r.namaRombel)) idRombel = id; });
    if (!idRombel) throw new Error('Rombel "' + r.namaRombel + '" tidak ditemukan di tab SIM ROMBEL.');
    var kolEmail = menu.K.email;
    if (r.email && kolEmail < 0) {
      var lastCol = menu.sh.getLastColumn();
      if (menu.sh.getMaxColumns() <= lastCol) menu.sh.insertColumnAfter(lastCol);
      menu.sh.getRange(1, lastCol + 1).setValue('EMAIL').setFontWeight('bold');
      head = head.concat(['EMAIL']); kolEmail = lastCol;
    }
    var baris = head.map(function () { return ''; });
    function isi(k, v) { if (k >= 0) baris[k] = v; }
    isi(menu.K.id, 'WB-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8));
    isi(menu.K.nisn, r.nisn);
    isi(menu.K.nama, r.nama.toUpperCase());
    isi(menu.K.tgl, r.tgl);
    isi(menu.K.rombel, idRombel);
    isi(menu.K.hp, r.hp);
    isi(menu.K.status, 'Aktif');
    isi(kolEmail, r.email);
    var b = menu.sh.getLastRow() + 1;
    [menu.K.id, menu.K.nisn, menu.K.hp].forEach(function (k) { if (k >= 0) menu.sh.getRange(b, k + 1).setNumberFormat('@'); });
    menu.sh.getRange(b, 1, 1, baris.length).setValues([baris]);
    sswRiwayat_([[waktuSekarang_(), 'BM → Data Induk (siswa baru)', r.nama, 'Semua', '', r.namaRombel + ' · ' + r.tgl, adm.nama || 'Admin']]);
    catat_('Admin', adm.id, adm.nama, 'Kirim siswa ke Data Induk', r.nama + ' (' + r.namaRombel + ')', 'OK');
    return { ok: true, nama: r.nama };
  } finally {
    kunci.releaseLock();
  }
}

// ---------------------------------------------------------------- analisa data ganda
function sswDaftarAbaikan_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(SSW.PROP_ABAIKAN) || '[]'); } catch (e) { return []; }
}
function sswKunciPasangan_(a, b) { return [sswKompak_(a.nama) + '/' + a.tgl, sswKompak_(b.nama) + '/' + b.tgl].sort().join('~'); }

function sswAnalisaGanda_() {
  var menu = null;
  try { menu = sswBacaMenu_(); } catch (e) { menu = null; }
  var bm = sswBacaBm_();
  if (menu) sswCocokkan_(bm, menu);
  var abaikan = {}; sswDaftarAbaikan_().forEach(function (k) { abaikan[k] = true; });
  var rows = bm.rows, hasil = [];
  for (var i = 0; i < rows.length; i++) {
    for (var j = i + 1; j < rows.length; j++) {
      var a = rows[i], b = rows[j], alasan = [];
      var mirip = sswMirip_(a.nama, b.nama), sama = sswKompak_(a.nama) === sswKompak_(b.nama);
      var sel = sswSelisihHari_(a.tgl, b.tgl);
      if (a.wb && b.wb && a.wb.baris === b.wb.baris) alasan.push('Keduanya cocok dengan siswa yang sama di Data Induk');
      if (sama && sel === 0) alasan.push('Nama dan tanggal lahir sama');
      else if (mirip && sel <= 1) alasan.push(sel === 0 ? 'Nama mirip, tanggal lahir sama' : 'Nama ' + (sama ? 'sama' : 'mirip') + ', tanggal lahir selisih 1 hari');
      else if (sama) alasan.push('Nama sama, tanggal lahir berbeda');
      if (a.nisn && a.nisn === b.nisn) alasan.push('NISN sama');
      if (a.email && a.email === b.email) alasan.push('Email sama');
      if (!alasan.length) continue;
      var kp = sswKunciPasangan_(a, b);
      if (abaikan[kp]) continue;
      var pertahankan = (b.terdaftar && !a.terdaftar) ? 'b' : 'a';
      hasil.push({ kunciPasangan: kp, alasan: alasan, saran: pertahankan, a: sswRingkas_(a), b: sswRingkas_(b), menu: (a.wb || b.wb) ? sswRingkasWb_(a.wb || b.wb) : null });
    }
  }
  hasil.sort(function (x, y) { return y.alasan.length - x.alasan.length; });
  return hasil;
}
function sswRingkas_(r) {
  return { kunci: r.kunci, baris: r.baris, nama: r.nama, tgl: r.tgl, rombel: r.rombel, namaRombel: r.namaRombel, nisn: r.nisn, kontak: r.kontak, kode: r.kode ? 'ada' : '', daftar: r.daftar, terdaftar: r.terdaftar };
}
function sswRingkasWb_(w) { return { nama: w.nama, tgl: w.tgl, namaRombel: w.namaRombel, nisn: w.nisn, hp: w.hp, email: w.email }; }

// menggantikan fungsi lama: tetap menulis ke tab 'Analisa Ganda' (dipakai sinkron otomatis)
function analisaDataGanda() {
  var hasil = sswAnalisaGanda_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Analisa Ganda') || ss.insertSheet('Analisa Ganda');
  sh.clear();
  var isi = [['Indikasi', 'Baris A', 'Rombel A', 'Nama A', 'Tgl Lahir A', 'Terdaftar A', 'Baris B', 'Rombel B', 'Nama B', 'Tgl Lahir B', 'Terdaftar B', 'Data Induk']];
  hasil.forEach(function (p) {
    isi.push([p.alasan.join('; '), p.a.baris, p.a.namaRombel, p.a.nama, p.a.tgl, p.a.terdaftar ? 'Ya' : '', p.b.baris, p.b.namaRombel, p.b.nama, p.b.tgl, p.b.terdaftar ? 'Ya' : '',
      p.menu ? (p.menu.nama + ' · ' + p.menu.namaRombel + ' · ' + p.menu.tgl) : '(tidak ada di Data Induk)']);
  });
  if (!hasil.length) isi.push(['Tidak ditemukan indikasi data ganda', '', '', '', '', '', '', '', '', '', '', '']);
  sh.getRange(1, 1, isi.length, 12).setNumberFormat('@').setValues(isi);
  sh.getRange(1, 1, 1, 12).setFontWeight('bold');
  sh.getRange(isi.length + 2, 1).setValue('Dianalisis ' + waktuSekarang_());
  return hasil.length;
}

function waAdminGandaDaftar(token) {
  wajibAdmin_(token);
  var nr = sswBacaBm_().namaRombel;
  return { pasangan: sswAnalisaGanda_(), waktu: waktuSekarang_(), rombel: Object.keys(nr).map(function (id) { return { id: id, nama: nr[id] }; }) };
}

function waAdminGandaAbaikan(token, kunciPasangan) {
  var adm = wajibAdmin_(token);
  var d = sswDaftarAbaikan_();
  if (d.indexOf(kunciPasangan) < 0) d.push(kunciPasangan);
  PropertiesService.getScriptProperties().setProperty(SSW.PROP_ABAIKAN, JSON.stringify(d.slice(-500)));
  catat_('Admin', adm.id, adm.nama, 'Tandai bukan data ganda', kunciPasangan, 'OK');
  return true;
}

// pilihan = { simpan: kunci baris yang dipertahankan, hapus: kunci baris yang dihapus, nama, tgl, idRombel }
function waAdminGandaGabung(token, pilihan) {
  var adm = wajibAdmin_(token);
  var kunci = LockService.getScriptLock();
  kunci.waitLock(30000);
  try {
    var bm = sswBacaBm_();
    var simpan = bm.rows.filter(function (r) { return r.kunci === pilihan.simpan; })[0];
    var hapus = bm.rows.filter(function (r) { return r.kunci === pilihan.hapus; })[0];
    if (!simpan || !hapus || simpan.baris === hapus.baris) throw new Error('Data siswa sudah berubah. Muat ulang analisa lalu coba lagi.');
    if (pilihan.idRombel && !bm.namaRombel[pilihan.idRombel]) throw new Error('Rombel pilihan tidak ditemukan.');
    if (pilihan.tgl && !/^\d{4}-\d{2}-\d{2}$/.test(pilihan.tgl)) throw new Error('Format tanggal lahir harus yyyy-mm-dd.');
    var sh = getSheet(CONFIG.SHEETS.SISWA), ss = sh.getParent();
    var lebar = Math.max(sh.getLastColumn(), 7);
    var nilaiHapus = sh.getRange(hapus.baris, 1, 1, lebar).getValues()[0];
    var nilaiSimpan = sh.getRange(simpan.baris, 1, 1, lebar).getValues()[0];
    // cadangkan baris yang akan dihapus
    var cad = ss.getSheetByName(SSW.TAB_CADANGAN) || ss.insertSheet(SSW.TAB_CADANGAN);
    if (cad.getLastRow() === 0) cad.getRange(1, 1, 1, lebar + 2).setValues([['Dihapus pada', 'Digabung ke'].concat(getSheetData(CONFIG.SHEETS.SISWA)[0].slice(0, lebar))]).setFontWeight('bold');
    cad.getRange(cad.getLastRow() + 1, 1, 1, lebar + 2).setNumberFormat('@').setValues([[waktuSekarang_(), simpan.nama + ' (baris ' + simpan.baris + ')'].concat(nilaiHapus.map(function (v) { return v instanceof Date ? sTeks_(v) : String(v); }))]);
    // lengkapi kolom kosong baris yang dipertahankan dari baris yang dihapus
    var lama = { nama: simpan.nama, tgl: simpan.tgl, rombel: simpan.rombel };
    [SSW.S_KODE, SSW.S_KONTAK, SSW.S_DAFTAR, SSW.S_NISN].forEach(function (k) {
      if (String(nilaiSimpan[k] == null ? '' : nilaiSimpan[k]).trim() === '' && String(nilaiHapus[k] == null ? '' : nilaiHapus[k]).trim() !== '') {
        sh.getRange(simpan.baris, k + 1).setNumberFormat('@').setValue(nilaiHapus[k] instanceof Date ? sTeks_(nilaiHapus[k]) : String(nilaiHapus[k]));
      }
    });
    if (pilihan.nama && pilihan.nama !== simpan.nama) sh.getRange(simpan.baris, SSW.S_NAMA + 1).setNumberFormat('@').setValue(pilihan.nama);
    if (pilihan.tgl && pilihan.tgl !== simpan.tgl) sh.getRange(simpan.baris, SSW.S_TGL + 1).setNumberFormat('@').setValue(pilihan.tgl);
    if (pilihan.idRombel && pilihan.idRombel !== simpan.rombel) sh.getRange(simpan.baris, SSW.S_ROMBEL + 1).setNumberFormat('@').setValue(pilihan.idRombel);
    sh.deleteRow(hapus.baris);
    // v1.40.2: jawaban, absensi, chat, ujian, profil, PIN, perangkat ikut dipindah ke identitas yang dipertahankan
    var akhir = { nama: pilihan.nama || simpan.nama, rombel: pilihan.idRombel || simpan.rombel }, jejak = {};
    try {
      jejak = idsPindahJejak_({ nama: hapus.nama, rombel: hapus.rombel }, akhir);
      var j2 = idsPindahJejak_({ nama: simpan.nama, rombel: simpan.rombel }, akhir);
      Object.keys(j2).forEach(function(k) { jejak[k] = (jejak[k] || 0) + j2[k]; });
    } catch (eJ) {}
    var ket = hapus.nama + ' (' + hapus.namaRombel + ', ' + hapus.tgl + ') digabung ke ' + (pilihan.nama || simpan.nama) + (Object.keys(jejak).length ? ' · jejak dipindah: ' + JSON.stringify(jejak) : '');
    sswRiwayat_([[waktuSekarang_(), 'Gabung data ganda', pilihan.nama || simpan.nama, 'Nama/Tgl/Rombel', [lama.nama, lama.tgl, lama.rombel].join(' · '), [pilihan.nama || lama.nama, pilihan.tgl || lama.tgl, pilihan.idRombel || lama.rombel].join(' · '), adm.nama || 'Admin']]);
    catat_('Admin', adm.id, adm.nama, 'Gabung data siswa ganda', ket, 'OK');
    return { ok: true, ket: ket };
  } finally {
    kunci.releaseLock();
  }
}
