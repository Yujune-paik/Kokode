# 集合先ナビ

複数人の現在地と行き先から、集合しやすい駅候補と各自の行き方を表示する Next.js アプリです。Vercel にデプロイし、LINE の LIFF アプリとして利用する前提で実装しています。

## ローカル起動

```bash
npm install
npm run dev
```

開発サーバー起動後、表示された URL をブラウザで開きます。

## ビルド確認

```bash
npm run build
```

Vercel へデプロイする前に、ローカルでビルドが通ることを確認してください。

## 環境変数

`.env.local` または Vercel の Environment Variables に以下を設定します。

```env
NEXT_PUBLIC_LIFF_ID=xxxxxxxxxx-xxxxxxxx
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

`NEXT_PUBLIC_LIFF_ID` が設定されている場合、アプリ起動時にクライアント側で `liff.init()` を実行します。LIFF ID がない場合でも、通常の Web アプリとして動作します。

## Vercel へのデプロイ方法

```text
GitHubにpush
↓
VercelでImport Project
↓
Environment VariablesにNEXT_PUBLIC_LIFF_IDを設定
↓
Deploy
```

`NEXT_PUBLIC_APP_URL` は必要に応じて Vercel の本番 URL を設定してください。

## LINE Developers Console での設定方法

```text
LINE Developers Consoleを開く
↓
Providerを作成
↓
LINE Login Channelを作成
↓
LIFFを追加
↓
Endpoint URLにVercelのURLを設定
↓
発行されたLIFF IDをVercelの環境変数に設定
```

Endpoint URL の例:

```text
https://your-app.vercel.app
```

## 共有機能

「この集合先を共有」ボタンは、以下の順で共有方法を選びます。

1. LIFF 環境で `liff.shareTargetPicker()` が使える場合、LINE の友だちまたはグループに集合先と行き方を共有します。
2. LIFF ではなく `navigator.share` が使える場合、スマホの共有シートを開きます。
3. どちらも使えない場合、共有文をクリップボードにコピーします。

共有文には URL ではなく、選択した集合先への行き方を含めます。

LINE の友だち/グループ選択画面を出すには、LINE Developers Console 側で Share target picker を有効にしてください。無効な場合、LIFF 初期化が成功していても `liff.shareTargetPicker()` は使えません。

## URL による検索条件復元

検索後に「条件URLをコピー」を押すと、以下の状態を URL クエリに保存します。

- 行き先
- 各人の名前
- 各人の現在地
- 出発時刻
- 優先条件

共有された URL を開くと入力状態が復元され、自動で検索結果を表示します。

## 現在の経路計算について

現在は首都圏主要駅を中心にした簡易駅ネットワークで集合先候補を計算しています。実際の運行情報、乗換、徒歩、遅延、運賃などは考慮していません。

将来的には NAVITIME API、Google Routes API、公共交通オープンデータなどの経路 API に置き換える想定です。
