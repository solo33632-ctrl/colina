import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

// Public by design: this is the sign-in/sign-out endpoint itself. It is on the
// explicit allowlist in `lib/permissions.test.ts`; every other API route must
// name a capability (Stage 4a).
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
