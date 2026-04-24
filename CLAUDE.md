# 音感クルーズ — Claude Code 作業ルール

## バージョン番号の自動判断・自動適用

コードを変更したとき、**ユーザーから指示がなくても** 以下のルールでバージョンを判断して上げる。

### 判断基準

| 変更の種類 | 上げる桁 | 例 |
|---|---|---|
| バグ修正・文言変更・スタイル微調整・設定値変更など、機能の追加がないもの | パッチ（右） | 1.16.1 → 1.16.2 |
| 新機能・新UI要素・新画面の追加、ユーザーが気づく動作変更 | マイナー（中）、右は 0 に戻す | 1.16.2 → 1.17.0 |
| 大規模な仕様変更・設計の刷新 | メジャー（左）、中・右は 0 に戻す | 1.17.0 → 2.0.0 |

1回のコミットに複数種類の変更が混在する場合は、最も大きい種類に合わせる。

### 更新するファイル（毎回すべて）

```
apps/pitch-cruise/script.js              ← PITCH_TRAINER_APP_VERSION
apps/pitch-cruise/standard/index.html   ← script.js?v=
apps/pitch-cruise/beta/index.html       ← script.js?v=
apps/pitch-cruise/pro_x9v7q2m8/index.html ← script.js?v=
apps/pitch-cruise/staging/index.html    ← script.js?v=
```

### 手順

1. 機能変更を実装する
2. 上の基準でバージョンを決定する
3. `sed` で5ファイルを一括置換する
4. 実装内容とバージョンアップをまとめて1コミットにする（分けない）

---

詳細な運用方針は [README_VERSIONS.md](./README_VERSIONS.md) を参照。
