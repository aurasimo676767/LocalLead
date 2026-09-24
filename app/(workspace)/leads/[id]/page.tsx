import { LeadDetail } from "@/components/lead-detail";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ scan?: string }>;
}) {
  return (
    <LeadDetail
      id={(await params).id}
      scan={(await searchParams).scan === "1"}
    />
  );
}
