import type { Metadata } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import "./globals.css";
const sans = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
export const metadata: Metadata = {
  title: "LocalLead · Le prossime connessioni",
  description:
    "Il tuo spazio per trovare locali, riconoscere opportunità e seguire ogni contatto.",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={sans.variable} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
