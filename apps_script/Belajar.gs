// ============================================================================
// RIWAYAT BELAJAR DI SUPABASE (v1.92.0, F1 "pindah domain belajar" - tahap baca)
// ----------------------------------------------------------------------------
// Aplikasi 1.92+ membaca riwayat jawaban siswa (hasil yang sama dengan waGetRiwayatJawaban) langsung
// dari Supabase (fungsi riwayat_baca), tidak lewat Apps Script. Sumber kebenaran tetap tab Jawaban,
// Absensi, Buka Sesi & susulan massal; di sini isinya disalin ke Supabase:
//   - pemicu bljPemicu tiap 10 menit: sinkron INKREMENTAL (hanya pasang siswa-mapel yang berubah) bila ada tanda
//     "kotor", dan tetap tiap 2 jam; sinkron PENUH sekali sehari pukul 01-04 WIB.
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
  PEMICU_MENIT: 10,         // pemicu bljPemicu tiap 10 menit (kuota pemicu 90 mnt/hari; antrean dibangunkan Supabase seketika)
  JEDA_MS: 60000,          // jarak minimum antar-sinkron inkremental
  BERKALA_MS: 120 * 60000   // dan paling jarang tiap 2 jam (perubahan sheet menandai kotor)
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

// ---------------------------------------------------------------- login siswa di Supabase
// Kredensial untuk siswa_masuk: tanggal lahir hanya sebagai hash berpepper, PIN aktif sebagai hash+garam tab PIN.
// Dikirim utuh (+-120 baris) hanya bila isinya berubah (sidik di Script Properties), atau paksa (PIN/pemeliharaan berubah).
function bljKredSinkron_(paksa) {
  if (!bljKunci_()) return 0;
  var pep = pepper_(), pin = pinPeta_(), daftar = [];
  getSheetData(CONFIG.SHEETS.SISWA).forEach(function(r, i) {
    if (i === 0 || !String(r[1] || '').trim()) return;
    var rb = sTeks_(r[0]).trim(), nm = String(r[1]).trim(), kn = normNama_(nm), tgl = formatTanggalUntukBanding_(r[2]);
    if (!rb || !kn) return;
    var p = tgl ? pin[pinKunci_(nm, tgl)] : null, aktif = !!(p && p.status === 'Aktif' && p.hash);
    daftar.push({ r: rb, k: kn, n: nm, t: tgl ? sha256_(pep + ':tgl:' + kn + ':' + tgl) : '', h: aktif ? p.hash : '', g: aktif ? p.garam : '' });
  });
  var mt = false;
  try { mt = mtAktif_(); } catch (eM) {}
  var sp = PropertiesService.getScriptProperties(), sidik = sha256_(JSON.stringify(daftar) + '|' + mt);
  if (!paksa && sp.getProperty('BLJ_KRED_SIDIK') === sidik) return 0;
  var r = bljRpc_('siswa_kred_sinkron', { p_daftar: daftar, p_pemeliharaan: mt });
  if (r.kode === 200) sp.setProperty('BLJ_KRED_SIDIK', sidik);
  return r.kode === 200 ? daftar.length : -1;
}

