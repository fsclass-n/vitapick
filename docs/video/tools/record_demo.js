// Records every web/mobile scene of the healthpick video from the live Render deployment.
// Timing comes from timing.json (written by tts.py), so clicks land on the narration.
// Frames come from the CDP screencast (lossless-ish JPEG, real timestamps) and are turned into
// constant-30fps clips by compose.py. Overlays (cursor, click ring, highlight border, fake address
// bar) are DOM elements injected into the page; nothing ever dims or flashes the whole screen.
//
// usage: node record_demo.js WORK_DIR [sceneId ...]
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const WORK = process.argv[2];
const ONLY = new Set(process.argv.slice(3));
const SITE = 'https://healthpick.onrender.com';
const API = 'https://healthpick-api.onrender.com/api';
const DOCS = 'https://healthpick-api.onrender.com/docs';
const ACTIONS = 'https://github.com/fsclass-n/healthpick/actions';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const scenes = JSON.parse(fs.readFileSync(path.join(WORK, 'timing.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const OVERLAY = () => {
  const install = () => {
    if (document.getElementById('__cursor')) return;
    const css = document.createElement('style');
    css.textContent = `
      main{min-height:100vh}
      #__cursor{position:fixed;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;
        background:rgba(250,204,21,.42);border:2px solid rgba(202,138,4,.85);z-index:2147483647;pointer-events:none;
        transform:translate(-100px,-100px);box-shadow:0 1px 6px rgba(0,0,0,.18)}
      .__ring{position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid rgba(234,179,8,.95);
        z-index:2147483646;pointer-events:none;animation:__ring .5s ease-out forwards}
      @keyframes __ring{from{transform:scale(.6);opacity:1}to{transform:scale(2.1);opacity:0}}
      .__hl{position:fixed;border:3px solid #22d3ee;border-radius:12px;box-shadow:0 0 0 4px rgba(34,211,238,.16),0 0 18px rgba(34,211,238,.35);
        z-index:2147483645;pointer-events:none;opacity:0;transition:opacity .3s ease}
      #__addr{position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:2147483647;pointer-events:none;
        background:#fff;border:1px solid #cfd8cc;border-radius:999px;padding:10px 26px;font:500 17px/1.2 Consolas,monospace;
        color:#20382f;box-shadow:0 8px 28px rgba(20,40,30,.18);opacity:0;transition:opacity .3s ease}
      #__addr b{color:#b75243;font-weight:700}`;
    document.documentElement.appendChild(css);
    const c = document.createElement('div'); c.id = '__cursor'; document.documentElement.appendChild(c);
    addEventListener('mousemove', (e) => { c.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; }, true);
    addEventListener('mousedown', (e) => {
      const r = document.createElement('div'); r.className = '__ring';
      r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
      document.documentElement.appendChild(r); setTimeout(() => r.remove(), 600);
    }, true);
    window.__hlRect = (x, y, w, h, ms) => {
      const d = document.createElement('div'); d.className = '__hl';
      Object.assign(d.style, { left: x - 6 + 'px', top: y - 6 + 'px', width: w + 12 + 'px', height: h + 12 + 'px' });
      document.documentElement.appendChild(d);
      requestAnimationFrame(() => requestAnimationFrame(() => { d.style.opacity = 1; }));
      setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 350); }, ms);
    };
    window.__addr = async (base, extra) => {
      let a = document.getElementById('__addr');
      if (!a) { a = document.createElement('div'); a.id = '__addr'; document.documentElement.appendChild(a); }
      a.innerHTML = base; a.style.opacity = 1;
      for (let i = 1; i <= extra.length; i++) { a.innerHTML = `${base}<b>${extra.slice(0, i)}</b>`; await new Promise((r) => setTimeout(r, 120)); }
    };
    window.__addrHide = () => { const a = document.getElementById('__addr'); if (a) a.style.opacity = 0; };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
};

class Recorder {
  constructor(page) { this.page = page; }
  async start(dir) {
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    this.dir = dir; this.frames = []; this.n = 0;
    this.cdp = await this.page.createCDPSession();
    this.cdp.on('Page.screencastFrame', async (ev) => {
      const file = `${String(this.n++).padStart(5, '0')}.jpg`;
      fs.writeFileSync(path.join(this.dir, file), Buffer.from(ev.data, 'base64'));
      this.frames.push({ file, ts: ev.metadata.timestamp });
      try { await this.cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }); } catch {}
    });
    const vp = this.page.viewport(); const dpr = vp.deviceScaleFactor || 1;
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: vp.width * dpr, maxHeight: vp.height * dpr, everyNthFrame: 1 });
    this.t0 = Date.now() / 1000;
  }
  async stop() {
    const t1 = Date.now() / 1000;
    await this.cdp.send('Page.stopScreencast'); await sleep(200); await this.cdp.detach();
    fs.writeFileSync(path.join(this.dir, 'frames.json'), JSON.stringify({ t0: this.t0, t1, frames: this.frames }));
    return this.frames.length;
  }
}

