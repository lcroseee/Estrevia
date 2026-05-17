import 'server-only';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import WelcomeEmail from '@/emails/WelcomeEmail';
import PurchaseConfirmationEmail from '@/emails/PurchaseConfirmationEmail';
import SubscriptionCanceledEmail from '@/emails/SubscriptionCanceledEmail';
import AccountDeletionEmail from '@/emails/AccountDeletionEmail';
import ReEngagementEmail from '@/emails/ReEngagementEmail';
import TrialEndingEmail from '@/emails/TrialEndingEmail';
import LeadChartEmail from '@/emails/LeadChartEmail';
import LeadMoonAscEmail from '@/emails/LeadMoonAscEmail';
import LeadPaywallTeaserEmail from '@/emails/LeadPaywallTeaserEmail';
import { tryInsertOneShot, recordSent } from './sent-emails';
import { tryInsertOneShotLead, recordSentLead } from './sent-lead-emails';
import { signUnsubscribeToken, signLeadUnsubscribeToken } from './unsubscribe-token';
import type { ChartResult } from '@/shared/types';
import { Planet } from '@/shared/types';

const FROM_ADDRESS = 'Estrevia <hello@estrevia.app>';
const SITE_URL = 'https://estrevia.app';
const SUPPORT_INBOX = 'hello@estrevia.app';

// Lazy initialization — Resend throws if API key is missing.
// We defer until first send so build succeeds without RESEND_API_KEY.
let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY environment variable is not configured');
    }
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

const SUBJECTS = {
  welcome: {
    en: 'Welcome to Estrevia — your sidereal chart awaits',
    es: 'Bienvenido a Estrevia — tu carta sideral te espera',
  },
  purchase_confirmation: {
    en: 'Welcome to Estrevia Pro',
    es: 'Bienvenido a Estrevia Pro',
  },
  subscription_canceled: {
    en: 'Your Estrevia Pro subscription has been canceled',
    es: 'Tu suscripción a Estrevia Pro ha sido cancelada',
  },
  account_deletion: {
    en: 'Your Estrevia account has been deleted',
    es: 'Tu cuenta de Estrevia ha sido eliminada',
  },
  re_engagement: {
    en: 'Estrevia misses you — your chart is still here',
    es: 'Estrevia te extraña — tu carta sigue aquí',
  },
  trial_ending: {
    en: 'Your Estrevia Pro trial ends tomorrow',
    es: 'Tu prueba gratuita de Estrevia Pro termina mañana',
  },
  lead_chart: {
    en: 'Your sidereal chart is ready ✦',
    es: 'Tu carta sideral está lista ✦',
  },
  lead_moon_asc: {
    en: (moonSign: string | null) =>
      moonSign ? `Your Moon in ${moonSign} — what it means` : 'Your sidereal Moon — what it means',
    es: (moonSign: string | null) =>
      moonSign ? `Tu Luna en ${moonSign} — qué significa` : 'Tu Luna sideral — qué significa',
  },
  lead_paywall_teaser: {
    en: (sunSign: string | null) =>
      sunSign ? `The full reading for your ${sunSign} chart` : 'The full reading for your sidereal chart',
    es: (sunSign: string | null) =>
      sunSign ? `La lectura completa de tu carta ${sunSign}` : 'La lectura completa de tu carta sideral',
  },
};

const SETTINGS_URL = (locale: 'en' | 'es') =>
  `${SITE_URL}/${locale === 'es' ? 'es/' : ''}settings`;

// ---------------------------------------------------------------------------
// sendWelcomeEmail — one-shot, deduped via sent_emails UNIQUE index
// ---------------------------------------------------------------------------
export async function sendWelcomeEmail(params: {
  userId: string;
  email: string;
  locale: 'en' | 'es';
  hasSavedChart: boolean;
}): Promise<{ sent: boolean; reason?: string }> {
  // 1. DB-layer dedup (welcome is one-shot per user)
  const inserted = await tryInsertOneShot(params.userId, 'welcome');
  if (!inserted) return { sent: false, reason: 'already_sent' };

  // 2. Render
  const html = await render(
    WelcomeEmail({ locale: params.locale, hasSavedChart: params.hasSavedChart }),
  );
  const text = await render(
    WelcomeEmail({ locale: params.locale, hasSavedChart: params.hasSavedChart }),
    { plainText: true },
  );

  // 3. Send (Resend idempotencyKey = belt-and-suspenders; passed as second arg in SDK v6)
  const result = await getResend().emails.send(
    {
      from: FROM_ADDRESS,
      to: params.email,
      subject: SUBJECTS.welcome[params.locale],
      html,
      text,
      headers: {
        'List-Unsubscribe': `<${SETTINGS_URL(params.locale)}>`,
      },
    },
    { idempotencyKey: `${params.userId}:welcome` },
  );

  // 4. Record Resend message ID (best-effort)
  if (result.data?.id) {
    await recordSent(params.userId, 'welcome', result.data.id);
  }
  return { sent: true };
}

