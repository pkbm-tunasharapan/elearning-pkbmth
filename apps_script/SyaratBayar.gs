// ============================================================================
// SYARAT PEMBAYARAN UJIAN & REMEDIAL LANGSUNG KE TUTOR (v1.57.0)
// - Per Masa Ujian, Admin/Superadmin dapat mencentang "syarat pembayaran biaya ujian" + nominal + kategori pemasukan.
//   Sistem membuat/memperbarui TAGIHAN "Biaya Ujian - <masa>" di Keuangan untuk peserta masa itu. Lunas (DOKU, transfer,
//   tunai dicatat Bendahara, atau keringanan sampai sisa 0) = syarat terpenuhi.
// - Gerbang mulai ujian: kehadiran (lama) + pembayaran; keduanya dapat diberi dispensasi Kepala Sekolah.
// - Ikut ujian karena dispensasi pembayaran tetapi belum lunas: nilai tampil ** untuk siswa sampai lunas (staf & rapor tetap).
// - Remedial: siswa mengajukan (dari Rekap Nilai / halaman ujian) langsung ke tutor mapel; Admin & KS menerima notifikasi;
//   tutor menyetujui (sekaligus membuka akses remedial) atau menolak. Lewat 2 hari tanpa keputusan tutor,
//   Admin / Kepala Sekolah dapat memutuskan.
// Tab: DISPENSASI BAYAR UJIAN.
// ============================================================================
var SB = {
  TAB_DIS: 'DISPENSASI BAYAR UJIAN',
  HDR_DIS: ['ID', 'MASA', 'WARGA BELAJAR', 'NAMA WB', 'ALASAN', 'DIBERI OLEH', 'DIBERI PADA', 'AKTIF'],
  PENGATUR: ['Admin', 'Superadmin'],
  REMEDIAL_JAM: 48
};

// ---------- konfigurasi per masa ----------
function sbMasaBayar_(m) {
  var n = Math.round(Number(m && m.syaratBayar) || 0);
  return { aktif: n > 0, nominal: n, kategori: (m && m.kategoriBayar) || '', idTagihan: (m && m.idTagihan) || '' };
}
// Peserta WB masa: mode semua -> null (semua WB aktif); rombel/siswa -> daftar ID WB.
function sbPesertaWb_(m) {
  if (m.peserta.mode === 'siswa') return m.peserta.siswa.map(String);
  if (m.peserta.mode === 'unit') return Object.keys(muPilihWb_(m));   // v1.83.0
  if (m.peserta.mode === 'rombel') {
    var r = {};
    m.peserta.rombel.forEach(function(x) { r[String(x)] = true; });
    return keuWbSemua_().filter(function(w) { return w.aktif && r[w.idRombel]; }).map(function(w) { return w.id; });
  }
  return null;
}
function sbKategoriBawaan_() {
  var k = keuKategori_().filter(function(x) { return x.jenis === 'Pemasukan'; });
  var u = k.filter(function(x) { return /ujian/i.test(x.nama); })[0];
  return u ? u.kode : (k[0] ? k[0].kode : '');
}
// Tulis / perbarui tagihan masa. Mengembalikan id tagihan.
function sbTulisTagihan_(m, nominal, kategori, p) {
  var t = absBaca_(KEU.TAB_TAG, KEU.HDR_TAG), ps = sbPesertaWb_(m);
  var isi = {
    'NAMA': ('Biaya Ujian - ' + m.nama).slice(0, 120), 'KATEGORI': kategori, 'JUMLAH': nominal,
    'SASARAN': ps ? 'Siswa' : 'Semua', 'NILAI SASARAN': ps ? ps.join(',') : '', 'JATUH TEMPO': ujtTambahHari_(m.dari, -1),
    'KETERANGAN': ('Syarat mengikuti ' + m.nama + ' (' + m.id + ')').slice(0, 300), 'AKTIF': true
  };
  if (m.idTagihan) {
    for (var i = 1; i < t.v.length; i++) {
      if (sTeks_(absNilai_(t, t.v[i], 'ID TAGIHAN')).trim() !== m.idTagihan) continue;
      var row = t.v[i].slice();
      Object.keys(isi).forEach(function(k) { var c = absCol_(t, k); if (c >= 0) row[c] = isi[k]; });
      t.sh.getRange(i + 1, 1, 1, row.length).setValues([row]);
      return m.idTagihan;
    }
  }
  var id = 'TAG-' + absId_().toUpperCase();
  isi['ID TAGIHAN'] = id; isi['TAHUN PELAJARAN'] = absSim_().tahun; isi['DIBUAT OLEH'] = p.nama; isi['DIBUAT PADA'] = absWaktu_();
  t.sh.appendRow(absBaris_(t, isi));
  try { npTagihanBaru_(id); } catch (e) {}
  return id;
}
function sbTagihanAktif_(id, aktif) {
  if (!id) return;
  var t = absBaca_(KEU.TAB_TAG, KEU.HDR_TAG);
  for (var i = 1; i < t.v.length; i++) {
    if (sTeks_(absNilai_(t, t.v[i], 'ID TAGIHAN')).trim() === String(id)) { t.sh.getRange(i + 1, absCol_(t, 'AKTIF') + 1).setValue(!!aktif); return; }
  }
}
// d: {aktif, nominal, kategori}
function waStafMasaBayarSimpan(token, idMasa, d) {
  var p = stafDariToken_(token);
  muWajib_(p);
  if (SB.PENGATUR.indexOf(p.peran) < 0) throw new Error('Syarat pembayaran ujian diatur Admin atau Superadmin.');
  d = d || {};
  var m = muCari_(idMasa), sh = muTab_(MU.TAB, MU.HDR), kol = function(h) { return MU.HDR.indexOf(h) + 1; };
  var kunci = kmKunciUnik_();
  kunci.waitLock(30000);
  try {
    if (d.aktif) {
      var n = Math.round(keuAngka_(d.nominal));
      if (n <= 0) throw new Error('Isi nominal biaya ujian.');
      var kat = keuKatPeta_()[String(d.kategori || '')] ? String(d.kategori) : sbKategoriBawaan_();
      if (!keuKatPeta_()[kat] || keuKatPeta_()[kat].jenis !== 'Pemasukan') throw new Error('Pilih kategori pemasukan untuk biaya ujian.');
      var idT = sbTulisTagihan_(m, n, kat, p);
      sh.getRange(m.baris, kol('SYARAT BAYAR')).setValue(n);
      sh.getRange(m.baris, kol('KATEGORI BAYAR')).setValue(kat);
      sh.getRange(m.baris, kol('ID TAGIHAN')).setValue(idT);
      catat_(p.peran, '-', p.nama, 'Syarat bayar ujian', m.nama + ': ' + n + ' (tagihan ' + idT + ')', 'OK');
      return { sukses: true, idTagihan: idT };
    }
    sh.getRange(m.baris, kol('SYARAT BAYAR')).setValue(0);
    sbTagihanAktif_(m.idTagihan, false);
    catat_(p.peran, '-', p.nama, 'Matikan syarat bayar ujian', m.nama, 'OK');
    return { sukses: true, idTagihan: '' };
  } finally { kunci.releaseLock(); }
}

