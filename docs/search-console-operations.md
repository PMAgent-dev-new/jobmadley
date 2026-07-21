# Search Console 運用手順（5xx対策）

## 1. 監視対象
- `/`
- `/search`
- `/job/*`
- `GET /sitemap.xml`
- `GET /robots.txt`

## 2. 監視メトリクス
- 5xx 率
- レスポンスタイム（p95）
- microCMS リクエスト失敗率
- 外部Webhook失敗率（応募API/問い合わせAPI）

## 3. 障害発生時の一次切り分け
1. Vercel の Function Logs を確認し、失敗URLを特定
2. ログ内の `[microCMS:*]` で失敗箇所を特定
3. 環境変数不足の場合は `[microCMS:config]` ログを確認
4. 外部Webhook失敗（502）は対象Webhookの疎通を確認

## 4. Search Console 再検証順
1. サーバーエラー (5xx)
2. 重複（canonical関連）
3. noindex 除外
4. 404 / ソフト404

## 5. デプロイ後の確認
- `https://ridejob.jp/robots.txt`
- `https://ridejob.jp/sitemap.xml`
- URL検査: `/job/{id}` がユーザー指定 canonical として認識されること
- URL検査: `/search?...` が noindex で除外されること

## 6. 職種カテゴリを microCMS に追加したときの手順

新しい職種カテゴリ（jobcategories）を追加すると、新しいハブURL `/jobs/{県}/{職種}` が
sitemap に載る一方で、ページ側が最大2時間ほど404を返すことがある。原因は
microCMS fetch キャッシュ →`getHubData`（unstable_cache）→ ルートのISR の3層が、
それぞれ独立した1時間TTLで stale-while-revalidate するため
（詳細は `src/features/hub/lib/hub.ts` の `getHubData` のコメント）。
即時反映の仕組みは意図的に持たない方針なので、次の順で運用する。

1. microCMS でカテゴリを登録する（slug 必須。slug が無いカテゴリはハブ生成対象外）。
2. 登録直後は新ハブURLを踏まない。古いマスタで描画された404がISRに焼き付き、
   データが新しくなっても404が残ることがある。
3. 2時間ほど置いてから新ハブURL（例 `https://ridejob.jp/jobs/tokyo/{職種slug}`）を開き、
   200で本文が表示されることを確認する。
4. 併せて `https://ridejob.jp/sitemap.xml` に新URLが含まれることを確認する。
5. Search Console の URL 検査 →「インデックス登録をリクエスト」を実行する。
6. どうしても即時反映したい場合のみ、Vercel で既存キャッシュを使わない再デプロイを行う。
   通常の再デプロイでは Data Cache（fetch / unstable_cache）が残るため確実ではない。
