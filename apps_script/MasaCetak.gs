// ============================================================================
// CETAK JADWAL UJIAN & JADWAL PENGAWASAN (v1.83.0)
// Data satu masa ujian untuk dicetak di aplikasi (PDF F4 berkop + watermark):
// slot (tanggal, jam, mapel, mode) x ruang (rombel / rombel·unit) dengan ruang fisik & pengawas yang berlaku.
// ============================================================================
function msJamSelesai_(jam, durasi) {
  var m = /^(\d{1,2}):(\d{2})/.exec(String(jam || ''));
  if (!m) return '';
  var t = Number(m[1]) * 60 + Number(m[2]) + (Number(durasi) || 0);
  return ('0' + Math.floor(t / 60) % 24).slice(-2) + ':' + ('0' + (t % 60)).slice(-2);
}

function waStafMasaCetak(token, idMasa) {
  var p = stafDariToken_(token);
  muWajib_(p);
  var m = muCari_(idMasa), slot = muSlot_(m.id).sort(function(a, b) { return (a.tanggal + a.jam).localeCompare(b.tanggal + b.jam); });
  var per = pwRombelSlot_(m, slot, muKelas_(m)), tugas = pwTugasMasa_(m.id), rb = honProgramRombel_();
  var peserta = 'Semua siswa';
  if (m.peserta.mode === 'rombel') peserta = m.peserta.rombel.map(function(r) { return rb[r] ? rb[r].nama : r; }).join(', ');
  if (m.peserta.mode === 'siswa') peserta = m.peserta.siswa.length + ' siswa tertentu';
  if (m.peserta.mode === 'unit') {
    var nmU = {};
    try { ubUnit_().forEach(function(u) { nmU[u.id] = u.nama; }); } catch (e) {}
    peserta = (m.peserta.unit || []).map(function(u) { return nmU[u] || u; }).join(', ');
  }
  var kop = {};
  try { kop = kwKop_(); } catch (e2) {}
  return {
    masa: { id: m.id, nama: m.nama, jenis: m.jenis, namaJenis: MU.NAMA_JENIS[m.jenis] || m.jenis, smt: m.smt, dari: m.dari, sampai: m.sampai, status: m.status, mode: m.mode, peserta: peserta },
    slot: slot.map(function(s) {
      var ruang = Object.keys(per[s.id] || {}).map(function(k) {
        var ef = pwEfektif_(tugas, s.id, k);
        return { kunci: k, rombel: pwNamaRuang_(k, rb), ruang: ef ? ef.ruang || '' : '', pengawas: ef ? ef.namaPengawas || '' : '', idPengawas: ef ? ef.idPengawas || '' : '' };
      }).sort(function(a, b) { return a.rombel.localeCompare(b.rombel, 'id', { numeric: true }); });
      return { id: s.id, tanggal: s.tanggal, jam: s.jam, selesai: msJamSelesai_(s.jam, s.durasi), durasi: s.durasi, mapel: s.namaMapel, kode: s.kode,
        mode: muModeSlot_(m, s) === 'Offline' ? 'Tulis (offline)' : 'Online (aplikasi)', ruang: ruang };
    }),
    kop: kop, dibuat: absWaktu_(), oleh: p.nama
  };
}
