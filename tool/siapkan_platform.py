"""Dijalankan di GitHub Actions setelah `flutter create`: izin internet Android, nama aplikasi, judul web."""
import json, pathlib, re, shutil

akar = pathlib.Path(__file__).resolve().parent.parent
NAMA = 'TH.E-Course'

man = akar / 'android/app/src/main/AndroidManifest.xml'
s = man.read_text()
if 'android.permission.INTERNET' not in s:
    s = s.replace('<application', '<uses-permission android:name="android.permission.INTERNET"/>\n    <application', 1)
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
if kunci.exists():
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
        if 'tool/debug.keystore' not in g:
            g = g.replace('android {', """android {
    signingConfigs {
        getByName("debug") {
            storeFile = file("../../tool/debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }""", 1)
            kts.write_text(g)
        print('Gradle (kts) memakai kunci tetap.')
    elif gro.exists():
        g = gro.read_text()
        if 'tool/debug.keystore' not in g:
            g = g.replace('android {', """android {
    signingConfigs {
        debug {
            storeFile file('../../tool/debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }""", 1)
            gro.write_text(g)
        print('Gradle (groovy) memakai kunci tetap.')
# Halaman statis tambahan untuk situs web (mis. kebijakan privasi untuk layar izin Google).
halaman = akar / 'tool/web'
if halaman.exists() and (akar / 'web').exists():
    for f in halaman.glob('*.html'):
        shutil.copyfile(f, akar / 'web' / f.name)
    print('Halaman web tambahan dipasang.')
print('Platform siap.')
