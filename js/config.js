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
