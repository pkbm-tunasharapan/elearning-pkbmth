// ============================================================================
// RIWAYAT BELAJAR DI SUPABASE (v1.92.0, F1 "pindah domain belajar" - tahap baca)
// ----------------------------------------------------------------------------
// Aplikasi 1.92+ membaca riwayat jawaban siswa (hasil yang sama dengan waGetRiwayatJawaban) langsung
// dari Supabase (fungsi riwayat_baca), tidak lewat Apps Script. Sumber kebenaran tetap tab Jawaban,
// Absensi, Buka Sesi & susulan massal; di sini isinya disalin ke Supabase:
//   - pemicu bljPemicu tiap 5 menit: sinkron INKREMENTAL (hanya pasang siswa-mapel yang berubah) bila ada tanda
//     "kotor", dan tetap tiap 30 menit; sinkron PENUH sekali sehari pukul 01-04 WIB.
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
  PEMICU_MENIT: 5,          // pemicu bljPemicu tiap 5 menit
  JEDA_MS: 60000,          // jarak minimum antar-sinkron inkremental
  BERKALA_MS: 30 * 60000    // dan paling jarang tiap 30 menit
};

function bljHex_(bytes) {
  return bytes.map(function(b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function bljKunci_() {
  try { return PropertiesService.getScriptProperties().getProperty(BLJ.PROP_KUNCI) || ''; } catch (e) { return ''; }
}

// Tanda belajar siswa: v2.<exp_ms>.<hex nama-normal>.<hex id rombel>.<hmac-sha256 hex> (baca & tulis di Supabase).
// '' bila kunci belum disiapkan.
function bljTanda_(nama, idRombel) {
  try {
    var k = bljKunci_();
    if (!k || !nama) return '';
    var exp = Date.now() + BLJ.HARI_TANDA * 86400000;
    var pesan = 'v2.' + exp + '.' + bljHex_(Utilities.newBlob(normNama_(nama)).getBytes()) + '.' + bljHex_(Utilities.newBlob(String(idRombel || '').trim()).getBytes());
    return pesan + '.' + bljHex_(Utilities.computeHmacSha256Signature(pesan, k, Utilities.Charset.UTF_8));
  } catch (e) { return ''; }
}

// Tanda staf: st1.<exp_ms>.<hex id pengguna>.<hmac-sha256 hex> (penilaian diskusi di Supabase).
function bljTandaStaf_(idPengguna) {
  try {
    var k = bljKunci_();
    if (!k || !idPengguna) return '';
    var pesan = 'st1.' + (Date.now() + BLJ.HARI_TANDA * 86400000) + '.' + bljHex_(Utilities.newBlob(String(idPengguna)).getBytes());
    return pesan + '.' + bljHex_(Utilities.computeHmacSha256Signature(pesan, k, Utilities.Charset.UTF_8));
  } catch (e) { return ''; }
}

// Aplikasi staf mengambil tanda sekali per sesi (B3). Sesi lihat/intip tidak mendapat tanda.
function waStafTandaBelajar(token) {
  var p = stafDariToken_(token);
  if (globalThis.__INTIP) return { tanda: '' };
  return { tanda: bljTandaStaf_(p.id) };
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
    if (!per[k]) per[k] = { m: m, k: normNama_(nama), nama: String(nama), d: {}, j: {}, a: {}, t: [] };
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
    var e = ambil(m, nama);
    e.d[String(row[3])] = item;
    // baris mentah untuk tabel bl_jawaban (kunci ID Materi + nama persis; baris ganda: yang terakhir dipakai)
    e.j[String(row[3]) + '|' + nama] = {
      id: String(row[3]), nama: nama, r: sTeks_(row[0]).trim(), nm: sTeks_(row[2]), jd: sTeks_(row[4]), je: sTeks_(row[5]),
      jw: String(riwayatPrim_(row[7])), nl: String(riwayatPrim_(row[8])), wm: (row[9] instanceof Date ? row[9].getTime() : 0),
      ko: kKom >= 0 ? String(riwayatPrim_(row[kKom])) : '', pe: kPen >= 0 ? String(riwayatPrim_(row[kPen])) : '', wn: kWkt >= 0 ? String(riwayatPrim_(row[kWkt])) : ''
    };
  }
  try {
    if (typeof abBaca_ === 'function') abBaca_(null).forEach(function(r) {
      if (!r.idMapel) return;
      var e = ambil(r.idMapel, r.nama);
      e.d[abIdItem_(r.smt, r.n)] = { jawaban: r.status, nilai: '', waktu: r.waktu, waktuMs: r.waktuMs, catatan: r.catatan };
      e.a[r.smt + '|' + r.n] = { smt: r.smt, n: r.n, nama: r.nama, r: r.idRombel, st: r.status, w: r.waktu, c: r.catatan };
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
        try { if (sbTertahan_(j[id], idR, e.nama)) { it.nilai = '**'; it.tertahan = true; ada = true; e.t.push(id); } } catch (eS) {}
      });
      if (ada) tahan.push(k);
    }
    return { m: e.m, k: e.k, j: Object.keys(e.j).map(function(x) { return e.j[x]; }), a: Object.keys(e.a).map(function(x) { return e.a[x]; }), t: e.t };
  });
  bljWaktu_('syarat bayar (' + kunci.length + ' pasang)');
  return { baris: baris, tahan: tahan };
}

