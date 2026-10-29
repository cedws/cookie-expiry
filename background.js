// Tolerance so a cookie we just clamped is never re-clamped (avoids loops).
const SLACK = 60;

async function clamp(cookie, settings, whitelist, now) {
  if (isExcluded(whitelist, cookie)) return false;

  // Session cookies are already ephemeral; only shorten persistent ones.
  const limit = now + maxSeconds(settings);
  if (cookie.session || !(cookie.expirationDate > limit + SLACK)) return false;

  const host = normDomain(cookie.domain);
  const details = {
    url: `${cookie.secure ? "https" : "http"}://${host}${cookie.path}`,
    name: cookie.name,
    value: cookie.value,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    storeId: cookie.storeId,
    firstPartyDomain: cookie.firstPartyDomain || "",
    expirationDate: limit,
  };
  if (!cookie.hostOnly) details.domain = cookie.domain;
  if (cookie.partitionKey) details.partitionKey = cookie.partitionKey;

  try {
    return !!(await browser.cookies.set(details));
  } catch (e) {
    console.warn("cookie-expiry: could not update", cookie.name, host, e);
    return false;
  }
}

async function sweep() {
  const settings = await getSettings();
  if (!settings.enabled) return 0;
  const whitelist = new Set(settings.whitelist);
  const now = Date.now() / 1000;
  let changed = 0;
  for (const cookie of await getAllCookies()) {
    if (await clamp(cookie, settings, whitelist, now)) changed++;
  }
  return changed;
}

browser.cookies.onChanged.addListener(async ({ removed, cookie }) => {
  if (removed) return;
  const settings = await getSettings();
  if (!settings.enabled) return;
  await clamp(cookie, settings, new Set(settings.whitelist), Date.now() / 1000);
});

browser.storage.onChanged.addListener((_, area) => {
  if (area === "local") sweep();
});

browser.alarms.create("sweep", { periodInMinutes: 30 });
browser.alarms.onAlarm.addListener((a) => a.name === "sweep" && sweep());
browser.runtime.onStartup.addListener(sweep);
browser.runtime.onInstalled.addListener(sweep);

browser.runtime.onMessage.addListener((msg) => {
  if (msg === "sweep") return sweep();
});
