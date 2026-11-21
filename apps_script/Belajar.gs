// ============================================================================
// RIWAYAT BELAJAR DI SUPABASE (v1.92.0, F1 "pindah domain belajar" - tahap baca)
// ----------------------------------------------------------------------------
// Aplikasi 1.92+ membaca riwayat jawaban siswa (hasil yang sama dengan waGetRiwayatJawaban) langsung
// dari Supabase (fungsi riwayat_baca), tidak lewat Apps Script. Sumber kebenaran tetap tab Jawaban,
// Absensi, Buka Sesi & susulan massal; di sini isinya disalin ke Supabase:
//   - pemicu bljPemicu tiap menit: sinkron INKREMENTAL (hanya pasang siswa-mapel yang berubah) bila ada tanda
//     "kotor", paling sering tiap 2 menit & tetap tiap 30 menit; sinkron PENUH sekali sehari pukul 01-04 WIB.
//     Pemicu dipasang otomatis oleh pemicu tiap jam yang sudah ada (bljPastikanPemicu_).
//   - tanda "kotor" dipasang saat data belajar berubah (riwayatLupakan_, versi data, jawaban, buka sesi,
//     susulan massal). Tidak ada panggilan Supabase di jalur permintaan pengguna (produksi tidak melambat).
//     Sesudah siswa sendiri mengirim jawaban/absensi, aplikasi memakai jalur lama untuk mapel itu ±5 menit.
// Siswa membuktikan identitas ke Supabase dengan "tanda belajar" (HMAC, berlaku 7 hari) yang ikut
// dikirim saat login / pulih sesi. Kunci HMAC ada di Script Property SESI_KUNCI dan di Supabase
// (private.konfig), tidak pernah di repo. Bila Supabase tidak terjangkau, aplikasi memakai jalur lama.
// Sekali saja (dari editor Apps Script): jalankan belajarSiapkan().
// ============================================================================
var BLJ = {
  PROP_KUNCI: 'SESI_KUNCI',
  PROP_AKHIR: 'BLJ_SINKRON_TERAKHIR',
  PROP_PENUH: 'BLJ_SINKRON_PENUH',
  KOTOR: 'blj_kotor',
  HARI_TANDA: 7,
  JEDA_MS: 120000,          // sinkron penuh paling sering tiap 2 menit
  BERKALA_MS: 30 * 60000    // dan paling jarang tiap 30 menit
};

