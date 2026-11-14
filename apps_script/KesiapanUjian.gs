// ============================================================================
// LAPORAN KESIAPAN SISTEM (v1.58.0, Ujian Tahap 4)
// Untuk satu Masa Ujian (terutama Tryout): seberapa siap sistem, kelancaran, dan logika anti-kecurangan.
// Sumber: Jadwal Ujian + Percobaan Ujian + Hasil Ujian (alur ujian), Log Aktivitas (masuk / mulai / kirim, berhasil / gagal),
// Log Galat (galat server & aplikasi), KINERJA UJIAN (waktu respons fungsi ujian per jam), PELANGGARAN UJIAN
// (pelanggaran, kunci, perangkat lain, token salah, koneksi terputus), dan kesiapan bank soal.
// ============================================================================
var KU = {
  TAB: 'KINERJA UJIAN',
  HDR: ['JAM', 'FUNGSI', 'PANGGILAN', 'TOTAL MS', 'TERLAMA MS', 'GAGAL', 'LAMBAT'],
  FUNGSI: ['waLogin', 'waStatusUjian', 'waMulaiUjian', 'waSubmitUjian', 'waUjianDetak', 'waLaporPindahTab', 'waStafPengawasPantau'],
  LAMBAT_MS: 3000,
  POLA_GALAT: /waMulaiUjian|waSubmitUjian|waStatusUjian|waUjianDetak|waLaporPindahTab|waStafPengawas|ujian|Ujian/
};

function kuJam_(ms) { return Utilities.formatDate(new Date(ms || Date.now()), 'Asia/Jakarta', 'yyyy-MM-dd HH:00'); }
// Dipanggil perfSetelah_ untuk setiap fungsi. Fungsi ujian dikumpulkan per jam di cache, lalu dipindah ke sheet saat jam berganti.
function kuCatat_(fn, ms, ok) {
  if (KU.FUNGSI.indexOf(fn) < 0) return;
  var c = CacheService.getScriptCache(), jam = kuJam_(), k = 'ku|' + jam, d = {};
  try { d = JSON.parse(c.get(k) || '{}') || {}; } catch (e) {}
  var x = d[fn] || [0, 0, 0, 0, 0];
  x[0]++; x[1] += ms; if (ms > x[2]) x[2] = ms; if (!ok) x[3]++; if (ms >= KU.LAMBAT_MS) x[4]++;
  d[fn] = x;
  c.put(k, JSON.stringify(d), 21600);
  var akhir = c.get('ku_jam');
  if (akhir !== jam) {
    c.put('ku_jam', jam, 21600);
    if (akhir) kuPindah_(akhir);
  }
}
// Pindahkan ringkasan satu jam dari cache ke sheet (sekali saja).
function kuPindah_(jam) {
  var c = CacheService.getScriptCache(), k = 'ku|' + jam, s = c.get(k);
  if (!s) return;
  var kunci = LockService.getScriptLock();
  if (!kunci.tryLock(5000)) return;
  try {
    if (c.get('ku_pindah|' + jam)) return;
    var d = JSON.parse(s), baris = Object.keys(d).map(function(fn) { var x = d[fn]; return [jam, fn, x[0], x[1], x[2], x[3], x[4]]; });
    if (baris.length) {
      var sh = muTab_(KU.TAB, KU.HDR);
      sh.getRange(sh.getLastRow() + 1, 1, baris.length, KU.HDR.length).setNumberFormat('@').setValues(baris.map(function(b) { return b.map(String); }));
    }
    c.put('ku_pindah|' + jam, '1', 21600);
  } catch (e) {} finally { kunci.releaseLock(); }
}

