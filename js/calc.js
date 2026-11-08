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
// s.inwestycje = ta część wpłat (do podpisów), s.kategorieOszczednosci = rozbicie wg kategorii.
function podsumuj(lista) {
    const s = { przychody: 0, wydatki: 0, wplaty: 0, wyplaty: 0, inwestycje: 0, kategorie: {}, kategorieOszczednosci: {} };
    for (const t of lista) {
        const k = klasyfikuj(t);
        const kwota = Math.abs(t.amount_gr);
        if (k.typ === 'przychod') {
            s.przychody += kwota;
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

// Saldo każdego celu: saldo początkowe + wpłaty − wypłaty (wszystkie transakcje)
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

// =====================================================================
// ODSETKI NA SUBKONTACH (szacunek)
// Odsetki naliczane dziennie od salda na koniec dnia ponad próg (np. 1000 zł),
// dopisywane w ostatnim dniu miesiąca kapitalizacji po potrąceniu podatku Belki.
// Liczymy tylko do końca ostatniego pełnego miesiąca – bieżące odsetki bank dopisze później.
// =====================================================================

const DZIEN_MS = 86400000;

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

// Oprocentowanie celu: własne ustawienia albo domyślne z config.js
function parametryOdsetek(cel) {
    const stopa = cel.interest_rate == null || cel.interest_rate === '' ? ODSETKI_STOPA_DOMYSLNA : Number(cel.interest_rate);
    const prog = cel.interest_threshold_gr == null ? ODSETKI_PROG_DOMYSLNY_GR : Number(cel.interest_threshold_gr);
    return {
        stopa: Number.isFinite(stopa) && stopa > 0 ? stopa : 0,
        prog: Number.isFinite(prog) && prog > 0 ? prog : 0
    };
}

/**
 * Czysta funkcja: odsetki subkonta w okresie [od, doDnia].
 * operacje: [{ data: 'RRRR-MM-DD', kwota: grosze ze znakiem (+ wpłata, − wypłata) }]
 * Zwraca { brutto, podatek, netto, kapitalizacje: [{ data, brutto, podatek, netto }] }.
 */
function odsetkiSubkonta({ saldoPoczatkowe = 0, operacje = [], od, doDnia, stopa, prog = 0 }) {
    const wynik = { brutto: 0, podatek: 0, netto: 0, kapitalizacje: [] };
    if (!(stopa > 0) || !od || !doDnia || od > doDnia) return wynik;

    const zmiany = {};
    let saldo = saldoPoczatkowe;
    for (const o of operacje) {
        if (o.data < od) saldo += o.kwota;
        else zmiany[o.data] = (zmiany[o.data] || 0) + o.kwota;
    }

    const dzienna = stopa / 100 / DNI_W_ROKU_ODSETKI;
    const koniec = dataUTC(doDnia);
    let narosle = 0; // odsetki brutto od ostatniej kapitalizacji (ułamki groszy)

    for (let t = dataUTC(od); t <= koniec; t += DZIEN_MS) {
        const iso = isoZDaty(t);
        if (zmiany[iso]) saldo += zmiany[iso];
        narosle += Math.max(0, saldo - prog) * dzienna;

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
// Zakończony cel nie łapie nowych przelewów, więc odsetki liczymy tylko do jego ostatniej operacji.
function odsetkiCelu(cel, operacje = [], dzis = new Date()) {
    const { stopa, prog } = parametryOdsetek(cel);
    let doDnia = koniecOstatniegoPelnegoMiesiaca(dzis);
    if (cel.archived) {
        const ostatnia = operacje.reduce((m, o) => (o.t.booked_on > m ? o.t.booked_on : m), '');
        if (!ostatnia) return odsetkiSubkonta({});
        if (ostatnia < doDnia) doDnia = ostatnia;
    }
    return odsetkiSubkonta({
        saldoPoczatkowe: cel.opening_balance_gr || 0,
        operacje: operacje.map(o => ({ data: o.t.booked_on, kwota: o.typ === 'wplata' ? o.kwota : -o.kwota })),
        od: poczatekHistorii(),
        doDnia,
        stopa,
        prog
    });
}

// =====================================================================
// CELE (specyfikacja, punkt 8.1). Przypisanie transakcji do celu robi
// klasyfikuj() w rules.js – tu tylko liczymy na gotowej klasyfikacji.
// =====================================================================

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

// Operacje każdego celu: { [celId]: [{ t, typ: 'wplata'|'wyplata', kwota (gr, dodatnia), klucz }] }
function operacjeCelow() {
    const wynik = {};
    stan.cele.forEach(c => { wynik[c.id] = []; });
    for (const t of stan.transakcje) {
        const k = klasyfikuj(t);
        if (!k.cel || !(k.cel.id in wynik) || (k.typ !== 'wplata' && k.typ !== 'wyplata')) continue;
        wynik[k.cel.id].push({ t, typ: k.typ, kwota: Math.abs(t.amount_gr), klucz: t.booked_on.substring(0, 7) });
    }
    return wynik;
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