// Siswa yang login lewat Supabase belum punya token sesi Apps Script (dipakai menu yang masih di sini: profil, kisi,
// kelayakan, tagihan, kartu, PIN, ...). Aplikasi menukar tanda belajar yang sah dengan token itu di latar belakang.
function waSesiDariTanda(tanda) {
  var b = String(tanda || '').split('.'), k = bljKunci_();
  if (b.length !== 5 || b[0] !== 'v2' || !k || Number(b[1]) < Date.now()) return { sukses: false };
  var pesan = b.slice(0, 4).join('.');
  if (bljHex_(Utilities.computeHmacSha256Signature(pesan, k, Utilities.Charset.UTF_8)) !== b[4]) return { sukses: false };
  var dariHex = function(h) { var by = []; for (var i = 0; i < h.length; i += 2) by.push(parseInt(h.substr(i, 2), 16) << 24 >> 24); return Utilities.newBlob(by).getDataAsString('UTF-8'); };
  var kn = dariHex(b[2]), rb = dariHex(b[3]), nama = '';
  getSheetData(CONFIG.SHEETS.SISWA).forEach(function(r, i) { if (i > 0 && !nama && sTeks_(r[0]).trim() === rb && normNama_(r[1]) === kn) nama = String(r[1]).trim(); });
  if (!nama) return { sukses: false };
  return { sukses: true, sesi: ssBuat_({ nama: nama, idRombel: rb }) };
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
  // BLJ_T0_ = 0 berarti belum ada titik awal: catat tahap tanpa angka waktu (bukan selisih dari tahun 1970)
  if (tahap) Logger.log('[blj] ' + tahap + (BLJ_T0_ ? ': ' + (now - BLJ_T0_) + ' ms' : ''));
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
  // izin staf: hanya pada sinkron penuh (malam hari; +-90 dtk). Izin yang berubah di siang hari tetap aman:
  // tanpa baris izin, aplikasi memakai jalur Apps Script yang memeriksa izin secara lengkap.
  var spI = PropertiesService.getScriptProperties(), izin = null;
  if (penuh) { try { izin = bljIzin_(); } catch (eI) { izin = null; } }
  if (penuh) { try { ujAwasPenuh_(); } catch (eU) {} }   // E1: perangkat & tambahan waktu ujian
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
  // satu putaran saja (waSbAntrean menunggu +-25 dtk saat sepi; di pemicu itu menghabiskan kuota 90 menit/hari)
  try { var cA = CacheService.getScriptCache(); if (!cA.get('blj_antrean')) bljAntreanProses_(); } catch (eA) {}
  try { bljKredSinkron_(false); } catch (eK) {}   // login siswa di Supabase: kredensial (hanya dikirim bila berubah)
  var sp = PropertiesService.getScriptProperties(), now = Date.now(), akhir = 0, akhirPenuh = 0, kotor = 0;
  try { akhir = Number(sp.getProperty(BLJ.PROP_AKHIR) || 0); akhirPenuh = Number(sp.getProperty(BLJ.PROP_PENUH) || 0); } catch (e) {}
  try { kotor = Number(CacheService.getScriptCache().get(BLJ.KOTOR) || 0); } catch (e2) {}
  var jam = Number(Utilities.formatDate(new Date(now), 'Asia/Jakarta', 'H'));
  try { ujsPemicu_(now, jam); } catch (eU) {}   // E2: status ujian siswa di Supabase
  try { brsPemicu_(now, jam); } catch (eR) {}   // R1: beranda siswa di Supabase
  try { bstPemicu_(now, jam); } catch (eT) {}   // beranda staf di Supabase
  try { bljBacaSalin_(); } catch (eB) {}   // tanda baca materi dari Supabase -> tab Baca Materi
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
// Supabase membangunkan paling banyak sekali per 20 detik (private.antrean_bangunkan), jadi satu eksekusi ini terus
// menguras antrean sampai +-25 detik tanpa isian baru (maks. 4 menit). Panggilan yang datang saat pengurasan berjalan
// hanya memasang penanda 'lagi' agar putaran berikutnya tidak berhenti sebelum memeriksa ulang.
function waSbAntrean() {
  var c = CacheService.getScriptCache();
  if (c.get('blj_antrean')) { c.put('blj_antrean_lagi', '1', 300); return { jalan: true }; }
  c.put('blj_antrean', '1', 300);
  var total = 0, mulai = Date.now(), sepi = 0;
  try {
    while (Date.now() - mulai < 4 * 60000) {
      c.remove('blj_antrean_lagi');
      var n = bljAntreanProses_();
      total += n;
      if (n || c.get('blj_antrean_lagi')) { sepi = 0; continue; }
      if (++sepi > 3) break;
      Utilities.sleep(8000);
    }
  } finally { c.remove('blj_antrean'); }
  return { diproses: total };
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
        else if (x.jenis === 'masuk') catat_('Siswa', x.data.idRombel, x.data.nama, 'Masuk', (x.data.cara ? x.data.cara + ' ' : '') + '(Supabase)', 'OK');
        else if (x.jenis === 'pelanggaran') pwCatat_(x.data.idUjian, x.data.idRombel, x.data.nama, x.data.jenis, x.data.detail, x.data.oleh);
        else if (x.jenis.indexOf('ujian_') === 0) {   // E3a: status di Supabase sudah benar -> jangan tandai basi
          UJS_DIAM_ = true;
          try {
            if (x.jenis === 'ujian_mulai') ujsCerminMulai_(x.data);
            else if (x.jenis === 'ujian_kirim') ujsCerminKirim_(x.data);
            else if (x.jenis === 'ujian_perangkat') ujsCerminPerangkat_(x.data);
            else if (x.jenis === 'ujian_lapor') ujsCerminLapor_(x.data);
          } finally { UJS_DIAM_ = false; }
        }
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

// E1: perangkat ujian terdaftar & tambahan waktu -> Supabase (detak ujian dibaca di sana). Tidak pernah melempar galat.
// perangkat: [{u, r, k, sidik, model}] (sidik '' = direset); tambah: [{u, r, k, menit}]
function ujAwasKirim_(perangkat, tambah, penuh) {
  try { return bljRpc_('uj_awasan_set', { p_perangkat: perangkat, p_tambah: tambah, p_penuh: !!penuh }).kode; } catch (e) { return 0; }
}
function ujAwasPenuh_() {
  var pd = {}, tw = [];
  try {
    pwBaca_(PW.TAB_PD, PW.HDR_PD).forEach(function(r) {
      if (r['STATUS'] !== 'Aktif') return;
      pd[pwKunciSiswa_(r['ID UJIAN'], r['ID ROMBEL'], r['NAMA SISWA'])] = { u: String(r['ID UJIAN']), r: String(r['ID ROMBEL']), k: ujNormNama_(r['NAMA SISWA']), sidik: r['SIDIK'], model: r['MODEL'] };
    });
    var peta = pwTwPeta_();
    Object.keys(peta).forEach(function(k) { var b = k.split('|'); tw.push({ u: b[0], r: b[1], k: b.slice(2).join('|'), menit: peta[k] }); });
  } catch (e) { return 0; }
  return ujAwasKirim_(Object.keys(pd).map(function(k) { return pd[k]; }), tw, true);
}

// ---------------------------------------------------------------- E2: status ujian siswa di Supabase
// Status lengkap (waStatusUjian) tiap siswa untuk ujian terjadwal yang dekat dihitung di sini tiap ~25 menit (05-21 WIB)
// lalu dikirim ke uj_status; Supabase menghitung ulang bagian yang bergantung waktu. Setiap perubahan data ujian
// menandai status siswa itu basi (ujsBasi_) sehingga aplikasi kembali ke Apps Script sampai dihitung ulang.
var UJS_MEMO_ = null, UJS_BASI_ = {};
var UJS = { SELANG_MS: 25 * 60000, JENDELA_LALU_MS: 36 * 3600000, JENDELA_DEPAN_MS: 48 * 3600000, BATAS_MS: 240000, PROP: 'UJS_AKHIR' };

// paksa = true: selalu kirim (pembungkus mulai/kirim/pindah tab, sesudah SEMUA penulisan selesai)
function ujsBasi_(idUjian, idRombel, nama, paksa) {
  if (!idUjian || UJS_DIAM_ || !bljKunci_()) return;
  var k = String(idUjian) + '|' + (idRombel == null ? '*' : String(idRombel)) + '|' + (nama == null ? '*' : normNama_(nama));
  if (UJS_BASI_[k] && !paksa) return;
  UJS_BASI_[k] = 1;
  bljRpc_('uj_status_basi', { p_kunci: [k] });
}

// E3c: kunci ujian dibuka staf -> status di Supabase diperbarui langsung (siswa dapat melanjutkan lewat Supabase).
// Bila baris tidak segar / gagal, tandai basi (aplikasi memakai Apps Script).
function ujsBuka_(idUjian, idRombel, nama) {
  if (!idUjian || !bljKunci_()) return;
  var r = bljRpc_('uj_status_buka', { p_kunci: String(idUjian) + '|' + String(idRombel) + '|' + normNama_(nama) });
  if (!(r.kode === 200 && r.data === true)) ujsBasi_(idUjian, idRombel, nama, true);
}

// Dipanggil ujTambah_/ujUbah_. Tab per siswa -> basi siswa itu; jadwal/permohonan -> basi seluruh ujian.
function ujsBerubah_(kunci, o, baris) {
  if (UJS_MEMO_) delete UJS_MEMO_['uj_' + kunci];
  var perSiswa = kunci === 'AKSES' || kunci === 'AJU' || kunci === 'HASIL';
  if (!perSiswa && kunci !== 'JADWAL' && kunci !== 'PERM') return;
  if (!o) {
    var head = UJ.H[kunci], v = ujTabel_(kunci).getRange(baris, 1, 1, head.length).getValues()[0];
    o = {};
    head.forEach(function(h, i) { o[h] = sTeks_(v[i]); });
  }
  if (perSiswa) ujsBasi_(o['ID Ujian'], o['ID Rombel'], o['Nama Siswa']);
  else ujsBasi_(o['ID Ujian'], null, null);
}

function ujsPemicu_(now, jam) {
  if (jam < 5 || jam > 21) return;
  var sp = PropertiesService.getScriptProperties();
  if (now - Number(sp.getProperty(UJS.PROP) || 0) < UJS.SELANG_MS) return;
  sp.setProperty(UJS.PROP, String(now));
  ujsSinkron_();
}

// Hitung & kirim status semua siswa untuk ujian dekat (+ siswa yang punya akses personal dekat).
function ujsSinkron_() {
  bljWaktu_('');   // awal pengukuran (bisa dipanggil sendiri, di luar bljSinkron_)
  var mulai = Date.now(), dalam = function(ms) { return ms >= mulai - UJS.JENDELA_LALU_MS && ms <= mulai + UJS.JENDELA_DEPAN_MS; };
  var sasaran = {}, jumlah = 0, baris = [], kirim = 0, paket = [];
  UJS_MEMO_ = {};
  var memoLama = SHEET_MEMO_, memoMateri = MATERI_MEMO_;
  if (!SHEET_MEMO_) SHEET_MEMO_ = {};
  if (!MATERI_MEMO_) MATERI_MEMO_ = {};
  try {
    var jad = {};
    ujJadwalSemua_().forEach(function(j) { if (j.idUjian) { jad[String(j.idUjian)] = j; if (dalam(j.mulaiMs)) sasaran[String(j.idUjian)] = null; } });
    munSemua_().forEach(function(w) { if (w.idUjian && jad[w.idUjian] && dalam(ujMs_(w.tanggal, w.jam))) sasaran[w.idUjian] = null; });
    var pribadi = {};
    ujBaca_('AKSES').forEach(function(a) {
      var u = String(a['ID Ujian']);
      if (a['Status'] !== 'Terbuka' || !jad[u] || sasaran[u] === null) return;
      var m = ujMsTeks_(a['Mulai']), s = ujMsTeks_(a['Selesai']);
      if (isNaN(m) || isNaN(s) || s < mulai || m > mulai + UJS.JENDELA_DEPAN_MS) return;
      (pribadi[u] = pribadi[u] || []).push({ r: String(a['ID Rombel']), nama: a['Nama Siswa'] });
    });
    Object.keys(pribadi).forEach(function(u) { sasaran[u] = pribadi[u]; });
    var ujianIds = Object.keys(sasaran);
    if (!ujianIds.length) { bljWaktu_('status ujian: tidak ada ujian dekat'); return 0; }
    var rombelMapel = {}, roster = {};
    mapelAktifSemua_().forEach(function(m) { rombelMapel[String(m.idMapel)] = String(m.idRombel); });
    for (var x = 0; x < ujianIds.length; x++) {
      var u = ujianIds[x], j = jad[u], idMapel = String(j.idMapel), idRombel = rombelMapel[idMapel];
      if (!idRombel) continue;
      var daftar = sasaran[u] || (roster[idRombel] = roster[idRombel] || bacaRoster_(idRombel)).map(function(s) { return { r: idRombel, nama: s.nama }; });
      for (var i = 0; i < daftar.length; i++) {
        if (Date.now() - mulai > UJS.BATAS_MS) break;
        var sw = daftar[i];
        try {
          var r = waStatusUjian(u, sw.r, idMapel, sw.nama);
          if (!r || !r.sukses || !r.uj || !r.uj._bahan) continue;
          var bahan = r.uj._bahan;
          delete r.uj._bahan;
          try { ujsBahanMulai_(bahan, j, sw.r, sw.nama, paket); } catch (eM) { bahan.gerbang = 'galat'; }   // E3a
          baris.push({ u: u, r: sw.r, k: normNama_(sw.nama), m: idMapel, data: r, bahan: bahan });
          jumlah++;
        } catch (eS) {}
      }
    }
  } finally { UJS_MEMO_ = null; SHEET_MEMO_ = memoLama; MATERI_MEMO_ = memoMateri; }
  bljWaktu_('status ujian dihitung (' + jumlah + ', paket ' + paket.length + ')');
  ujsTokenKirim_();
  // paket soal: hanya yang berubah (sidik)
  var ada = bljRpc_('uj_paket_sidik', { p_ujian: Object.keys(sasaran) }), lama = ada.kode === 200 && ada.data ? ada.data : {}, nPaket = 0;
  paket = paket.filter(function(x) { return lama[x.u + '|' + x.r + '|' + x.k + '|' + x.ronde] !== x.sidik; });
  for (var q = 0; q < paket.length; q += 20) {
    var rp = bljRpc_('uj_paket_set', { p_baris: paket.slice(q, q + 20) });
    if (rp.kode === 200) nPaket += Number(rp.data) || 0;
  }
  for (var p = 0; p < baris.length; p += 150) {
    var res = bljRpc_('uj_status_set', { p_baris: baris.slice(p, p + 150), p_ms: mulai });
    if (res.kode === 200) kirim += Number(res.data) || 0;
  }
  bljWaktu_('status ujian terkirim ' + kirim + '/' + jumlah + ', paket baru ' + nPaket);
  return kirim;
}

// ---------------------------------------------------------------- R1: beranda siswa di Supabase
// Beranda tiap siswa dihitung dengan brdSiswa_ (kode yang sama dengan waSiswaBeranda) secara massal: seluruh siswa
// tiap 2 jam 05-21 WIB dan saat ganti hari (bertahap bila waktu habis), siswa "kotor" (ada jawaban/absensi/nilai/ujian
// baru) tiap 10 menit. br_beranda di Supabase menyajikannya.
var BRS = { SELANG_MS: 120 * 60000, BATAS_MS: 200000, KOTOR: 'brs_kotor', PROP_AKHIR: 'BRS_AKHIR', PROP_TGL: 'BRS_TGL', PROP_KURSOR: 'BRS_KURSOR' };

function brsKotor_(idRombel, nama) {
  if (!nama) return;
  try {
    var c = CacheService.getScriptCache(), a = JSON.parse(c.get(BRS.KOTOR) || '[]'), k = normNama_(nama);
    if (a.indexOf(k) >= 0) return;
    a.push(k);
    c.put(BRS.KOTOR, JSON.stringify(a.slice(-400)), 21600);
  } catch (e) {}
}

function brsSiswaSemua_() {
  var out = [], ada = {};
  getSheetData(CONFIG.SHEETS.SISWA).forEach(function(r, i) {
    if (i === 0 || !String(r[1]).trim()) return;
    var rb = sTeks_(r[0]).trim(), nm = sTeks_(r[1]).trim(), k = normNama_(nm);
    if (!rb || ada[rb + '|' + k]) return;
    ada[rb + '|' + k] = 1;
    out.push({ r: rb, nama: nm, k: k });
  });
  return out;
}

// Fungsi baca (tanpa efek samping) yang hasilnya sama untuk semua siswa: diingat selama hitungan massal.
var BRS_MEMO_FN = ['keuWbSemua_', 'keuTagSemua_', 'keuBayarPeta_', 'keuSemua_', 'nilPeriode_', 'nilAturan_', 'nilKelasRapor_', 'nilPetaBm_',
  'nilSiswaBm_', 'absWbRombel_', 'honNamaMapel_', 'honProgramRombel_', 'absBaca_', 'muSemua_', 'nilAsSemua_', 'taBaca_', 'sbDisSemua_', 'sbTag_',
  'mapelAktifSemua_', 'ujtPetaMapel_', 'ubPetaSiswa_', 'mgSesiTutup_', 'absSim_', 'sbMasaBayar_', 'brdMapelBm_', 'nilDisBaca_', 'ksWb_', 'sbWbSiswa_',
  'getSheetData', 'absHariIni_', 'ujJadwalSemua_', 'munSemua_', 'getMapelAktifUntukRombel_', 'getNamaRombel_'];
function brsMemoPasang_() {
  var asli = {};
  BRS_MEMO_FN.forEach(function(n) {
    var f = globalThis[n];
    if (typeof f !== 'function') return;
    asli[n] = f;
    var m = {};
    globalThis[n] = function() {
      var k = JSON.stringify(Array.prototype.slice.call(arguments));
      if (!m.hasOwnProperty(k)) m[k] = f.apply(this, arguments);
      return m[k];
    };
  });
  // taInfo_(cfg, smt, n, now): status sesi cukup dihitung sekali per (smt, n) selama hitungan massal
  var ti = globalThis.taInfo_, mt = {};
  if (typeof ti === 'function') {
    asli.taInfo_ = ti;
    globalThis.taInfo_ = function(cfg, smt, n, now) { var k = smt + '|' + n; return mt[k] || (mt[k] = ti(cfg, smt, n, now)); };
  }
  // cache beranda Apps Script tidak perlu ditulis untuk tiap siswa
  if (typeof globalThis.brdCacheTulis_ === 'function') { asli.brdCacheTulis_ = globalThis.brdCacheTulis_; globalThis.brdCacheTulis_ = function() {}; }
  return function() { Object.keys(asli).forEach(function(n) { globalThis[n] = asli[n]; }); };
}

// Hitung beranda daftar siswa sampai batas waktu. Mengembalikan {baris, selesai: jumlah yang diproses}.
function brsHitung_(daftar, batasMs) {
  var baris = [], i = 0, tgl = absHariIni_();
  var memo = [SHEET_MEMO_, MATERI_MEMO_, UJS_MEMO_];
  if (!SHEET_MEMO_) SHEET_MEMO_ = {};
  if (!MATERI_MEMO_) MATERI_MEMO_ = {};
  if (!UJS_MEMO_) UJS_MEMO_ = {};
  var lepas = brsMemoPasang_();
  try {
    for (; i < daftar.length; i++) {
      if (Date.now() > batasMs) break;
      var sw = daftar[i];
      try {
        var d = brdSiswa_({ nama: sw.nama, idRombel: sw.r }, true);
        if (d && d.kartu) {
          // pembuka aplikasi: data waPulihSesiSiswa (tanpa token) & profil
          var ses = null, prof = null;
          try { ses = { namaRombel: getNamaRombel_(sw.r), daftarMapel: getMapelAktifUntukRombel_(sw.r), pin: pinStatus_(sw.nama, sw.r, false) }; } catch (eP) {}
          try { prof = profilSiswaData_({ nama: sw.nama, idRombel: sw.r }); } catch (eF) {}
          baris.push({ r: sw.r, k: sw.k, tanggal: tgl, data: d, sesi: ses, profil: prof });
        }
      } catch (eS) {}
    }
  } finally { lepas(); SHEET_MEMO_ = memo[0]; MATERI_MEMO_ = memo[1]; UJS_MEMO_ = memo[2]; }
  return { baris: baris, selesai: i };
}

function brsKirim_(baris, ms) {
  var n = 0, prof = [];
  var inti = baris.map(function(b) {
    if (b.profil) prof.push({ r: b.r, k: b.k, data: b.profil, sidik: Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(b.profil), Utilities.Charset.UTF_8)).slice(0, 16) });
    return { r: b.r, k: b.k, tanggal: b.tanggal, data: b.data, sesi: b.sesi };
  });
  for (var p = 0; p < inti.length; p += 40) {
    var r = bljRpc_('br_set', { p_baris: inti.slice(p, p + 40), p_ms: ms });
    if (r.kode === 200) n += Number(r.data) || 0;
  }
  // profil: hanya yang berubah
  if (prof.length) {
    var ada = bljRpc_('br_profil_sidik', {}), lama = ada.kode === 200 && ada.data ? ada.data : {};
    prof = prof.filter(function(x) { return lama[x.r + '|' + x.k] !== x.sidik; });
    for (var q = 0; q < prof.length; q += 20) bljRpc_('br_profil_set', { p_baris: prof.slice(q, q + 20) });
  }
  return n;
}

