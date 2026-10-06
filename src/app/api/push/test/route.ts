import { sendToUser } from "@/lib/push/send";
import { jsonError, userFromRequest } from "@/lib/server/auth";

/** "Send test" in Settings. */
export async function POST(request: Request) {
  const user = await userFromRequest(request);
  if (!user) return jsonError(401, "Sign in again to send a test");
  try {
    const result = await sendToUser(user.id, {
      title: "Comper notifications are on",
      body: "You'll get your digest, re-entry reminders and closing-soon alerts here.",
      url: "/settings",
      tag: "test",
    });
    return Response.json(result);
  } catch (error) {
    return jsonError(500, error instanceof Error ? error.message : "Couldn't send the test notification");
  }
}
