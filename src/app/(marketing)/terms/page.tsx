import type { Metadata } from 'next';
import { createMetadata } from '@/shared/seo';

export function generateMetadata(): Metadata {
  return createMetadata({
    title: 'Terms of Service',
    description:
      'Terms of Service for Estrevia — sidereal astrology platform. Read about acceptable use, license, and astrology disclaimer.',
    path: '/terms',
  });
}

const EFFECTIVE_DATE = 'April 6, 2026';
const CONTACT_EMAIL = 'legal@estrevia.app';

export default function TermsPage() {
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
          Terms of Service
        </h1>
        <p className="text-sm text-white/40">
          Effective date: {EFFECTIVE_DATE}
        </p>
      </header>

      <div className="prose-legal space-y-10 text-white/70 leading-relaxed">

        {/* 1. Acceptance */}
        <Section title="1. Acceptance of Terms">
          <p>
            By accessing or using Estrevia (&ldquo;Service&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;), you agree to
            be bound by these Terms of Service. If you do not agree, do not use
            the Service.
          </p>
          <p>
            We may update these Terms at any time. Continued use of the Service
            after changes constitutes acceptance of the revised Terms. We will
            provide notice of material changes via email or an in-app
            announcement at least 14 days before they take effect.
          </p>
        </Section>

        {/* 2. Description */}
        <Section title="2. Description of Service">
          <p>
            Estrevia is a progressive web application that calculates natal
            charts using sidereal astrology via Swiss Ephemeris, provides
            esoteric essays, planetary hours, and moon phase information, and
            generates shareable &ldquo;Cosmic Passport&rdquo; cards.
          </p>
          <p>
            The Service is provided for personal, non-commercial use unless you
            hold a separate commercial license agreement with us.
          </p>
        </Section>

        {/* 3. Astrology Disclaimer — legal requirement */}
        <Section title="3. Astrology Disclaimer">
          <div className="rounded-lg border border-[#C8A84B]/20 bg-[#C8A84B]/5 px-5 py-4">
            <p className="text-white/90 font-medium mb-2">
              Astrology is for entertainment and personal reflection purposes only.
            </p>
            <p>
              Nothing on Estrevia constitutes medical, psychological, financial,
              legal, or professional advice. Natal chart readings, planetary
              positions, and esoteric correspondences are not scientific claims
              and should not be used as a basis for important life decisions.
            </p>
            <p className="mt-3">
              Always consult qualified professionals for medical, financial, or
              legal matters. Estrevia expressly disclaims any liability for
              decisions made based on astrological content provided through the
              Service.
            </p>
          </div>
        </Section>

        {/* 4. Accounts */}
        <Section title="4. Accounts and Registration">
          <p>
            You may use certain features without an account. Creating an account
            requires a valid email address. You are responsible for maintaining
            the confidentiality of your credentials and for all activity under
            your account.
          </p>
          <p>
            You must be at least 13 years old to create an account. By
            registering, you represent that you meet this age requirement.
          </p>
        </Section>

        {/* 5. Acceptable Use */}
        <Section title="5. Acceptable Use">
          <p>You agree not to:</p>
          <ul className="list-disc list-outside ml-5 space-y-1.5">
            <li>Use the Service in a way that violates applicable laws or regulations</li>
            <li>Reverse-engineer, decompile, or attempt to extract source code beyond what is provided under the open-source license</li>
            <li>Attempt to access other users&apos; data or accounts without authorization</li>
            <li>Use automated scripts to scrape content or overwhelm our infrastructure</li>
            <li>Resell or sublicense access to the Service without our written consent</li>
            <li>Submit false or misleading birth data to circumvent rate limits</li>
          </ul>
        </Section>

        {/* 6. Open Source License */}
        <Section title="6. Open Source License">
          <p>
            The Estrevia codebase (excluding content in the{' '}
            <code className="text-[#C8A84B]/80 bg-white/5 px-1.5 py-0.5 rounded text-xs font-mono">
              content/
            </code>{' '}
            directory) is released under the{' '}
            <strong className="text-white/85">GNU Affero General Public License v3.0 (AGPL-3.0)</strong>.
            This license choice is required for compliance with Swiss Ephemeris,
            which is also AGPL-3.0.
          </p>
          <p>
            Under AGPL-3.0: if you modify and distribute the software, or run a
            modified version as a network service, you must release your
            modifications under the same license. The full license text is
            available in our{' '}
            <a
              href="https://github.com/estrevia-app/estrevia"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#C8A84B] hover:text-[#E0C06A] underline underline-offset-2 transition-colors"
            >
              GitHub repository
            </a>
            .
          </p>
          <p>
            <strong className="text-white/85">Content in{' '}
            <code className="text-[#C8A84B]/80 bg-white/5 px-1.5 py-0.5 rounded text-xs font-mono">
              content/
            </code>
            </strong>{' '}
            (essays, correspondence tables, interpretations) is proprietary and
            is <strong>not</strong> covered by the AGPL-3.0 license. All rights
            reserved.
          </p>
        </Section>

        {/* 7. Intellectual Property */}
        <Section title="7. Intellectual Property">
          <p>
            All illustrations, designs, and original content on Estrevia are
            either original works or generated with proper licensing. Thoth
            Tarot images are not used — all tarot-style illustrations are
            original AI-generated art in the Estrevia style.
          </p>
          <p>
            Public domain texts referenced in essays (Crowley&apos;s 777,
            Equinox Vol I, Liber AL — published before 1929) are reproduced
            under public domain doctrine.
          </p>
          <p>
            NASA data and images used on the Service are in the public domain as
            works of the US federal government.
          </p>
        </Section>

        {/* 8. Subscriptions */}
        <Section title="8. Subscriptions and Payments">
          <p>
            Certain features require a paid subscription (&ldquo;Premium&rdquo;). Subscription
            fees are charged via Stripe. All prices are in USD unless stated
            otherwise. Taxes may apply based on your location.
          </p>
          <p>
            Subscriptions auto-renew unless cancelled before the renewal date.
            You may cancel at any time from your account settings. Refunds for
            unused subscription time are not provided except as required by law.
          </p>
        </Section>

        {/* 9. Limitation of Liability */}
        <Section title="9. Limitation of Liability">
          <p>
            To the maximum extent permitted by law, Estrevia and its operators
            shall not be liable for any indirect, incidental, special,
            consequential, or punitive damages arising from your use of (or
            inability to use) the Service.
          </p>
          <p>
            Our total liability for any claim shall not exceed the amount you
            paid us in the 12 months preceding the claim, or $10 USD, whichever
            is greater.
          </p>
        </Section>

        {/* 10. Governing Law */}
        <Section title="10. Governing Law">
          <p>
            These Terms are governed by applicable law. Any disputes shall be
            resolved through binding arbitration except where prohibited by law.
            Nothing in these Terms prevents you from exercising consumer
            protection rights under applicable law.
          </p>
        </Section>

        {/* 11. Contact */}
        <Section title="11. Contact">
          <p>
            Questions about these Terms:{' '}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-[#C8A84B] hover:text-[#E0C06A] underline underline-offset-2 transition-colors"
            >
              {CONTACT_EMAIL}
            </a>
          </p>
        </Section>

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal helper component
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
