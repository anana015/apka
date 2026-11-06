// =====================================================================
// STAN APLIKACJI
// =====================================================================

let stan = {
    zakladka: 'pulpit',
    filtrTransakcji: 'wszystkie',
    miesiacWybrany: null,
    trybFiltraPulpit: 'miesiac', // 'miesiac' lub 'zakres'
    pulpitDataOd: '',
    pulpitDataDo: '',
    transakcje: [],
    cele: [],
    kategorie: KATEGORIE_DOMYSLNE.map(name => ({ name }))
};

// Reguły posortowane od najnowszej (najnowsza pasująca wygrywa)
let dynamiczneReguly = [];

let chartInstance = null;
let przygotowaneTransakcjeCSV = [];
