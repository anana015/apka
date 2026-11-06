// =====================================================================
// BAZA DANYCH (Supabase)
// =====================================================================

let supabaseClient;
try {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (err) {
    console.error('Błąd inicjalizacji Supabase:', err);
}

async function pobierzDane() {
    document.getElementById('status-polaczenia').innerText = 'Pobieranie...';

    const resTrans = await supabaseClient.from('transakcje').select('*').order('booked_on', { ascending: false });
    if (resTrans.error) {
        document.getElementById('status-polaczenia').innerText = 'Błąd pobierania danych';
        return;
    }
    stan.transakcje = resTrans.data || [];

    const resRules = await supabaseClient.from('rules').select('*');
    // Najnowsza reguła pierwsza: przy kilku trafieniach wygrywa ta dodana najpóźniej
    dynamiczneReguly = (resRules.data || []).slice().sort((a, b) =>
        String(b.created_at || '').localeCompare(String(a.created_at || ''))
    );

    const resGoals = await supabaseClient.from('goals').select('*');
    stan.cele = resGoals.data || [];

    document.getElementById('status-polaczenia').innerText = 'Połączono (Wspólny budżet)';

    przeliczMiesiace();
    odswiezInterfejs();
}
