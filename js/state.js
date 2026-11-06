// =====================================================================
// STAN APLIKACJI
// =====================================================================

let stan = {
    zakladka: 'pulpit',
    poprzedniaZakladka: 'pulpit', // skąd otwarto Ustawienia
    filtrTransakcji: 'wszystkie', // 'wszystkie' | 'brak' (do przypisania) | 'przypisane'
    miesiacTransakcji: null,      // 'RRRR-MM' albo null = wszystkie miesiące
    miesiacWybrany: null,
    trybFiltraPulpit: 'miesiac', // 'miesiac' lub 'zakres'
    pulpitDataOd: '',
    pulpitDataDo: '',
    otwartyCel: null,             // id celu z otwartymi szczegółami (8.3)
    statKategoria: null, // kategoria wybrana w karcie „Trend kategorii”
    transakcje: [],
    cele: [],
    kategorie: KATEGORIE_DOMYSLNE.map(name => ({ name }))
};

// Reguły posortowane od najnowszej (najnowsza pasująca wygrywa)
let dynamiczneReguly = [];

let przygotowaneTransakcjeCSV = [];