// Data acuan untuk aturan tulis di Supabase: materi (tanpa konten & kunci), mapel, rentang sesi, sesi tutup masa ujian.
function bljAcuan_(now) {
  var cfg = taBaca_(), c = materiCols_(), v = materiTanpaKonten_(), materi = [], mapel = [], sesi = [], tutup = [];
  for (var i = 1; i < v.length; i++) {
    var r = v[i], id = sTeks_(r[c.id - 1]).trim();
    if (!id) continue;
    var p = c.sesi ? taParse_(cfg, r[c.sesi - 1]) : null;
    materi.push({ id: id, m: sTeks_(r[c.idMapel - 1]).trim(), j: sTeks_(r[c.jenis - 1]).trim(), s: sTeks_(r[c.status - 1]).trim(),
      t: sTeks_(r[c.judul - 1]), smt: p ? p.smt : '', n: p ? p.n : '' });
  }
  mapelAktifSemua_(true).forEach(function(x) { mapel.push({ id: x.idMapel, r: x.idRombel, nm: x.namaMapel, a: x.statusMapel === 'Aktif' }); });
  taDaftar_(cfg, now).forEach(function(x) {
    sesi.push({ smt: x.smt, n: x.n, nama: x.nama, mulai: x.mulaiMs, selesai: x.selesaiMs, mi: x.mulaiIso, si: x.selesaiIso, w: abSesiWajib_(cfg, x.smt, x.n) });
  });
  try { Object.keys(mgSesiTutup_()).forEach(function(k) { var b = k.split('|'); tutup.push({ m: b[0], smt: Number(b[1]), n: Number(b[2]) }); }); } catch (e) {}
  var siswa = [], ada = {};
  getSheetData(CONFIG.SHEETS.SISWA).forEach(function(r, i) {
    if (i === 0 || !String(r[1]).trim()) return;
    var rb = sTeks_(r[0]).trim(), nm = sTeks_(r[1]).trim(), k = normNama_(nm);
    if (!rb || ada[rb + '|' + k]) return;
    ada[rb + '|' + k] = 1;
    siswa.push({ r: rb, k: k, nama: nm });
  });
  return { materi: materi, mapel: mapel, sesi: sesi, tutup: tutup, siswa: siswa };
}

// Izin staf per mapel untuk Supabase: lihat (wajibMapel_), nilai (ndBolehNilai_), saring siswa unit (pgoSaringSiswaBm_).
// Hanya baris yang PASTI diizinkan; selebihnya aplikasi memakai jalur Apps Script (pemeriksaan lengkap).
function bljIzin_() {
  var staf = [], izin = [], mapel = mapelAktifSemua_(), peta = ndPetaPengampu_(), enr = {};
  bacaEnrollment_().forEach(function(e) { enr[e.idPengguna + '|' + e.idMapel] = true; });
  var roster = {};
  bacaPengguna_().forEach(function(u) {
    if (u.status !== 'Aktif' || !u.peran || u.peran === 'Dinas Pendidikan') return;
    staf.push({ id: u.id, nama: u.nama, peran: u.peran });
    var semua = false;
    try { semua = (typeof pgoPenyusun_ === 'function' ? pgoPenyusun_(u) : u.peran === 'Admin') || pimpinanBolehBaca_(u); } catch (e) {}
    mapel.forEach(function(m) {
      try {
        var lihat = semua || enr[u.id + '|' + m.idMapel] || (typeof pgoBolehLihat_ === 'function' && pgoBolehLihat_(u, m.idMapel));
        if (!lihat) return;
        var nilai = ndBolehNilai_(u, m.idMapel, peta), saring = null;
        if (nilai && typeof pgoSaringSiswaBm_ === 'function') {
          var sr = pgoSaringSiswaBm_(u, m);
          if (sr) {
            if (!roster[m.idRombel]) roster[m.idRombel] = bacaRoster_(m.idRombel);
            saring = roster[m.idRombel].filter(function(s) { return sr(s.nama); }).map(function(s) { return s.k; });
          }
        }
        izin.push({ p: u.id, m: m.idMapel, n: !!nilai, s: saring });
      } catch (e) {}
    });
  });
  bljWaktu_('izin staf (' + izin.length + ')');
  return { staf: staf, izin: izin };
}

