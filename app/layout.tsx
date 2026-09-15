import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "LocalLead · Le prossime connessioni",
  description:
    "Il tuo spazio per trovare locali, riconoscere opportunità e seguire ogni contatto.",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
