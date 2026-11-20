// =====================================================================
// OBLICZENIA (sumy w groszach). Funkcje nie dotykają interfejsu ani bazy.
// =====================================================================

// "Do przypisania": wydatek bez kategorii albo wypłata ze skarbonek bez celu.
// Wersja przyjmująca gotową klasyfikację – żeby nie liczyć klasyfikuj() dwa razy.
function czyKlasyfikacjaDoPrzypisania(k) {
    return (k.typ === 'wydatek' && !k.kategoria && !k.podzial) || (k.typ === 'wyplata' && !k.cel);
}

function czyBezKategorii(t) {
    return czyKlasyfikacjaDoPrzypisania(klasyfikuj(t));
}

function liczBezKategorii() {
    return stan.transakcje.filter(czyBezKategorii).length;
}

// Sumy dla listy transakcji. Pominięte nie wchodzą do żadnej sumy.
// Wydatek w kategorii oszczędnościowej (np. „Akcje/Obligacje”) liczy się jak wpłata
// na oszczędności: do wplaty i odłożonego netto, nie do wydatków ani listy kategorii.
// s.inwestycje = ta część wpłat (do podpisów), s.kategorieOszczednosci = rozbicie wg kategorii (netto).
//
// Zwrot (specyfikacja 11.1): wpływ z ręcznie wybraną kategorią nie jest przychodem, tylko
// pomniejsza wydatki tej kategorii (s.zwroty = ich suma). Wpływ w kategorii oszczędnościowej
// (np. sprzedaż obligacji) to wypłata z oszczędności: wyplaty, nie przychód.
function podsumuj(lista) {
    const s = {
        przychody: 0, wydatki: 0, wplaty: 0, wyplaty: 0, zwroty: 0,
        inwestycje: 0, inwestycjeWyplaty: 0, kategorie: {}, kategorieOszczednosci: {}
    };
    for (const t of lista) {
        const k = klasyfikuj(t);
        const kwota = Math.abs(t.amount_gr);
        if (k.typ === 'przychod') {
            if (!k.kategoria) {
                s.przychody += kwota;
            } else if (czyKategoriaOszczednosciowa(k.kategoria)) {
                s.wyplaty += kwota;
                s.inwestycjeWyplaty += kwota;
                s.kategorieOszczednosci[k.kategoria] = (s.kategorieOszczednosci[k.kategoria] || 0) - kwota;
            } else {
                s.wydatki -= kwota;
                s.zwroty += kwota;
                s.kategorie[k.kategoria] = (s.kategorie[k.kategoria] || 0) - kwota;
            }
        } else if (k.typ === 'wydatek') {
            // Podzielony wydatek: każda część do swojej kategorii; część „Pomiń” nie wchodzi do sum
            const czesci = k.podzial
                ? k.podzial.map(c => ({ nazwa: c.category, kwota: Math.abs(c.amount_gr) }))
                : [{ nazwa: k.kategoria || 'Nieprzypisane', kwota }];
            for (const c of czesci) {
                if (c.nazwa === POMIN) continue;
                if (czyKategoriaOszczednosciowa(c.nazwa)) {
                    s.wplaty += c.kwota;
                    s.inwestycje += c.kwota;
                    s.kategorieOszczednosci[c.nazwa] = (s.kategorieOszczednosci[c.nazwa] || 0) + c.kwota;
                    continue;
                }
                s.wydatki += c.kwota;
                s.kategorie[c.nazwa] = (s.kategorie[c.nazwa] || 0) + c.kwota;
            }
        } else if (k.typ === 'wplata') {
            s.wplaty += kwota;
        } else if (k.typ === 'wyplata') {
            s.wyplaty += kwota;
        }
    }
    s.netto = s.wplaty - s.wyplaty; // odłożone netto
    return s;
}

// Saldo każdego celu: saldo początkowe + wpłaty − wypłaty (przelewy z wyciągów i operacje ręczne)
// + szacowane odsetki po podatku
function saldaCelow() {
    const ops = operacjeCelow();
    const salda = {};
    stan.cele.forEach(c => {
        const przeplywy = ops[c.id].reduce((s, o) => s + (o.typ === 'wplata' ? o.kwota : -o.kwota), 0);
        salda[c.id] = (c.opening_balance_gr || 0) + przeplywy + odsetkiCelu(c, ops[c.id]).netto;
    });
    return salda;
}

