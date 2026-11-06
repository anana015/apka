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
    statKategoria: null, // kategoria wybrana w karcie „Trend kategorii”
    transakcje: [],
    cele: [],
    kategorie: KATEGORIE_DOMYSLNE.map(name => ({ name }))
};

// Reguły posortowane od najnowszej (najnowsza pasująca wygrywa)
let dynamiczneReguly = [];

let przygotowaneTransakcjeCSV = [];
