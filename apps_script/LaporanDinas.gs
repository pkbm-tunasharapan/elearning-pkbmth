// ============================================================================
// LAPORAN DINAS ASESMEN (v1.96.0) - "Cetak Laporan Dinas"
// Walau ujian dikerjakan online, lembaga wajib menyiapkan (SE Disdik): SK panitia penyelenggara, jadwal, naskah soal
// seluruh mapel semua paket, dan lembar jawaban. Aplikasi menyusun PDF gabungan; server menyediakan data:
// - waStafMasaLaporanData(token, jenis): masa ujian (Ditetapkan, semester berjalan) + rombel x ujian + isian SK
//   (tersimpan / bawaan: kepala, pengawas dari penugasan, penyusun soal dari pengampu).
// - waStafMasaLaporanSkSimpan(token, jenis, sk): simpan isian SK per tahun|semester|jenis (Script Properties).
// - waStafMasaLaporanSoal(token, idUjian[]): naskah sampel (satu versi, benih sama dengan naskah ujian tulis).
// ============================================================================
var LD = { PROP: 'LAPDIN_SK|', MAKS_UJIAN: 14 };

function ldKunci_(jenis) { var per = nilPeriode_(); return LD.PROP + per.tahun + '|' + per.smt + '|' + String(jenis || 'UAS').toUpperCase(); }
function ldNamaJenis_(j) {
  return { UAS: 'Asesmen Sumatif Akhir Semester (ASAS)', UTS: 'Asesmen Sumatif Tengah Semester (ASTS)', UPK: 'Ujian Pendidikan Kesetaraan (UPK)' }[j] || ('Asesmen ' + j);
}

function waStafMasaLaporanData(token, jenis) {
  var p = stafDariToken_(token);
  muWajib_(p);
  jenis = String(jenis || 'UAS').toUpperCase();
  var per = nilPeriode_(), cfg = taBaca_();
  var masa = muSemua_().filter(function(m) { return m.status === 'Ditetapkan' && m.jenis === jenis && m.smt === per.smt; });
  var idMasa = {};
  masa.forEach(function(m) { idMasa[m.id] = true; });
  var mapel = ujtPetaMapel_(), rb = honProgramRombel_(), peta = nilPetaBm_(), simDari = {};
  Object.keys(peta.rombel).forEach(function(r) { Object.keys(peta.rombel[r]).forEach(function(el) { simDari[el] = r; }); });
  // pengampu per mapel e-learning
  var namaP = {};
  try { penggunaCache_().forEach(function(u) { namaP[String(u.id)] = u.nama; }); } catch (e0) {}
  var pengampu = {};
  bacaEnrollment_().forEach(function(e) { if (namaP[e.idPengguna]) (pengampu[e.idMapel] = pengampu[e.idMapel] || []).push(namaP[e.idPengguna]); });
  var perRombel = {}, penyusun = {};
  ujJadwalSemua_().filter(function(j) { return j.masa && idMasa[j.masa]; }).forEach(function(j) {
    var m = mapel[String(j.idMapel)] || { namaMapel: j.idMapel, namaRombel: '', idRombel: '' };
    var sim = simDari[m.idRombel] || m.idRombel, r = perRombel[sim];
    if (!r) r = perRombel[sim] = { id: sim, nama: rb[sim] ? rb[sim].nama : (m.namaRombel || sim), program: rb[sim] ? rb[sim].program : '', ujian: [] };
    r.ujian.push({ idUjian: String(j.idUjian), mapel: m.namaMapel, tanggal: j.tanggal, jam: j.jam, durasi: j.durasi, jumlah: j.jumlah, masa: j.masa });
    var nmMp = String(m.namaMapel).replace(/\s*\([^)]*\)\s*$/, '');
    (pengampu[String(j.idMapel)] || []).forEach(function(n) { (penyusun[nmMp] = penyusun[nmMp] || {})[n] = true; });
  });
  var rombel = Object.keys(perRombel).map(function(k) {
    var r = perRombel[k];
    r.ujian.sort(function(a, b) { return (a.tanggal + a.jam + a.mapel).localeCompare(b.tanggal + b.jam + b.mapel); });
    return r;
  }).sort(function(a, b) { return String(a.nama).localeCompare(String(b.nama), 'id', { numeric: true }); });
  // pengawas dari penugasan masa
  var pengawas = {};
  masa.forEach(function(m) { try { pwTugasMasa_(m.id).forEach(function(t) { if (t['NAMA PENGAWAS']) pengawas[t['NAMA PENGAWAS']] = true; }); } catch (e1) {} });
  var lb = nilLembaga_(), simpan = null;
  try { simpan = JSON.parse(PropertiesService.getScriptProperties().getProperty(ldKunci_(jenis)) || 'null'); } catch (e2) {}
  var dari = masa.reduce(function(a, m) { return !a || m.dari < a ? m.dari : a; }, ''), sampai = masa.reduce(function(a, m) { return m.sampai > a ? m.sampai : a; }, '');
  var bawaan = {
    nomor: '', tanggal: absHariIni_(), tempat: 'Cirebon',
    seNomor: '', seTanggal: '', ketua: '', wakil: '', sekretaris: '', bendahara: '', anggota: '',
    pengawas: Object.keys(pengawas).sort().join('\n'),
    penyusun: Object.keys(penyusun).sort().map(function(mp) { return mp + ': ' + Object.keys(penyusun[mp]).join(', '); }).join('\n')
  };
  return {
    jenis: jenis, namaJenis: ldNamaJenis_(jenis), periode: per, tahun: per.tahun, semester: per.semester, smt: per.smt,
    masa: masa.map(function(m) { return { id: m.id, nama: m.nama, dari: m.dari, sampai: m.sampai }; }), dari: dari, sampai: sampai,
    rombel: rombel, kop: kuKop_(), lembaga: lb, kepala: lb.kepala, sk: simpan || bawaan, bawaan: bawaan, tersimpan: !!simpan,
    label: cfg.label, dibuat: absWaktu_(), oleh: p.nama
  };
}

