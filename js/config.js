// =====================================================================
// KONFIGURACJA
// =====================================================================

const SUPABASE_URL = 'https://ggtvsotksmvepqdtsidb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_UHAZejqBYpSmUwbuCOb3hA_JfbUuZpB'; // klucz publiczny (anon)

// Wspólne subkonto, z którego idą wypłaty ze WSZYSTKICH skarbonek na konto główne.
// Każdy wpływ z tego numeru to wypłata z oszczędności (nigdy przychód).
const KONTO_WYPLAT_ZE_SKARBONEK = '79124045461111001148075657';

const POMIN = 'Pomiń';
const PREFIKS_CELU = 'SKARBONKA:';

// Plik z migracją bazy – podawany w komunikatach, gdy brakuje tabeli lub kolumny
// (najnowszy skrypt; wymaga wcześniejszych: migracja_2026-11.sql, 2026-11b_budzet_osobisty, 2026-11c_kategorie_oszczednosci)
const PLIK_MIGRACJI = 'supabase/migracja_2026-11d_notatki_paragony.sql';

// Kategorie startowe budżetu wspólnego. Przy pierwszym uruchomieniu trafiają do tabeli
// categories, potem użytkownik zmienia je w Ustawieniach. Bez tabeli w bazie aplikacja używa tej listy.
const KATEGORIE_DOMYSLNE = [
    'Czynsz', 'Internet', 'HBO Max/Apple', 'Rata Panda',
    'Zakupy spożywcze', 'Jedzenie na mieście', 'Kosmetyki i chemia domowa',
    'Apteka', 'Wydatki na dom', 'Paliwo', 'Ubezpieczenie auta',
    'Naprawy auta', 'Przegląd techniczny', 'Wymiana opon',
    'Sport', 'Rozrywka (Kino/teatr)', 'Prezenty', 'Wakacje',
    'Poduszka finansowa', 'Akcje/Obligacje', 'Nieplanowane'
];

// Przelew z konta osobistego na konto wspólne (dokładka do wspólnego budżetu)
const KATEGORIA_PRZELEW_WSPOLNE = 'Przelew na wspólne';

// Krótsza lista startowa budżetu osobistego
const KATEGORIE_OSOBISTE_DOMYSLNE = [
    KATEGORIA_PRZELEW_WSPOLNE, 'Jedzenie na mieście', 'Zakupy spożywcze', 'Ubrania',
    'Kosmetyki', 'Zdrowie', 'Sport', 'Rozrywka', 'Subskrypcje', 'Transport',
    'Prezenty', 'Hobby', 'Nieplanowane'
];

// Kolory kategorii wg specyfikacji (pkt 10.4)
const KOLORY_GRUP = {
    Jedzenie: '#D08A2C', Mieszkanie: '#6B5BB5', Transport: '#3D8BBF', Rachunki: '#8A8F3A',
    Rozrywka: '#C2508A', Zdrowie: '#2A9D8F', Zakupy: '#A0643C', Inne: '#7D8784'
};

// Przypisanie kategorii startowych do grup kolorów ze specyfikacji.
// Używane też w „Strukturze wydatków” (Statystyki); nowe kategorie trafiają do grupy „Inne”.
const GRUPA_KATEGORII = {
    'Czynsz': 'Mieszkanie', 'Wydatki na dom': 'Mieszkanie',
    'Internet': 'Rachunki', 'HBO Max/Apple': 'Rachunki', 'Rata Panda': 'Rachunki',
    'Zakupy spożywcze': 'Jedzenie', 'Jedzenie na mieście': 'Jedzenie',
    'Kosmetyki i chemia domowa': 'Zakupy', 'Prezenty': 'Zakupy',
    'Apteka': 'Zdrowie', 'Sport': 'Zdrowie',
    'Paliwo': 'Transport', 'Ubezpieczenie auta': 'Transport', 'Naprawy auta': 'Transport',
    'Przegląd techniczny': 'Transport', 'Wymiana opon': 'Transport',
    'Rozrywka (Kino/teatr)': 'Rozrywka', 'Wakacje': 'Rozrywka',
    'Poduszka finansowa': 'Inne', 'Akcje/Obligacje': 'Inne', 'Nieplanowane': 'Inne',
    // budżet osobisty
    [KATEGORIA_PRZELEW_WSPOLNE]: 'Mieszkanie', 'Ubrania': 'Zakupy', 'Kosmetyki': 'Zakupy',
    'Zdrowie': 'Zdrowie', 'Rozrywka': 'Rozrywka', 'Hobby': 'Rozrywka',
    'Subskrypcje': 'Rachunki', 'Transport': 'Transport'
};

// Kategorie stałe na start (pole is_fixed w tabeli categories)
const KATEGORIE_STALE = ['Czynsz', 'Internet', 'HBO Max/Apple', 'Rata Panda', 'Ubezpieczenie auta',
    KATEGORIA_PRZELEW_WSPOLNE, 'Subskrypcje'];

// Kategorie oszczędnościowe na start (pole is_saving): wydatek w nich liczy się jako
// oszczędność (licznik „Odłożone”, stopa oszczędności), a nie jako wydatek
const KATEGORIE_OSZCZEDNOSCIOWE = ['Akcje/Obligacje'];

// Docelowa stopa oszczędności w % (pkt 9.1); użytkownik zmienia ją w Ustawieniach
const DOCELOWA_STOPA_DOMYSLNA = 15;

// ---- Oprocentowanie subkont celów -----------------------------------
// Wartości domyślne dla celów, które nie mają własnych ustawień (pola interest_rate,
// interest_threshold_gr w tabeli goals). Odsetki są szacowane: bank dopisuje je na
// subkoncie, więc nie widać ich w wyciągu z konta głównego.
const ODSETKI_STOPA_DOMYSLNA = 0.5;          // % w skali roku
const ODSETKI_PROG_DOMYSLNY_GR = 100000;     // 1000 zł – odsetki tylko od nadwyżki ponad próg
const PODATEK_BELKI = 0.19;                  // podatek od zysków kapitałowych
const MIESIECY_MIEDZY_KAPITALIZACJAMI = 1;   // 1 = co miesiąc, 3 = co kwartał, 12 = raz w roku
const DNI_W_ROKU_ODSETKI = 365;

// Lista nazw startowych dla budżetu ('wspolny' | 'osobisty')
function nazwyKategoriiDomyslnych(budzet = 'wspolny') {
    return budzet === 'osobisty' ? KATEGORIE_OSOBISTE_DOMYSLNE : KATEGORIE_DOMYSLNE;
}

// Wiersz tabeli categories dla nazwy: kolor z grupy, „stała” wg listy, podana kolejność
function wierszKategorii(name, sort_order) {
    return {
        name,
        color: KOLORY_GRUP[GRUPA_KATEGORII[name]] || KOLORY_GRUP.Inne,
        monthly_limit_gr: null,
        is_fixed: KATEGORIE_STALE.includes(name),
        // is_saving tylko gdy true – przed migracją 2026-11c kolumny nie ma i zwykłe kategorie
        // muszą dać się zapisać
        ...(KATEGORIE_OSZCZEDNOSCIOWE.includes(name) ? { is_saving: true } : {}),
        sort_order
    };
}

// Kategorie startowe jako wiersze tabeli categories
function kategorieDomyslne(budzet = 'wspolny') {
    return nazwyKategoriiDomyslnych(budzet).map((name, i) => wierszKategorii(name, (i + 1) * 10));
}