// Odsetki netto wszystkich celów w podziale na miesiące kapitalizacji: { 'RRRR-MM': grosze }
function odsetkiCelowMiesiecznie() {
    const ops = operacjeCelow();
    const wynik = {};
    stan.cele.forEach(c => {
        odsetkiCelu(c, ops[c.id]).kapitalizacje.forEach(k => {
            const klucz = k.data.slice(0, 7);
            wynik[klucz] = (wynik[klucz] || 0) + k.netto;
        });
    });
    return wynik;
}

// Operacje ręczne wszystkich celów netto w podziale na miesiące: { 'RRRR-MM': grosze ze znakiem }.
// Nie ma ich w wyciągach, więc wykres „Saldo subkont” (Statystyki) odejmuje je osobno.
function operacjeReczneMiesiecznie() {
    const wynik = {};
    stan.cele.forEach(c => {
        operacjeReczneCelu(c).forEach(o => {
            const klucz = o.date.slice(0, 7);
            wynik[klucz] = (wynik[klucz] || 0) + o.amount_gr;
        });
    });
    return wynik;
}

// =====================================================================
// ODSETKI NA SUBKONTACH (szacunek)
// Odsetki naliczane dziennie od salda na koniec dnia według progów oprocentowania,
// dopisywane w ostatnim dniu miesiąca kapitalizacji po potrąceniu podatku Belki.
// Liczymy tylko do końca ostatniego pełnego miesiąca – bieżące odsetki bank dopisze później.
// =====================================================================

const DZIEN_MS = 86400000;
const MAKS_PROGOW_ODSETEK = 3;
const MAKS_STOPA_ODSETEK = 20;   // % rocznie – ochrona przed literówką (np. 50 zamiast 5,0)

