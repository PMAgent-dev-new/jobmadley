# 目標設計: RIDE JOB Metaカタログ求人アトリビューション（2026-09-17）

## 対象クライアント

- 株式会社PM Agent（RIDE JOB）
- 対象リポジトリ: `PMAgent-dev-new/jobmadley` / `PMAgent-dev-new/form_applicant`
- 対象Base:
  - RIDE JOB: app `NLyWbgTsfaLpIlsQBcijfcMWprd` / table `tblO0pPqFyHqpVcj`
  - 整備士: app `As9mbdBVwau6KNsqYLqjUPJspCf` / table `tblXcvtQJqoD2PIV`

## 目的

Metaカタログ広告から応募されたとき、広告でクリックした求人と、サイト内で実際に応募した求人を区別してLark通知とRIDE JOB Baseへ記録する。サイト内回遊で求人が変わった場合も、起点求人を失わない。

## 現状の一次確認

- カタログフィードのリンクは3系統ある。自社の通常求人は `/job/{id}`、自社の整備士は `/entry/mechanic?job_id={id}`、ハローワーク整備士は `/external-job/hellowork/{id}`へ着地する。
- 通常求人のフィードURLだけは `utm_content={job_id}&utm_source=meta&utm_medium=catalog` を持つ。整備士2系統はMeta広告側の `url_tags` にUTMを一本化しており、商品URLには固定UTMを持たない。
- `rj_attr` Cookieは `utm_content` を保持するが、応募payloadは `utm_content` を送らない。
- `rj_attr` Cookieは `jobmadley` と `form_applicant` が共有する。新しいフィールドを両方で保持しないと回遊時に消える。
- 応募payloadは応募時点の `jobId` / `jobName` / `companyName` を送るため、実際の応募求人は分かる。
- RIDE JOB Baseは81列、整備士Baseは76列で、いずれも `utm_content` はあるが、「広告で見た求人」と「実際に応募した求人」を分ける列はない。
- `jobmadley` は社内通知を先に完了し、その後Base/メール/SMS/CAPIを並列実行する。`form_applicant` は通知とBase等を並列実行する。共通応募に応募単位の冪等キーと通知済み状態はない。

## 完了条件

1. 3系統すべてのカタログリンクに専用の `catalog_job_id={job_id}` が入る。通常求人の既存 `utm_content={job_id}` は後方互換として残し、整備士2系統に固定UTMは追加しない。
2. Meta catalog流入だけをカタログ接触として取得し、Cookieにクリック求人ID・時刻・ランディングパスを保存する。
3. 応募時に `catalogJobId` / `catalogClickedAt` / `utmContent` と、安定した `submissionId` をAPIへ渡す。
4. APIは応募求人IDとカタログ求人IDを検証し、`same_job` / `changed_job` / `missing` / `stale` / `invalid` を判定する。自社求人はmicroCMS、外部求人はSupabase公開ビューで存在とカタログ対象を再検証する。整備士直接フォームは同一URL上の `job_id` と専用マーカーの一致を検証する。
5. Lark通知で「広告で見た求人」と「実際に応募した求人」を区別して表示する。
6. 整備士Baseは専用7列へ、RIDE JOB Baseは既存の `対応履歴メモ` に固定キー付きの構造化行として、応募求人ID、広告クリック求人ID・求人名、クリック日時、一致判定、submission ID、通知済み状態を保存する。
7. 同じsubmission IDの再送でBaseが増えず、通知済みなら通知を重複送信しない。Baseの `client_token` を使い、検索→作成の競合も同じ1件に畳む。
8. Meta以外、通常広告、自然検索、改ざんIDをカタログ応募へ誤分類しない。
9. 単体・ルート統合・lint・型検査・production buildを通す。
10. 整備士Baseの追加項目をAPIで読み戻し、両Baseの保存形式をテストレコードで読み戻す。APIに削除権限がないBaseでは、削除対象であることを明記して記録する。
11. main反映後のproduction deployment、実ドメイン、healthを実測する。

## スコープ外

