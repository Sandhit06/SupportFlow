import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verify } from "argon2";
import { z } from "zod";
import { db } from "../../../packages/db/src";
import { rateLimit } from "../../../packages/core/src/rate-limit";
export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: { type: "email" }, password: { type: "password" } },
      async authorize(raw) {
        const parsed = z
          .object({
            email: z.email().transform((v) => v.toLowerCase()),
            password: z.string().min(8).max(128),
          })
          .safeParse(raw);
        if (!parsed.success) return null;
        await rateLimit(`login:${parsed.data.email}`, 10, 60);
        const user = await db.user.findUnique({
          where: { email: parsed.data.email },
        });
        if (!user || !(await verify(user.passwordHash, parsed.data.password)))
          return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