function brsPemicu_(now, jam) {
  bljWaktu_('');
  var sp = PropertiesService.getScriptProperties(), batas = now + BRS.BATAS_MS;
  // 1) siswa kotor
  var c = CacheService.getScriptCache(), kotor = [];
  try { kotor = JSON.parse(c.get(BRS.KOTOR) || '[]'); } catch (e) {}
  if (kotor.length) {
    c.remove(BRS.KOTOR);
    var set = {};
    kotor.forEach(function(k) { set[k] = 1; });
    var mulaiK = Date.now(), hk = brsHitung_(brsSiswaSemua_().filter(function(s) { return set[s.k]; }), batas);
    brsKirim_(hk.baris, mulaiK);
    bljWaktu_('beranda siswa kotor ' + hk.baris.length);
  }
  // 2) seluruh siswa: ganti hari, atau tiap 2 jam 05-21 WIB (dilanjutkan dari kursor bila belum selesai)
  var tgl = Utilities.formatDate(new Date(now), 'Asia/Jakarta', 'yyyy-MM-dd'), kursor = Number(sp.getProperty(BRS.PROP_KURSOR) || 0);
  var perlu = kursor > 0 || sp.getProperty(BRS.PROP_TGL) !== tgl || (jam >= 5 && jam <= 21 && now - Number(sp.getProperty(BRS.PROP_AKHIR) || 0) >= BRS.SELANG_MS);
  if (!perlu || Date.now() > batas - 20000) return;
  var semua = brsSiswaSemua_(), mulai = Date.now();
  if (kursor >= semua.length) kursor = 0;
  var h = brsHitung_(semua.slice(kursor), batas);
  var n = brsKirim_(h.baris, mulai);
  kursor += h.selesai;
  if (kursor >= semua.length) { sp.setProperty(BRS.PROP_KURSOR, '0'); sp.setProperty(BRS.PROP_AKHIR, String(mulai)); sp.setProperty(BRS.PROP_TGL, tgl); }
  else sp.setProperty(BRS.PROP_KURSOR, String(kursor));
  bljWaktu_('beranda siswa ' + n + ' terkirim, kursor ' + kursor + '/' + semua.length);
}