// ---------------------------------------------------------------------------
// sendPurchaseConfirmationEmail — repeatable (one per subscription cycle)
// ---------------------------------------------------------------------------
export async function sendPurchaseConfirmationEmail(params: {
  userId: string;
  email: string;
  locale: 'en' | 'es';
  plan: 'pro_monthly' | 'pro_annual';
  nextChargeDate: string;
  subscriptionId: string;
}): Promise<void> {
  const html = await render(
    PurchaseConfirmationEmail({
      locale: params.locale,
      plan: params.plan,
      nextChargeDate: params.nextChargeDate,
    }),
  );
  const text = await render(
    PurchaseConfirmationEmail({
      locale: params.locale,
      plan: params.plan,
      nextChargeDate: params.nextChargeDate,
    }),
    { plainText: true },
  );
  const result = await getResend().emails.send(
    {
      from: FROM_ADDRESS,
      to: params.email,
      subject: SUBJECTS.purchase_confirmation[params.locale],
      html,
      text,
      headers: {
        'List-Unsubscribe': `<${SETTINGS_URL(params.locale)}>`,
      },
    },
    { idempotencyKey: `${params.userId}:purchase:${params.subscriptionId}` },
  );
  await recordSent(params.userId, 'purchase_confirmation', result.data?.id ?? null);
}

// ---------------------------------------------------------------------------
// sendSubscriptionCanceledEmail — repeatable (one per cancellation)
// ---------------------------------------------------------------------------
export async function sendSubscriptionCanceledEmail(params: {
  userId: string;
  email: string;
  locale: 'en' | 'es';
  accessEndDate: string;
  subscriptionId: string;
}): Promise<void> {
  const html = await render(
    SubscriptionCanceledEmail({ locale: params.locale, accessEndDate: params.accessEndDate }),
  );
  const text = await render(
    SubscriptionCanceledEmail({ locale: params.locale, accessEndDate: params.accessEndDate }),
    { plainText: true },
  );
  const result = await getResend().emails.send(
    {
      from: FROM_ADDRESS,
      to: params.email,
      subject: SUBJECTS.subscription_canceled[params.locale],
      html,
      text,
      headers: {
        'List-Unsubscribe': `<${SETTINGS_URL(params.locale)}>`,
      },
    },
    { idempotencyKey: `${params.userId}:cancel:${params.subscriptionId}` },
  );
  await recordSent(params.userId, 'subscription_canceled', result.data?.id ?? null);
}

// ---------------------------------------------------------------------------
// sendAccountDeletionEmail — one-shot (user is deleted right after)
// Note: do NOT recordSent — the user row cascade-deletes immediately after
// ---------------------------------------------------------------------------
export async function sendAccountDeletionEmail(params: {
  userId: string;
  email: string;
  locale: 'en' | 'es';
}): Promise<{ sent: boolean }> {
  const inserted = await tryInsertOneShot(params.userId, 'account_deletion');
  if (!inserted) return { sent: false };
  const html = await render(AccountDeletionEmail({ locale: params.locale }));
  const text = await render(AccountDeletionEmail({ locale: params.locale }), {
    plainText: true,
  });
  await getResend().emails.send(
    {
      from: FROM_ADDRESS,
      to: params.email,
      subject: SUBJECTS.account_deletion[params.locale],
      html,
      text,
    },
    { idempotencyKey: `${params.userId}:deletion` },
  );
  // Note: do NOT recordSent — the user row is being cascade-deleted right after this returns.
  return { sent: true };
}

// ---------------------------------------------------------------------------
// sendReEngagementEmail — marketing email with unsubscribe footer
// ---------------------------------------------------------------------------
export async function sendReEngagementEmail(params: {
  userId: string;
  email: string;
  locale: 'en' | 'es';
}): Promise<void> {
  const token = await signUnsubscribeToken(params.userId);
  const unsubscribeUrl = `${SITE_URL}/${params.locale === 'es' ? 'es/' : ''}unsubscribe?token=${token}`;
  const html = await render(ReEngagementEmail({ locale: params.locale, unsubscribeUrl }));
  const text = await render(ReEngagementEmail({ locale: params.locale, unsubscribeUrl }), {
    plainText: true,
  });
  const today = new Date().toISOString().slice(0, 10);
  const result = await getResend().emails.send(
    {
      from: FROM_ADDRESS,
      to: params.email,
      subject: SUBJECTS.re_engagement[params.locale],
      html,
      text,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    },
    { idempotencyKey: `${params.userId}:re_engagement:${today}` },
  );
  await recordSent(params.userId, 're_engagement_28d', result.data?.id ?? null);
}

