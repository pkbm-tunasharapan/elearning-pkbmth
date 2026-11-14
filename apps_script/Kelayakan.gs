// ============================================================================
// ANALISA KELAYAKAN UJIAN (v1.70.0)
// Per siswa ditampilkan sekaligus: kelayakan UTS, UAS, dan UPK (UPK hanya rombel kelas akhir 6 / 9 / 12).
// - Akademik (per mapel; UTS = sesi 1 s.d. sebelum UTS, UAS = seluruh sesi semester):
//   * Ketuntasan sesi: item tiap sesi biasa yang sudah dibuka (Materi dibuka, Diskusi ditanggapi, Ujian/kuis sesi dikirim)
//     >= syarat (Aturan Nilai, bawaan 80%). Item sesi yang masih berjalan hanya dihitung bila sudah dikerjakan.
//   * Absensi: persen absensi online + 10% x persen kehadiran tatap muka (scan QR), maks. 100%, >= syarat.
// - Keuangan (semua ujian): seluruh tagihan aktif yang sudah jatuh tempo (atau tanpa jatuh tempo) lunas 100%
//   (keringanan sampai sisa 0 = lunas). UPK hanya menilai keuangan.
// - Status: Layak / Layak dengan catatan (permohonan disetujui KS) / Belum layak.
// - Permohonan (per jenis ujian): diajukan siswa lewat tombol (hanya saat Belum layak) atau dicatat petugas saat orang tua
//   menghadap (Kurikulum: pernyataan orang tua; Keuangan: janji bayar tanggal & nominal). Diteruskan otomatis ke bagian
//   terkait (akademik -> Koordinator Kurikulum, keuangan -> Bendahara, keduanya -> dua bagian), lalu didisposisi ke KS.
//   Bagian terkait dapat memanggil siswa lewat notifikasi. Admin dapat melakukan semuanya.
// - Janji bayar lewat tanggal tetapi pembayaran sejak pengajuan < nominal janji -> izin keuangan gugur (kembali Belum layak),
//   Bendahara & KS diberi tahu.
// - Gerbang mulai ujian (menggantikan syarat kehadiran & syarat bayar lama; dispensasi lama tetap dihormati).
// - Tutor (mapel yang diampu) & Koordinator Unit (siswa unitnya): hanya lihat akademik, tanpa keuangan, tanpa tindakan.
// ============================================================================
var KL = {
  TAB: 'PERMOHONAN KELAYAKAN',
  HDR: ['ID', 'WAKTU', 'ID WB', 'NAMA', 'ROMBEL', 'TAHUN', 'SEMESTER', 'UJIAN', 'JENIS', 'MAPEL KURANG', 'SISA SAAT AJU', 'ALASAN', 'SUMBER', 'DICATAT OLEH',
    'PERNYATAAN ORTU', 'JANJI TANGGAL', 'JANJI NOMINAL',
    'REK AKADEMIK', 'REK AKADEMIK CATATAN', 'REK AKADEMIK OLEH', 'REK AKADEMIK PADA',
    'REK KEUANGAN', 'REK KEUANGAN CATATAN', 'REK KEUANGAN OLEH', 'REK KEUANGAN PADA',
    'STATUS', 'KS OLEH', 'KS CATATAN', 'KS PADA', 'PANGGILAN', 'KEU GUGUR', 'CATATAN SISTEM', 'BUKA ULANG'],
  UJIAN: ['UTS', 'UAS', 'UPK'],
  TAMBAH_TM: 0.1,
  SEMUA: ['Admin', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Bendahara'],
  AKADEMIK: ['Admin', 'Koordinator Kurikulum'],
  KEUANGAN: ['Admin', 'Bendahara'],
  PUTUS: ['Admin', 'Kepala Sekolah'],
  AKTIF: ['Menunggu rekomendasi', 'Menunggu KS'],
  PERNYATAAN: 'Orang tua/wali menyatakan siap mendampingi dan menjaga agar ketidaktuntasan dan ketidakhadiran ini tidak terulang di masa depan.'
};
if (typeof API_FLUTTER !== 'undefined' && API_FLUTTER && API_FLUTTER.TAMBAHAN) {
  ['waSiswaKelayakan', 'waSiswaKelayakanAju'].forEach(function(f) { API_FLUTTER.TAMBAHAN[f] = true; });
}

// ---------- data (sekali baca per eksekusi) ----------
var KL_MEMO_ = null;
function klData_() {
  if (KL_MEMO_) return KL_MEMO_;
  var per = nilPeriode_(), at = nilAturan_(), cfg = taBaca_(), now = Date.now();
  var d = { per: per, at: at, cfg: cfg, syarat: Number(at.syaratHadir) || 80, hari: absHariIni_(), peta: hdrPetaBm_(), siswaBm: hdrSiswaBm_(),
    item: {}, baca: {}, jawab: {}, hk: {}, nmMapel: honNamaMapel_(), rb: honProgramRombel_(), sesiSt: {} };
  var aktifTa = String(cfg.label || '').trim() === String(per.tahun).trim() && per.smt >= 1 && per.smt <= cfg.jumlahSemester;
  if (aktifTa) {
    for (var n = 1; n <= cfg.sesiPerSemester; n++) {
      if (taJenis_(cfg, n) !== 'Biasa') continue;
      var info = taInfo_(cfg, per.smt, n, now);
      if (info.status !== 'mendatang') d.sesiSt[n] = info.status;
    }
    // UTS: batas tanggal tatap muka = sehari sebelum sesi UTS dimulai
    try { d.utsMulai = taInfo_(cfg, per.smt, cfg.uts, now).mulaiIso; } catch (e) {}
  }
  var ujSet = {};
  try { ujJadwalSemua_().forEach(function(j) { if (j.idUjian) ujSet[String(j.idUjian)] = true; }); } catch (e1) {}
  if (aktifTa) {
    try {
      var v = getSheet(CONFIG.SHEETS.MATERI).getDataRange().getValues(), c = materiCols_();
      for (var i = 1; i < v.length; i++) {
        var r = v[i], id = sTeks_(r[c.id - 1]).trim(), jenis = sTeks_(r[c.jenis - 1]).trim();
        if (!id || sTeks_(r[c.status - 1]).trim() !== 'Aktif' || ['Materi', 'Diskusi', 'Ujian'].indexOf(jenis) < 0) continue;
        if (jenis === 'Ujian' && ujSet[id]) continue;   // UTS/UAS terjadwal bukan bagian sesi
        var p = taParse_(cfg, c.sesi ? r[c.sesi - 1] : '');
        if (!p || p.smt !== per.smt || !d.sesiSt[p.n]) continue;
        var idM = sTeks_(r[c.idMapel - 1]).trim();
        (d.item[idM] = d.item[idM] || []).push({ id: id, jenis: jenis, judul: sTeks_(r[c.judul - 1]).slice(0, 80), n: p.n, lewat: d.sesiSt[p.n] === 'lewat' });
      }
    } catch (e2) {}
    try {
      var sb = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BACA.SHEET);
      if (sb && sb.getLastRow() > 1) sb.getRange(2, 1, sb.getLastRow() - 1, 4).getValues().forEach(function(x) {
        d.baca[sTeks_(x[0]).trim() + '|' + sTeks_(x[2]).trim() + '|' + normNama_(x[3])] = true;
      });
    } catch (e3) {}
    try {
      var vj = getSheetData(CONFIG.SHEETS.JAWABAN);
      if (vj.length) {
        var hd = vj[0].map(function(z) { return String(z).trim(); });
        var iR = hd.indexOf('ID Rombel'), iMt = hd.indexOf('ID Materi'), iS = hd.indexOf('Nama Siswa');
        for (var a = 1; a < vj.length; a++) d.jawab[sTeks_(vj[a][iR]).trim() + '|' + sTeks_(vj[a][iMt]).trim() + '|' + normNama_(vj[a][iS])] = true;
      }
    } catch (e4) {}
  }
  return (KL_MEMO_ = d);
}
function klBatas_(d, ujian) { return ujian === 'UTS' ? Math.max(0, d.cfg.uts - 1) : d.cfg.sesiPerSemester; }
function klAkhir_(d, idRombelSim) { var r = d.rb[idRombelSim]; return !!r && ujsKelasAkhir_(r.nama); }
function klHk_(d, ujian, key) {
  var k = ujian + '|' + key;
  if (d.hk[k]) return d.hk[k];
  var per = d.per;
  if (ujian === 'UTS' && d.utsMulai) {
    var batas = Utilities.formatDate(new Date(new Date(d.utsMulai + 'T00:00:00+07:00').getTime() - 86400000), absTz_(), 'yyyy-MM-dd');
    per = { tahun: d.per.tahun, semester: d.per.semester + '|UTS', smt: d.per.smt, dari: d.per.dari, sampai: batas < d.per.sampai ? batas : d.per.sampai };
  }
  return (d.hk[k] = nilHadirKelas_(per, key));
}

