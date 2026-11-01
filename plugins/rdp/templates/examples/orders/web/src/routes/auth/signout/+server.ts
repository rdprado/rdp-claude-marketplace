// Example code (RDP orders example): a placeholder. Change it or delete it to fit your project.
// Layer: Interface Adapters — entry: POST /auth/signout (a form post; the CSRF check in the hooks covers it).
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies, locals }) => {
  await locals.bff.signOut.run(cookies, locals.trace.traceId);
  redirect(303, '/signed-out');
};