- Meta広告キャンペーン・広告セット・予算の変更
- カタログ商品セットの再編
- 過去応募への遡及補完
- 別端末・Cookie削除後の個人横断アトリビューション
- 新しい外部サービス・有料リソースの作成

## 戻し方

- コードはPR #125 / #89 / #126を影響範囲に応じてrevertする。Vercelはmainのrevertをproductionへ自動反映し、直前deploymentへ戻す場合は対象3プロジェクトの既存Ready deploymentをpromoteする。
- Baseの追加列は後方互換なので即削除せず、revert後に利用0件を確認してから削除する。
- 整備士Baseの本番E2Eレコードは作成時のrecord IDで削除済み。RIDE JOB Baseの `recvvsC9UEEdeK` は現行アプリに削除権限がないため、PM AgentのLark Base管理者が手動削除するか、既存アプリへレコード削除権限を付与した後に削除し、submission IDの0件確認まで行う。それまでは氏名 `E2Eテスト（削除対象）` の非実応募レコードとして隔離する。
- Meta即時取込operation自体はStorageを書き換えない。取込結果を戻す必要がある場合は、既存 `restore_latest_snapshot` operationで直前の検証済みStorage snapshotを復元し、同workflow内のMeta再取込・件数照合まで完了させる。
- Vercelへ追加したLark環境変数は旧コードでは参照されないため、コードrevert時に即削除しない。削除する場合は3プロジェクトの旧deploymentへ戻ったことと通知経路の利用0件を確認してから行う。

## 判断ログ

- 2026-09-17／ユーザー判断: 「進めて」。提示した推奨案の実装を開始する。
- 2026-09-17／Astra判断: 「広告で見た求人」と「実際に応募した求人」は別概念として保存する。同一列へ上書きしない。
- 2026-09-17／Astra判断: 専用 `catalog_job_id` を正本とする。旧自社求人の `utm_medium=catalog` / `utm_content=求人ID` のみ後方互換フォールバックにし、広告名に `catalog` が含まれるだけでは採用しない。
- 2026-09-17／Astra判断: 既存 `rj_attr` Cookieを拡張し、新規Cookieや外部ストレージは増やさない。
- 2026-09-17／Astra判断: attributionの有効期間は現行APIの古さ警告と揃えて7日とし、生値は既存どおり90日保持する。
- 2026-09-17／Astra判断: 別作業中のcheckoutを汚さないため、`origin/main`から専用worktree `/tmp/ridejob-meta-catalog-attribution` を使用する。
- 2026-09-17／Astra判断: レビュー指摘を一次データで再検証し、自社整備士の直接フォームを覆うため `form_applicant` を対象に追加する。専用worktreeは `/tmp/ridejob-form-meta-catalog-attribution`。
- 2026-09-17／Astra判断: `catalog_job_id` のみではMeta流入として保存しない。同一着地の `utm_source` がMeta系かつ `utm_medium` が `catalog` / `ad` / `cpc` / `paid_social`、または `fbclid` がある場合に限る。
- 2026-09-17／Astra判断: Cookieの時刻は改ざん可能な計測情報として扱い、APIで無効値・未来値・7日超過を除外する。認証トークンには使わない。
- 2026-09-17／Astra判断: 通知重複防止はBase先行upsert→Lark API通知→通知済み更新とする。Larkにはsubmission ID全文のSHA-256由来uuidを渡し、送信結果不明時や通知済み書き戻し失敗時は503を返して同一uuidで安全に再送する。
- 2026-09-17／Astra判断: 同時到着の敗者は先着の通知済み状態を3秒待つ。30秒以内の未通知レコードは処理中として副作用を起こさず503にし、先着失敗時は30秒後の再送が引き継ぐ。
- 2026-09-17／Astra判断: Larkのuuid重複排除期限（1時間）を越えた自動再送を防ぐため、未確定通知の自動復旧は55分未満に限定する。復旧時は通知済み印の確定後、未実行のメール・SMS・CAPIも完了させる。
- 2026-09-17／Astra判断: 整備士Baseは既存のMetaリード連携アプリが列追加権限を持つため専用7列を作成する。RIDE JOB Baseは既存アプリが行作成・更新権限のみで列追加は403のため、`対応履歴メモ` の `[submission_id:...]` / `[lark_notified:...]` マーカーと構造化行を正本にする。権限不足で応募受付を止めないため。
- 2026-09-17／Astra判断: Vercel本番の `jobmadley` / `ridejob-form` / `ridejob-entry` に、既存のRIDE JOB・整備士Larkアプリ資格情報と通知先chat IDを設定する。新規アプリは作らない。
- 2026-09-17／Astra判断: 公開済みフィードをMetaへ即時再取得させる専用workflow operationを追加する。Meta API呼出し前に公開フィードのbyte数・SHA-256を公開完了マーカーと照合し、不一致時は無変更で停止する。

