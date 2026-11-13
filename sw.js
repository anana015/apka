// =====================================================================
// SERVICE WORKER (specyfikacja 2: „zapis plików aplikacji w pamięci podręcznej”)
//
// Pliki aplikacji (ta sama domena): najpierw sieć, a gdy jej nie ma albo odpowiada dłużej
// niż LIMIT_SIECI_MS – kopia z pamięci podręcznej. Dzięki temu po wgraniu nowej wersji
// na GitHub Pages użytkownik od razu dostaje nowe pliki, a bez internetu aplikacja i tak startuje.
// Czcionki Google: najpierw pamięć podręczna (nie zmieniają się).
// Supabase (dane, logowanie, paragony) NIE przechodzi przez pamięć podręczną – dane budżetu
// offline trzyma offline.js w IndexedDB, osobno dla każdej osoby, i usuwa je przy wylogowaniu.
//
// Po zmianie listy plików albo strategii zmień WERSJA – stare kopie zostaną usunięte.
// =====================================================================

const WERSJA = '2026-11-13';
const CACHE_APLIKACJI = `budzet-aplikacja-${WERSJA}`;
const CACHE_CZCIONEK = 'budzet-czcionki-v1';
const LIMIT_SIECI_MS = 4000;

const PLIKI_APLIKACJI = [
    './',
    'index.html',
    'manifest.webmanifest',
    'css/app.css',
    'css/tailwind.css',
    'icons/favicon.svg',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon-maskable-512.png',
    'icons/apple-touch-icon.png',
    'js/vendor/supabase-js-2.119.0.js',
    'js/vendor/papaparse-5.4.1.min.js',
    'js/vendor/lucide-1.70.0.min.js',
    'js/zdarzenia.js',
    'js/config.js',
    'js/utils.js',
    'js/state.js',
    'js/offline.js',
    'js/potwierdzenia.js',
    'js/nawigacja.js',
    'js/rules.js',
    'js/calc.js',
    'js/wykresy.js',
    'js/db.js',
    'js/views/pulpit.js',
    'js/views/transakcje.js',
    'js/views/paragony.js',
    'js/banki.js',
    'js/views/import.js',
    'js/views/cele.js',
    'js/views/statystyki.js',
    'js/views/oszczednosci.js',
    'js/views/kopia.js',
    'js/views/konto.js',
    'js/views/ustawienia.js',
    'js/app.js',
    'js/pwa.js'
];

self.addEventListener('install', zdarzenie => {
    zdarzenie.waitUntil((async () => {
        const cache = await caches.open(CACHE_APLIKACJI);
        // Plik po pliku: brak jednego (np. ikony) nie blokuje instalacji całości
        await Promise.all(PLIKI_APLIKACJI.map(adres =>
            cache.add(new Request(adres, { cache: 'reload' })).catch(() => {})
        ));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', zdarzenie => {
    zdarzenie.waitUntil((async () => {
        const nazwy = await caches.keys();
        await Promise.all(nazwy
            .filter(n => n.startsWith('budzet-aplikacja-') && n !== CACHE_APLIKACJI)
            .map(n => caches.delete(n)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', zdarzenie => {
    const zadanie = zdarzenie.request;
    if (zadanie.method !== 'GET') return;
    const adres = new URL(zadanie.url);

    if (adres.origin === self.location.origin) {
        zdarzenie.respondWith(najpierwSiec(zadanie));
    } else if (adres.hostname === 'fonts.googleapis.com' || adres.hostname === 'fonts.gstatic.com') {
        zdarzenie.respondWith(najpierwPamiec(zadanie, CACHE_CZCIONEK));
    }
    // Pozostałe (Supabase) – zwykłe zapytanie sieciowe, bez pamięci podręcznej
});

async function najpierwSiec(zadanie) {
    const cache = await caches.open(CACHE_APLIKACJI);
    const zSieci = fetch(zadanie).then(odpowiedz => {
        if (odpowiedz.ok && odpowiedz.type === 'basic') cache.put(zadanie, odpowiedz.clone());
        return odpowiedz;
    });
    zSieci.catch(() => {}); // błąd obsługujemy niżej – bez ostrzeżenia o nieobsłużonym odrzuceniu

    try {
        return await Promise.race([
            zSieci,
            new Promise((_, odrzuc) => setTimeout(() => odrzuc(new Error('Limit czasu sieci')), LIMIT_SIECI_MS))
        ]);
    } catch (blad) {
        const zapisana = await cache.match(zadanie, { ignoreSearch: true }) ||
            (zadanie.mode === 'navigate' ? await cache.match('index.html') : undefined);
        if (zapisana) return zapisana;
        return zSieci; // brak kopii – czekamy dalej na sieć (albo zwracamy jej błąd)
    }
}

async function najpierwPamiec(zadanie, nazwaCache) {
    const cache = await caches.open(nazwaCache);
    const zapisana = await cache.match(zadanie);
    if (zapisana) return zapisana;
    const odpowiedz = await fetch(zadanie);
    if (odpowiedz.ok || odpowiedz.type === 'opaque') cache.put(zadanie, odpowiedz.clone());
    return odpowiedz;
}
