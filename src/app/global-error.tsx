'use client';

import NextError from 'next/error';
import { routing } from '@/libs/I18nRouting';

export default function GlobalError(_props: {
  error: Error & { digest?: string };
}) {
  return (
    <html lang={routing.defaultLocale}>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
