"use client";

import { useActionState, useState } from "react";
import { signInAction, signOutAction, type SignInState } from "./actions";

// Small "Owner? Sign in" control for apps where only the owner can write.
export default function OwnerSignIn({ owner, tone = "dark" }: { owner: boolean; tone?: "dark" | "light" }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<SignInState, FormData>(signInAction, {});
  const muted = tone === "dark" ? "#8a8a8a" : "var(--muted)";
  const field = tone === "dark"
    ? { background: "#161616", border: "1px solid #2a2a2a", color: "#fff" }
    : { background: "#fff", border: "1px solid var(--line)", color: "var(--ink)" };

  if (owner) {
    return (
      <form action={signOutAction} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: muted }}>
        <span>Signed in as owner</span>
        <button type="submit" style={{ background: "none", border: 0, color: muted, textDecoration: "underline", cursor: "pointer", fontSize: 12, padding: 0 }}>
          Sign out
        </button>
      </form>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={{ background: "none", border: 0, color: muted, cursor: "pointer", fontSize: 12, padding: 0, minHeight: 32 }}>
        Owner? Sign in
      </button>
    );
  }

  return (
    <form action={action} style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <input
        name="password" type="password" autoFocus required placeholder="Password" aria-label="Password" autoComplete="current-password"
        style={{ ...field, height: 32, padding: "0 10px", fontSize: 14, borderRadius: 6, width: 150 }}
      />
      <button type="submit" disabled={pending} style={{ ...field, height: 32, padding: "0 12px", fontSize: 12, borderRadius: 6, cursor: "pointer" }}>
        {pending ? "…" : "Sign in"}
      </button>
      {state.error && <span style={{ fontSize: 12, color: "#e5674f" }}>{state.error}</span>}
    </form>
  );
}
