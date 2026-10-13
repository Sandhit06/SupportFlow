(function () {
  'use strict';
  var script = document.currentScript;
  var base = new URL(script.src).origin;
  var key = script.dataset.installationKey;
  var storageKey = 'supportflow-refresh-' + key;
  var launcher = document.createElement('button');
  launcher.textContent = 'Chat with us';
  launcher.setAttribute('aria-expanded', 'false');
  launcher.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483646;border:1px solid #ffffff66;border-radius:28px;padding:16px 22px;background:#7661d9;color:white;box-shadow:0 8px 30px #35256833;font:600 14px system-ui;cursor:pointer';
  var frame;
  var session;
  var refreshInFlight;
  async function bootstrap() {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async function () {
      var previous = session && session.refreshToken;
      try { previous = localStorage.getItem(storageKey) || previous; } catch (_) {}
      var response = await fetch(base + '/api/v1/widget/bootstrap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ installationKey: key, refreshToken: previous || null }) });
      if (!response.ok) {
        if (response.status === 401) { try { localStorage.removeItem(storageKey); } catch (_) {} session = null; }
        throw new Error('Unable to connect');
      }
      session = await response.json();
      try { localStorage.setItem(storageKey, session.refreshToken); } catch (_) {}
      return session;
    })();
    try { return await refreshInFlight; } finally { refreshInFlight = null; }
  }
  // Refresh credentials stay on the embedding origin; the iframe gets access tokens only.
  window.addEventListener('message', async function (event) {
    if (!frame || event.source !== frame.contentWindow || event.origin !== base) return;
    if (!event.data || event.data.type !== 'supportflow:refresh') return;
    try {
      var updated = await bootstrap();
      frame.contentWindow.postMessage({ type: 'supportflow:token', token: updated.visitorToken }, base);
    } catch (_) { frame.contentWindow.postMessage({ type: 'supportflow:expired' }, base); }
  });
  launcher.addEventListener('click', async function () {
    if (frame) { frame.hidden = !frame.hidden; launcher.setAttribute('aria-expanded', String(!frame.hidden)); if (!frame.hidden) frame.focus(); return; }
    launcher.disabled = true;
    launcher.textContent = 'Connecting…';
    try {
      var current = await bootstrap();
      frame = document.createElement('iframe');
      frame.src = base + '/widget#' + encodeURIComponent(JSON.stringify({ token: current.visitorToken, parentOrigin: location.origin }));
      frame.title = current.organizationDisplayName + ' customer support';
      frame.style.cssText = 'position:fixed;bottom:88px;right:24px;width:min(380px,calc(100vw - 32px));height:min(570px,calc(100dvh - 120px));border:1px solid #e5dff1;border-radius:20px;box-shadow:0 15px 70px #30204733;z-index:2147483646;background:white';
      document.body.appendChild(frame);
      launcher.setAttribute('aria-expanded', 'true');
      frame.focus();
      launcher.textContent = 'Close / open chat';
    } catch (_) { launcher.textContent = 'Connection failed · retry'; }
    finally { launcher.disabled = false; }
  });
  document.body.appendChild(launcher);
})();
