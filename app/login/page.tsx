import { Login } from "@/components/login";
import { publicConfig } from "@/lib/config";
export const dynamic = "force-dynamic";
export default function Page() {
  return <Login demo={publicConfig().demo} />;
}
