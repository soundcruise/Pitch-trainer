#!/bin/bash

# GitHub Pages 公開補助スクリプト
# 使用方法: ./deploy.sh [GITHUB_REPO_URL]

if [ -z "$1" ]; then
    echo "使用方法: ./deploy.sh https://github.com/USER/REPO.git"
    exit 1
fi

REPO_URL=$1

echo "🚀 デプロイを開始します..."

# Git初期化（未初期化の場合のみ）
if [ ! -d ".git" ]; then
    git init
    echo "✅ Gitを初期化しました。"
fi

# ファイルを追加
git add .

# コミット
git commit -m "Deploy to GitHub Pages"

# リモート設定
git remote remove origin 2>/dev/null
git remote add origin $REPO_URL

# メインブランチ設定とプッシュ
git branch -M main
git push -u origin main --force

echo "------------------------------------------------"
echo "✅ アップロードが完了しました！"
echo "1. GitHubリポジトリの Settings > Pages を開いてください。"
echo "2. Branchに 'main' を指定して [Save] を押してください。"
echo "3. 数分後にアプリが公開されます。"
echo "------------------------------------------------"