// ---------- status bayar per siswa ----------
var SB_PB_ = null, SB_DIS_ = null, SB_TAG_ = {};
function sbPb_() { return SB_PB_ || (SB_PB_ = keuBayarPeta_()); }
function sbDisSemua_() {
  if (SB_DIS_) return SB_DIS_;
  var o = {};
  muBaca_(SB.TAB_DIS, SB.HDR_DIS).forEach(function(r) { if (String(r['AKTIF']).toUpperCase() === 'TRUE' || r['AKTIF'] === 'Ya') o[r['MASA'] + '|' + r['WARGA BELAJAR']] = { oleh: r['DIBERI OLEH'], pada: r['DIBERI PADA'], alasan: r['ALASAN'] }; });
  return (SB_DIS_ = o);
}
function sbTag_(id) {
  if (SB_TAG_[id] !== undefined) return SB_TAG_[id];
  var t = null;
  try { t = keuTagCari_(id); } catch (e) {}
  return (SB_TAG_[id] = t);
}
// {wajib, lunas, sisa, dispensasi, idTagihan, namaTagihan}
function sbStatusWb_(m, w) {
  var b = sbMasaBayar_(m);
  if (!b.aktif || !b.idTagihan || !w) return { wajib: false, lunas: true, sisa: 0 };
  var tag = sbTag_(b.idTagihan);
  if (!tag || !keuKena_(tag, w)) return { wajib: false, lunas: true, sisa: 0 };
  var r = keuRinci_(tag, [w], sbPb_())[0];
  var d = sbDisSemua_()[m.id + '|' + w.id] || null;
  return { wajib: true, lunas: !r || r.sisa <= 0, sisa: r ? r.sisa : 0, dispensasi: d, idTagihan: tag.id, namaTagihan: tag.nama };
}
var SB_MASA_ = {};
function sbMasaDariJadwal_(j) {
  if (!j || !j.masa) return null;
  if (SB_MASA_[j.masa] !== undefined) return SB_MASA_[j.masa];
  var m = null;
  try { m = muCari_(j.masa); } catch (e) {}
  return (SB_MASA_[j.masa] = m);
}
var SB_WB_ = {};
function sbWbSiswa_(idRombel, nama) {
  var k = idRombel + "|" + normNama_(nama);
  if (SB_WB_[k] !== undefined) return SB_WB_[k];
  var w = null;
  try { w = ksWb_({ nama: nama, idRombel: idRombel }); } catch (e) {}
  return (SB_WB_[k] = w);
}
// Gerbang mulai ujian: '' = boleh.
function sbGerbang_(j, idRombel, nama) {
  var m = sbMasaDariJadwal_(j);
  if (!m || !sbMasaBayar_(m).aktif) return '';
  var w = sbWbSiswa_(idRombel, nama);
  if (!w) return '';
  var s = sbStatusWb_(m, w);
  if (!s.wajib || s.lunas || s.dispensasi) return '';
  return 'Biaya ujian ' + m.nama + ' belum lunas (sisa ' + honRp_(s.sisa) + '). Lunasi lewat menu Tagihan (bayar online, transfer, atau ke Bendahara), ' +
    'atau minta dispensasi Kepala Sekolah.';
}
// Nilai ditahan untuk siswa (belum lunas). null = tidak ditahan.
function sbTertahan_(j, idRombel, nama) {
  var m = sbMasaDariJadwal_(j);
  if (!m || !sbMasaBayar_(m).aktif) return null;
  var w = sbWbSiswa_(idRombel, nama);
  if (!w) return null;
  var s = sbStatusWb_(m, w);
  if (!s.wajib || s.lunas) return null;
  return { sisa: s.sisa, idTagihan: s.idTagihan, namaTagihan: s.namaTagihan, masa: m.nama, pesan: 'Nilai terbuka setelah biaya ujian dilunasi (sisa ' + honRp_(s.sisa) + ').' };
}
// Riwayat jawaban siswa: nilai ujian yang ditahan diganti **.
function sbSaringRiwayat_(out, idMapel, nama) {
  var jad = {}, idR = '';
  ujJadwalSemua_().forEach(function(x) { if (x.masa && String(x.idMapel) === String(idMapel)) jad[String(x.idUjian)] = x; });
  if (!Object.keys(jad).length) return;
  mapelAktifSemua_().forEach(function(x) { if (x.idMapel === String(idMapel)) idR = x.idRombel; });
  Object.keys(out).forEach(function(k) {
    if (k.indexOf('__') === 0 || !out[k] || out[k].nilai === '' || out[k].nilai === undefined) return;
    var j = jad[k];
    if (!j) return;
    if (idR && sbTertahan_(j, idR, nama)) { out[k].nilai = '**'; out[k].tertahan = true; }
  });
}

