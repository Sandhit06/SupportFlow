"use client";
export default function ErrorBoundary({ reset }: { reset: () => void }) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>A little interruption.</h1>
        <p>
          We couldn’t load your workspace. Check that PostgreSQL and Redis are
          running, then try again.
        </p>
        <button className="button primary" onClick={reset}>
          Try again
        </button>
        <div className="auth-footer">
          <a href="/preview">Explore the local preview</a>
        </div>
      </section>
    </main>
  );
}
