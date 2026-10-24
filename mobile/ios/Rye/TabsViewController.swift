import UIKit

/// The tab switcher: a grid of page pictures with titles.
final class TabsViewController: UIViewController, UICollectionViewDataSource, UICollectionViewDelegateFlowLayout {
    var onSelect: ((Int) -> Void)?
    var onClose: ((Int) -> Void)?
    var onNewTab: (() -> Void)?

    private var tabs: [Tab]
    private let currentIndex: Int
    private let look: Look
    private var collectionView: UICollectionView!

    init(tabs: [Tab], currentIndex: Int, look: Look) {
        self.tabs = tabs
        self.currentIndex = currentIndex
        self.look = look
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .fullScreen
        overrideUserInterfaceStyle = look.dark ? .dark : .light
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .rye(look.frame)

        let layout = UICollectionViewFlowLayout()
        layout.minimumInteritemSpacing = 12
        layout.minimumLineSpacing = 18
        layout.sectionInset = UIEdgeInsets(top: 16, left: 16, bottom: 16, right: 16)
        collectionView = UICollectionView(frame: .zero, collectionViewLayout: layout)
        collectionView.backgroundColor = .clear
        collectionView.dataSource = self
        collectionView.delegate = self
        collectionView.register(TabCell.self, forCellWithReuseIdentifier: TabCell.id)
        collectionView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(collectionView)

        let bar = UIStackView()
        bar.axis = .horizontal
        bar.distribution = .equalSpacing
        bar.alignment = .center
        bar.translatesAutoresizingMaskIntoConstraints = false
        let count = UILabel()
        count.text = tabs.count == 1 ? "1 tab" : "\(tabs.count) tabs"
        count.textColor = .rye(look.text2)
        count.font = .systemFont(ofSize: 15, weight: .medium)
        let add = UIButton(type: .system)
        add.setImage(UIImage(systemName: "plus", withConfiguration: UIImage.SymbolConfiguration(pointSize: 20, weight: .medium)), for: .normal)
        add.tintColor = .rye(look.text)
        add.accessibilityLabel = "New tab"
        add.addTarget(self, action: #selector(newTab), for: .touchUpInside)
        let done = UIButton(type: .system)
        done.setTitle("Done", for: .normal)
        done.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        done.tintColor = .rye(look.accent)
        done.addTarget(self, action: #selector(close), for: .touchUpInside)
        [count, add, done].forEach(bar.addArrangedSubview)
        view.addSubview(bar)

        let safe = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            collectionView.topAnchor.constraint(equalTo: safe.topAnchor),
            collectionView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            collectionView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            collectionView.bottomAnchor.constraint(equalTo: bar.topAnchor, constant: -6),
            bar.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: 20),
            bar.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -20),
            bar.bottomAnchor.constraint(equalTo: safe.bottomAnchor, constant: -6),
            bar.heightAnchor.constraint(equalToConstant: 44),
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if tabs.indices.contains(currentIndex) {
            collectionView.scrollToItem(at: IndexPath(item: currentIndex, section: 0), at: .centeredVertically, animated: false)
        }
    }

    @objc private func newTab() {
        dismiss(animated: true) { [onNewTab] in onNewTab?() }
    }

    @objc private func close() {
        dismiss(animated: true)
    }

    // MARK: Grid

    func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int) -> Int {
        tabs.count
    }

    func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath) -> UICollectionViewCell {
        let cell = collectionView.dequeueReusableCell(withReuseIdentifier: TabCell.id, for: indexPath) as! TabCell
        let tab = tabs[indexPath.item]
        cell.configure(title: tab.title, snapshot: tab.snapshot, look: look, isCurrent: indexPath.item == currentIndex)
        cell.onClose = { [weak self, weak cell] in
            guard let self, let cell, let path = self.collectionView.indexPath(for: cell) else { return }
            self.tabs.remove(at: path.item)
            self.onClose?(path.item)
            self.collectionView.deleteItems(at: [path])
            if self.tabs.isEmpty { self.dismiss(animated: true) }
        }
        return cell
    }

    func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
        let index = indexPath.item
        dismiss(animated: true) { [onSelect] in onSelect?(index) }
    }

    func collectionView(_ collectionView: UICollectionView, layout: UICollectionViewLayout, sizeForItemAt indexPath: IndexPath) -> CGSize {
        let columns: CGFloat = collectionView.bounds.width > 700 ? 3 : 2
        let width = floor((collectionView.bounds.width - 32 - 12 * (columns - 1)) / columns)
        return CGSize(width: width, height: width * 1.45 + 28)
    }
}

private final class TabCell: UICollectionViewCell {
    static let id = "tab"
    var onClose: (() -> Void)?

    private let card = UIView()
    private let picture = UIImageView()
    private let title = UILabel()
    private let closeButton = UIButton(type: .system)

    override init(frame: CGRect) {
        super.init(frame: frame)
        card.translatesAutoresizingMaskIntoConstraints = false
        card.layer.cornerRadius = 14
        card.layer.cornerCurve = .continuous
        card.clipsToBounds = true
        picture.translatesAutoresizingMaskIntoConstraints = false
        picture.contentMode = .scaleAspectFill
        picture.clipsToBounds = true
        title.translatesAutoresizingMaskIntoConstraints = false
        title.font = .systemFont(ofSize: 13, weight: .medium)
        title.textAlignment = .center
        closeButton.translatesAutoresizingMaskIntoConstraints = false
        closeButton.setImage(UIImage(systemName: "xmark", withConfiguration: UIImage.SymbolConfiguration(pointSize: 11, weight: .bold)), for: .normal)
        closeButton.backgroundColor = UIColor.black.withAlphaComponent(0.45)
        closeButton.tintColor = .white
        closeButton.layer.cornerRadius = 13
        closeButton.accessibilityLabel = "Close tab"
        closeButton.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
        contentView.addSubview(card)
        card.addSubview(picture)
        contentView.addSubview(title)
        contentView.addSubview(closeButton)
        NSLayoutConstraint.activate([
            card.topAnchor.constraint(equalTo: contentView.topAnchor),
            card.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            card.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            card.bottomAnchor.constraint(equalTo: title.topAnchor, constant: -8),
            picture.topAnchor.constraint(equalTo: card.topAnchor),
            picture.leadingAnchor.constraint(equalTo: card.leadingAnchor),
            picture.trailingAnchor.constraint(equalTo: card.trailingAnchor),
            picture.bottomAnchor.constraint(equalTo: card.bottomAnchor),
            title.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 4),
            title.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -4),
            title.bottomAnchor.constraint(equalTo: contentView.bottomAnchor),
            title.heightAnchor.constraint(equalToConstant: 20),
            closeButton.topAnchor.constraint(equalTo: card.topAnchor, constant: 8),
            closeButton.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -8),
            closeButton.widthAnchor.constraint(equalToConstant: 26),
            closeButton.heightAnchor.constraint(equalToConstant: 26),
        ])
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    func configure(title text: String, snapshot: UIImage?, look: Look, isCurrent: Bool) {
        title.text = text
        title.textColor = .rye(look.text)
        card.backgroundColor = .rye(look.sheet)
        picture.image = snapshot
        card.layer.borderWidth = isCurrent ? 2.5 : 0
        card.layer.borderColor = UIColor.rye(look.accent).cgColor
    }

    @objc private func closeTapped() {
        onClose?()
    }
}
