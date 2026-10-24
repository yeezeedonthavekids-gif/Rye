import UIKit
import WebKit

final class BrowserViewController: UIViewController {
    private var tabs: [Tab] = []
    private var currentIndex = 0
    private var current: Tab? { tabs.indices.contains(currentIndex) ? tabs[currentIndex] : nil }
    private var look = Look.load()

    private let pages = RyePages()
    private lazy var messageHandler = WeakMessageHandler(self)
    private lazy var configuration = makeConfiguration()
    private var observations: [NSKeyValueObservation] = []

    // Page area and bottom toolbar.
    private let pageContainer = UIView()
    private let toolbarBackground = UIView()
    private let toolbarStack = UIStackView()
    private let addressCapsule = UIView()
    private let addressIcon = UIImageView()
    private let addressField = UITextField()
    private let reloadButton = UIButton(type: .system)
    private let progressView = UIProgressView(progressViewStyle: .bar)
    private let buttonRow = UIStackView()
    private let backButton = UIButton(type: .system)
    private let forwardButton = UIButton(type: .system)
    private let shareButton = UIButton(type: .system)
    private let tabsButton = UIButton(type: .system)
    private let menuButton = UIButton(type: .system)
    private var restingBottom: NSLayoutConstraint!
    private var keyboardBottom: NSLayoutConstraint!

