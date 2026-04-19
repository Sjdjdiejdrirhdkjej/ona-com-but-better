import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getSafeReturnPath } from '@/libs/ReplitAuth';
import { AppConfig } from '@/utils/AppConfig';
import { SignInLauncher } from './SignInLauncher';

type ISignInPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    error?: string;
    returnTo?: string;
  }>;
};

const errorMessages: Record<string, string> = {
  callback_failed: 'We could not complete Replit sign-in. Please try again.',
  login_failed: 'We could not start Replit sign-in. Please try again.',
  missing_claims: 'Replit sign-in did not return the account details needed. Please try again.',
  provider_error: 'Replit sign-in was cancelled or could not be completed. Please try again.',
  session_expired: 'Your sign-in session expired. Please try again.',
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
  const searchParams = await props.searchParams;
  setRequestLocale(locale);
  const defaultReturnTo = locale === AppConfig.defaultLocale ? '/app' : `/${locale}/app`;
  const returnTo = getSafeReturnPath(searchParams.returnTo || defaultReturnTo, 'https://ona.local');
  const errorMessage = searchParams.error ? errorMessages[searchParams.error] || errorMessages.callback_failed : null;
  const retryHref = `/api/login?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <div style={{ textAlign: 'center', padding: '40px 24px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px', fontFamily: 'Georgia, serif' }}>
        Sign in to ONA
      </h1>
      <p style={{ color: '#666', marginBottom: '32px', fontSize: '15px' }}>
        Keep this ONA tab open, then sign in with Replit in a separate tab.
      </p>
      {!errorMessage && (
        <p style={{ color: '#666', margin: '0 auto 24px', maxWidth: '360px', fontSize: '14px', lineHeight: 1.5 }}>
          After Replit finishes, this page will detect your session and continue to your workspace.
        </p>
      )}
      {errorMessage && (
        <div
          role="alert"
          style={{
            margin: '0 auto 24px',
            maxWidth: '360px',
            borderRadius: '8px',
            border: '1px solid #f0b4b4',
            backgroundColor: '#fff5f5',
            color: '#8a1f1f',
            padding: '12px 14px',
            fontSize: '14px',
            lineHeight: 1.4,
          }}
        >
          {errorMessage}
        </div>
      )}
      <SignInLauncher
        href={retryHref}
        returnTo={returnTo}
        label={errorMessage ? 'Try again' : 'Continue with Replit'}
      />
    </div>
  );
}
