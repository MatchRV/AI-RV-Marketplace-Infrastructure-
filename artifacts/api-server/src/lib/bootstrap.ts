import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const OWNER_EMAIL = "jonathan@lotlink.io";

export async function bootstrapOwnerAccount(): Promise<void> {
  try {
    const [existing] = await db
      .select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.email, OWNER_EMAIL));

    if (!existing) {
      await db.insert(usersTable).values({
        email: OWNER_EMAIL,
        firstName: "Jonathan",
        role: "owner",
      });
      console.log(`[bootstrap] Owner account created: ${OWNER_EMAIL}`);
    } else if (existing.role !== "owner") {
      await db
        .update(usersTable)
        .set({ role: "owner", updatedAt: new Date() })
        .where(eq(usersTable.email, OWNER_EMAIL));
      console.log(`[bootstrap] Owner role granted to: ${OWNER_EMAIL}`);
    } else {
      console.log(`[bootstrap] Owner account already exists: ${OWNER_EMAIL}`);
    }
  } catch (err) {
    console.error("[bootstrap] CRITICAL: Failed to bootstrap owner account:", err);
    console.error("[bootstrap] Owner account may not have correct permissions. Check DB connectivity and schema.");
  }
}
