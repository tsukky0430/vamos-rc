# VamosRC 🏃

ランニングクラブ向けVDOT管理・ランキングアプリ。

## 機能
- Daniels式VDOTの自動計算
- チーム内総合ランキング
- 14カテゴリー別ランキング・記録
- 種目別歴代記録
- タイム推移グラフ
- トレーニングペース自動算出
- データはブラウザに自動保存（localStorage）

## ローカルで起動する

```bash
npm install
npm run dev
```

ブラウザで http://localhost:5173 を開く。

## Vercelにデプロイする

### 1. GitHubにpushする

```bash
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/あなたのID/vamos-rc.git
git push -u origin main
```

### 2. Vercelでデプロイ

1. https://vercel.com にGitHubアカウントでログイン
2. 「Add New Project」→ このリポジトリを選択
3. Framework Preset: **Vite** を選択（自動で選ばれるはず）
4. 「Deploy」を押すだけ

数分で `https://vamos-rc.vercel.app` のようなURLが発行されます。

### 3. 以降の更新

```bash
git add .
git commit -m "更新内容を書く"
git push
```

pushするだけでVercelが自動で再デプロイします。