// ---------- daftar & dispensasi pembayaran (layar Syarat ujian) ----------
function sbDaftarMasa_(m) {
  var b = sbMasaBayar_(m), out = [];
  if (!b.aktif) return out;
  var tag = sbTag_(b.idTagihan);
  if (!tag) return out;
  var dis = sbDisSemua_();
  keuRinci_(tag, keuWbSemua_(), sbPb_()).forEach(function(r) {
    if (r.sisa <= 0) return;
    out.push({ idWb: r.idWb, nama: r.nama, rombel: r.namaRombel, sisa: r.sisa, dibayar: r.dibayar, status: r.status, dispensasi: dis[m.id + '|' + r.idWb] || null });
  });
  return out;
}
function waStafMasaBayarAjukan(token, idMasa, idWbs, alasan) {
  var p = stafDariToken_(token);
  muWajib_(p);
  var m = muCari_(idMasa), a = pwAlasan_(alasan), ada = {};
  sbDaftarMasa_(m).forEach(function(x) { if (!x.dispensasi) ada[x.idWb] = x; });
  var pilih = (Array.isArray(idWbs) ? idWbs : []).map(String).filter(function(i) { return ada[i]; });
  if (!pilih.length) throw new Error('Tidak ada siswa yang perlu diajukan.');
  pilih.forEach(function(i) { pwCatat_(m.id, 'bayar|' + i, ada[i].nama, 'Permintaan dispensasi pembayaran', 'Sisa ' + ada[i].sisa + ': ' + a, p.nama); });
  npKirim_('ujian_dispensasi_minta', { judul: 'Persetujuan ikut ujian (biaya belum lunas)', isi: p.nama + ' mengajukan ' + pilih.length + ' siswa untuk ' + m.nama + ': ' +
    pilih.slice(0, 5).map(function(i) { return ada[i].nama; }).join(', ') + (pilih.length > 5 ? ', dan ' + (pilih.length - 5) + ' lainnya' : '') + '. Alasan: ' + a,
    aksi: 'masa_ujian', ref: 'disb|' + m.id + '|' + Date.now() });
  return { sukses: true, jumlah: pilih.length };
}
function waStafMasaBayarSetujui(token, idMasa, idWbs, alasan) {
  var p = stafDariToken_(token);
  if (!nilPeran_(p).dispensasi) throw new Error('Dispensasi pembayaran ujian diberikan Kepala Sekolah.');
  var m = muCari_(idMasa), a = pwAlasan_(alasan), ada = {};
  sbDaftarMasa_(m).forEach(function(x) { if (!x.dispensasi) ada[x.idWb] = x; });
  var pilih = (Array.isArray(idWbs) ? idWbs : []).map(String).filter(function(i) { return ada[i]; });
  if (!pilih.length) throw new Error('Tidak ada siswa yang perlu disetujui.');
  var sh = muTab_(SB.TAB_DIS, SB.HDR_DIS), baris = pilih.map(function(i) {
    return ['DSB-' + absId_().toUpperCase(), m.id, i, ada[i].nama, a.slice(0, 300), p.nama, ujNow_(), 'TRUE'];
  });
  sh.getRange(sh.getLastRow() + 1, 1, baris.length, SB.HDR_DIS.length).setNumberFormat('@').setValues(baris);
  catat_(p.peran, '-', p.nama, 'Dispensasi pembayaran ujian', m.nama + ': ' + pilih.length + ' siswa - ' + a, 'OK');
  return { sukses: true, jumlah: pilih.length };
}

