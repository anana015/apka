// =====================================================================
// OBLICZENIA (sumy w groszach). Funkcje nie dotykają interfejsu ani bazy.
// =====================================================================

// "Do przypisania": wydatek bez kategorii albo wypłata ze skarbonek bez celu
function czyBezKategorii(t) {
    const k = klasyfikuj(t);
    return (k.typ === 'wydatek' && !k.kategoria) || (k.typ === 'wyplata' && !k.cel);
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
