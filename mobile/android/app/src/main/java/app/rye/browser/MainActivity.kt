package app.rye.browser

import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Outline
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.view.WindowInsetsController
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.PopupMenu
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import org.json.JSONArray
import org.json.JSONObject
import org.mozilla.geckoview.AllowOrDeny
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoSession.PromptDelegate
import org.mozilla.geckoview.GeckoView
import org.mozilla.geckoview.WebExtension

/** Rye for Android: GeckoView (Firefox's engine) with Rye's own pages built in. */
class MainActivity : ComponentActivity() {

    private class Tab(val session: GeckoSession) {
        var url: String = ""
        var title: String = ""
        var canGoBack = false
        var canGoForward = false
        var loading = false
        /** Where to go once the tab is shown ("rye:newtab" means Rye's new tab page). */
        var pending: String? = null
    }

    private lateinit var runtime: GeckoRuntime
    private val tabs = mutableListOf<Tab>()
    private var current = 0
    private var ryeBase: String? = null
    private var look = Look.standard

    private lateinit var geckoView: GeckoView
    private lateinit var pageFrame: FrameLayout
    private lateinit var bar: LinearLayout
    private lateinit var progress: ProgressBar
    private lateinit var address: EditText
    private lateinit var backButton: ImageButton
    private lateinit var forwardButton: ImageButton
    private lateinit var reloadButton: ImageButton
    private lateinit var tabsButton: TextView
    private lateinit var menuButton: ImageButton