function bljRpc_(fn, isi) {
  try {
    var rahasia = pndRahasia_();
    if (!rahasia) return { kode: 0 };
    isi.p_rahasia = rahasia;
    var res = UrlFetchApp.fetch(PND.URL + '/rest/v1/rpc/' + fn, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { apikey: PND.KUNCI_PUBLIK }, payload: JSON.stringify(isi)
    });
    var data = null;
    try { data = JSON.parse(res.getContentText()); } catch (e) {}
    return { kode: res.getResponseCode(), data: data };
  } catch (e) { return { kode: 0 }; }
}

// Sidik ringkas isi mentah satu pasang (untuk mendeteksi perubahan antar-sinkron).
function bljSidik_(e) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(e.d), Utilities.Charset.UTF_8)).slice(0, 12);
}

// Status sinkron terakhir di cache (sidik per pasang + kunci bernilai tertahan). null bila hilang/kedaluwarsa.
function bljStatusBaca_() {
  try { var s = CacheService.getScriptCache().get('blj_status'); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}
function bljStatusTulis_(sidik, tahan, sidikAcuan) {
  try {
    var s = JSON.stringify({ s: sidik, t: tahan, ac: sidikAcuan }), c = CacheService.getScriptCache();
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
  if (!lama || !lama.ac) penuh = true;   // status versi lama (tanpa acuan/baris mentah) -> sinkron penuh
  var sidik = {}, kunci = [], hapus = [];
  Object.keys(per).forEach(function(k) {
    sidik[k] = bljSidik_(per[k]);
    if (penuh || lama.s[k] !== sidik[k] || lama.t.indexOf(k) >= 0) kunci.push(k);
  });
  if (!penuh) Object.keys(lama.s).forEach(function(k) {
    if (!per[k]) { var i = k.indexOf('|'); hapus.push({ m: k.slice(0, i), k: k.slice(i + 1), j: [], a: [], t: [] }); }
  });
  var hasil = bljSaring_(per, kunci);
  var buka = bljBukaSemua_(mulai), massal = bljMassalSemua_(mulai);
  bljKirim_([], false, mulai, buka, massal);   // sesi dibuka khusus / susulan massal (dibaca riwayat_baca & aturan tulis)
  var acuan = bljAcuan_(mulai), sidikAcuan = bljSidik_({ d: acuan });
  bljWaktu_('acuan');
  var kirimAcuan = penuh || !lama || lama.ac !== sidikAcuan;
  // izin staf: pada sinkron penuh dan paling jarang tiap 30 menit
  var spI = PropertiesService.getScriptProperties(), izinAkhir = Number(spI.getProperty('BLJ_IZIN_MS') || 0), izin = null;
  if (penuh || mulai - izinAkhir >= BLJ.BERKALA_MS) { try { izin = bljIzin_(); } catch (eI) { izin = null; } }
  var kode = bljRpc_('bl_sinkron', { p_acuan: kirimAcuan ? acuan : null, p_pasang: hasil.baris.concat(hapus), p_penuh: penuh, p_ms: mulai, p_izin: izin }).kode;
  if (kode === 200 && izin) { try { spI.setProperty('BLJ_IZIN_MS', String(mulai)); } catch (eS) {} }
  bljWaktu_((penuh ? 'kirim penuh ' : 'kirim inkremental ') + (hasil.baris.length + hapus.length) + ' pasang (HTTP ' + kode + ')');
  if (kode === 200) {
    bljStatusTulis_(sidik, hasil.tahan, sidikAcuan);
    var sp = PropertiesService.getScriptProperties();
    try {
      sp.setProperty(BLJ.PROP_AKHIR, String(mulai));
      if (penuh) sp.setProperty(BLJ.PROP_PENUH, String(mulai));
    } catch (e) {}
  }
  return kode;
}
function bljSinkronPenuh_() { return bljSinkron_(true); }

// Pemicu waktu (tiap BLJ.PEMICU_MENIT menit). Bila tidak ada perubahan, selesai tanpa membaca tab:
//   - sinkron PENUH sekali sehari pukul 01-04 WIB (atau bila status di cache hilang)
//   - sinkron INKREMENTAL bila ada tanda "kotor" sejak sinkron terakhir (paling sering tiap BLJ.JEDA_MS),
//     dan tetap tiap BLJ.BERKALA_MS (nilai tertahan yang mungkin sudah dilunasi)
function bljPemicu() {
  if (!bljKunci_()) return;
  if (PropertiesService.getScriptProperties().getProperty('BLJ_PEMICU_MENIT') !== String(BLJ.PEMICU_MENIT)) bljPastikanPemicu_();
  try { waSbAntrean(); } catch (eA) {}
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

// ---------------------------------------------------------------- antrean Supabase -> Spreadsheet
// Kiriman siswa yang masuk lewat Supabase (jawaban diskusi, absensi) disalin ke tab Jawaban/Absensi supaya alat staf
// tetap berjalan. Supabase "membangunkan" fungsi ini lewat pg_net sesaat setelah kiriman (tanpa data; antrean ditarik
// dari sini dengan rahasia), dan bljPemicu memprosesnya juga sebagai cadangan. Penulisan idempoten (kunci baris sama).
function waSbAntrean() {
  var c = CacheService.getScriptCache();
  if (c.get('blj_antrean')) return { jalan: true };
  c.put('blj_antrean', '1', 120);
  try { return { diproses: bljAntreanProses_() }; } finally { c.remove('blj_antrean'); }
}

function bljAntreanProses_() {
  var total = 0;
  for (var putaran = 0; putaran < 5; putaran++) {
    var r = bljRpc_('bl_antrean_ambil', { p_maks: 50 });
    if (r.kode !== 200 || !Array.isArray(r.data) || !r.data.length) break;
    var selesai = [];
    r.data.forEach(function(x) {
      try {
        if (x.jenis === 'jawaban') bljSalinJawaban_(x.data);
        else if (x.jenis === 'absensi') bljSalinAbsensi_(x.data);
        else if (x.jenis === 'nilai') bljSalinNilai_(x.data);
        selesai.push(x.id);
      } catch (e) {
        try { pmlCatatGalat_('pemicu', 'waSbAntrean', String(e && e.message || e), e && e.stack, '', ''); } catch (e2) {}
      }
    });
    if (selesai.length) bljRpc_('bl_antrean_selesai', { p_ids: selesai });
    total += selesai.length;
    if (r.data.length < 50) break;
  }
  return total;
}

function bljSalinJawaban_(d) {
  var sh = getSheet(CONFIG.SHEETS.JAWABAN), waktu = new Date(Number(d.waktuMs) || Date.now());
  var isi = [d.idRombel, d.idMapel, d.namaMapel, d.idMateri, d.judul, d.jenis, d.nama, d.jawaban, '', waktu];
  var kunci = LockService.getScriptLock();
  kunci.waitLock(20000);
  try {
    var baris = jwbCariBaris_(sh, d.idMateri, d.nama);
    if (baris) sh.getRange(baris, 1, 1, 10).setValues([isi]);
    else sh.appendRow(isi);
  } finally { kunci.releaseLock(); }
  var p = { idRombel: d.idRombel, idMapel: d.idMapel, idMateri: d.idMateri, nama: d.nama, jawaban: d.jawaban };
  if (d.baru) { try { nvCatatJawaban_(p); } catch (e) {} }
  try { draftHapus_(d.idRombel, d.idMateri, d.nama); } catch (e) {}
  kcpTanda_('jwb');
  try { brdLupakanSiswa_(d.idRombel, d.nama); } catch (e) {}
  try { catat_('Siswa', d.idRombel, d.nama, 'Kirim jawaban', 'materi ' + d.idMateri + ', mapel ' + d.idMapel + ' (Supabase)', 'OK'); } catch (e) {}
}

function bljSalinAbsensi_(d) {
  var kunci = LockService.getScriptLock();
  kunci.waitLock(20000);
  try {
    var kn = normNama_(d.nama), smt = Number(d.smt), n = Number(d.n);
    var sudah = abBaca_(String(d.idMapel)).some(function(r) { return r.smt === smt && r.n === n && r.kunciNama === kn; });
    if (!sudah) {
      var sh = abSheet_(), baris = sh.getLastRow() + 1;
      try { sh.getRange(baris, 8).setNumberFormat('@'); } catch (e) {}
      sh.getRange(baris, 1, 1, AB.HEADERS.length).setValues([[d.idRombel, d.idMapel, getNamaMapel_(d.idMapel), smt, n, d.nama, AB.HADIR, d.waktu, d.catatan || '']]);
    }
  } finally { kunci.releaseLock(); }
  try { catat_('Siswa', d.idRombel, d.nama, 'Absensi', 'mapel ' + d.idMapel + ', ' + (d.sesi || '') + ' (Supabase)', 'OK'); } catch (e) {}
  if (typeof riwayatLupakan_ === 'function') riwayatLupakan_(d.nama);
}

// Nilai diskusi yang disimpan tutor lewat Supabase -> tab Jawaban, log Penilaian Diskusi, notifikasi nilai untuk siswa.
function bljSalinNilai_(d) {
  var kabar = [];
  var kunci = LockService.getScriptLock();
  kunci.waitLock(20000);
  try {
    ndPastikanKolom_(getSheet(CONFIG.SHEETS.JAWABAN));
    var data = ndDaftarJawaban_(d.idMapel, d.idMateri), peta = {};
    data.baris.forEach(function(b) { peta[b.siswa.toLowerCase()] = b; });
    var log = ndSheetLog_();
    (d.daftar || []).forEach(function(x) {
      var b = peta[String(x.siswa || '').trim().toLowerCase()];
      if (!b) return;
      var skor = Number(x.nilai);
      data.sh.getRange(b.baris, data.k.nilai + 1).setValue(skor);
      if (data.k.komentar >= 0 && x.ubahKomentar) {
        var sel = data.sh.getRange(b.baris, data.k.komentar + 1);
        try { sel.setNumberFormat('@'); } catch (e) {}
        sel.setValue(String(x.komentar || ''));
      }
      if (data.k.penilai >= 0) data.sh.getRange(b.baris, data.k.penilai + 1).setValue(d.oleh);
      if (data.k.waktuNilai >= 0) data.sh.getRange(b.baris, data.k.waktuNilai + 1).setValue(new Date());
      log.appendRow([d.waktu, String(d.idMapel), String(d.idMateri), b.siswa, x.skorAi === '' ? '' : Number(x.skorAi), skor, String(x.alasanAi || ''), d.oleh]);
      kabar.push({ rombel: b.rombel, idMapel: String(d.idMapel), mapel: d.mapel, idMateri: String(d.idMateri), judul: d.judul, siswa: b.siswa, nilai: skor, oleh: d.oleh });
    });
  } finally { kunci.releaseLock(); }
  nvTulis_('NILAI', kabar);
  try { catat_(d.peran || 'Tutor', d.idMapel, d.oleh, 'Simpan nilai diskusi', d.idMateri + ' · ' + kabar.length + ' nilai (disetujui tutor, Supabase)', 'OK'); } catch (e) {}
}

// Dipanggil pemicu tiap jam yang sudah ada (pemicuRilisApk, pemicuGatewayDoku): memasang bljPemicu bila
// kunci tanda belajar sudah disiapkan tetapi pemicunya belum ada. Tidak pernah melempar galat.
function bljPastikanPemicu_() {
  try {
    if (!bljKunci_()) return;
    // Tiap eksekusi Apps Script memuat seluruh proyek (+-2 dtk walau tidak ada kerja), jadi pemicu tiap 5 menit
    // (+-12 menit kuota/hari), bukan tiap menit (+-48 menit/hari). Pemicu lama (tiap menit) diganti sekali.
    var sp = PropertiesService.getScriptProperties(), pemicu = ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() === 'bljPemicu'; });
    if (pemicu.length && sp.getProperty('BLJ_PEMICU_MENIT') === String(BLJ.PEMICU_MENIT)) return;
    pemicu.forEach(function(t) { ScriptApp.deleteTrigger(t); });
    ScriptApp.newTrigger('bljPemicu').timeBased().everyMinutes(BLJ.PEMICU_MENIT).create();
    sp.setProperty('BLJ_PEMICU_MENIT', String(BLJ.PEMICU_MENIT));
  } catch (e) {}
}

// Jalankan SEKALI dari editor: membuat kunci tanda belajar, mengirimnya ke Supabase, memasang pemicu
// tiap 5 menit, lalu sinkron penuh pertama. Aman dijalankan ulang (kunci lama dipakai, pemicu tidak dobel).
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
  bljPastikanPemicu_();
  Logger.log('pemicu bljPemicu: tiap ' + BLJ.PEMICU_MENIT + ' menit');
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