    override var preferredStatusBarStyle: UIStatusBarStyle {
        look.dark ? .lightContent : .darkContent
    }

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        buildInterface()
        restoreTabs()
        applyLook()
    }

    // MARK: - Interface

    private func buildInterface() {
        pageContainer.translatesAutoresizingMaskIntoConstraints = false
        pageContainer.clipsToBounds = true
        view.addSubview(pageContainer)

        toolbarBackground.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(toolbarBackground)

        // Address capsule: icon, field, reload.
        addressCapsule.translatesAutoresizingMaskIntoConstraints = false
        addressIcon.translatesAutoresizingMaskIntoConstraints = false
        addressIcon.contentMode = .scaleAspectFit
        addressIcon.preferredSymbolConfiguration = UIImage.SymbolConfiguration(pointSize: 13, weight: .semibold)
        addressField.translatesAutoresizingMaskIntoConstraints = false
        addressField.delegate = self
        addressField.font = .systemFont(ofSize: 16)
        addressField.textAlignment = .center
        addressField.keyboardType = .webSearch
        addressField.returnKeyType = .go
        addressField.autocapitalizationType = .none
        addressField.autocorrectionType = .no
        addressField.spellCheckingType = .no
        addressField.clearButtonMode = .whileEditing
        addressField.accessibilityLabel = "Address and search"
        reloadButton.translatesAutoresizingMaskIntoConstraints = false
        reloadButton.addTarget(self, action: #selector(reloadOrStop), for: .touchUpInside)
        progressView.translatesAutoresizingMaskIntoConstraints = false
        progressView.trackTintColor = .clear
        progressView.isUserInteractionEnabled = false
        addressCapsule.addSubview(addressIcon)
        addressCapsule.addSubview(addressField)
        addressCapsule.addSubview(reloadButton)
        addressCapsule.addSubview(progressView)
        addressCapsule.clipsToBounds = true

        // Buttons.
        configure(backButton, symbol: "chevron.backward", label: "Back", action: #selector(goBack))
        configure(forwardButton, symbol: "chevron.forward", label: "Forward", action: #selector(goForward))
        configure(shareButton, symbol: "square.and.arrow.up", label: "Share", action: #selector(share))
        configure(tabsButton, symbol: "square.on.square", label: "Tabs", action: #selector(showTabs))
        configure(menuButton, symbol: "ellipsis", label: "More", action: nil)
        menuButton.showsMenuAsPrimaryAction = true
        menuButton.menu = makeMenu()
        let longPressNewTab = UILongPressGestureRecognizer(target: self, action: #selector(newTabFromLongPress(_:)))
        tabsButton.addGestureRecognizer(longPressNewTab)

        buttonRow.axis = .horizontal
        buttonRow.distribution = .equalSpacing
        buttonRow.alignment = .center
        buttonRow.translatesAutoresizingMaskIntoConstraints = false
        [backButton, forwardButton, shareButton, tabsButton, menuButton].forEach(buttonRow.addArrangedSubview)

        toolbarStack.axis = .vertical
        toolbarStack.spacing = 6
        toolbarStack.translatesAutoresizingMaskIntoConstraints = false
        toolbarStack.addArrangedSubview(addressCapsule)
        toolbarStack.addArrangedSubview(buttonRow)
        view.addSubview(toolbarStack)

        let safe = view.safeAreaLayoutGuide
        restingBottom = toolbarStack.bottomAnchor.constraint(equalTo: safe.bottomAnchor, constant: -2)
        keyboardBottom = toolbarStack.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor, constant: -8)

        NSLayoutConstraint.activate([
            pageContainer.topAnchor.constraint(equalTo: safe.topAnchor),
            pageContainer.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 6),
            pageContainer.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -6),
            pageContainer.bottomAnchor.constraint(equalTo: toolbarBackground.topAnchor),

            toolbarBackground.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            toolbarBackground.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            toolbarBackground.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            toolbarBackground.topAnchor.constraint(equalTo: toolbarStack.topAnchor, constant: -8),

            toolbarStack.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: 12),
            toolbarStack.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -12),
            restingBottom,

            addressCapsule.heightAnchor.constraint(equalToConstant: 44),
            buttonRow.heightAnchor.constraint(equalToConstant: 40),

            addressIcon.leadingAnchor.constraint(equalTo: addressCapsule.leadingAnchor, constant: 14),
            addressIcon.centerYAnchor.constraint(equalTo: addressCapsule.centerYAnchor),
            addressIcon.widthAnchor.constraint(equalToConstant: 16),
            addressField.leadingAnchor.constraint(equalTo: addressIcon.trailingAnchor, constant: 8),
            addressField.trailingAnchor.constraint(equalTo: reloadButton.leadingAnchor, constant: -4),
            addressField.topAnchor.constraint(equalTo: addressCapsule.topAnchor),
            addressField.bottomAnchor.constraint(equalTo: addressCapsule.bottomAnchor),
            reloadButton.trailingAnchor.constraint(equalTo: addressCapsule.trailingAnchor, constant: -6),
            reloadButton.centerYAnchor.constraint(equalTo: addressCapsule.centerYAnchor),
            reloadButton.widthAnchor.constraint(equalToConstant: 34),
            reloadButton.heightAnchor.constraint(equalToConstant: 34),
            progressView.leadingAnchor.constraint(equalTo: addressCapsule.leadingAnchor),
            progressView.trailingAnchor.constraint(equalTo: addressCapsule.trailingAnchor),
            progressView.bottomAnchor.constraint(equalTo: addressCapsule.bottomAnchor),
            progressView.heightAnchor.constraint(equalToConstant: 2),
        ])
    }

    private func configure(_ button: UIButton, symbol: String, label: String, action: Selector?) {
        button.setImage(UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: 18, weight: .regular)), for: .normal)
        button.accessibilityLabel = label
        button.translatesAutoresizingMaskIntoConstraints = false
        button.widthAnchor.constraint(equalToConstant: 44).isActive = true
        button.heightAnchor.constraint(equalToConstant: 40).isActive = true
        if let action { button.addTarget(self, action: action, for: .touchUpInside) }
    }

    private func makeMenu() -> UIMenu {
        UIMenu(children: [
            UIAction(title: "New Tab", image: UIImage(systemName: "plus.square.on.square")) { [weak self] _ in
                self?.newTab()
            },
            UIAction(title: "Reload", image: UIImage(systemName: "arrow.clockwise")) { [weak self] _ in
                self?.current?.webView?.reload()
            },
            UIAction(title: "Copy Link", image: UIImage(systemName: "link")) { [weak self] _ in
                if let url = self?.current?.url, !RyePages.isRyePage(url) { UIPasteboard.general.url = url }
            },
            UIAction(title: "Personalize", image: UIImage(systemName: "paintpalette")) { [weak self] _ in
                self?.open(RyePages.personalize, inNewTab: false)
            },
        ])
    }

    // MARK: - Look

    private func applyLook() {
        let frame = UIColor.rye(look.frame)
        view.backgroundColor = frame
        toolbarBackground.backgroundColor = frame
        pageContainer.backgroundColor = UIColor.rye(look.sheet)
        pageContainer.layer.cornerRadius = look.cornerRadius * 0.75
        pageContainer.layer.cornerCurve = .continuous
        addressCapsule.backgroundColor = UIColor.rye(look.base)
        addressCapsule.layer.cornerRadius = look.shape == "extra" ? 22 : look.cornerRadius
        addressCapsule.layer.cornerCurve = .continuous
        addressField.textColor = UIColor.rye(look.text)
        addressField.tintColor = UIColor.rye(look.accent)
        addressField.attributedPlaceholder = NSAttributedString(
            string: "Search or enter address",
            attributes: [.foregroundColor: UIColor.rye(look.text2)]
        )
        addressIcon.tintColor = UIColor.rye(look.text2)
        reloadButton.tintColor = UIColor.rye(look.text2)
        progressView.progressTintColor = UIColor.rye(look.accent)
        for button in [backButton, forwardButton, shareButton, tabsButton, menuButton] {
            button.tintColor = UIColor.rye(look.text)
        }
        overrideUserInterfaceStyle = look.dark ? .dark : .light
        setNeedsStatusBarAppearanceUpdate()
    }

    // MARK: - Tabs

    private func makeConfiguration() -> WKWebViewConfiguration {
        let configuration = WKWebViewConfiguration()
        configuration.setURLSchemeHandler(pages, forURLScheme: RyePages.scheme)
        // Sites see Safari, so Google and others treat Rye as a full browser.
        let version = UIDevice.current.systemVersion.split(separator: ".").prefix(2).joined(separator: ".")
        configuration.applicationNameForUserAgent = "Version/\(version) Mobile/15E148 Safari/604.1"
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = .audio
        let controller = configuration.userContentController
        controller.add(messageHandler, name: "rye")
        // Rye's pages learn they're in the phone app.
        let host = """
        if (location.protocol === 'rye:') {
          window.RyeHost = { platform: 'ios', defaultSearch: 'https://www.google.com/search?q=%s' };
        }
        """
        controller.addUserScript(WKUserScript(source: host, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        return configuration
    }

    private func makeWebView(_ configuration: WKWebViewConfiguration) -> WKWebView {
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.allowsLinkPreview = true
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        let refresh = UIRefreshControl()
        refresh.addTarget(self, action: #selector(pullToRefresh(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refresh
        return webView
    }

    /// Creates the tab's web view the first time it's shown.
    private func ensureWebView(_ tab: Tab) -> WKWebView {
        if let webView = tab.webView { return webView }
        let webView = makeWebView(configuration)
        tab.attach(webView)
        load(tab.pendingURL ?? RyePages.newTab, in: tab)
        tab.pendingURL = nil
        return webView
    }

    private func load(_ url: URL, in tab: Tab) {
        guard let webView = tab.webView else {
            tab.pendingURL = url
            return
        }
        if RyePages.isRyePage(url) { tab.allowsRyePageOnce = true }
        webView.load(URLRequest(url: url))
    }

    private func select(_ index: Int) {
        guard tabs.indices.contains(index) else { return }
        current?.webView?.removeFromSuperview()
        currentIndex = index
        let webView = ensureWebView(tabs[index])
        webView.translatesAutoresizingMaskIntoConstraints = false
        pageContainer.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: pageContainer.topAnchor),
            webView.leadingAnchor.constraint(equalTo: pageContainer.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: pageContainer.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: pageContainer.bottomAnchor),
        ])
        observe(webView)
        updateToolbar()
        saveTabs()
    }

    private func observe(_ webView: WKWebView) {
        observations = [
            webView.observe(\.estimatedProgress) { [weak self] _, _ in self?.updateProgress() },
            webView.observe(\.isLoading) { [weak self] _, _ in self?.updateToolbar() },
            webView.observe(\.url) { [weak self] _, _ in self?.updateToolbar(); self?.saveTabs() },
            webView.observe(\.title) { [weak self] _, _ in self?.updateToolbar() },
            webView.observe(\.canGoBack) { [weak self] _, _ in self?.updateToolbar() },
            webView.observe(\.canGoForward) { [weak self] _, _ in self?.updateToolbar() },
            webView.observe(\.hasOnlySecureContent) { [weak self] _, _ in self?.updateToolbar() },
        ]
    }

    func newTab(url: URL = RyePages.newTab) {
        let index = tabs.isEmpty ? 0 : currentIndex + 1
        tabs.insert(Tab(url: url), at: index)
        select(index)
    }

    func open(_ url: URL, inNewTab: Bool) {
        if inNewTab || current == nil {
            newTab(url: url)
        } else if let tab = current {
            load(url, in: tab)
        }
    }

    func closeTab(at index: Int) {
        guard tabs.indices.contains(index) else { return }
        let tab = tabs.remove(at: index)
        if tab.webView?.superview != nil { tab.webView?.removeFromSuperview() }
        tab.webView?.stopLoading()
        if tabs.isEmpty {
            tabs = [Tab(url: RyePages.newTab)]
            currentIndex = 0
        } else if index < currentIndex || currentIndex >= tabs.count {
            currentIndex = max(0, currentIndex - 1)
        }
        select(currentIndex)
    }

    // MARK: - Saving tabs

    private let tabsKey = "rye.tabs"
    private let currentKey = "rye.currentTab"

    func saveTabs() {
        let urls = tabs.compactMap { $0.url?.absoluteString }
        UserDefaults.standard.set(urls, forKey: tabsKey)
        UserDefaults.standard.set(currentIndex, forKey: currentKey)
    }

    private func restoreTabs() {
        let saved = (UserDefaults.standard.stringArray(forKey: tabsKey) ?? []).compactMap(URL.init(string:))
        tabs = saved.isEmpty ? [Tab(url: RyePages.newTab)] : saved.map { Tab(url: $0) }
        let index = UserDefaults.standard.integer(forKey: currentKey)
        select(tabs.indices.contains(index) ? index : 0)
    }

    // MARK: - Toolbar state

    private func updateToolbar() {
        guard let webView = current?.webView else { return }
        backButton.isEnabled = webView.canGoBack
        forwardButton.isEnabled = webView.canGoForward
        shareButton.isEnabled = webView.url != nil && !RyePages.isRyePage(webView.url)
        let symbol = webView.isLoading ? "xmark" : "arrow.clockwise"
        reloadButton.setImage(UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: 14, weight: .semibold)), for: .normal)
        reloadButton.accessibilityLabel = webView.isLoading ? "Stop" : "Reload"
        reloadButton.isHidden = RyePages.isRyePage(webView.url)
        if !addressField.isFirstResponder { showAddress() }
        let count = min(tabs.count, 99)
        tabsButton.setImage(tabCountImage(count), for: .normal)
        tabsButton.accessibilityValue = "\(tabs.count) tabs"
        updateProgress()
    }

    private func updateProgress() {
        guard let webView = current?.webView else { return }
        let loading = webView.isLoading && webView.estimatedProgress < 1
        progressView.isHidden = !loading
        progressView.setProgress(Float(webView.estimatedProgress), animated: loading)
    }

    /// The host when not editing: quiet and readable, like the desktop.
    private func showAddress() {
        let url = current?.url
        addressField.textAlignment = .center
        if RyePages.isRyePage(url) || url == nil {
            addressField.text = nil
            addressIcon.image = UIImage(systemName: "magnifyingglass")
        } else {
            addressField.text = url?.host.map { $0.hasPrefix("www.") ? String($0.dropFirst(4)) : $0 } ?? url?.absoluteString
            let secure = url?.scheme == "https"
            addressIcon.image = UIImage(systemName: secure ? "lock.fill" : "exclamationmark.triangle")
        }
    }

    /// A rounded square with the tab count, like Safari's tab button.
    private func tabCountImage(_ count: Int) -> UIImage {
        let size = CGSize(width: 22, height: 22)
        return UIGraphicsImageRenderer(size: size).image { _ in
            let rect = CGRect(origin: .zero, size: size).insetBy(dx: 1.5, dy: 1.5)
            let path = UIBezierPath(roundedRect: rect, cornerRadius: 5.5)
            path.lineWidth = 1.7
            UIColor.black.setStroke()
            path.stroke()
            let text = "\(count)" as NSString
            let attributes: [NSAttributedString.Key: Any] = [.font: UIFont.systemFont(ofSize: count > 9 ? 9.5 : 11.5, weight: .bold), .foregroundColor: UIColor.black]
            let textSize = text.size(withAttributes: attributes)
            text.draw(at: CGPoint(x: (size.width - textSize.width) / 2, y: (size.height - textSize.height) / 2), withAttributes: attributes)
        }.withRenderingMode(.alwaysTemplate)
    }

    // MARK: - Actions

    @objc private func goBack() { current?.webView?.goBack() }
    @objc private func goForward() { current?.webView?.goForward() }

    @objc private func reloadOrStop() {
        guard let webView = current?.webView else { return }
        if webView.isLoading { webView.stopLoading() } else { webView.reload() }
    }

    @objc private func pullToRefresh(_ control: UIRefreshControl) {
        current?.webView?.reload()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { control.endRefreshing() }
    }

    @objc private func share() {
        guard let url = current?.url, !RyePages.isRyePage(url) else { return }
        let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        sheet.popoverPresentationController?.sourceView = shareButton
        present(sheet, animated: true)
    }

    @objc private func newTabFromLongPress(_ gesture: UILongPressGestureRecognizer) {
        if gesture.state == .began { newTab() }
    }

    @objc private func showTabs() {
        addressField.resignFirstResponder()
        let showSwitcher = { [weak self] in
            guard let self else { return }
            let switcher = TabsViewController(tabs: self.tabs, currentIndex: self.currentIndex, look: self.look)
            switcher.onSelect = { [weak self] index in self?.select(index) }
            switcher.onClose = { [weak self] index in self?.closeTab(at: index) }
            switcher.onNewTab = { [weak self] in self?.newTab() }
            self.present(switcher, animated: true)
        }
        guard let webView = current?.webView else { return showSwitcher() }
        webView.takeSnapshot(with: nil) { [weak self] image, _ in
            self?.current?.snapshot = image
            showSwitcher()
        }
    }

    /// Turns typed text into a URL, or a Google search.
    private func destination(for text: String) -> URL? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        if !trimmed.contains(" ") {
            if let url = URL(string: trimmed), let scheme = url.scheme?.lowercased(),
               ["http", "https"].contains(scheme), url.host != nil {
                return url
            }
            if trimmed.hasPrefix("localhost") { return URL(string: "http://\(trimmed)") }
            if trimmed.contains("."), !trimmed.hasPrefix("."), !trimmed.hasSuffix("."),
               let url = URL(string: "https://\(trimmed)"), url.host != nil {
                return url
            }
        }
        var search = URLComponents(string: "https://www.google.com/search")!
        search.queryItems = [URLQueryItem(name: "q", value: trimmed)]
        return search.url
    }
}