function bljHex_(bytes) {
  return bytes.map(function(b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function bljKunci_() {
  try { return PropertiesService.getScriptProperties().getProperty(BLJ.PROP_KUNCI) || ''; } catch (e) { return ''; }
}

// Tanda belajar siswa: v1.<exp_ms>.<hex nama-normal>.<hmac-sha256 hex>. '' bila kunci belum disiapkan.
function bljTanda_(nama) {
  try {
    var k = bljKunci_();
    if (!k || !nama) return '';
    var exp = Date.now() + BLJ.HARI_TANDA * 86400000;
    var pesan = 'v1.' + exp + '.' + bljHex_(Utilities.newBlob(normNama_(nama)).getBytes());
    return pesan + '.' + bljHex_(Utilities.computeHmacSha256Signature(pesan, k, Utilities.Charset.UTF_8));
  } catch (e) { return ''; }
}

// Tandai data belajar berubah: sinkron penuh berikutnya akan berjalan (bljPemicu).
function bljKotor_() {
  try { CacheService.getScriptCache().put(BLJ.KOTOR, String(Date.now()), 21600); } catch (e) {}
}

function bljKirim_(baris, penuh, ms, buka, massal) {
  try {
    var rahasia = pndRahasia_();
    if (!rahasia) return 0;
    var res = UrlFetchApp.fetch(PND.URL + '/rest/v1/rpc/riwayat_set', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { apikey: PND.KUNCI_PUBLIK },
      payload: JSON.stringify({
        p_baris: baris || [], p_penuh: !!penuh, p_dihitung_ms: Math.round(ms),
        p_buka: buka || [], p_massal: massal || [], p_rahasia: rahasia
      })
    });
    return res.getResponseCode();
  } catch (e) { return 0; }
}

// Riwayat MENTAH semua siswa (bentuk sama dengan riwayatHitung_, sebelum saring syarat bayar) dari satu kali
// baca tab Jawaban & Absensi. Hasil: { 'idMapel|kunciNama': { m, k, nama, d } }.
function bljMentah_() {
  var per = {};
  function ambil(m, nama) {
    var k = m + '|' + normNama_(nama);
    if (!per[k]) per[k] = { m: m, k: normNama_(nama), nama: String(nama), d: {} };
    return per[k];
  }
  var v = getSheet(CONFIG.SHEETS.JAWABAN).getDataRange().getValues();
  var hd = v.length ? v[0].map(function(x) { return String(x).trim(); }) : [];
  var kKom = hd.indexOf('Komentar Tutor'), kPen = hd.indexOf('Dinilai Oleh'), kWkt = hd.indexOf('Waktu Dinilai');
  for (var i = 1; i < v.length; i++) {
    var row = v[i], m = String(row[1]), nama = row[6];
    if (!m || typeof nama !== 'string' || !nama.trim()) continue;
    var item = { jawaban: riwayatPrim_(row[7]), nilai: riwayatPrim_(row[8]), waktu: riwayatPrim_(row[9]), waktuMs: (row[9] instanceof Date ? row[9].getTime() : 0) };
    if (kKom >= 0 && String(row[8]).trim() !== '') {
      item.komentar = riwayatPrim_(row[kKom]);
      item.penilai = kPen >= 0 ? riwayatPrim_(row[kPen]) : '';
      item.waktuNilai = kWkt >= 0 ? riwayatPrim_(row[kWkt]) : '';
    }
    ambil(m, nama).d[String(row[3])] = item;
  }
  try {
    if (typeof abBaca_ === 'function') abBaca_(null).forEach(function(r) {
      if (!r.idMapel) return;
      ambil(r.idMapel, r.nama).d[abIdItem_(r.smt, r.n)] = { jawaban: r.status, nilai: '', waktu: r.waktu, waktuMs: r.waktuMs, catatan: r.catatan };
    });
  } catch (eA) {}
  bljWaktu_('baca jawaban+absensi');
  return per;
}

// Saring syarat bayar (logika sama dengan sbSaringRiwayat_) untuk sebagian kunci saja; jadwal ujian & mapel aktif
// dibaca SEKALI (sbSaringRiwayat_ membaca tab jadwal pada setiap panggilan). Hasil: baris kirim + daftar kunci
// yang memuat nilai tertahan (dicek ulang setiap sinkron, karena siswa bisa melunasi kapan saja).
function bljSaring_(per, kunci) {
  var jad = {}, rombel = {}, tahan = [];
  if (kunci.length) {
    try { ujJadwalSemua_().forEach(function(x) { if (x.masa) { var m = String(x.idMapel); (jad[m] = jad[m] || {})[String(x.idUjian)] = x; } }); } catch (eU) {}
    try { mapelAktifSemua_().forEach(function(x) { rombel[String(x.idMapel)] = x.idRombel; }); } catch (eM) {}
  }
  var baris = kunci.map(function(k) {
    var e = per[k], j = jad[e.m], idR = rombel[e.m];
    if (j && idR) {
      var ada = false;
      Object.keys(e.d).forEach(function(id) {
        var it = e.d[id];
        if (id.indexOf('__') === 0 || !it || it.nilai === '' || it.nilai === undefined || !j[id]) return;
        try { if (sbTertahan_(j[id], idR, e.nama)) { it.nilai = '**'; it.tertahan = true; ada = true; } } catch (eS) {}
      });
      if (ada) tahan.push(k);
    }
    return { m: e.m, k: e.k, d: e.d };
  });
  bljWaktu_('syarat bayar (' + kunci.length + ' pasang)');
  return { baris: baris, tahan: tahan };
}

// Sidik ringkas isi mentah satu pasang (untuk mendeteksi perubahan antar-sinkron).
function bljSidik_(e) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(e.d), Utilities.Charset.UTF_8)).slice(0, 12);
}