// ---------- laporan ----------
function kuDalam_(waktu, dari, sampai) { var t = String(waktu || '').slice(0, 10); return t >= dari && t <= sampai; }
function kuAlasanGagal_(detail) {
  var d = String(detail || '').toLowerCase();
  if (/token/.test(d)) return 'Token salah / belum diisi';
  if (/pin/.test(d)) return 'PIN salah';
  if (/kehadiran/.test(d)) return 'Syarat kehadiran';
  if (/pembayaran|biaya ujian/.test(d)) return 'Syarat pembayaran';
  if (/perangkat/.test(d)) return 'Perangkat lain';
  if (/belum dibuka/.test(d)) return 'Belum waktunya';
  if (/ditutup|batas masuk/.test(d)) return 'Lewat batas masuk';
  if (/terkunci/.test(d)) return 'Ujian terkunci';
  if (/kode akses/.test(d)) return 'Kode akses salah';
  if (/soal/.test(d)) return 'Soal belum siap';
  return 'Lainnya';
}

function waStafMasaLaporan(token, idMasa) {
  var p = stafDariToken_(token);
  muWajib_(p);
  var m = muCari_(idMasa);
  try { kuPindah_(kuJam_()); } catch (e0) {}   // sertakan jam berjalan
  var jad = muJadwalMasa_(m.id);   // v1.83.0: termasuk jadwal khusus unit
  if (!jad.length) throw new Error('Masa ujian ini belum ditetapkan, jadi belum ada data pelaksanaan.');
  var ids = {}, mapel = ujtPetaMapel_(), bm = nilSiswaBm_(), sekarang = Date.now();
  jad.forEach(function(j) { ids[String(j.idUjian)] = j; });
  var dari = m.dari, sampai = m.sampai;

  // 1. alur ujian per jadwal
  var sesi = {}, cols = sesiCols_(), v = getSheetData(CONFIG.SHEETS.PERCOBAAN_UJIAN);
  for (var i = 1; i < v.length; i++) {
    var idU = String(v[i][cols.idUjian - 1]);
    if (!ids[idU]) continue;
    (sesi[idU] = sesi[idU] || []).push({ status: String(v[i][cols.status - 1]), terkunci: v[i][cols.terkunci - 1] === true,
      kunci: String(v[i][cols.idRombel - 1]) + '|' + normNama_(v[i][cols.nama - 1]) });
  }
  var hasil = {};
  ujBaca_('HASIL').forEach(function(h) { if (ids[String(h['ID Ujian'])]) (hasil[String(h['ID Ujian'])] = hasil[String(h['ID Ujian'])] || []).push(h); });
  var pilih = muPilihNama_(m);   // v1.83.0: siswa tertentu / unit
  var tot = { terdaftar: 0, mulai: 0, selesai: 0, kirim: 0, waktuHabis: 0, berlangsung: 0, terkunci: 0, tidakHadir: 0 };
  // v1.83.4: peserta dihitung per ORANG (bukan siswa x mapel); data ujian disaring ke peserta masa ini saja,
  // karena masa per unit memakai ujian yang sama dengan unit lain.
  var winU = {};
  munSemua_().forEach(function(w) { if (w.masa !== m.id) winU[w.idUjian] = (winU[w.idUjian] || []).concat(w.unit); });
  var orang = {}, orangMulai = {}, orangKirim = {};
  var perJadwal = jad.map(function(j) {
    var mm = mapel[String(j.idMapel)] || {};
    var lainU = !j.jadwalUnit ? winU[String(j.idUjian)] : null;
    var siswa = (bm[mm.idRombel] || []).filter(function(sw) {
      if (pilih && !pilih[normNama_(sw.nama)]) return false;
      return !(lainU && lainU.indexOf(munUnitSiswa_(mm.idRombel, sw.nama)) >= 0);   // ikut jadwal unit masa lain
    });
    var kn = {};
    siswa.forEach(function(sw) { var k = String(mm.idRombel) + '|' + normNama_(sw.nama); kn[k] = true; orang[k] = true; });
    var ss = (sesi[String(j.idUjian)] || []).filter(function(x) { return kn[x.kunci]; });
    var hs = (hasil[String(j.idUjian)] || []).filter(function(h) { return kn[String(h['ID Rombel']) + '|' + normNama_(h['Nama Siswa'])]; });
    ss.forEach(function(x) { orangMulai[x.kunci] = true; });
    hs.forEach(function(h) { if ((parseInt(h['Total'], 10) || 0) > 0) orangKirim[String(h['ID Rombel']) + '|' + normNama_(h['Nama Siswa'])] = true; });
    var o = {
      mapel: mm.namaMapel || j.idMapel, rombel: mm.namaRombel || '', tanggal: j.tanggal, jam: j.jam, terdaftar: siswa.length,
      mulai: ss.length, selesai: ss.filter(function(x) { return x.status === 'Selesai'; }).length, berlangsung: ss.filter(function(x) { return x.status === 'Berlangsung'; }).length,
      terkunci: ss.filter(function(x) { return x.terkunci; }).length,
      kirim: hs.filter(function(h) { return (parseInt(h['Total'], 10) || 0) > 0; }).length,
      waktuHabis: hs.filter(function(h) { return (parseInt(h['Total'], 10) || 0) === 0; }).length,
      rata: null
    };
    var nil = hs.filter(function(h) { return (parseInt(h['Total'], 10) || 0) > 0; }).map(function(h) { return parseFloat(h['Persen']) || 0; });
    if (nil.length) o.rata = Math.round(nil.reduce(function(a, b) { return a + b; }, 0) / nil.length * 10) / 10;
    o.tidakHadir = j.mulaiMs < sekarang ? Math.max(0, o.terdaftar - o.mulai) : 0;
    Object.keys(tot).forEach(function(k) { tot[k] += o[k] || 0; });
    return o;
  }).sort(function(a, b) { return (a.tanggal + a.jam + a.rombel).localeCompare(b.tanggal + b.jam + b.rombel); });

  // 2. log aktivitas: masuk, mulai, kirim
  var akt = { masuk: { ok: 0, gagal: 0 }, mulai: { ok: 0, gagal: 0 }, kirim: { ok: 0, gagal: 0 }, alasanGagal: {}, siswaMasuk: {} };
  var va = getSheetData(AKTIVITAS.SHEET);
  for (var a = 1; a < va.length; a++) {
    var r = va[a];
    if (String(r[1]) !== 'Siswa' || !kuDalam_(r[0], dari, sampai)) continue;
    var aksi = String(r[4]), gagal = String(r[6]) === 'GAGAL';
    if (!orang[String(r[2]) + '|' + normNama_(r[3])]) continue;   // v1.83.4: hanya peserta masa ini
    if (aksi === 'Masuk') { akt.masuk[gagal ? 'gagal' : 'ok']++; if (!gagal) akt.siswaMasuk[String(r[2]) + '|' + normNama_(r[3])] = true; }
    else if (aksi === 'Mulai ujian' && String(r[5]).indexOf('ujian ') === 0 && ids[String(r[5]).split(' ')[1]]) {
      akt.mulai[gagal ? 'gagal' : 'ok']++;
      if (gagal) { var al = kuAlasanGagal_(r[5]); akt.alasanGagal[al] = (akt.alasanGagal[al] || 0) + 1; }
    } else if (aksi === 'Kirim ujian' && ids[String(r[5]).split(' ')[1]]) akt.kirim[gagal ? 'gagal' : 'ok']++;
  }
  akt.siswaMasuk = Object.keys(akt.siswaMasuk).length;

  // 3. galat
  var galat = { jumlah: 0, pesan: {} };
  try {
    var vg = getSheetData(PML.SHEET_GALAT);
    for (var g = 1; g < vg.length; g++) {
      if (!kuDalam_(vg[g][0] instanceof Date ? absTgl_(vg[g][0]) : vg[g][0], dari, sampai)) continue;
      if (!KU.POLA_GALAT.test(String(vg[g][2]) + ' ' + String(vg[g][3]))) continue;
      galat.jumlah++;
      var ps = String(vg[g][3]).slice(0, 120);
      galat.pesan[ps] = (galat.pesan[ps] || 0) + 1;
    }
  } catch (eG) {}
  galat.teratas = Object.keys(galat.pesan).map(function(k) { return { pesan: k, jumlah: galat.pesan[k] }; }).sort(function(x, y) { return y.jumlah - x.jumlah; }).slice(0, 8);
  delete galat.pesan;

  // 4. waktu respons
  var kin = {};
  try {
    muBaca_(KU.TAB, KU.HDR).forEach(function(r) {
      if (!kuDalam_(r['JAM'], dari, sampai)) return;
      var x = kin[r['FUNGSI']] || (kin[r['FUNGSI']] = { panggilan: 0, total: 0, terlama: 0, gagal: 0, lambat: 0 });
      x.panggilan += Number(r['PANGGILAN']) || 0; x.total += Number(r['TOTAL MS']) || 0; x.terlama = Math.max(x.terlama, Number(r['TERLAMA MS']) || 0);
      x.gagal += Number(r['GAGAL']) || 0; x.lambat += Number(r['LAMBAT']) || 0;
    });
  } catch (eK) {}
  var nama = { waLogin: 'Masuk', waStatusUjian: 'Buka halaman ujian', waMulaiUjian: 'Mulai ujian', waSubmitUjian: 'Kirim jawaban', waUjianDetak: 'Detak (tersambung)',
    waLaporPindahTab: 'Laporan pelanggaran', waStafPengawasPantau: 'Panel pengawas' };
  var respons = KU.FUNGSI.filter(function(f) { return kin[f]; }).map(function(f) {
    var x = kin[f];
    return { fungsi: f, nama: nama[f] || f, panggilan: x.panggilan, rataMs: x.panggilan ? Math.round(x.total / x.panggilan) : 0, terlamaMs: x.terlama, gagal: x.gagal, lambat: x.lambat };
  });

  // 5. pelanggaran & anti-kecurangan
  var pel = { perJenis: {}, siswa: {}, kunci: 0, berat: 0, perangkatLain: 0, tokenSalah: 0, terputus: 0, tindakan: {} };
  pwBaca_(PW.TAB_LG, PW.HDR_LG).forEach(function(r) {
    if (!ids[String(r['ID UJIAN'])]) return;
    if (!orang[String(r['ID ROMBEL']) + '|' + normNama_(r['NAMA SISWA'])]) return;   // v1.83.4: hanya peserta masa ini
    var j0 = String(r['JENIS']), oleh = String(r['OLEH']);
    if (oleh === 'Jaringan') { pel.terputus++; return; }
    if (oleh !== 'Sistem') { pel.tindakan[j0.split(':')[0]] = (pel.tindakan[j0.split(':')[0]] || 0) + 1; return; }
    pel.perJenis[j0] = (pel.perJenis[j0] || 0) + 1;
    pel.siswa[r['ID ROMBEL'] + '|' + normNama_(r['NAMA SISWA'])] = true;
    if (j0.indexOf(PW.J_KUNCI) >= 0) pel.kunci++;
    if (j0 === PW.J_BERAT || j0.indexOf('Pelanggaran berat') === 0) pel.berat++;
    if (j0 === 'Perangkat lain') pel.perangkatLain++;
    if (j0 === 'Token salah') pel.tokenSalah++;
  });
  pel.siswa = Object.keys(pel.siswa).length;
  pel.perJenis = Object.keys(pel.perJenis).map(function(k) { return { jenis: k, jumlah: pel.perJenis[k] }; }).sort(function(x, y) { return y.jumlah - x.jumlah; });
  pel.tindakan = Object.keys(pel.tindakan).map(function(k) { return { jenis: k, jumlah: pel.tindakan[k] }; }).sort(function(x, y) { return y.jumlah - x.jumlah; });

  // 6. bank soal
  var bank = { ringkas: {}, kurang: [] };
  try {
    var ks = waStafMasaKesiapan(token, m.id);
    bank.ringkas = ks.ringkas;
    bank.kurang = ks.kesiapan.filter(function(x) { return x.status !== 'Siap'; }).map(function(x) { return { mapel: x.mapel, rombel: x.rombel, status: x.status, bank: x.bank, perlu: x.perlu }; }).slice(0, 40);
  } catch (eB) {}

  // 7. kesimpulan
  var catatan = [], skor = 0, maks = 0;
  function cek(baik, teksBaik, teksBuruk) { maks++; if (baik) skor++; catatan.push({ baik: !!baik, teks: baik ? teksBaik : teksBuruk }); }
  var lancarMulai = akt.mulai.ok + akt.mulai.gagal ? akt.mulai.ok / (akt.mulai.ok + akt.mulai.gagal) : 1;
  var kirimRasio = tot.mulai ? tot.kirim / tot.mulai : 1;
  var semuaPanggil = respons.reduce(function(s, x) { return s + x.panggilan; }, 0), semuaGagal = respons.reduce(function(s, x) { return s + x.gagal; }, 0);
  var lambat = respons.filter(function(x) { return x.fungsi !== 'waStafPengawasPantau' && x.rataMs >= KU.LAMBAT_MS; });
  cek(galat.jumlah === 0 && (!semuaPanggil || semuaGagal / semuaPanggil < 0.01), 'Tidak ada galat berarti pada fungsi ujian.',
    'Ada ' + galat.jumlah + ' galat tercatat dan ' + semuaGagal + ' panggilan gagal. Periksa daftar galat di bawah.');
  cek(!lambat.length, 'Waktu respons fungsi ujian rata-rata di bawah ' + (KU.LAMBAT_MS / 1000) + ' detik.',
    'Respons lambat pada: ' + lambat.map(function(x) { return x.nama + ' (' + (x.rataMs / 1000).toFixed(1) + ' dtk)'; }).join(', ') + '. Kurangi peserta serentak per slot atau beri jeda antar-rombel.');
  cek(kirimRasio >= 0.95, 'Hampir semua peserta yang mulai berhasil mengirim jawaban (' + Math.round(kirimRasio * 100) + '%).',
    'Hanya ' + Math.round(kirimRasio * 100) + '% peserta yang mulai berhasil mengirim jawaban; ' + tot.waktuHabis + ' habis waktu tanpa kirim. Periksa koneksi peserta dan durasi.');
  cek(lancarMulai >= 0.9, 'Sebagian besar percobaan mulai ujian berhasil (' + Math.round(lancarMulai * 100) + '%).',
    'Banyak percobaan mulai ujian gagal (' + akt.mulai.gagal + '). Penyebab terbanyak: ' + Object.keys(akt.alasanGagal).sort(function(x, y) { return akt.alasanGagal[y] - akt.alasanGagal[x]; }).slice(0, 3).join(', ') + '.');
  cek(!bank.ringkas.Kosong && !bank.ringkas.Kurang, 'Bank soal cukup untuk semua jadwal.',
    'Bank soal belum cukup: ' + (bank.ringkas.Kosong || 0) + ' jadwal kosong, ' + (bank.ringkas.Kurang || 0) + ' kurang. Minta tutor melengkapi.');
  cek(pel.terputus <= Math.max(3, tot.mulai * 0.05), 'Koneksi peserta stabil (' + pel.terputus + ' kali terputus).',
    'Koneksi peserta sering terputus (' + pel.terputus + ' kali). Pastikan sinyal/Wi-Fi ruang ujian memadai.');
  maks++; skor++;
  catatan.push({ baik: true, teks: 'Pengamanan bekerja: ' + pel.kunci + ' kunci, ' + pel.perangkatLain + ' percobaan perangkat lain, ' + pel.tokenSalah + ' token salah, ' + pel.berat + ' pelanggaran berat tercatat.' });
  var nilai = Math.round(skor / maks * 100);
  return {
    masa: { id: m.id, nama: m.nama, jenis: m.jenis, smt: m.smt, dari: dari, sampai: sampai, peserta: m.peserta.mode },
    dibuat: absWaktu_(), oleh: p.nama, sekolah: pwSekolah_(),
    ringkas: (function() { tot.peserta = Object.keys(orang).length; tot.pesertaMulai = Object.keys(orangMulai).length; tot.pesertaKirim = Object.keys(orangKirim).length;
      tot.jadwalKelas = perJadwal.length; return tot; })(), jadwal: perJadwal, aktivitas: akt, galat: galat, respons: respons, pelanggaran: pel, bank: bank,
    kesimpulan: { skor: nilai, status: nilai >= 85 ? 'Siap' : (nilai >= 60 ? 'Siap dengan catatan' : 'Belum siap'), catatan: catatan }
  };
}
