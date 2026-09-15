// 応募者向け自動返信メールの組み立て。
// 求人種別で差出人名・From/Reply-To・件名・本文を出し分ける。
// 優先順: cpone → mechanic → pmagent → default
//   - cpone:   companyName に「CP One Japan」を含む
//   - mechanic: applyEmail = ridejob.mechanic@pmagent.jp（JobClassification.isMechanic）
//   - pmagent: companyName に「PM Agent」を含む
//   - default: 上記いずれにも該当しない総当たり

import type { JobClassification } from "@/shared/lark/routing"
import type { MailMessage } from "@/shared/mail/gmail"

// ridejob@pmagent.jp は support_team@pmagent.jp のエイリアスのため impersonate 不可。
// 本体ユーザー（support_team@）を impersonate し、From は ridejob@ を使う。
const RIDEJOB_FROM = "ridejob@pmagent.jp"
const RIDEJOB_IMPERSONATE = "support_team@pmagent.jp"
// ridejob.mechanic@ は実ユーザーのため impersonate=From で同一。
const MECHANIC_FROM = "ridejob.mechanic@pmagent.jp"
const MECHANIC_IMPERSONATE = "ridejob.mechanic@pmagent.jp"

export interface ApplicantMailInput {
  /** 応募者メールアドレス（呼び出し側で有効性を確認済みであること） */
  email: string
  /** 応募者氏名（姓+名 など。空でも可） */
  name?: string
  companyName?: string
  jobName?: string
  intent?: "apply" | "consult"
}

type ProfileId = "cpone" | "mechanic" | "pmagent" | "default"

interface MailProfile {
  id: ProfileId
  fromName: string
  /** impersonate する実ユーザー（fromAddress がエイリアスの場合は本体） */
  impersonateUser: string
  fromAddress: string
  replyTo: string
  buildSubject: (company: string | undefined) => string
  buildText: (ctx: { greetingName: string; company: string | undefined; job: string | undefined }) => string
}

const company = (c: string | undefined) => (c && c.trim() ? c.trim() : undefined)

const PROFILES: Record<ProfileId, MailProfile> = {
  cpone: {
    id: "cpone",
    fromName: "株式会社PM Agent",
    impersonateUser: RIDEJOB_IMPERSONATE,
    fromAddress: RIDEJOB_FROM,
    replyTo: RIDEJOB_FROM,
    buildSubject: (c) =>
      c
        ? `【RIDE JOB】${c}へのご応募ありがとうございます（カジュアル面談のご案内）`
        : "【RIDE JOB】ご応募ありがとうございます（カジュアル面談のご案内）",
    buildText: ({ greetingName, company: c, job }) =>
      [
        `${greetingName}様`,
        "",
        `この度は、${c ?? "弊社取扱い求人"}${job ? `の${job}` : ""}へご応募ありがとうございます。`,
        "採用支援を行っております、株式会社PM Agentです。",
        "次のステップ（カジュアル面談）のご案内です。",
        "求人詳細のご説明と、ご希望条件をお伺いします。",
        "▼ご予約はこちら（先着順）",
        "https://leomeet.pmagent.jp/book/cpj",
        "（電話／オンライン可・服装自由・履歴書不要・30分）",
        "ご予約をお待ちしております。",
        "本メッセージはご応募後に自動送信しております。",
        "ご状況により、選考にお進みいただけない場合がございますのであらかじめご了承ください。",
        "＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊",
        "株式会社PM Agent",
        "TEL：03-6692-0477",
        "URL：https://pmagent.jp/",
        "＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊",
      ].join("\n"),
  },
  mechanic: {
    id: "mechanic",
    fromName: "ライドジョブメカニック採用担当",
    impersonateUser: MECHANIC_IMPERSONATE,
    fromAddress: MECHANIC_FROM,
    replyTo: MECHANIC_FROM,
    buildSubject: () => "【ライドジョブメカニック】ご応募ありがとうございます（面談日程のご案内）",
    buildText: ({ greetingName, job }) =>
      [
        `${greetingName} 様`,
        `この度は、${job ?? "ご応募の求人"} にご応募いただき、誠にありがとうございます。`,
        "選考に際して、事前に10～20分ほどお時間をいただき、webまたは電話面談をお願いしております。",
        "お手数ですが、以下のリンクより日程のご予約をお願いいたします。",
        "https://leomeet.pmagent.jp/book/mec",
        "また、ご応募内容を確認の上、下記の番号よりお電話させていただくことがございますので、ご了承ください。",
        "・03-6824-7476",
        "・070-9220-9305",
        "それでは、引き続きどうぞよろしくお願いいたします。",
      ].join("\n"),
  },
  pmagent: {
    id: "pmagent",
    fromName: "株式会社PM Agent",
    impersonateUser: RIDEJOB_IMPERSONATE,
    fromAddress: RIDEJOB_FROM,
    replyTo: RIDEJOB_FROM,
    buildSubject: () => "【株式会社PM Agent】ご応募ありがとうございます（書類選考のご案内）",
    buildText: ({ greetingName }) =>
      [
        `${greetingName} 様`,
        "",
        "この度はご応募いただき、誠にありがとうございます。",
        "株式会社PM Agentでございます。",
        "本求人につきましては、まずは書類選考からのご案内となります。",
        "お手数をおかけいたしますが、以下2点の書類を、Indeed内のメッセージ機能よりファイル添付にてお送りください。",
        "・履歴書",
        "・職務経歴書",
        "書類を確認のうえ、選考結果および次のステップについて改めてご連絡いたします。",
        "ご不明点がございましたら、本メッセージへお気軽にご返信くださいませ。",
        "株式会社PM Agent",
        "TEL：03-6692-0477",
        "URL：https://pmagent.jp/",
      ].join("\n"),
  },
  default: {
    id: "default",
    fromName: "株式会社PM Agent",
    impersonateUser: RIDEJOB_IMPERSONATE,
    fromAddress: RIDEJOB_FROM,
    replyTo: RIDEJOB_FROM,
    buildSubject: (c) =>
      c
        ? `【RIDE JOB】${c}へのご応募ありがとうございます（カジュアル面談のご案内）`
        : "【RIDE JOB】ご応募ありがとうございます（カジュアル面談のご案内）",
    buildText: ({ greetingName, company: c, job }) =>
      [
        `${greetingName}様`,
        "",
        `この度は、${c ?? "弊社取扱い求人"}${job ? `の${job}` : ""}へ`,
        "ご応募いただき、誠にありがとうございます。",
        "ご応募いただいた企業の応募の一時受付と入社サポートを行っております、",
        "株式会社PM Agentです。",
        "次のステップ（カジュアル面談）のご案内です。",
        "求人詳細のご説明と、ご希望条件をお伺いします。",
        "▼ご予約はこちら（先着順）",
        "https://leomeet.pmagent.jp/book/ride",
        "（電話／オンライン可・服装自由・履歴書不要・30分）",
        "ご予約をお待ちしております。",
        "＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊",
        "株式会社PM Agent",
        "RIDE JOB事務局",
        "TEL：03-6692-0477",
        "URL：https://pmagent.jp/",
        "＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊",
      ].join("\n"),
  },
}