// Status sinkron terakhir di cache (sidik per pasang + kunci bernilai tertahan). null bila hilang/kedaluwarsa.
function bljStatusBaca_() {
  try { var s = CacheService.getScriptCache().get('blj_status'); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}
function bljStatusTulis_(sidik, tahan) {
  try {
    var s = JSON.stringify({ s: sidik, t: tahan }), c = CacheService.getScriptCache();
    if (s.length < 95000) c.put('blj_status', s, 21600); else c.remove('blj_status');
  } catch (e) {}
}

// Pengukur waktu per tahap (Logger, terlihat di Executions).
var BLJ_T0_ = 0;
function bljWaktu_(tahap) {
  var now = Date.now();
  if (tahap) Logger.log('[blj] ' + tahap + ': ' + (now - BLJ_T0_) + ' ms');
  BLJ_T0_ = now;
}

function bljBukaSemua_(now) {
  var out = [];
  try {
    taBacaBuka_().forEach(function(b) {
      if (!b.dicabut && b.berlakuMs > now && b.idMapel && b.nama) out.push({ m: b.idMapel, k: normNama_(b.nama), s: b.sesi, b: b.berlakuMs });
    });
  } catch (e) {}
  return out;
}

function bljMassalSemua_(now) {
  var out = [];
  try {
    var s = ssmBaca_();
    if (!s || s.diakhiri || !(s.sampaiMs > now)) return out;
    var sesi = taDaftar_(taBaca_(), now).filter(function(x) { return x.selesaiMs <= s.dariMs; }).map(function(x) { return x.nama; });
    if (!sesi.length) return out;
    var sudah = {};
    mapelAktifSemua_().forEach(function(x) {
      var m = String(x.idMapel);
      if (sudah[m]) return;
      sudah[m] = true;
      if (!ssmRombelMasuk_(s, ssmRombelMapel_(m))) return;
      sesi.forEach(function(n) { out.push({ m: m, s: n, d: s.dariMs, z: s.sampaiMs }); });
    });
  } catch (e) {}
  return out;
}

// Sinkron. penuh=true: semua pasang dihitung & dikirim, baris lama di Supabase dibuang (malam hari, atau bila
// status di cache hilang). penuh=false (inkremental): hanya pasang yang isinya berubah, yang hilang, atau yang
// punya nilai tertahan. Hasil: kode HTTP (200 = berhasil).
function bljSinkron_(penuh) {
  var mulai = Date.now();
  bljWaktu_('');
  var per = bljMentah_(), lama = penuh ? null : bljStatusBaca_();
  if (!lama) penuh = true;
  var sidik = {}, kunci = [], hapus = [];
  Object.keys(per).forEach(function(k) {
    sidik[k] = bljSidik_(per[k]);
    if (penuh || lama.s[k] !== sidik[k] || lama.t.indexOf(k) >= 0) kunci.push(k);
  });
  if (!penuh) Object.keys(lama.s).forEach(function(k) {
    if (!per[k]) { var i = k.indexOf('|'); hapus.push({ m: k.slice(0, i), k: k.slice(i + 1), d: {} }); }
  });
  var hasil = bljSaring_(per, kunci);
  var buka = bljBukaSemua_(mulai), massal = bljMassalSemua_(mulai);
  var kode = bljKirim_(hasil.baris.concat(hapus), penuh, mulai, buka, massal);
  bljWaktu_((penuh ? 'kirim penuh ' : 'kirim inkremental ') + (hasil.baris.length + hapus.length) + ' pasang (HTTP ' + kode + ')');
  if (kode === 200) {
    bljStatusTulis_(sidik, hasil.tahan);
    var sp = PropertiesService.getScriptProperties();
    try {
      sp.setProperty(BLJ.PROP_AKHIR, String(mulai));
      if (penuh) sp.setProperty(BLJ.PROP_PENUH, String(mulai));
    } catch (e) {}
  }
  return kode;
}
function bljSinkronPenuh_() { return bljSinkron_(true); }

// Pemicu waktu (tiap menit). Hampir selalu selesai seketika:
//   - sinkron PENUH sekali sehari pukul 01-04 WIB (atau bila status di cache hilang)
//   - sinkron INKREMENTAL bila ada tanda "kotor" sejak sinkron terakhir (paling sering tiap BLJ.JEDA_MS),
//     dan tetap tiap BLJ.BERKALA_MS (nilai tertahan yang mungkin sudah dilunasi)
function bljPemicu() {
  if (!bljKunci_()) return;
  var sp = PropertiesService.getScriptProperties(), now = Date.now(), akhir = 0, akhirPenuh = 0, kotor = 0;
  try { akhir = Number(sp.getProperty(BLJ.PROP_AKHIR) || 0); akhirPenuh = Number(sp.getProperty(BLJ.PROP_PENUH) || 0); } catch (e) {}
  try { kotor = Number(CacheService.getScriptCache().get(BLJ.KOTOR) || 0); } catch (e2) {}
  var jam = Number(Utilities.formatDate(new Date(now), 'Asia/Jakarta', 'H'));
  var penuh = now - akhirPenuh > 20 * 3600000 && jam >= 1 && jam <= 4;
  var inkremental = (kotor >= akhir && now - akhir >= BLJ.JEDA_MS) || now - akhir >= BLJ.BERKALA_MS;
  if (!penuh && !inkremental) return;
  // Sengaja TIDAK memakai LockService.getScriptLock(): kunci itu dipakai juga saat pengguna menyimpan data,
  // sehingga sinkron bisa menahan simpanan siswa/staf. Cukup penanda cache agar tidak dobel.
  var c = CacheService.getScriptCache();
  if (c.get('blj_jalan')) return;
  c.put('blj_jalan', '1', 300);
  try { bljSinkron_(penuh); } finally { c.remove('blj_jalan'); }
}

// Dipanggil pemicu tiap jam yang sudah ada (pemicuRilisApk, pemicuGatewayDoku): memasang bljPemicu bila
// kunci tanda belajar sudah disiapkan tetapi pemicunya belum ada. Tidak pernah melempar galat.
function bljPastikanPemicu_() {
  try {
    if (!bljKunci_()) return;
    var ada = ScriptApp.getProjectTriggers().some(function(t) { return t.getHandlerFunction() === 'bljPemicu'; });
    if (!ada) ScriptApp.newTrigger('bljPemicu').timeBased().everyMinutes(1).create();
  } catch (e) {}
}

// Jalankan SEKALI dari editor: membuat kunci tanda belajar, mengirimnya ke Supabase, memasang pemicu
// tiap menit, lalu sinkron penuh pertama. Aman dijalankan ulang (kunci lama dipakai, pemicu tidak dobel).
function belajarSiapkan() {
  var sp = PropertiesService.getScriptProperties();
  var k = sp.getProperty(BLJ.PROP_KUNCI);
  if (!k) {
    k = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    sp.setProperty(BLJ.PROP_KUNCI, k);
  }
  var res = UrlFetchApp.fetch(PND.URL + '/rest/v1/rpc/kunci_sesi_set', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: PND.KUNCI_PUBLIK },
    payload: JSON.stringify({ p_kunci: k, p_rahasia: pndRahasia_() })
  });
  Logger.log('kunci_sesi_set: HTTP ' + res.getResponseCode());
  var ada = ScriptApp.getProjectTriggers().some(function(t) { return t.getHandlerFunction() === 'bljPemicu'; });
  if (!ada) ScriptApp.newTrigger('bljPemicu').timeBased().everyMinutes(1).create();
  Logger.log('pemicu bljPemicu: ' + (ada ? 'sudah ada' : 'dipasang'));
  Logger.log('sinkron penuh: HTTP ' + bljSinkronPenuh_());
}

