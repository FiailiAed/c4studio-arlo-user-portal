import { auth, clerkClient } from "@clerk/nextjs/server";

export async function POST(request: Request) {
  const { actor } = await auth();
  if (!actor?.sub) {
    return new Response("Not currently impersonating", { status: 400 });
  }

  const client = await clerkClient();
  let signInToken;
  try {
    signInToken = await client.signInTokens.createSignInToken({
      userId: actor.sub,
      expiresInSeconds: 60,
    });
  } catch (err) {
    console.error("Failed to create exit sign-in token", err);
    return new Response("Failed to exit impersonation", { status: 500 });
  }

  const redemptionUrl = new URL("/sign-in", request.url);
  redemptionUrl.searchParams.set("__clerk_ticket", signInToken.token);
  redemptionUrl.searchParams.set("redirect_url", "/dashboard");

  return Response.json({ url: redemptionUrl.toString() });
}