function driver(page) {
  let pos = { x: 1500, y: 860 };
  const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  const box = async (target) => {
    if (target && typeof target.boundingBox === 'function') return target.boundingBox();
    if (typeof target !== 'string') return target;
    const el = await page.waitForSelector(target, { visible: true, timeout: 15000 });
    return el.boundingBox();
  };
  const api = {
    async move(target, ms = 700, dx = 0.5, dy = 0.5) {
      const b = await box(target);
      const to = b.width !== undefined ? { x: b.x + b.width * dx, y: b.y + b.height * dy } : b;
      const steps = Math.max(8, Math.round(ms / 16)); const from = { ...pos };
      for (let i = 1; i <= steps; i++) {
        const k = ease(i / steps);
        await page.mouse.move(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k);
        await sleep(ms / steps);
      }
      pos = to;
    },
    async click(target, ms = 700) { await api.move(target, ms); await sleep(380); await page.mouse.down(); await sleep(90); await page.mouse.up(); await sleep(250); },
    async type(target, text, delay = 140) { await api.click(target); await page.keyboard.type(text, { delay }); },
    async hl(target, ms = 2600) {
      const els = typeof target === 'string' ? await page.$$(target) : [target];
      const boxes = (await Promise.all(els.map((e) => e.boundingBox()))).filter(Boolean);
      if (!boxes.length) throw new Error('highlight target not found: ' + target);
      const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y));
      const r = Math.max(...boxes.map((b) => b.x + b.width)), btm = Math.max(...boxes.map((b) => b.y + b.height));
      await page.evaluate((a) => window.__hlRect(a.x, a.y, a.w, a.h, a.ms), { x, y, w: r - x, h: btm - y, ms });
    },
    async scroll(top, ms = 900) { await page.evaluate((t) => window.scrollBy({ top: t, behavior: 'smooth' }), top); await sleep(ms); },
    async route(to) { await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, to); },
    async park(x = 1700, y = 940) { await api.move({ x, y }, 600); },
  };
  return api;
}

async function call(p, opts = {}, token) {
  const r = await fetch(API + p, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) } });
  if (!r.ok) throw new Error(`${p} -> ${r.status}`);
  return r.status === 204 ? null : r.json();
}

// ---------------- scene scripts (keyed by scene id) ----------------
const text = (t, scope = '') => `${scope} ::-p-text(${t})`.trim();
const rowSelect = async (page, name) => {
  const rows = await page.$$('.admin-panel tbody tr');
  for (const row of rows) if ((await row.evaluate((r) => r.textContent)).includes(name)) return row.$('select');
  throw new Error('row not found: ' + name);
};
const realRowSelect = async (page) => {
  const rows = await page.$$('.admin-panel tbody tr');
  for (const row of rows) if (!(await row.evaluate((r) => r.textContent.includes('healthpick.local')))) return row.$('select');
  throw new Error('no real member row');
};

