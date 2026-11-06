// =====================================================================
// OBLICZENIA (sumy w groszach). Funkcje nie dotykają interfejsu ani bazy.
// =====================================================================

// "Do przypisania": wydatek bez kategorii albo wypłata ze skarbonek bez celu.
// Wersja przyjmująca gotową klasyfikację – żeby nie liczyć klasyfikuj() dwa razy.
function czyKlasyfikacjaDoPrzypisania(k) {
    return (k.typ === 'wydatek' && !k.kategoria) || (k.typ === 'wyplata' && !k.cel);
}

function czyBezKategorii(t) {
    return czyKlasyfikacjaDoPrzypisania(klasyfikuj(t));
}

function liczBezKategorii() {
    return stan.transakcje.filter(czyBezKategorii).length;
}

// Sumy dla listy transakcji. Pominięte nie wchodzą do żadnej sumy.
function podsumuj(lista) {
    const s = { przychody: 0, wydatki: 0, wplaty: 0, wyplaty: 0, kategorie: {} };
    for (const t of lista) {
        const k = klasyfikuj(t);
        const kwota = Math.abs(t.amount_gr);
        if (k.typ === 'przychod') {
            s.przychody += kwota;
        } else if (k.typ === 'wydatek') {
            s.wydatki += kwota;
            const nazwa = k.kategoria || 'Nieprzypisane';
            s.kategorie[nazwa] = (s.kategorie[nazwa] || 0) + kwota;
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
function saldaCelow() {
    const salda = {};
    stan.cele.forEach(c => { salda[c.id] = c.opening_balance_gr || 0; });
    stan.transakcje.forEach(t => {
        const k = klasyfikuj(t);
        if (!k.cel || !(k.cel.id in salda)) return;
        if (k.typ === 'wplata') salda[k.cel.id] += Math.abs(t.amount_gr);
        if (k.typ === 'wyplata') salda[k.cel.id] -= Math.abs(t.amount_gr);
    });
    return salda;
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
function analizaCelu(cel, operacje = [], M = ostatniMiesiacDanych()) {
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
    const saldo = (cel.opening_balance_gr || 0) + wplaty - wyplaty;
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
        M, saldo, postep, brakuje, srednia, wplaty, wyplaty,
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