// Editor: hitung beranda semua siswa sekarang (uji waktu). Bertahap bila lebih dari batas.
function berandaSiapkan() {
  var t0 = Date.now(), now = Date.now(), jam = Number(Utilities.formatDate(new Date(now), 'Asia/Jakarta', 'H'));
  PropertiesService.getScriptProperties().setProperty(BRS.PROP_TGL, '');
  brsPemicu_(now, jam);
  Logger.log('beranda: ' + (Date.now() - t0) + ' ms, kursor ' + PropertiesService.getScriptProperties().getProperty(BRS.PROP_KURSOR));
}

// ---------------------------------------------------------------- baca materi (waTandaiBaca) di Supabase
// Aplikasi 1.92.8+ menandai materi dibuka di Supabase (bl_baca_tandai). Di sini tampungan diambil & digabung ke tab
// "Baca Materi" sekaligus: baris ada -> terakhir dibuka & jumlah ditambah; baris baru -> ditambahkan.
function bljBacaSalin_() {
  bljWaktu_('');
  var r = bljRpc_('bl_baca_ambil', { p_maks: 1000 });
  if (r.kode !== 200 || !Array.isArray(r.data) || !r.data.length) return 0;
  var rows = r.data;
  var kunci = LockService.getScriptLock();
  try {
    kunci.waitLock(20000);
    try {
      var sh = bacaSheet_(), last = sh.getLastRow(), v = last >= 2 ? sh.getRange(2, 1, last - 1, 7).getValues() : [], idx = {}, baru = [], ubah = false;
      v.forEach(function(x, i) { idx[String(x[0]).trim() + '|' + String(x[2]).trim() + '|' + normNama_(x[3])] = i; });
      rows.forEach(function(x) {
        var k = x.r + '|' + x.i + '|' + x.k, i = idx[k];
        if (i !== undefined) { v[i][5] = x.t; v[i][6] = (Number(v[i][6]) || 0) + Number(x.j || 1); ubah = true; }
        else { idx[k] = -1; baru.push([x.r, x.m, x.i, x.n, x.p, x.t, Number(x.j || 1)]); }
      });
      if (ubah) sh.getRange(2, 1, v.length, 7).setValues(v);
      if (baru.length) sh.getRange(sh.getLastRow() + 1, 1, baru.length, 7).setValues(baru);
    } finally { kunci.releaseLock(); }
  } catch (e) {
    bljRpc_('bl_baca_kembali', { p_baris: rows });
    return 0;
  }
  bljWaktu_('baca materi ' + rows.length);
  return rows.length;
}