## 計画レビュー

- 事実確認: カタログURLが3系統あること、整備士は別アプリ/別Baseであること、通知とBaseの現行実行順をコードとBase APIで再確認し、本設計に反映した。
- 抜け漏れ／影響: 共有Cookieの未知フィールド保持、Meta判定条件、未来日時、応募求人とクリック求人の別、Base先行upsertを実装条件に追加した。
- 実装後レビュー: 読み取り専用Reviewer 2本で、LIFT JOB healthゲート後退、長いsubmission IDのuuid衝突、通常Meta広告の誤分類、復旧期限超過時の二重通知、担当者メモ上書き、LIFT JOB同時通知競合を検出。一次コードとAPI仕様を再確認し、各修正と回帰テストを反映した。
- Meta即時取込レビュー: 読み取り専用Reviewerが公開完了マーカーと実フィードの照合不足を検出。Meta POST前のbyte数・SHA-256ゲートと回帰テストを追加し、修正後の独立2観点レビューでCritical/High/Mediumなしを確認した。

## 保留

- 判断者: PM Agent開発管理者。`pmagent-dev-new` teamの `jobmadley` / `ridejob-form` / `ridejob-entry` を読み取り・rollbackできる恒久Vercel tokenを発行し、`PMAgent-dev-new/form_applicant` のRepository Secret `VERCEL_TOKEN` を更新する必要がある。
- 現状: 既存Secretはteam scopeへアクセスできず、post-deploy guard本番run `35202295743` だけ失敗する。実際の3 production deploymentと認証付きhealthは別経路で成功を実測済み。ローカルのVercel認証は2026-09-18 01:55:39 JSTに失効する短期tokenのため、無音停止を避けてSecretへ転用しなかった。
- 更新後の合格条件: `post-deploy-guard` workflowをmain・`mode=guard`・`force_unhealthy=false` で再実行し、3プロジェクトが対象main SHAのReady deployment、3つのhealth確認が成功、run全体がsuccessになること。

## 仮決め

- なし。

## 実行モデル

- Astra（Codex本体）: 設計、判断、実装、Base変更、git操作、検証、デプロイ確認。
- Reviewer相当: `codex exec -s read-only` を事実確認と抜け漏れ・影響の2観点で別々に実行する。

## 実測結果

