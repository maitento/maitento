// Acme Coffee's support desk console. Plain JavaScript, no build step. It talks to whichever backend serves it
// (TypeScript, Python or C#) through the small JSON API in API.md, and hears about every change over Server-Sent
// Events (/api/events), so nothing here needs a refresh.

const state = {
  tickets: [],
  loaded: false,
  scenarios: [],
  filter: "all",
  category: "",
  search: "",
  route: { view: "inbox", ticketId: null },
  memory: new Map(), // ticket id -> { loading, threads, error }
  digest: null,
  digestError: null,
  busy: new Set(), // actions in flight, so a second click does nothing
  rejecting: null, // the ticket whose reject form is open
};

const STATUS = {
  new: { label: "New", hint: "Waiting to be sorted" },
  triaged: { label: "Triaged", hint: "Sorted, about to be drafted" },
  drafting: { label: "Drafting", hint: "The desk is working on a reply" },
  approval: { label: "Needs approval", hint: "The desk wants to refund, and waits for you" },
  replied: { label: "Replied", hint: "The reply is ready to send" },
  rejected: { label: "Rejected", hint: "You rejected the refund; the reply says so" },
  failed: { label: "Failed", hint: "Something went wrong" },
};
const OPEN = new Set(["new", "triaged", "drafting", "approval"]);
const CATEGORY_TONE = { damaged: "danger", delivery: "info", refund: "warning", product: "success", other: "neutral" };
const URGENCY_TONE = { high: "danger", normal: "neutral", low: "neutral" };
const BAR_COLOUR = { danger: "var(--danger)", info: "var(--info)", warning: "var(--warning)", success: "var(--success)",
  neutral: "var(--muted)", accent: "var(--accent)" };
const MEMORY_KIND = { Semantic: "Fact", Episodic: "What happened", Relational: "Who they are", Procedural: "How to",
  Reflection: "Note", Intention: "To remember" };

// ---------- Small helpers ----------

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** HTML from a template: every value is escaped unless it is itself html`…` (or an array of them). */
function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, i) => { out += toHtml(value) + strings[i + 1]; });
  return { __html: out };
}
function toHtml(value) {
  if (value == null || value === false) return "";
  if (Array.isArray(value)) return value.map(toHtml).join("");
  if (typeof value === "object" && "__html" in value) return value.__html;
  return String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
const icon = (paths) => html`<svg viewBox="0 0 24 24" aria-hidden="true">${{ __html: paths }}</svg>`;
const ICONS = {
  order: '<path d="M4 7l8-4 8 4v10l-8 4-8-4z"/><path d="M4 7l8 4 8-4M12 11v10"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 7h7"/>',
  money: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5v5M17.5 9.5v5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/>',
  page: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  memory: '<path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"/>',
  recall: '<path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v4h4M12 8v4l3 2"/>',
  tool: '<path d="M14.5 6.5a4 4 0 0 0-5.3 5.2L4 17v3h3l5.3-5.2a4 4 0 0 0 5.2-5.3l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  cross: '<path d="M6 6l12 12M18 6L6 18"/>',
  shield: '<path d="M12 3l7 3v5c0 5-3.4 8.6-7 10-3.6-1.4-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
  play: '<path d="M7 5l12 7-12 7z"/>',
};

function json(text) {
  if (typeof text !== "string") return null;
  try { return JSON.parse(text); } catch { return null; }
}

const money = (amount, currency = "GBP") =>
  typeof amount === "number" ? new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount) : "";

function ago(iso) {
  if (!iso) return "";
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
const longDate = (iso) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function initials(name) {
  const parts = String(name).trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts.at(-1)[0] : "")).toUpperCase();
}
function avatarTone(name) {
  const tones = ["accent", "info", "success", "warning", "danger"];
  let hash = 0;
  for (const c of String(name)) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return tones[hash % tones.length];
}
const avatar = (name, size = "") => html`<span class="avatar ${size}" data-tone="${avatarTone(name)}" aria-hidden="true">${initials(name)}</span>`;
const firstName = (name) => String(name).trim().split(/\s+/)[0];
const subjectOf = (t) => t.subject || t.triage?.summary || t.message.slice(0, 80);
const chip = (text, tone = "neutral") => html`<span class="chip" data-tone="${tone}">${text}</span>`;
const statusBadge = (status, pill = false) =>
  html`<span class="status ${pill ? "pill" : ""}" data-status="${status}" title="${STATUS[status]?.hint ?? ""}">${STATUS[status]?.label ?? status}</span>`;
const capitalise = (text) => (text ? text[0].toUpperCase() + text.slice(1) : "");
/** Plain text, escaped, with the **bold** a model sometimes writes shown as bold. */
const richText = (text) => ({ __html: toHtml(text).replace(/\*\*(\S(?:.*?\S)?)\*\*/g, "<strong>$1</strong>") });

// ---------- Talking to the backend ----------

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new Error("The support desk server isn't answering.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? body.detail ?? `The server answered ${response.status}.`);
  return body;
}

function toast(message, tone = "success") {
  const element = document.createElement("div");
  element.className = "toast";
  element.dataset.tone = tone;
  element.textContent = message;
  $("#toasts").append(element);
  setTimeout(() => element.remove(), tone === "error" ? 8000 : 4500);
}