function dataUTC(iso) {
    const [r, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    return Date.UTC(r, m - 1, d);
}

function isoZDaty(ms) {
    return new Date(ms).toISOString().slice(0, 10);
}

// Ostatni dzień poprzedniego miesiąca: '2026-10-31' dla 8 listopada 2026
function koniecOstatniegoPelnegoMiesiaca(dzis = new Date()) {
    return isoZDaty(Date.UTC(dzis.getFullYear(), dzis.getMonth(), 1) - DZIEN_MS);
}

// Najwcześniejsza data transakcji = początek historii, od którego liczymy saldo początkowe
function poczatekHistorii() {
    let min = '';
    for (const t of stan.transakcje) if (!min || t.booked_on < min) min = t.booked_on;
    return min;
}

// Jeden poziom oprocentowania celu (stare pola interest_rate / interest_threshold_gr)
// albo wartości domyślne z config.js. Używane, gdy cel nie ma progów (interest_tiers).
function parametryOdsetek(cel) {
    const stopa = cel.interest_rate == null || cel.interest_rate === '' ? ODSETKI_STOPA_DOMYSLNA : Number(cel.interest_rate);
    const prog = cel.interest_threshold_gr == null ? ODSETKI_PROG_DOMYSLNY_GR : Number(cel.interest_threshold_gr);
    return {
        stopa: Number.isFinite(stopa) && stopa > 0 ? stopa : 0,
        prog: Number.isFinite(prog) && prog > 0 ? prog : 0
    };
}

/**
 * Progi oprocentowania celu: { tryb, progi: [{ od: grosze, stopa: % rocznie }], promocja } (progi rosnąco po „od”).
 *  - tryb 'nadwyzka': każda część salda ma stopę swojego progu (do następnego progu);
 *    poniżej pierwszego progu – 0%. Jeden próg = dawne „X% od nadwyżki ponad Y zł”.
 *  - tryb 'calosc': całe saldo ma stopę najwyższego progu, do którego sięga saldo.
 *  - promocja: null albo { stopa, od: 'RRRR-MM-DD', miesiace, do: 'RRRR-MM-DD' (pierwszy dzień
 *    bez promocji), limit: grosze (0 = bez limitu) } – przez podaną liczbę miesięcy saldo do limitu
 *    ma stopę promocyjną, nadwyżka ponad limit – zwykłą stopę z progów.
 * Źródło: kolumna interest_tiers = { mode: 'marginal' | 'whole', tiers: [{ from_gr, rate }],
 *   promo?: { rate, from, months, max_gr } } (migracja 2026-11h); bez niej – jeden próg z parametryOdsetek().
 */
function progiOdsetek(cel = {}) {
    const zapisane = cel.interest_tiers;
    if (zapisane && Array.isArray(zapisane.tiers)) {
        const progi = zapisane.tiers
            .map(p => ({ od: Math.max(0, Math.round(Number(p && p.from_gr) || 0)), stopa: Number(p && p.rate) }))
            .filter(p => Number.isFinite(p.stopa) && p.stopa >= 0)
            .sort((a, b) => a.od - b.od)
            .slice(0, MAKS_PROGOW_ODSETEK);
        if (progi.length) return { tryb: zapisane.mode === 'whole' ? 'calosc' : 'nadwyzka', progi, promocja: promocjaOdsetek(zapisane.promo) };
    }
    const { stopa, prog } = parametryOdsetek(cel);
    return { tryb: 'nadwyzka', progi: [{ od: prog, stopa }], promocja: null };
}

const MAKS_MIESIECY_PROMOCJI = 36;

// 'RRRR-MM-DD' + n miesięcy; dzień przycięty do długości miesiąca (31 stycznia + 1 = 28/29 lutego)
function dodajMiesiace(iso, n) {
    const [r, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    const ostatni = new Date(Date.UTC(r, m - 1 + n + 1, 0)).getUTCDate();
    return isoZDaty(Date.UTC(r, m - 1 + n, Math.min(d, ostatni)));
}

// Zapis promocji z bazy -> { stopa, od, miesiace, do, limit } albo null (brak / niepoprawna)
function promocjaOdsetek(promo) {
    if (!promo || typeof promo !== 'object') return null;
    const stopa = Number(promo.rate);
    const miesiace = Number(promo.months);
    const od = String(promo.from || '');
    if (!(Number.isFinite(stopa) && stopa >= 0) || !Number.isInteger(miesiace) || miesiace < 1 ||
        miesiace > MAKS_MIESIECY_PROMOCJI || !/^\d{4}-\d{2}-\d{2}$/.test(od)) return null;
    const limit = Math.max(0, Math.round(Number(promo.max_gr) || 0));
    return { stopa, od, miesiace, do: dodajMiesiace(od, miesiace), limit };
}

// Promocja obowiązująca w danym dniu (null = zwykłe progi)
function promocjaWDniu(oprocentowanie, iso) {
    const p = oprocentowanie && oprocentowanie.promocja;
    return p && iso && iso >= p.od && iso < p.do ? p : null;
}

function czyOprocentowany(oprocentowanie) {
    return !!oprocentowanie && (oprocentowanie.progi.some(p => p.stopa > 0) ||
        !!(oprocentowanie.promocja && oprocentowanie.promocja.stopa > 0));
}

// Stopa najwyższego progu, do którego sięga saldo (tryb „całe saldo”)
function stopaProgu(saldo, progi) {
    let stopa = 0;
    for (const p of progi) if (saldo >= p.od) stopa = p.stopa;
    return stopa;
}

// Odsetki brutto za rok według samych progów (bez promocji)
function odsetkiZProgow(saldo, { tryb, progi }) {
    if (!(saldo > 0)) return 0;
    if (tryb === 'calosc') return saldo * stopaProgu(saldo, progi) / 100;
    let suma = 0;
    progi.forEach((p, i) => {
        const gora = i + 1 < progi.length ? progi[i + 1].od : Infinity;
        const czesc = Math.min(saldo, gora) - p.od;
        if (czesc > 0) suma += czesc * p.stopa / 100;
    });
    return suma;
}

// Odsetki brutto za cały rok od stałego salda (grosze, z ułamkami) – czysta funkcja.
// iso: dzień, dla którego liczymy – w okresie promocji saldo do limitu ma stopę promocyjną,
// a nadwyżka ponad limit zwykłą (w trybie „nadwyżka” – stopy progów powyżej limitu).
function odsetkiRoczneOdSalda(saldo, oprocentowanie, iso = null) {
    if (!(saldo > 0)) return 0;
    const promocja = promocjaWDniu(oprocentowanie, iso);
    if (!promocja) return odsetkiZProgow(saldo, oprocentowanie);
    const wPromocji = promocja.limit > 0 ? Math.min(saldo, promocja.limit) : saldo;
    const reszta = saldo - wPromocji;
    let zwykle = 0;
    if (reszta > 0) {
        zwykle = oprocentowanie.tryb === 'calosc'
            ? reszta * stopaProgu(saldo, oprocentowanie.progi) / 100
            : odsetkiZProgow(saldo, oprocentowanie) - odsetkiZProgow(wPromocji, oprocentowanie);
    }
    return wPromocji * promocja.stopa / 100 + zwykle;
}

// Oprocentowanie efektywne (% rocznie, przed podatkiem) przy danym saldzie (w dniu iso)
function stopaEfektywna(saldo, oprocentowanie, iso = null) {
    return saldo > 0 ? (odsetkiRoczneOdSalda(saldo, oprocentowanie, iso) / saldo) * 100 : 0;
}

/**
 * Czysta funkcja: odsetki subkonta w okresie [od, doDnia].
 * operacje: [{ data: 'RRRR-MM-DD', kwota: grosze ze znakiem (+ wpłata, − wypłata) }]
 * oprocentowanie: wynik progiOdsetek(); bez niego – jeden próg z { stopa, prog } (dawny zapis).
 * Zwraca { brutto, podatek, netto, kapitalizacje: [{ data, brutto, podatek, netto }] }.
 */
function odsetkiSubkonta({ saldoPoczatkowe = 0, operacje = [], od, doDnia, stopa = 0, prog = 0, oprocentowanie = null }) {
    const wynik = { brutto: 0, podatek: 0, netto: 0, kapitalizacje: [] };
    const opr = oprocentowanie || { tryb: 'nadwyzka', progi: [{ od: Math.max(0, prog || 0), stopa }], promocja: null };
    if (!czyOprocentowany(opr) || !od || !doDnia || od > doDnia) return wynik;

    const zmiany = {};
    let saldo = saldoPoczatkowe;
    for (const o of operacje) {
        if (o.data < od) saldo += o.kwota;
        else zmiany[o.data] = (zmiany[o.data] || 0) + o.kwota;
    }

    const koniec = dataUTC(doDnia);
    let narosle = 0; // odsetki brutto od ostatniej kapitalizacji (ułamki groszy)

    for (let t = dataUTC(od); t <= koniec; t += DZIEN_MS) {
        const iso = isoZDaty(t);
        if (zmiany[iso]) saldo += zmiany[iso];
        narosle += odsetkiRoczneOdSalda(saldo, opr, iso) / DNI_W_ROKU_ODSETKI;

        const jutro = new Date(t + DZIEN_MS);
        const ostatniDzienMiesiaca = jutro.getUTCDate() === 1;
        const miesiacKapitalizacji = (new Date(t).getUTCMonth() + 1) % MIESIECY_MIEDZY_KAPITALIZACJAMI === 0;
        if (ostatniDzienMiesiaca && miesiacKapitalizacji) {
            const brutto = Math.round(narosle);
            narosle = 0;
            if (brutto > 0) {
                const podatek = Math.round(brutto * PODATEK_BELKI);
                const netto = brutto - podatek;
                saldo += netto; // kapitalizacja: odsetki pracują dalej
                wynik.brutto += brutto;
                wynik.podatek += podatek;
                wynik.netto += netto;
                wynik.kapitalizacje.push({ data: iso, brutto, podatek, netto });
            }
        }
    }
    return wynik;
}

// Odsetki jednego celu z jego operacji (z operacjeCelow()).
// Liczymy od początku historii wyciągów albo od pierwszej operacji celu, jeśli była wcześniej
// (cel prowadzony tylko operacjami ręcznymi też dostaje odsetki).
// Zakończony cel nie łapie nowych przelewów, więc odsetki liczymy tylko do jego ostatniej operacji.
function odsetkiCelu(cel, operacje = [], dzis = new Date()) {
    let doDnia = koniecOstatniegoPelnegoMiesiaca(dzis);
    if (cel.archived) {
        const ostatnia = operacje.reduce((m, o) => (o.data > m ? o.data : m), '');
        if (!ostatnia) return odsetkiSubkonta({});
        if (ostatnia < doDnia) doDnia = ostatnia;
    }
    let od = poczatekHistorii();
    for (const o of operacje) if (!od || o.data < od) od = o.data;
    return odsetkiSubkonta({
        saldoPoczatkowe: cel.opening_balance_gr || 0,
        operacje: operacje.map(o => ({ data: o.data, kwota: o.typ === 'wplata' ? o.kwota : -o.kwota })),
        od,
        doDnia,
        oprocentowanie: progiOdsetek(cel)
    });
}

// =====================================================================
// CELE (specyfikacja, punkt 8.1). Przypisanie transakcji do celu robi
// klasyfikuj() w rules.js – tu tylko liczymy na gotowej klasyfikacji.
// =====================================================================

const MAKS_OPERACJI_RECZNYCH = 500;   // na jeden cel (kolumna goals.manual_operations)

// Operacje ręczne celu (kolumna manual_operations, migracja 2026-11h): wpłaty i wypłaty,
// których nie ma w wyciągu z konta głównego, np. subkonto zasilane z innego konta, gotówka.
// Format: [{ id, date: 'RRRR-MM-DD', amount_gr: grosze ze znakiem (+ wpłata, − wypłata), note }].
// Niepoprawne wpisy (np. ręcznie zepsuty plik kopii) pomijamy.
function operacjeReczneCelu(cel) {
    const lista = cel && cel.manual_operations;
    if (!Array.isArray(lista)) return [];
    return lista.filter(o => o && /^\d{4}-\d{2}-\d{2}$/.test(String(o.date || '')) &&
        Number.isInteger(o.amount_gr) && o.amount_gr !== 0);
}

// Najnowszy klucz miesiąca z transakcjami (M); bez danych – bieżący miesiąc
function ostatniMiesiacDanych(dzis = new Date()) {
    let maks = '';
    for (const t of stan.transakcje) {
        const k = t.booked_on.substring(0, 7);
        if (k > maks) maks = k;
    }
    return maks || kluczMiesiaca(dzis.getFullYear(), dzis.getMonth() + 1);
}

// Liczba miesięcy od klucza a do klucza b ("2026-10" -> "2027-06" = 8)
function roznicaMiesiecy(a, b) {
    return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)));
}

