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

async function pobierzDane() {
    document.getElementById('status-polaczenia').innerText = 'Pobieranie...';

    const resTrans = await pobierzWszystkie('transakcje', 'booked_on', false);
    if (resTrans.error) {
        document.getElementById('status-polaczenia').innerText = 'Błąd pobierania danych';
        return;
    }
    stan.transakcje = resTrans.data || [];

    const resRules = await pobierzWszystkie('rules');
    // Najnowsza reguła pierwsza: przy kilku trafieniach wygrywa ta dodana najpóźniej
    dynamiczneReguly = (resRules.data || []).slice().sort((a, b) =>
        String(b.created_at || '').localeCompare(String(a.created_at || ''))
    );

    const resGoals = await pobierzWszystkie('goals');
    stan.cele = resGoals.data || [];

    document.getElementById('status-polaczenia').innerText = 'Połączono (Wspólny budżet)';

    przeliczMiesiace();
    odswiezInterfejs();
}