// ---------------------------------------------------------------- beranda staf di Supabase
// brdStaf_ (inti waStafBeranda) dihitung massal untuk semua staf aktif: tiap jam 06-21 WIB (dan ganti hari),
// staf yang baru menyimpan sesuatu (doPost) tiap 10 menit. Token sintetis 'bst:<id>' dikenali stafDariToken_ tiruan.
var BST = { SELANG_MS: 60 * 60000, KOTOR: 'bst_kotor', PROP_AKHIR: 'BST_AKHIR', PROP_TGL: 'BST_TGL' };

function bstKotor_(id) {
  if (!id) return;
  try {
    var c = CacheService.getScriptCache(), a = JSON.parse(c.get(BST.KOTOR) || '[]');
    if (a.indexOf(String(id)) >= 0) return;
    a.push(String(id));
    c.put(BST.KOTOR, JSON.stringify(a.slice(-200)), 21600);
  } catch (e) {}
}

function bstStafSemua_() {
  return bacaPengguna_().filter(function(u) { return u.status === 'Aktif' && u.peran && u.peran !== 'Dinas Pendidikan'; });
}

function bstHitung_(daftar, batasMs) {
  var baris = [], tgl = absHariIni_(), peta = {};
  daftar.forEach(function(u) { peta['bst:' + u.id] = u; });
  var memo = [SHEET_MEMO_, MATERI_MEMO_, UJS_MEMO_], asliToken = stafDariToken_;
  if (!SHEET_MEMO_) SHEET_MEMO_ = {};
  if (!MATERI_MEMO_) MATERI_MEMO_ = {};
  if (!UJS_MEMO_) UJS_MEMO_ = {};
  var lepas = brsMemoPasang_();
  globalThis.stafDariToken_ = function(token) {
    var u = peta[token];
    if (!u) return asliToken(token);
    var h = typeof izPeriksa_ === 'function' ? (izPeriksa_(u) || u) : u;
    globalThis.__STAF_P = h;
    return h;
  };
  try {
    for (var i = 0; i < daftar.length; i++) {
      if (Date.now() > batasMs) break;
      var u = daftar[i], tok = 'bst:' + u.id;
      try {
        var p = globalThis.stafDariToken_(tok), d = brdStaf_(p, tok, true);
        if (d && d.kartu) baris.push({ id: u.id, peran: p.peran, tanggal: tgl, data: d });
      } catch (eS) {}
    }
  } finally { globalThis.stafDariToken_ = asliToken; globalThis.__STAF_P = null; lepas(); SHEET_MEMO_ = memo[0]; MATERI_MEMO_ = memo[1]; UJS_MEMO_ = memo[2]; }
  return baris;
}

function bstPemicu_(now, jam) {
  bljWaktu_('');
  var sp = PropertiesService.getScriptProperties(), c = CacheService.getScriptCache(), kotor = [];
  try { kotor = JSON.parse(c.get(BST.KOTOR) || '[]'); } catch (e) {}
  var tgl = Utilities.formatDate(new Date(now), 'Asia/Jakarta', 'yyyy-MM-dd');
  var penuh = sp.getProperty(BST.PROP_TGL) !== tgl || (jam >= 6 && jam <= 21 && now - Number(sp.getProperty(BST.PROP_AKHIR) || 0) >= BST.SELANG_MS);
  if (!penuh && !kotor.length) return;
  if (kotor.length) c.remove(BST.KOTOR);
  var semua = bstStafSemua_(), set = {};
  kotor.forEach(function(id) { set[id] = 1; });
  var daftar = penuh ? semua : semua.filter(function(u) { return set[u.id]; });
  var mulai = Date.now(), baris = bstHitung_(daftar, now + 300000), n = 0;
  for (var p = 0; p < baris.length; p += 20) {
    var r = bljRpc_('br_staf_set', { p_baris: baris.slice(p, p + 20), p_ms: mulai });
    if (r.kode === 200) n += Number(r.data) || 0;
  }
  if (penuh && baris.length === daftar.length) { sp.setProperty(BST.PROP_AKHIR, String(mulai)); sp.setProperty(BST.PROP_TGL, tgl); }
  bljWaktu_('beranda staf ' + n + '/' + daftar.length + (penuh ? ' (penuh)' : ''));
}