// Operacje każdego celu: { [celId]: [{ t, data, typ: 'wplata'|'wyplata', kwota (gr, dodatnia), klucz, reczna }] }
//  - przelewy z wyciągów: t = transakcja, reczna = null
//  - operacje ręczne: t = null, reczna = wpis z manual_operations
function operacjeCelow() {
    const wynik = {};
    stan.cele.forEach(c => { wynik[c.id] = []; });
    for (const t of stan.transakcje) {
        const k = klasyfikuj(t);
        if (!k.cel || !(k.cel.id in wynik) || (k.typ !== 'wplata' && k.typ !== 'wyplata')) continue;
        wynik[k.cel.id].push({ t, data: t.booked_on, typ: k.typ, kwota: Math.abs(t.amount_gr), klucz: t.booked_on.substring(0, 7), reczna: null });
    }
    stan.cele.forEach(c => {
        for (const o of operacjeReczneCelu(c)) wynik[c.id].push(operacjaCeluZRecznej(o));
    });
    return wynik;
}

// Wpis z manual_operations w formacie operacjeCelow()
function operacjaCeluZRecznej(o) {
    return {
        t: null, data: o.date, typ: o.amount_gr > 0 ? 'wplata' : 'wyplata',
        kwota: Math.abs(o.amount_gr), klucz: o.date.slice(0, 7), reczna: o
    };
}

