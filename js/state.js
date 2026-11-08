// =====================================================================
// STAN APLIKACJI
// =====================================================================

let stan = {
    zakladka: 'pulpit',
    poprzedniaZakladka: 'pulpit', // skąd otwarto Ustawienia
    filtrTransakcji: 'wszystkie', // 'wszystkie' | 'brak' (do przypisania) | 'przypisane'
    miesiacTransakcji: null,      // 'RRRR-MM' albo null = wszystkie miesiące
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