// ---------- komponen akademik ----------
function klTuntas_(d, bmKu, c, batas, rinci) {
  var done = 0, total = 0, kurang = [];
  if (!c) return { done: 0, total: 0, persen: null, kurang: [] };
  var nn = normNama_(c.nama);
  bmKu.forEach(function(b) {
    (d.item[b.idMapel] || []).forEach(function(it) {
      if (it.n > batas) return;
      var k = c.idRombel + '|' + it.id + '|' + nn, sudah = it.jenis === 'Materi' ? !!(d.baca[k] || d.jawab[k]) : !!d.jawab[k];
      if (!sudah && !it.lewat) return;   // sesi berjalan: hanya dihitung bila sudah dikerjakan
      total++;
      if (sudah) done++;
      else if (rinci && kurang.length < 40) kurang.push({ sesi: it.n, jenis: it.jenis, judul: it.judul });
    });
  });
  return { done: done, total: total, persen: total ? nilBulat_(done * 100 / total) : null, kurang: kurang };
}
function klOnline_(d, bmKu, c, batas) {
  var on = hdrOnline_(d.per);
  if (!on.aktif || !c || !bmKu.length) return { hadir: 0, total: 0 };
  var nn = normNama_(c.nama), set = {}, total = 0, h = 0;
  bmKu.forEach(function(b) { var x = on.hadir[b.idMapel + '|' + nn]; if (x) Object.keys(x).forEach(function(k) { if (Number(k.split('|')[1]) <= batas) set[k] = true; }); });
  Object.keys(on.wajibLewat).forEach(function(k) { if (Number(k.split('|')[1]) <= batas) total++; });
  Object.keys(set).forEach(function(k) { h++; if (!on.wajibLewat[k]) total++; });
  return { hadir: h, total: total };
}
// Rumus A: persen online + 10% x persen tatap muka, maks. 100.
function klPersenAbsen_(on, tm) {
  var po = on.total ? on.hadir * 100 / on.total : null, pt = tm.total ? tm.hadir * 100 / tm.total : null;
  if (po === null && pt === null) return { persen: null, online: po, tatapMuka: pt };
  var ps = po === null ? pt : Math.min(100, po + (pt || 0) * KL.TAMBAH_TM);
  return { persen: nilBulat_(ps), online: po === null ? null : nilBulat_(po), tatapMuka: pt === null ? null : nilBulat_(pt) };
}
function klMapel_(d, w, c, key, bmKu, ujian, rinci) {
  var batas = klBatas_(d, ujian), kode = key.split('|')[1];
  var t = klTuntas_(d, bmKu, c, batas, rinci);
  var on = klOnline_(d, bmKu, c, batas), tm = { hadir: 0, total: 0 };
  try { var g = klHk_(d, ujian, key).gabung(w.id); tm = { hadir: g.tatapMuka.hadir, total: g.tatapMuka.total }; } catch (e) {}
  var ab = klPersenAbsen_(on, tm);
  var okT = t.persen === null || t.persen >= d.syarat, okA = ab.persen === null || ab.persen >= d.syarat;
  return { kode: kode, nama: d.nmMapel[kode] || kode, tuntas: t, absen: { persen: ab.persen, online: { hadir: on.hadir, total: on.total, persen: ab.online },
    tatapMuka: { hadir: tm.hadir, total: tm.total, persen: ab.tatapMuka } }, okTuntas: okT, okAbsen: okA, ok: okT && okA };
}

