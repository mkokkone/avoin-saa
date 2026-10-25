/* Avoin sää – service worker
   - Sovelluksen omat tiedostot: verkko ensin, välimuisti varalla (päivitykset näkyvät heti, toimii offline).
   - Säädata (Open-Meteo, Ilmatieteen laitos, Digitraffic): verkko ensin, viimeisin vastaus varalla offline-tilaan.
   - Tutkakuvat (aikaleimalliset, eivät muutu): välimuisti ensin. Taustakartta on sovelluksen sisällä.
   - Fontit: välimuisti ensin.
   Kasvata VERSION-numeroa, kun julkaiset uuden version sovelluksen tiedostoista. */
const VERSION = 'avoinsaa-shell-v4';
const DATA = 'avoinsaa-data';
const FONTS = 'avoinsaa-fonts';
const RADAR = 'avoinsaa-radar';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'maskable-512.png',
  'apple-touch-icon.png', 'favicon-32.png', 'icon.svg'
];
const DATA_HOSTS = ['api.open-meteo.com', 'geocoding-api.open-meteo.com', 'opendata.fmi.fi', 'tie.digitraffic.fi'];
const MAX_DATA_ENTRIES = 80;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => (k.startsWith('avoinsaa-shell-') && k !== VERSION) || k === 'avoinsaa-tiles').map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) { e.respondWith(shell(req)); return; }
  if (DATA_HOSTS.includes(url.hostname)) { e.respondWith(data(req, url)); return; }
  if (url.hostname === 'openwms.fmi.fi' && url.searchParams.has('time')) { e.respondWith(cacheFirst(req, RADAR, 150)); return; }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') { e.respondWith(fonts(req)); }
});

async function shell(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') return (await cache.match('index.html')) || (await cache.match('./'));
    throw err;
  }
}

// Avain ilman aikaleimaa, jotta offline-tilassa löytyy viimeisin vastaus samalle paikalle.
function dataKey(url) {
  const u = new URL(url.href);
  u.searchParams.delete('starttime');
  return u.href;
}

async function data(req, url) {
  const cache = await caches.open(DATA);
  const key = dataKey(url);
  try {
    const res = await fetch(req);
    if (res.ok) {
      await cache.delete(key);            // poistetaan ja lisätään uudelleen, jolloin uusin on listan lopussa
      await cache.put(key, res.clone());
      trim(cache);
    }
    return res;
  } catch (err) {
    const hit = await cache.match(key);
    if (hit) return hit;
    throw err;
  }
}

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_DATA_ENTRIES; i++) await cache.delete(keys[i]);
}

async function fonts(req) {
  const cache = await caches.open(FONTS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function cacheFirst(req, name, max) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    // virheviestejä (XML) ei tallenneta tutkakuviksi
    const type = res.headers.get('content-type') || '';
    if (name !== RADAR || /tiff/i.test(type)) { await cache.put(req, res.clone()); trimTo(cache, max); }
  }
  return res;
}

async function trimTo(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}