// MARK: - Address field

extension BrowserViewController: UITextFieldDelegate {
    func textFieldDidBeginEditing(_ textField: UITextField) {
        restingBottom.isActive = false
        keyboardBottom.isActive = true
        textField.textAlignment = .natural
        let url = current?.url
        textField.text = RyePages.isRyePage(url) ? nil : url?.absoluteString
        DispatchQueue.main.async { textField.selectAll(nil) }
        UIView.animate(withDuration: 0.25) { self.view.layoutIfNeeded() }
    }

    func textFieldDidEndEditing(_ textField: UITextField) {
        keyboardBottom.isActive = false
        restingBottom.isActive = true
        showAddress()
        UIView.animate(withDuration: 0.25) { self.view.layoutIfNeeded() }
    }

    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        if let url = destination(for: textField.text ?? ""), let tab = current {
            load(url, in: tab)
        }
        textField.resignFirstResponder()
        return true
    }
}

// MARK: - Messages from Rye's pages

extension BrowserViewController: WKScriptMessageHandler {
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        // Only Rye's own pages may talk to the app.
        guard message.frameInfo.isMainFrame, RyePages.isRyePage(message.frameInfo.request.url),
              let body = message.body as? [String: Any], let type = body["type"] as? String
        else { return }
        switch type {
        case "look":
            guard let newLook = Look(message: body), newLook != look else { return }
            look = newLook
            look.save()
            UIView.animate(withDuration: 0.2) { self.applyLook() }
        case "export":
            guard let json = body["json"] as? String, json.count < 2_000_000,
                  let name = body["filename"] as? String else { return }
            let safeName = name.replacingOccurrences(of: "/", with: "-")
            let file = FileManager.default.temporaryDirectory.appendingPathComponent(safeName.isEmpty ? "rye-appearance.json" : safeName)
            do {
                try json.write(to: file, atomically: true, encoding: .utf8)
                let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
                sheet.popoverPresentationController?.sourceView = menuButton
                present(sheet, animated: true)
            } catch {
                return
            }
        default:
            return
        }
    }
}

