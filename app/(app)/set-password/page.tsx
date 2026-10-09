import { setPassword } from "@/app/actions";
export const metadata = { title: "Set password" };

export default function SetPassword() {
  return (
    <div className="mx-auto grid w-full max-w-sm gap-4">
      <h1 className="text-2xl font-bold">Choose a password</h1>
      <form action={setPassword} className="panel grid gap-3">
        <div><label className="label" htmlFor="pw">New password</label><input id="pw" name="password" type="password" minLength={8} required autoComplete="new-password" className="input" /></div>
        <div><label className="label" htmlFor="cf">Confirm password</label><input id="cf" name="confirm" type="password" minLength={8} required autoComplete="new-password" className="input" /></div>
        <button className="btn btn-primary">Save password</button>
      </form>
    </div>
  );
}
