import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isAdminEmail } from "@/lib/admin";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [Google],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return false;
      const email = profile?.email;
      return Boolean(profile?.email_verified === true && isAdminEmail(email));
    },
    async session({ session }) {
      if (!isAdminEmail(session.user?.email)) return { ...session, user: undefined };
      return session;
    },
  },
  pages: { signIn: "/login", error: "/login" },
});