const SCRIPTS = {
  async d01({ d, at }) { await at(0, 0.4); await d.move('.hero h1', 900); await d.hl('.hero-badge', 2200); await at(1, 0.6); await d.hl('.hero-visual-card', 2600); await at(1, 3.6); await d.scroll(560, 1200); await d.park(1650, 720); },
  async d02({ d, at }) { await at(0, -0.2); await d.click(text('로그인', '.header-actions')); await at(0, 1.6); await d.hl('.auth-brand-panel', 2600); await d.move('.auth-form-wrap h2', 800); await at(1, 0.2); await d.hl('.social-row', 2300); await d.move('.social-row', 700); await at(1, 2.8); await d.hl('.demo-box', 2600); await d.move('.demo-box', 700, 0.8, 0.3); },
  async d03({ d, at }) {
    await at(0, 0); await d.click('.auth-tabs button:nth-child(2)', 600);
    await d.type('.auth-form label:nth-of-type(1) input', '테스트', 160);
    await d.type('.auth-form input[type=email]', 'visitor@example.com', 55);
    await d.type('.auth-form input[type=password]', 'healthpick1', 90);
    await at(1, -0.9); await d.click('.auth-submit', 600); await sleep(500); await d.hl('.form-error', 3600);
    await at(2, 0.3); await d.hl('.password-hint', 2600); await d.park(1650, 860);
  },
  async d04({ d, at }) { await at(0, -0.2); await d.click('.auth-tabs button:nth-child(1)', 600); await d.move('.demo-actions button:nth-child(1)', 800); await d.hl('.demo-actions button:nth-child(1)', 1600); await at(1, -0.3); await d.click('.demo-actions button:nth-child(1)', 400); await d.park(1680, 700); },
  async d05({ d, at, page }) { await page.waitForSelector('.stat-grid'); await at(0, 0.3); await d.move('.stat-grid', 900, 0.15, 0.6); await d.hl('.stat-grid', 3200); await at(1, 0); await d.hl('.desktop-nav', 3600); await d.move('.desktop-nav', 800, 0.5, 0.8); },
  async d06({ d, at, page }) {
    await at(0, 0.2); await d.click(text('식단 기록', '.desktop-nav'), 700);
    await at(1, 0.2); await d.type('.meal-form input[placeholder="예: 현미밥"]', '현미', 260);
    await page.waitForSelector('.food-suggestions button', { visible: true, timeout: 15000 }); await sleep(300);
    await d.hl('.food-suggestions', 2200);
    await at(2, -0.9); await d.click('.food-suggestions button:nth-child(1)', 700);
    await sleep(500); await d.hl('.meal-form input[type=number]', 3200);
    await at(3, 0.3); await d.move('.meal-form input[placeholder="예: 현미밥"]', 800, 0.85, 0.5); await d.hl('.form-hint', 2600);
  },
  async d07({ d, at, page, state }) {
    await at(0, 0); await d.move('.meal-form select', 800); await sleep(300); await page.select('.meal-form select', '점심');
    await d.hl('.meal-form select', 1200); await d.click('.form-submit', 800);
    const today = new Date().toLocaleDateString('sv-SE');
    await page.waitForFunction((d) => [...document.querySelectorAll('.journal-list .meal-row')].some((r) => r.textContent.includes(d)), { timeout: 15000 }, today);
    state.createdMealSaved = true;
    await at(1, 0); await d.hl('.journal-list .meal-row:first-child', 3400); await d.move('.journal-list .meal-row:first-child', 800, 0.8, 0.5);
  },
  async d08({ d, at, page }) {
    await at(0, 0); await d.click(text('영양 리포트', '.desktop-nav'), 700); await page.waitForSelector('.report-nutrient');
    await at(0, 1.6); await d.hl('.report-nutrient', 3400); await d.move('.report-nutrient', 800, 0.7, 0.5);
    await at(1, -0.4); await d.scroll(260, 900); await d.hl('.weekly-chart .chart-column:last-child', 3600); await d.move('.weekly-chart .chart-column:last-child', 800, 0.5, 0.2);
  },
  async d09({ d, at, page }) {
    await at(0, 0); await page.evaluate(() => document.querySelector('.profile-panel').scrollIntoView({ behavior: 'smooth', block: 'center' })); await sleep(1100);
    await d.hl('.profile-fields', 3600); await d.move('.profile-fields', 900, 0.3, 0.4);
    await at(1, -0.6); await d.click('.profile-panel button[type=submit]', 700);
    await page.waitForSelector('.save-success', { timeout: 15000 }); await d.hl('.save-success', 2600);
  },
  async d10({ d, at, page, state }) {
    await at(0, 1.6); await d.click('.menu-toggle', 700); await sleep(700);
    await page.evaluate(() => { document.getElementById('__cursor').style.visibility = 'hidden'; });
    await page.screenshot({ path: path.join(WORK, 'compare-user-drawer.png') });
    await page.evaluate(() => { document.getElementById('__cursor').style.visibility = ''; });
    await at(1, 0); await d.hl('.mobile-drawer nav', 3200);
    await at(2, -0.4); await d.click({ x: 22, y: 430 }, 700);
  },
  async d11({ d, at, page }) {
    await at(0, 0.5); await page.evaluate(() => window.__addr('https://healthpick.onrender.com', '/admin'));
    await sleep(500); await page.keyboard.press('Enter');
    await at(1, -0.8); await d.route('/admin'); await page.evaluate(() => window.__addrHide());
    await page.waitForSelector('.admin-only'); await at(1, 0); await d.hl('.admin-only h1', 3000); await d.move('.admin-only h1', 800);
    await at(2, 0.4); await d.move('.admin-only .button', 800);
  },
  async a01({ d, at, page }) {
    await at(0, 0.2); await d.click(text('로그아웃', '.header-actions'), 700);
    await page.waitForSelector('.hero'); await sleep(500); await d.click(text('로그인', '.header-actions'), 700);
    await page.waitForSelector('.demo-actions');
    await at(1, 0); await d.hl('.demo-box', 2400); await d.move('.demo-actions button:nth-child(2)', 800);
    await sleep(1600); await d.click('.demo-actions button:nth-child(2)', 300); await page.waitForSelector('.stat-grid'); await d.park(1680, 700);
  },
  async a02({ d, at }) { await at(0, 0.2); await d.move('.desktop-nav', 800, 0.6, 0.8); await d.hl('.desktop-nav', 3400); await at(0, 2.4); await d.hl(text('회원 관리', '.desktop-nav'), 3200); await d.move(text('회원 관리', '.desktop-nav'), 700, 0.5, 0.9); },
  async a03({ d, at, page }) {
    await at(0, 0); await d.click(text('회원 관리', '.desktop-nav'), 600); await page.waitForSelector('.admin-panel tbody tr');
    await sleep(400); await d.hl('.admin-summary', 2800);
    await at(1, 0.4); const rows = await page.$$('.admin-panel tbody tr');
    const real = []; for (const r of rows) if (!(await r.evaluate((x) => x.textContent.includes('healthpick.local')))) real.push(r);
    for (const r of real) await d.hl(r, 4200);
    await d.move(real[0], 900, 0.35, 0.5);
  },
  async a04({ d, at, page }) {
    const sel = await rowSelect(page, '테스트 사용자');
    await at(0, 0.2); await d.move(sel, 900); await d.hl(sel, 2000);
    await at(1, 0); await page.select('select[aria-label="테스트 사용자 권한"]', 'admin');
    await page.waitForFunction(() => document.querySelector('select[aria-label="테스트 사용자 권한"]').value === 'admin' && !document.querySelector('select[aria-label="테스트 사용자 권한"]').disabled);
    await d.hl(sel, 1800); await sleep(1300);
    await page.select('select[aria-label="테스트 사용자 권한"]', 'user');
    await page.waitForFunction(() => document.querySelector('select[aria-label="테스트 사용자 권한"]').value === 'user' && !document.querySelector('select[aria-label="테스트 사용자 권한"]').disabled);
    await at(2, 0); const own = await rowSelect(page, '(나)'); await d.move(own, 800); await d.hl(own, 2600);
  },
  async a05({ d, at, page }) {
    const sel = await realRowSelect(page);
    await at(0, 0.2); await d.move(sel, 900); await d.hl(sel, 1800);
    await at(1, -0.9); await sel.select('user');
    await page.waitForSelector('.form-error', { visible: true, timeout: 15000 }); await sleep(250);
    await d.hl('.form-error', 4200); await d.move('.form-error', 800, 0.75, 0.5);
    await at(2, 1.0); await d.hl(sel, 3000); await d.move(sel, 800);
  },
  async a06({ d, at, page }) {
    await at(0, 1.0); await d.click('.menu-toggle', 700); await sleep(700);
    await page.evaluate(() => { document.getElementById('__cursor').style.visibility = 'hidden'; });
    await page.screenshot({ path: path.join(WORK, 'compare-admin-drawer.png') });
    await page.evaluate(() => { document.getElementById('__cursor').style.visibility = ''; });
    await at(1, 0); await d.hl(text('회원 관리', '.mobile-drawer nav'), 3400); await d.move(text('회원 관리', '.mobile-drawer nav'), 700, 0.7, 0.5);
  },
  async a08({ d, at, page }) {
    await at(0, 0.4); await d.move('.swagger-ui .info .title', 900); await d.hl('.swagger-ui .info', 2200);
    await at(1, 0); await d.scroll(470, 1100);
    await d.hl('.opblock[id*="auth"]', 1800); await sleep(1400);
    await d.hl('.opblock[id*="admin"]', 2600); await d.move('.opblock[id*="admin"]', 800, 0.3, 0.5);
  },
  async a09({ d, at, page }) {
    await page.waitForFunction(() => [...document.querySelectorAll('strong')].some((e) => e.textContent.trim() === 'Sync public food data'));
    const run = await page.evaluateHandle(() => [...document.querySelectorAll('strong')].find((e) => e.textContent.trim() === 'Sync public food data'));
    const row = await run.evaluateHandle((el) => { let r = el; while (r.parentElement && r.getBoundingClientRect().width < 900) r = r.parentElement; return r; });
    await at(0, 0.4); await d.move(run, 900); await d.hl(row, 5200);
    await at(1, 0.2); await d.move(row, 900, 0.1, 0.3); await d.hl(row, 3000);
  },
};

