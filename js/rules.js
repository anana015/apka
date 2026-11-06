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

        const zKontaWyplat = KONTO_WYPLAT_ZE_SKARBONEK &&
            (konto.includes(KONTO_WYPLAT_ZE_SKARBONEK) || tekst.includes(KONTO_WYPLAT_ZE_SKARBONEK));
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

// dynamiczneReguly są posortowane od najnowszej, więc wygrywa najnowsza pasująca reguła
function dopasujRegule(t) {
    for (const regula of dynamiczneReguly) {
        if (pasujeFraza(t, regula.phrase || regula.keyword)) {
            return regula.category || regula.category_name;
        }
    }
    return null;
}

// typ: 'pominiete' | 'wplata' | 'wyplata' | 'przychod' | 'wydatek'
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
