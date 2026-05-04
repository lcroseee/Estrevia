import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './components/EmailLayout';

interface Props {
  locale: 'en' | 'es';
}

const STRINGS = {
  en: {
    preview: 'Your Estrevia account and data have been permanently deleted.',
    heading: 'Account Deleted',
    body1: 'Confirming your account, charts, and personal data have been deleted from our systems.',
    body2: "This is permanent — we don't keep backups of personal data per our retention policy.",
    body3: 'Thank you for trying Estrevia.',
  },
  es: {
    preview: 'Tu cuenta de Estrevia y tus datos han sido eliminados de forma permanente.',
    heading: 'Cuenta eliminada',
    body1: 'Confirmamos que tu cuenta, cartas y datos personales han sido eliminados de nuestros sistemas.',
    body2: 'Esto es permanente — no guardamos copias de seguridad de datos personales según nuestra política de retención.',
    body3: 'Gracias por probar Estrevia.',
  },
};

export default function AccountDeletionEmail({ locale }: Props) {
  const t = STRINGS[locale];
  return (
    <EmailLayout preview={t.preview} locale={locale}>
      <Heading style={{ fontSize: 28, marginBottom: 16 }}>{t.heading}</Heading>
      <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 16 }}>{t.body1}</Text>
      <Text style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 16 }}>{t.body2}</Text>
      <Text style={{ fontSize: 16, lineHeight: 1.6 }}>{t.body3}</Text>
    </EmailLayout>
  );
}