// ---------- keuangan ----------
function klKeu_(d, w) {
  if (!d.tag) { d.tag = keuTagSemua_().data.filter(function(t) { return t.aktif; }); d.pb = keuBayarPeta_(); }
  var sisa = 0, rinci = [];
  d.tag.forEach(function(tag) {
    if (tag.jatuhTempo && String(tag.jatuhTempo) > d.hari) return;
    var r = keuRinci_(tag, [w], d.pb)[0];
    if (!r || r.sisa <= 0) return;
    sisa += r.sisa;
    rinci.push({ nama: tag.nama, sisa: r.sisa, jatuhTempo: tag.jatuhTempo || '' });
  });
  return { sisa: sisa, ok: sisa <= 0, tagihan: rinci };
}

// ---------- permohonan ----------
function klAjuBaca_() {
  var t = absBaca_(KL.TAB, KL.HDR), out = [];
  for (var i = 1; i < t.v.length; i++) {
    var o = { baris: i + 1 };
    KL.HDR.forEach(function(h) { var x = absNilai_(t, t.v[i], h); o[h] = x instanceof Date ? Utilities.formatDate(x, absTz_(), 'yyyy-MM-dd') : sTeks_(x); });
    if (o['ID']) out.push(o);
  }
  return { t: t, data: out };
}
function klAjuUbah_(t, baris, isi) {
  Object.keys(isi).forEach(function(k) { var c = absCol_(t, k); if (c >= 0) t.sh.getRange(baris, c + 1).setValue(isi[k]); });
}
function klAjuPeriode_(d) {
  if (d.aju) return d.aju;
  var r = klAjuBaca_();
  d.ajuT = r.t;
  return (d.aju = r.data.filter(function(x) { return x['TAHUN'] === d.per.tahun && x['SEMESTER'] === d.per.semester; }));
}
function klPakaiAka_(x) { return x['JENIS'] !== 'Keuangan'; }
function klPakaiKeu_(x) { return x['JENIS'] !== 'Akademik'; }
// Izin dari permohonan yang disetujui KS (+ cek janji bayar). keuNow: hasil klKeu_ siswa itu.
function klIzin_(d, w, ujian, keuNow) {
  var out = { aka: false, keu: false, catatan: [], aktif: null, terakhir: null };
  klAjuPeriode_(d).forEach(function(x) {
    if (x['ID WB'] !== w.id || x['UJIAN'] !== ujian) return;
    out.terakhir = x;
    if (KL.AKTIF.indexOf(x['STATUS']) >= 0) out.aktif = x;
    if (x['STATUS'] !== 'Disetujui') return;
    if (klPakaiAka_(x)) { out.aka = true; out.catatan.push('Akademik: ' + (x['KS CATATAN'] || 'disetujui KS')); }
    if (klPakaiKeu_(x)) {
      var gugur = !!x['KEU GUGUR'];
      if (!gugur && x['JANJI TANGGAL'] && x['JANJI TANGGAL'] < d.hari && keuNow && keuNow.sisa > 0) {
        var dibayar = (Number(x['SISA SAAT AJU']) || 0) - keuNow.sisa;
        if (dibayar < (Number(x['JANJI NOMINAL']) || 0)) {
          gugur = true;
          try {
            klAjuUbah_(d.ajuT || klAjuBaca_().t, x.baris, { 'KEU GUGUR': absWaktu_(), 'CATATAN SISTEM': 'Janji bayar ' + honRp_(Number(x['JANJI NOMINAL']) || 0) + ' sampai ' + x['JANJI TANGGAL'] + ' tidak ditepati (dibayar ' + honRp_(Math.max(0, dibayar)) + ').' });
            x['KEU GUGUR'] = absWaktu_();
            npKirim_('kl_janji', { judul: 'Janji bayar tidak ditepati: ' + x['NAMA'], isi: ujian + ' · janji ' + honRp_(Number(x['JANJI NOMINAL']) || 0) + ' sampai ' + x['JANJI TANGGAL'] + '. Status kembali Belum layak.', aksi: 'kelayakan', ref: 'janji|' + x['ID'] });
            npKirim_('kl_putus', { judul: 'Kelayakan ' + ujian + ' kembali Belum layak', isi: 'Janji bayar sampai ' + x['JANJI TANGGAL'] + ' belum ditepati. Hubungi bagian keuangan.', aksi: 'kelayakan_saya', siswa: [w.id], ref: 'janjiS|' + x['ID'] });
          } catch (e) {}
        }
      }
      if (!gugur) { out.keu = true; out.catatan.push('Keuangan: janji bayar ' + honRp_(Number(x['JANJI NOMINAL']) || 0) + (x['JANJI TANGGAL'] ? ' sampai ' + x['JANJI TANGGAL'] : '') + (x['KS CATATAN'] ? ' · ' + x['KS CATATAN'] : '')); }
    }
  });
  return out;
}
function klAjuRingkas_(x) {
  if (!x) return null;
  return { id: x['ID'], waktu: x['WAKTU'], ujian: x['UJIAN'], jenis: x['JENIS'], status: x['STATUS'], sumber: x['SUMBER'], alasan: x['ALASAN'], mapelKurang: x['MAPEL KURANG'],
    janjiTanggal: x['JANJI TANGGAL'], janjiNominal: Number(x['JANJI NOMINAL']) || 0, pernyataan: x['PERNYATAAN ORTU'],
    rekAkademik: x['REK AKADEMIK'], rekAkademikCatatan: x['REK AKADEMIK CATATAN'], rekAkademikOleh: x['REK AKADEMIK OLEH'],
    rekKeuangan: x['REK KEUANGAN'], rekKeuanganCatatan: x['REK KEUANGAN CATATAN'], rekKeuanganOleh: x['REK KEUANGAN OLEH'],
    ksOleh: x['KS OLEH'], ksCatatan: x['KS CATATAN'], ksPada: x['KS PADA'], panggilan: x['PANGGILAN'], keuGugur: x['KEU GUGUR'], catatanSistem: x['CATATAN SISTEM'], bukaUlang: x['BUKA ULANG'] || '' };
}

