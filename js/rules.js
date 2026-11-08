// =====================================================================
// KLASYFIKACJA TRANSAKCJI
// Kolejność wg specyfikacji: Pomiń -> cel -> typ -> kategoria.
// Funkcje nie dotykają interfejsu ani bazy.
// =====================================================================

function celRecznyId(t) {
    const k = t.category_manual || '';
    return k.startsWith(PREFIKS_CELU) ? k.slice(PREFIKS_CELU.length) : null;
}

function kategoriaReczna(t) {
    const k = t.category_manual;
    return k && !k.startsWith(PREFIKS_CELU) ? k : null;
}

// Wspólne subkonto wypłat ze skarbonek dotyczy tylko budżetu wspólnego (konto w Pekao).
// W budżecie osobistym wypłaty z celów rozpoznajemy po numerze subkonta i słowach wypłat.
function kontoWyplatZeSkarbonek() {
    return stan.budzet === 'wspolny' ? KONTO_WYPLAT_ZE_SKARBONEK : '';
}

// Wypłata: cel po słowach kluczowych wypłat (keywords_out) w tytule / kontrahencie
function celPoSlowachWyplat(t) {
    const tekstN = normalizuj(`${t.counterparty || ''} ${t.title || ''}`);
    for (const c of stan.cele) {
        if (c.archived || !c.keywords_out) continue;
        const slowa = c.keywords_out.split(',').map(s => normalizuj(s.trim())).filter(s => s.length > 1);
        if (slowa.some(s => tekstN.includes(s))) return c;
    }
    return null;
}

// Zwraca { cel, reczny } albo null (brak związku ze skarbonkami).
// cel === null oznacza wypłatę ze skarbonek, której nie udało się przypisać do celu.
//  - wpłata (kwota < 0): po numerze subkonta danego celu (pole keyword)
//  - wypłata (kwota > 0): ze wspólnego konta wypłat; cel po słowach kluczowych wypłat
function znajdzCel(t) {
    const recznyId = celRecznyId(t);
    if (recznyId) {
        const cel = stan.cele.find(c => String(c.id) === recznyId);
        if (cel) return { cel, reczny: true };
    }

    const konto = czystyNumer(t.account_number);
    const tekst = czystyNumer(`${t.counterparty || ''} ${t.title || ''}`);
    const cele = stan.cele || [];

    // Numer subkonta celu (przy kilku trafieniach wygrywa najdłuższe)
    let najlepszy = null;
    let najdluzszy = 0;
    for (const c of cele) {
        if (c.archived) continue;
        const kw = czystyNumer(c.keyword);
        if (kw && kw.length > najdluzszy && (konto.includes(kw) || tekst.includes(kw))) {
            najlepszy = c;
            najdluzszy = kw.length;
        }
    }
    if (najlepszy) return { cel: najlepszy, reczny: false };

    if (t.amount_gr > 0) {
        // Słowa kluczowe wypłat działają też dla starszych importów,
        // w których numer konta wypłat mógł się nie zapisać
        const cel = celPoSlowachWyplat(t);
        if (cel) return { cel, reczny: false };

        const kontoWyplat = kontoWyplatZeSkarbonek();
        const zKontaWyplat = kontoWyplat && (konto.includes(kontoWyplat) || tekst.includes(kontoWyplat));
        if (zKontaWyplat) return { cel: null, reczny: false };
    }
    return null;
}

// Reguła pasuje, gdy WSZYSTKIE jej słowa występują w tekście (kontrahent + tytuł)
function pasujeFraza(t, fraza) {
    const slowa = normalizuj(fraza).split(/\s+/).filter(Boolean);
    if (slowa.length === 0 || slowa.join('').length <= 2) return false;
    const tekst = normalizuj(`${t.counterparty || ''} ${t.title || ''}`);
    return slowa.every(s => tekst.includes(s));
}

// Reguła z numerem rachunku (same cyfry, co najmniej 10) – porównujemy z rachunkiem
// drugiej strony, np. numer konta wspólnego -> „Przelew na wspólne” (Ustawienia)
function czyRegulaRachunku(fraza) {
    return /^\d{10,}$/.test(czystyNumer(fraza));
}

function pasujeRegula(t, fraza) {
    if (czyRegulaRachunku(fraza)) return czystyNumer(t.account_number).includes(czystyNumer(fraza));
    return pasujeFraza(t, fraza);
}

