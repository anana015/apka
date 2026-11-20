// =====================================================================
// HISTORIA PRZEGLĄDARKI: przycisk / gest „Wstecz” i adresy widoków
//
// Bez tego „Wstecz” na Androidzie (i w zainstalowanej PWA) zamykał aplikację, zamiast
// wrócić np. ze szczegółów celu do listy. Każdy widok ma teraz adres w części „#…”:
//   #pulpit  #transakcje  #import  #statystyki
//   #cele  #cele/<id celu>
//   #ustawienia  #ustawienia/<strona>  #ustawienia/kategoria/<id kategorii>
// Zmiana widoku dopisuje wpis do historii (pushState), „Wstecz” (popstate) przywraca widok.
// Odświeżenie strony otwiera ten sam widok. Historia działa dopiero w aplikacji – na ekranie
// logowania część „#…” należy do linków z e-maili Supabase (konto.js).
// =====================================================================

const ZAKLADKI_Z_ADRESEM = ['pulpit', 'transakcje', 'import', 'cele', 'statystyki', 'ustawienia'];

let historiaAktywna = false;
let przywracanieAdresu = false;

// ---- Czyste funkcje (testy w tests/nawigacja.test.js) ----------------

/**
 * '#cele/abc' -> { zakladka: 'cele', cel: 'abc', strona: null, kategoria: null }
 * Adres spoza listy (np. '#access_token=…' z e-maila) -> null.
 */
function parsujAdres(hash) {
    const czesci = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean).map(c => {
        try { return decodeURIComponent(c); } catch (e) { return c; }
    });
    const [zakladka, a, b] = czesci;
    if (!ZAKLADKI_Z_ADRESEM.includes(zakladka)) return null;
    const wynik = { zakladka, cel: null, strona: null, kategoria: null };
    if (zakladka === 'cele' && a) wynik.cel = a;
    if (zakladka === 'ustawienia') {
        wynik.strona = a || 'menu';
        if (a === 'kategoria') wynik.kategoria = b || null;
    }
    return wynik;
}

// Adres widoku dla stanu ekranu (pola jak w stan)
function adresDlaStanu({ zakladka, otwartyCel, ustawieniaStrona, ustawieniaKategoria }) {
    const kod = encodeURIComponent;
    if (zakladka === 'cele' && otwartyCel) return `#cele/${kod(otwartyCel)}`;
    if (zakladka === 'ustawienia') {
        if (ustawieniaStrona === 'kategoria' && ustawieniaKategoria != null) return `#ustawienia/kategoria/${kod(ustawieniaKategoria)}`;
        return ustawieniaStrona && ustawieniaStrona !== 'menu' ? `#ustawienia/${kod(ustawieniaStrona)}` : '#ustawienia';
    }
    return `#${zakladka || 'pulpit'}`;
}

// ---- Historia -------------------------------------------------------

// Wywoływane po każdej zmianie widoku (zmienZakladke, odswiezCele, odswiezUstawienia)
function zapiszAdresWidoku() {
    if (!historiaAktywna || przywracanieAdresu) return;
    const adres = adresDlaStanu(stan);
    if (location.hash === adres) return;
    try { history.pushState({ budzet: true }, '', adres); } catch (e) {}
}

// Po pokazaniu aplikacji: widok z adresu (odświeżenie, link) albo bieżący
function wlaczHistorie() {
    historiaAktywna = true;
    const cel = parsujAdres(location.hash);
    if (cel) przejdzDoAdresu(cel);
    try { history.replaceState({ budzet: true }, '', adresDlaStanu(stan)); } catch (e) {}
}

// Wylogowanie: ekran logowania bez adresu widoku
function wylaczHistorie() {
    historiaAktywna = false;
    if (parsujAdres(location.hash)) {
        try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    }
}

function przejdzDoAdresu(cel) {
    przywracanieAdresu = true;
    try {
        if (cel.zakladka !== stan.zakladka) zmienZakladke(cel.zakladka);
        if (cel.zakladka === 'cele' && String(stan.otwartyCel || '') !== String(cel.cel || '')) {
            if (cel.cel) otworzSzczegolyCelu(cel.cel);
            else zamknijSzczegolyCelu();
        }
        if (cel.zakladka === 'ustawienia' &&
            (stan.ustawieniaStrona !== cel.strona || String(stan.ustawieniaKategoria ?? '') !== String(cel.kategoria ?? ''))) {
            otworzStroneUstawien(cel.strona, { kategoria: cel.kategoria });
        }
    } finally {
        przywracanieAdresu = false;
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('popstate', () => {
        if (!historiaAktywna) return;
        const cel = parsujAdres(location.hash);
        if (cel) przejdzDoAdresu(cel);
    });
}