// ---------- penilaian satu siswa ----------
// keys: kelas (rombelSIM|kodeMapel) yang dinilai; o: {keu: bool, rinci: bool, siswaList, ujian: [..]}
function klWb_(d, w, c, keys, o) {
  o = o || {};
  var keu = o.keu !== false ? klKeu_(d, w) : null;
  var akhir = klAkhir_(d, w.idRombel), hasil = {};
  var ujianList = (o.ujian || KL.UJIAN).filter(function(u) { return u !== 'UPK' || (akhir && keu); });
  ujianList.forEach(function(u) {
    var izin = klIzin_(d, w, u, keu), mapel = [];
    if (u !== 'UPK') keys.forEach(function(key) {
      var bmKu = (d.peta.kelas[key] || []).filter(function(b) { return c && b.idRombel === c.idRombel; });
      mapel.push(klMapel_(d, w, c, key, bmKu, u, o.rinci));
    });
    var akaOk = mapel.every(function(m) { return m.ok; }), keuOk = !keu || keu.ok;
    var alasan = [];
    if (!akaOk) alasan.push('akademik');
    if (!keuOk) alasan.push('keuangan');
    var st = akaOk && keuOk ? 'Layak' : ((akaOk || izin.aka) && (keuOk || izin.keu) ? 'Layak dengan catatan' : 'Belum layak');
    // v1.80.0: permohonan siswa hanya 1x per jenis ujian per semester (apa pun hasilnya); Admin dapat membuka kembali (BUKA ULANG).
    var sudahAju = !!izin.terakhir && !izin.terakhir['BUKA ULANG'];
    hasil[u] = { ujian: u, status: st, akaOk: akaOk, keuOk: keuOk, izinAka: izin.aka, izinKeu: izin.keu, alasan: alasan, catatan: st === 'Layak dengan catatan' ? izin.catatan : [],
      mapel: mapel, aktif: klAjuRingkas_(izin.aktif), terakhir: klAjuRingkas_(izin.terakhir),
      bolehAju: st === 'Belum layak' && !izin.aktif && !sudahAju, sudahAju: sudahAju };
  });
  return { id: w.id, nama: w.nama, idRombel: w.idRombel, rombel: w.namaRombel || '', akhir: akhir, keu: keu, ujian: hasil };
}
// Pasangan e-learning untuk siswa-siswa satu rombel SIM.
function klCocok_(d, idR, keys, w) {
  var list = [];
  keys.forEach(function(key) { (d.peta.kelas[key] || []).forEach(function(b) { (d.siswaBm[b.idRombel] || []).forEach(function(s) { list.push(s); }); }); });
  return nilCocokBm_(w, list);
}
function klKeysRombel_(d, idR, saring) {
  return Object.keys(d.peta.aktif).filter(function(k) { return k.split('|')[0] === idR && (!saring || saring(k)); })
    .sort(function(a, b) { return String(d.nmMapel[a.split('|')[1]] || a).localeCompare(String(d.nmMapel[b.split('|')[1]] || b)); });
}

// ---------- peran & cakupan ----------
function klPeran_(p) {
  var r = String(p && p.peran || '');
  var o = { semua: KL.SEMUA.indexOf(r) >= 0, tutor: r === 'Tutor', ku: r === 'Koordinator Unit', aka: KL.AKADEMIK.indexOf(r) >= 0, keuAksi: KL.KEUANGAN.indexOf(r) >= 0,
    putus: KL.PUTUS.indexOf(r) >= 0, admin: r === 'Admin' };
  o.panggil = o.aka || o.keuAksi || o.putus;
  o.lihatKeu = o.semua;
  if (!o.semua && !o.tutor && !o.ku) throw new Error('Analisa Kelayakan Ujian untuk Admin, Kepala Sekolah, Koordinator Kurikulum, Bendahara, Tutor, dan Koordinator Unit.');
  return o;
}
// Cakupan: {wb(w) -> bool, key(k) -> bool}
function klCakupan_(p, r, d) {
  if (r.semua) return { wb: function() { return true; }, key: null };
  if (r.tutor) {
    var milik = {};
    bacaEnrollment_().forEach(function(e) { if (e.idPengguna === String(p.id)) milik[e.idMapel] = true; });
    var keys = {};
    Object.keys(d.peta.kelas).forEach(function(k) { d.peta.kelas[k].forEach(function(b) { if (milik[b.idMapel]) keys[k] = true; }); });
    var rb = {};
    Object.keys(keys).forEach(function(k) { rb[k.split('|')[0]] = true; });
    return { wb: function(w) { return !!rb[w.idRombel]; }, key: function(k) { return !!keys[k]; } };
  }
  var unit = {};
  ubUnitSaya_(p).forEach(function(u) { unit[u.id] = true; });
  var lab = ubPetaSiswa_();
  return { wb: function(w) { return !!unit[ubUnitEf_(w.id, lab)]; }, key: null };
}

