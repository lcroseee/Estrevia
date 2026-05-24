import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import WelcomeEmail from '@/emails/WelcomeEmail';
import PurchaseConfirmationEmail from '@/emails/PurchaseConfirmationEmail';
import SubscriptionCanceledEmail from '@/emails/SubscriptionCanceledEmail';
import AccountDeletionEmail from '@/emails/AccountDeletionEmail';
import ReEngagementEmail from '@/emails/ReEngagementEmail';
import TrialEndingEmail from '@/emails/TrialEndingEmail';
import LeadChartEmail from '@/emails/LeadChartEmail';
import LeadCuriosityHookEmail from '@/emails/LeadCuriosityHookEmail';
import LeadMoonAscEmail from '@/emails/LeadMoonAscEmail';
import LeadPaywallTeaserEmail from '@/emails/LeadPaywallTeaserEmail';
import LeadPaywallTeaserBEmail from '@/emails/LeadPaywallTeaserBEmail';
import LeadPaywallTeaserCEmail from '@/emails/LeadPaywallTeaserCEmail';
import SaturnWeeklyEmail from '@/emails/SaturnWeeklyEmail';
import MiniReadingEmail from '@/emails/MiniReadingEmail';
import SynastryTeaserEmail from '@/emails/SynastryTeaserEmail';
import CartAbandonEmail from '@/emails/CartAbandonEmail';
import { PLANET_ES_NAMES } from './planet-i18n';
import { tryInsertOneShot, recordSent } from './sent-emails';
import { tryInsertOneShotLead, recordSentLead } from './sent-lead-emails';
import { hasCartAbandonSentRecently, recordCartAbandonSent } from './sent-cart-abandon-emails';
import { signUnsubscribeToken, signLeadUnsubscribeToken } from './unsubscribe-token';
import { trackServerEvent, AnalyticsEvent } from './analytics';
import { assignPaywallTeaserVariant, type PaywallTeaserVariant } from './abtest';
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
  // Variant B: personalized subject with dominant planet
  lead_paywall_teaser_B: {
    en: (sunSign: string | null, planet: string, sign: string) =>
      sunSign
        ? `Your ${sunSign} chart has a reading waiting — ${planet} in ${sign} caught our attention`
        : `Your sidereal chart has a reading waiting — ${planet} in ${sign} caught our attention`,
    es: (sunSign: string | null, planet: string, sign: string) =>
      sunSign
        ? `Tu carta ${sunSign} tiene una lectura esperándote — ${planet} en ${sign} llamó nuestra atención`
        : `Tu carta sideral tiene una lectura esperándote — ${planet} en ${sign} llamó nuestra atención`,
  },
  // Variant C: personalized + 20% discount urgency in subject
  lead_paywall_teaser_C: {
    en: (sunSign: string | null, planet: string, sign: string) => {
      const base = sunSign
        ? `Your ${sunSign} chart has a reading waiting — ${planet} in ${sign} caught our attention`
        : `Your sidereal chart has a reading waiting — ${planet} in ${sign} caught our attention`;
      return `${base} — 20% off, 48h only`;
    },
    es: (sunSign: string | null, planet: string, sign: string) => {
      const base = sunSign
        ? `Tu carta ${sunSign} tiene una lectura esperándote — ${planet} en ${sign} llamó nuestra atención`
        : `Tu carta sideral tiene una lectura esperándote — ${planet} en ${sign} llamó nuestra atención`;
      return `${base} — 20% de desc., solo 48h`;
    },
  },
  lead_saturn_weekly: {
    en: 'A weekly note about Saturn',
    es: 'Una nota semanal sobre Saturno',
  },
  lead_mini_reading: {
    en: 'Your sidereal mini-reading',
    es: 'Tu mini-lectura sideral',
  },
  lead_synastry_teaser: {
    en: 'Want to see your compatibility?',
    es: '¿Quieres ver tu compatibilidad?',
  },
  cart_abandon: {
    en: (name: string | null) =>
      name ? `${name}, you almost unlocked your full chart` : 'You almost unlocked your full chart',
    es: (name: string | null) =>
      name ? `${name}, casi desbloqueas tu carta completa` : 'Casi desbloqueas tu carta completa',
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
// pickDominantPlanet — selects one of Saturn/Mars/Venus/Mercury based on
// essential-dignity rules. Used in T+1h curiosity-hook email and as a tease
// hint in the T+0 chart email. Deterministic, no LLM, <1ms.
// ---------------------------------------------------------------------------
export function pickDominantPlanet(chart: ChartResult | null): {
  planet: 'Saturn' | 'Mars' | 'Venus' | 'Mercury';
  signName: string;
} {
  if (!chart) return { planet: 'Mercury', signName: 'Gemini' };

  const find = (p: Planet) => chart.planets.find((row) => row.planet === p);
  const saturn = find(Planet.Saturn);
  const mars = find(Planet.Mars);
  const venus = find(Planet.Venus);
  const mercury = find(Planet.Mercury);

  // Rule 1: Saturn in Capricorn or Aquarius (sidereal essential dignity)
  if (saturn && (saturn.sign === 'Capricorn' || saturn.sign === 'Aquarius')) {
    return { planet: 'Saturn', signName: saturn.sign };
  }
  // Rule 2: Mars in Aries or Scorpio (domicile)
  if (mars && (mars.sign === 'Aries' || mars.sign === 'Scorpio')) {
    return { planet: 'Mars', signName: mars.sign };
  }
  // Rule 3: Venus in Taurus or Libra (domicile)
  if (venus && (venus.sign === 'Taurus' || venus.sign === 'Libra')) {
    return { planet: 'Venus', signName: venus.sign };
  }
  // Rule 4: fallback to Mercury (messenger angle works generically)
  return {
    planet: 'Mercury',
    signName: mercury?.sign ?? 'Gemini',
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
  // 1. Idempotency guard. 'delivered' means a prior send wrote a resend
  // message id; 'new' is the first attempt; 'retry' picks up after a prior
  // attempt claimed the dedup slot but never completed (e.g. Resend rejected).
  const claim = await tryInsertOneShotLead(params.leadId, 'lead_chart');
  if (claim === 'delivered') return { sent: false, reason: 'already_sent' };

  console.info('[email/lead_chart] start', {
    leadId: params.leadId,
    chartIsNull: !params.chart,
  });

  // 2. Build unsubscribe URL with lead-kind token
  const token = await signLeadUnsubscribeToken(params.leadId);
  const unsubscribeUrl = `${SITE_URL}/${params.locale === 'es' ? 'es/' : ''}unsubscribe?token=${token}`;

  // 3. Derive personalization — T+0 cliffhanger reveals Sun only, hints
  // moon/asc presence (boolean), names the dominant planet without interp.
  const signs = pickKeySigns(params.chart);
  const dominant = pickDominantPlanet(params.chart);
  const chartPath = params.chartId
    ? `/${params.locale === 'es' ? 'es/' : ''}chart?chartId=${params.chartId}&utm_source=lead-nurture&utm_campaign=t0`
    : `/${params.locale === 'es' ? 'es' : ''}?utm_source=lead-nurture&utm_campaign=t0`;
  const chartUrl = `${SITE_URL}${chartPath}`;

  // 4. Render with cliffhanger props (moon/asc presence-only, dominant planet name-only)
  const emailProps = {
    locale: params.locale,
    sunSign: signs.sunSign,
    hasMoonSign: Boolean(signs.moonSign),
    hasAscSign: Boolean(signs.ascSign),
    dominantPlanet: dominant.planet,
    chartUrl,
  };
  const html = await render(LeadChartEmail(emailProps));
  const text = await render(LeadChartEmail(emailProps), { plainText: true });

  // 5. Send (Resend). Throw on `result.error` so the caller's try/catch
  // surfaces the failure via Sentry and the nurture-step state is NOT
  // advanced. The next cron pass picks the lead up again (claim returns
  // 'retry' because the dedup row exists without resend_message_id).
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
  console.info('[email/lead_chart] sent', {
    leadId: params.leadId,
    resendMessageId: result.data?.id ?? null,
    resendErrorName: result.error?.name ?? null,
  });
  if (result.error) {
    throw new Error(
      `Resend rejected lead_chart for ${params.leadId}: ${result.error.message ?? 'unknown'}`,
    );
  }

  await recordSentLead(params.leadId, 'lead_chart', result.data?.id ?? null);
  return { sent: true };
}

// ---------------------------------------------------------------------------
// sendLeadCuriosityHookEmail — T+1h nurture drip, one-shot per lead.
// Reveals one "dominant" planet's sign-level interpretation with a paywall
// CTA pointing to /chart (where ChartReadingSection paywall surface lives).
// ---------------------------------------------------------------------------
export async function sendLeadCuriosityHookEmail(params: {
  leadId: string;
  email: string;
  locale: 'en' | 'es';
  chart: ChartResult | null;
  chartId: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  const claim = await tryInsertOneShotLead(params.leadId, 'lead_curiosity_hook');
  if (claim === 'delivered') return { sent: false, reason: 'already_sent' };

  console.info('[email/lead_curiosity_hook] start', {
    leadId: params.leadId,
    chartIsNull: !params.chart,
  });

  const token = await signLeadUnsubscribeToken(params.leadId);
  const unsubscribeUrl = `${SITE_URL}/${params.locale === 'es' ? 'es/' : ''}unsubscribe?token=${token}`;

  const dominant = pickDominantPlanet(params.chart);
  const chartPath = params.chartId
    ? `/${params.locale === 'es' ? 'es/' : ''}chart?chartId=${params.chartId}&utm_source=lead-nurture&utm_campaign=t1h`
    : `/${params.locale === 'es' ? 'es' : ''}?utm_source=lead-nurture&utm_campaign=t1h`;
  const chartUrl = `${SITE_URL}${chartPath}`;

  const html = await render(
    LeadCuriosityHookEmail({
      locale: params.locale,
      planet: dominant.planet,
      signName: dominant.signName,
      chartUrl,
    }),
  );
  const text = await render(
    LeadCuriosityHookEmail({
      locale: params.locale,
      planet: dominant.planet,
      signName: dominant.signName,
      chartUrl,
    }),
    { plainText: true },
  );

  const subject =
    params.locale === 'es'
      ? `Tu ${PLANET_ES_NAMES[dominant.planet]} está haciendo algo poco común`
      : `Your ${dominant.planet} is doing something rare`;

  const result = await getResend().emails.send(
    {
      from: FROM_ADDRESS,
      to: params.email,
      subject,
      html,
      text,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    },
    { idempotencyKey: `${params.leadId}:lead_curiosity_hook` },
  );
  console.info('[email/lead_curiosity_hook] sent', {
    leadId: params.leadId,
    resendMessageId: result.data?.id ?? null,
    resendErrorName: result.error?.name ?? null,
  });
  if (result.error) {
    const err = new Error(
      `Resend rejected lead_curiosity_hook for ${params.leadId}: ${result.error.message ?? 'unknown'}`,
    );
    // Tag the error so Sentry groups by component + email type
    Sentry.captureException(err, {
      tags: {
        component: 'lead-nurture-curiosity-hook',
        email_type: 'lead_curiosity_hook',
        lead_id: String(params.leadId),
      },
    });
    throw err;
  }

  await recordSentLead(params.leadId, 'lead_curiosity_hook', result.data?.id ?? null);
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
  const claim = await tryInsertOneShotLead(params.leadId, 'lead_moon_asc');
  if (claim === 'delivered') return { sent: false, reason: 'already_sent' };

  console.info('[email/lead_moon_asc] start', {
    leadId: params.leadId,
    chartIsNull: !params.chart,
  });

  const token = await signLeadUnsubscribeToken(params.leadId);
  const unsubscribeUrl = `${SITE_URL}/${params.locale === 'es' ? 'es/' : ''}unsubscribe?token=${token}`;

  const signs = pickKeySigns(params.chart);
  // T+24h CTA now points to /chart (paywall surface), not /sign-up.
  // utm_campaign updated from t24 → t24h for consistency with t0/t1h naming.
  const chartPath = params.chartId
    ? `/${params.locale === 'es' ? 'es/' : ''}chart?chartId=${params.chartId}&utm_source=lead-nurture&utm_campaign=t24h`
    : `/${params.locale === 'es' ? 'es/' : ''}?utm_source=lead-nurture&utm_campaign=t24h`;
  const chartUrl = `${SITE_URL}${chartPath}`;

  const html = await render(
    LeadMoonAscEmail({
      locale: params.locale,
      moonSign: signs.moonSign,
      ascSign: signs.ascSign,
      chartUrl,
    }),
  );
  const text = await render(
    LeadMoonAscEmail({
      locale: params.locale,
      moonSign: signs.moonSign,
      ascSign: signs.ascSign,
      chartUrl,
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
  console.info('[email/lead_moon_asc] sent', {
    leadId: params.leadId,
    resendMessageId: result.data?.id ?? null,
    resendErrorName: result.error?.name ?? null,
  });
  if (result.error) {
    throw new Error(
      `Resend rejected lead_moon_asc for ${params.leadId}: ${result.error.message ?? 'unknown'}`,
    );
  }

  await recordSentLead(params.leadId, 'lead_moon_asc', result.data?.id ?? null);
  return { sent: true };
}

// ---------------------------------------------------------------------------
// sendLeadPaywallTeaserEmail — T+72h nurture drip, one-shot per lead
//
// A/B test variants (assigned at lead creation, stored in email_leads.paywall_teaser_variant):
//   A (control) — current template, no personalization
//   B — dominant-planet hook in subject + body headline
//   C — B + 20% off annual discount with 48h urgency
//
// Existing leads (NULL variant) default to 'A' and are excluded from analysis.
// ---------------------------------------------------------------------------
export async function sendLeadPaywallTeaserEmail(params: {
  leadId: string;
  email: string;
  locale: 'en' | 'es';
  chart: ChartResult | null;
  chartId: string | null;
  /** A/B test variant. NULL or undefined → treated as 'A' (pre-experiment leads). */
  variant?: PaywallTeaserVariant | null;
}): Promise<{ sent: boolean; reason?: string }> {
  const claim = await tryInsertOneShotLead(params.leadId, 'lead_paywall_teaser');
  if (claim === 'delivered') return { sent: false, reason: 'already_sent' };

  const variant: PaywallTeaserVariant = params.variant ?? 'A';

  console.info('[email/lead_paywall_teaser] start', {
    leadId: params.leadId,
    chartIsNull: !params.chart,
    variant,
  });

  const token = await signLeadUnsubscribeToken(params.leadId);
  const unsubscribeUrl = `${SITE_URL}/${params.locale === 'es' ? 'es/' : ''}unsubscribe?token=${token}`;

  const signs = pickKeySigns(params.chart);
  const returnPath = `/${params.locale === 'es' ? 'es/' : ''}chart${params.chartId ? `?chartId=${params.chartId}` : ''}`;
  const baseTrialPath = `/${params.locale === 'es' ? 'es/' : ''}checkout/start?plan=pro_annual&return=${encodeURIComponent(returnPath)}&utm_source=lead-nurture&utm_campaign=t72`;

  // Variant C: append coupon param when env var is configured.
  // Only allowlisted coupon name (TEASER20) is passed — never raw user input.
  const couponId = process.env.STRIPE_COUPON_TEASER20;
  const trialPath =
    variant === 'C' && couponId
      ? `${baseTrialPath}&coupon=TEASER20`
      : baseTrialPath;
  const trialUrl = `${SITE_URL}${trialPath}`;

  // Dominant planet data (used by variants B and C)
  const dominant = pickDominantPlanet(params.chart);
  const dominantPlanetEs = PLANET_ES_NAMES[dominant.planet as keyof typeof PLANET_ES_NAMES] ?? dominant.planet;
  // House number from planet position (null when birth time unknown)
  const dominantPlanetPosition = params.chart?.planets.find(
    (p) => p.planet === (dominant.planet as string),
  );
  const dominantHouse = dominantPlanetPosition?.house ?? null;

  // Build subject line by variant
  let subject: string;
  if (variant === 'B') {
    subject = SUBJECTS.lead_paywall_teaser_B[params.locale](
      signs.sunSign,
      params.locale === 'es' ? dominantPlanetEs : dominant.planet,
      dominant.signName,
    );
  } else if (variant === 'C') {
    subject = SUBJECTS.lead_paywall_teaser_C[params.locale](
      signs.sunSign,
      params.locale === 'es' ? dominantPlanetEs : dominant.planet,
      dominant.signName,
    );
  } else {
    subject = SUBJECTS.lead_paywall_teaser[params.locale](signs.sunSign);
  }

  // Build email template by variant
  const templateProps = {
    locale: params.locale,
    ...signs,
    trialUrl,
  };
  const bAndCProps = {
    ...templateProps,
    dominantPlanet: dominant.planet,
    dominantSign: dominant.signName,
    dominantHouse,
    dominantPlanetEs,
  };

  const template =
    variant === 'B'
      ? LeadPaywallTeaserBEmail(bAndCProps)
      : variant === 'C'
        ? LeadPaywallTeaserCEmail(bAndCProps)
        : LeadPaywallTeaserEmail(templateProps);

  const html = await render(template);
  const text = await render(template, { plainText: true });

  const result = await getResend().emails.send(
    {
      from: FROM_ADDRESS,
      to: params.email,
      subject,
      html,
      text,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    },
    { idempotencyKey: `${params.leadId}:lead_paywall_teaser` },
  );
  console.info('[email/lead_paywall_teaser] sent', {
    leadId: params.leadId,
    variant,
    resendMessageId: result.data?.id ?? null,
    resendErrorName: result.error?.name ?? null,
  });
  if (result.error) {
    throw new Error(
      `Resend rejected lead_paywall_teaser for ${params.leadId}: ${result.error.message ?? 'unknown'}`,
    );
  }

  await recordSentLead(params.leadId, 'lead_paywall_teaser', result.data?.id ?? null);

  // PostHog: tag the send with variant for experiment analysis.
  // distinctId = `lead_{id}` — consistent with leads route convention; never exposes email.
  try {
    trackServerEvent(
      `lead_${params.leadId}`,
      AnalyticsEvent.PAYWALL_TEASER_EMAIL_SENT,
      {
        experiment_variant: variant,
        locale: params.locale,
      },
    );
  } catch {
    // Non-fatal — analytics failure must not block email delivery
  }

  return { sent: true };
}

// ---------------------------------------------------------------------------
// sendLeadSaturnWeeklyEmail — T+7d nurture drip, one-shot per lead
// ---------------------------------------------------------------------------
export async function sendLeadSaturnWeeklyEmail(params: {
  leadId: string;
  email: string;
  locale: 'en' | 'es';
  chart: ChartResult | null;
  chartId: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  const claim = await tryInsertOneShotLead(params.leadId, 'lead_saturn_weekly');
  if (claim === 'delivered') return { sent: false, reason: 'already_sent' };

  console.info('[email/lead_saturn_weekly] start', {
    leadId: params.leadId,
    chartIsNull: !params.chart,
  });

  const token = await signLeadUnsubscribeToken(params.leadId);
  const unsubscribeUrl = `${SITE_URL}/${params.locale === 'es' ? 'es/' : ''}unsubscribe?token=${token}`;

  const chartPath = params.chartId
    ? `/${params.locale === 'es' ? 'es/' : ''}chart?chartId=${params.chartId}&utm_source=lead-nurture&utm_campaign=t7d`
    : `/${params.locale === 'es' ? 'es' : ''}?utm_source=lead-nurture&utm_campaign=t7d`;
  const chartUrl = `${SITE_URL}${chartPath}`;

  const html = await render(
    SaturnWeeklyEmail({ locale: params.locale, chartUrl, unsubscribeUrl }),
  );
  const text = await render(
    SaturnWeeklyEmail({ locale: params.locale, chartUrl, unsubscribeUrl }),
    { plainText: true },
  );

  const result = await getResend().emails.send(
    {
      from: FROM_ADDRESS,
      to: params.email,
      subject: SUBJECTS.lead_saturn_weekly[params.locale],
      html,
      text,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    },
    { idempotencyKey: `${params.leadId}:lead_saturn_weekly` },
  );
  console.info('[email/lead_saturn_weekly] sent', {
    leadId: params.leadId,
    resendMessageId: result.data?.id ?? null,
    resendErrorName: result.error?.name ?? null,
  });
  if (result.error) {
    throw new Error(
      `Resend rejected lead_saturn_weekly for ${params.leadId}: ${result.error.message ?? 'unknown'}`,
    );
  }

  await recordSentLead(params.leadId, 'lead_saturn_weekly', result.data?.id ?? null);
  return { sent: true };
}

// ---------------------------------------------------------------------------
// sendLeadMiniReadingEmail — T+14d nurture drip, one-shot per lead
// ---------------------------------------------------------------------------
export async function sendLeadMiniReadingEmail(params: {
  leadId: string;
  email: string;
  locale: 'en' | 'es';
  chart: ChartResult | null;
  chartId: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  const claim = await tryInsertOneShotLead(params.leadId, 'lead_mini_reading');
  if (claim === 'delivered') return { sent: false, reason: 'already_sent' };

  console.info('[email/lead_mini_reading] start', {
    leadId: params.leadId,
    chartIsNull: !params.chart,
  });

  const token = await signLeadUnsubscribeToken(params.leadId);
  const unsubscribeUrl = `${SITE_URL}/${params.locale === 'es' ? 'es/' : ''}unsubscribe?token=${token}`;

  const signs = pickKeySigns(params.chart);
  const chartPath = params.chartId
    ? `/${params.locale === 'es' ? 'es/' : ''}chart?chartId=${params.chartId}&utm_source=lead-nurture&utm_campaign=t14d`
    : `/${params.locale === 'es' ? 'es' : ''}?utm_source=lead-nurture&utm_campaign=t14d`;
  const chartUrl = `${SITE_URL}${chartPath}`;

  const html = await render(
    MiniReadingEmail({
      locale: params.locale,
      sunSign: signs.sunSign,
      moonSign: signs.moonSign,
      ascSign: signs.ascSign,
      chartUrl,
      unsubscribeUrl,
    }),
  );
  const text = await render(
    MiniReadingEmail({
      locale: params.locale,
      sunSign: signs.sunSign,
      moonSign: signs.moonSign,
      ascSign: signs.ascSign,
      chartUrl,
      unsubscribeUrl,
    }),
    { plainText: true },
  );

  const result = await getResend().emails.send(
    {
      from: FROM_ADDRESS,
      to: params.email,
      subject: SUBJECTS.lead_mini_reading[params.locale],
      html,
      text,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    },
    { idempotencyKey: `${params.leadId}:lead_mini_reading` },
  );
  console.info('[email/lead_mini_reading] sent', {
    leadId: params.leadId,
    resendMessageId: result.data?.id ?? null,
    resendErrorName: result.error?.name ?? null,
  });
  if (result.error) {
    throw new Error(
      `Resend rejected lead_mini_reading for ${params.leadId}: ${result.error.message ?? 'unknown'}`,
    );
  }

  await recordSentLead(params.leadId, 'lead_mini_reading', result.data?.id ?? null);
  return { sent: true };
}

// ---------------------------------------------------------------------------
// sendLeadSynastryTeaserEmail — T+21d nurture drip, one-shot per lead
// ---------------------------------------------------------------------------
export async function sendLeadSynastryTeaserEmail(params: {
  leadId: string;
  email: string;
  locale: 'en' | 'es';
  chart: ChartResult | null;
  chartId: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  const claim = await tryInsertOneShotLead(params.leadId, 'lead_synastry_teaser');
  if (claim === 'delivered') return { sent: false, reason: 'already_sent' };

  console.info('[email/lead_synastry_teaser] start', {
    leadId: params.leadId,
    chartIsNull: !params.chart,
  });

  const token = await signLeadUnsubscribeToken(params.leadId);
  const unsubscribeUrl = `${SITE_URL}/${params.locale === 'es' ? 'es/' : ''}unsubscribe?token=${token}`;

  const synastryPath = `/${params.locale === 'es' ? 'es/' : ''}synastry?utm_source=lead-nurture&utm_campaign=t21d`;
  const synastryUrl = `${SITE_URL}${synastryPath}`;

  const html = await render(
    SynastryTeaserEmail({ locale: params.locale, synastryUrl, unsubscribeUrl }),
  );
  const text = await render(
    SynastryTeaserEmail({ locale: params.locale, synastryUrl, unsubscribeUrl }),
    { plainText: true },
  );

  const result = await getResend().emails.send(
    {
      from: FROM_ADDRESS,
      to: params.email,
      subject: SUBJECTS.lead_synastry_teaser[params.locale],
      html,
      text,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    },
    { idempotencyKey: `${params.leadId}:lead_synastry_teaser` },
  );
  console.info('[email/lead_synastry_teaser] sent', {
    leadId: params.leadId,
    resendMessageId: result.data?.id ?? null,
    resendErrorName: result.error?.name ?? null,
  });
  if (result.error) {
    throw new Error(
      `Resend rejected lead_synastry_teaser for ${params.leadId}: ${result.error.message ?? 'unknown'}`,
    );
  }

  await recordSentLead(params.leadId, 'lead_synastry_teaser', result.data?.id ?? null);
  return { sent: true };
}

// ---------------------------------------------------------------------------
// sendCartAbandonEmail — one-shot per lead per 90 days (frequency-capped).
// Side-channel email for leads who viewed the paywall but didn't convert.
// NOT a drip step — does NOT advance nurture_step.
// ---------------------------------------------------------------------------

/** Extracts a display-friendly first name from an email address, or null. */
function extractNameFromEmail(email: string): string | null {
  const local = email.split('@')[0];
  if (!local) return null;
  // Strip numbers and split on separator characters
  const cleaned = local.split(/[._\-+0-9]/)[0];
  if (!cleaned || cleaned.length < 2) return null;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

export async function sendCartAbandonEmail(params: {
  leadId: string;
  email: string;
  locale: 'en' | 'es';
  chart: ChartResult | null;
  chartId: string | null;
  checkoutClicks: number;
  posthogLastPaywallAt?: Date;
}): Promise<{ sent: boolean; reason?: string }> {
  // 1. Frequency cap: skip if sent within last 90 days
  const alreadySent = await hasCartAbandonSentRecently(params.leadId);
  if (alreadySent) return { sent: false, reason: 'already_sent' };

  console.info('[email/cart_abandon] start', {
    leadId: params.leadId,
    checkoutClicks: params.checkoutClicks,
  });

  // 2. Unsubscribe URL (lead-kind token)
  const token = await signLeadUnsubscribeToken(params.leadId);
  const unsubscribeUrl = `${SITE_URL}/${params.locale === 'es' ? 'es/' : ''}unsubscribe?token=${token}`;

  // 3. CTA URL with coupon + UTM
  const ctaPath = `/${params.locale === 'es' ? 'es/' : ''}pricing?coupon=ABANDON20&utm_source=cart-abandon&utm_medium=email&utm_campaign=cart-abandon-20off`;
  const ctaUrl = `${SITE_URL}${ctaPath}`;

  // 4. Extract Saturn sign for personalization (if chart available)
  const saturnPlanet = params.chart?.planets?.find((p) => p.planet === Planet.Saturn);
  const saturnSign = saturnPlanet?.sign ?? null;

  // 5. Subject — try to extract name from email for personalization
  const name = extractNameFromEmail(params.email);
  const subject = SUBJECTS.cart_abandon[params.locale](name);

  // 6. Render
  const emailProps = {
    locale: params.locale,
    saturnSign,
    checkoutClicks: params.checkoutClicks,
    ctaUrl,
    unsubscribeUrl,
  };
  const html = await render(CartAbandonEmail(emailProps));
  const text = await render(CartAbandonEmail(emailProps), { plainText: true });

  // 7. Send
  const result = await getResend().emails.send(
    {
      from: FROM_ADDRESS,
      to: params.email,
      subject,
      html,
      text,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    },
    { idempotencyKey: `${params.leadId}:cart_abandon` },
  );

  console.info('[email/cart_abandon] sent', {
    leadId: params.leadId,
    resendMessageId: result.data?.id ?? null,
    resendErrorName: result.error?.name ?? null,
  });

  if (result.error) {
    const err = new Error(
      `Resend rejected cart_abandon for ${params.leadId}: ${result.error.message ?? 'unknown'}`,
    );
    Sentry.captureException(err, {
      tags: {
        component: 'cart-abandon-cron',
        email_type: 'cart_abandon',
        lead_id: String(params.leadId),
      },
    });
    throw err;
  }

  // 8. Record send (frequency cap enforcement + audit)
  await recordCartAbandonSent(params.leadId, result.data?.id ?? null, {
    posthogLastPaywallAt: params.posthogLastPaywallAt,
    checkoutClicks: params.checkoutClicks,
  });

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
