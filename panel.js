const $ = (id) => document.getElementById(id);
const MAX_RESULTS = 200;

let settings;
let siteHost = null; // hostname of the active tab, if it's a web page
let cookies = new Map(); // key -> {name, domain}

function save(patch) {
  Object.assign(settings, patch);
  return browser.storage.local.set(patch);
}

function toggle(key) {
  const wl = new Set(settings.whitelist);
  wl.has(key) ? wl.delete(key) : wl.add(key);
  save({ whitelist: [...wl] });
  render();
}

function items() {
  const all = new Map(cookies);
  for (const key of settings.whitelist) {
    if (!all.has(key)) {
      const [domain, name] = key.split("\t");
      all.set(key, { domain, name });
    }
  }
  return all;
}

// A cookie for example.com is sent to www.example.com, so match on suffix.
const onSite = (domain) =>
  siteHost && (siteHost === domain || siteHost.endsWith("." + domain));

function makeRow(r) {
  const el = document.createElement("div");
  el.className = "item" + (r.excluded ? " ex" : "");
  el.title = r.excluded ? "Click to stop excluding" : "Click to exclude from expiry";
  const dot = document.createElement("span");
  dot.className = "dot";
  const txt = document.createElement("div");
  txt.className = "txt";
  const name = document.createElement("div");
  name.className = "name";
  name.textContent = r.name === "*" ? "All cookies" : r.name;
  const dom = document.createElement("div");
  dom.className = "dom";
  dom.textContent = r.domain;
  txt.append(name, dom);
  el.append(dot, txt);
  el.addEventListener("click", () => toggle(r.key));

  if (r.name !== "*") {
    const site = document.createElement("button");
    site.className = "site";
    site.textContent = "Whole site";
    site.title = `Exclude every cookie on ${r.domain}`;
    site.addEventListener("click", (e) => {
      e.stopPropagation();
      toggle(domainKey(r.domain));
    });
    el.append(site);
  }
  return el;
}

function addSection(list, title, rows, emptyText) {
  const h = document.createElement("div");
  h.className = "sechead";
  h.textContent = title;
  list.append(h);
  if (!rows.length) {
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = emptyText;
    list.append(hint);
    return;
  }
  for (const r of rows.slice(0, MAX_RESULTS)) list.append(makeRow(r));
  if (rows.length > MAX_RESULTS) {
    const more = document.createElement("div");
    more.className = "hint";
    more.textContent = `Showing ${MAX_RESULTS} of ${rows.length}. Refine your search.`;
    list.append(more);
  }
}

function render() {
  const wl = new Set(settings.whitelist);
  const q = $("q").value.trim().toLowerCase();
  const list = $("list");
  list.textContent = "";

  const rows = [...items()].map(([key, c]) => ({
    key,
    ...c,
    explicit: wl.has(key),
    excluded: wl.has(key) || wl.has(domainKey(c.domain)),
  }));
  const order = (a, b) =>
    b.excluded - a.excluded ||
    a.domain.localeCompare(b.domain) ||
    a.name.localeCompare(b.name);

  if (q) {
    const hits = rows
      .filter((r) => r.name.toLowerCase().includes(q) || r.domain.includes(q))
      .sort(order);
    addSection(list, `Search results (${hits.length})`, hits, "No matching cookies.");
    return;
  }

  if (siteHost) {
    const here = rows
      .filter((r) => r.name !== "*" && onSite(r.domain))
      .sort(order);
    addSection(list, `On ${siteHost} (${here.length})`, here, "No cookies on this site.");
  }
  const shown = new Set(
    siteHost ? rows.filter((r) => r.name !== "*" && onSite(r.domain)).map((r) => r.key) : []
  );
  const excluded = rows.filter((r) => r.explicit && !shown.has(r.key)).sort(order);
  addSection(
    list,
    `Other exclusions (${excluded.length})`,
    excluded,
    "Nothing else excluded. Search above to find cookies."
  );
}

async function init() {
  settings = await getSettings();
  $("enabled").checked = settings.enabled;
  $("amount").value = settings.amount;
  $("unit").value = settings.unit;

  $("enabled").addEventListener("change", (e) => save({ enabled: e.target.checked }));
  $("unit").addEventListener("change", (e) => save({ unit: e.target.value }));
  $("amount").addEventListener("change", (e) => {
    const n = Math.max(1, Math.floor(Number(e.target.value)) || 1);
    e.target.value = n;
    save({ amount: n });
  });
  $("q").addEventListener("input", render);
  $("apply").addEventListener("click", async () => {
    $("status").textContent = "Working…";
    const n = await browser.runtime.sendMessage("sweep");
    $("status").textContent = `Updated ${n} cookie${n === 1 ? "" : "s"}.`;
  });

  $("grant").addEventListener("click", async () => {
    if (await browser.permissions.request(ALL_SITES)) {
      browser.runtime.sendMessage("sweep");
      await load();
    }
  });
  await load();
}

// Firefox MV3 doesn't grant host permissions at install, and without them
// cookies and tab URLs are invisible to the extension.
const ALL_SITES = { origins: ["<all_urls>"] };

async function load() {
  $("access").hidden = await browser.permissions.contains(ALL_SITES);

  siteHost = null;
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const url = new URL(tab.url);
    if (url.protocol === "http:" || url.protocol === "https:") siteHost = url.hostname.toLowerCase();
  } catch {}

  cookies = new Map();
  for (const c of await getAllCookies()) {
    cookies.set(cookieKey(c), { name: c.name, domain: normDomain(c.domain) });
  }
  render();
}

init();