// ---------- endpoint petugas ----------
// q: {idRombel}. Hasil: daftar rombel dalam cakupan + penilaian siswa rombel terpilih (UTS, UAS, UPK).
function waStafKelayakanDaftar(token, q) {
  var p = stafDariToken_(token), r = klPeran_(p), d = klData_(), cak = klCakupan_(p, r, d);
  q = q || {};
  var wbs = keuWbSemua_().filter(function(w) { return w.aktif && cak.wb(w); }), adaR = {};
  wbs.forEach(function(w) { adaR[w.idRombel] = (adaR[w.idRombel] || 0) + 1; });
  var rombel = Object.keys(adaR).filter(function(id) { return klKeysRombel_(d, id, cak.key).length || r.lihatKeu; })
    .map(function(id) { return { id: id, nama: d.rb[id] ? d.rb[id].nama : id, jumlah: adaR[id], akhir: klAkhir_(d, id) }; })
    .sort(function(a, b) { return a.nama.localeCompare(b.nama, 'id', { numeric: true }); });
  var idR = rombel.some(function(x) { return x.id === String(q.idRombel || ''); }) ? String(q.idRombel) : (rombel[0] ? rombel[0].id : '');
  var keys = idR ? klKeysRombel_(d, idR, cak.key) : [];
  var siswa = wbs.filter(function(w) { return w.idRombel === idR; }).sort(function(a, b) { return a.nama.localeCompare(b.nama); }).map(function(w) {
    var h = klWb_(d, w, klCocok_(d, idR, keys, w), keys, { keu: r.lihatKeu });
    if (!r.lihatKeu) Object.keys(h.ujian).forEach(function(u) { h.ujian[u].aktif = null; h.ujian[u].terakhir = null; });
    return h;
  });
  return { rombel: rombel, idRombel: idR, mapel: keys.map(function(k) { var km = k.split('|')[1]; return { kode: km, nama: d.nmMapel[km] || km }; }),
    siswa: siswa, syarat: d.syarat, tambahTm: KL.TAMBAH_TM * 100, periode: d.per.tahun + ' ' + d.per.semester, uts: d.cfg.uts,
    peran: { keu: r.lihatKeu, aka: r.aka, keuAksi: r.keuAksi, putus: r.putus, panggil: r.panggil, tutor: r.tutor || r.ku }, pernyataan: KL.PERNYATAAN };
}
// Rincian satu siswa (item sesi yang belum tuntas, absensi, tagihan, riwayat permohonan).
function waStafKelayakanSiswa(token, idWb) {
  var p = stafDariToken_(token), r = klPeran_(p), d = klData_(), cak = klCakupan_(p, r, d);
  var w = keuWbSemua_().filter(function(x) { return x.id === String(idWb || ''); })[0];
  if (!w || !cak.wb(w)) throw new Error('Siswa tidak ditemukan dalam cakupan Anda.');
  var keys = klKeysRombel_(d, w.idRombel, cak.key);
  var h = klWb_(d, w, klCocok_(d, w.idRombel, keys, w), keys, { keu: r.lihatKeu, rinci: true });
  h.riwayat = r.lihatKeu ? klAjuPeriode_(d).filter(function(x) { return x['ID WB'] === w.id; }).reverse().map(klAjuRingkas_) : [];
  h.syarat = d.syarat;
  return h;
}
// Antrean permohonan (Admin, KS, Kurikulum, Bendahara). q: {status: 'aktif'|'semua'}
function waStafKelayakanPermohonan(token, q) {
  var p = stafDariToken_(token), r = klPeran_(p);
  if (!r.semua) throw new Error('Permohonan kelayakan untuk Admin, Kepala Sekolah, Koordinator Kurikulum, dan Bendahara.');
  q = q || {};
  var d = klData_(), data = klAjuPeriode_(d).filter(function(x) { return q.status === 'semua' || KL.AKTIF.indexOf(x['STATUS']) >= 0; }).reverse().slice(0, 300).map(function(x) {
    var o = klAjuRingkas_(x);
    o.idWb = x['ID WB']; o.nama = x['NAMA']; o.rombel = x['ROMBEL']; o.sisaSaatAju = Number(x['SISA SAAT AJU']) || 0;
    var aktif = KL.AKTIF.indexOf(x['STATUS']) >= 0;
    o.bolehRekAka = aktif && r.aka && klPakaiAka_(x);
    o.bolehRekKeu = aktif && r.keuAksi && klPakaiKeu_(x);
    o.bolehPutus = r.putus && x['STATUS'] === 'Menunggu KS';
    return o;
  });
  return { data: data, peran: { aka: r.aka, keuAksi: r.keuAksi, putus: r.putus, panggil: r.panggil }, pernyataan: KL.PERNYATAAN };
}
function klLengkap_(x) {
  return (!klPakaiAka_(x) || !!x['REK AKADEMIK']) && (!klPakaiKeu_(x) || !!x['REK KEUANGAN']);
}
function klTeruskanKs_(t, x) {
  if (x['STATUS'] !== 'Menunggu rekomendasi' || !klLengkap_(x)) return;
  klAjuUbah_(t, x.baris, { 'STATUS': 'Menunggu KS' });
  x['STATUS'] = 'Menunggu KS';
  npKirim_('kl_ks', { judul: 'Permohonan kelayakan ' + x['UJIAN'] + ' menunggu keputusan', isi: x['NAMA'] + ' (' + x['ROMBEL'] + ') · ' + x['JENIS'] + '.', aksi: 'kelayakan', ref: 'ks|' + x['ID'] });
}
function klAjuCari_(id) {
  var r = klAjuBaca_(), x = r.data.filter(function(v) { return v['ID'] === String(id || ''); })[0];
  if (!x) throw new Error('Permohonan tidak ditemukan.');
  return { t: r.t, x: x };
}
// d: {id, bagian: 'akademik'|'keuangan', setuju: bool, catatan}
function waStafKelayakanRekomendasi(token, q) {
  var p = stafDariToken_(token), r = klPeran_(p);
  q = q || {};
  var bagian = q.bagian === 'keuangan' ? 'keuangan' : 'akademik';
  if (bagian === 'akademik' ? !r.aka : !r.keuAksi) throw new Error(bagian === 'akademik' ? 'Rekomendasi akademik oleh Koordinator Kurikulum.' : 'Rekomendasi keuangan oleh Bendahara.');
  var catatan = String(q.catatan || '').trim();
  if (catatan.length < 5) throw new Error('Isi catatan rekomendasi.');
  var kunci = LockService.getScriptLock();
  kunci.waitLock(20000);
  try {
    var c = klAjuCari_(q.id), x = c.x;
    if (KL.AKTIF.indexOf(x['STATUS']) < 0) throw new Error('Permohonan ini sudah ' + x['STATUS'] + '.');
    if (bagian === 'akademik' ? !klPakaiAka_(x) : !klPakaiKeu_(x)) throw new Error('Permohonan ini tidak memerlukan rekomendasi ' + bagian + '.');
    var pre = bagian === 'akademik' ? 'REK AKADEMIK' : 'REK KEUANGAN', isi = {};
    isi[pre] = q.setuju === true ? 'Direkomendasikan' : 'Tidak direkomendasikan';
    isi[pre + ' CATATAN'] = catatan.slice(0, 400); isi[pre + ' OLEH'] = p.nama; isi[pre + ' PADA'] = absWaktu_();
    klAjuUbah_(c.t, x.baris, isi);
    Object.keys(isi).forEach(function(k) { x[k] = isi[k]; });
    klTeruskanKs_(c.t, x);
    catat_(p.peran, '-', p.nama, 'Rekomendasi kelayakan ' + bagian, x['ID'] + ' ' + x['NAMA'] + ' ' + isi[pre], 'OK');
    return { sukses: true, status: x['STATUS'] };
  } finally { try { SpreadsheetApp.flush(); } catch (eF) {} kunci.releaseLock(); }
}
// KS / Admin memutuskan. q: {id, setuju, catatan}
function waStafKelayakanPutus(token, q) {
  var p = stafDariToken_(token), r = klPeran_(p);
  if (!r.putus) throw new Error('Keputusan permohonan kelayakan oleh Kepala Sekolah.');
  q = q || {};
  var catatan = String(q.catatan || '').trim();
  if (catatan.length < 5) throw new Error('Isi catatan keputusan.');
  var kunci = LockService.getScriptLock();
  kunci.waitLock(20000);
  try {
    var c = klAjuCari_(q.id), x = c.x;
    if (x['STATUS'] !== 'Menunggu KS' && !(r.admin && x['STATUS'] === 'Menunggu rekomendasi')) throw new Error('Permohonan ini berstatus ' + x['STATUS'] + '.');
    var st = q.setuju === true ? 'Disetujui' : 'Ditolak';
    klAjuUbah_(c.t, x.baris, { 'STATUS': st, 'KS OLEH': p.nama, 'KS CATATAN': catatan.slice(0, 400), 'KS PADA': absWaktu_() });
    catat_(p.peran, '-', p.nama, 'Putus kelayakan ' + x['UJIAN'], x['ID'] + ' ' + x['NAMA'] + ' ' + st, 'OK');
    npKirim_('kl_putus', { judul: 'Permohonan kelayakan ' + x['UJIAN'] + ' ' + st.toLowerCase(),
      isi: (st === 'Disetujui' ? 'Status Anda menjadi Layak dengan catatan: ' : 'Catatan: ') + catatan.slice(0, 200), aksi: 'kelayakan_saya', siswa: [x['ID WB']], ref: 'putus|' + x['ID'] });
    return { sukses: true, status: st };
  } finally { try { SpreadsheetApp.flush(); } catch (eF) {} kunci.releaseLock(); }
}
// Panggilan lewat notifikasi. q: {idWb, pesan}
function waStafKelayakanPanggil(token, q) {
  var p = stafDariToken_(token), r = klPeran_(p);
  if (!r.panggil) throw new Error('Pemanggilan oleh Koordinator Kurikulum, Bendahara, Kepala Sekolah, atau Admin.');
  q = q || {};
  var pesan = String(q.pesan || '').trim();
  if (pesan.length < 10) throw new Error('Tulis isi panggilan (mis. waktu dan tempat menghadap).');
  var w = keuWbSemua_().filter(function(x) { return x.id === String(q.idWb || ''); })[0];
  if (!w) throw new Error('Siswa tidak ditemukan.');
  var bagian = r.aka && !r.admin ? 'Bagian Kurikulum' : (r.keuAksi && !r.admin ? 'Bagian Keuangan' : (p.peran === 'Kepala Sekolah' ? 'Kepala Sekolah' : 'Admin'));
  npKirim_('kl_panggil', { judul: 'Panggilan dari ' + bagian, isi: pesan.slice(0, 450) + ' (' + p.nama + ')', aksi: 'kelayakan_saya', siswa: [w.id], ref: 'panggil|' + w.id + '|' + Date.now() });
  var d = klData_(), akt = klAjuPeriode_(d).filter(function(x) { return x['ID WB'] === w.id && KL.AKTIF.indexOf(x['STATUS']) >= 0; });
  akt.forEach(function(x) {
    var log = (x['PANGGILAN'] ? x['PANGGILAN'] + '\n' : '') + absWaktu_() + ' ' + p.nama + ': ' + pesan.slice(0, 200);
    klAjuUbah_(d.ajuT, x.baris, { 'PANGGILAN': log.slice(-1500) });
  });
  catat_(p.peran, w.idRombel, p.nama, 'Panggil siswa (kelayakan)', w.nama + ': ' + pesan.slice(0, 150), 'OK');
  return { sukses: true };
}

