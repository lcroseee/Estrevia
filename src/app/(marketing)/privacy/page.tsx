import type { Metadata } from 'next';
import { createMetadata } from '@/shared/seo';

export function generateMetadata(): Metadata {
  return createMetadata({
    title: 'Privacy Policy',
    description:
      'How Estrevia collects, uses, and protects your data. Birth data encrypted with AES-256-GCM. GDPR rights: access, rectification, deletion, export.',
    path: '/privacy',
  });
}

const EFFECTIVE_DATE = 'April 6, 2026';
const CONTACT_EMAIL = 'privacy@estrevia.app';
const RETENTION_TEMP_CHARTS = '7 days';
const RETENTION_SAVED_CHARTS = 'until account deletion';

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-16 sm:py-24">
      {/* Header */}
      <header className="mb-12">
        <p className="text-xs tracking-[0.2em] uppercase text-[#C8A84B]/70 mb-3">
          Legal
        </p>
        <h1
          className="text-3xl sm:text-4xl font-semibold text-white/95 mb-4"
          style={{ fontFamily: 'var(--font-crimson-pro)' }}
        >
          Privacy Policy
        </h1>
        <p className="text-sm text-white/40">
          Effective date: {EFFECTIVE_DATE}
        </p>
      </header>

      <div className="space-y-10 text-white/70 leading-relaxed">

        {/* Overview */}
        <Section title="Overview">
          <p>
            Estrevia is built on a privacy-first principle: your birth data is
            personal. We collect only what is necessary to provide the Service,
            encrypt sensitive data at rest, and give you full control over your
            information.
          </p>
        </Section>

        {/* 1. Data we collect */}
        <Section title="1. Data We Collect">
          <div className="space-y-5">
            <DataCategory
              label="Birth Data (PII)"
              badge="Encrypted"
              items={[
                'Date of birth',
                'Time of birth (optional — required for house calculations)',
                'Place of birth (city, country, coordinates)',
              ]}
              note={`Encrypted with AES-256-GCM before storage. The encryption key lives in Vercel's secret environment — it never touches the database.`}
            />

            <DataCategory
              label="Account Data"
              items={[
                'Email address (required to create an account)',
                'Authentication tokens managed by Clerk',
              ]}
            />

            <DataCategory
              label="Cosmic Passport Share Data"
              badge="Not PII"
              items={[
                'Sun sign, Moon sign, Ascendant sign',
                'Element, ruling planet, rarity percentage',
              ]}
              note="Share data contains derived astrological results only — never raw birth data."
            />

            <DataCategory
              label="Usage Data (Analytics)"
              badge="Anonymised"
              items={[
                'Pages visited, features used',
                'Chart calculation count',
                'Passport share events',
              ]}
              note="Collected only with your consent via cookie acceptance. Processed by PostHog (EU region)."
            />

            <DataCategory
              label="Payment Data"
              items={[
                'Billing information (card last 4 digits, expiry) — processed by Stripe',
                'Subscription status and plan',
              ]}
              note="We never store full card numbers. All payment processing is handled by Stripe, Inc."
            />
          </div>
        </Section>

        {/* 2. How we use data */}
        <Section title="2. How We Use Your Data">
          <ul className="list-disc list-outside ml-5 space-y-1.5 text-sm sm:text-base">
            <li>Calculate and store your natal charts</li>
            <li>Generate and display your Cosmic Passport</li>
            <li>Authenticate you via Clerk</li>
            <li>Process subscription payments via Stripe</li>
            <li>Send transactional emails (chart saved, subscription confirmation) via Resend</li>
            <li>Analyse product usage to improve the Service (with your consent)</li>
            <li>Monitor errors and performance via Sentry</li>
          </ul>
          <p className="text-sm sm:text-base mt-3">
            We do <strong className="text-white/85">not</strong> sell your data,
            use it for advertising targeting, or share it with data brokers.
          </p>
        </Section>

        {/* 3. Birth data encryption */}
        <Section title="3. Birth Data Encryption">
          <div className="rounded-lg border border-[#C8A84B]/20 bg-[#C8A84B]/5 px-5 py-4 space-y-3">
            <p>
              Birth date, time, and location are classified as personal data
              under GDPR. We protect this data with{' '}
              <strong className="text-white/85">AES-256-GCM encryption</strong>{' '}
              before it is written to the database.
            </p>
            <ul className="list-disc list-outside ml-5 space-y-1.5 text-sm">
              <li>Each record uses a unique IV (initialisation vector)</li>
              <li>Encryption key stored in Vercel environment variables — not in the database</li>
              <li>Decryption happens only at request time, inside secure server functions</li>
              <li>Decrypted data is never logged or stored in intermediate systems</li>
            </ul>
          </div>
        </Section>

        {/* 4. Third parties */}
        <Section title="4. Third-Party Services">
          <div className="space-y-4">
            <ThirdParty
              name="Clerk"
              purpose="Authentication and session management"
              link="https://clerk.com/privacy"
              data="Email, OAuth tokens"
            />
            <ThirdParty
              name="Stripe"
              purpose="Payment processing"
              link="https://stripe.com/privacy"
              data="Billing information, subscription events"
            />
            <ThirdParty
              name="PostHog"
              purpose="Product analytics (EU region)"
              link="https://posthog.com/privacy"
              data="Anonymised usage events — only with cookie consent"
            />
            <ThirdParty
              name="Neon"
              purpose="Serverless PostgreSQL database"
              link="https://neon.tech/privacy"
              data="Encrypted user data at rest"
            />
            <ThirdParty
              name="Vercel"
              purpose="Hosting and edge infrastructure"
              link="https://vercel.com/legal/privacy-policy"
              data="Request logs (IP, headers) — retained per Vercel policy"
            />
            <ThirdParty
              name="Resend"
              purpose="Transactional email delivery"
              link="https://resend.com/privacy"
              data="Email address, email content"
            />
            <ThirdParty
              name="Sentry"
              purpose="Error monitoring"
              link="https://sentry.io/privacy/"
              data="Error stack traces, anonymised user context"
            />
          </div>
        </Section>

        {/* 5. Data retention */}
        <Section title="5. Data Retention">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-2 pr-4 text-white/50 font-medium">Data</th>
                <th className="text-left py-2 text-white/50 font-medium">Retention</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <tr>
                <td className="py-2.5 pr-4 text-white/70">Temporary charts (no account)</td>
                <td className="py-2.5 text-white/70">{RETENTION_TEMP_CHARTS}</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 text-white/70">Saved charts (with account)</td>
                <td className="py-2.5 text-white/70">{RETENTION_SAVED_CHARTS}</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 text-white/70">Cosmic Passport share data</td>
                <td className="py-2.5 text-white/70">Until chart is deleted</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 text-white/70">Account data (email)</td>
                <td className="py-2.5 text-white/70">Until account deletion</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 text-white/70">Analytics events</td>
                <td className="py-2.5 text-white/70">12 months (PostHog default)</td>
              </tr>
            </tbody>
          </table>
        </Section>

        {/* 6. GDPR rights */}
        <Section title="6. Your Rights (GDPR)">
          <p>
            If you are in the European Economic Area or the United Kingdom, you
            have the following rights regarding your personal data:
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              { right: 'Access', desc: 'Request a copy of all data we hold about you.' },
              { right: 'Rectification', desc: 'Correct inaccurate personal data.' },
              { right: 'Deletion', desc: 'Delete your account and all associated data.' },
              { right: 'Export', desc: 'Download your data in machine-readable JSON.' },
              { right: 'Restriction', desc: 'Restrict processing of your data.' },
              { right: 'Objection', desc: 'Object to processing based on legitimate interests.' },
            ].map(({ right, desc }) => (
              <div
                key={right}
                className="rounded-md border border-white/8 bg-white/3 px-4 py-3"
              >
                <p className="text-xs font-semibold text-white/80 mb-1">{right}</p>
                <p className="text-xs text-white/50">{desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-2 text-sm sm:text-base">
            <p>
              <strong className="text-white/85">To export your data:</strong>{' '}
              <code className="text-[#C8A84B]/80 bg-white/5 px-1.5 py-0.5 rounded text-xs font-mono">
                GET /api/v1/user/data-export
              </code>{' '}
              (authenticated) — returns JSON with all charts and profile data.
            </p>
            <p>
              <strong className="text-white/85">To delete your account:</strong>{' '}
              Account Settings → Delete Account, or{' '}
              <code className="text-[#C8A84B]/80 bg-white/5 px-1.5 py-0.5 rounded text-xs font-mono">
                DELETE /api/v1/user/account
              </code>{' '}
              — permanently deletes all data with cascade.
            </p>
            <p>
              To exercise any other right, email{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-[#C8A84B] hover:text-[#E0C06A] underline underline-offset-2 transition-colors"
              >
                {CONTACT_EMAIL}
              </a>
              . We will respond within 30 days.
            </p>
          </div>
        </Section>

        {/* 7. Cookies */}
        <Section title="7. Cookies and Tracking">
          <p>
            We use cookies and localStorage for:
          </p>
          <ul className="list-disc list-outside ml-5 space-y-1.5 text-sm sm:text-base mt-2">
            <li>
              <strong className="text-white/85">Authentication</strong> — Clerk
              session tokens. Necessary for the Service to function. No consent
              required.
            </li>
            <li>
              <strong className="text-white/85">Analytics</strong> — PostHog
              client identifier (localStorage). Requires explicit consent via the
              cookie banner.
            </li>
          </ul>
          <p className="mt-3 text-sm sm:text-base">
            You can withdraw analytics consent at any time by clearing your
            browser&apos;s localStorage or contacting us. We do not use
            advertising cookies.
          </p>
        </Section>

        {/* 8. Data transfers */}
        <Section title="8. International Data Transfers">
          <p>
            Our analytics data (PostHog) is processed in the EU. Database
            infrastructure (Neon) may store data in the US. Where applicable,
            transfers are governed by Standard Contractual Clauses (SCCs)
            approved by the European Commission.
          </p>
        </Section>

        {/* 9. Children */}
        <Section title="9. Children's Privacy">
          <p>
            Only users aged 13 or older may create an account. We do not
            knowingly collect personal data directly from children under 13.
          </p>
          <p>
            <strong>Charts for family members.</strong> An adult account holder
            may enter a child&apos;s birth data (date, time, location) to
            calculate a natal chart. In this case the adult acts as the data
            controller for that information, is responsible for obtaining any
            required parental consent, and may delete or export the data at any
            time via{' '}
            <code className="px-1 py-0.5 rounded bg-white/8 text-[#C8A84B] text-xs">
              /settings
            </code>
            . Birth data is stored encrypted with AES-256-GCM and is never used
            to profile the child, serve advertising, or train AI models.
          </p>
          <p>
            If you believe a child has created their own account or that
            personal data of a minor has been collected without proper consent,
            contact us at{' '}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-[#C8A84B] hover:text-[#E0C06A] underline underline-offset-2 transition-colors"
            >
              {CONTACT_EMAIL}
            </a>{' '}
            and we will delete the data within 30 days.
          </p>
        </Section>

        {/* 10. Contact */}
        <Section title="10. Contact and Data Controller">
          <p>
            Estrevia operates as the data controller for personal data processed
            through the Service.
          </p>
          <p>
            Privacy enquiries, GDPR requests, and data breach reports:{' '}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-[#C8A84B] hover:text-[#E0C06A] underline underline-offset-2 transition-colors"
            >
              {CONTACT_EMAIL}
            </a>
          </p>
          <p>
            You also have the right to lodge a complaint with your local
            supervisory authority (e.g., ICO in the UK, CNIL in France).
          </p>
        </Section>

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal helper components
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2
        className="text-lg font-semibold text-white/85 mb-4"
        style={{ fontFamily: 'var(--font-crimson-pro)' }}
      >
        {title}
      </h2>
      <div className="space-y-3 text-sm sm:text-base">{children}</div>
    </section>
  );
}

function DataCategory({
  label,
  badge,
  items,
  note,
}: {
  label: string;
  badge?: string;
  items: string[];
  note?: string;
}) {
  return (
    <div className="rounded-md border border-white/8 bg-white/2 px-4 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-white/80">{label}</span>
        {badge && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#C8A84B]/15 text-[#C8A84B]/80 font-medium tracking-wide">
            {badge}
          </span>
        )}
      </div>
      <ul className="list-disc list-outside ml-4 space-y-0.5">
        {items.map((item) => (
          <li key={item} className="text-sm text-white/55">{item}</li>
        ))}
      </ul>
      {note && (
        <p className="text-xs text-white/40 italic border-t border-white/6 pt-2 mt-1">
          {note}
        </p>
      )}
    </div>
  );
}

function ThirdParty({
  name,
  purpose,
  link,
  data,
}: {
  name: string;
  purpose: string;
  link: string;
  data: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 text-sm border-b border-white/5 pb-3 last:border-0">
      <div className="sm:w-24 shrink-0">
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-[#C8A84B]/80 hover:text-[#C8A84B] transition-colors underline underline-offset-2"
        >
          {name}
        </a>
      </div>
      <div className="flex-1 space-y-0.5">
        <p className="text-white/70">{purpose}</p>
        <p className="text-white/40 text-xs">Data shared: {data}</p>
      </div>
    </div>
  );
}
