// =====================================================================
// STAN APLIKACJI
// =====================================================================

const BUDZETY = {
    wspolny: { nazwa: 'Budżet wspólny', krotko: 'Wspólny' },
    osobisty: { nazwa: 'Budżet osobisty', krotko: 'Osobisty' }
};

let stan = {
    // Który budżet jest otwarty: 'wspolny' (oboje) albo 'osobisty' (tylko zalogowana osoba).
    // Wszystkie dane poniżej (transakcje, cele, kategorie, reguły, importy) dotyczą tego budżetu.
    budzet: 'wspolny',
    uzytkownikId: null,           // auth.uid() zalogowanej osoby
    uzytkownikEmail: '',
    schematBudzetow: null,        // null = nie sprawdzono, false = brak migracji (tylko wspólny), true = OK

    zakladka: 'pulpit',
    poprzedniaZakladka: 'pulpit', // skąd otwarto Ustawienia
    filtrTransakcji: 'wszystkie', // 'wszystkie' | 'brak' (do przypisania) | 'przypisane'
    miesiacTransakcji: null,      // 'RRRR-MM' albo null = wszystkie miesiące
    filtrKategorii: null,         // nazwa kategorii (wejście z Pulpitu) albo null
    zakresTransakcji: null,       // { od, do } – zakres dat z Pulpitu albo null
    podzial: null,                // edytowany podział: { id, czesci: [{ category, kwota }] }
    miesiacWybrany: null,
    trybFiltraPulpit: 'miesiac', // 'miesiac' lub 'zakres'
    pulpitDataOd: '',
    pulpitDataDo: '',
    otwartyCel: null,             // id celu z otwartymi szczegółami (8.3)
    statKategoria: null, // kategoria wybrana w karcie „Trend kategorii”
    transakcje: [],
    cele: [],
    // Kategorie: { id?, name, color, monthly_limit_gr, is_fixed, sort_order }
    kategorie: kategorieDomyslne(),
    kategorieZBazy: false,        // false = brak tabeli categories, używamy listy z config.js
    kategoriaDoUsuniecia: null,   // id kategorii z otwartym potwierdzeniem usunięcia
    importy: null                 // historia importów (null = brak tabeli imports)
};

// Reguły posortowane od najnowszej (najnowsza pasująca wygrywa)
let dynamiczneReguly = [];

function nazwaBudzetu(budzet = stan.budzet) {
    return (BUDZETY[budzet] || BUDZETY.wspolny).nazwa;
}

// Dane i ustawienia widoku, które należą do jednego budżetu – czyszczone przy przełączeniu
// budżetu i wylogowaniu, żeby nic nie „przeciekło” na ekran drugiego budżetu.
function wyczyscDaneBudzetu() {
    Object.assign(stan, {
        transakcje: [],
        cele: [],
        kategorie: kategorieDomyslne(),
        kategorieZBazy: false,
        importy: null,
        filtrTransakcji: 'wszystkie',
        miesiacTransakcji: null,
        filtrKategorii: null,
        zakresTransakcji: null,
        podzial: null,
        miesiacWybrany: null,
        otwartyCel: null,
        statKategoria: null,
        kategoriaDoUsuniecia: null
    });
    dynamiczneReguly = [];
}