// Buat permohonan (dipakai siswa & form orang tua). Hasil: baris permohonan (objek).
function klAjuBuat_(d, w, h, ujian, isi) {
  var u = h.ujian[ujian];
  if (!u) throw new Error('Ujian ' + ujian + ' tidak berlaku untuk siswa ini.');
  if (u.status !== 'Belum layak') throw new Error('Status kelayakan ' + ujian + ' sudah ' + u.status + '.');
  if (u.aktif) throw new Error('Sudah ada permohonan ' + ujian + ' yang sedang diproses.');
  var aka = !u.akaOk && !u.izinAka, keu = !u.keuOk && !u.izinKeu;
  var jenis = aka && keu ? 'Keduanya' : (aka ? 'Akademik' : 'Keuangan');
  var kurang = u.mapel.filter(function(m) { return !m.ok; }).map(function(m) { return m.nama + (m.okTuntas ? '' : ' (tuntas ' + m.tuntas.persen + '%)') + (m.okAbsen ? '' : ' (absen ' + m.absen.persen + '%)'); }).join('; ');
  var id = 'KL-' + absId_().toUpperCase();
  var baris = { 'ID': id, 'WAKTU': absWaktu_(), 'ID WB': w.id, 'NAMA': w.nama, 'ROMBEL': w.namaRombel || '', 'TAHUN': d.per.tahun, 'SEMESTER': d.per.semester,
    'UJIAN': ujian, 'JENIS': jenis, 'MAPEL KURANG': kurang.slice(0, 500), 'SISA SAAT AJU': h.keu ? h.keu.sisa : 0, 'STATUS': 'Menunggu rekomendasi' };
  Object.keys(isi).forEach(function(k) { baris[k] = isi[k]; });
  var t = absBaca_(KL.TAB, KL.HDR);
  t.sh.appendRow(absBaris_(t, baris));
  d.aju = null;
  if (jenis !== 'Keuangan') npKirim_('kl_aju_akademik', { judul: 'Permohonan kelayakan ' + ujian + ' (akademik)', isi: w.nama + ' (' + (w.namaRombel || '') + ') · ' + kurang.slice(0, 200), aksi: 'kelayakan', ref: 'aka|' + id });
  if (jenis !== 'Akademik') npKirim_('kl_aju_keuangan', { judul: 'Permohonan kelayakan ' + ujian + ' (keuangan)', isi: w.nama + ' (' + (w.namaRombel || '') + ') · sisa ' + honRp_(h.keu ? h.keu.sisa : 0), aksi: 'kelayakan', ref: 'keu|' + id });
  return baris;
}
function klJanji_(q, keu) {
  var tg = String(q.janjiTanggal || '').trim(), nom = Math.round(keuAngka_(q.janjiNominal));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tg) || tg < absHariIni_()) throw new Error('Isi tanggal janji bayar (hari ini atau sesudahnya).');
  if (!(nom > 0)) throw new Error('Isi nominal yang akan dibayar.');
  if (keu && nom > keu.sisa) throw new Error('Nominal janji melebihi sisa tagihan (' + honRp_(keu.sisa) + ').');
  return { tg: tg, nom: nom };
}
// Orang tua menghadap: petugas mengisi form. q: {idWb, ujian, bagian, pernyataan | janjiTanggal + janjiNominal, setuju, catatan}
function waStafKelayakanOrtu(token, q) {
  var p = stafDariToken_(token), r = klPeran_(p);
  q = q || {};
  var bagian = q.bagian === 'keuangan' ? 'keuangan' : 'akademik';
  if (bagian === 'akademik' ? !r.aka : !r.keuAksi) throw new Error(bagian === 'akademik' ? 'Form orang tua (akademik) diisi Koordinator Kurikulum.' : 'Form orang tua (keuangan) diisi Bendahara.');
  var ujian = KL.UJIAN.indexOf(String(q.ujian)) >= 0 ? String(q.ujian) : '';
  if (!ujian) throw new Error('Pilih jenis ujian.');
  var catatan = String(q.catatan || '').trim();
  if (catatan.length < 5) throw new Error('Isi catatan rekomendasi.');
  var w = keuWbSemua_().filter(function(x) { return x.id === String(q.idWb || ''); })[0];
  if (!w) throw new Error('Siswa tidak ditemukan.');
  var kunci = LockService.getScriptLock();
  kunci.waitLock(25000);
  try {
    var d = klData_(), keys = klKeysRombel_(d, w.idRombel, null), h = klWb_(d, w, klCocok_(d, w.idRombel, keys, w), keys, { keu: true });
    var u = h.ujian[ujian];
    if (!u) throw new Error('Ujian ' + ujian + ' tidak berlaku untuk siswa ini.');
    var isi = {}, pre = bagian === 'akademik' ? 'REK AKADEMIK' : 'REK KEUANGAN';
    if (bagian === 'akademik') isi['PERNYATAAN ORTU'] = String(q.pernyataan || KL.PERNYATAAN).trim().slice(0, 600);
    else { var j = klJanji_(q, h.keu); isi['JANJI TANGGAL'] = j.tg; isi['JANJI NOMINAL'] = j.nom; }
    isi[pre] = q.setuju === true ? 'Direkomendasikan' : 'Tidak direkomendasikan';
    isi[pre + ' CATATAN'] = ('Orang tua menghadap. ' + catatan).slice(0, 400); isi[pre + ' OLEH'] = p.nama; isi[pre + ' PADA'] = absWaktu_();
    var x = null, t = absBaca_(KL.TAB, KL.HDR);
    if (u.aktif) {
      var c = klAjuCari_(u.aktif.id);
      x = c.x; t = c.t;
      if (bagian === 'akademik' ? !klPakaiAka_(x) : !klPakaiKeu_(x)) throw new Error('Permohonan aktif siswa ini tidak memuat urusan ' + bagian + '.');
      isi['SUMBER'] = /orang tua/i.test(x['SUMBER']) ? x['SUMBER'] : (x['SUMBER'] + ' + orang tua');
      klAjuUbah_(t, x.baris, isi);
      Object.keys(isi).forEach(function(k) { x[k] = isi[k]; });
    } else {
      isi['SUMBER'] = 'Orang tua'; isi['DICATAT OLEH'] = p.nama;
      isi['ALASAN'] = 'Orang tua/wali menghadap ' + (bagian === 'akademik' ? 'bagian kurikulum' : 'bagian keuangan') + '.';
      klAjuBuat_(d, w, h, ujian, isi);
      x = klAjuBaca_().data.filter(function(v) { return v['ID WB'] === w.id && v['UJIAN'] === ujian && KL.AKTIF.indexOf(v['STATUS']) >= 0; }).pop();
      t = absBaca_(KL.TAB, KL.HDR);
      if (x && bagian === 'keuangan' && !klPakaiKeu_(x)) throw new Error('Siswa ini tidak memiliki kekurangan keuangan untuk ' + ujian + '.');
      if (x && bagian === 'akademik' && !klPakaiAka_(x)) throw new Error('Siswa ini tidak memiliki kekurangan akademik untuk ' + ujian + '.');
    }
    if (x) klTeruskanKs_(t, x);
    catat_(p.peran, w.idRombel, p.nama, 'Form orang tua kelayakan ' + bagian, w.nama + ' ' + ujian, 'OK');
    return { sukses: true, status: x ? x['STATUS'] : '' };
  } finally { try { SpreadsheetApp.flush(); } catch (eF) {} kunci.releaseLock(); }
}

