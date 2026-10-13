"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Code2,
  Command,
  Copy,
  Globe2,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Ticket as TicketIcon,
  Users,
  X,
} from "lucide-react";
import { io } from "socket.io-client";
import { createDemo, type WorkspaceData, type Article } from "../lib/demo";
import { Dialog } from "./ui/dialog";

const navigation = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "tickets", label: "Tickets", icon: TicketIcon },
  { id: "knowledge", label: "Knowledge", icon: BookOpen },
  { id: "ai", label: "AI assistant", icon: Sparkles },
  { id: "approvals", label: "Approvals", icon: ShieldCheck },
  { id: "analytics", label: "Analytics", icon: Activity },
];
const descriptions: Record<string, string> = {
  overview: "A little perspective on the conversations that matter.",
  inbox: "Good conversations. Happier customers.",
  tickets: "Keep every little detail moving forward.",
  knowledge: "A shared source of truth, for your team and your AI.",
  ai: "Thoughtful assistance. Always under your control.",
  approvals: "A human touch for the decisions that matter.",
  analytics: "Understand your impact, one conversation at a time.",
  settings: "Make this workspace feel like yours.",
};
function initials(name: string) {
  return name
    .split(" ")
    .map((v) => v[0])
    .slice(0, 2)
    .join("");
}
function time(value: string, locale: string, timeZone: string) {
  return new Date(value).toLocaleTimeString(locale, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
}
function relative(value: string, now: number | null) {
  if (now === null) return "—";
  const m = Math.max(0, Math.floor((now - new Date(value).getTime()) / 60000));
  return m < 1
    ? "Now"
    : m < 60
      ? `${m}m`
      : m < 1440
        ? `${Math.floor(m / 60)}h`
        : `${Math.floor(m / 1440)}d`;
}
const money = (c: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    c / 100,
  );

export function Workspace({
  preview = false,
  orgId,
  initialData,
}: {
  preview?: boolean;
  orgId?: string;
  initialData?: WorkspaceData;
}) {
  const [data, setData] = useState<WorkspaceData>(initialData ?? createDemo());
  const [displayFormat, setDisplayFormat] = useState({
    locale: "en-US",
    timeZone: "UTC",
  });
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const { locale, timeZone } = Intl.DateTimeFormat().resolvedOptions();
    setDisplayFormat({ locale, timeZone });
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const [page, setPage] = useState("inbox");
  const [selected, setSelected] = useState(data.conversations[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState(false);
  const [dark, setDark] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [details, setDetails] = useState(true);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [typing, setTyping] = useState<string | null>(null);
  const [modal, setModal] = useState<
    "article" | "new" | "help" | "install" | null
  >(null);
  const [editArticle, setEditArticle] = useState<Article | null>(null);
  const [articleTitle, setArticleTitle] = useState("");
  const [articleBody, setArticleBody] = useState("");
  const messageLog = useRef<HTMLDivElement>(null);
  const pendingMessage = useRef<{
    conversationId: string;
    body: string;
    internal: boolean;
    id: string;
  } | null>(null);
  const reduced = useReducedMotion();
  const notify = (message: string) => setToast(message);
  useEffect(() => {
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    setDark(localStorage.getItem("supportflow-theme") === "dark");
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("supportflow-theme", dark ? "dark" : "light");
  }, [dark]);
  const refresh = useCallback(async () => {
    if (preview || !orgId) return;
    const r = await fetch(`/api/v1/organizations/${orgId}/workspace`);
    if (r.ok) setData(await r.json());
    else setToast("Could not refresh workspace. Please try again.");
  }, [orgId, preview]);
  useEffect(() => {
    if (preview || !orgId) return;
    let dispose = () => {};
    let cancelled = false;
    fetch(`/api/v1/organizations/${orgId}/realtime-token`)
      .then((r) => r.json())
      .then(({ token }) => {
        if (cancelled || !token) return;
        const socket = io(
          process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:3001",
          { auth: { token } },
        );
        socket.on("connect", () => {
          setConnected(true);
          void refresh();
        });
        socket.on("disconnect", () => setConnected(false));
        let typingExpiry: ReturnType<typeof setTimeout> | undefined;
        socket.on("change", () => void refresh());
        socket.on(
          "typing:changed",
          ({
            active,
            conversationId,
          }: {
            active: boolean;
            conversationId: string;
          }) => {
            setTyping(active ? conversationId : null);
            clearTimeout(typingExpiry);
            typingExpiry = setTimeout(() => setTyping(null), 3000);
          },
        );
        const renew = setInterval(
          () => {
            void fetch(`/api/v1/organizations/${orgId}/realtime-token`)
              .then((r) => r.json())
              .then(({ token: freshToken }) => {
                if (freshToken) {
                  socket.auth = { token: freshToken };
                  socket.disconnect().connect();
                }
              })
              .catch(() => setConnected(false));
          },
          12 * 60 * 1000,
        );
        dispose = () => {
          clearInterval(renew);
          clearTimeout(typingExpiry);
          socket.disconnect();
        };
      })
      .catch(() => setConnected(false));
    return () => {
      cancelled = true;
      dispose();
    };
  }, [preview, orgId, refresh]);
  const conversation = data.conversations.find((c) => c.id === selected);
  const messageCount = conversation?.messages.length ?? 0;
  useEffect(() => {
    if (messageLog.current)
      messageLog.current.scrollTop = messageLog.current.scrollHeight;
  }, [selected, messageCount]);
  const open = data.conversations.filter((c) => c.status !== "RESOLVED").length;
  const pending = data.proposals.filter((p) => p.state === "PENDING").length;
  const resolved = data.conversations.filter(
    (c) => c.status === "RESOLVED",
  ).length;
  const filtered = data.conversations.filter(
    (c) =>
      `${c.visitor.name} ${c.subject} ${c.messages.map((m) => m.body).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter === "All" ||
        (filter === "Mine" && c.assignedUserId === data.userId) ||
        (filter === "Unassigned" && !c.assignedUserId) ||
        (filter === "Resolved" && c.status === "RESOLVED")),
  );
  const title = navigation.find((n) => n.id === page)?.label ?? "Settings";
  const canManage = data.role === "OWNER" || data.role === "ADMIN";
  const canReply = data.role !== "VIEWER";
  async function mutate(
    path: string,
    body: unknown,
    local: (d: WorkspaceData) => WorkspaceData,
    success: string,
    method = "POST",
  ) {
    setBusy(true);
    try {
      if (preview) setData((d) => local(d));
      else {
        const r = await fetch(`/api/v1/organizations/${orgId}/${path}`, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          const error = await r.json();
          throw new Error(error.message ?? "Could not save your changes.");
        }
        await refresh();
      }
      if (success) notify(preview ? `${success} · local preview` : success);
      return true;
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "Something went wrong. Please retry.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    if (!conversation || !draft.trim()) return;
    const body = draft.trim();
    if (
      pendingMessage.current?.conversationId !== conversation.id ||
      pendingMessage.current?.body !== body ||
      pendingMessage.current?.internal !== note
    )
      pendingMessage.current = {
        conversationId: conversation.id,
        body,
        internal: note,
        id: crypto.randomUUID(),
      };
    const id = pendingMessage.current.id;
    if (
      await mutate(
        `conversations/${conversation.id}/messages`,
        { body, clientMessageId: id, internal: note },
        (d) => ({
          ...d,
          conversations: d.conversations.map((c) =>
            c.id === selected
              ? {
                  ...c,
                  messages: [
                    ...c.messages,
                    {
                      id,
                      body,
                      senderType: "AGENT",
                      createdAt: new Date().toISOString(),
                      internal: note,
                    },
                  ],
                  lastMessageAt: new Date().toISOString(),
                }
              : c,
          ),
        }),
        "Message saved",
      )
    ) {
      setDraft("");
      pendingMessage.current = null;
    }
  }
  function updateConversation(
    status?: "OPEN" | "PENDING" | "RESOLVED",
    takeover = false,
  ) {
    if (!conversation) return;
    void mutate(
      `conversations/${conversation.id}/${takeover ? "handoff" : "status"}`,
      { status, version: conversation.version },
      (d) => ({
        ...d,
        conversations: d.conversations.map((c) =>
          c.id === selected
            ? {
                ...c,
                status: status ?? c.status,
                aiEnabled: takeover ? false : c.aiEnabled,
                assignedUserId: takeover ? d.userId : c.assignedUserId,
                version: c.version + 1,
              }
            : c,
        ),
      }),
      takeover
        ? "You’re now handling this conversation"
        : status === "RESOLVED"
          ? "Conversation resolved"
          : "Conversation reopened",
    );
  }
  function openArticle(article?: Article) {
    setEditArticle(article ?? null);
    setArticleTitle(article?.title ?? "");
    setArticleBody(article?.body ?? "");
    setModal("article");
  }
  async function saveArticle(published: boolean) {
    const id = editArticle?.id ?? crypto.randomUUID();
    const body = { title: articleTitle, body: articleBody, published };
    if (
      await mutate(
        `knowledge${editArticle ? `/${id}` : ""}`,
        body,
        (d) => ({
          ...d,
          articles: [
            {
              ...body,
              id,
              version: (editArticle?.version ?? 0) + 1,
              updatedAt: new Date().toISOString(),
            },
            ...d.articles.filter((a) => a.id !== id),
          ],
        }),
        published ? "Article published" : "Draft saved",
        editArticle ? "PATCH" : "POST",
      )
    )
      setModal(null);
  }
  const embed = `<script async src="${typeof window === "undefined" ? "http://localhost:3000" : window.location.origin}/supportflow.js" data-installation-key="${data.installations[0]?.publicKey ?? ""}"></script>`;
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify("Copied to clipboard");
    } catch {
      notify("Clipboard unavailable. Select and copy the code below.");
    }
  }
  const chart = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const day = new Date();
        day.setDate(day.getDate() - 6 + i);
        return {
          label: day.toLocaleDateString("en-US", { weekday: "short" }),
          count: data.conversations.filter(
            (c) =>
              new Date(c.lastMessageAt).toDateString() === day.toDateString(),
          ).length,
        };
      }),
    [data.conversations],
  );
  return (
    <div className="app-shell">
      {sidebar && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside className={`sidebar ${sidebar ? "is-open" : ""}`}>
        <a href="/" className="brand">
          <span className="brand-mark">
            <ArrowDownLeft size={21} />
            <ArrowUpRight size={21} />
          </span>
          SupportFlow<span className="brand-ai">AI</span>
        </a>
        <div className="organization-switch">
          <span className="org-avatar">{data.organization.name[0]}</span>
          <div>
            <strong>{data.organization.name}</strong>
            <small>Team workspace</small>
          </div>
          <select
            aria-label="Switch organization"
            value={data.organization.slug}
            onChange={(e) => {
              if (preview) {
                const next = createDemo(e.target.value);
                setData(next);
                setSelected(next.conversations[0].id);
                notify("Switched local preview organization");
              } else window.location.href = `/workspace/${e.target.value}`;
            }}
          >
            <option value={data.organization.slug}>
              {data.organization.name}
            </option>
            {preview && (
              <option
                value={
                  data.organization.slug === "acme-bikes"
                    ? "northstar-gadgets"
                    : "acme-bikes"
                }
              >
                {data.organization.slug === "acme-bikes"
                  ? "Northstar Gadgets"
                  : "Acme Bikes"}
              </option>
            )}
          </select>
          <ChevronDown size={15} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              onClick={() => {
                setPage(id);
                setSidebar(false);
                setQuery("");
              }}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "inbox" && <span className="nav-count">{open}</span>}
              {id === "approvals" && pending > 0 && (
                <span className="approval-dot" />
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="assistant-card">
            <span className="assistant-orb">
              <Sparkles size={18} />
            </span>
            <strong>A little more superhuman.</strong>
            <p>
              Your AI handles the everyday.
              <br />
              You handle the meaningful.
            </p>
            <button onClick={() => setPage("ai")}>
              Meet your assistant <ArrowRight size={14} />
            </button>
          </div>
          <button
            className={`nav-item ${page === "settings" ? "active" : ""}`}
            onClick={() => setPage("settings")}
          >
            <Settings2 size={19} />
            <span>Settings</span>
          </button>
          <button className="nav-item" onClick={() => setModal("help")}>
            <CircleHelp size={19} />
            <span>Help & getting started</span>
            <ArrowUpRight size={14} />
          </button>
          <div className="profile">
            <span className="avatar avatar-violet">AM</span>
            <div>
              <strong>
                {preview
                  ? "Alex Morgan"
                  : (data.members.find((m) => m.role === data.role)?.user
                      .name ?? "Team member")}
              </strong>
              <small>
                {data.role.toLowerCase()} · {preview ? "Preview" : "Workspace"}
              </small>
            </div>
            <button
              className="icon-button"
              aria-label={dark ? "Use light appearance" : "Use dark appearance"}
              onClick={() => setDark((v) => !v)}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setSidebar(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <span className={`connection ${preview ? "preview" : ""}`}>
              <span />
              {preview
                ? "Interactive preview"
                : connected
                  ? "Live connection"
                  : "Reconnecting"}
            </span>
            {preview ? (
              <a className="subtle-link" href="/login">
                Sign in <ArrowUpRight size={14} />
              </a>
            ) : (
              <a
                className="icon-button"
                href="/api/auth/signout"
                aria-label="Sign out"
              >
                <LogOut size={18} />
              </a>
            )}
            <button
              className="icon-button"
              onClick={() => setModal("help")}
              aria-label="Workspace help"
            >
              <CircleHelp size={18} />
            </button>
          </div>
        </header>
        <div className="page-heading">
          <div>
            <div className="eyebrow">YOUR SUPPORT, IN FLOW</div>
            <h1>
              {title}
              <span className="heading-dot">.</span>
            </h1>
            <p>{descriptions[page]}</p>
          </div>
          <div className="heading-actions">
            {page === "inbox" ? (
              <>
                <span className="team-avatars">
                  <span>AM</span>
                  <span>JC</span>
                  <span>+1</span>
                </span>
                <button
                  className="button primary"
                  onClick={() => setModal("new")}
                >
                  <Plus size={17} />
                  New ticket
                </button>
              </>
            ) : page === "knowledge" && canManage ? (
              <button className="button primary" onClick={() => openArticle()}>
                <Plus size={17} />
                New article
              </button>
            ) : (
              <button
                className="button secondary"
                onClick={() => setModal("install")}
              >
                <Code2 size={16} />
                Install widget
              </button>
            )}
          </div>
        </div>
        {(page === "inbox" || page === "overview") && (
          <div className="summary-strip">
            <div>
              <span className="metric-icon lavender">
                <Inbox size={18} />
              </span>
              <div>
                <small>Open conversations</small>
                <strong>
                  {open}
                  <span>Across your workspace</span>
                </strong>
              </div>
            </div>
            <div>
              <span className="metric-icon mint">
                <Sparkles size={18} />
              </span>
              <div>
                <small>AI-assisted</small>
                <strong>
                  {data.conversations.filter((c) => c.aiEnabled).length}
                  <span>Room for a human touch</span>
                </strong>
              </div>
            </div>
            <div>
              <span className="metric-icon peach">
                <ShieldCheck size={18} />
              </span>
              <div>
                <small>Needs your approval</small>
                <strong>
                  {pending}
                  <button onClick={() => setPage("approvals")}>
                    Take a look <ArrowRight size={12} />
                  </button>
                </strong>
              </div>
            </div>
            <div>
              <span className="metric-icon blue">
                <CheckCheck size={18} />
              </span>
              <div>
                <small>Resolved conversations</small>
                <strong>
                  {resolved}
                  <span>A little peace of mind</span>
                </strong>
              </div>
            </div>
          </div>
        )}
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            initial={{ opacity: 0, y: reduced ? 0 : 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.16 }}
            className="page-content"
          >
            {page === "inbox" && (
              <section
                className={`inbox-layout ${details ? "" : "hide-details"} ${conversation ? "has-conversation" : ""}`}
              >
                <div className="conversation-list">
                  <div className="list-heading">
                    <h2>
                      Conversations <span>{data.conversations.length}</span>
                    </h2>
                    <button
                      className="icon-button"
                      aria-label="Toggle customer details"
                      onClick={() => setDetails((v) => !v)}
                    >
                      <SlidersHorizontal size={17} />
                    </button>
                  </div>
                  <label className="search-field">
                    <Search size={17} />
                    <input
                      placeholder="Search conversations"
                      aria-label="Search conversations"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <kbd>⌕</kbd>
                  </label>
                  <div
                    className="filter-tabs"
                    role="tablist"
                    aria-label="Conversation filter"
                  >
                    {["All", "Mine", "Unassigned", "Resolved"].map((f) => (
                      <button
                        role="tab"
                        aria-selected={filter === f}
                        key={f}
                        onClick={() => setFilter(f)}
                        className={filter === f ? "selected" : ""}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                  <div className="conversation-scroll">
                    {filtered.map((c, i) => (
                      <button
                        key={c.id}
                        className={`conversation-item ${c.id === selected ? "selected" : ""}`}
                        onClick={() => {
                          setSelected(c.id);
                          setDraft("");
                        }}
                      >
                        <span
                          className={`avatar avatar-${["peach", "violet", "mint", "blue"][i % 4]}`}
                        >
                          {initials(c.visitor.name)}
                        </span>
                        <div className="conversation-preview">
                          <div>
                            <strong>{c.visitor.name}</strong>
                            <time>{relative(c.lastMessageAt, now)}</time>
                          </div>
                          <span className="subject">{c.subject}</span>
                          <p>
                            {c.messages.at(-1)?.body ?? "Start a conversation"}
                          </p>
                          <div className="conversation-tags">
                            <span
                              className={`tiny-tag ${c.status === "RESOLVED" ? "green" : c.aiEnabled ? "purple" : ""}`}
                            >
                              {c.status === "RESOLVED" ? (
                                <Check size={10} />
                              ) : c.aiEnabled ? (
                                <Sparkles size={10} />
                              ) : (
                                <Users size={10} />
                              )}{" "}
                              {c.status === "RESOLVED"
                                ? "Resolved"
                                : c.aiEnabled
                                  ? "AI assisted"
                                  : "Human support"}
                            </span>
                            {c.status === "PENDING" && (
                              <span className="tiny-tag amber">
                                Needs attention
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                    {filtered.length === 0 && (
                      <div className="empty-state">
                        <Search />
                        <h3>No conversations found</h3>
                        <p>Try a different name, message, or filter.</p>
                        <button
                          className="button secondary"
                          onClick={() => {
                            setQuery("");
                            setFilter("All");
                          }}
                        >
                          Clear filters
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="list-footer">
                    <span className="small-dot" />{" "}
                    {preview
                      ? "Sample conversations · changes stay in this tab"
                      : "Synced from your workspace"}
                  </div>
                </div>
                {conversation ? (
                  <div className="thread">
                    <header className="thread-header">
                      <button
                        className="icon-button back-list"
                        aria-label="Back to conversations"
                        onClick={() => setSelected("")}
                      >
                        <ChevronLeft size={20} />
                      </button>
                      <div>
                        <h2>
                          {conversation.visitor.name}
                          <span className="small-dot" />
                        </h2>
                        <p>{conversation.subject}</p>
                      </div>
                      <div className="thread-actions">
                        <button
                          className="icon-button"
                          aria-label="Show customer details"
                          onClick={() => setDetails((v) => !v)}
                        >
                          <MoreHorizontal size={21} />
                        </button>
                        {canReply && (
                          <button
                            className="button resolve"
                            disabled={busy}
                            onClick={() =>
                              updateConversation(
                                conversation.status === "RESOLVED"
                                  ? "OPEN"
                                  : "RESOLVED",
                              )
                            }
                          >
                            <Check size={15} />
                            {conversation.status === "RESOLVED"
                              ? "Reopen"
                              : "Resolve"}
                          </button>
                        )}
                      </div>
                    </header>
                    <div className="ai-banner">
                      <span className="assistant-orb small">
                        <Sparkles size={15} />
                      </span>
                      <div>
                        <strong>
                          {conversation.aiEnabled
                            ? "A little help from AI"
                            : "You’re in the conversation"}
                        </strong>
                        <span>
                          {conversation.aiEnabled
                            ? "Your assistant is here. Take over whenever you like."
                            : "AI is paused. Your replies go directly to the customer."}
                        </span>
                      </div>
                      {conversation.aiEnabled && canReply && (
                        <button
                          onClick={() => updateConversation(undefined, true)}
                          disabled={busy}
                        >
                          Take over <ArrowRight size={13} />
                        </button>
                      )}
                    </div>
                    <div
                      ref={messageLog}
                      className="messages"
                      role="log"
                      aria-label="Conversation messages"
                    >
                      <div className="date-divider">
                        <span>
                          {new Date(
                            conversation.messages[0]?.createdAt ??
                              conversation.lastMessageAt,
                          ).toLocaleDateString(displayFormat.locale, {
                            timeZone: displayFormat.timeZone,
                            month: "long",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                      {conversation.messages.map((m) => (
                        <div
                          key={m.id}
                          className={`message-row ${m.senderType === "AGENT" ? "outgoing" : ""} ${m.internal ? "internal" : ""}`}
                        >
                          <span
                            className={`avatar small-avatar ${m.senderType === "AI" ? "ai-avatar" : m.senderType === "AGENT" ? "avatar-violet" : "avatar-peach"}`}
                          >
                            {m.senderType === "AI" ? (
                              <Sparkles size={14} />
                            ) : m.senderType === "AGENT" ? (
                              "AM"
                            ) : (
                              initials(conversation.visitor.name)
                            )}
                          </span>
                          <div className="message-content">
                            <div className="message-author">
                              {m.internal
                                ? "Internal note"
                                : m.senderType === "AI"
                                  ? "SupportFlow AI"
                                  : m.senderType === "AGENT"
                                    ? "You"
                                    : conversation.visitor.name.split(" ")[0]}
                              {m.senderType === "AI" && <span>ASSISTANT</span>}
                              <time>
                                {time(
                                  m.createdAt,
                                  displayFormat.locale,
                                  displayFormat.timeZone,
                                )}
                              </time>
                            </div>
                            <div className="message-bubble">{m.body}</div>
                            {m.senderType === "AI" && (
                              <span className="message-source">
                                <ShieldCheck size={11} />
                                {preview
                                  ? "Simulated answer · preview data"
                                  : "AI assistant · verified workspace context"}
                              </span>
                            )}
                            {m.senderType === "AGENT" && (
                              <span className="message-source sent">
                                <Check size={12} /> Saved
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                      {typing === selected && (
                        <p className="typing-label">Customer is typing…</p>
                      )}
                    </div>
                    <div className="composer">
                      <div className="composer-tabs">
                        <button
                          className={!note ? "selected" : ""}
                          onClick={() => setNote(false)}
                        >
                          <MessageCircle size={14} />
                          Reply
                        </button>
                        <button
                          className={note ? "selected" : ""}
                          onClick={() => setNote(true)}
                        >
                          <BookOpen size={14} />
                          Internal note
                        </button>
                        <span>
                          {note
                            ? "Only visible to your team"
                            : "Visible to the customer"}
                        </span>
                      </div>
                      <textarea
                        aria-label={
                          note ? "Internal note" : "Reply to customer"
                        }
                        placeholder={
                          note
                            ? "Leave a note for your team…"
                            : "A thoughtful reply starts here…"
                        }
                        value={draft}
                        disabled={!canReply}
                        onChange={(e) => setDraft(e.target.value)}
                        maxLength={4000}
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                            e.preventDefault();
                            void send();
                          }
                        }}
                      />
                      <div className="composer-bottom">
                        <span>
                          <Command size={12} /> Enter to send
                        </span>
                        <button
                          className="button primary"
                          disabled={!draft.trim() || busy || !canReply}
                          onClick={() => void send()}
                        >
                          {busy ? "Saving…" : note ? "Save note" : "Send reply"}
                          <Send size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="thread-footer">
                      <ShieldCheck size={12} />A human touch, supported by AI.
                    </div>
                  </div>
                ) : (
                  <div className="empty-state">
                    <MessageCircle size={35} />
                    <h3>A conversation starts here</h3>
                    <p>Select a customer to see their story.</p>
                  </div>
                )}
                {details && conversation && (
                  <aside className="customer-panel">
                    <div className="panel-title">
                      Customer details
                      <button
                        className="icon-button"
                        aria-label="Hide customer details"
                        onClick={() => setDetails(false)}
                      >
                        <X size={15} />
                      </button>
                    </div>
                    <div className="customer-profile">
                      <span className="large-avatar avatar-peach">
                        {initials(conversation.visitor.name)}
                      </span>
                      <h3>{conversation.visitor.name}</h3>
                      <span>Website visitor</span>
                      <span className="pill">
                        <Globe2 size={12} /> Web chat
                      </span>
                    </div>
                    <div className="detail-section">
                      <h4>CONVERSATION</h4>
                      <dl>
                        <div>
                          <dt>Status</dt>
                          <dd>
                            <span
                              className={`tiny-tag ${conversation.status === "RESOLVED" ? "green" : "blue"}`}
                            >
                              {conversation.status.toLowerCase()}
                            </span>
                          </dd>
                        </div>
                        <div>
                          <dt>Assigned to</dt>
                          <dd>
                            {conversation.assignedUserId ? "You" : "Unassigned"}
                          </dd>
                        </div>
                        <div>
                          <dt>Handled by</dt>
                          <dd>
                            {conversation.aiEnabled ? (
                              <>
                                <Sparkles size={12} /> AI assistant
                              </>
                            ) : (
                              "Support team"
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Channel</dt>
                          <dd>Website</dd>
                        </div>
                      </dl>
                    </div>
                    <div className="detail-section">
                      <h4>CONNECTED TICKETS</h4>
                      {data.tickets
                        .filter((t) => t.conversationId === selected)
                        .map((t) => (
                          <button
                            className="linked-ticket"
                            key={t.id}
                            onClick={() => setPage("tickets")}
                          >
                            <TicketIcon size={15} />
                            <div>
                              <strong>{t.subject}</strong>
                              <small>{t.priority.toLowerCase()} priority</small>
                            </div>
                            <ChevronRight size={13} />
                          </button>
                        ))}
                    </div>
                    <div className="detail-section">
                      <h4>HELPFUL KNOWLEDGE</h4>
                      {data.articles
                        .filter((a) => a.published)
                        .slice(0, 2)
                        .map((a) => (
                          <button
                            className="knowledge-link"
                            key={a.id}
                            onClick={() => openArticle(a)}
                          >
                            <BookOpen size={14} />
                            {a.title}
                            <ArrowUpRight size={12} />
                          </button>
                        ))}
                    </div>
                    <div className="privacy-note">
                      <ShieldCheck size={15} />
                      <p>
                        A little trust goes a long way.
                        <br />
                        Customer data stays in this workspace.
                      </p>
                    </div>
                  </aside>
                )}
              </section>
            )}
            {(page === "analytics" || page === "overview") && (
              <div className="dashboard-grid">
                <section className="surface chart-card">
                  <div className="section-header">
                    <div>
                      <h2>Every conversation counts</h2>
                      <p>Conversation activity over the last 7 days</p>
                    </div>
                    <span className="pill">Last 7 days</span>
                  </div>
                  <div className="chart-total">
                    {chart.reduce((s, d) => s + d.count, 0)}
                    <span>conversations with activity</span>
                  </div>
                  <div
                    className="bar-chart"
                    role="img"
                    aria-label={chart
                      .map((d) => `${d.label}: ${d.count}`)
                      .join(", ")}
                  >
                    {chart.map((d, i) => (
                      <div className="bar-column" key={i}>
                        <span>{d.count}</span>
                        <div className="bar-track">
                          <div
                            style={{
                              height: `${Math.max(2, (d.count / Math.max(1, ...chart.map((c) => c.count))) * 100)}%`,
                            }}
                          />
                        </div>
                        <small>{d.label}</small>
                      </div>
                    ))}
                  </div>
                  <div className="chart-note">
                    <span className="small-dot" />{" "}
                    {preview
                      ? "Computed from sample conversations"
                      : "Computed from saved conversations"}{" "}
                    · grouped by latest activity
                  </div>
                </section>
                <section className="surface resolution-card">
                  <span className="metric-icon mint">
                    <CheckCheck size={24} />
                  </span>
                  <h2>Moving things forward.</h2>
                  <p>
                    Behind every resolution is a customer ready for what’s next.
                  </p>
                  <div
                    className="donut"
                    style={{
                      background: `conic-gradient(var(--accent) ${(resolved / Math.max(1, data.conversations.length)) * 360}deg, var(--line) 0deg)`,
                    }}
                  >
                    <div>
                      <strong>
                        {Math.round(
                          (resolved / Math.max(1, data.conversations.length)) *
                            100,
                        )}
                        <small>%</small>
                      </strong>
                      <span>resolved</span>
                    </div>
                  </div>
                  <div className="resolution-legend">
                    <span>{resolved} resolved</span>
                    <span>{data.conversations.length} total</span>
                  </div>
                </section>
                <section className="surface wide">
                  <div className="section-header">
                    <div>
                      <h2>Clearer context. Better decisions.</h2>
                      <p>Workspace totals, with transparent definitions.</p>
                    </div>
                    <Activity size={20} />
                  </div>
                  <div className="analytic-metrics">
                    <div>
                      <strong>
                        {data.conversations.filter((c) => !c.aiEnabled).length}
                      </strong>
                      <span>Human-handled conversations</span>
                      <small>AI is currently paused</small>
                    </div>
                    <div>
                      <strong>
                        {data.articles.filter((a) => a.published).length}
                      </strong>
                      <span>Published knowledge articles</span>
                      <small>Available to the assistant</small>
                    </div>
                    <div>
                      <strong>
                        {
                          data.proposals.filter((p) => p.state === "EXECUTED")
                            .length
                        }
                      </strong>
                      <span>Simulated refunds completed</span>
                      <small>Human approval required</small>
                    </div>
                  </div>
                </section>
              </div>
            )}
            {page === "tickets" && (
              <section className="surface">
                <div className="section-header">
                  <div>
                    <h2>
                      All tickets{" "}
                      <span className="count-pill">{data.tickets.length}</span>
                    </h2>
                    <p>The details are in good hands.</p>
                  </div>
                  <button
                    className="button primary"
                    onClick={() => setModal("new")}
                  >
                    <Plus size={16} />
                    New ticket
                  </button>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Ticket</th>
                        <th>Priority</th>
                        <th>Status</th>
                        <th>Conversation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.tickets.map((t, i) => (
                        <tr key={t.id}>
                          <td>
                            <small className="ticket-number">
                              SF-{1001 + i}
                            </small>
                            <strong>{t.subject}</strong>
                          </td>
                          <td>
                            <select
                              aria-label={`Priority for ${t.subject}`}
                              value={t.priority}
                              disabled={!canReply || busy}
                              onChange={(e) =>
                                void mutate(
                                  `tickets/${t.id}`,
                                  {
                                    status: t.status,
                                    priority: e.target.value,
                                  },
                                  (d) => ({
                                    ...d,
                                    tickets: d.tickets.map((x) =>
                                      x.id === t.id
                                        ? { ...x, priority: e.target.value }
                                        : x,
                                    ),
                                  }),
                                  "Priority updated",
                                  "PATCH",
                                )
                              }
                            >
                              {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => (
                                <option key={p}>{p}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              aria-label={`Status for ${t.subject}`}
                              value={t.status}
                              disabled={!canReply || busy}
                              onChange={(e) =>
                                void mutate(
                                  `tickets/${t.id}`,
                                  {
                                    status: e.target.value,
                                    priority: t.priority,
                                  },
                                  (d) => ({
                                    ...d,
                                    tickets: d.tickets.map((x) =>
                                      x.id === t.id
                                        ? {
                                            ...x,
                                            status: e.target
                                              .value as typeof x.status,
                                          }
                                        : x,
                                    ),
                                  }),
                                  "Ticket updated",
                                  "PATCH",
                                )
                              }
                            >
                              {["OPEN", "PENDING", "RESOLVED"].map((s) => (
                                <option key={s}>{s}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <button
                              className="text-button"
                              onClick={() => {
                                setSelected(t.conversationId);
                                setPage("inbox");
                              }}
                            >
                              Open conversation
                              <ArrowUpRight size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!data.tickets.length && (
                  <div className="empty-state">
                    <TicketIcon />
                    <h3>A clean slate</h3>
                    <p>Create a ticket from an existing conversation.</p>
                  </div>
                )}
              </section>
            )}
            {page === "knowledge" && (
              <>
                <div className="content-toolbar">
                  <label className="search-field">
                    <Search size={17} />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      aria-label="Search knowledge"
                      placeholder="Find a little knowledge…"
                    />
                  </label>
                  <span>
                    {data.articles.filter((a) => a.published).length} published
                    · {data.articles.filter((a) => !a.published).length} drafts
                  </span>
                </div>
                <div className="knowledge-grid">
                  {data.articles
                    .filter((a) =>
                      (a.title + a.body)
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .map((a, i) => (
                      <button
                        className="surface article-card"
                        key={a.id}
                        onClick={() => openArticle(a)}
                      >
                        <div className="article-top">
                          <span
                            className={`metric-icon ${["lavender", "mint", "peach", "blue"][i % 4]}`}
                          >
                            <BookOpen size={21} />
                          </span>
                          <span
                            className={`tiny-tag ${a.published ? "green" : ""}`}
                          >
                            {a.published ? "Published" : "Draft"}
                          </span>
                        </div>
                        <h2>{a.title}</h2>
                        <p>{a.body}</p>
                        <div className="article-footer">
                          <span>Version {a.version}</span>
                          <ArrowUpRight size={16} />
                        </div>
                      </button>
                    ))}
                </div>
              </>
            )}
            {page === "approvals" && (
              <>
                <div className="info-banner">
                  <ShieldCheck size={21} />
                  <div>
                    <strong>You have the final say.</strong>
                    <p>
                      Your assistant can suggest a refund. Only an authorized
                      person can approve it. All refunds in this project are
                      simulated.
                    </p>
                  </div>
                </div>
                <div className="approval-grid">
                  {data.proposals.map((p) => (
                    <section className="surface approval-card" key={p.id}>
                      <div className="section-header">
                        <span className="metric-icon peach">
                          <ArrowDownLeft size={22} />
                        </span>
                        <span
                          className={`tiny-tag ${p.state === "PENDING" ? "amber" : p.state === "REJECTED" ? "" : "green"}`}
                        >
                          {p.state.replaceAll("_", " ").toLowerCase()}
                        </span>
                      </div>
                      <h2>Refund request</h2>
                      <div className="refund-amount">
                        {money(p.amountCents)}
                        <span>USD · simulated</span>
                      </div>
                      <p>{p.reason}</p>
                      <dl>
                        <div>
                          <dt>Order</dt>
                          <dd>{p.orderNumber}</dd>
                        </div>
                        <div>
                          <dt>Requested</dt>
                          <dd>
                            {new Date(p.createdAt).toLocaleDateString(
                              displayFormat.locale,
                              { timeZone: displayFormat.timeZone },
                            )}
                          </dd>
                        </div>
                        {p.approvedBy && (
                          <div>
                            <dt>Reviewed by</dt>
                            <dd>
                              {p.approvedBy === "demo-user"
                                ? "You"
                                : p.approvedBy}
                            </dd>
                          </div>
                        )}
                      </dl>
                      {p.state === "PENDING" && canManage ? (
                        <div className="approval-actions">
                          <button
                            className="button secondary"
                            disabled={busy}
                            onClick={() =>
                              void mutate(
                                `action-proposals/${p.id}/reject`,
                                {},
                                (d) => ({
                                  ...d,
                                  proposals: d.proposals.map((x) =>
                                    x.id === p.id
                                      ? {
                                          ...x,
                                          state: "REJECTED",
                                          approvedBy: d.userId,
                                        }
                                      : x,
                                  ),
                                }),
                                "Proposal rejected",
                              )
                            }
                          >
                            Reject
                          </button>
                          <button
                            className="button primary"
                            disabled={busy}
                            onClick={() =>
                              void mutate(
                                `action-proposals/${p.id}/approve`,
                                {},
                                (d) => ({
                                  ...d,
                                  proposals: d.proposals.map((x) =>
                                    x.id === p.id
                                      ? {
                                          ...x,
                                          state: "APPROVED",
                                          approvedBy: d.userId,
                                        }
                                      : x,
                                  ),
                                }),
                                "Proposal approved",
                              )
                            }
                          >
                            <Check size={16} />
                            Approve refund
                          </button>
                        </div>
                      ) : (
                        <div className="approval-state">
                          <ShieldCheck size={15} />
                          {p.state === "APPROVED"
                            ? "Approved · awaiting worker execution"
                            : p.state === "EXECUTED"
                              ? "Simulated refund completed"
                              : p.state === "REJECTED"
                                ? "No refund will be executed"
                                : "Review restricted to workspace admins"}
                        </div>
                      )}
                    </section>
                  ))}
                </div>
                {!data.proposals.length && (
                  <div className="empty-state">
                    <ShieldCheck />
                    <h3>You’re all caught up</h3>
                    <p>New action proposals will appear here.</p>
                  </div>
                )}
              </>
            )}
            {page === "ai" && (
              <div className="dashboard-grid">
                <section className="surface ai-hero">
                  <span className="assistant-orb hero-orb">
                    <Sparkles size={34} />
                  </span>
                  <span className="pill">DETERMINISTIC MOCK MODE</span>
                  <h2>
                    A helping hand.
                    <br />
                    With clear boundaries.
                  </h2>
                  <p>
                    Answers grounded in your knowledge. Order details scoped to
                    the customer. Sensitive decisions left to you.
                  </p>
                  <div className="setting-row">
                    <div>
                      <strong>Workspace assistant</strong>
                      <p>Allow AI responses to new customer messages</p>
                    </div>
                    <button
                      className={`toggle ${data.organization.aiEnabled ? "on" : ""}`}
                      role="switch"
                      aria-label="Enable workspace AI"
                      aria-checked={data.organization.aiEnabled}
                      disabled={!canManage || busy}
                      onClick={() =>
                        void mutate(
                          "settings",
                          { aiEnabled: !data.organization.aiEnabled },
                          (d) => ({
                            ...d,
                            organization: {
                              ...d.organization,
                              aiEnabled: !d.organization.aiEnabled,
                            },
                          }),
                          "AI policy updated",
                          "PATCH",
                        )
                      }
                    >
                      <span />
                    </button>
                  </div>
                </section>
                <section className="surface tools-card">
                  <h2>Small tools. Thoughtful limits.</h2>
                  <p>Server-verified permissions, every time.</p>
                  {[
                    {
                      icon: BookOpen,
                      title: "Find trusted answers",
                      body: "Published workspace knowledge only.",
                    },
                    {
                      icon: Search,
                      title: "Look up an order",
                      body: "Only orders owned by this visitor.",
                    },
                    {
                      icon: Users,
                      title: "Bring in a human",
                      body: "Pause AI and hand off to your team.",
                    },
                    {
                      icon: ShieldCheck,
                      title: "Suggest a refund",
                      body: "Create a proposal. Never execute a refund.",
                    },
                  ].map(({ icon: Icon, title, body }) => (
                    <div className="tool-row" key={title}>
                      <span className="metric-icon lavender">
                        <Icon size={18} />
                      </span>
                      <div>
                        <strong>{title}</strong>
                        <p>{body}</p>
                      </div>
                      <Check size={16} />
                    </div>
                  ))}
                </section>
              </div>
            )}
            {page === "settings" && (
              <div className="settings-layout">
                <section className="surface">
                  <div className="section-header">
                    <div>
                      <h2>Workspace preferences</h2>
                      <p>The essentials, all in one place.</p>
                    </div>
                    <Settings2 size={20} />
                  </div>
                  <div className="settings-body">
                    <label className="field">
                      Organization
                      <input value={data.organization.name} readOnly />
                    </label>
                    <div className="setting-row">
                      <div>
                        <strong>Dark appearance</strong>
                        <p>A quieter canvas for your evening.</p>
                      </div>
                      <button
                        className={`toggle ${dark ? "on" : ""}`}
                        role="switch"
                        aria-checked={dark}
                        aria-label="Dark appearance"
                        onClick={() => setDark((v) => !v)}
                      >
                        <span />
                      </button>
                    </div>
                    <div className="setting-row">
                      <div>
                        <strong>Retention preference</strong>
                        <p>Purge scheduling is not enabled in this build.</p>
                      </div>
                      <span className="pill">
                        {data.organization.retentionDays} days
                      </span>
                    </div>
                  </div>
                </section>
                <section className="surface">
                  <div className="section-header">
                    <div>
                      <h2>Your people</h2>
                      <p>A little teamwork goes a long way.</p>
                    </div>
                    <Users size={20} />
                  </div>
                  {data.members.map((m, i) => (
                    <div className="member-row" key={m.user.email}>
                      <span
                        className={`avatar avatar-${i ? "mint" : "violet"}`}
                      >
                        {initials(m.user.name)}
                      </span>
                      <div>
                        <strong>{m.user.name}</strong>
                        <small>{m.user.email}</small>
                      </div>
                      <span className="pill">{m.role.toLowerCase()}</span>
                    </div>
                  ))}
                </section>
                <section className="surface wide">
                  <div className="section-header">
                    <div>
                      <h2>Be there for your customers</h2>
                      <p>Add a small chat button to your website.</p>
                    </div>
                    <button
                      className="button secondary"
                      onClick={() => void copy(embed)}
                    >
                      <Copy size={15} />
                      Copy code
                    </button>
                  </div>
                  <pre className="embed-code">{embed}</pre>
                  <div className="allowed-origins">
                    <Globe2 size={15} />
                    Allowed origins:{" "}
                    {data.installations[0]?.allowedOrigins.join(", ") ??
                      "No installation configured"}
                  </div>
                </section>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
        <footer className="app-footer">
          <span>Made for conversations that matter.</span>
          <span>
            <span className="small-dot" />
            {preview
              ? "Preview data · resets on refresh"
              : "Connected workspace"}
          </span>
        </footer>
      </main>
      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            className="toast"
            initial={{ opacity: 0, y: reduced ? 0 : 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Check size={17} />
            {toast}
            <button
              aria-label="Dismiss notification"
              onClick={() => setToast("")}
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <Dialog
        open={modal !== null}
        onOpenChange={(v) => {
          if (!v) setModal(null);
        }}
        title={
          modal === "article"
            ? editArticle
              ? "Knowledge article"
              : "Share a little knowledge"
            : modal === "new"
              ? "Create a ticket"
              : modal === "install"
                ? "A warm welcome, on your website"
                : "Welcome to your flow."
        }
        description={
          modal === "article"
            ? "Published articles are available to your assistant."
            : modal === "new"
              ? "Turn a conversation into a clear next step."
              : modal === "install"
                ? "Copy this snippet before the closing body tag of your site."
                : "A thoughtful space for your customers and your team."
        }
      >
        {modal === "article" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveArticle(true);
            }}
          >
            <label className="field">
              Title
              <input
                value={articleTitle}
                onChange={(e) => setArticleTitle(e.target.value)}
                minLength={3}
                maxLength={150}
                required
                readOnly={!canManage}
              />
            </label>
            <label className="field">
              Article
              <textarea
                rows={9}
                value={articleBody}
                onChange={(e) => setArticleBody(e.target.value)}
                minLength={10}
                maxLength={30000}
                required
                readOnly={!canManage}
              />
            </label>
            {canManage && (
              <div className="dialog-actions">
                <button
                  type="button"
                  className="button secondary"
                  disabled={
                    busy ||
                    articleTitle.trim().length < 3 ||
                    articleBody.trim().length < 10
                  }
                  onClick={() => void saveArticle(false)}
                >
                  Save draft
                </button>
                <button className="button primary" disabled={busy}>
                  <Check size={16} />
                  Publish article
                </button>
              </div>
            )}
          </form>
        )}
        {modal === "new" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const body = {
                subject: String(form.get("subject")),
                conversationId: String(form.get("conversationId")),
                priority: String(form.get("priority")),
              };
              void mutate(
                "tickets",
                body,
                (d) => ({
                  ...d,
                  tickets: [
                    { ...body, id: crypto.randomUUID(), status: "OPEN" },
                    ...d.tickets,
                  ],
                }),
                "Ticket created",
              ).then((ok) => {
                if (ok) {
                  setModal(null);
                  setPage("tickets");
                }
              });
            }}
          >
            <label className="field">
              Subject
              <input
                name="subject"
                placeholder="What needs a little attention?"
                minLength={3}
                maxLength={150}
                required
              />
            </label>
            <label className="field">
              Conversation
              <select name="conversationId" defaultValue={selected}>
                {data.conversations.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.visitor.name} — {c.subject}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Priority
              <select name="priority" defaultValue="MEDIUM">
                {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <div className="dialog-actions">
              <button
                className="button primary"
                disabled={busy || !canReply || !data.conversations.length}
              >
                <Plus size={16} />
                Create ticket
              </button>
            </div>
          </form>
        )}
        {modal === "install" && (
          <>
            <pre className="embed-code">{embed}</pre>
            <p className="help-text">
              Allowed origins:{" "}
              {data.installations[0]?.allowedOrigins.join(", ") ?? "None"}.{" "}
              {preview
                ? "This preview snippet requires the database and services to be running."
                : ""}
            </p>
            <div className="dialog-actions">
              <a
                className="button secondary"
                href="http://localhost:3002"
                target="_blank"
                rel="noreferrer"
              >
                Demo storefront
                <ArrowUpRight size={14} />
              </a>
              <button
                className="button primary"
                onClick={() => void copy(embed)}
              >
                <Copy size={15} />
                Copy snippet
              </button>
            </div>
          </>
        )}
        {modal === "help" && (
          <div className="help-content">
            <span className="assistant-orb hero-orb">
              <LifeBuoy size={32} />
            </span>
            <p>
              {preview
                ? "You’re exploring an interactive, browser-only preview. Replies, tickets, articles, and approval decisions work locally and reset when you refresh."
                : "Your workspace connects conversations, knowledge, and human-approved actions."}
            </p>
            <div className="help-step">
              <span>1</span>
              <div>
                <strong>Start with a conversation</strong>
                <p>Reply, leave a private note, or take over from AI.</p>
              </div>
            </div>
            <div className="help-step">
              <span>2</span>
              <div>
                <strong>Give your assistant context</strong>
                <p>Publish trusted answers in Knowledge.</p>
              </div>
            </div>
            <div className="help-step">
              <span>3</span>
              <div>
                <strong>Stay in control</strong>
                <p>Review sensitive actions in Approvals.</p>
              </div>
            </div>
            <a className="button primary" href="/login">
              {preview ? "Open the connected workspace" : "Go to sign in"}
              <ArrowRight size={16} />
            </a>
          </div>
        )}
      </Dialog>
    </div>
  );
}