// Uji dari editor: tanda belajar untuk satu nama siswa lalu baca riwayatnya dari Supabase.
function belajarUji() {
  var nama = String(getSheetData(CONFIG.SHEETS.JAWABAN)[1][6] || ''), m = String(getSheetData(CONFIG.SHEETS.JAWABAN)[1][1] || '');
  var res = UrlFetchApp.fetch(PND.URL + '/rest/v1/rpc/riwayat_baca', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: PND.KUNCI_PUBLIK },
    payload: JSON.stringify({ p_id_mapel: m, p_tanda: bljTanda_(nama) })
  });
  var j = {};
  try { j = JSON.parse(res.getContentText()); } catch (e) {}
  var lama = waGetRiwayatJawaban(m, nama);
  var a = Object.keys((j && j.data) || {}).filter(function(x) { return x.indexOf('__') !== 0; }).sort().join(',');
  var b = Object.keys(lama).filter(function(x) { return x.indexOf('__') !== 0; }).sort().join(',');
  Logger.log('HTTP ' + res.getResponseCode() + ', sah=' + (j && j.sah) + ', butir sama=' + (a === b) + ' (' + a.split(',').length + ' butir)');
}

// Dari editor: sinkron penuh sekarang + catatan waktu per tahap di Log.
function belajarSinkronSekarang() {
  var t = Date.now();
  Logger.log('sinkron penuh: HTTP ' + bljSinkron_(true) + ', total ' + (Date.now() - t) + ' ms');
  t = Date.now();
  Logger.log('sinkron inkremental: HTTP ' + bljSinkron_(false) + ', total ' + (Date.now() - t) + ' ms');
}
