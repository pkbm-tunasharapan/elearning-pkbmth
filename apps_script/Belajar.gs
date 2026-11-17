// ============================================================================
// RIWAYAT BELAJAR DI SUPABASE (v1.92.0, F1 "pindah domain belajar" - tahap baca)
// ----------------------------------------------------------------------------
// Aplikasi 1.92+ membaca riwayat jawaban siswa (hasil yang sama dengan waGetRiwayatJawaban) langsung
// dari Supabase (fungsi riwayat_baca), tidak lewat Apps Script. Sumber kebenaran tetap tab Jawaban,
// Absensi, Buka Sesi & susulan massal; di sini isinya disalin ke Supabase:
//   - sinkron penuh oleh pemicu waktu bljPemicu (tiap menit memeriksa tanda "kotor", paling sering
//     tiap 2 menit; tetap berjalan tiap 30 menit sebagai pengaman)
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

// Hitung riwayat SEMUA siswa (bentuk sama dengan riwayatHitung_) dari satu kali baca tab.
function bljHitungSemua_() {
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
  // nilai ujian masa yang tertahan syarat bayar (sbSaringRiwayat_) hanya untuk mapel yang punya jadwal masa
  var masa = {};
  try { ujJadwalSemua_().forEach(function(x) { if (x.masa) masa[String(x.idMapel)] = true; }); } catch (eU) {}
  return Object.keys(per).map(function(k) {
    var e = per[k];
    if (masa[e.m]) { try { sbSaringRiwayat_(e.d, e.m, e.nama); } catch (eS) {} }
    return { m: e.m, k: e.k, d: e.d };
  });
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

// Sinkron penuh. Hasil: kode HTTP (200 = berhasil).
function bljSinkronPenuh_() {
  var mulai = Date.now();
  var kode = bljKirim_(bljHitungSemua_(), true, mulai, bljBukaSemua_(mulai), bljMassalSemua_(mulai));
  if (kode === 200) {
    try { PropertiesService.getScriptProperties().setProperty(BLJ.PROP_AKHIR, String(mulai)); } catch (e) {}
  }
  return kode;
}

// Pemicu waktu (tiap menit, dipasang belajarSiapkan). Cepat selesai bila tidak ada perubahan.
function bljPemicu() {
  if (!bljKunci_()) return;
  var now = Date.now(), akhir = 0, kotor = 0;
  try { akhir = Number(PropertiesService.getScriptProperties().getProperty(BLJ.PROP_AKHIR) || 0); } catch (e) {}
  try { kotor = Number(CacheService.getScriptCache().get(BLJ.KOTOR) || 0); } catch (e2) {}
  var berkala = now - akhir >= BLJ.BERKALA_MS;
  if (!berkala && (kotor < akhir || now - akhir < BLJ.JEDA_MS)) return;
  // Sengaja TIDAK memakai LockService.getScriptLock(): kunci itu dipakai juga saat pengguna menyimpan data,
  // sehingga sinkron (beberapa detik) bisa menahan simpanan siswa/staf. Cukup penanda cache agar tidak dobel.
  var c = CacheService.getScriptCache();
  if (c.get('blj_jalan')) return;
  c.put('blj_jalan', '1', 300);
  try { bljSinkronPenuh_(); } finally { c.remove('blj_jalan'); }
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
