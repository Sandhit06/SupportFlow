"use client";
import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { Send, Sparkles } from "lucide-react";
import type { Message } from "../../lib/demo";

export default function Widget() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const token = useRef("");
  const parentOrigin = useRef("");
  const conversationId = useRef("");
  const socket = useRef<Socket | null>(null);
  const cursor = useRef<string | undefined>(undefined);
  const log = useRef<HTMLDivElement>(null);
  const retry = useRef<{ body: string; id: string } | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    let disposed = false;
    let activeSocket: Socket | undefined;
    if (!token.current) {
      try {
        const initial = JSON.parse(
          decodeURIComponent(window.location.hash.slice(1)),
        ) as { token: string; parentOrigin: string };
        token.current = initial.token;
        parentOrigin.current = new URL(initial.parentOrigin).origin;
        window.history.replaceState(null, "", "/widget");
      } catch {
        setError("Open this chat from an installed website widget.");
        return;
      }
    }
    let loading = false;
    let reload = false;
    async function load() {
      if (loading) {
        reload = true;
        return;
      }
      loading = true;
      try {
        do {
          reload = false;
          const query = cursor.current ? `?cursor=${cursor.current}` : "";
          const r = await fetch(
            `/api/v1/widget/conversations/${conversationId.current}/messages${query}`,
            { headers: { Authorization: `Bearer ${token.current}` } },
          );
          if (!r.ok)
            throw Error(
              "Could not sync messages. Your conversation is saved; reconnect to try again.",
            );
          const result: Message[] = await r.json();
          if (disposed) return;
          if (result.length) {
            cursor.current = result[result.length - 1].id;
            setMessages((previous) => {
              const merged = new Map(previous.map((m) => [m.id, m]));
              for (const message of result) merged.set(message.id, message);
              return [...merged.values()].sort(
                (a, b) =>
                  a.createdAt.localeCompare(b.createdAt) ||
                  a.id.localeCompare(b.id),
              );
            });
          }
          if (result.length === 100) reload = true;
        } while (reload && !disposed);
      } finally {
        loading = false;
      }
    }
    function receive(event: MessageEvent) {
      if (
        event.source !== window.parent ||
        event.origin !== parentOrigin.current
      )
        return;
      if (
        event.data?.type === "supportflow:token" &&
        typeof event.data.token === "string"
      ) {
        token.current = event.data.token;
        if (activeSocket) {
          activeSocket.auth = { token: token.current };
          activeSocket.disconnect().connect();
        }
        setError("");
      } else if (event.data?.type === "supportflow:expired") {
        setReady(false);
        setError(
          "Your session expired. Reload the website to start a new conversation.",
        );
      }
    }
    window.addEventListener("message", receive);
    const refresh = setInterval(
      () =>
        window.parent.postMessage(
          { type: "supportflow:refresh" },
          parentOrigin.current,
        ),
      12 * 60 * 1000,
    );
    void (async () => {
      try {
        const r = await fetch("/api/v1/widget/conversations", {
          method: "POST",
          headers: { Authorization: `Bearer ${token.current}` },
        });
        if (!r.ok)
          throw Error(
            "Could not open the conversation. Please reload the website.",
          );
        const c = await r.json();
        if (disposed) return;
        conversationId.current = c.id;
        await load();
        if (disposed) return;
        setReady(true);
        activeSocket = io(
          process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:3001",
          { auth: { token: token.current } },
        );
        socket.current = activeSocket;
        activeSocket.on("connect", () => {
          setConnected(true);
          activeSocket?.emit("conversation:join", c.id);
          void load().catch((e) => setError(e.message));
        });
        activeSocket.on("disconnect", () => setConnected(false));
        activeSocket.on(
          "change",
          () => void load().catch((e) => setError(e.message)),
        );
        activeSocket.on("connect_error", () =>
          setError(
            "Live updates are reconnecting. You can still send messages.",
          ),
        );
      } catch (e) {
        if (!disposed)
          setError(e instanceof Error ? e.message : "Unable to connect.");
      }
    })();
    return () => {
      disposed = true;
      activeSocket?.disconnect();
      clearInterval(refresh);
      clearTimeout(typingTimer.current);
      window.removeEventListener("message", receive);
    };
  }, []);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages.length]);
  async function send(body: string) {
    if (!body.trim() || busy) return;
    setBusy(true);
    setError("");
    if (retry.current?.body !== body)
      retry.current = { body, id: crypto.randomUUID() };
    try {
      const r = await fetch(
        `/api/v1/widget/conversations/${conversationId.current}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token.current}`,
          },
          body: JSON.stringify({ body, clientMessageId: retry.current.id }),
        },
      );
      if (!r.ok)
        throw Error("Could not send. Your draft is kept; try sending again.");
      const message: Message = await r.json();
      setMessages((previous) =>
        previous.some((m) => m.id === message.id)
          ? previous
          : [...previous, message],
      );
      retry.current = null;
      setDraft("");
      socket.current?.emit("typing:stop", conversationId.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Message failed.");
    } finally {
      setBusy(false);
    }
  }
  function compose(value: string) {
    setDraft(value);
    socket.current?.emit("typing:start", conversationId.current);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(
      () => socket.current?.emit("typing:stop", conversationId.current),
      1200,
    );
  }
  return (
    <main className="widget-page">
      <header className="widget-header">
        <span className="assistant-orb">
          <Sparkles size={20} />
        </span>
        <div>
          <h1>A little help, right here.</h1>
          <p>
            AI assistant ·{" "}
            {connected ? "Live support" : "Connecting to live updates"}
          </p>
        </div>
      </header>
      <div
        ref={log}
        className="widget-messages"
        role="log"
        aria-label="Chat messages"
      >
        {!messages.length && (
          <div className="empty-state">
            <Sparkles />
            <h3>Hi there. How can we help?</h3>
            <p>Ask a question, or connect with our team.</p>
          </div>
        )}
        {messages.map((message) => (
          <div
            className={`widget-message ${message.senderType === "VISITOR" ? "visitor" : ""}`}
            key={message.id}
          >
            <small>
              {message.senderType === "VISITOR"
                ? "You"
                : message.senderType === "AI"
                  ? "AI assistant"
                  : "Support team"}
            </small>
            {message.body}
          </div>
        ))}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="text-button"
        style={{ padding: "8px 18px" }}
        disabled={!ready || busy}
        onClick={() => void send("I would like to speak to a human.")}
      >
        Talk to a person →
      </button>
      <form
        className="widget-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <input
          aria-label="Message"
          placeholder="Type your message…"
          value={draft}
          onChange={(e) => compose(e.target.value)}
          disabled={!ready}
          maxLength={4000}
        />
        <button
          className="button primary"
          aria-label="Send message"
          disabled={!ready || busy || !draft.trim()}
        >
          <Send size={16} />
        </button>
      </form>
    </main>
  );
}