// v1.80.0: Admin membuka kembali tombol permohonan siswa (permohonan hanya 1x). q: {idWb, ujian}
function waStafKelayakanBukaUlang(token, q) {
  var p = stafDariToken_(token);
  if (p.peran !== 'Admin') throw new Error('Membuka kembali permohonan kelayakan hanya oleh Admin.');
  q = q || {};
  var ujian = KL.UJIAN.indexOf(String(q.ujian)) >= 0 ? String(q.ujian) : '';
  if (!ujian) throw new Error('Pilih jenis ujian.');
  var kunci = LockService.getScriptLock();
  kunci.waitLock(25000);
  try {
    var d = klData_();
    var x = klAjuPeriode_(d).filter(function(v) { return v['ID WB'] === String(q.idWb || '') && v['UJIAN'] === ujian; }).pop();
    if (!x) throw new Error('Siswa ini belum pernah mengajukan permohonan ' + ujian + ' semester ini.');
    if (KL.AKTIF.indexOf(x['STATUS']) >= 0) throw new Error('Permohonan ' + ujian + ' siswa ini masih diproses.');
    if (x['BUKA ULANG']) throw new Error('Permohonan ' + ujian + ' siswa ini sudah dibuka kembali.');
    var t = d.ajuT || klAjuBaca_().t;
    if (absCol_(t, 'BUKA ULANG') < 0) {
      var n = t.v[0].length;
      t.sh.getRange(1, n + 1).setValue('BUKA ULANG').setFontWeight('bold');
      t.h['BUKA ULANG'] = n; t.v[0].push('BUKA ULANG');
    }
    klAjuUbah_(t, x.baris, { 'BUKA ULANG': absWaktu_() + ' · ' + p.nama });
    try { npKirim_('kl_putus', { judul: 'Permohonan kelayakan ' + ujian + ' dapat diajukan kembali', isi: 'Admin membuka kembali tombol permohonan. Permohonan tetap hanya bisa diajukan 1 kali.', aksi: 'kelayakan_saya', siswa: [x['ID WB']], ref: 'buka|' + x['ID'] }); } catch (eN) {}
    catat_(p.peran, x['ROMBEL'], p.nama, 'Buka ulang permohonan kelayakan', x['NAMA'] + ' ' + ujian + ' (' + x['ID'] + ')', 'OK');
    return { sukses: true };
  } finally { try { SpreadsheetApp.flush(); } catch (eF) {} kunci.releaseLock(); }
}

