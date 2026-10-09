import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

/** Only allow same-site relative paths as redirect targets. */
export const safeBack = (v: FormDataEntryValue | null, fallback: string) => {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : fallback;
};
const withParam = (path: string, k: string, msg: string) =>
  `${path}${path.includes("?") ? "&" : "?"}${k}=${encodeURIComponent(msg)}`;

export function ok(path: string, msg: string): never {
  revalidatePath("/", "layout");
  redirect(withParam(path, "ok", msg));
}
export function fail(path: string, msg: string): never {
  redirect(withParam(path, "err", msg));
}
