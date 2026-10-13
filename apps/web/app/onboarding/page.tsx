"use client";
import { useState } from "react";
export default function Onboarding() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>Your next chapter.</h1>
        <p>Create a workspace for your team.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const values = Object.fromEntries(new FormData(e.currentTarget));
            try {
              const r = await fetch("/api/v1/organizations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
              });
              const result = await r.json();
              if (!r.ok) throw new Error(result.message);
              window.location.href = `/workspace/${result.slug}`;
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Unable to create workspace.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            Organization name
            <input name="name" required minLength={2} maxLength={80} />
          </label>
          <label className="field">
            Workspace slug
            <input
              name="slug"
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              maxLength={50}
              placeholder="acme-bikes"
            />
          </label>
          <label className="field">
            Website origin
            <input
              name="origin"
              type="url"
              required
              placeholder="https://example.com"
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? "Creating…" : "Create workspace"}
          </button>
        </form>
      </section>
    </main>
  );
}
