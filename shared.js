const DEFAULTS = {
  enabled: true,
  amount: 30,
  unit: "days",
  whitelist: [],
};
const UNIT_SECONDS = { minutes: 60, hours: 3600, days: 86400 };

const normDomain = (d) => d.replace(/^\./, "").toLowerCase();
const cookieKey = (c) => `${normDomain(c.domain)}\t${c.name}`;
const domainKey = (d) => `${normDomain(d)}\t*`;

async function getSettings() {
  return browser.storage.local.get(DEFAULTS);
}

function maxSeconds(s) {
  return Math.max(1, Number(s.amount) || 1) * UNIT_SECONDS[s.unit];
}

function isExcluded(set, cookie) {
  return set.has(cookieKey(cookie)) || set.has(domainKey(cookie.domain));
}

async function getAllCookies() {
  const stores = await browser.cookies.getAllCookieStores();
  const out = [];
  for (const store of stores) {
    const base = { storeId: store.id, firstPartyDomain: null };
    let list;
    try {
      list = await browser.cookies.getAll({ ...base, partitionKey: {} });
    } catch {
      list = await browser.cookies.getAll(base);
    }
    out.push(...list);
  }
  return out;
}
