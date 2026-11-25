import { redirect } from "next/navigation";

// The app lives at /projects/site-auditor (same paths as on your-site.com, so nothing inside needed rewriting).
export default function Home() {
  redirect("/projects/site-auditor");
}
