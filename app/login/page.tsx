import { Suspense } from "react";
import { signIn, requestReset } from "@/app/actions";
import { Toast } from "@/components/toast";

export const metadata = { title: "Sign in" };

export default function Login() {
  return (
    <main className="mx-auto grid min-h-screen max-w-sm content-center gap-5 p-6">
      <div>
        <h1 className="text-3xl font-bold">Supervision Desk</h1>
        <p className="text-[11px] uppercase tracking-widest text-soft">Postgraduate projects</p>
      </div>
      <form action={signIn} className="panel grid gap-3">
        <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="email" className="input" /></div>
        <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" required autoComplete="current-password" className="input" /></div>
        <button className="btn btn-primary">Sign in</button>
      </form>
      <form action={requestReset} className="grid gap-2">
        <p className="hint">Forgot your password? Enter your email above, then:</p>
        <input name="email" type="email" placeholder="you@example.com" aria-label="Email for password reset" className="input" />
        <button className="btn btn-sm self-start">Email me a reset link</button>
      </form>
      <Suspense><Toast /></Suspense>
    </main>
  );
}
