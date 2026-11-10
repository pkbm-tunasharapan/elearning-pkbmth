"""Dijalankan di GitHub Actions setelah `flutter create`: izin internet Android, nama aplikasi, judul web."""
import json, pathlib, re, shutil

akar = pathlib.Path(__file__).resolve().parent.parent
NAMA = 'TH.E-Course'

man = akar / 'android/app/src/main/AndroidManifest.xml'
s = man.read_text()
if 'android.permission.INTERNET' not in s:
    s = s.replace('<application', '<uses-permission android:name="android.permission.INTERNET"/>\n    <application', 1)
for izin in ['CAMERA', 'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'MODIFY_AUDIO_SETTINGS', 'POST_NOTIFICATIONS']:
    if 'android.permission.' + izin not in s:
        s = s.replace('<application', '<uses-permission android:name="android.permission.' + izin + '"/>\n    <application', 1)
s = re.sub(r'android:label="[^"]*"', f'android:label="{NAMA}"', s, count=1)
if 'android:scheme="bmstaf"' not in s:
    filt = (
        '\n            <intent-filter>\n'
        '                <action android:name="android.intent.action.VIEW"/>\n'
        '                <category android:name="android.intent.category.DEFAULT"/>\n'
        '                <category android:name="android.intent.category.BROWSABLE"/>\n'
        '                <data android:scheme="bmstaf" android:host="sso"/>\n'
        '            </intent-filter>\n'
        '            <meta-data android:name="flutter_deeplinking_enabled" android:value="false"/>'
    )
    i = s.find('</intent-filter>')
    s = s[:i + len('</intent-filter>')] + filt + s[i + len('</intent-filter>'):]
man.write_text(s)

idx = akar / 'web/index.html'
if idx.exists():
    h = idx.read_text()
    h = re.sub(r'<title>.*?</title>', '<title>TH.E-Course</title>', h, flags=re.S)
    idx.write_text(h)
mf = akar / 'web/manifest.json'
if mf.exists():
    d = json.loads(mf.read_text())
    d.update({'name': 'TH.E-Course', 'short_name': NAMA, 'background_color': '#4B2FD0', 'theme_color': '#4B2FD0'})
    mf.write_text(json.dumps(d, indent=2))

# test bawaan `flutter create` merujuk MyApp yang tidak ada di proyek ini
shutil.rmtree(akar / 'test', ignore_errors=True)
# Kunci tanda tangan TETAP: semua build memakai kunci yang sama supaya APK baru bisa
# memperbarui (menimpa) APK lama di HP. Tanpa ini tiap build GitHub memakai kunci acak
# dan Android menolak pembaruan ("Aplikasi tidak terinstal").
kunci = akar / 'tool/debug.keystore'
# Kunci RILIS privat (dari GitHub Secret KUNCI_RILIS_B64/_SANDI/_ALIAS). Bila ada, dipakai
# menggantikan kunci debug publik; file-nya hanya dibuat saat build dan tidak masuk repo.
import os, base64
RILIS = os.environ.get('KUNCI_RILIS_B64', '').strip()
if RILIS:
    kunci = akar / 'android/rilis.jks'
    kunci.parent.mkdir(parents=True, exist_ok=True)
    kunci.write_bytes(base64.b64decode(RILIS))
    SANDI = os.environ.get('KUNCI_RILIS_SANDI', '')
    ALIAS = os.environ.get('KUNCI_RILIS_ALIAS', 'thecourse')
    print('Kunci rilis privat dipakai.')
else:
    SANDI, ALIAS = 'android', 'androiddebugkey'
if kunci.exists() and not RILIS:
    tujuan = pathlib.Path.home() / '.android'
    tujuan.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(kunci, tujuan / 'debug.keystore')
    print('Kunci tanda tangan tetap dipasang.')
# Ikon aplikasi (logo TH.E-Course) bila sudah disiapkan di tool/ikon/.
ikon = akar / 'tool/ikon'
if ikon.exists():
    for f in (ikon / 'android').glob('mipmap-*/*.png'):
        t = akar / 'android/app/src/main/res' / f.parent.name / f.name
        t.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(f, t)
    for f in (ikon / 'web').glob('**/*.png'):
        t = akar / 'web' / f.relative_to(ikon / 'web')
        t.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(f, t)
    print('Ikon aplikasi dipasang.')
# Pasang kunci tanda tangan tetap langsung di konfigurasi Gradle (cara pasti).
kts = akar / 'android/app/build.gradle.kts'
gro = akar / 'android/app/build.gradle'
if kunci.exists():
    if kts.exists():
        g = kts.read_text()
        if 'signingConfigs {' not in g:
            berkas = '../rilis.jks' if RILIS else '../../tool/debug.keystore'
            g = g.replace('android {', """android {
    signingConfigs {
        getByName("debug") {
            storeFile = file("%s")
            storePassword = "%s"
            keyAlias = "%s"
            keyPassword = "%s"
        }
    }""" % (berkas, SANDI, ALIAS, SANDI), 1)
            kts.write_text(g)
        print('Gradle (kts) memakai kunci tetap.')
    elif gro.exists():
        g = gro.read_text()
        if 'signingConfigs {' not in g:
            berkas = '../rilis.jks' if RILIS else '../../tool/debug.keystore'
            g = g.replace('android {', """android {
    signingConfigs {
        debug {
            storeFile file('%s')
            storePassword '%s'
            keyAlias '%s'
            keyPassword '%s'
        }
    }""" % (berkas, SANDI, ALIAS, SANDI), 1)
            gro.write_text(g)
        print('Gradle (groovy) memakai kunci tetap.')
# Pemberitahuan/broadcast (v1.37): MainActivity memakai NotificationCompat dan WorkManager.
DEP_KTS = """
dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
}
"""
DEP_GRO = """
dependencies {
    implementation 'androidx.core:core-ktx:1.13.1'
    implementation 'androidx.work:work-runtime-ktx:2.9.1'
}
"""
if kts.exists():
    g = kts.read_text()
    if 'androidx.work:work-runtime-ktx' not in g:
        kts.write_text(g.rstrip() + '\n' + DEP_KTS)
        print('Dependensi notifikasi ditambahkan (kts).')
elif gro.exists():
    g = gro.read_text()
    if 'androidx.work:work-runtime-ktx' not in g:
        gro.write_text(g.rstrip() + '\n' + DEP_GRO)
        print('Dependensi notifikasi ditambahkan (groovy).')
# Halaman statis tambahan untuk situs web (mis. kebijakan privasi untuk layar izin Google).
halaman = akar / 'tool/web'
if halaman.exists() and (akar / 'web').exists():
    for f in halaman.glob('*.html'):
        shutil.copyfile(f, akar / 'web' / f.name)
    print('Halaman web tambahan dipasang.')
# MainActivity dengan kanal alarm ujian (jalur suara ALARM, tetap berbunyi saat mode senyap).
tmpl = akar / 'tool/android/MainActivity.kt'
if tmpl.exists():
    asli = [f for f in (akar / 'android/app/src/main').glob('**/MainActivity.kt')] + [f for f in (akar / 'android/app/src/main').glob('**/MainActivity.java')]
    if asli:
        teks_asli = asli[0].read_text()
        m = re.search(r'^package\s+([\w.]+)', teks_asli, re.M)
        paket = m.group(1) if m else 'id.pkbmtunasharapan.elearning_staf'
        tujuan_kt = asli[0].with_suffix('.kt')
        for f in asli:
            f.unlink()
        tujuan_kt.write_text(tmpl.read_text().replace('PAKET_APLIKASI', paket))
        print('MainActivity (alarm ujian) dipasang: ' + paket)
print('Platform siap.')
