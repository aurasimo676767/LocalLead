import Link from "next/link";
import { LeadList } from "@/components/lead-list";
const tabs = [
  ["all", "/alloggi", "Da lavorare"],
  ["contacted", "/alloggi?vista=contattati", "Contattati"],
  ["archive", "/alloggi?vista=archivio", "Archivio"],
] as const;
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string }>;
}) {
  const vista = (await searchParams).vista;
  const mode =
    vista === "contattati"
      ? "contacted"
      : vista === "archivio"
        ? "archive"
        : "all";
  return (
    <>
      <nav className="city-tabs" aria-label="Vista alloggi">
        {tabs.map(([value, href, label]) => (
          <Link
            key={value}
            href={href}
            className={mode === value ? "active" : ""}
            aria-current={mode === value ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <LeadList key={mode} mode={mode} sector="alloggi" />
    </>
  );
}
