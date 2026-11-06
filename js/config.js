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

// Przypisanie kategorii aplikacji do grup kolorów ze specyfikacji
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

// Kategorie stałe (co miesiąc podobna kwota). Używane w kafelku
// „Śr. wydatki / mies.” (podpis „w tym stałe”) i pomijane w „Trendzie kategorii” (pkt 9).
const KATEGORIE_STALE = ['Czynsz', 'Internet', 'HBO Max/Apple', 'Rata Panda', 'Ubezpieczenie auta'];

// Docelowa stopa oszczędności w % (pkt 9.1); użytkownik zmienia ją na ekranie Statystyki
const DOCELOWA_STOPA_DOMYSLNA = 15;
