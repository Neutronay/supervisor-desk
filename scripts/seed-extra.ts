/** Adds the demo administrator and a second department to an EXISTING project:  npm run seed:extra */
import { createClient } from "@supabase/supabase-js";
import { clearDemoNotifications, seedExtra, PASSWORD } from "./extra";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
seedExtra(sb)
  .then(async (ids) => { await clearDemoNotifications(sb, ids); console.log(`Done. Password for all demo accounts: ${PASSWORD}`); })
  .catch((e) => { console.error(e); process.exit(1); });
