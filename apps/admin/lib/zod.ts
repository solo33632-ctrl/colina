import { z } from 'zod';

// Strict production CSP forbids eval. Zod 4's JIT feature probe calls
// `new Function("")`; the throw is caught, but the browser still reports a
// `securitypolicyviolation`, which fails the production CSP check. Turning
// JIT off skips the probe and compiles schemas without eval — parsing and
// validation behave identically, just interpreted.
z.config({ jitless: true });

export { z };