- 整備士Baseの追加7列をAPIで作成・読み戻し、名称と型が7/7一致することを確認。
- Vercel本番3プロジェクトでRIDE JOB・整備士の認証情報8項目と通知先chat ID 2項目がEncrypted / Productionとして存在することを読み戻し。
- Lark IM APIに同一uuidでテスト送信し、2回目が同一message IDとなることを実測。テストメッセージは削除済み。
- Lark Baseの `client_token` は2回目がcode 1254608を返す仕様を実測し、再検索で先着レコードを取得する実装とテストを追加。整備士テストレコードは削除済み。
- RIDE JOB Baseテストレコード `recvvsC9UEEdeK` で構造化7項目を読み戻し、7/7一致を確認。同アプリ資格情報には削除権限がないため、氏名を `E2Eテスト（削除対象）` として残置した。
- `jobmadley`: Vitest 23ファイル165件、カタログフィード65件、TypeScript、lint（0 error / 既存2 warning）、production build 56ページが通過。
- `form_applicant`: Vitest 15ファイル241件、post-deploy guard 9件、TypeScript、lint（0 error / 既存5 warning）、production build 27ページが通過。
- 応募アトリビューション本体は `jobmadley` PR [#125](https://github.com/PMAgent-dev-new/jobmadley/pull/125)（merge commit `f9f2a8736cb8f5d6697bceb0c895201a6df1b1e7`）と `form_applicant` PR [#89](https://github.com/PMAgent-dev-new/form_applicant/pull/89)（merge commit `032d0a194e924327e540980ce1b3bd550c8e664e`）でmainへ反映。
- Meta即時取込operationと事前整合ゲートは `jobmadley` PR [#126](https://github.com/PMAgent-dev-new/jobmadley/pull/126)（merge commit `090cd745442d6f7aa63c5c0e4ce657e58ff95321`）でmainへ反映。
- Vercel productionは `jobmadley-xeo0twgh9-pmagent-dev-new.vercel.app`、`ridejob-form-fnn3hrr36-pmagent-dev-new.vercel.app`、`ridejob-entry-hxg7n4sj9-pmagent-dev-new.vercel.app` がReady。`https://ridejob.jp/`、`https://ridejob.pmagent.jp/mechanic`、`https://ridejob-entry.vercel.app/entry/mechanic` は再実測でHTTP 200。認証付き `/api/health` はRIDE JOB・整備士とも `ready`。
- GitHub main CIは `jobmadley` run `35202295543`、`form_applicant` run `35202296007` が成功。Meta即時取込追加PRのCI run `35205100741` も成功。
- 本番カタログ再公開workflow [run 35202694905](https://github.com/PMAgent-dev-new/jobmadley/actions/runs/35202694905) が成功。公開フィードは9,067件で、3系統を含む9,067件すべてのリンクに `catalog_job_id` が存在することを公開URLから実測。
- Meta即時取込workflow [run 35205326408](https://github.com/PMAgent-dev-new/jobmadley/actions/runs/35205326408) が成功。upload ID `1802015484444101`、検出9,067件、有効9,060件、無効7件で、検出数＝有効数＋無効数、無効上限9件以内、Metaカタログ商品数9,060件を自動照合済み。
- `form_applicant` post-deploy guard run `35202295743` は、GitHub SecretのVercel tokenがscopeへアクセスできず失敗。guardの単体テスト9件、実deployment Ready、実ドメイン、認証付きhealthは成功しており、アプリ反映失敗ではない。

## 完了条件の判定

1. 達成 — 本番フィード9,067件すべてに `catalog_job_id` を実測。
2. 達成 — Meta catalog明示マーカー＋Meta UTMまたはfbclidだけを取得するテストが通過。
3. 達成 — attribution 3項目と安定したsubmission IDのpayload連携を両アプリで確認。
4. 達成 — 求人存在・対象可否と5判定のAPI検証・テストが通過。
5. 達成 — 通知整形・ルートテストで「広告で見た求人」と「実際に応募した求人」の別ラベル・別値を確認し、Lark API smoke testで配信成功と同一uuid再送の同一message IDを実測。
6. 達成 — 整備士Base専用7列とRIDE JOB Base構造化7項目を各7/7読み戻し。
7. 達成 — Base先行upsert、通知済みmarker、同一submission同時実行・復旧期限の回帰テストが通過。
8. 達成 — Meta以外・通常広告・自然検索・改ざんIDの非該当テストが通過。
9. 達成 — 両リポジトリの単体・統合・lint・型検査・production buildが通過。
10. 達成 — 両Baseの本番E2E読戻しを実施。削除権限のある整備士レコードは削除、RIDE JOBレコードは削除対象表記で残置。
11. 達成 — main反映、3 production deployment Ready、実ドメインHTTP 200、認証付きhealth readyを実測。

応募アトリビューションと本番反映の11条件は達成。別系統のpost-deploy guard用Vercel token更新だけを上記「保留」に分離する。