// Editor: bandingkan beranda staf dihitung biasa (brdStaf_ per staf) vs massal + waktu; lalu kirim.
function berandaStafSiapkan() {
  var semua = bstStafSemua_(), t0 = Date.now(), beda = [];
  var t1 = Date.now(), baris = bstHitung_(semua, Date.now() + 300000), t2 = Date.now();
  // pembanding: 4 staf pertama dihitung biasa (tanpa memo massal)
  var bersih = function(d) { var x = JSON.parse(JSON.stringify(d)); delete x.waktu; return JSON.stringify(x); };
  var asliToken = stafDariToken_, peta = {};
  semua.forEach(function(u) { peta['bst:' + u.id] = u; });
  globalThis.stafDariToken_ = function(token) { var u = peta[token]; if (!u) return asliToken(token); var h = izPeriksa_(u) || u; globalThis.__STAF_P = h; return h; };
  try {
    baris.slice(0, 4).forEach(function(b) {
      SHEET_MEMO_ = null; MATERI_MEMO_ = null;
      var tok = 'bst:' + b.id, d = brdStaf_(globalThis.stafDariToken_(tok), tok, true);
      if (bersih(d) !== bersih(b.data)) beda.push(b.id + ' (' + b.peran + ')');
    });
  } finally { globalThis.stafDariToken_ = asliToken; }
  var r = bljRpc_('br_staf_set', { p_baris: baris, p_ms: t1 });
  PropertiesService.getScriptProperties().setProperty(BST.PROP_AKHIR, String(t1));
  PropertiesService.getScriptProperties().setProperty(BST.PROP_TGL, absHariIni_());
  Logger.log('beranda staf: ' + baris.length + '/' + semua.length + ' staf, ' + (t2 - t1) + ' ms, kirim HTTP ' + r.kode + ' (' + r.data + '); beda: ' + (beda.length ? beda.join(', ') : 'tidak ada'));
}

// ---------------------------------------------------------------- E3a: mulai & kirim ujian di Supabase
// Bahan tambahan untuk uj_mulai/uj_kirim + paket soal (hasil undian yang sama dengan ujSoalSiswa_).
// jDasar = jadwal dasar (dipakai undian), jadwal khusus unit dipakai untuk gerbang.
var UJS_DIAM_ = false;   // true saat menyalin kiriman Supabase ke Spreadsheet: tidak menandai basi
function ujsBahanMulai_(bahan, jDasar, idRombel, nama, paket) {
  var m = UJS_MEMO_, js = ujJadwalSiswa_(jDasar, idRombel, nama);
  if (!m.kode) {
    m.kode = {};
    getSheetData(CONFIG.SHEETS.SISWA).forEach(function(r, i) {
      var k = String(r[0]) + '|' + r[1], kode = String(r[3] || '').trim().toUpperCase();
      if (i > 0 && kode && !m.kode.hasOwnProperty(k)) m.kode[k] = kode;
    });
    m.lamaJ = {};
    getSheetData(CONFIG.SHEETS.JAWABAN).forEach(function(r, i) {
      var k = String(r[3]) + '|' + r[6];
      if (i > 0 && !m.lamaJ.hasOwnProperty(k)) { var n = parseFloat(r[8]); m.lamaJ[k] = isNaN(n) ? null : n; }
    });
  }
  var kode = m.kode[String(idRombel) + '|' + nama];
  bahan.kodeHash = kode ? sha256_(kode) : '';
  bahan.pinHash = ''; bahan.pinGaram = '';
  var pr = pinPeta_()[pinKunci_(nama, pinTglSiswa_(idRombel, nama))];
  if (pr && pr.status === 'Aktif' && pr.hash) { bahan.pinHash = pr.hash; bahan.pinGaram = pr.garam; }
  var g = '';
  if (js.mode === 'Kertas') g = 'kertas';
  if (!g) g = muGerbang_(js, idRombel, nama) || '';
  if (!g) {
    try { g = klGerbang_(js, idRombel, nama) || ''; }
    catch (eKl) {
      try { g = nilGerbangUjian_(js, idRombel, nama) || ''; } catch (eNil) {}
      if (!g) { try { g = sbGerbang_(js, idRombel, nama) || ''; } catch (eBy) {} }
    }
  }
  bahan.gerbang = g;
  bahan.ronde = ujRonde_(jDasar.idUjian, idRombel, nama);
  bahan.jenisSitting = ujJenisSitting_(jDasar.idUjian, idRombel, nama);
  var kl = String(jDasar.idUjian) + '|' + nama;
  bahan.nilaiLama = m.lamaJ.hasOwnProperty(kl) ? m.lamaJ[kl] : null;
  bahan.masa = !!js.masa;
  // E3b: sanksi bertingkat (pwRingkasSanksi_ dari log pelanggaran)
  if (!m.log) {
    m.log = {};
    pwBaca_(PW.TAB_LG, PW.HDR_LG).forEach(function(r) { var k = pwKunciSiswa_(r['ID UJIAN'], r['ID ROMBEL'], r['NAMA SISWA']); (m.log[k] = m.log[k] || []).push(r); });
    m.sanksi = pwSanksi_();
  }
  var rs = pwRingkasSanksi_(m.log[pwKunciSiswa_(jDasar.idUjian, idRombel, nama)] || []);
  bahan.kunciLog = rs.kunci; bahan.berat = rs.berat; bahan.tryout = jDasar.jenis === 'TRYOUT';
  bahan.sanksi = { batas: m.sanksi.batasKeluar, pimpinanMulai: m.sanksi.pimpinanMulai, beratMulai: m.sanksi.beratMulai };
  if (js.mode === 'Kertas') return;
  var ronde = [bahan.ronde];
  if (bahan.akses && bahan.akses.length) ronde.push(bahan.ronde + 1);
  ronde.forEach(function(rd) {
    var pk = ujsPaket_(jDasar, idRombel, nama, rd);
    if (pk) paket.push(pk);
  });
}

