import { LeadDetail } from "@/components/lead-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <LeadDetail id={(await params).id} />;
}
