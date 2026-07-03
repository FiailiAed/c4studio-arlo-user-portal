import { auth, currentUser } from "@clerk/nextjs/server";

if (process.env.NODE_ENV === "production") {
  throw new Error("Debug route must not be deployed to production.");
}

function decodeJwt(token: string | null) {
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
}

export async function GET() {
  const { userId, sessionId, sessionClaims, getToken } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const [sessionTokenRaw, convexTokenRaw] = await Promise.all([
    getToken(),
    getToken({ template: "convex" }).catch(() => null),
  ]);

  const user = await currentUser();

  return Response.json(
    {
      meta: { userId, sessionId },

      // Session token: customized via Clerk Dashboard → Configure → Sessions → Customize session token
      // This is what auth() and proxy.ts read via sessionClaims
      sessionToken: {
        decoded: sessionClaims,
        raw: sessionTokenRaw,
        rawDecoded: decodeJwt(sessionTokenRaw),
      },

      // Convex JWT template: configured via Clerk Dashboard → JWT Templates → "convex"
      // This is what ConvexProviderWithClerk sends, and what getUserIdentity() reads
      convexJwtTemplate: {
        raw: convexTokenRaw,
        decoded: decodeJwt(convexTokenRaw),
      },

      // Ground truth: raw publicMetadata stored in Clerk (not a token, but the source)
      publicMetadata: user?.publicMetadata ?? null,
    },
    { status: 200 }
  );
}