/** Runs an action once: while it is in flight, the buttons that start it are disabled. */
async function once(key, action) {
  if (state.busy.has(key)) return;
  state.busy.add(key);
  render();
  try {
    await action();
  } catch (error) {
    toast(error.message, "error");
  } finally {
    state.busy.delete(key);
    render();
  }
}

async function loadTickets() {
  try {
    const { tickets } = await api("/api/tickets");
    state.tickets = tickets;
    state.loaded = true;
  } catch (error) {
    showBanner(error.message, "");
  }
  render();
  const ticket = currentTicket();
  if (ticket) loadMemory(ticket);
}

async function loadStatus() {
  try {
    const status = await api("/api/status");
    if (status.ok) hideBanner();
    else showBanner("Maitento isn't ready.", `${status.error} New tickets will fail until it is.`);
  } catch (error) {
    showBanner(error.message, "");
  }
}

async function loadScenarios() {
  try {
    state.scenarios = (await api("/api/scenarios")).scenarios;
  } catch {
    state.scenarios = [];
  }
  renderScenarioMenu();
  const customers = new Map(state.scenarios.map((s) => [s.customer, s.email]));
  $("#known-customers").innerHTML = toHtml([...customers.keys()].map((name) => html`<option value="${name}">`));
}

async function loadMemory(ticket, force = false) {
  const known = state.memory.get(ticket.id);
  if (known && (known.loading || !force)) return;
  state.memory.set(ticket.id, { loading: true, threads: known?.threads ?? null, error: null });
  render();
  try {
    const { threads } = await api(`/api/tickets/${encodeURIComponent(ticket.id)}/memory`);
    state.memory.set(ticket.id, { loading: false, threads, error: null });
  } catch (error) {
    state.memory.set(ticket.id, { loading: false, threads: null, error: error.message });
  }
  render();
}

async function loadDigest() {
  try {
    state.digest = await api("/api/digest");
    state.digestError = null;
  } catch (error) {
    state.digestError = error.message;
  }
  render();
}

function showBanner(title, detail) {
  const banner = $("#banner");
  banner.innerHTML = toHtml(html`<strong>${title}</strong> <span>${detail}</span>`);
  banner.hidden = false;
}
const hideBanner = () => { $("#banner").hidden = true; };

// ---------- Live updates ----------

function connect() {
  const live = $("#live");
  const setLive = (mode, text) => { live.dataset.state = mode; $(".live-text", live).textContent = text; };
  const events = new EventSource("/api/events");
  let dropped = false;
  events.addEventListener("open", () => {
    setLive("live", "Live");
    if (dropped) {
      loadTickets(); // catch up on anything sent while the stream was down
      loadStatus();
    }
  });
  events.addEventListener("error", () => { dropped = true; });
  events.addEventListener("error", () => setLive("offline", "Reconnecting…"));
  events.addEventListener("ticket", (event) => {
    const ticket = JSON.parse(event.data);
    const before = state.tickets.find((t) => t.id === ticket.id);
    if (before) Object.assign(before, ticket);
    else state.tickets.unshift(ticket);
    // A reply that has just finished has usually taught the desk something new about the customer.
    if (before && before.status !== ticket.status && !OPEN.has(ticket.status)) loadMemory(ticket, true);
    if (before?.status !== ticket.status && ticket.status === "approval") toast(`${ticket.id}: a refund needs your approval`);
    render();
    $(`[data-ticket="${CSS.escape(ticket.id)}"]`)?.classList.add("flash");
  });
  events.addEventListener("digest", (event) => {
    const running = JSON.parse(event.data).running;
    if (state.digest?.running && !running) toast("The digest is ready");
    loadDigest();
  });
  events.addEventListener("reset", () => {
    state.tickets = [];
    state.memory.clear();
    if (state.route.view === "ticket") location.hash = "#/inbox";
    render();
  });
}

// ---------- Rendering ----------

