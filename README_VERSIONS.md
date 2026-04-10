# 「音感クルーズ」バージョン管理・公開情報

アプリの通常版・お試しベータ版・Pro版の分離、および公開URLとインストール手順についての情報をまとめました。

**配布・利用のリスクや注意事項**（配布者向け・利用者向け）は **[配布と利用上の注意.md](./配布と利用上の注意.md)** にまとめています。

---

## 1. バージョン番号の運用（非エンジニア向け）

画面に表示するのは **「Ver 1.1.2」** のような **三つの数字**だけです（ビルド番号は使いません）。

| 変更の内容 | どの数字を上げるか | 例 |
|------------|-------------------|-----|
| **バグだけ直した** | 右の数字（パッチ） | 1.1.1 → **1.1.2** |
| **機能を足した** | 真ん中の数字（マイナー）。右は 0 に戻す | 1.1.0 → **1.2.0** |
| **大きく変えた**（仕様の大変更など） | 左の数字（メジャー）。真ん中・右は 0 に戻す | 1.1.0 → **2.0.0** |

**リリース時にやること（覚えておくとよい手順）**

1. `script.js` の **`PITCH_TRAINER_APP_VERSION`** を、上のルールで新しい番号に書き換える。
2. 次のファイルで **`script.js?v=…` の番号を同じにする**（ブラウザが古いファイルを使い続けないため）  
   `pitch-trainer/standard/index.html` · `beta/index.html` · **`pitch-trainer/pro_x9v7q2m8/index.html`**
3. GitHub に反映（Commit → Push）する。

※ 反映されにくいときは、各エディションの `service-worker.js` の `CACHE_NAME` を少し変えてからデプロイしてもよいです（「3. 開発・運用」参照）。

---

## 2. 公開URL (GitHub Pages)

リポジトリでは **通常版・Pro・Staging は `pitch-trainer/` フォルダの下**にあります。**ベータだけ**リポジトリ直下の `beta/` にあります。

GitHub Pages のベース URL は **`https://soundcruise.github.io/Pitch-trainer/`**（ユーザー名・リポジトリ名は実際のものに読み替えてください）。

### 🎵 通常版 (Standard Version)