// MARK: - Navigation

extension BrowserViewController: WKNavigationDelegate {
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url, let scheme = url.scheme?.lowercased() else {
            return decisionHandler(.cancel)
        }
        let tab = tabs.first { $0.webView === webView }
        switch scheme {
        case "http", "https", "about", "blob", "data":
            decisionHandler(.allow)
        case RyePages.scheme:
            // Rye's pages open only when Rye opens them, or from one another.
            let fromRyePage = RyePages.isRyePage(webView.url)
            if fromRyePage || tab?.allowsRyePageOnce == true {
                tab?.allowsRyePageOnce = false
                decisionHandler(.allow)
            } else {
                decisionHandler(.cancel)
            }
        default:
            // tel:, mailto:, App Store links and the like go to their apps.
            decisionHandler(.cancel)
            if navigationAction.navigationType == .linkActivated || navigationAction.targetFrame?.isMainFrame == true {
                UIApplication.shared.open(url)
            }
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showError(error, in: webView)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showError(error, in: webView)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }

    private func showError(_ error: Error, in webView: WKWebView) {
        let nsError = error as NSError
        // Cancelled loads and handed-off links aren't failures.
        if nsError.code == NSURLErrorCancelled || nsError.domain == "WebKitErrorDomain" { return }
        let failing = (nsError.userInfo[NSURLErrorFailingURLStringErrorKey] as? String) ?? ""
        let message = nsError.localizedDescription
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
        let html = """
        <!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>
          body { font: -apple-system-body; margin: 0; min-height: 100vh; display: grid; place-items: center;
                 background: \(look.sheet); color: \(look.text); }
          main { max-width: 320px; padding: 24px; }
          h1 { font: 400 30px 'New York', Georgia, serif; margin: 0 0 8px; }
          p { color: \(look.text2); margin: 0 0 20px; }
          a { display: inline-block; padding: 10px 18px; border-radius: 12px; background: \(look.accent);
              color: \(look.onAccent); text-decoration: none; font-weight: 600; }
        </style>
        <main><h1>Can’t open this page</h1><p>\(message)</p><a href="\(failing.replacingOccurrences(of: "\"", with: "%22"))">Try again</a></main>
        """
        webView.loadHTMLString(html, baseURL: URL(string: failing))
    }
}

// MARK: - Windows and page dialogs

extension BrowserViewController: WKUIDelegate {
    // Links that open a new window open a new tab.
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        let newWebView = makeWebView(configuration)
        let tab = Tab(webView: newWebView)
        tabs.insert(tab, at: currentIndex + 1)
        select(currentIndex + 1)
        return newWebView
    }

    func webViewDidClose(_ webView: WKWebView) {
        if let index = tabs.firstIndex(where: { $0.webView === webView }) { closeTab(at: index) }
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        let alert = UIAlertController(title: frame.request.url?.host, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        presentDialog(alert, otherwise: completionHandler)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        let alert = UIAlertController(title: frame.request.url?.host, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        presentDialog(alert) { completionHandler(false) }
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (String?) -> Void
    ) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(alert.textFields?.first?.text) })
        presentDialog(alert) { completionHandler(nil) }
    }

    /// Shows a page dialog, or answers it right away if something else is on screen.
    private func presentDialog(_ alert: UIAlertController, otherwise fallback: @escaping () -> Void) {
        if presentedViewController == nil {
            present(alert, animated: true)
        } else {
            fallback()
        }
    }
}
