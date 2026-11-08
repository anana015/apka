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
const PLIK_MIGRACJI = 'supabase/migracja_2026-11.sql';

// Kategorie startowe. Przy pierwszym uruchomieniu trafiają do tabeli categories,
// potem użytkownik zmienia je w Ustawieniach. Bez tabeli w bazie aplikacja używa tej listy.
const KATEGORIE_DOMYSLNE = [
    'Czynsz', 'Internet', 'HBO Max/Apple', 'Rata Panda',
    'Zakupy spożywcze', 'Jedzenie na mieście', 'Kosmetyki i chemia domowa',
    'Apteka', 'Wydatki na dom', 'Paliwo', 'Ubezpieczenie auta',
    'Naprawy auta', 'Przegląd techniczny', 'Wymiana opon',
    'Sport', 'Rozrywka (Kino/teatr)', 'Prezenty', 'Wakacje',
    'Poduszka finansowa', 'Akcje/Obligacje', 'Nieplanowane'
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
    'Poduszka finansowa': 'Inne', 'Akcje/Obligacje': 'Inne', 'Nieplanowane': 'Inne'
};

// Kategorie stałe na start (pole is_fixed w tabeli categories)
const KATEGORIE_STALE = ['Czynsz', 'Internet', 'HBO Max/Apple', 'Rata Panda', 'Ubezpieczenie auta'];

// Docelowa stopa oszczędności w % (pkt 9.1); użytkownik zmienia ją w Ustawieniach
const DOCELOWA_STOPA_DOMYSLNA = 15;

// Kategorie startowe jako wiersze tabeli categories
function kategorieDomyslne() {
    return KATEGORIE_DOMYSLNE.map((name, i) => ({
        name,
        color: KOLORY_GRUP[GRUPA_KATEGORII[name]] || KOLORY_GRUP.Inne,
        monthly_limit_gr: null,
        is_fixed: KATEGORIE_STALE.includes(name),
        sort_order: (i + 1) * 10
    }));
}
