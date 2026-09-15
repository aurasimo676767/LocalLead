"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  ScanSearch,
  Users,
  Send,
  Archive,
  Settings,
  Moon,
  Sun,
  ArrowUpRight,
  Sprout,
  Plus,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useWorkspace } from "./workspace";
import { supabaseBrowser } from "@/lib/supabase/browser";
const nav = [
  ["/dashboard", "Dashboard", LayoutDashboard],
  ["/discover", "Trova lead", ScanSearch],
  ["/leads", "Lead", Users],
  ["/contacted", "Contattati", Send],
  ["/archive", "Archivio", Archive],
  ["/settings", "Impostazioni", Settings],
] as const;
export function Shell({
  children,
  email,
}: {
  children: React.ReactNode;
  email: string;
}) {
  const path = usePathname();
  const router = useRouter();
  const { config, leads, loading, error, notice, reload } = useWorkspace();
  const [dark, setDark] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const value = localStorage.getItem("locallead.theme") === "dark";
    document.documentElement.dataset.theme = value ? "dark" : "light";
    const t = setTimeout(() => setDark(value), 0);
    return () => clearTimeout(t);
  }, []);
  function theme() {
    const value = !dark;
    setDark(value);
    document.documentElement.dataset.theme = value ? "dark" : "light";
    localStorage.setItem("locallead.theme", value ? "dark" : "light");
  }
  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <Link className="brand" href="/dashboard">
          <span className="brand-mark">
            <Sprout size={23} />
          </span>
          locallead<span className="brand-dot">.</span>
        </Link>
        <button
          className="icon-btn mobile-close"
          onClick={() => setOpen(false)}
          aria-label="Chiudi menu"
        >
          <X />
        </button>
        <p className="nav-caption">IL TUO WORKSPACE</p>
        <nav>
          {nav.map(([href, label, Icon]) => (
            <Link
              onClick={() => setOpen(false)}
              key={href}
              href={href}
              className={
                path === href ||
                (href === "/leads" && path.startsWith("/leads/"))
                  ? "nav-link active"
                  : "nav-link"
              }
            >
              <Icon size={19} />
              {label}
              {href === "/leads" && (
                <span className="nav-count">{leads.length}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="small-card">
            <span className="live-dot" /> Un contatto alla volta
            <p>
              Trova il motivo giusto.
              <br />
              Inizia una conversazione vera.
            </p>
            <Link href="/discover">
              Esplora le opportunità <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="profile">
            <span className="avatar">TU</span>
            <div>
              <strong>Il tuo spazio</strong>
              <small>{config.demo ? "Modalità demo" : email}</small>
            </div>
            {!config.demo && (
              <button
                className="icon-btn"
                aria-label="Esci"
                onClick={async () => {
                  await supabaseBrowser().auth.signOut();
                  router.push("/login");
                  router.refresh();
                }}
              >
                <LogOut size={17} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-toggle"
              aria-label="Apri menu"
              onClick={() => setOpen(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <span className="slash">/</span>
            <strong>
              {nav.find(([href]) => path.startsWith(href))?.[1] || "Lead"}
            </strong>
          </div>
          <div className="top-actions">
            <span className="mode-pill">
              <span className="live-dot" />
              {config.demo ? "Demo mode" : "Spazio privato"}
            </span>
            <button
              className="icon-btn"
              onClick={theme}
              aria-label="Cambia tema"
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <Link href="/leads/new" className="button small">
              <Plus size={16} /> Nuovo lead
            </Link>
          </div>
        </header>
        {config.demo && (
          <div className="demo-banner">
            Dati fittizi · Le modifiche vengono salvate in questo browser.{" "}
            <Link href="/settings">
              Configura i provider <ArrowUpRight size={12} />
            </Link>
          </div>
        )}
        <main>
          {loading ? (
            <div className="empty-state">
              <span className="spinner" /> Caricamento del tuo spazio…
            </div>
          ) : error ? (
            <div className="error-box">
              {error}
              <button onClick={() => void reload()}>Riprova</button>
            </div>
          ) : (
            children
          )}
        </main>
        <footer className="page-footer">
          <span>LocalLead · Relazioni che iniziano bene.</span>
          <span>Invio sempre manuale</span>
        </footer>
      </div>
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}