    private var filePrompt: Pair<PromptDelegate.FilePrompt, GeckoResult<PromptDelegate.PromptResponse>>? = null
    private val pickFile = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        val (prompt, result) = filePrompt ?: return@registerForActivityResult
        filePrompt = null
        result.complete(if (uri != null) prompt.confirm(this, uri) else prompt.dismiss())
    }

    private val prefs by lazy { getSharedPreferences("rye", Context.MODE_PRIVATE) }

    // ---------------------------------------------------------------- Startup

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        runtime = GeckoRuntime.getDefault(this)
        look = Look.load(prefs)
        buildInterface()
        applyLook()
        installRyePages()
        restoreTabs()
        intent?.data?.let { openUrl(it.toString(), newTab = true) }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val tab = tabs.getOrNull(current)
                if (address.hasFocus()) {
                    address.clearFocus()
                } else if (tab != null && tab.canGoBack) {
                    tab.session.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                    isEnabled = true
                }
            }
        })
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.data?.let { openUrl(it.toString(), newTab = true) }
    }

    override fun onPause() {
        super.onPause()
        saveTabs()
    }

    /** Rye's new tab page, setup and Personalize, as a built-in extension. */
    private fun installRyePages() {
        runtime.webExtensionController
            .ensureBuiltIn("resource://android/assets/rye/", "rye@rye.app")
            .accept({ extension ->
                if (extension == null) return@accept
                extension.setMessageDelegate(object : WebExtension.MessageDelegate {
                    override fun onMessage(
                        nativeApp: String,
                        message: Any,
                        sender: WebExtension.MessageSender,
                    ): GeckoResult<Any>? {
                        if (message is JSONObject) runOnUiThread { onPageMessage(message) }
                        return null
                    }
                }, "rye")
                ryeBase = extension.metaData.baseUrl
                // Tabs waiting for the new tab page can open it now.
                tabs.forEachIndexed { index, tab ->
                    if (tab.pending == NEW_TAB && (index == current || tab.session.isOpen)) {
                        tab.pending = null
                        tab.session.loadUri(newTabUrl())
                    }
                }
            }, { error -> Log.e("Rye", "Rye's pages could not be installed", error) })
    }

    private fun newTabUrl(): String = (ryeBase ?: "about:blank") + "newtab.html"
    private fun personalizeUrl(): String = (ryeBase ?: "about:blank") + "personalize.html"
    private fun isRyePage(url: String?) = url != null && ryeBase != null && url.startsWith(ryeBase!!)

    // -------------------------------------------------------------- Interface

    private fun dp(value: Int): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics).toInt()

    private fun buildInterface() {
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }

        geckoView = GeckoView(this)
        pageFrame = FrameLayout(this).apply {
            setPadding(dp(6), 0, dp(6), 0)
            addView(geckoView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        }
        geckoView.clipToOutline = true
        root.addView(pageFrame, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        bar = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), dp(8), dp(12), dp(4))
        }

        address = EditText(this).apply {
            isSingleLine = true
            textSize = 16f
            gravity = Gravity.CENTER
            hint = "Search or enter address"
            imeOptions = EditorInfo.IME_ACTION_GO
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setSelectAllOnFocus(true)
            setPadding(dp(16), 0, dp(16), 0)
            setOnEditorActionListener { _, actionId, event ->
                val go = actionId == EditorInfo.IME_ACTION_GO ||
                    (event?.keyCode == KeyEvent.KEYCODE_ENTER && event.action == KeyEvent.ACTION_DOWN)
                if (go) navigate(text.toString())
                go
            }
            setOnFocusChangeListener { _, focused ->
                gravity = if (focused) Gravity.START or Gravity.CENTER_VERTICAL else Gravity.CENTER
                val url = tabs.getOrNull(current)?.url
                if (focused) setText(if (isRyePage(url)) "" else url) else showAddress()
            }
        }
        bar.addView(address, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(44)))

        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            visibility = View.INVISIBLE
        }
        bar.addView(progress, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)))

        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        backButton = iconButton(R.drawable.ic_back, "Back") { tabs.getOrNull(current)?.session?.goBack() }
        forwardButton = iconButton(R.drawable.ic_forward, "Forward") { tabs.getOrNull(current)?.session?.goForward() }
        reloadButton = iconButton(R.drawable.ic_reload, "Reload") {
            val tab = tabs.getOrNull(current) ?: return@iconButton
            if (tab.loading) tab.session.stop() else tab.session.reload()
        }
        tabsButton = TextView(this).apply {
            gravity = Gravity.CENTER
            textSize = 12f
            typeface = Typeface.DEFAULT_BOLD
            contentDescription = "Tabs"
            setOnClickListener { showTabs() }
            setOnLongClickListener { newTab(); true }
        }
        menuButton = iconButton(R.drawable.ic_more, "More") { showMenu(it) }
        for (view in listOf(backButton, forwardButton, reloadButton, tabsButton, menuButton)) {
            val params = LinearLayout.LayoutParams(0, dp(44), 1f)
            if (view === tabsButton) {
                val holder = FrameLayout(this)
                holder.addView(tabsButton, FrameLayout.LayoutParams(dp(24), dp(24), Gravity.CENTER))
                holder.setOnClickListener { showTabs() }
                row.addView(holder, params)
            } else {
                row.addView(view, params)
            }
        }
        bar.addView(row, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(44)))
        root.addView(bar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

        setContentView(root)
    }

    private fun iconButton(icon: Int, label: String, onClick: (View) -> Unit) = ImageButton(this).apply {
        setImageResource(icon)
        contentDescription = label
        background = null
        scaleType = android.widget.ImageView.ScaleType.CENTER
        setOnClickListener(onClick)
    }

    private fun showMenu(anchor: View) {
        val menu = PopupMenu(this, anchor)
        menu.menu.add("New tab").setOnMenuItemClickListener { newTab(); true }
        menu.menu.add("Share").setOnMenuItemClickListener { share(); true }
        menu.menu.add("Copy link").setOnMenuItemClickListener {
            val url = tabs.getOrNull(current)?.url
            if (url != null && !isRyePage(url)) {
                val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                clipboard.setPrimaryClip(android.content.ClipData.newPlainText("Link", url))
            }
            true
        }
        menu.menu.add("Personalize").setOnMenuItemClickListener { openUrl(personalizeUrl(), newTab = false); true }
        menu.show()
    }

    // ------------------------------------------------------------------- Look

    private fun applyLook() {
        val frame = Look.color(look.frame)
        window.decorView.setBackgroundColor(frame)
        window.statusBarColor = frame
        window.navigationBarColor = frame
        bar.setBackgroundColor(frame)
        pageFrame.setBackgroundColor(frame)
        geckoView.setBackgroundColor(Look.color(look.sheet))
        val radius = dp(look.cornerRadius).toFloat()
        geckoView.outlineProvider = object : ViewOutlineProvider() {
            override fun getOutline(view: View, outline: Outline) {
                outline.setRoundRect(0, 0, view.width, view.height, radius * 0.75f)
            }
        }
        geckoView.invalidateOutline()
        address.background = GradientDrawable().apply {
            setColor(Look.color(look.base))
            cornerRadius = if (look.shape == "extra") dp(22).toFloat() else radius
        }
        address.setTextColor(Look.color(look.text))
        address.setHintTextColor(Look.color(look.text2))
        address.highlightColor = (Look.color(look.accent) and 0x00FFFFFF) or 0x55000000
        progress.progressTintList = ColorStateList.valueOf(Look.color(look.accent))
        val tint = ColorStateList.valueOf(Look.color(look.text))
        for (button in listOf(backButton, forwardButton, reloadButton, menuButton)) button.imageTintList = tint
        tabsButton.setTextColor(Look.color(look.text))
        tabsButton.background = GradientDrawable().apply {
            setStroke(dp(2), Look.color(look.text))
            cornerRadius = dp(6).toFloat()
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
                WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            window.insetsController?.setSystemBarsAppearance(if (look.dark) 0 else light, light)
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = if (look.dark) 0 else
                View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        }
    }

    private fun onPageMessage(message: JSONObject) {
        when (message.optString("type")) {
            "look" -> {
                val next = Look.from(message) ?: return
                if (next == look) return
                look = next
                look.save(prefs)
                applyLook()
            }
            "export" -> {
                val json = message.optString("json")
                if (json.isEmpty() || json.length > 2_000_000) return
                val send = Intent(Intent.ACTION_SEND).apply {
                    type = "application/json"
                    putExtra(Intent.EXTRA_TEXT, json)
                    putExtra(Intent.EXTRA_TITLE, message.optString("filename", "rye-appearance.json"))
                }
                startActivity(Intent.createChooser(send, "Save appearance"))
            }
        }
    }

    // ------------------------------------------------------------------- Tabs

    private fun createSession(): GeckoSession = GeckoSession()

    private fun attach(tab: Tab) {
        val session = tab.session
        session.navigationDelegate = object : GeckoSession.NavigationDelegate {
            override fun onLocationChange(
                session: GeckoSession,
                url: String?,
                perms: MutableList<GeckoSession.PermissionDelegate.ContentPermission>,
                hasUserGesture: Boolean,
            ) {
                tab.url = url ?: ""
                if (tab === tabs.getOrNull(current)) showAddress()
                saveTabs()
            }

            override fun onCanGoBack(session: GeckoSession, canGoBack: Boolean) {
                tab.canGoBack = canGoBack
                updateBar()
            }

            override fun onCanGoForward(session: GeckoSession, canGoForward: Boolean) {
                tab.canGoForward = canGoForward
                updateBar()
            }

            override fun onLoadRequest(
                session: GeckoSession,
                request: GeckoSession.NavigationDelegate.LoadRequest,
            ): GeckoResult<AllowOrDeny>? {
                val scheme = Uri.parse(request.uri).scheme?.lowercase()
                if (scheme in WEB_SCHEMES) return GeckoResult.fromValue(AllowOrDeny.ALLOW)
                // tel:, mailto:, intent: and app links go to their apps.
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(request.uri)))
                } catch (e: ActivityNotFoundException) {
                    Log.w("Rye", "No app for ${request.uri}")
                }
                return GeckoResult.fromValue(AllowOrDeny.DENY)
            }

            // Links that open a new window open a new tab.
            override fun onNewSession(session: GeckoSession, uri: String): GeckoResult<GeckoSession>? {
                val newTab = Tab(createSession())
                attach(newTab)
                tabs.add(current + 1, newTab)
                select(current + 1)
                return GeckoResult.fromValue(newTab.session)
            }
        }
        session.progressDelegate = object : GeckoSession.ProgressDelegate {
            override fun onPageStart(session: GeckoSession, url: String) {
                tab.loading = true
                updateBar()
            }

            override fun onPageStop(session: GeckoSession, success: Boolean) {
                tab.loading = false
                updateBar()
            }

            override fun onProgressChange(session: GeckoSession, progressValue: Int) {
                if (tab === tabs.getOrNull(current)) {
                    progress.progress = progressValue
                    progress.visibility = if (progressValue in 1..99) View.VISIBLE else View.INVISIBLE
                }
            }
        }
        session.contentDelegate = object : GeckoSession.ContentDelegate {
            override fun onTitleChange(session: GeckoSession, title: String?) {
                tab.title = title ?: ""
            }

            override fun onCloseRequest(session: GeckoSession) {
                val index = tabs.indexOf(tab)
                if (index >= 0) closeTab(index)
            }
        }
        session.promptDelegate = prompts
    }

    private fun select(index: Int) {
        if (index !in tabs.indices) return
        current = index
        val tab = tabs[index]
        if (!tab.session.isOpen) tab.session.open(runtime)
        geckoView.releaseSession()
        geckoView.setSession(tab.session)
        tab.pending?.let { target ->
            if (target == NEW_TAB) {
                if (ryeBase != null) {
                    tab.pending = null
                    tab.session.loadUri(newTabUrl())
                }
            } else {
                tab.pending = null
                tab.session.loadUri(target)
            }
        }
        showAddress()
        updateBar()
        saveTabs()
    }

    private fun newTab(target: String = NEW_TAB) {
        val tab = Tab(createSession()).apply { pending = target }
        attach(tab)
        val index = if (tabs.isEmpty()) 0 else current + 1
        tabs.add(index, tab)
        select(index)
    }

    private fun closeTab(index: Int) {
        if (index !in tabs.indices) return
        val tab = tabs.removeAt(index)
        if (index == current) geckoView.releaseSession()
        tab.session.close()
        if (tabs.isEmpty()) {
            newTab()
            return
        }
        if (index < current || current >= tabs.size) current = maxOf(0, current - 1)
        select(current)
    }

    private fun openUrl(url: String, newTab: Boolean) {
        if (newTab || tabs.isEmpty()) {
            newTab(url)
        } else {
            tabs[current].session.loadUri(url)
        }
    }

    private fun showTabs() {
        val list = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(8), dp(8), dp(8), dp(8))
        }
        val dialog = AlertDialog.Builder(this)
            .setTitle(if (tabs.size == 1) "1 tab" else "${tabs.size} tabs")
            .setView(ScrollView(this).apply { addView(list) })
            .setPositiveButton("New tab") { _, _ -> newTab() }
            .setNegativeButton("Done", null)
            .create()
        tabs.forEachIndexed { index, tab ->
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(12), dp(4), dp(4), dp(4))
            }
            val label = TextView(this).apply {
                text = displayTitle(tab)
                textSize = 15f
                isSingleLine = true
                if (index == current) typeface = Typeface.DEFAULT_BOLD
                setOnClickListener { dialog.dismiss(); select(index) }
            }
            row.addView(label, LinearLayout.LayoutParams(0, dp(48), 1f).apply { gravity = Gravity.CENTER_VERTICAL })
            label.gravity = Gravity.CENTER_VERTICAL
            row.addView(ImageButton(this).apply {
                setImageResource(R.drawable.ic_close)
                background = null
                contentDescription = "Close tab"
                setOnClickListener { dialog.dismiss(); closeTab(index); if (tabs.size > 1) showTabs() }
            }, LinearLayout.LayoutParams(dp(44), dp(44)))
            list.addView(row)
        }
        dialog.show()
    }

    private fun displayTitle(tab: Tab): String = when {
        isRyePage(tab.url) || tab.pending == NEW_TAB -> "New Tab"
        tab.title.isNotEmpty() -> tab.title
        else -> Uri.parse(tab.url.ifEmpty { tab.pending ?: "" }).host ?: "New Tab"
    }

    // ------------------------------------------------------------ Address bar

    private fun showAddress() {
        if (address.hasFocus()) return
        val url = tabs.getOrNull(current)?.url
        address.setText(
            when {
                url.isNullOrEmpty() || isRyePage(url) || url == "about:blank" -> ""
                else -> Uri.parse(url).host?.removePrefix("www.") ?: url
            }
        )
    }

    private fun updateBar() {
        val tab = tabs.getOrNull(current) ?: return
        backButton.isEnabled = tab.canGoBack
        backButton.alpha = if (tab.canGoBack) 1f else 0.35f
        forwardButton.isEnabled = tab.canGoForward
        forwardButton.alpha = if (tab.canGoForward) 1f else 0.35f
        reloadButton.setImageResource(if (tab.loading) R.drawable.ic_close else R.drawable.ic_reload)
        reloadButton.contentDescription = if (tab.loading) "Stop" else "Reload"
        tabsButton.text = minOf(tabs.size, 99).toString()
    }

    private fun navigate(text: String) {
        val target = destination(text) ?: return
        tabs.getOrNull(current)?.session?.loadUri(target)
        address.clearFocus()
        (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager)
            .hideSoftInputFromWindow(address.windowToken, 0)
    }

    /** Typed text → a web address, or a Google search. */
    private fun destination(text: String): String? {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return null
        if (!trimmed.contains(' ')) {
            val uri = Uri.parse(trimmed)
            if (uri.scheme?.lowercase() in listOf("http", "https") && !uri.host.isNullOrEmpty()) return trimmed
            if (trimmed.startsWith("localhost")) return "http://$trimmed"
            if (trimmed.contains('.') && !trimmed.startsWith('.') && !trimmed.endsWith('.')) return "https://$trimmed"
        }
        return "https://www.google.com/search?q=" + Uri.encode(trimmed)
    }

    private fun share() {
        val url = tabs.getOrNull(current)?.url ?: return
        if (isRyePage(url)) return
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, url)
        }
        startActivity(Intent.createChooser(send, null))
    }

    // ------------------------------------------------------------ Saving tabs

    private fun saveTabs() {
        val urls = JSONArray()
        for (tab in tabs) {
            val url = tab.url.ifEmpty { tab.pending ?: NEW_TAB }
            urls.put(if (isRyePage(url) && url.endsWith("newtab.html")) NEW_TAB else url)
        }
        prefs.edit().putString("tabs", urls.toString()).putInt("current", current).apply()
    }

    private fun restoreTabs() {
        val saved = try {
            JSONArray(prefs.getString("tabs", "[]"))
        } catch (e: Exception) {
            JSONArray()
        }
        for (i in 0 until saved.length()) {
            val url = saved.optString(i)
            if (url.isEmpty() || url.startsWith("moz-extension:")) continue
            tabs.add(Tab(createSession()).apply { pending = url; attach(this) })
        }
        if (tabs.isEmpty()) tabs.add(Tab(createSession()).apply { pending = NEW_TAB; attach(this) })
        select(prefs.getInt("current", 0).coerceIn(0, tabs.size - 1))
    }

    // ------------------------------------------------------------ Page dialogs

    private val prompts = object : PromptDelegate {
        override fun onAlertPrompt(
            session: GeckoSession,
            prompt: PromptDelegate.AlertPrompt,
        ): GeckoResult<PromptDelegate.PromptResponse>? {
            val result = GeckoResult<PromptDelegate.PromptResponse>()
            AlertDialog.Builder(this@MainActivity)
                .setMessage(prompt.message)
                .setPositiveButton("OK") { _, _ -> result.complete(prompt.dismiss()) }
                .setOnCancelListener { result.complete(prompt.dismiss()) }
                .show()
            return result
        }

        override fun onButtonPrompt(
            session: GeckoSession,
            prompt: PromptDelegate.ButtonPrompt,
        ): GeckoResult<PromptDelegate.PromptResponse>? {
            val result = GeckoResult<PromptDelegate.PromptResponse>()
            AlertDialog.Builder(this@MainActivity)
                .setMessage(prompt.message)
                .setPositiveButton("OK") { _, _ -> result.complete(prompt.confirm(PromptDelegate.ButtonPrompt.Type.POSITIVE)) }
                .setNegativeButton("Cancel") { _, _ -> result.complete(prompt.confirm(PromptDelegate.ButtonPrompt.Type.NEGATIVE)) }
                .setOnCancelListener { result.complete(prompt.dismiss()) }
                .show()
            return result
        }

        override fun onTextPrompt(
            session: GeckoSession,
            prompt: PromptDelegate.TextPrompt,
        ): GeckoResult<PromptDelegate.PromptResponse>? {
            val result = GeckoResult<PromptDelegate.PromptResponse>()
            val input = EditText(this@MainActivity).apply { setText(prompt.defaultValue) }
            AlertDialog.Builder(this@MainActivity)
                .setMessage(prompt.message)
                .setView(input)
                .setPositiveButton("OK") { _, _ -> result.complete(prompt.confirm(input.text.toString())) }
                .setNegativeButton("Cancel") { _, _ -> result.complete(prompt.dismiss()) }
                .setOnCancelListener { result.complete(prompt.dismiss()) }
                .show()
            return result
        }

        // Photo backgrounds, shortcut icons and appearance imports.
        override fun onFilePrompt(
            session: GeckoSession,
            prompt: PromptDelegate.FilePrompt,
        ): GeckoResult<PromptDelegate.PromptResponse>? {
            val result = GeckoResult<PromptDelegate.PromptResponse>()
            filePrompt = prompt to result
            val type = prompt.mimeTypes?.firstOrNull()?.takeIf { it.contains('/') } ?: "*/*"
            pickFile.launch(type)
            return result
        }
    }

    companion object {
        private const val NEW_TAB = "rye:newtab"
        private val WEB_SCHEMES = setOf("http", "https", "about", "data", "blob", "moz-extension", "resource")
    }
}