/**
 * Wskaźniki jednego celu wg 8.1. Kwoty w groszach.
 * status: 'osiagniety' | 'zdazysz' | 'za-wolno' | 'bez-terminu' (cel bez terminu w bazie)
 */
function analizaCelu(cel, operacje = [], M = ostatniMiesiacDanych(), odsetki = odsetkiCelu(cel, operacje)) {
    let wplaty = 0, wyplaty = 0, wplaty6 = 0;
    const miesiecznie = {}; // klucz -> { wplaty, wyplaty }
    const poczatekOkna = przesunKlucz(M, -5);

    for (const op of operacje) {
        const m = (miesiecznie[op.klucz] = miesiecznie[op.klucz] || { wplaty: 0, wyplaty: 0 });
        if (op.typ === 'wplata') {
            wplaty += op.kwota;
            m.wplaty += op.kwota;
            if (op.klucz >= poczatekOkna && op.klucz <= M) wplaty6 += op.kwota;
        } else {
            wyplaty += op.kwota;
            m.wyplaty += op.kwota;
        }
    }

    const cel_gr = cel.target_gr || 0;
    const saldo = (cel.opening_balance_gr || 0) + wplaty - wyplaty + odsetki.netto;
    const postep = cel_gr > 0 ? Math.min(1, Math.max(0, saldo / cel_gr)) : 0;
    const brakuje = Math.max(0, cel_gr - saldo);
    const srednia = wplaty6 / 6; // miesiąc bez wpłaty liczy się jako 0

    const terminKlucz = cel.deadline ? String(cel.deadline).slice(0, 7) : null;
    const miesiecyDoTerminu = terminKlucz ? Math.max(1, roznicaMiesiecy(M, terminKlucz)) : null;
    const potrzebna = miesiecyDoTerminu ? brakuje / miesiecyDoTerminu : null;

    let status;
    if (brakuje === 0) status = 'osiagniety';
    else if (potrzebna == null) status = 'bez-terminu';
    else status = srednia >= potrzebna ? 'zdazysz' : 'za-wolno';

    const szacowanyKlucz = brakuje > 0 && srednia > 0 ? przesunKlucz(M, Math.ceil(brakuje / srednia)) : null;

    return {
        M, saldo, postep, brakuje, srednia, wplaty, wyplaty, odsetki,
        terminKlucz, miesiecyDoTerminu, potrzebna, status, szacowanyKlucz, miesiecznie
    };
}

