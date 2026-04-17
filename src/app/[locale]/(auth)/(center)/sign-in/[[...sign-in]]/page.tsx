import { getTranslations, setRequestLocale } from 'next-intl/server';

import { SignInButton } from '@/components/SignInButton';

type ISignInPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata(props: ISignInPageProps) {
  const { locale } = await props.params;
  const t = await getTranslations({
    locale,
    namespace: 'SignIn',
  });

  return {
    title: t('meta_title'),
    description: t('meta_description'),
  };
}

export default async function SignInPage(props: ISignInPageProps) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  return (
    <div style={{ textAlign: 'center', padding: '40px 24px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px', fontFamily: 'Georgia, serif' }}>
        Sign in to ONA
      </h1>
      <p style={{ color: '#666', marginBottom: '32px', fontSize: '15px' }}>
        Use your Replit account to continue.
      </p>
      <SignInButton />
    </div>
  );
}
