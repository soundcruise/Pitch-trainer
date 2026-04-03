# 「音感クルーズ」バージョン管理・公開情報

アプリの通常版・お試しベータ版・Pro版の分離、および公開URLとインストール手順についての情報をまとめました。

---

## 1. 公開URL (GitHub Pages)

### 🎵 通常版 (Standard Version)
- **URL（推奨・PWA用）**: [https://soundcruise.github.io/Pitch-trainer/standard/](https://soundcruise.github.io/Pitch-trainer/standard/)
- **入口（リダイレクト）**: [https://soundcruise.github.io/Pitch-trainer/](https://soundcruise.github.io/Pitch-trainer/) は自動で `standard/` へ移動します。
- **特徴**: 基礎的なトレーニングに特化したシンプル構成。Proカスタム設定は表示されません。
- **アイコン**: PWA 用は軽量の `icon_pwa_192.png` / `icon_pwa_512.png`（高解像度の `icon.png` もリポジトリに残しています）

### 🧪 お試しベータ版 (Beta)
- **URL（PWA用）**: [https://soundcruise.github.io/Pitch-trainer/beta/](https://soundcruise.github.io/Pitch-trainer/beta/)
- **短い入口**: [beta.html](https://soundcruise.github.io/Pitch-trainer/beta.html) は自動で `beta/` へ移動します。
- **特徴**: メンバー向けテスト用。**メロディ音感・コード音感とも STAGE 1〜4 のみ**（それ以上は選べず、内部でもブロックします）。トップにベータ用ロゴを表示します。
- **アイコン**: `icon_idea/beta.png` を元にした軽量 `beta_pwa_192.png` / `beta_pwa_512.png`

### 👑 Pro版 (Pro Version)
- **URL（会員向け・PWA用）**: `https://soundcruise.github.io/Pitch-trainer/pro_k3m9/`（`pro_` のあとに推測しにくい4文字 `k3m9`）
- **旧URL**: `pro.html`、以前の `pro/`、`prok3m9/` は **開けないか廃止** です。会員の方のみ、共有された `pro_k3m9/` のURLをご利用ください。
- **特徴**: すべての機能を利用可能。ホーム画面のタイトルに `PRO` バッジが表示されます。
- **アイコン（PWA / ホーム画面）**: 軽量の `icon_idea/android_pro_pwa_192.png` / `android_pro_pwa_512.png`
- **注意**: リポジトリが **公開** の場合、GitHub 上のフォルダ名から URL が分かる可能性があります。厳密に伏せたい場合は非公開リポジトリや別ホスティングを検討してください。

---

## 2. アプリとしてインストールする方法 (PWA)

iPhoneやAndroidのホーム画面に「独立したアプリ」として追加する手順です。

1.  **通常版は `…/standard/`、ベータは `…/beta/`、Pro版は会員に共有した `…/pro_k3m9/`** をスマートフォンのブラウザ（iPhoneならSafari、AndroidならChrome）で開きます（Android ではパスごとに別アプリとして追加できます）。
2.  ブラウザのメニューから **「ホーム画面に追加」** を選択します。
3.  必要な版だけ、または複数版を追加して使い分けます。
4.  以前のショートカットで表示が混ざる場合は、古いアイコンを削除してから、上記URLで入れ直してください。

---

## 3. 開発・運用に関する注意点

- **反映（デプロイ）の手順**:
    ローカル（あなたのパソコン）で行った修正を反映するには、GitHub Desktop等で `Commit` し、`Push origin` する必要があります。Push完了後、GitHub Actionsが自動的に処理を行い、2~3分後に反映されます。
- **キャッシュの更新**:
    反映後も古い画面のままなら強制再読み込みを試すか、`standard/`・`beta/`・`pro_k3m9/` それぞれの `service-worker.js` の `CACHE_NAME` を変えてデプロイすると更新が伝わりやすくなります。

---

## 4. プログラム構成ファイル

- **共通ロジック**: `script.js`
- **共通スタイル**: `style.css`
- **入口（リダイレクト）**: ルートの `index.html` → `standard/`。`beta.html` → `beta/`。`pro.html` はリダイレクトせず利用終了の案内のみ表示します。
- **通常版HTML**: `standard/index.html`（マニフェスト・SW は `standard/` 内）
- **ベータ版HTML**: `beta/index.html`（同上）
- **Pro版HTML**: `pro_k3m9/index.html`（同上）
- **Pro版追加スタイル**: `pro-theme.css` (タイトルのバッジ表示用)
- **ルートの manifest.json / manifest-pro.json**: 互換・参照用。PWAの本体は各フォルダの `manifest.json` を使用します。

---
(作成日: 2026年3月7日)
