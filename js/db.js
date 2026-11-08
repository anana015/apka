// =====================================================================
// BAZA DANYCH (Supabase)
// =====================================================================

let supabaseClient;
try {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (err) {
    console.error('Błąd inicjalizacji Supabase:', err);
}

// Supabase (PostgREST) zwraca najwyżej ~1000 wierszy na zapytanie, więc pobieramy stronami.
// Kończymy dopiero na pustej stronie – działa też, gdy serwer ma niższy limit niż ROZMIAR.
const ROZMIAR_STRONY = 1000;
async function pobierzWszystkie(tabela, kolumnaSortowania = null, rosnaco = true) {
    let wynik = [];
    for (let od = 0; ; ) {
        let zapytanie = supabaseClient.from(tabela).select('*');
        if (kolumnaSortowania) zapytanie = zapytanie.order(kolumnaSortowania, { ascending: rosnaco });
        zapytanie = zapytanie.order('id', { ascending: true }); // stała kolejność między stronami
        const { data, error } = await zapytanie.range(od, od + ROZMIAR_STRONY - 1);
        if (error) return { data: null, error };
        if (!data || data.length === 0) break;
        wynik = wynik.concat(data);
        od += data.length;
    }
    return { data: wynik, error: null };
}

// Brak tabeli lub kolumny w bazie (migracja nieuruchomiona)
function czyBrakSchematu(error) {
    if (!error) return false;
    const kod = String(error.code || '');
    return kod === '42P01' || kod === '42703' || kod === 'PGRST204' || kod === 'PGRST205' ||
        /schema cache|does not exist|could not find/i.test(error.message || '');
}

// Czytelny komunikat błędu zapisu; przy braku tabeli/kolumny – wskazówka z migracją
function komunikatBledu(error, poczatek = 'Błąd zapisu') {
    if (czyBrakSchematu(error)) return `${poczatek}: w bazie brakuje tabeli lub kolumny. Uruchom w Supabase skrypt ${PLIK_MIGRACJI}.`;
    return `${poczatek}: ${error && error.message ? error.message : 'nieznany błąd'}`;
}

// Kategorie z tabeli categories. Pusta tabela -> zapis kategorii startowych.
// Brak tabeli -> lista z config.js (aplikacja działa, edycja kategorii niedostępna).
async function pobierzKategorie() {
    let res = await pobierzWszystkie('categories', 'sort_order');
    if (res.error) {
        stan.kategorieZBazy = false;
        stan.kategorie = kategorieDomyslne();
        return;
    }
    if (res.data.length === 0) {
        const { error } = await supabaseClient
            .from('categories')
            .upsert(kategorieDomyslne(), { onConflict: 'name', ignoreDuplicates: true });
        if (!error) res = await pobierzWszystkie('categories', 'sort_order');
    }
    stan.kategorieZBazy = true;
    stan.kategorie = res.data && res.data.length ? res.data : kategorieDomyslne();
}

// Historia importów, najnowsze pierwsze (null = brak tabeli imports)
async function pobierzImporty() {
    const { data, error } = await supabaseClient
        .from('imports')
        .select('*')
        .order('imported_at', { ascending: false })
        .limit(10);
    stan.importy = error ? null : (data || []);
}

async function pobierzDane() {
    document.getElementById('status-polaczenia').innerText = 'Pobieranie...';

    const resTrans = await pobierzWszystkie('transakcje', 'booked_on', false);
    if (resTrans.error) {
        document.getElementById('status-polaczenia').innerText = 'Błąd pobierania danych';
        return;
    }
    stan.transakcje = resTrans.data || [];

    // Pozostałe tabele są niezależne – pobieramy je równolegle
    const [resRules, resGoals] = await Promise.all([
        pobierzWszystkie('rules'),
        pobierzWszystkie('goals'),
        pobierzKategorie(),
        pobierzImporty()
    ]);

    // Najnowsza reguła pierwsza: przy kilku trafieniach wygrywa ta dodana najpóźniej
    dynamiczneReguly = (resRules.data || []).slice().sort((a, b) =>
        String(b.created_at || '').localeCompare(String(a.created_at || ''))
    );
    stan.cele = resGoals.data || [];

    document.getElementById('status-polaczenia').innerText = 'Połączono (Wspólny budżet)';

    przeliczMiesiace();
    odswiezInterfejs();
}
