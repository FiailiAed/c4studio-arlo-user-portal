import { internalMutation } from "./_generated/server";

export const removeNameFields = internalMutation({
  args: {},
  handler: async (ctx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const users = await (ctx.db.query("users") as any).collect();
    for (const user of users) {
      await ctx.db.replace(user._id, {
        clerkId: user.clerkId,
        ...(user.phone !== undefined && { phone: user.phone }),
        ...(user.dateOfBirth !== undefined && { dateOfBirth: user.dateOfBirth }),
        ...(user.address !== undefined && { address: user.address }),
      });
    }
  },
});