- **URL（推奨・PWA用）**: [https://soundcruise.github.io/Pitch-trainer/pitch-trainer/standard/](https://soundcruise.github.io/Pitch-trainer/pitch-trainer/standard/)
- **独自ドメイン（DNS 反映後）の例**: `https://soundcruise.jp/pitch-trainer/standard/`（設定手順は `URL_manual/URL_manual.txt` 参照）
- **ルート**: [https://soundcruise.github.io/Pitch-trainer/](https://soundcruise.github.io/Pitch-trainer/) は **404 表示**（自動でアプリへは移動しません）
- **旧パス（しばらく残す）**: ルートの `standard/` などは **新しい場所へ自動転送**するページを置いています（ブックマーク用）
- **特徴**: 基礎的なトレーニングに特化したシンプル構成。Proカスタム設定は表示されません。
- **アイコン**: PWA 用はリポジトリ直下の `icon_pwa_192.png` / `icon_pwa_512.png`（高解像度の `icon.png` も残しています）

### 🧪 お試しベータ版 (Beta)

- **URL（PWA用）**: [https://soundcruise.github.io/Pitch-trainer/beta/](https://soundcruise.github.io/Pitch-trainer/beta/)
- **短い入口**: [beta.html](https://soundcruise.github.io/Pitch-trainer/beta.html) は自動で `beta/` へ移動します。
- **特徴**: メンバー向けテスト用。**メロディ音感・コード音感とも STAGE 1〜4 のみ**（それ以上は選べず、内部でもブロックします）。トップのタイトル下に「お試しベータ」と表示します。
- **アイコン**: 元画像は `icon_idea/beta.png`。PWA 用の `beta_pwa_192.png` / `beta_pwa_512.png` は **`beta/` フォルダに配置**（`manifest.json`・ホーム画面用と一致）

### 👑 Pro版 (Pro Version)

- **会員向けの URL は `member.soundcruise.jp` 側だけで案内してください。**  
  例: `https://member.soundcruise.jp/pitch-trainer/pro_x9v7q2m8/`（独自ドメイン・DNS が未設定のときは GitHub Pages の member 用ホストに読み替え）
- **公開サイト（soundcruise.jp）に同じパスを置いた場合**、アプリ側（`pro-gate.js`）が **会員ドメインへ転送**します。それでも **会員への案内リンクは最初から member 側**にすると迷いが少なくなります。
- **この README には Pro のフル URL を固定で載せません。** YouTube の有料メンバー向け案内などで共有し、必要なら **リポジトリ外**（個人用メモ・会員向け資料）で管理するとよいです。
- **旧URL**: ルートの `pro.html` は利用終了の案内のみです。ルートの `pro_x9v7q2m8/` は **新しい場所へ自動転送**します。
- **特徴**: すべての機能を利用可能。ホーム画面のタイトルに `PRO` バッジが表示されます。
- **アイコン（PWA / ホーム画面）**: リポジトリ直下の `pro_icon_192.png` / `pro_icon_512.png`。ホーム画面の表示名も **「音感クルーズ」**（通常版と同一表記）
- **注意**: ソースコードは公開リポジトリに含まれるため、**フォルダ名などは完全には隠せません**。会員向け URL の「秘密」は **ログインではなく運用のしやすさ**程度と考えてください。厳密な非公開が必要な場合は、非公開リポジトリ・別ホスティング・認証の導入を検討してください。

### 🔧 Staging（検証ハブ）

- 開発・検証用。**一般向けの案内には使いません。** パスは `pitch-trainer/staging/`（GitHub Pages では `…/pitch-trainer/staging/`）。

---

## 3. アプリとしてインストールする方法 (PWA)

iPhoneやAndroidのホーム画面に「独立したアプリ」として追加する手順です。

1.  **通常版**は `…/pitch-trainer/standard/`、**ベータ**は `…/beta/`、**Pro**は **会員向けに案内している URL（member 側）**をスマートフォンのブラウザ（iPhoneならSafari、AndroidならChrome）で開きます（Android ではパスごとに別アプリとして追加できます）。
2.  ブラウザのメニューから **「ホーム画面に追加」** を選択します。
3.  必要な版だけ、または複数版を追加して使い分けます。
4.  以前のショートカットで表示が混ざる場合は、古いアイコンを削除してから、上記URLで入れ直してください。

---

## 4. 開発・運用に関する注意点

- **反映（デプロイ）の手順**:
    ローカル（あなたのパソコン）で行った修正を反映するには、GitHub Desktop等で `Commit` し、`Push origin` する必要があります。Push完了後、GitHub Actionsが自動的に処理を行い、2~3分後に反映されます。
- **キャッシュの更新**:
    反映後も古い画面のままなら強制再読み込みを試すか、`pitch-trainer/standard/`・`beta/`・`pitch-trainer/pro_x9v7q2m8/` それぞれの `service-worker.js` の `CACHE_NAME` を変えてデプロイすると更新が伝わりやすくなります。

---

## 5. プログラム構成ファイル

- **共通ロジック**: リポジトリ直下の `script.js`
- **共通スタイル**: リポジトリ直下の `style.css`
- **入口**: ルートの `index.html` は **404 表示**。`beta.html` → `beta/`。`clear.html` はキャッシュ削除後 **`pitch-trainer/standard/`** へ。`pro.html` はリダイレクトせず利用終了の案内のみ表示します。
- **通常版HTML**: `pitch-trainer/standard/index.html`（マニフェスト・SW は同フォルダ内）
- **ベータ版HTML**: `beta/index.html`（同上）
- **Pro版HTML**: `pitch-trainer/pro_x9v7q2m8/index.html`（マニフェスト・SW は同フォルダ内）
- **Staging**: `pitch-trainer/staging/index.html`
- **Pro版追加スタイル**: リポジトリ直下の `pro-theme.css` (タイトルのバッジ表示用)
- **ルートの manifest.json / manifest-pro.json**: 互換・参照用。PWAの本体は各フォルダの `manifest.json` を使用します。

---
(作成日: 2026年3月7日 · 2026年4月 URL構成を反映して更新)
