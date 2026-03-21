import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const BACKEND_API_KEY = process.env.BACKEND_API_KEY || "";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "google") return false;

      // Upsert user in the backend and store the internal user_id
      try {
        const res = await fetch(`${BACKEND_URL}/api/auth/user`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": BACKEND_API_KEY,
          },
          body: JSON.stringify({
            google_id: account.providerAccountId,
            email: user.email,
            name: user.name,
            avatar_url: user.image,
          }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        // Store user_id on the user object so it's available in jwt callback
        (user as Record<string, unknown>).userId = data.user_id;
      } catch {
        return false;
      }
      return true;
    },

    async jwt({ token, user }) {
      if (user && (user as Record<string, unknown>).userId) {
        token.userId = (user as Record<string, unknown>).userId as string;
      }
      return token;
    },

    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    },

    async redirect({ url, baseUrl }) {
      // After sign-in, default to /dashboard instead of /
      if (url === baseUrl || url === `${baseUrl}/`) return `${baseUrl}/dashboard`;
      return url.startsWith(baseUrl) ? url : baseUrl;
    },
  },
});
