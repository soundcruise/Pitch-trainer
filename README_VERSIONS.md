# 「音感クルーズ」バージョン管理・公開情報

アプリの通常版とPro版の分離、およびそれぞれの公開URLとインストール手順についての情報をまとめました。

---

## 1. 公開URL (GitHub Pages)

### 🎵 通常版 (Standard Version)
- **URL（推奨・PWA用）**: [https://soundcruise.github.io/Pitch-trainer/standard/](https://soundcruise.github.io/Pitch-trainer/standard/)
- **入口（リダイレクト）**: [https://soundcruise.github.io/Pitch-trainer/](https://soundcruise.github.io/Pitch-trainer/) は自動で `standard/` へ移動します。
- **特徴**: 基礎的なトレーニングに特化したシンプル構成。Proカスタム設定は表示されません。
- **アイコン**: 青背景のロゴ (`icon.png`)

### 👑 Pro版 (Pro Version)
- **URL（推奨・PWA用）**: [https://soundcruise.github.io/Pitch-trainer/pro/](https://soundcruise.github.io/Pitch-trainer/pro/)
- **入口（リダイレクト）**: 旧URL [pro.html](https://soundcruise.github.io/Pitch-trainer/pro.html) は自動で `pro/` へ移動します。
- **特徴**: すべての機能を利用可能。ホーム画面のタイトルに `PRO` バッジが表示されます。
- **アイコン**: ロゴが全面に配置されたデザイン (`icon_idea/Pro_4.png` など)

---

## 2. アプリとしてインストールする方法 (PWA)

iPhoneやAndroidのホーム画面に「独立したアプリ」として追加する手順です。

1.  **通常版は `…/standard/`、Pro版は `…/pro/`** をスマートフォンのブラウザ（iPhoneならSafari、AndroidならChrome）で開きます（Android で2つ別アプリにするためにパスを分けています）。
2.  ブラウザのメニューから **「ホーム画面に追加」** を選択します。
3.  通常版とPro版をそれぞれ追加することで、ホーム画面に2つのアイコンが並び、別々のアプリとして使い分けることができます。
4.  以前のショートカットで表示が混ざる場合は、古いアイコンを削除してから、上記URLで入れ直してください。

---

## 3. 開発・運用に関する注意点

- **反映（デプロイ）の手順**:
    ローカル（あなたのパソコン）で行った修正を反映するには、GitHub Desktop等で `Commit` し、`Push origin` する必要があります。Push完了後、GitHub Actionsが自動的に処理を行い、2~3分後に反映されます。
- **キャッシュの更新**:
    反映後も古い画面のままなら強制再読み込みを試すか、`standard/service-worker.js` と `pro/service-worker.js` の `CACHE_NAME` を変えてデプロイすると更新が伝わりやすくなります。

---

## 4. プログラム構成ファイル

- **共通ロジック**: `script.js`
- **共通スタイル**: `style.css`
- **入口（リダイレクトのみ）**: ルートの `index.html` → `standard/`、`pro.html` → `pro/`
- **通常版HTML**: `standard/index.html`（マニフェスト・SW は `standard/` 内）
- **Pro版HTML**: `pro/index.html`（同上）
- **Pro版追加スタイル**: `pro-theme.css` (タイトルのバッジ表示用)
- **ルートの manifest.json / manifest-pro.json**: 互換・参照用。PWAの本体は各フォルダの `manifest.json` を使用します。

---
(作成日: 2026年3月7日)
