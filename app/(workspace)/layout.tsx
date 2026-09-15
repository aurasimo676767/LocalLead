import { publicConfig } from "@/lib/config";
import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { WorkspaceProvider } from "@/components/workspace";
import { Shell } from "@/components/shell";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const config = publicConfig();
  let email = "Spazio personale";
  if (!config.demo) {
    const db = await supabaseServer();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) redirect("/login");
    email = user.email || email;
  }
  return (
    <WorkspaceProvider config={config}>
      <Shell email={email}>{children}</Shell>
    </WorkspaceProvider>
  );
}