// Sama dengan ujSoalSiswa_ tetapi untuk ronde tertentu; soal (tampilan) + kunci [[id, huruf]].
function ujsPaket_(j, idRombel, nama, ronde) {
  var m = UJS_MEMO_, kp = j.idMapel + '|' + j.smt + '|' + j.jenisPool;
  m.pool = m.pool || {}; m.opsi = m.opsi || {};
  var pool = m.pool[kp] || (m.pool[kp] = ujPool_(j.idMapel, j.smt, j.jenisPool));
  if (!pool.sesi.length) return null;
  if (!m.opsi.hasOwnProperty(idRombel)) m.opsi[idRombel] = kurPaket_(getNamaRombel_(idRombel)) === 'A' ? 4 : 5;
  var benih = [j.idUjian, idRombel, ujNormNama_(nama), ronde].join('|');
  var daftar = ujUndi_(pool.sesi, j.komposisi, m.opsi[idRombel], benih);
  if (!daftar.length) return null;
  var poin = 100 / daftar.length;
  var soal = daftar.map(function(s) { return { id: s.id, pertanyaan: s.pertanyaan, opsi: s.opsi, poin: poin }; });
  var kunci = daftar.map(function(s) { return [s.id, String(s.kunci || '').trim().toUpperCase()]; });
  var sidik = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify([soal, kunci]), Utilities.Charset.UTF_8)).slice(0, 16);
  return { u: String(j.idUjian), r: String(idRombel), k: normNama_(nama), ronde: ronde, soal: soal, kunci: kunci, sidik: sidik };
}

// Token semua slot pengawas -> Supabase (dipanggil hitungan berkala & saat token diganti).
function ujsTokenKirim_() {
  try {
    var o = {};
    pwBaca_(MU.TAB_SLOT, MU.HDR_SLOT).map(muSlotObj_).forEach(function(s) { if (s.id) o[s.id] = String(s.token || '').toUpperCase(); });
    return bljRpc_('uj_token_set', { p_token: o, p_penuh: true }).kode;
  } catch (e) { return 0; }
}

// Salinan mulai ujian dari Supabase -> Percobaan Ujian, Akses (dipakai), Perangkat, log.
function ujsCerminMulai_(d) {
  var j = ujJadwalSiswa_(ujJadwalDariUjian_(d.idUjian), d.idRombel, d.nama);
  var kunci = LockService.getScriptLock();
  kunci.waitLock(20000);
  try {
    var sesi = cariBarisSesiUjian_(d.idUjian, d.idRombel, d.nama), wkt = new Date(Number(d.waktuMs));
    if (d.akses) {
      if (sesi && String(sesi.row[sesi.cols.status - 1]) === 'Selesai') {
        sesi.sheet.getRange(sesi.rowIndex, sesi.cols.percobaan).setValue(0);
        sesi.sheet.getRange(sesi.rowIndex, sesi.cols.nilaiTotal).setValue('');
        sesi.sheet.getRange(sesi.rowIndex, sesi.cols.waktuSelesai).setValue('');
      }
      var ak = ujAksesSiswa_(d.idUjian, d.idRombel, d.nama).filter(function(a) {
        return a['Status'] === 'Terbuka' && ujMsTeks_(a['Mulai']) === Number(d.akses.mulaiMs) && ujMsTeks_(a['Selesai']) === Number(d.akses.selesaiMs);
      })[0];
      if (ak) ujUbah_('AKSES', ak._baris, { 'Status': 'Dipakai', 'Ronde': d.ronde });
    }
    if (sesi) {
      sesi.sheet.getRange(sesi.rowIndex, sesi.cols.status).setValue('Berlangsung');
      sesi.sheet.getRange(sesi.rowIndex, sesi.cols.waktuMulai).setValue(wkt);
    } else {
      getSheet(CONFIG.SHEETS.PERCOBAAN_UJIAN).appendRow([d.idUjian, d.idRombel, d.nama, 'Berlangsung', 0, false, '', wkt, '']);
    }
    if (d.perangkat) ujsCerminPerangkat_({ idUjian: d.idUjian, idRombel: d.idRombel, nama: d.nama, sidik: d.perangkat.sidik, model: d.perangkat.model });
  } finally { kunci.releaseLock(); }
  try { catat_('Siswa', d.idRombel, d.nama, 'Mulai ujian', 'ujian ' + d.idUjian + ' (' + d.jenis + ', Supabase)', 'OK'); } catch (e) {}
}

function ujsCerminPerangkat_(d) {
  var k = pwKunciSiswa_(d.idUjian, d.idRombel, d.nama);
  if (pwPerangkatCari_(k)) return;
  pwTab_(PW.TAB_PD, PW.HDR_PD).appendRow([pwTeks_(pwWaktu_()), pwTeks_(d.idUjian), pwTeks_(d.idRombel), pwTeks_(d.nama), pwTeks_(d.sidik), pwTeks_(d.model), 'Aktif']);
  try { CacheService.getScriptCache().put('pw_pd_' + k, d.sidik + '|' + d.model, 1800); } catch (e) {}
}

// Salinan kiriman ujian dari Supabase -> Percobaan Ujian, Jawaban, Hasil Ujian (nilai terbaik), log. Nilai dicek ulang.
function ujsCerminKirim_(d) {
  var j = ujJadwalSiswa_(ujJadwalDariUjian_(d.idUjian), d.idRombel, d.nama);
  if (!j) return;
  var selisih = '';
  var kunci = LockService.getScriptLock();
  kunci.waitLock(20000);
  try {
    var sesi = cariBarisSesiUjian_(d.idUjian, d.idRombel, d.nama), wkt = new Date(Number(d.waktuMs));
    if (sesi) {
      if (d.berat) sesi.sheet.getRange(sesi.rowIndex, sesi.cols.terkunci).setValue(false);   // E3b: kirim otomatis pelanggaran berat
      sesi.sheet.getRange(sesi.rowIndex, sesi.cols.status).setValue('Selesai');
      sesi.sheet.getRange(sesi.rowIndex, sesi.cols.nilaiTotal).setValue(d.nilai);
      sesi.sheet.getRange(sesi.rowIndex, sesi.cols.waktuSelesai).setValue(wkt);
    } else {
      getSheet(CONFIG.SHEETS.PERCOBAAN_UJIAN).appendRow([d.idUjian, d.idRombel, d.nama, 'Selesai', 0, false, d.nilai, wkt, wkt]);
    }
    var lama = ujNilaiJawabanLama_(d.idUjian, d.nama);
    ujTulisJawaban_(j, d.idRombel, d.nama, d.benar + ' dari ' + d.total + ' soal benar', d.nilai);
    ujCatatHasil_(j, d.idRombel, d.nama, d.nilai, d.maks, d.benar, d.total);
    if (Number(d.ronde) > 0 && lama !== null && lama > d.nilai) {
      ujTulisJawaban_(j, d.idRombel, d.nama, 'Nilai terbaik dipertahankan (ujian ulang: ' + d.benar + ' dari ' + d.total + ' soal benar)', lama);
    }
    try {   // pemeriksaan ulang dengan undian & kunci dari bank soal
      var sl = ujSoalSiswa_(d.idUjian, d.idRombel, d.nama, true), tot = 0, bn = 0, jw = d.jawaban || {};
      sl.forEach(function(s) { var p = String(jw[s.id] || '').trim().toUpperCase(); if (p && p === s.kunci) { tot += s.poin; bn++; } });
      if (ujBulat2_(tot) !== Number(d.nilai) || bn !== Number(d.benar)) selisih = 'Apps Script ' + ujBulat2_(tot) + ' (' + bn + ' benar) vs Supabase ' + d.nilai;
    } catch (eC) { selisih = 'cek gagal: ' + eC.message; }
  } finally { kunci.releaseLock(); }
  try { brdLupakanSiswa_(d.idRombel, d.nama); } catch (eB) {}
  try { riwayatLupakan_(d.nama); } catch (eR) {}
  if (d.berat) { try { pwCatat_(d.idUjian, d.idRombel, d.nama, 'Jawaban dikirim otomatis (pelanggaran berat)', 'Nilai sementara ' + d.nilai + ', menunggu tinjauan'); } catch (eW) {} }
  try { catat_('Siswa', d.idRombel, d.nama, 'Kirim ujian', 'ujian ' + d.idUjian + ' · nilai ' + d.nilai + ' (Supabase)', 'OK'); } catch (e) {}
  if (selisih) { try { catat_('Sistem', d.idRombel, d.nama, 'Selisih nilai ujian Supabase', 'ujian ' + d.idUjian + ': ' + selisih, 'GAGAL'); } catch (e2) {} }
}