// ---------- siswa ----------
function klSiswa_(token) {
  var s = siswaDariSesi_(token), w = ksWb_(s), d = klData_();
  var keys = klKeysRombel_(d, w.idRombel, null);
  return { s: s, w: w, d: d, keys: keys, c: { idRombel: s.idRombel, nama: s.nama } };
}
function waSiswaKelayakan(token) {
  var k = klSiswa_(token), h = klWb_(k.d, k.w, k.c, k.keys, { keu: true, rinci: true });
  h.syarat = k.d.syarat; h.tambahTm = KL.TAMBAH_TM * 100; h.periode = k.d.per.tahun + ' ' + k.d.per.semester;
  h.riwayat = klAjuPeriode_(k.d).filter(function(x) { return x['ID WB'] === k.w.id; }).reverse().map(klAjuRingkas_);
  return h;
}
// q: {ujian, alasan, janjiTanggal?, janjiNominal?}
function waSiswaKelayakanAju(token, q) {
  q = q || {};
  var kunci = LockService.getScriptLock();
  kunci.waitLock(25000);
  try {
    var k = klSiswa_(token), h = klWb_(k.d, k.w, k.c, k.keys, { keu: true });
    var ujian = String(q.ujian || ''), u = h.ujian[ujian];
    if (!u) throw new Error('Pilih jenis ujian.');
    if (u.sudahAju && !u.aktif) throw new Error('Permohonan kelayakan ' + ujian + ' hanya bisa diajukan 1 kali dan sudah Anda ajukan. Hubungi admin bila perlu mengajukan kembali.');
    var alasan = String(q.alasan || '').trim();
    if (alasan.length < 10) throw new Error('Tuliskan alasan permohonan (minimal 10 huruf).');
    var isi = { 'ALASAN': alasan.slice(0, 600), 'SUMBER': 'Siswa', 'DICATAT OLEH': k.w.nama };
    if (!u.keuOk && !u.izinKeu) { var j = klJanji_(q, h.keu); isi['JANJI TANGGAL'] = j.tg; isi['JANJI NOMINAL'] = j.nom; }
    var b = klAjuBuat_(k.d, k.w, h, ujian, isi);
    try { catat_('Siswa', k.s.idRombel, k.w.nama, 'Ajukan kelayakan ' + ujian, b['ID'] + ' ' + b['JENIS'], 'OK'); } catch (e) {}
    return { sukses: true, id: b['ID'], jenis: b['JENIS'], pesan: 'Permohonan terkirim ke ' + (b['JENIS'] === 'Keduanya' ? 'bagian kurikulum dan keuangan' : (b['JENIS'] === 'Akademik' ? 'bagian kurikulum' : 'bagian keuangan')) + ', lalu diputuskan Kepala Sekolah.' };
  } finally { try { SpreadsheetApp.flush(); } catch (eF) {} kunci.releaseLock(); }
}

// ---------- gerbang mulai ujian (menggantikan nilGerbangUjian_ & sbGerbang_) ----------
function klUjianDariJadwal_(j) {
  if (!j || j.jenis === 'TRYOUT') return '';
  if (j.jenis === 'UTS' || j.jenis === 'UAS' || j.jenis === 'UPK') return j.jenis;
  var m = sbMasaDariJadwal_(j);
  return m && m.cakupan === 'UTS' ? 'UTS' : 'UAS';
}
function klGerbang_(j, idRombelBm, namaBm) {
  var ujian = klUjianDariJadwal_(j);
  if (!ujian) return '';
  var d = klData_();
  if (!d.at.blokir) return '';
  var key = '';
  Object.keys(d.peta.kelas).forEach(function(kk) { d.peta.kelas[kk].forEach(function(b) { if (b.idMapel === String(j.idMapel)) key = kk; }); });
  var w = sbWbSiswa_(idRombelBm, namaBm);
  if (!w) return '';
  var ck = 'klg|' + w.id + '|' + ujian + '|' + key, cache = CacheService.getScriptCache();
  try { if (cache.get(ck)) return ''; } catch (e0) {}
  var h = klWb_(d, w, { idRombel: idRombelBm, nama: namaBm }, key && ujian !== 'UPK' ? [key] : [], { keu: true, ujian: [ujian === 'UPK' ? 'UPK' : ujian] });
  var u = h.ujian[ujian];
  if (!u) return '';   // mis. UPK untuk rombel bukan kelas akhir
  var akaOk = u.akaOk || u.izinAka, keuOk = u.keuOk || u.izinKeu;
  if (!akaOk && key) { try { if (nilDisCari_(nilDisBaca_(d.per), w.id, key.split('|')[0], key.split('|')[1], j.jenis)) akaOk = true; } catch (e1) {} }
  if (!keuOk) { try { var m = sbMasaDariJadwal_(j); if (m && sbDisSemua_()[m.id + '|' + w.id]) keuOk = true; } catch (e2) {} }
  if (akaOk && keuOk) { try { cache.put(ck, '1', 300); } catch (e3) {} return ''; }
  var mp = u.mapel[0], bagian = [];
  if (!akaOk && mp) bagian.push((mp.okTuntas ? '' : 'ketuntasan sesi ' + mp.tuntas.persen + '%') + (!mp.okTuntas && !mp.okAbsen ? ', ' : '') + (mp.okAbsen ? '' : 'absensi ' + mp.absen.persen + '%') + ' (minimal ' + d.syarat + '%)');
  if (!keuOk) bagian.push('tagihan belum lunas (sisa ' + honRp_(h.keu ? h.keu.sisa : 0) + ')');
  return 'Anda belum layak mengikuti ' + ujian + ' ini: ' + bagian.join('; ') + '. Buka menu Kelayakan Ujian untuk melihat rinciannya dan mengajukan permohonan.';
}