// Reguły rachunku są dokładniejsze, więc sprawdzamy je pierwsze; potem frazy.
// dynamiczneReguly są posortowane od najnowszej, więc wygrywa najnowsza pasująca reguła.
function dopasujRegule(t) {
    for (const rachunku of [true, false]) {
        for (const regula of dynamiczneReguly) {
            const fraza = regula.phrase || regula.keyword;
            if (czyRegulaRachunku(fraza) === rachunku && pasujeRegula(t, fraza)) {
                return regula.category || regula.category_name;
            }
        }
    }
    return null;
}

// Podział wydatku na 2–5 części (limit: MAKS_CZESCI w transakcje.js): t.splits = [{ category, amount_gr }] (kwoty ujemne jak transakcja).
// Uznajemy go tylko, gdy jest kompletny: każda część ma kategorię, a suma części = kwota transakcji.
function podzialTransakcji(t) {
    const p = t.splits;
    if (!Array.isArray(p) || p.length < 2 || !(t.amount_gr < 0)) return null;
    if (p.some(c => !c || !c.category || !(Number(c.amount_gr) < 0))) return null;
    const suma = p.reduce((s, c) => s + Number(c.amount_gr), 0);
    return suma === t.amount_gr ? p : null;
}

// Kategoria oszczędnościowa (categories.is_saving, a przed migracją lista z config.js):
// wydatek w niej liczy się jako oszczędność, nie wydatek (podsumuj w calc.js)
function czyKategoriaOszczednosciowa(nazwa) {
    const k = (stan.kategorie || []).find(x => x.name === nazwa);
    if (k && typeof k.is_saving === 'boolean') return k.is_saving;
    return KATEGORIE_OSZCZEDNOSCIOWE.includes(nazwa);
}

// Wydatek, który w całości trafia do oszczędności (do kolorów i eksportu; podział liczy podsumuj)
function czyWydatekOszczednosciowy(k) {
    return k.typ === 'wydatek' && !!k.kategoria && czyKategoriaOszczednosciowa(k.kategoria);
}

// typ: 'pominiete' | 'wplata' | 'wyplata' | 'przychod' | 'wydatek'
// Wydatek podzielony ma kategoria = null i podzial = [...części].
function klasyfikuj(t) {
    if (t.category_manual === POMIN) {
        return { typ: 'pominiete', cel: null, celReczny: false, kategoria: POMIN };
    }
    const dopasowanie = znajdzCel(t);
    if (dopasowanie) {
        return {
            typ: t.amount_gr < 0 ? 'wplata' : 'wyplata',
            cel: dopasowanie.cel,
            celReczny: dopasowanie.reczny,
            kategoria: null
        };
    }
    if (t.amount_gr > 0) {
        return { typ: 'przychod', cel: null, celReczny: false, kategoria: kategoriaReczna(t) };
    }
    const podzial = podzialTransakcji(t);
    if (podzial) return { typ: 'wydatek', cel: null, celReczny: false, kategoria: null, podzial };
    return { typ: 'wydatek', cel: null, celReczny: false, kategoria: kategoriaReczna(t) || dopasujRegule(t) };
}

// Fraza reguły: dwa pierwsze sensowne słowa kontrahenta (lub tytułu, gdy brak kontrahenta).
// Pomijamy słowa z cyframi (numery sklepów, np. Z4521), formy prawne i bankowe formułki.
const SLOWA_POMIJANE = new Set([
    'SPOLKA', 'ZOO', 'SKA', 'SPJ', 'POLSKA', 'THE', 'AND', 'DLA', 'UL',
    'PLATNOSC', 'KARTA', 'KARTY', 'KARTE', 'ZAKUP', 'PRZY', 'UZYCIU', 'TRANSAKCJA',
    'BLIK', 'PRZELEW', 'OPLATA', 'OPERACJA', 'WYPLATA', 'WPLATA', 'TYTULEM', 'NUMER', 'NRB'
]);
function utworzFraze(kontrahent, tytul) {
    const zrodlo = (kontrahent || '').trim() || (tytul || '').trim();
    const tokeny = normalizuj(zrodlo).split(/[^A-Z0-9&]+/).filter(Boolean);
    const dobre = tokeny.filter(s => s.length > 2 && !/\d/.test(s) && !SLOWA_POMIJANE.has(s));
    if (dobre.length > 0) return dobre.slice(0, 2).join(' ');
    return tokeny.find(s => s.length > 2) || null;
}
