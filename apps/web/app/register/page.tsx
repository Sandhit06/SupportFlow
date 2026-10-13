"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { ArrowRight, Sparkles } from "lucide-react";
import { registrationSchema } from "../../../../packages/contracts/src";
import type { z } from "zod";

export default function Register() {
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof registrationSchema>>({
    resolver: zodResolver(registrationSchema),
  });
  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="assistant-orb">
          <Sparkles size={20} />
        </span>
        <h1>Make room for better support.</h1>
        <p>Create your account, then bring your workspace to life.</p>
        <form
          onSubmit={handleSubmit(async (values) => {
            setError("");
            try {
              const response = await fetch("/api/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
              });
              const result = await response.json();
              if (!response.ok) throw new Error(result.message);
              const session = await signIn("credentials", {
                email: values.email,
                password: values.password,
                redirect: false,
              });
              window.location.href = session?.error ? "/login" : "/onboarding";
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "Could not create your account.",
              );
            }
          })}
        >
          <label className="field">
            Your name
            <input
              autoComplete="name"
              {...register("name")}
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <span className="form-error">{errors.name.message}</span>
            )}
          </label>
          <label className="field">
            Work email
            <input
              type="email"
              autoComplete="email"
              {...register("email")}
              aria-invalid={!!errors.email}
            />
            {errors.email && (
              <span className="form-error">{errors.email.message}</span>
            )}
          </label>
          <label className="field">
            Password
            <input
              type="password"
              autoComplete="new-password"
              {...register("password")}
              aria-invalid={!!errors.password}
            />
            <small>At least 12 characters.</small>
            {errors.password && (
              <span className="form-error">{errors.password.message}</span>
            )}
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" disabled={isSubmitting}>
            {isSubmitting ? "Creating your account…" : "Create account"}
            <ArrowRight size={16} />
          </button>
        </form>
        <div className="auth-footer">
          <a href="/login">Already have an account? Sign in →</a>
        </div>
      </section>
    </main>
  );
}