// ---------- remedial langsung ke tutor ----------
function sbTutorMapel_(idMapel) {
  return bacaEnrollment_().filter(function(e) { return e.idMapel === String(idMapel); }).map(function(e) { return e.idPengguna; });
}
function sbJamSejak_(waktu) {
  var ms = ujMsTeks_(waktu);
  return isNaN(ms) ? 0 : (Date.now() - ms) / 3600000;
}
function sbNotifRemedialBaru_(j, idRombel, nama, idAju) {
  try {
    var m = ujtPetaMapel_()[String(j.idMapel)] || {};
    npKirim_('remedial_diajukan', { judul: 'Pengajuan remedial', isi: nama + ' (' + (m.namaRombel || idRombel) + ') mengajukan remedial ' + (m.namaMapel || '') + ' · ' +
      (j.judulKhusus || ujJudul_(j.jenis, j.smt)) + '. Tutor memutuskan; bila lewat 2 hari, Admin/Kepala Sekolah dapat memutuskan.', aksi: 'kotak_ujian',
      staf: sbTutorMapel_(j.idMapel), ref: 'rem|' + idAju });
  } catch (e) {}
}
function sbNotifRemedialPutus_(a, setuju, teks) {
  try {
    var w = sbWbSiswa_(a['ID Rombel'], a['Nama Siswa']);
    if (!w) return;
    var m = ujtPetaMapel_()[String(a['ID Mapel'])] || {};
    npKirim_('remedial_diputus', { judul: 'Remedial ' + (setuju ? 'disetujui' : 'ditolak'), isi: (m.namaMapel || 'Ujian') + ': ' + teks, aksi: 'rekap_nilai', siswa: [w.id], ref: 'remp|' + a['ID'] });
  } catch (e) {}
}
// Pengingat harian (dipanggil pemicuNotifHarian): remedial menunggu tutor lebih dari 2 hari.
function sbPengingatRemedial_() {
  ujBaca_('AJU').forEach(function(a) {
    if (a['Jenis'] !== 'Remedial' || a['Status'] !== 'Menunggu Tutor' || sbJamSejak_(a['Waktu']) < SB.REMEDIAL_JAM) return;
    var m = ujtPetaMapel_()[String(a['ID Mapel'])] || {};
    npKirim_('remedial_lewat', { judul: 'Remedial belum diputuskan tutor (lewat 2 hari)', isi: a['Nama Siswa'] + ' · ' + (m.namaMapel || '') + ' ' + (m.namaRombel || '') +
      '. Admin / Kepala Sekolah kini dapat menyetujui atau menolak di Kotak Ujian.', aksi: 'kotak_ujian', ref: 'reml|' + a['ID'] });
  });
}
// Buka akses remedial langsung untuk satu pengajuan. jadwal: {mulaiTanggal, mulaiJam, selesaiTanggal, selesaiJam}
function sbBukaRemedial_(a, jadwal, p) {
  var mulai = ujMs_(jadwal && jadwal.mulaiTanggal, jadwal && jadwal.mulaiJam), selesai = ujMs_(jadwal && jadwal.selesaiTanggal, jadwal && jadwal.selesaiJam);
  if (isNaN(mulai) || isNaN(selesai)) throw new Error('Pilih waktu mulai dan selesai akses remedial.');
  if (selesai <= mulai) throw new Error('Waktu selesai harus setelah waktu mulai.');
  if (selesai < Date.now()) throw new Error('Waktu selesai sudah lewat.');
  ujAksesSiswa_(a['ID Ujian'], a['ID Rombel'], a['Nama Siswa']).forEach(function(x) { if (x['Status'] === 'Terbuka') ujUbah_('AKSES', x._baris, { 'Status': 'Dicabut' }); });
  ujTambah_('AKSES', { 'ID': generateId_('AKS-'), 'ID Ujian': a['ID Ujian'], 'ID Rombel': a['ID Rombel'], 'Nama Siswa': a['Nama Siswa'], 'Jenis': 'Remedial',
    'Mulai': ujFmt_(mulai, 'yyyy-MM-dd HH:mm'), 'Selesai': ujFmt_(selesai, 'yyyy-MM-dd HH:mm'), 'Status': 'Terbuka', 'ID Permohonan': a['ID'], 'Dibuka Oleh': p.nama, 'Waktu Dibuka': ujNow_() });
  return ujTeksWaktu_(mulai) + ' s.d. ' + ujFmt_(selesai, 'dd/MM HH:mm');
}

