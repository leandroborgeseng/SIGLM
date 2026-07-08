'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const COOKIE = 'lm_staging';

export async function unlockStaging(formData: FormData) {
  const password = String(formData.get('password') ?? '');
  const expected = process.env.STAGING_ACCESS_PASSWORD;

  if (!expected) {
    redirect('/acesso?erro=' + encodeURIComponent('Ambiente demo não configurado.'));
  }

  if (password !== expected) {
    redirect('/acesso?erro=' + encodeURIComponent('Senha incorreta.'));
  }

  const jar = await cookies();
  jar.set(COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect('/legislacao');
}

export async function stagingGateEnabled(): Promise<boolean> {
  return process.env.NEXT_PUBLIC_STAGING_GATE === 'true';
}
