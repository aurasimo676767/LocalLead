import { Suspense } from "react";
import { Discover } from "@/components/discover";
export default function Page() {
  return (
    <Suspense>
      <Discover />
    </Suspense>
  );
}