// ---------- Rekap Nilai siswa: status tiap ujian semester ini (nilai ditahan, lulus / remedial, pengajuan) ----------
// s: sesi siswa {idRombel, nama}. Hasil: {kunci, tahan: {kode|UTS: info}, daftar: [...]}
function sbUjianSiswa_(s, per, peta) {
  var out = { kunci: '', tahan: {}, daftar: [] };
  try {
    var mapel = {}, kode = {};
    mapelAktifSemua_().forEach(function(m) { if (m.idRombel === String(s.idRombel)) mapel[m.idMapel] = m; });
    Object.keys(peta.kelas).forEach(function(key) {
      peta.kelas[key].forEach(function(b) { if (mapel[String(b.idMapel)]) kode[String(b.idMapel)] = key.split('|')[1]; });
    });
    var nn = normNama_(s.nama), best = {};
    ujBaca_('HASIL').forEach(function(h) {
      if (String(h['ID Rombel']) !== String(s.idRombel) || normNama_(h['Nama Siswa']) !== nn) return;
      var ps = parseFloat(h['Persen']) || 0;
      if (best[h['ID Ujian']] === undefined || ps > best[h['ID Ujian']]) best[h['ID Ujian']] = ps;
    });
    var kunci = [];
    ujJadwalSemua_().filter(function(j) { return mapel[String(j.idMapel)] && j.smt === per.smt && j.idUjian; }).forEach(function(j) {
      var th = null;
      try { th = sbTertahan_(j, s.idRombel, s.nama); } catch (e) {}
      var ps = best[String(j.idUjian)], kd = kode[String(j.idMapel)] || '';
      var o = { idUjian: String(j.idUjian), idMapel: String(j.idMapel), mapel: mapel[String(j.idMapel)].namaMapel, kode: kd, jenis: j.jenis,
        judul: j.judulKhusus || ujJudul_(j.jenis, j.smt), tanggal: j.tanggal, kkm: j.kkm, persen: th ? null : (ps === undefined ? null : Math.round(ps * 10) / 10),
        status: th ? 'Tertahan' : (ps === undefined ? 'Belum' : (ps >= j.kkm ? 'Lulus' : 'Remedial')), tertahan: th, bolehRemedial: false, pengajuan: null };
      if (th) { kunci.push(j.idUjian); if (kd && (j.jenis === 'UTS' || j.jenis === 'UAS')) out.tahan[kd + '|' + j.jenis] = th; }
      if (o.status === 'Remedial' && j.jenis !== 'TRYOUT') {
        var st = ujStatus_(j, s.idRombel, s.nama);
        o.bolehRemedial = String(st.tombol).indexOf('remedial') === 0;
        o.pengajuan = st.pengajuan;
        o.akses = st.akses || st.aksesNanti || null;
        kunci.push(j.idUjian + (st.pengajuan ? st.pengajuan.status : ''));
      }
      out.daftar.push(o);
    });
    out.daftar.sort(function(a, b) { return (a.mapel + a.tanggal).localeCompare(b.mapel + b.tanggal); });
    out.kunci = kunci.join(',').slice(0, 120);
  } catch (e) {}
  return out;
}
