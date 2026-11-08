// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// BFF entry: GET /auth/callback, where the identity provider sends the browser back with the one-time code.
import { redirect } from '@sveltejs/kit';
import type { SignInOutcome } from '#bff/auth.ts';
import type { RequestHandler } from './$types';

const NEXT_PAGE: Record<SignInOutcome, string> = { 'signed-in': '/', failed: '/signed-out' };

export const GET: RequestHandler = async ({ cookies, locals, url }) => {
  const outcome = await locals.auth.completeSignIn(
    cookies,
    { code: url.searchParams.get('code'), state: url.searchParams.get('state') },
    locals.trace.traceId
  );
  redirect(303, NEXT_PAGE[outcome]);
};