// =====================================================================
// PROGNOZA LIMITU KATEGORII (Pulpit, bieżący miesiąc)
// Tempo liniowe: wydane do dziś ÷ dzień miesiąca × liczba dni miesiąca.
// Za wcześnie w miesiącu (pierwsze dni) jedna większa płatność zawyżałaby wynik – wtedy null.
// Ostatni dzień: prognoza = to, co już wydane – też null (wystarczy zwykły pasek limitu).
// =====================================================================

const MIN_DNI_PROGNOZY = 5;

function dniWMiesiacu(rok, miesiac) {
    return new Date(Date.UTC(rok, miesiac, 0)).getUTCDate(); // miesiac 1–12
}

function prognozaKoncaMiesiaca(wydane, dzien, dniMiesiaca) {
    if (!(wydane > 0) || dzien < MIN_DNI_PROGNOZY || dzien >= dniMiesiaca) return null;
    return Math.round((wydane / dzien) * dniMiesiaca);
}

// { prognoza, ponad } gdy w tym tempie limit zostanie przekroczony do końca miesiąca, inaczej null.
// Gdy limit jest już przekroczony, prognozy nie pokazujemy – mówi o tym pasek limitu.
function ostrzezenieLimitu(wydane, limit, dzien, dniMiesiaca) {
    if (!(limit > 0) || wydane >= limit) return null;
    const prognoza = prognozaKoncaMiesiaca(wydane, dzien, dniMiesiaca);
    return prognoza != null && prognoza > limit ? { prognoza, ponad: prognoza - limit } : null;
}

// Grosze zaokrąglone w górę do pełnych 10 zł (zalecenie w 8.3)
function wGoreDo10zl(grosze) {
    return Math.ceil(Math.max(0, grosze) / 1000) * 1000;
}

// =====================================================================
// STATYSTYKI (specyfikacja, rozdział 9)
// Najpierw tablica wierszy miesięcznych, z niej liczymy wszystko inne.
// =====================================================================

const MIESIACE_KROTKIE = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];
const MIESIACE_PELNE = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
const MIESIACE_DOPELNIACZ = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const MIESIACE_MIEJSCOWNIK = ['styczniu', 'lutym', 'marcu', 'kwietniu', 'maju', 'czerwcu', 'lipcu', 'sierpniu', 'wrześniu', 'październiku', 'listopadzie', 'grudniu'];

// Klucz miesiąca w formacie aplikacji: "RRRR-MM"
function kluczMiesiaca(rok, miesiac) {
    return `${rok}-${String(miesiac).padStart(2, '0')}`;
}

