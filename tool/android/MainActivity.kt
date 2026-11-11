package PAKET_APLIKASI

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.provider.Settings
import android.view.WindowManager
import android.os.Build
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

// Dipasang oleh tool/siapkan_platform.py (PAKET_APLIKASI diganti nama paket aplikasi).
// Kanal "the_course/notif": notifikasi ponsel untuk broadcast + pemeriksaan latar belakang.
// v1.38.1: hanya memakai API bawaan Android (JobScheduler + Notification), tanpa pustaka tambahan,
// dan tidak ada yang berjalan saat aplikasi dimulai. Semua galat ditangkap (Throwable) agar
// fitur notifikasi tidak pernah bisa membuat aplikasi berhenti.
class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        // v1.54.0: alarm pelanggaran ujian di jalur suara ALARM (tetap berbunyi saat senyap/getar)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "the_course/alarm").setMethodCallHandler { call, result ->
            try {
                when (call.method) {
                    "mulai" -> { AlarmUjian.mulai(this); result.success(true) }
                    "henti" -> { AlarmUjian.henti(this); result.success(true) }
                    else -> result.notImplemented()
                }
            } catch (e: Throwable) {
                try { result.success(false) } catch (e2: Throwable) {}
            }
        }
        // v1.54.0: layar ujian aman (tidak bisa di-screenshot / direkam / tampil di daftar aplikasi terbaru) + ID perangkat
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "the_course/ujian").setMethodCallHandler { call, result ->
            try {
                when (call.method) {
                    "aman" -> {
                        val aktif = call.argument<Boolean>("aktif") ?: false
                        runOnUiThread {
                            try {
                                if (aktif) window.addFlags(WindowManager.LayoutParams.FLAG_SECURE) else window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                            } catch (e: Throwable) {}
                        }
                        result.success(true)
                    }
                    "perangkat" -> {
                        val id = try { Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID) ?: "" } catch (e: Throwable) { "" }
                        result.success(id + "|" + Build.MANUFACTURER + " " + Build.MODEL)
                    }
                    "layarTerbagi" -> {
                        result.success(if (Build.VERSION.SDK_INT >= 24) isInMultiWindowMode else false)
                    }
                    else -> result.notImplemented()
                }
            } catch (e: Throwable) {
                try { result.error("UJIAN", e.toString(), null) } catch (e2: Throwable) {}
            }
        }
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "the_course/notif").setMethodCallHandler { call, result ->
            try {
                when (call.method) {
                    "izin" -> {
                        if (Build.VERSION.SDK_INT >= 33 &&
                            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                        ) {
                            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 7101)
                        }
                        result.success(true)
                    }
                    "tampil" -> {
                        NotifPesan.tampil(
                            this,
                            call.argument<String>("id") ?: "",
                            call.argument<String>("judul") ?: "",
                            call.argument<String>("isi") ?: ""
                        )
                        result.success(true)
                    }
                    "jadwalkan" -> {
                        NotifPesan.jadwalkan(this, call.argument<Boolean>("aktif") ?: true)
                        result.success(true)
                    }
                    else -> result.notImplemented()
                }
            } catch (e: Throwable) {
                try {
                    result.error("NOTIF", e.toString(), null)
                } catch (e2: Throwable) {
                }
            }
        }
    }
}

// Pemeriksaan latar belakang (didaftarkan di AndroidManifest oleh siapkan_platform.py).
class PemberitahuanJob : JobService() {
    override fun onStartJob(params: JobParameters?): Boolean {
        Thread {
            try {
                NotifPesan.cek(applicationContext)
            } catch (e: Throwable) {
            }
            try {
                jobFinished(params, false)
            } catch (e: Throwable) {
            }
        }.start()
        return true
    }

    override fun onStopJob(params: JobParameters?): Boolean = true
}

object NotifPesan {
    private const val KANAL = "pemberitahuan"
    private const val ID_JOB = 71011
    private const val PREF = "FlutterSharedPreferences"

