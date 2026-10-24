/* Avoin sää – service worker
   - Sovelluksen omat tiedostot: verkko ensin, välimuisti varalla (päivitykset näkyvät heti, toimii offline).
   - Säädata (Open-Meteo, Ilmatieteen laitos, Digitraffic): verkko ensin, viimeisin vastaus varalla offline-tilaan.
   - Fontit: välimuisti ensin.
   Kasvata VERSION-numeroa, kun julkaiset uuden version sovelluksen tiedostoista. */
const VERSION = 'avoinsaa-shell-v1';
const DATA = 'avoinsaa-data';
const FONTS = 'avoinsaa-fonts';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
  'icons/apple-touch-icon.png', 'icons/favicon-32.png', 'icons/icon.svg'
];
const DATA_HOSTS = ['api.open-meteo.com', 'geocoding-api.open-meteo.com', 'opendata.fmi.fi', 'tie.digitraffic.fi'];
const MAX_DATA_ENTRIES = 80;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('avoinsaa-shell-') && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) { e.respondWith(shell(req)); return; }
  if (DATA_HOSTS.includes(url.hostname)) { e.respondWith(data(req, url)); return; }
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