// E3b: salinan laporan pindah tab dari Supabase -> Percobaan Ujian, log pelanggaran, sanksi (notifikasi pimpinan).
function ujsCerminLapor_(d) {
  var kunci = LockService.getScriptLock();
  kunci.waitLock(20000);
  try {
    var sesi = cariBarisSesiUjian_(d.idUjian, d.idRombel, d.nama);
    if (sesi) {
      sesi.sheet.getRange(sesi.rowIndex, sesi.cols.percobaan).setValue(Number(d.percobaan));
      if (d.terkunci) sesi.sheet.getRange(sesi.rowIndex, sesi.cols.terkunci).setValue(true);
    } else {
      getSheet(CONFIG.SHEETS.PERCOBAAN_UJIAN).appendRow([d.idUjian, d.idRombel, d.nama, 'Berlangsung', Number(d.percobaan), !!d.terkunci, '', new Date(Number(d.waktuMs)), '']);
    }
  } finally { kunci.releaseLock(); }
  var jenis = d.jenis === 'layar_terbagi' ? 'Layar terbagi / jendela mengambang' : (d.jenis === 'jendela_lain' ? 'Jendela aplikasi lain di atas layar ujian' : 'Keluar aplikasi');
  try { pwCatat_(d.idUjian, d.idRombel, d.nama, jenis + (d.terkunci ? ' - ujian terkunci' : ''), 'Pelanggaran ke-' + d.percobaan + ' dari batas ' + d.batas); } catch (ePw) {}
  if (d.terkunci) { try { pwSetelahKunci_(d.idUjian, d.idRombel, d.nama); } catch (eSx) {} }
  try { catat_('Siswa', d.idRombel, d.nama, 'Pindah tab saat ujian', 'ujian ' + d.idUjian + ' (Supabase)', 'GAGAL'); } catch (e) {}
}

// Editor (hanya bila disetujui pemilik): salin PEPPER ke Supabase agar siswa ber-PIN dapat memulai ujian lewat Supabase.
function ujianPinSiapkan() {
  Logger.log('uj_pepper_set: HTTP ' + bljRpc_('uj_pepper_set', { p_pepper: pepper_() }).kode);
}

// Editor: hitung status ujian sekarang (uji/pemanasan sebelum ujian).
function ujianStatusSiapkan() {
  var t0 = Date.now(), n = ujsSinkron_();
  Logger.log('status ujian terkirim: ' + n + ' (' + (Date.now() - t0) + ' ms)');
  return n;
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
// tiap 10 menit, lalu sinkron penuh pertama. Aman dijalankan ulang (kunci lama dipakai, pemicu tidak dobel).
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

// Editor: bandingkan beranda 10 siswa dihitung biasa vs massal (memo) + waktu.
function berandaProfil() {
  var semua = brsSiswaSemua_().slice(0, 10), tunggal = [], beda = [];
  SHEET_MEMO_ = {};
  var t0 = Date.now();
  semua.forEach(function(sw) { tunggal.push(brdSiswa_({ nama: sw.nama, idRombel: sw.r }, true)); });
  SHEET_MEMO_ = null; MATERI_MEMO_ = null;
  var t1 = Date.now(), h = brsHitung_(semua, Date.now() + 300000), t2 = Date.now();
  var bersih = function(d) { var x = JSON.parse(JSON.stringify(d)); delete x.waktu; return JSON.stringify(x); };
  h.baris.forEach(function(b, i) { if (bersih(b.data) !== bersih(tunggal[i])) beda.push(semua[i].nama); });
  Logger.log('biasa ' + (t1 - t0) + ' ms, massal ' + (t2 - t1) + ' ms untuk ' + semua.length + ' siswa; beda: ' + (beda.length ? beda.join(', ') : 'tidak ada'));
}

// ---------------------------------------------------------------- menu siswa lambat -> simpanan Supabase (br_menu)
// Kalender, kelayakan, pencapaian (periode bawaan), dan kisi-kisi dihitung Apps Script +-9 dtk. Hasil terakhir per siswa
// disimpan di Supabase; aplikasi menampilkannya seketika lalu meminta hitung ulang di latar belakang bila sudah lama.
var BM_FN = { waSiswaKalender: 'kalender', waSiswaKelayakan: 'kelayakan', waSiswaPencapaian: 'pencapaian', waSiswaKisi: 'kisi' };
function bmSimpan_(fn, args, hasil) {
  var jenis = BM_FN[fn];
  if (!jenis || !hasil || typeof hasil !== 'object') return;
  if (fn === 'waSiswaPencapaian' && args[1] && Object.keys(args[1]).length) return;   // hanya periode bawaan
  var rb = '', nama = '';
  if (fn === 'waSiswaKalender') { rb = String(args[0] || '').trim(); nama = String(args[1] || ''); }
  else {
    var m = args[0] ? CacheService.getScriptCache().get(SS.AWAL + String(args[0])) : null;
    if (!m) return;
    var d = JSON.parse(m); rb = String(d.idRombel || '').trim(); nama = String(d.nama || '');
  }
  if (!rb || !normNama_(nama)) return;
  bljRpc_('br_menu_simpan', { p_rombel: rb, p_kunci: normNama_(nama), p_jenis: jenis, p_data: hasil });
}
