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

- コードはPR単位でrevertする。
- Baseの追加列は後方互換なので即削除せず、revert後に利用0件を確認してから削除する。
- 本番E2Eレコードは作成時のrecord IDで削除し、submission IDの0件確認まで行う。

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

## 計画レビュー

- 事実確認: カタログURLが3系統あること、整備士は別アプリ/別Baseであること、通知とBaseの現行実行順をコードとBase APIで再確認し、本設計に反映した。
- 抜け漏れ／影響: 共有Cookieの未知フィールド保持、Meta判定条件、未来日時、応募求人とクリック求人の別、Base先行upsertを実装条件に追加した。
- 実装後レビュー: 読み取り専用Reviewer 2本で、LIFT JOB healthゲート後退、長いsubmission IDのuuid衝突、通常Meta広告の誤分類、復旧期限超過時の二重通知、担当者メモ上書き、LIFT JOB同時通知競合を検出。一次コードとAPI仕様を再確認し、各修正と回帰テストを反映した。

## 保留

- なし。

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
- `jobmadley`: Vitest 23ファイル165件、カタログフィード64件、TypeScript、lint（0 error / 既存2 warning）、production build 56ページが通過。
- `form_applicant`: Vitest 15ファイル241件、post-deploy guard 9件、TypeScript、lint（0 error / 既存5 warning）、production build 27ページが通過。
- main反映、production deployment、実ドメイン、フィード再公開は後続検証中。
