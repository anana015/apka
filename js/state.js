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
    szczegolyTransakcji: null,    // id transakcji z otwartym panelem „Notatka i paragon”
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
    wyborKategorii: null,         // Set nazw zaznaczonych w „Wybierz kategorie z listy” albo null (zamknięte)
    importy: null,                // historia importów (null = brak tabeli imports)

    // Poziomy Ustawień (ustawienia.js): menu → strona → szczegóły kategorii
    ustawieniaStrona: 'menu',     // 'menu' | 'kategorie' | 'kategoria' | 'reguly' | 'kontoWspolne' | 'dane' | 'preferencje'
    ustawieniaKategoria: null,    // id kategorii otwartej w szczegółach (strona 'kategoria')
    ustawieniaPowrot: null,       // { strona, kategoria } – dokąd cofa „‹” po skrócie (np. z kategorii do jej reguł)
    kolejnoscKategorii: false     // tryb „Zmień kolejność” na liście kategorii
};

// Reguły posortowane od najnowszej (najnowsza pasująca wygrywa)
let dynamiczneReguly = [];

function nazwaBudzetu(budzet = stan.budzet) {
    return (BUDZETY[budzet] || BUDZETY.wspolny).nazwa;
}

// Dane i ustawienia widoku, które należą do jednego budżetu – czyszczone przy przełączeniu
// budżetu i wylogowaniu, żeby nic nie „przeciekło” na ekran drugiego budżetu.
// (Poziom Ustawień zostaje – ustawienia.js cofa go wyżej, gdy strona nie pasuje do nowego budżetu.)
function wyczyscDaneBudzetu() {
    Object.assign(stan, {
        transakcje: [],
        cele: [],
        kategorie: kategorieDomyslne(stan.budzet),
        kategorieZBazy: false,
        importy: null,
        wyborKategorii: null,
        szczegolyTransakcji: null,
        filtrTransakcji: 'wszystkie',
        miesiacTransakcji: null,
        filtrKategorii: null,
        zakresTransakcji: null,
        podzial: null,
        miesiacWybrany: null,
        otwartyCel: null,
        statKategoria: null,
        kategoriaDoUsuniecia: null,
        kolejnoscKategorii: false
    });
    dynamiczneReguly = [];
}