    private fun siapkanKanal(ctx: Context) {
        if (Build.VERSION.SDK_INT >= 26) {
            val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(KANAL) == null) {
                val k = NotificationChannel(KANAL, "Pemberitahuan", NotificationManager.IMPORTANCE_HIGH)
                k.description = "Pemberitahuan dari PKBM Tunas Harapan"
                nm.createNotificationChannel(k)
            }
        }
    }

    fun tampil(ctx: Context, id: String, judul: String, isi: String) {
        try {
            if (id.isEmpty()) return
            if (Build.VERSION.SDK_INT >= 33 &&
                ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            ) return
            siapkanKanal(ctx)
            val buka = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: Intent()
            buka.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            var bendera = PendingIntent.FLAG_UPDATE_CURRENT
            if (Build.VERSION.SDK_INT >= 23) bendera = bendera or PendingIntent.FLAG_IMMUTABLE
            val pi = PendingIntent.getActivity(ctx, id.hashCode(), buka, bendera)
            @Suppress("DEPRECATION")
            val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(ctx, KANAL) else Notification.Builder(ctx).setPriority(Notification.PRIORITY_HIGH)
            b.setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle(judul)
                .setContentText(isi)
                .setStyle(Notification.BigTextStyle().bigText(isi))
                .setAutoCancel(true)
                .setContentIntent(pi)
            val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(id.hashCode(), b.build())
        } catch (e: Throwable) {
        }
    }

    fun jadwalkan(ctx: Context, aktif: Boolean) {
        try {
            val js = ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler
            if (!aktif) {
                js.cancel(ID_JOB)
                return
            }
            if (js.allPendingJobs.any { it.id == ID_JOB }) return
            val komponen = ComponentName(ctx, PemberitahuanJob::class.java)
            val dasar = JobInfo.Builder(ID_JOB, komponen)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(15L * 60L * 1000L)
            try {
                js.schedule(dasar.setPersisted(true).build())
            } catch (e: Throwable) {
                // tanpa izin RECEIVE_BOOT_COMPLETED: jadwalkan tanpa bertahan setelah HP dinyalakan ulang
                js.schedule(dasar.setPersisted(false).build())
            }
        } catch (e: Throwable) {
        }
    }

    // Kunci perangkat & alamat API disimpan aplikasi (shared_preferences).
    fun cek(ctx: Context) {
        val sp = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        val url = sp.getString("flutter.bc_url", null) ?: return
        val kunci = sp.getString("flutter.bc_kunci", null) ?: return
        if (kunci.isEmpty()) return
        val body = JSONObject().put("fn", "waNotifCek").put("args", JSONArray().put(kunci)).put("pf", "android-bg").toString()
        val teks = kirim(url, body) ?: return
        val j = JSONObject(teks)
        if (!j.optBoolean("ok")) return
        val data = j.optJSONObject("data") ?: return
        val arr = data.optJSONArray("pesan") ?: return
        val sudah = ArrayList<String>()
        for (x in (sp.getString("flutter.bc_dinotif", "") ?: "").split(",")) if (x.isNotEmpty()) sudah.add(x)
        var ubah = false
        for (i in 0 until arr.length()) {
            val p = arr.getJSONObject(i)
            val id = p.optString("id")
            if (id.isEmpty() || sudah.contains(id)) continue
            tampil(ctx, id, p.optString("judul"), p.optString("isi"))
            sudah.add(id)
            ubah = true
        }
        if (ubah) {
            val sisa = if (sudah.size > 200) sudah.subList(sudah.size - 200, sudah.size) else sudah
            sp.edit().putString("flutter.bc_dinotif", sisa.joinToString(",")).apply()
        }
    }

    // Apps Script menjawab POST dengan pengalihan 302 ke googleusercontent; ikuti dengan GET.
    private fun kirim(url: String, body: String): String? {
        var c = URL(url).openConnection() as HttpURLConnection
        c.instanceFollowRedirects = false
        c.requestMethod = "POST"
        c.doOutput = true
        c.connectTimeout = 20000
        c.readTimeout = 40000
        c.setRequestProperty("Content-Type", "text/plain;charset=utf-8")
        c.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
        var kode = c.responseCode
        var n = 0
        while ((kode == 301 || kode == 302 || kode == 303 || kode == 307 || kode == 308) && n < 5) {
            val lokasi = c.getHeaderField("Location") ?: return null
            c.disconnect()
            c = URL(lokasi).openConnection() as HttpURLConnection
            c.instanceFollowRedirects = false
            c.connectTimeout = 20000
            c.readTimeout = 40000
            kode = c.responseCode
            n++
        }
        if (kode != 200) return null
        return c.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
    }
}

// Alarm pelanggaran ujian: nada alarm bawaan, berulang, volume ALARM maksimum (dikembalikan saat berhenti).
object AlarmUjian {
    private var pemutar: MediaPlayer? = null
    private var volumeLama = -1

    fun mulai(ctx: Context) {
        try {
            if (pemutar != null) return
            val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            try {
                volumeLama = am.getStreamVolume(AudioManager.STREAM_ALARM)
                am.setStreamVolume(AudioManager.STREAM_ALARM, am.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0)
            } catch (e: Throwable) { volumeLama = -1 }
            val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE) ?: return
            val mp = MediaPlayer()
            mp.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
            mp.setDataSource(ctx, uri)
            mp.isLooping = true
            mp.prepare()
            mp.start()
            pemutar = mp
        } catch (e: Throwable) {
            henti(ctx)
        }
    }

    fun henti(ctx: Context) {
        try { pemutar?.stop() } catch (e: Throwable) {}
        try { pemutar?.release() } catch (e: Throwable) {}
        pemutar = null
        try {
            if (volumeLama >= 0) (ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager).setStreamVolume(AudioManager.STREAM_ALARM, volumeLama, 0)
        } catch (e: Throwable) {}
        volumeLama = -1
    }
}