/** 優先順 cpone → mechanic → pmagent → default でプロファイルを決定 */
const resolveProfile = ({ isCpOne, isMechanic, isPmAgent }: JobClassification): MailProfile => {
  if (isCpOne) return PROFILES.cpone
  if (isMechanic) return PROFILES.mechanic
  if (isPmAgent) return PROFILES.pmagent
  return PROFILES.default
}

/** 求人種別と応募情報から自動返信メールを組み立てる */
export const buildApplicantAutoReply = (
  classification: JobClassification,
  input: ApplicantMailInput,
): MailMessage => {
  const profile = resolveProfile(classification)
  const greetingName = input.name?.trim() ? input.name.trim() : "ご応募者"
  const c = company(input.companyName)
  const job = company(input.jobName)

  if (input.intent === "consult" && profile.id === "mechanic") {
    return {
      to: input.email,
      impersonateUser: profile.impersonateUser,
      fromAddress: profile.fromAddress,
      fromName: profile.fromName,
      replyTo: profile.replyTo,
      subject: "【ライドジョブメカニック】転職相談を受け付けました（面談日程のご案内）",
      text: [
        `${greetingName} 様`,
        `この度は、${job ?? "掲載求人"}についてRIDE JOBへご相談いただき、誠にありがとうございます。`,
        "ご希望条件や求人の詳細を確認するため、10～20分ほどwebまたは電話でお話を伺います。",
        "これはハローワークへの直接応募ではありません。ご相談後、応募をご希望の場合は手続きをご案内します。",
        "お手数ですが、以下のリンクより日程のご予約をお願いいたします。",
        "https://leomeet.pmagent.jp/book/mec",
        "また、ご相談内容を確認の上、下記の番号よりお電話させていただくことがございます。",
        "・03-6824-7476",
        "・070-9220-9305",
        "それでは、引き続きどうぞよろしくお願いいたします。",
      ].join("\n"),
    }
  }

  return {
    to: input.email,
    impersonateUser: profile.impersonateUser,
    fromAddress: profile.fromAddress,
    fromName: profile.fromName,
    replyTo: profile.replyTo,
    subject: profile.buildSubject(c),
    text: profile.buildText({ greetingName, company: c, job }),
  }
}

/** RFC 5322 を厳密には判定しない軽量バリデーション。送信スキップ判定に使用。 */
export const isValidEmail = (email: string | undefined | null): email is string =>
  typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
