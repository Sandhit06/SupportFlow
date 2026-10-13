"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { ArrowRight, Sparkles } from "lucide-react";
export default function Login() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="auth-page">
      <div className="auth-card">
        <span className="assistant-orb">
          <Sparkles size={20} />
        </span>
        <h1>Welcome to your flow.</h1>
        <p>A little less friction. A little more connection.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const form = new FormData(e.currentTarget);
            try {
              const result = await signIn("credentials", {
                email: form.get("email"),
                password: form.get("password"),
                redirect: false,
              });
              if (result?.error)
                setError(
                  "Unable to sign in. Check your credentials and service availability.",
                );
              else window.location.href = "/workspace";
            } catch {
              setError("The service is unavailable. Please try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            Email
            <input
              name="email"
              type="email"
              autoComplete="username"
              placeholder="you@company.com"
              required
            />
          </label>
          <label className="field">
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
            />
          </label>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
            <ArrowRight size={16} />
          </button>
        </form>
        <div className="auth-footer">
          <a href="/register">Create an account →</a>
        </div>
        <div className="auth-footer">
          <a href="/preview">Explore the interactive preview →</a>
        </div>
      </div>
    </main>
  );
}
