import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty-state">
      <h1>Pagina non trovata.</h1>
      <Link href="/dashboard">Torna alla dashboard</Link>
    </div>
  );
}
