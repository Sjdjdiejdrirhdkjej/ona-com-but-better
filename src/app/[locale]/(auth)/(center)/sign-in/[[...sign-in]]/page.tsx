import { getTranslations, setRequestLocale } from 'next-intl/server';

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
    <div className="text-center">
      <h1 className="text-2xl font-bold">Sign In</h1>
      <p className="mt-4 text-gray-600">Authentication is not configured.</p>
    </div>
  );
};
