// =====================================================================
// KOPIA DANYCH NA URZĄDZENIU – TRYB OFFLINE (specyfikacja 2 i 11.2: PWA działa bez internetu)
//
// Po każdym udanym pobraniu z chmury (i po każdej zmianie) dane otwartego budżetu trafiają
// do IndexedDB tej przeglądarki – osobno dla każdej osoby i budżetu. Gdy chmura jest
// nieosiągalna (brak sieci), aplikacja pokazuje tę kopię w trybie TYLKO DO ODCZYTU:
// zapisy do bazy są blokowane w db.js, a po powrocie internetu dane pobierają się od nowa.
// Wylogowanie usuwa wszystkie kopie z urządzenia (app.js: zakonczSesjeLokalnie).
// Pliki aplikacji (HTML, CSS, JS) zapisuje service worker – sw.js.
// =====================================================================

const BAZA_OFFLINE = 'budzet-offline';
const MAGAZYN_MIGAWEK = 'migawki';
const WERSJA_MIGAWKI = 1;
// Ostatnie konto na tym urządzeniu – żeby bez internetu (gdy sesja logowania wygasła
// i nie da się jej odświeżyć) otworzyć kopię tej samej osoby. Usuwane przy wylogowaniu.
const KLUCZ_KONTA_OFFLINE = 'budzet.offline.konto';

let bazaOffline = null;

function otworzBazeOffline() {
    if (bazaOffline) return bazaOffline;
    bazaOffline = new Promise(ok => {
        if (typeof indexedDB === 'undefined') return ok(null);
        let zadanie;
        try {
            zadanie = indexedDB.open(BAZA_OFFLINE, 1);
        } catch (e) {
            return ok(null); // np. tryb prywatny w starszym Safari
        }
        zadanie.onupgradeneeded = () => zadanie.result.createObjectStore(MAGAZYN_MIGAWEK);
        zadanie.onsuccess = () => ok(zadanie.result);
        zadanie.onerror = () => ok(null);
        zadanie.onblocked = () => ok(null);
    });
    return bazaOffline;
}

// Jedna operacja na magazynie migawek; przy braku IndexedDB zwraca null zamiast błędu
async function operacjaMigawek(tryb, dzialanie) {
    const baza = await otworzBazeOffline();
    if (!baza) return null;
    return new Promise(ok => {
        try {
            const tx = baza.transaction(MAGAZYN_MIGAWEK, tryb);
            const zadanie = dzialanie(tx.objectStore(MAGAZYN_MIGAWEK));
            tx.oncomplete = () => ok(zadanie ? zadanie.result : true);
            tx.onerror = tx.onabort = () => ok(null);
        } catch (e) {
            ok(null);
        }
    });
}

function kluczMigawki(uzytkownikId, budzet) {
    return `${uzytkownikId}:${budzet}`;
}

// ---- Zapis ----------------------------------------------------------

function migawkaZeStanu() {
    return {
        wersja: WERSJA_MIGAWKI,
        zapisano: new Date().toISOString(),
        budzet: stan.budzet,
        transakcje: stan.transakcje,
        reguly: dynamiczneReguly,
        cele: stan.cele,
        kategorie: stan.kategorie,
        kategorieZBazy: stan.kategorieZBazy,
        importy: stan.importy,
        ustawieniaBudzetu: stan.ustawieniaBudzetu,
        ustawieniaBudzetuDostepne: stan.ustawieniaBudzetuDostepne,
        schematBudzetow: stan.schematBudzetow,
        dostepWspolny: stan.dostepWspolny
    };
}

async function zapiszMigawke() {
    // Tylko prawdziwe dane z chmury: nie pusty ekran po przełączeniu budżetu ani kopia z kopii
    if (!stan.daneZaladowane || stan.trybOffline || !stan.uzytkownikId) return;
    const klucz = kluczMigawki(stan.uzytkownikId, stan.budzet);
    let migawka;
    try {
        // Kopia przez JSON: odcina obiekty od stanu (Set, funkcje itp. nie trafią do bazy)
        migawka = JSON.parse(JSON.stringify(migawkaZeStanu()));
    } catch (e) {
        return;
    }
    await operacjaMigawek('readwrite', s => s.put(migawka, klucz));
}

// Zapis po zmianie odkładamy o chwilę – kilka szybkich zmian = jeden zapis
let timerMigawki = null;
function zaplanujZapisMigawki() {
    if (!stan.daneZaladowane || stan.trybOffline) return;
    clearTimeout(timerMigawki);
    timerMigawki = setTimeout(zapiszMigawke, 800);
}

// ---- Odczyt i tryb offline ------------------------------------------

async function wczytajMigawke(uzytkownikId, budzet) {
    if (!uzytkownikId) return null;
    const m = await operacjaMigawek('readonly', s => s.get(kluczMigawki(uzytkownikId, budzet)));
    return m && m.wersja === WERSJA_MIGAWKI ? m : null;
}

function wlaczTrybOffline(m) {
    Object.assign(stan, {
        transakcje: m.transakcje || [],
        cele: m.cele || [],
        kategorie: m.kategorie && m.kategorie.length ? m.kategorie : kategorieDomyslne(stan.budzet),
        kategorieZBazy: !!m.kategorieZBazy,
        importy: m.importy ?? null,
        ustawieniaBudzetu: m.ustawieniaBudzetu || null,
        ustawieniaBudzetuDostepne: !!m.ustawieniaBudzetuDostepne,
        schematBudzetow: m.schematBudzetow ?? stan.schematBudzetow,
        dostepWspolny: m.dostepWspolny || stan.dostepWspolny,
        daneZaladowane: true,
        trybOffline: { zapisano: m.zapisano }
    });
    dynamiczneReguly = m.reguly || [];
    document.body.classList.add('tryb-offline');
}

function wylaczTrybOffline() {
    stan.trybOffline = null;
    document.body.classList.remove('tryb-offline');
}

function opisTrybuOffline() {
    const d = new Date(stan.trybOffline && stan.trybOffline.zapisano);
    const kiedy = Number.isNaN(d.getTime()) ? 'ostatniego połączenia'
        : d.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `Offline · dane z ${kiedy} · tylko podgląd`;
}

// Błąd wynikający z braku połączenia (a nie np. z zasad dostępu w bazie)
function czyBladSieci(error) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    const tekst = `${(error && error.name) || ''} ${(error && error.message) || error || ''}`;
    return /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|err_internet/i.test(tekst);
}

// ---- Konto ostatnio używane na urządzeniu ----------------------------

function zapamietajKontoOffline(uzytkownikId, email) {
    try { localStorage.setItem(KLUCZ_KONTA_OFFLINE, JSON.stringify({ id: uzytkownikId, email: email || '' })); } catch (e) {}
}

function kontoOffline() {
    try {
        const k = JSON.parse(localStorage.getItem(KLUCZ_KONTA_OFFLINE));
        return k && k.id ? k : null;
    } catch (e) {
        return null;
    }
}

// Wylogowanie: na urządzeniu nie zostają żadne dane budżetu
async function usunDaneOffline() {
    clearTimeout(timerMigawki);
    try { localStorage.removeItem(KLUCZ_KONTA_OFFLINE); } catch (e) {}
    await operacjaMigawek('readwrite', s => s.clear());
}
