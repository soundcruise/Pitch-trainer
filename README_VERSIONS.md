# 「音感クルーズ」バージョン管理・公開情報

アプリの通常版とPro版の分離、およびそれぞれの公開URLとインストール手順についての情報をまとめました。

---

## 1. 公開URL (GitHub Pages)

### 🎵 通常版 (Standard Version)
- **URL**: [https://soundcruise.github.io/Pitch-trainer/](https://soundcruise.github.io/Pitch-trainer/)
- **特徴**: 基礎的なトレーニングに特化したシンプル構成。Proカスタム設定は表示されません。
- **アイコン**: 青背景のロゴ (`icon.png`)

### 👑 Pro版 (Pro Version)
- **URL**: [https://soundcruise.github.io/Pitch-trainer/pro.html](https://soundcruise.github.io/Pitch-trainer/pro.html)
- **特徴**: すべての機能を利用可能。ホーム画面のタイトルに `PRO` バッジが表示されます。
- **アイコン**: ロゴが全面に配置されたデザイン (`icon_idea/Pro_2.png`)

---

## 2. アプリとしてインストールする方法 (PWA)

iPhoneやAndroidのホーム画面に「独立したアプリ」として追加する手順です。

1.  上記それぞれのURLをスマートフォンのブラウザ（iPhoneならSafari、AndroidならChrome）で開きます。
2.  ブラウザのメニューから **「ホーム画面に追加」** を選択します。
3.  通常版とPro版をそれぞれ追加することで、ホーム画面に2つのアイコンが並び、別々のアプリとして使い分けることができます。

---

## 3. 開発・運用に関する注意点

- **反映（デプロイ）の手順**:
    ローカル（あなたのパソコン）で行った修正を反映するには、GitHub Desktop等で `Commit` し、`Push origin` する必要があります。Push完了後、GitHub Actionsが自動的に処理を行い、2~3分後に反映されます。
- **キャッシュの更新**:
    プログラムを修正した際は、`service-worker.js` 内の `VERSION`（現在の最新は `28`）をカウントアップすることで、既存ユーザーのアプリが自動的に最新版に更新されるようになります。

---

## 4. プログラム構成ファイル

- **共通ロジック**: `script.js`
- **共通スタイル**: `style.css`
- **通常版HTML**: `index.html`
- **Pro版HTML**: `pro.html`
- **Pro版追加スタイル**: `pro-theme.css` (タイトルのバッジ表示用)
- **設定ファイル**: `manifest.json` (通常版), `manifest-pro.json` (Pro版)

---
(作成日: 2026年3月7日)
