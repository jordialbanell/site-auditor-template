import type { Metadata } from "next";
import Script from "next/script";
import { Suspense, type ReactNode } from "react";
import AppFrame from "../../components/AppFrame";
import { isOwner } from "@/lib/owner";
import OwnerSignIn from "../_owner/OwnerSignIn";
import "./site-auditor.css";

export const metadata: Metadata = {
  title: "Site Auditor",
  description: "Crawl a website, have Claude analyse its architecture and content, and export the findings.",
};

async function Owner() {
  return <OwnerSignIn owner={await isOwner()} tone="light" />;
}

export default function SiteAuditorLayout({ children }: { children: ReactNode }) {
  return (
    <AppFrame name="Site Auditor">
      <link
        rel="stylesheet"
        precedence="default"
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap"
      />
      <div className="site-auditor" style={{ flex: 1 }}>
        {children}
        <div className="sa-owner"><Suspense fallback={null}><Owner /></Suspense></div>
      </div>
      {/* The site map view draws with d3 */}
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js" strategy="afterInteractive" />
    </AppFrame>
  );
}
