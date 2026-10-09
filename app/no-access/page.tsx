import { signOut } from "@/app/actions";

export default function NoAccess() {
  return (
    <main className="mx-auto grid min-h-screen max-w-sm content-center gap-4 p-6">
      <h1 className="text-2xl font-bold">No profile yet</h1>
      <p className="text-soft">You are signed in, but this account has not been set up in Supervision Desk. Ask the programme coordinator to invite you.</p>
      <form action={signOut}><button className="btn">Sign out</button></form>
    </main>
  );
}
