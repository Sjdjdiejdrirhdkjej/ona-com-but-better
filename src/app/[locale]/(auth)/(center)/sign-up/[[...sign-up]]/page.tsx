import { getTranslations, setRequestLocale } from 'next-intl/server';

type ISignUpPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata(props: ISignUpPageProps) {
  const { locale } = await props.params;
  const t = await getTranslations({
    locale,
    namespace: 'SignUp',
  });

  return {
    title: t('meta_title'),
    description: t('meta_description'),
  };
}

export default async function SignUpPage(props: ISignUpPageProps) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  return (
    <div className="text-center">
      <h1 className="text-2xl font-bold">Sign Up</h1>
      <p className="mt-4 text-gray-600">Authentication is not configured.</p>
    </div>
  );
};
