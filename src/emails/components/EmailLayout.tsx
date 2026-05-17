import { Body, Container, Head, Html, Section, Text, Hr, Preview } from '@react-email/components';
import type { ReactNode } from 'react';

interface Props {
  preview?: string;
  locale: 'en' | 'es';
  children: ReactNode;
  unsubscribeUrl?: string; // present for marketing; absent for transactional
}

const SITE_URL = 'https://estrevia.app';

const FOOTER_TEXT = {
  en: {
    address: 'Estrevia · Sidereal astrology · Lahiri ayanamsa',
    manage: 'Manage email preferences',
    unsubscribe: 'Unsubscribe from marketing emails',
  },
  es: {
    address: 'Estrevia · Astrología sideral · Ayanamsa Lahiri',
    manage: 'Gestionar preferencias de correo',
    unsubscribe: 'Cancelar suscripción a correos de marketing',
  },
};

export function EmailLayout({ preview, locale, children, unsubscribeUrl }: Props) {
  const t = FOOTER_TEXT[locale];
  return (
    <Html lang={locale}>
      <Head />
      {preview ? <Preview>{preview}</Preview> : null}
      <Body style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', backgroundColor: '#0a0a0f', margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: 600, margin: '0 auto', padding: '32px 24px', backgroundColor: '#14141d' }}>
          <Section>
            <Text
              style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: 22,
                fontWeight: 300,
                color: '#FFD700',
                letterSpacing: '0.15em',
                margin: 0,
                padding: 0,
              }}
            >
              ESTREVIA
            </Text>
          </Section>
          <Section style={{ marginTop: 24, color: 'rgba(255,255,255,0.9)' }}>
            {children}
          </Section>
          <Hr style={{ borderColor: 'rgba(255,255,255,0.08)', margin: '32px 0 16px' }} />
          <Section style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
            <Text>{t.address}</Text>
            <Text>
              <a href={`${SITE_URL}/${locale === 'es' ? 'es/' : ''}settings`} style={{ color: 'rgba(255,255,255,0.5)' }}>{t.manage}</a>
              {unsubscribeUrl ? (
                <>
                  {' · '}
                  <a href={unsubscribeUrl} style={{ color: 'rgba(255,255,255,0.5)' }}>{t.unsubscribe}</a>
                </>
              ) : null}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
