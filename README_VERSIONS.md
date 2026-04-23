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

1. `apps/pitch-cruise/script.js` の **`PITCH_TRAINER_APP_VERSION`** を、上のルールで新しい番号に書き換える。
2. 次のファイルで **`script.js?v=…` の番号を同じにする**（ブラウザが古いファイルを使い続けないため）  
   `apps/pitch-cruise/standard/index.html` · **`apps/pitch-cruise/beta/index.html`** · **`apps/pitch-cruise/pro_x9v7q2m8/index.html`**
3. GitHub に反映（Commit → Push）する。

※ 反映されにくいときは、各エディションの `service-worker.js` の `CACHE_NAME` を少し変えてからデプロイしてもよいです（「3. 開発・運用」参照）。

---

## 2. 公開URL (GitHub Pages)

リポジトリでは **通常版・ベータ・Pro・Staging はすべて `apps/pitch-cruise/` フォルダの下**にあります。ルートの `beta/`・`standard/` や旧 `pitch-trainer/` は旧URLからの転送用のみです。

GitHub Pages のベース URL は **`https://soundcruise.github.io/Pitch-trainer/`**（ユーザー名・リポジトリ名は実際のものに読み替えてください）。

### 🎵 通常版 (Standard Version)

- **URL（推奨・独自ドメイン）**: `https://soundcruise.jp/apps/pitch-cruise/standard/`
- **URL（GitHub Pages 既定）**: `https://soundcruise.github.io/Pitch-trainer/apps/pitch-cruise/standard/`
- **ルート**: [https://soundcruise.github.io/Pitch-trainer/](https://soundcruise.github.io/Pitch-trainer/) は **404 表示**（自動でアプリへは移動しません）
- **旧パス（しばらく残す）**: ルートの `standard/` や `pitch-trainer/standard/` は **新しい場所へ自動転送**するページを置いています（ブックマーク用）
- **特徴**: 基礎的なトレーニングに特化したシンプル構成。Proカスタム設定は表示されません。
- **アイコン**: PWA 用は `apps/pitch-cruise/icon_pwa_192.png` / `apps/pitch-cruise/icon_pwa_512.png`（高解像度の `icon.png` もルートに残しています）

### 🧪 お試しベータ版 (Beta)

- **URL（推奨・独自ドメイン）**: `https://soundcruise.jp/apps/pitch-cruise/beta/`
- **URL（GitHub Pages 既定）**: `https://soundcruise.github.io/Pitch-trainer/apps/pitch-cruise/beta/`
- **短い入口**: [beta.html](https://soundcruise.github.io/Pitch-trainer/beta.html) は自動で **`apps/pitch-cruise/beta/`** へ移動します。
- **旧パス**: `pitch-trainer/beta/` や ルートの `beta/` からも自動転送します。
- **特徴**: メンバー向けテスト用。**メロディ音感・コード音感とも STAGE 1〜4 のみ**（それ以上は選べず、内部でもブロックします）。トップのタイトル下に「お試しベータ」と表示します。
- **アイコン**: 元画像は `icon_idea/beta.png`。PWA 用の `beta_pwa_192.png` / `beta_pwa_512.png` は **`apps/pitch-cruise/beta/` フォルダに配置**（`manifest.json`・ホーム画面用と一致）

### 👑 Pro版 (Pro Version)

- **入室パスワード（共通・1か所）**: `apps/pitch-cruise/auth/pro-gate-config.js`。将来ほかのアプリも Pro を出すときは **同じファイルを読み込めば**、パスワード変更は1回・同じ4桁で入室できます。`rotationId` を **1 増やす**と、パスワード変更と同時に **全会員に再入力**がかかります（運用の仕組みとして）。
- **Pro の URL**: `https://soundcruise.jp/apps/pitch-cruise/pro_x9v7q2m8/`（推測しにくいフォルダ名＋4桁パスワードで保護）
- **パスワード画面が出ないとき**（以前に入室した記録が残っているときなど）: URL の末尾に **`?resetGate=1`** を付けて開くと、入室記録を消してパスワード入力に戻せます（例: `https://soundcruise.jp/apps/pitch-cruise/pro_x9v7q2m8/?resetGate=1`）。
- **この README には Pro のフル URL を固定で載せません。** YouTube の有料メンバー向け案内などで共有し、必要なら **リポジトリ外**（個人用メモ・会員向け資料）で管理するとよいです。
- **旧パス**: ルートの `pro_x9v7q2m8/` や `pitch-trainer/pro_x9v7q2m8/` は **新しい場所へ自動転送**します。
- **特徴**: すべての機能を利用可能。ホーム画面のタイトルに `PRO` バッジが表示されます。
- **アイコン（PWA / ホーム画面）**: `apps/pitch-cruise/pro_icon_192.png` / `apps/pitch-cruise/pro_icon_512.png`。ホーム画面の表示名も **「音感クルーズ」**（通常版と同一表記）
- **注意**: ソースコードは公開リポジトリに含まれるため、**フォルダ名などは完全には隠せません**。会員向け URL の「秘密」は **ログインではなく運用のしやすさ**程度と考えてください。厳密な非公開が必要な場合は、非公開リポジトリ・別ホスティング・認証の導入を検討してください。

### 🔧 Staging（検証ハブ）

- 開発・検証用。**一般向けの案内には使いません。** 本体は **`apps/pitch-cruise/staging/?k=x9v7q2m8`**（トークン無しでは 404 になります）。
- **短い入口（ルート）**: `staging.html`（例: `https://soundcruise.jp/staging.html`）は **同じく `?k=` 付き**で検証ハブへ転送します。ルートの `staging/` フォルダからの転送も **`k` を付けて**飛びます。

---

## 3. アプリとしてインストールする方法 (PWA)

iPhoneやAndroidのホーム画面に「独立したアプリ」として追加する手順です。

1.  **通常版**は `…/apps/pitch-cruise/standard/`、**ベータ**は `…/apps/pitch-cruise/beta/`、**Pro**は **会員向けに案内している URL** をスマートフォンのブラウザ（iPhoneならSafari、AndroidならChrome）で開きます（Android ではパスごとに別アプリとして追加できます）。
2.  ブラウザのメニューから **「ホーム画面に追加」** を選択します。
3.  必要な版だけ、または複数版を追加して使い分けます。
4.  以前のショートカットで表示が混ざる場合は、古いアイコンを削除してから、上記URLで入れ直してください。

---

## 4. 開発・運用に関する注意点

- **反映（デプロイ）の手順**:
    ローカル（あなたのパソコン）で行った修正を反映するには、GitHub Desktop等で `Commit` し、`Push origin` する必要があります。Push完了後、GitHub Actionsが自動的に処理を行い、2~3分後に反映されます。
- **キャッシュの更新**:
    反映後も古い画面のままなら強制再読み込みを試すか、`apps/pitch-cruise/standard/`・`apps/pitch-cruise/beta/`・`apps/pitch-cruise/pro_x9v7q2m8/`・`apps/pitch-cruise/staging/` それぞれの `service-worker.js` の `CACHE_NAME` を変えてデプロイすると更新が伝わりやすくなります。

---

## 5. プログラム構成ファイル

- **共通ロジック**: `apps/pitch-cruise/script.js`
- **共通スタイル**: `apps/pitch-cruise/style.css`
- **入口**: ルートの `index.html` は **404 表示**。`beta.html` → **`apps/pitch-cruise/beta/`**。`staging.html` → **`apps/pitch-cruise/staging/?k=…`**。ルートの `beta/`・`staging/`・`pro_x9v7q2m8/` は旧パスからの転送のみ。`clear.html` はキャッシュ削除後 **`apps/pitch-cruise/standard/`** へ。
- **通常版HTML**: `apps/pitch-cruise/standard/index.html`（マニフェスト・SW は同フォルダ内）
- **ベータ版HTML**: `apps/pitch-cruise/beta/index.html`（同上）
- **Pro版HTML**: `apps/pitch-cruise/pro_x9v7q2m8/index.html`（マニフェスト・SW は同フォルダ内）
- **Staging**: `apps/pitch-cruise/staging/index.html`
- **Pro版追加スタイル**: `apps/pitch-cruise/pro-theme.css` (タイトルのバッジ表示用)
- **ルートの manifest.json / manifest-pro.json**: 互換・参照用。PWAの本体は各フォルダの `manifest.json` を使用します。

---
(作成日: 2026年3月7日 · 2026年4月 URL構成を `apps/pitch-cruise/` へ移行して更新)
