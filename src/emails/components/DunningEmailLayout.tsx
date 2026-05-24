import { Body, Container, Head, Html, Section, Text, Hr, Preview } from '@react-email/components';
import type { ReactNode } from 'react';

interface Props {
  preview?: string;
  locale: 'en' | 'es';
  children: ReactNode;
  settingsUrl: string;
}

// Plain white layout for dunning emails — better deliverability than dark theme.
// Standard transactional email look: white background, dark text, minimal branding.

const FOOTER_TEXT = {
  en: {
    address: 'Estrevia · Sidereal astrology',
    manage: 'Manage subscription',
    support: 'Questions? hello@estrevia.app',
  },
  es: {
    address: 'Estrevia · Astrología sideral',
    manage: 'Gestionar suscripción',
    support: '¿Preguntas? hello@estrevia.app',
  },
};

export function DunningEmailLayout({ preview, locale, children, settingsUrl }: Props) {
  const t = FOOTER_TEXT[locale];
  return (
    <Html lang={locale}>
      <Head />
      {preview ? <Preview>{preview}</Preview> : null}
      <Body
        style={{
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          backgroundColor: '#f4f4f5',
          margin: 0,
          padding: 0,
        }}
      >
        <Container
          style={{
            maxWidth: 600,
            margin: '0 auto',
            padding: '32px 24px',
            backgroundColor: '#ffffff',
          }}
        >
          <Section style={{ marginBottom: 24 }}>
            <Text
              style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: 18,
                fontWeight: 400,
                color: '#1a1a2e',
                letterSpacing: '0.1em',
                margin: 0,
              }}
            >
              ESTREVIA
            </Text>
          </Section>

          <Section style={{ color: '#1a1a2e' }}>{children}</Section>

          <Hr style={{ borderColor: '#e4e4e7', margin: '32px 0 16px' }} />

          <Section
            style={{
              fontSize: 12,
              color: '#71717a',
              textAlign: 'center',
            }}
          >
            <Text style={{ margin: '0 0 4px' }}>{t.address}</Text>
            <Text style={{ margin: '0 0 4px' }}>
              <a href={settingsUrl} style={{ color: '#71717a' }}>
                {t.manage}
              </a>
            </Text>
            <Text style={{ margin: 0 }}>{t.support}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