// ---------------------------------------------------------------------------
// sendTrialEndingEmail — migrated from plaintext; repeatable per trial cycle
// ---------------------------------------------------------------------------
export async function sendTrialEndingEmail(params: {
  userId: string;
  email: string;
  locale: 'en' | 'es';
  trialEnd: Date;
}): Promise<void> {
  const html = await render(TrialEndingEmail({ locale: params.locale, trialEnd: params.trialEnd }));
  const text = await render(
    TrialEndingEmail({ locale: params.locale, trialEnd: params.trialEnd }),
    { plainText: true },
  );
  const result = await getResend().emails.send(
    {
      from: FROM_ADDRESS,
      to: params.email,
      subject: SUBJECTS.trial_ending[params.locale],
      html,
      text,
      headers: {
        'List-Unsubscribe': `<${SETTINGS_URL(params.locale)}>`,
      },
    },
    { idempotencyKey: `${params.userId}:trial:${params.trialEnd.toISOString()}` },
  );
  await recordSent(params.userId, 'trial_ending', result.data?.id ?? null);
}

// ---------------------------------------------------------------------------
// Lead nurture helpers
// ---------------------------------------------------------------------------
function pickKeySigns(chart: ChartResult | null): {
  sunSign: string | null;
  moonSign: string | null;
  ascSign: string | null;
} {
  if (!chart) return { sunSign: null, moonSign: null, ascSign: null };
  const sun = chart.planets.find((p) => p.planet === Planet.Sun);
  const moon = chart.planets.find((p) => p.planet === Planet.Moon);
  const hasHouses = Array.isArray(chart.houses) && chart.houses.length > 0;
  const ascSign = hasHouses ? chart.houses![0].sign : null;
  return {
    sunSign: sun?.sign ?? null,
    moonSign: moon?.sign ?? null,
    ascSign,
  };
}

