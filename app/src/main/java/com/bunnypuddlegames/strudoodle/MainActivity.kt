package com.bunnypuddlegames.strudoodle

import android.Manifest
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.util.Base64
import android.util.Log
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.File

private const val TAG = "Strudoodle"

/**
 * One fullscreen WebView running Strudel (assets/www). Kotlin owns the device (later: the microphone and the
 * analysis that turns it into a pattern); the page owns sound. The seam between them is [play]: a pattern string.
 */
class MainActivity : Activity() {
    private lateinit var web: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val assets = WebViewAssetLoader.Builder()
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        WebView.setWebContentsDebuggingEnabled(applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) // chrome://inspect
        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false // let play(code) from Kotlin start audio without a tap
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                    assets.shouldInterceptRequest(request.url)
                // Any other site (strudel.cc for a shared pattern) opens in the browser, not over the app's page.
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    if (request.url.host == "appassets.androidplatform.net") return false
                    startActivity(Intent(Intent.ACTION_VIEW, request.url)); return true
                }
            }
            webChromeClient = object : WebChromeClient() {
                // Everything the page logs (strudel's own errors included) lands in logcat under one tag.
                override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                    Log.i(TAG, m.message() + "  (" + m.sourceId().substringAfterLast('/') + ":" + m.lineNumber() + ")")
                    return true
                }
                // The page's getUserMedia: grant the microphone (only) when the app itself holds RECORD_AUDIO.
                override fun onPermissionRequest(request: PermissionRequest) {
                    val mic = arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                    if (request.resources.contentEquals(mic) && hasMic()) request.grant(mic) else request.deny()
                }
            }
            addJavascriptInterface(Bridge(), "android")
            loadUrl("https://appassets.androidplatform.net/www/index.html")
        }
        setContentView(web)
        if (!hasMic()) requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 1)
        // Claude -> page: `adb shell am broadcast -a com.bunnypuddlegames.strudoodle.SAY --es text "..." -p com.bunnypuddlegames.strudoodle`
        // lands in the Log tab as "claude: ...". (A file inbox did not work: a run-as shell may read the app's files, not create them.)
        registerReceiver(say, IntentFilter(SAY), Context.RECEIVER_EXPORTED)
    }

    private val say = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val text = intent.getStringExtra("text") ?: return
            web.evaluateJavascript("log(" + JSONObject.quote("claude: $text") + ", 'claude')", null)
        }
    }

    private fun hasMic() = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    /** The page's three entry points. Kotlin needs none of them yet; they are the seam if it ever drives the page. */
    fun play(code: String) = web.evaluateJavascript("play(" + JSONObject.quote(code) + ")", null)
    fun stop() = web.evaluateJavascript("stop()", null)
    fun listen(seconds: Int = 8) = web.evaluateJavascript("listen($seconds)", null)

    /**
     * Page -> Kotlin. Every line of the page's Log tab also lands here: logcat, and files/page.log for reading after
     * the fact (`adb shell run-as com.bunnypuddlegames.strudoodle cat files/page.log`; fresh per launch).
     */
    inner class Bridge {
        private val file = File(filesDir, "page.log").also { it.delete() }
        @JavascriptInterface fun log(line: String) {
            Log.i(TAG, line)
            file.appendText(line + "\n")
        }
        /** A buzz of `ms` (the page's own navigator.vibrate is refused before the user has tapped). */
        @JavascriptInterface fun vibrate(ms: Int) {
            getSystemService(Vibrator::class.java).vibrate(VibrationEffect.createOneShot(ms.toLong(), VibrationEffect.DEFAULT_AMPLITUDE))
        }
        /** Keep the screen on (a take in progress) or let it sleep again. */
        @JavascriptInterface fun awake(on: Boolean) = runOnUiThread {
            if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        /** The last take as a WAV, base64 from the page: files/<name>. Pull with `adb exec-out run-as <pkg> cat files/take.wav`. */
        @JavascriptInterface fun save(name: String, base64: String) {
            try { File(filesDir, File(name).name).writeBytes(Base64.decode(base64, Base64.DEFAULT)) }
            catch (e: Exception) { log("save $name failed: $e"); throw e } // the page only sees "Java exception was raised"; the reason goes to the log
        }
    }

    override fun onPause() { super.onPause(); stop() } // the clock is a main-thread setInterval: it would stutter in the background anyway
    override fun onDestroy() { unregisterReceiver(say); web.destroy(); super.onDestroy() }
}

private const val SAY = "com.bunnypuddlegames.strudoodle.SAY"