(async () => {
  fs.mkdirSync(path.join(WORK, 'raw'), { recursive: true });
  await call('/health');
  const user = await call('/auth/demo-login', { method: 'POST', body: JSON.stringify({ role: 'user' }) });
  const admin = await call('/auth/demo-login', { method: 'POST', body: JSON.stringify({ role: 'admin' }) });
  // Make every run start from the same state, touching only demo accounts and meals this tool created.
  await call(`/admin/users/${user.user.id}/role`, { method: 'PATCH', body: JSON.stringify({ role: 'user' }) }, admin.access_token).catch(() => {});
  const createdFile = path.join(WORK, 'created_meals.json');
  const created = fs.existsSync(createdFile) ? JSON.parse(fs.readFileSync(createdFile, 'utf8')) : [];
  for (const id of created) await call(`/meals/${id}`, { method: 'DELETE' }, user.access_token).catch(() => {});
  const before = new Set((await call('/meals', {}, user.access_token)).map((m) => m.id));

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--lang=ko-KR', '--hide-scrollbars', '--force-color-profile=srgb'] });
  const mk = async (url, viewport, token) => {
    const p = await browser.newPage(); await p.setViewport(viewport); await p.evaluateOnNewDocument(OVERLAY);
    await p.goto(url.startsWith(SITE) ? SITE + '/' : url, { waitUntil: 'networkidle0', timeout: 120000 });
    if (url.startsWith(SITE)) {
      await p.evaluate((t) => { sessionStorage.clear(); if (t) sessionStorage.setItem('healthpick_token', t); }, token || null);
      await p.goto(url, { waitUntil: 'networkidle0' });
    }
    await p.evaluate(() => document.fonts.ready); return p;
  };
  const desk = { width: 1920, height: 1080, deviceScaleFactor: 1 };
  const mob = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const pages = {
    site: await mk(SITE + '/', desk),
    docs: await mk(DOCS, desk),
    actions: await mk(ACTIONS, desk),
    user: await mk(SITE + '/dashboard', mob, user.access_token),
    admin: await mk(SITE + '/dashboard', mob, admin.access_token),
  };
  await pages.docs.waitForSelector('.opblock'); await sleep(800);
  const state = {};
  for (const sc of scenes) {
    if (!(sc.web || sc.mobile) || (ONLY.size && !ONLY.has(sc.id))) continue;
    const page = pages[sc.mobile || sc.web];
    await page.bringToFront(); await sleep(300);
    const rec = new Recorder(page);
    await rec.start(path.join(WORK, 'raw', sc.id));
    const t0 = Date.now();
    const at = async (k, off = 0) => { const wait = t0 + (sc.lines[k].t + off) * 1000 - Date.now(); if (wait > 0) await sleep(wait); };
    try {
      await SCRIPTS[sc.id]({ d: driver(page), at, page, state, sc });
    } catch (e) {
      console.error(`${sc.id} FAILED: ${e.message}`); await rec.stop();
      const made = (await call('/meals', {}, user.access_token)).filter((m) => !before.has(m.id)).map((m) => m.id);
      fs.writeFileSync(createdFile, JSON.stringify([...new Set([...created, ...made])])); await browser.close(); process.exit(1);
    }
    const left = t0 + sc.dur * 1000 + 400 - Date.now();
    if (left < 0) console.warn(`${sc.id} actions overran by ${(-left / 1000).toFixed(2)}s`);
    await sleep(Math.max(left, 0));
    console.log(`${sc.id} recorded ${await rec.stop()} frames`);
  }
  const after = (await call('/meals', {}, user.access_token)).filter((m) => !before.has(m.id)).map((m) => m.id);
  fs.writeFileSync(createdFile, JSON.stringify(after));
  // Comparison card for scene a07, built from the two real drawer captures.
  const card = await browser.newPage(); await card.setViewport(desk);
  const img = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(WORK, f)).toString('base64');
  await card.setContent(fs.readFileSync(path.join(__dirname, 'compare.html'), 'utf8')
    .replace('{{USER}}', img('compare-user-drawer.png')).replace('{{ADMIN}}', img('compare-admin-drawer.png')), { waitUntil: 'networkidle0' });
  await card.evaluate(() => document.fonts.ready); await sleep(500);
  await card.screenshot({ path: path.join(WORK, 'compare.png') });
  const rects = await card.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-hl]')].map((e) => {
    const r = e.getBoundingClientRect(); return [e.dataset.hl, [r.x, r.y, r.width, r.height]];
  })));
  fs.writeFileSync(path.join(WORK, 'compare.json'), JSON.stringify(rects));
  await browser.close();
  console.log('done; meals created by this run:', after.length);
})();