function render() {
  const { view } = state.route;
  $("#inbox-view").hidden = view === "digest";
  $("#digest-view").hidden = view !== "digest";
  $("#inbox-view").dataset.route = view;
  for (const link of $$("[data-nav]")) {
    const current = link.dataset.nav === (view === "ticket" ? "inbox" : view);
    if (current) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  const waiting = state.tickets.filter((t) => t.status === "approval").length;
  const count = $("#approval-count");
  count.hidden = waiting === 0;
  count.textContent = waiting;
  count.setAttribute("aria-label", `${waiting} waiting for approval`);
  document.title = `${waiting ? `(${waiting}) ` : ""}Support desk · Acme Coffee`;

  if (view === "digest") renderDigest();
  else {
    renderList();
    renderTicket();
  }
}

function visibleTickets() {
  const search = state.search.trim().toLowerCase();
  return state.tickets.filter((t) =>
    (state.filter === "all"
      || (state.filter === "approval" && t.status === "approval")
      || (state.filter === "open" && OPEN.has(t.status) && t.status !== "approval")
      || (state.filter === "closed" && !OPEN.has(t.status)))
    && (!state.category || t.triage?.category === state.category)
    && (!search || `${t.customer} ${t.email} ${subjectOf(t)} ${t.id}`.toLowerCase().includes(search)));
}

function renderList() {
  const list = $("#ticket-list");
  list.setAttribute("aria-busy", String(!state.loaded));
  $("#ticket-total").textContent = state.tickets.length ? `${state.tickets.length}` : "";
  for (const button of $$("#status-filter button")) {
    button.setAttribute("aria-checked", String(button.dataset.filter === state.filter));
  }
  // A category triage learns later (a new value in its schema) joins the filter as soon as a ticket has it.
  const categories = $("#category-filter");
  for (const category of new Set(state.tickets.map((t) => t.triage?.category).filter(Boolean))) {
    if (![...categories.options].some((option) => option.value === category)) categories.add(new Option(capitalise(category), category));
  }

  if (!state.loaded) {
    list.innerHTML = toHtml([1, 2, 3].map(() => html`<li class="skeleton-row" aria-hidden="true">
      <span class="skeleton round"></span><span class="skeleton" style="width: 60%"></span>
      <span class="skeleton" style="width: 85%"></span></li>`));
    return;
  }
  if (state.tickets.length === 0) {
    list.innerHTML = toHtml(html`<li class="empty">
      ${icon('<path d="M4 9h13v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6z"/><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17M8 2.5c-1 1.2 1 2 0 3.5M12 2.5c-1 1.2 1 2 0 3.5"/>')}
      <h2>No tickets yet</h2>
      <p>File one yourself, or try a scenario to see the desk at work.</p>
      <button class="button primary" type="button" data-action="open-scenarios">Try a scenario</button></li>`);
    return;
  }
  const tickets = visibleTickets();
  if (tickets.length === 0) {
    list.innerHTML = toHtml(html`<li class="empty"><p>No tickets match these filters.</p>
      <button class="button small" type="button" data-action="clear-filters">Show every ticket</button></li>`);
    return;
  }
  list.innerHTML = toHtml(tickets.map((t) => html`<li>
    <a class="ticket-link" href="#/tickets/${encodeURIComponent(t.id)}" data-ticket="${t.id}"
      aria-current="${String(state.route.ticketId === t.id)}">
      ${avatar(t.customer)}
      <span class="ticket-who">${t.customer}</span>
      <span class="ticket-time"><time datetime="${t.created}">${ago(t.created)}</time></span>
      <span class="ticket-subject">${subjectOf(t)}</span>
      <span class="ticket-meta">
        ${t.triage ? [chip(t.triage.category, CATEGORY_TONE[t.triage.category]),
          chip(t.triage.urgency, URGENCY_TONE[t.triage.urgency])] : t.status === "failed" ? "" : chip("sorting…")}
        ${statusBadge(t.status)}
      </span>
    </a></li>`));
}

function renderTicket() {
  const pane = $("#ticket-pane");
  const ticket = state.tickets.find((t) => t.id === state.route.ticketId);
  // Keep whatever is being typed in the reject form across re-renders.
  const typing = document.activeElement?.id === "reject-reason";
  const reason = $("#reject-reason")?.value;

  if (!ticket) {
    pane.innerHTML = toHtml(state.route.ticketId && state.loaded
      ? html`<div class="empty"><h2>No such ticket</h2><p>It may have gone in a demo reset.</p>
          <a class="button" href="#/inbox">Back to the inbox</a></div>`
      : html`<div class="empty">
          ${icon('<path d="M4 6h16v12H4z"/><path d="M4 7l8 6 8-6"/>')}
          <h2>Pick a ticket</h2><p>Its message, the reply the desk drafted, and everything it did to get there.</p></div>`);
    return;
  }
  pane.innerHTML = toHtml(ticketView(ticket));
  if (reason !== undefined && $("#reject-reason")) {
    $("#reject-reason").value = reason;
    if (typing) $("#reject-reason").focus();
  }
}

function ticketView(t) {
  const memory = state.memory.get(t.id);
  return html`<div class="ticket">
    <a class="back-link" href="#/inbox">${icon(ICONS.back)} Inbox</a>
    <header class="ticket-header">
      ${avatar(t.customer, "large")}
      <h1 id="ticket-title">${subjectOf(t)}</h1>
      ${statusBadge(t.status, true)}
      <p class="byline">${t.customer} · <a href="mailto:${t.email}">${t.email}</a> · ${t.id} ·
        <time datetime="${t.created}">${longDate(t.created)}</time></p>
    </header>

    ${triageView(t)}

    <section aria-labelledby="message-title">
      <h3 id="message-title" class="message-label">${firstName(t.customer)} wrote</h3>
      <div class="message">${t.message}</div>
    </section>

    ${t.approval ? approvalView(t) : decisionView(t)}

    ${replyView(t)}

    <div class="columns">
      <section class="card" aria-labelledby="steps-title">
        <div class="card-head"><h3 id="steps-title">What the desk did</h3></div>
        <div class="card-body">${stepsView(t)}</div>
      </section>
      <section class="card" aria-labelledby="memory-title">
        <div class="card-head">
          <h3 id="memory-title">What the desk remembers about ${firstName(t.customer)}</h3>
          <button class="icon-button" type="button" data-action="refresh-memory" aria-label="Read the memory again"
            ${memory?.loading ? "disabled" : ""}>${icon(ICONS.refresh)}</button>
        </div>
        <div class="card-body">${memoryView(t, memory)}</div>
        <p class="card-note">Read from Maitento: the memory the desk keeps for ${t.email}, across every ticket.</p>
      </section>
    </div>

    ${t.runId ? html`<p class="run-details"><span>Reply run <span class="mono">${t.runId}</span></span>
      ${t.loomId ? html`<span>Memory <span class="mono">${t.loomId}</span></span>` : ""}</p>` : ""}
  </div>`;
}

function triageView(t) {
  if (!t.triage) {
    return t.status === "failed" ? "" : html`<div class="triage" aria-live="polite">
      <span class="drafting-label"><span class="spinner" aria-hidden="true"></span>Sorting this ticket…</span></div>`;
  }
  const { category, urgency, orderId, summary } = t.triage;
  return html`<div class="triage">
    <span class="ticket-chips">${chip(category, CATEGORY_TONE[category])}
      ${chip(`${urgency} urgency`, URGENCY_TONE[urgency])}
      ${orderId ? chip(`Order ${orderId}`, "accent") : ""}</span>
    <span><strong>Triage:</strong> ${summary}</span>
  </div>`;
}

function refundRequest(argumentsJson) {
  const args = json(argumentsJson) ?? {};
  const request = args.request ?? args;
  const orderId = args.additionalInputs?.["path.orderId"] ?? request.orderId ?? null;
  const order = state.orders?.[orderId];
  return { orderId, amount: request.amount, reason: request.reason, currency: order?.currency ?? "GBP" };
}

function approvalView(t) {
  const refund = refundRequest(t.approval.arguments);
  const busy = state.busy.has(`decide:${t.id}`);
  const rejecting = state.rejecting === t.id;
  return html`<section class="approval" aria-labelledby="approval-title">
    <div class="approval-title" id="approval-title">${icon(ICONS.shield)} The desk wants to ${t.approval.tool === "issue-refund" ? "refund" : `use ${t.approval.tool}`}</div>
    ${t.approval.tool === "issue-refund"
      ? html`<p class="approval-amount">${money(refund.amount, refund.currency)}${refund.orderId ? html` <span class="muted">on order ${refund.orderId}</span>` : ""}</p>
          ${refund.reason ? html`<p class="approval-reason">“${refund.reason}”</p>` : ""}`
      : html`<p class="mono">${t.approval.arguments}</p>`}
    <p class="hint">Nothing is refunded until you approve. If you reject it, the desk is told your reason and writes the reply with it.</p>
    ${rejecting
      ? html`<form data-action="reject" aria-label="Reject the refund">
          <label for="reject-reason">Why not? The desk will see this.</label>
          <textarea id="reject-reason" rows="2" placeholder="For example: offer a fresh bag instead of a refund"></textarea>
          <div class="approval-actions">
            <button class="button danger" type="submit" ${busy ? "disabled aria-busy=\"true\"" : ""}>Reject refund</button>
            <button class="button" type="button" data-action="cancel-reject" ${busy ? "disabled" : ""}>Cancel</button>
          </div></form>`
      : html`<div class="approval-actions">
          <button class="button success" type="button" data-action="approve" ${busy ? "disabled aria-busy=\"true\"" : ""}>${icon(ICONS.check)} Approve refund</button>
          <button class="button danger" type="button" data-action="start-reject" ${busy ? "disabled" : ""}>${icon(ICONS.cross)} Reject…</button>
        </div>`}
  </section>`;
}

function decisionView(t) {
  if (!t.decision) return "";
  return t.decision.approved
    ? html`<p class="decision" data-approved="true">${icon(ICONS.check)}<span>You approved the refund.</span></p>`
    : html`<p class="decision" data-approved="false">${icon(ICONS.cross)}<span>You rejected the refund: “${t.decision.reason}”</span></p>`;
}

function replyView(t) {
  if (t.status === "failed") {
    return html`<section class="card" aria-labelledby="reply-title"><div class="card-head"><h3 id="reply-title">Something went wrong</h3></div>
      <div class="card-body"><p class="error-text">${t.error ?? "The run ended without a reply."}</p></div></section>`;
  }
  if (t.reply && !OPEN.has(t.status)) {
    const { subject, body } = splitReply(t);
    return html`<section class="card reply" aria-labelledby="reply-title">
      <div class="card-head"><h3 id="reply-title">The reply</h3>
        <button class="button small" type="button" data-action="copy-reply">${icon(ICONS.copy)} Copy</button></div>
      <div class="reply-meta"><span><b>To:</b> ${t.customer} &lt;${t.email}&gt;</span>
        <span><b>Subject:</b> ${subject}</span></div>
      <div class="reply-body">${richText(body)}</div>
    </section>`;
  }
  const label = t.status === "approval" ? "The reply is written once you decide on the refund."
    : t.status === "new" || t.status === "triaged" ? "Waiting to start the reply…" : "Drafting a reply…";
  return html`<section class="card" aria-labelledby="reply-title" aria-busy="true">
    <div class="drafting">
      <h3 id="reply-title" class="visually-hidden">The reply</h3>
      <span class="drafting-label">${t.status === "approval" ? "" : html`<span class="spinner" aria-hidden="true"></span>`}${label}</span>
      <span class="skeleton" style="width: 92%"></span><span class="skeleton" style="width: 78%"></span>
      <span class="skeleton" style="width: 85%"></span>
    </div></section>`;
}

/** The reply's subject and body. A model sometimes starts the email with its own "Subject:" line: use it. */
function splitReply(t) {
  const match = /^\s*\**subject:?\**:?\s*(.+)\n+/i.exec(t.reply);
  return match ? { subject: match[1].replace(/\*\*/g, "").trim(), body: t.reply.slice(match[0].length) }
    : { subject: `Re: ${subjectOf(t)}`, body: t.reply };
}

// ---------- What the agent did: one line per tool call, in words ----------

function stepsView(t) {
  if (t.steps.length === 0) {
    return html`<p class="muted">${OPEN.has(t.status) ? "Nothing yet. Each tool the desk uses shows here as it happens."
      : t.status === "failed" ? "Nothing: it stopped before using a tool." : "The desk answered without using a tool."}</p>`;
  }
  return html`<ol class="steps">${t.steps.map((step) => {
    const { icon: name, tone, title, detail } = describeStep(step);
    return html`<li class="step" data-tone="${tone}">
      <span class="step-icon">${icon(ICONS[name])}</span>
      <span class="step-title">${title}</span>
      ${detail ? html`<div class="step-detail">${detail}</div>` : ""}
    </li>`;
  })}</ol>`;
}

const shorten = (text, length = 220) => {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
};

function describeStep(step) {
  const args = json(step.input) ?? {};
  const request = args.request ?? args;
  const out = json(step.output);
  const failed = step.error && !step.rejection;
  const pending = step.output == null && !step.rejection;
  const tool = step.tool.toLowerCase();

  if (tool === "find-order") {
    const orderId = args.additionalInputs?.["path.orderId"] ?? request.orderId ?? "";
    if (failed || !out?.items) return { icon: "order", tone: failed ? "danger" : "info", title: `Looked up order ${orderId}`, detail: shorten(step.output) };
    if (out?.id) state.orders = { ...state.orders, [out.id]: out };
    return {
      icon: "order", tone: "info", title: `Looked up order ${out.id}`,
      detail: html`<span>${capitalise(out.status)}${out.refunded ? `, ${money(out.refunded, out.currency)} refunded` : ""}.</span>
        <ul>${out.items.map((item) => html`<li>${item.name}, ${money(item.price, out.currency)}</li>`)}</ul>`,
    };
  }
  if (tool === "search-policies") {
    const query = request.query ?? "";
    const passages = policyPassages(out ?? step.output).slice(0, 2).map((p) => ({ ...p, ...bestSection(p.text, query) }));
    return {
      icon: "book", tone: failed ? "danger" : "accent", title: `Searched the shop's policies for “${query}”`,
      detail: failed ? shorten(step.output) : passages.length
        ? passages.map((p) => html`<blockquote class="passage"><cite>${[p.source, p.heading].filter(Boolean).join(" · ")}</cite>${shorten(p.body, 260)}</blockquote>`)
        : pending ? "Searching…" : "Nothing relevant found.",
    };
  }
  if (tool === "issue-refund") {
    const refund = refundRequest(step.input);
    const amount = money(refund.amount, refund.currency);
    if (step.rejection) return { icon: "money", tone: "danger", title: `Asked to refund ${amount}: you rejected it`, detail: html`You said “${step.rejection}”.` };
    if (pending) return { icon: "money", tone: "warning", title: `Asked to refund ${amount} on ${refund.orderId}`, detail: html`Waiting for your approval. “${refund.reason ?? ""}”` };
    if (failed) return { icon: "money", tone: "danger", title: `The refund of ${amount} failed`, detail: shorten(step.output) };
    return { icon: "money", tone: "success", title: `Refunded ${amount} on ${refund.orderId}`, detail: refund.reason ? html`“${refund.reason}”` : "" };
  }
  if (tool === "websearch") {
    const results = webResults(step.output).slice(0, 4);
    return {
      icon: "globe", tone: failed ? "danger" : "info", title: `Searched the web for “${[args.queries ?? args.query].flat().join("”, “")}”`,
      detail: failed ? shorten(step.output) : results.length
        ? html`<ul>${results.map((r) => html`<li><a href="${r.url}" target="_blank" rel="noopener noreferrer">${r.title}</a></li>`)}</ul>` : "",
    };
  }
  if (tool === "webfetch" || tool === "webread") {
    const urls = [args.urls ?? args.url ?? []].flat();
    const titles = [...String(step.output ?? "").matchAll(/^Title: (.+)$/gm)].map((m) => m[1]);
    return {
      icon: "page", tone: failed ? "danger" : "info",
      title: html`${tool === "webread" ? "Read on in" : "Read"} ${urls.length
        ? urls.map((url, i) => html`${i ? ", " : ""}<a href="${url}" target="_blank" rel="noopener noreferrer">${shortUrl(url)}</a>`)
        : "a downloaded page"}`,
      detail: failed ? shorten(step.output) : titles.length ? html`“${titles.join("”, “")}”` : "",
    };
  }
  if (tool.includes("weave")) {
    if (failed) return { icon: "memory", tone: "danger", title: "A note to remember didn't save", detail: shorten(step.output, 160) };
    const again = /already held/i.test(step.output ?? "");
    return { icon: "memory", tone: "success", title: again ? "Already knew this, so remembered it more strongly" : "Remembered something for next time",
      detail: html`“${shorten(memoryText(args), 300)}”` };
  }
  if (tool.includes("recall")) {
    return {
      icon: "recall", tone: "accent", title: html`Recalled what it knows${args.query ? html` about “${args.query}”` : ""}`,
      detail: /^\s*nothing/i.test(step.output ?? "") ? "Nothing yet: a new customer." : "",
    };
  }
  return { icon: "tool", tone: failed ? "danger" : "neutral", title: `Used ${step.tool}`, detail: shorten(step.input, 160) };
}

const shortUrl = (url) => {
  try {
    const { hostname, pathname } = new URL(url);
    return shorten(hostname.replace(/^www\./, "") + (pathname === "/" ? "" : pathname), 70);
  } catch {
    return shorten(url, 70);
  }
};

function memoryText(args) {
  if (typeof args.content === "string") return args.content;
  for (const value of Object.values(args)) {
    if (typeof value === "string" && value.length > 20) return value;
    if (value && typeof value === "object" && typeof value.content === "string") return value.content;
  }
  return JSON.stringify(args);
}

/** The passages a knowledge-base search returned, whatever the exact shape: each with its text and source file. */
function policyPassages(result) {
  const found = [];
  const visit = (value) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      const text = value.content ?? value.text ?? value.chunk ?? value.chunkText;
      if (typeof text === "string") {
        found.push({ text, source: value.fileName ?? value.file?.name ?? value.name ?? value.source ?? null });
      } else Object.values(value).forEach(visit);
    }
  };
  visit(result);
  return found;
}