// ---------------------------------------------------------------------------
// sendLeadChartEmail — T+0 nurture drip, one-shot per lead
// ---------------------------------------------------------------------------
export async function sendLeadChartEmail(params: {
  leadId: string;
  email: string;
  locale: 'en' | 'es';
  chart: ChartResult | null;
  chartId: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  // 1. Idempotency guard
  const inserted = await tryInsertOneShotLead(params.leadId, 'lead_chart');
  if (!inserted) return { sent: false, reason: 'already_sent' };

  // 2. Build unsubscribe URL with lead-kind token
  const token = await signLeadUnsubscribeToken(params.leadId);
  const unsubscribeUrl = `${SITE_URL}/${params.locale === 'es' ? 'es/' : ''}unsubscribe?token=${token}`;

  // 3. Derive personalization
  const signs = pickKeySigns(params.chart);
  const chartPath = params.chartId
    ? `/${params.locale === 'es' ? 'es/' : ''}chart?chartId=${params.chartId}&utm_source=lead-nurture&utm_campaign=t0`
    : `/${params.locale === 'es' ? 'es' : ''}?utm_source=lead-nurture&utm_campaign=t0`;
  const chartUrl = `${SITE_URL}${chartPath}`;

  // 4. Render
  const html = await render(LeadChartEmail({ locale: params.locale, ...signs, chartUrl }));
  const text = await render(LeadChartEmail({ locale: params.locale, ...signs, chartUrl }), { plainText: true });

  // 5. Send (Resend)
  const result = await getResend().emails.send(
    {
      from: FROM_ADDRESS,
      to: params.email,
      subject: SUBJECTS.lead_chart[params.locale],
      html,
      text,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    },
    { idempotencyKey: `${params.leadId}:lead_chart` },
  );

  await recordSentLead(params.leadId, 'lead_chart', result.data?.id ?? null);
  return { sent: true };
}

// ---------------------------------------------------------------------------
// sendLeadMoonAscEmail — T+24h nurture drip, one-shot per lead
// ---------------------------------------------------------------------------
export async function sendLeadMoonAscEmail(params: {
  leadId: string;
  email: string;
  locale: 'en' | 'es';
  chart: ChartResult | null;
  chartId: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  const inserted = await tryInsertOneShotLead(params.leadId, 'lead_moon_asc');
  if (!inserted) return { sent: false, reason: 'already_sent' };

  const token = await signLeadUnsubscribeToken(params.leadId);
  const unsubscribeUrl = `${SITE_URL}/${params.locale === 'es' ? 'es/' : ''}unsubscribe?token=${token}`;

  const signs = pickKeySigns(params.chart);
  const signupPath = `/${params.locale === 'es' ? 'es/' : ''}sign-up?redirect_url=${encodeURIComponent(
    `/${params.locale === 'es' ? 'es/' : ''}chart${params.chartId ? `?chartId=${params.chartId}` : ''}`,
  )}&utm_source=lead-nurture&utm_campaign=t24`;
  const signupUrl = `${SITE_URL}${signupPath}`;

  const html = await render(
    LeadMoonAscEmail({
      locale: params.locale,
      moonSign: signs.moonSign,
      ascSign: signs.ascSign,
      signupUrl,
    }),
  );
  const text = await render(
    LeadMoonAscEmail({
      locale: params.locale,
      moonSign: signs.moonSign,
      ascSign: signs.ascSign,
      signupUrl,
    }),
    { plainText: true },
  );

  const result = await getResend().emails.send(
    {
      from: FROM_ADDRESS,
      to: params.email,
      subject: SUBJECTS.lead_moon_asc[params.locale](signs.moonSign),
      html,
      text,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    },
    { idempotencyKey: `${params.leadId}:lead_moon_asc` },
  );

  await recordSentLead(params.leadId, 'lead_moon_asc', result.data?.id ?? null);
  return { sent: true };
}

// ---------------------------------------------------------------------------
// sendLeadPaywallTeaserEmail — T+72h nurture drip, one-shot per lead
// ---------------------------------------------------------------------------
export async function sendLeadPaywallTeaserEmail(params: {
  leadId: string;
  email: string;
  locale: 'en' | 'es';
  chart: ChartResult | null;
  chartId: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  const inserted = await tryInsertOneShotLead(params.leadId, 'lead_paywall_teaser');
  if (!inserted) return { sent: false, reason: 'already_sent' };

  const token = await signLeadUnsubscribeToken(params.leadId);
  const unsubscribeUrl = `${SITE_URL}/${params.locale === 'es' ? 'es/' : ''}unsubscribe?token=${token}`;

  const signs = pickKeySigns(params.chart);
  const returnPath = `/${params.locale === 'es' ? 'es/' : ''}chart${params.chartId ? `?chartId=${params.chartId}` : ''}`;
  const trialPath = `/${params.locale === 'es' ? 'es/' : ''}checkout/start?plan=pro_annual&return=${encodeURIComponent(returnPath)}&utm_source=lead-nurture&utm_campaign=t72`;
  const trialUrl = `${SITE_URL}${trialPath}`;

  const html = await render(
    LeadPaywallTeaserEmail({ locale: params.locale, ...signs, trialUrl }),
  );
  const text = await render(
    LeadPaywallTeaserEmail({ locale: params.locale, ...signs, trialUrl }),
    { plainText: true },
  );

  const result = await getResend().emails.send(
    {
      from: FROM_ADDRESS,
      to: params.email,
      subject: SUBJECTS.lead_paywall_teaser[params.locale](signs.sunSign),
      html,
      text,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    },
    { idempotencyKey: `${params.leadId}:lead_paywall_teaser` },
  );

  await recordSentLead(params.leadId, 'lead_paywall_teaser', result.data?.id ?? null);
  return { sent: true };
}

// ---------------------------------------------------------------------------
// Support email helpers — unchanged signatures, preserved for existing callers
// ---------------------------------------------------------------------------
interface SupportEmailParams {
  fromEmail: string;
  isPro: boolean;
  plan: string;
  subject: string;
  message: string;
  userId: string | null;
}

export function buildSupportEmailBody(params: SupportEmailParams): {
  subject: string;
  text: string;
} {
  const tag = params.isPro ? '[PRIORITY] ' : '[Support] ';
  const subject = `${tag}${params.subject}`;
  const text = [
    `From: ${params.fromEmail}`,
    `User ID: ${params.userId ?? 'anonymous'}`,
    `Plan: ${params.plan}`,
    `Pro: ${params.isPro ? 'YES' : 'no'}`,
    '',
    '----- Message -----',
    params.message,
  ].join('\n');
  return { subject, text };
}

export async function sendSupportEmail(params: SupportEmailParams): Promise<void> {
  const resend = getResend();
  const { subject, text } = buildSupportEmailBody(params);
  await resend.emails.send({
    from: FROM_ADDRESS,
    to: SUPPORT_INBOX,
    replyTo: params.fromEmail,
    subject,
    text,
  });
}