/** The look chosen on Rye's pages; the app's bars use it. */
private data class Look(
    val dark: Boolean,
    val shape: String,
    val frame: String,
    val base: String,
    val sheet: String,
    val text: String,
    val text2: String,
    val accent: String,
) {
    val cornerRadius: Int
        get() = when (shape) {
            "soft" -> 10
            "extra" -> 22
            else -> 14
        }

    fun save(prefs: android.content.SharedPreferences) {
        val json = JSONObject()
            .put("dark", dark).put("shape", shape).put("frame", frame).put("base", base).put("sheet", sheet)
            .put("text", text).put("text2", text2).put("accent", accent)
        prefs.edit().putString("look", json.toString()).apply()
    }

    companion object {
        val standard = Look(true, "rounded", "#1c1b19", "#252321", "#211f1d", "#eeeded", "#b8b5b2", "#7593b4")
        private val HEX = Regex("^#[0-9a-fA-F]{6}$")

        fun color(hex: String): Int = Color.parseColor(hex)

        fun from(json: JSONObject): Look? {
            val keys = listOf("frame", "base", "sheet", "text", "text2", "accent")
            if (keys.any { !HEX.matches(json.optString(it)) }) return null
            val shape = json.optString("shape").takeIf { it in setOf("soft", "rounded", "extra") } ?: "rounded"
            return Look(
                json.optBoolean("dark", true), shape, json.getString("frame"), json.getString("base"),
                json.getString("sheet"), json.getString("text"), json.getString("text2"), json.getString("accent"),
            )
        }

        fun load(prefs: android.content.SharedPreferences): Look =
            prefs.getString("look", null)?.let { runCatching { from(JSONObject(it)) }.getOrNull() } ?: standard
    }
}