/** The part of a Markdown passage under the heading that shares the most words with the query. */
function bestSection(text, query) {
  const words = String(query).toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const sections = String(text).split(/\n(?=#{2,3} )/).map((section) => {
    const [first, ...rest] = section.trim().split("\n");
    const heading = /^#{1,3} /.test(first) ? first.replace(/^#+\s*/, "") : "";
    const body = (heading ? rest.join("\n") : section).trim();
    const lower = section.toLowerCase();
    return { heading, body, score: words.filter((w) => lower.includes(w.slice(0, 5))).length };
  }).filter((s) => s.body);
  return sections.sort((a, b) => b.score - a.score)[0] ?? { heading: "", body: text };
}

/** The results of a web search, which come back as a numbered list: "1. Title", then the address on the next line. */
function webResults(output) {
  return [...String(output ?? "").matchAll(/^\s*\d+\.\s+(.+)\n\s+(https?:\/\/\S+)/gm)]
    .map(([, title, url]) => ({ title: title.trim(), url }));
}

function memoryView(t, memory) {
  if (!t.loomId) return html`<p class="muted">The desk starts remembering ${firstName(t.customer)} once it starts on the reply.</p>`;
  if (!memory || (memory.loading && !memory.threads)) {
    return html`<div aria-busy="true"><span class="skeleton" style="width: 90%"></span><br><span class="skeleton" style="width: 70%"></span></div>`;
  }
  if (memory.error) return html`<p class="error-text">Couldn't read the memory: ${memory.error}</p>`;
  if (memory.threads.length === 0) {
    return html`<p class="muted">Nothing yet. ${OPEN.has(t.status)
      ? `The desk keeps notes about ${firstName(t.customer)} as it finishes the reply.`
      : "The desk didn't keep anything from this ticket."}</p>`;
  }
  return html`<ul class="memory">${memory.threads.map((thread) => html`<li>
    <span class="memory-meta">${chip(MEMORY_KIND[thread.kind] ?? thread.kind, "accent")}<time datetime="${thread.created}">${ago(thread.created)}</time></span>
    ${thread.content}</li>`)}</ul>`;
}