function przesunKlucz(klucz, oIle) {
    const m = Number(klucz.slice(5, 7)) - 1 + oIle;
    const rok = Number(klucz.slice(0, 4)) + Math.floor(m / 12);
    return kluczMiesiaca(rok, ((m % 12) + 12) % 12 + 1);
}

function grupujPoMiesiacach(lista) {
    const grupy = {};
    for (const t of lista) {
        const k = t.booked_on.substring(0, 7);
        (grupy[k] = grupy[k] || []).push(t);
    }
    return grupy;
}

// Wiersz miesięczny: etykieta, klucz, przychody, wydatki, wpłaty, wypłaty,
// odłożone netto, stopa oszczędności (%), wydatki wg kategorii, wypłaty wg celu.
function wierszMiesiaca(klucz, lista = []) {
    const s = podsumuj(lista);
    const wyplatyCele = {}; // nazwa celu ('' = nieprzypisana) -> grosze
    for (const t of lista) {
        const k = klasyfikuj(t);
        if (k.typ !== 'wyplata') continue;
        const nazwa = k.cel ? k.cel.name : '';
        wyplatyCele[nazwa] = (wyplatyCele[nazwa] || 0) + Math.abs(t.amount_gr);
    }
    const miesiac = Number(klucz.slice(5, 7));
    return {
        klucz,
        rok: Number(klucz.slice(0, 4)),
        miesiac,
        etykieta: MIESIACE_KROTKIE[miesiac - 1],
        przychody: s.przychody,
        wydatki: s.wydatki,
        wplaty: s.wplaty,
        wyplaty: s.wyplaty,
        netto: s.netto,
        stopa: s.przychody > 0 ? (s.netto / s.przychody) * 100 : null,
        kategorie: s.kategorie,
        wyplatyCele
    };
}

// Wiersze dla kolejnych miesięcy (włącznie), także tych bez transakcji
function wierszeZakresu(grupy, odKlucza, doKlucza) {
    const wiersze = [];
    for (let k = odKlucza; k <= doKlucza; k = przesunKlucz(k, 1)) {
        wiersze.push(wierszMiesiaca(k, grupy[k]));
    }
    return wiersze;
}

// Dane ekranu Statystyki: bieżący rok od stycznia do ostatniego miesiąca z danymi.
// Gdy w bieżącym roku nie ma jeszcze danych, bierzemy ostatni rok z danymi.
// Poprzedni rok: od pierwszego do ostatniego miesiąca z danymi (do porównania lat).
function daneStatystyk(dzis = new Date()) {
    const grupy = grupujPoMiesiacach(stan.transakcje);
    const klucze = Object.keys(grupy).sort();
    if (klucze.length === 0) return null;

    let rok = dzis.getFullYear();
    if (!klucze.some(k => k.startsWith(`${rok}-`))) rok = Number(klucze[klucze.length - 1].slice(0, 4));

    const kluczeRoku = klucze.filter(k => k.startsWith(`${rok}-`));
    const kluczePop = klucze.filter(k => k.startsWith(`${rok - 1}-`));

    return {
        rok,
        grupy,
        pierwszyKlucz: klucze[0],
        biezacyKlucz: kluczMiesiaca(dzis.getFullYear(), dzis.getMonth() + 1),
        miesiaceZDanymi: kluczeRoku.length,
        wiersze: wierszeZakresu(grupy, `${rok}-01`, kluczeRoku[kluczeRoku.length - 1]),
        wierszePop: kluczePop.length
            ? wierszeZakresu(grupy, kluczePop[0], kluczePop[kluczePop.length - 1])
            : []
    };
}

function sumaPola(wiersze, pole) {
    return wiersze.reduce((suma, w) => suma + w[pole], 0);
}

// Grupa koloru kategorii wg specyfikacji (10.4); nieznane -> Inne.
// Mapa GRUPA_KATEGORII i kolory KOLORY_GRUP są w config.js, kolorKategorii() w utils.js.
function grupaKategorii(nazwa) {
    return GRUPA_KATEGORII[nazwa] || 'Inne';
}

function kolorGrupy(grupa) {
    return KOLORY_GRUP[grupa] || KOLORY_GRUP.Inne;
}