function waStafMasaLaporanSkSimpan(token, jenis, sk) {
  var p = stafDariToken_(token);
  muWajib_(p);
  sk = sk || {};
  var o = {};
  ['nomor', 'tanggal', 'tempat', 'seNomor', 'seTanggal', 'ketua', 'wakil', 'sekretaris', 'bendahara', 'anggota', 'pengawas', 'penyusun'].forEach(function(k) {
    o[k] = String(sk[k] === undefined || sk[k] === null ? '' : sk[k]).slice(0, 4000);
  });
  if (!o.nomor.trim()) throw new Error('Isi nomor SK.');
  if (!o.ketua.trim()) throw new Error('Isi nama ketua panitia.');
  PropertiesService.getScriptProperties().setProperty(ldKunci_(jenis), JSON.stringify(o));
  catat_(p.peran, '', p.nama, 'Isian SK laporan dinas', String(jenis) + ' ' + o.nomor, 'OK');
  return { sukses: true, sk: o };
}

// Naskah sampel (satu versi per ujian; benih sama dengan naskah ujian tulis) - maks. LD.MAKS_UJIAN per panggilan.
function waStafMasaLaporanSoal(token, ids) {
  var p = stafDariToken_(token);
  muWajib_(p);
  ids = (Array.isArray(ids) ? ids : []).slice(0, LD.MAKS_UJIAN);
  var mapel = ujtPetaMapel_();
  return {
    ujian: ids.map(function(id) {
      try {
        var j = ujtCariJadwal_(id), m = mapel[String(j.idMapel)] || { namaMapel: j.idMapel, namaRombel: '', idRombel: '' };
        var pool = ujPool_(j.idMapel, j.smt, j.jenisPool);
        var maksOpsi = 5;
        try { maksOpsi = kurPaket_(getNamaRombel_(m.idRombel)) === 'A' ? 4 : 5; } catch (e0) {}
        var soal = pool.sesi.length ? ujUndi_(pool.sesi, j.komposisi, maksOpsi, [j.idUjian, 'KERTAS'].join('|')) : [];
        return { idUjian: String(id), mapel: m.namaMapel, rombel: m.namaRombel, tanggal: j.tanggal, jam: j.jam, durasi: j.durasi, kkm: j.kkm,
          judul: j.judulKhusus || ujJudul_(j.jenis, j.smt), maksOpsi: maksOpsi,
          soal: soal.map(function(s) { return { t: s.pertanyaan, o: s.opsi, k: s.kunci }; }), galat: soal.length ? '' : 'Bank soal belum ada.' };
      } catch (e) { return { idUjian: String(id), galat: String(e && e.message || e), soal: [] }; }
    })
  };
}
