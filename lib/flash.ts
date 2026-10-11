import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { flushNotifications } from "@/lib/notify";

export { safeBack } from "@/lib/safe-back";
const withParam = (path: string, k: string, msg: string) =>
  `${path}${path.includes("?") ? "&" : "?"}${k}=${encodeURIComponent(msg)}`;

/** Send any emails the action just queued, after the response has gone out. */
export const sendQueuedEmails = () => after(() => flushNotifications().catch(() => undefined));

export function ok(path: string, msg: string): never {
  revalidatePath("/", "layout");
  sendQueuedEmails();
  redirect(withParam(path, "ok", msg));
}
export function fail(path: string, msg: string): never {
  redirect(withParam(path, "err", msg));
}