// ---------- Digest ----------

function renderDigest() {
  const view = $("#digest-view");
  const digest = state.digest;
  const running = digest?.running || state.busy.has("digest");
  const counts = digest?.counts;
  const head = html`<div class="digest-head">
    <div><h1 id="digest-title">Nightly digest</h1>
      <p>Every night at 23:55 UTC a Maitento app fetches the day's tickets, and a sandbox counts them.</p></div>
    <button class="button primary" type="button" data-action="run-digest" ${running ? "disabled aria-busy=\"true\"" : ""}>
      ${running ? html`<span class="spinner" aria-hidden="true"></span>` : icon(ICONS.play)} Run digest now</button>
  </div>`;

  let body;
  if (!digest && !state.digestError) {
    body = html`<div class="stats" aria-busy="true">${[1, 2, 3].map(() => html`<div class="card stat"><span class="skeleton" style="width: 40%; height: 28px"></span><br><span class="skeleton" style="width: 70%"></span></div>`)}</div>`;
  } else if (state.digestError && !digest) {
    body = html`<div class="card"><div class="card-body"><p class="error-text">Couldn't read the digest: ${state.digestError}</p></div></div>`;
  } else {
    body = html`
      ${running ? html`<div class="digest-progress" role="status"><span class="spinner" aria-hidden="true"></span>
        Counting today's tickets in a sandbox. This takes about a minute.</div>` : ""}
      ${digest.error ? html`<div class="card"><div class="card-body"><p class="error-text">The last run failed: ${digest.error}</p></div></div>` : ""}
      ${counts ? digestCharts(counts) : !digest.report ? html`<div class="card empty">
          ${icon('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>')}
          <h2>No digest yet</h2><p>Run it now to count today's tickets, instead of waiting for tonight.</p></div>` : ""}
      ${digest.report ? html`<details class="card report"><summary>The report, as the sandbox wrote it</summary><pre>${digest.report}</pre></details>` : ""}`;
  }
  view.innerHTML = toHtml(html`${head}${body}`);
}

function digestCharts(counts) {
  const statuses = counts.status ?? {};
  const bars = (title, values, tones, label = capitalise) => {
    const entries = Object.entries(values ?? {});
    const max = Math.max(1, ...entries.map(([, n]) => n));
    return html`<section class="card chart" aria-labelledby="chart-${title}">
      <h2 id="chart-${title}">By ${title}</h2>
      ${entries.length ? html`<ul class="bars">${entries.map(([name, n]) => html`<li class="bar">
        <span class="bar-label">${label(name)}</span>
        <span class="bar-track" role="img" aria-label="${label(name)}: ${n}"><span class="bar-fill" style="width: ${(n / max) * 100}%; --bar: ${BAR_COLOUR[tones(name)] ?? "var(--accent)"}"></span></span>
        <span class="bar-value">${n}</span></li>`)}</ul>` : html`<p class="muted">No tickets.</p>`}
    </section>`;
  };
  const statusTone = (s) => ({ approval: "warning", replied: "success", rejected: "danger", failed: "danger", drafting: "accent" })[s] ?? "neutral";
  return html`
    <p class="muted">For ${new Date(`${counts.date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
    <div class="stats">
      <div class="card stat"><div class="stat-value">${counts.tickets}</div><div class="stat-label">Tickets</div></div>
      <div class="card stat"><div class="stat-value">${counts.customers?.length ?? 0}</div><div class="stat-label">Customers</div></div>
      <div class="card stat"><div class="stat-value">${statuses.replied ?? 0}</div><div class="stat-label">Replied</div></div>
      <div class="card stat"><div class="stat-value">${statuses.approval ?? 0}</div><div class="stat-label">Waiting for approval</div></div>
    </div>
    <div class="charts">
      ${bars("category", counts.category, (c) => CATEGORY_TONE[c])}
      ${bars("urgency", counts.urgency, (u) => (u === "high" ? "danger" : u === "low" ? "neutral" : "accent"))}
      ${bars("status", counts.status, statusTone, (s) => STATUS[s]?.label ?? capitalise(s))}
    </div>
    ${counts.customers?.length ? html`<section class="card chart" aria-labelledby="customers-title"><h2 id="customers-title">Customers</h2>
      <div class="customers">${counts.customers.map((name) => html`<span class="chip">${avatar(name)} ${name}</span>`)}</div></section>` : ""}`;
}

// ---------- Scenarios, the new ticket form, reset ----------

function renderScenarioMenu() {
  const menu = $("#scenario-menu");
  menu.innerHTML = toHtml(html`
    <div class="menu-label">File a sample ticket</div>
    ${state.scenarios.length ? state.scenarios.map((s) => html`<button class="menu-item" type="button" role="menuitem" data-scenario="${s.id}">
      ${avatar(s.customer)}<strong>${s.title}</strong><small>${s.customer}: ${s.shows}</small></button>`)
      : html`<p class="muted" style="padding: 8px 10px">No scenarios found.</p>`}
    <div class="menu-separator" role="separator"></div>
    <button class="menu-item danger" type="button" role="menuitem" data-action="reset">Reset demo…</button>`);
}

function toggleMenu(open = $("#scenario-menu").hidden) {
  const menu = $("#scenario-menu");
  menu.hidden = !open;
  $("#scenario-button").setAttribute("aria-expanded", String(open));
  if (open) $(".menu-item", menu)?.focus();
}

async function fileTicket(fields) {
  const ticket = await api("/api/tickets", { method: "POST", body: fields });
  if (!state.tickets.some((t) => t.id === ticket.id)) state.tickets.unshift(ticket);
  location.hash = `#/tickets/${encodeURIComponent(ticket.id)}`;
  toast(`${ticket.id} filed for ${ticket.customer}`);
}

function openNewTicket() {
  const dialog = $("#new-ticket-dialog");
  $("#new-ticket-form").reset();
  $("#new-ticket-error").hidden = true;
  dialog.showModal();
  $("#ticket-customer").focus();
}

// ---------- Routing and events ----------

function route() {
  const [, view, id] = location.hash.split("/");
  state.route = view === "tickets" && id ? { view: "ticket", ticketId: decodeURIComponent(id) }
    : view === "digest" ? { view: "digest", ticketId: null } : { view: "inbox", ticketId: null };
  state.rejecting = null;
  render();
  const ticket = state.tickets.find((t) => t.id === state.route.ticketId);
  if (ticket) {
    loadMemory(ticket);
    if (matchMedia("(max-width: 820px)").matches) $("#ticket-pane").focus();
  }
  if (state.route.view === "digest" && !state.digest) loadDigest();
}

function currentTicket() {
  return state.tickets.find((t) => t.id === state.route.ticketId);
}

function bindEvents() {
  addEventListener("hashchange", route);

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action], [data-scenario], [data-filter]");
    if (!$(".menu").contains(event.target)) toggleMenu(false);
    if (!target) return;
    const ticket = currentTicket();
    const action = target.dataset.action;

    if (target.dataset.filter) {
      state.filter = target.dataset.filter;
      render();
    } else if (target.dataset.scenario) {
      const scenario = state.scenarios.find((s) => s.id === target.dataset.scenario);
      toggleMenu(false);
      once("scenario", () => fileTicket({ customer: scenario.customer, email: scenario.email, subject: scenario.subject, message: scenario.message }));
    } else if (action === "approve" && ticket) {
      once(`decide:${ticket.id}`, async () => {
        await api(`/api/tickets/${encodeURIComponent(ticket.id)}/approve`, { method: "POST", body: {} });
        toast("Refund approved. The desk is finishing the reply.");
      });
    } else if (action === "start-reject") {
      state.rejecting = ticket?.id ?? null;
      render();
      $("#reject-reason")?.focus();
    } else if (action === "cancel-reject") {
      state.rejecting = null;
      render();
    } else if (action === "copy-reply" && ticket?.reply) {
      navigator.clipboard?.writeText(splitReply(ticket).body).then(() => toast("Reply copied"), () => toast("Couldn't copy the reply", "error"));
    } else if (action === "refresh-memory" && ticket) {
      loadMemory(ticket, true);
    } else if (action === "run-digest") {
      once("digest", async () => {
        state.digest = { ...(state.digest ?? { report: null, counts: null, error: null }), ...(await api("/api/digest", { method: "POST", body: {} })) };
      });
    } else if (action === "open-scenarios") {
      toggleMenu(true);
    } else if (action === "reset") {
      toggleMenu(false);
      $("#reset-dialog").showModal();
    } else if (action === "clear-filters") {
      state.filter = "all";
      state.category = "";
      state.search = "";
      $("#category-filter").value = "";
      $("#search").value = "";
      render();
    }
  });

  document.addEventListener("submit", (event) => {
    if (event.target.dataset.action !== "reject") return;
    event.preventDefault();
    const ticket = currentTicket();
    const reason = $("#reject-reason").value.trim();
    if (!ticket) return;
    once(`decide:${ticket.id}`, async () => {
      await api(`/api/tickets/${encodeURIComponent(ticket.id)}/reject`, { method: "POST", body: { reason } });
      state.rejecting = null;
      toast("Refund rejected. The desk is writing the reply with your reason.");
    });
  });

  $("#scenario-button").addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMenu();
  });
  $("#scenario-menu").addEventListener("keydown", (event) => {
    const items = $$(".menu-item", event.currentTarget);
    const index = items.indexOf(document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      items[(index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus();
    } else if (event.key === "Escape" || event.key === "Tab") {
      toggleMenu(false);
      if (event.key === "Escape") $("#scenario-button").focus();
    }
  });

  $("#category-filter").addEventListener("change", (event) => { state.category = event.target.value; render(); });
  $("#search").addEventListener("input", (event) => { state.search = event.target.value; render(); });
  $("#new-ticket-button").addEventListener("click", openNewTicket);
  for (const close of $$("[data-close]")) close.addEventListener("click", () => close.closest("dialog").close());

  $("#ticket-customer").addEventListener("change", (event) => {
    const known = state.scenarios.find((s) => s.customer === event.target.value);
    if (known && !$("#ticket-email").value) $("#ticket-email").value = known.email;
  });
  $("#new-ticket-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    const error = $("#new-ticket-error");
    const missing = !fields.customer.trim() ? "ticket-customer" : !/^\S+@\S+\.\S+$/.test(fields.email) ? "ticket-email"
      : !fields.message.trim() ? "ticket-message" : null;
    if (missing) {
      error.textContent = { "ticket-customer": "Add the customer's name.", "ticket-email": "Add a valid email address.",
        "ticket-message": "Write the customer's message." }[missing];
      error.hidden = false;
      $(`#${missing}`).focus();
      return;
    }
    const submit = $("button[type=submit]", form);
    submit.disabled = true;
    try {
      await fileTicket(fields);
      $("#new-ticket-dialog").close();
    } catch (failure) {
      error.textContent = failure.message;
      error.hidden = false;
    } finally {
      submit.disabled = false;
    }
  });

  $("#reset-dialog").addEventListener("close", (event) => {
    if (event.currentTarget.returnValue !== "reset") return;
    once("reset", async () => {
      await api("/api/reset", { method: "POST", body: {} });
      toast("Demo reset: no tickets, and the orders are as they were.");
    });
  });

  const toggle = $("#theme-toggle");
  const dark = () => document.documentElement.dataset.theme === "dark"
    || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  const label = () => toggle.setAttribute("aria-label", dark() ? "Use the light theme" : "Use the dark theme");
  toggle.addEventListener("click", () => {
    const theme = dark() ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("acme-theme", theme); } catch {}
    label();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", label);
  label();

  // Relative times ("3 min ago") stay right without a reload.
  setInterval(() => { if (state.route.view !== "digest") renderList(); }, 30_000);
}

bindEvents();
route();
loadScenarios();
loadTickets();
loadStatus();
connect();
