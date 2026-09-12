import { withAuth } from 'next-auth/middleware';

// Next 16 `proxy.ts` (what used to be `middleware.ts`). Every admin route
// requires a session except the auth surfaces listed in the matcher;
// unauthenticated requests redirect to `/login`. Deliberately does NOT
// import `@/lib/auth` (argon2/Prisma are Node-only; this file may run on
// the Edge runtime) — it reads NEXTAUTH_SECRET from the environment.
export default withAuth({
  callbacks: {
    authorized: ({ token }) => !!token,
  },
  pages: {
    signIn: '/login',
  },
});

export const config = {
  matcher: [
    // Everything except: NextAuth handlers, public auth pages, Next
    // internals and files with an extension (e.g. `favicon.ico`).
    '/((?!api/auth|login|forgot-password|reset-password|_next|.*\\..*).*)',
  ],
};
