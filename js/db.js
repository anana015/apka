// =====================================================================
// BAZA DANYCH (Supabase)
// =====================================================================

let supabaseClient;
let zapytanieBezBudzetu; // oryginalne supabaseClient.from – tylko do sprawdzenia schematu
try {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    zapytanieBezBudzetu = supabaseClient.from.bind(supabaseClient);
} catch (err) {
    console.error('Błąd inicjalizacji Supabase:', err);
}

// =====================================================================
// BUDŻET WSPÓLNY / OSOBISTY
// Każdy wiersz tabel budżetu ma owner_id: NULL = budżet wspólny, auth.uid() = osobisty
// (migracja supabase/migracja_2026-11b_budzet_osobisty.sql). Żeby żaden ekran nie musiał
// o tym pamiętać, zawężenie robimy w jednym miejscu: supabaseClient.from(tabela) dla tabel
// budżetu zwraca zapytania ograniczone do otwartego budżetu, a insert/upsert dopisują owner_id.
// RLS w bazie i tak nie pokaże drugiej osobie cudzego budżetu osobistego – to zawężenie
// oddziela budżet wspólny od własnego osobistego na ekranie.
// Przed migracją (brak kolumny owner_id) wszystko działa jak dawniej: tylko budżet wspólny.
// =====================================================================

const TABELE_BUDZETU = ['transakcje', 'rules', 'goals', 'categories', 'imports'];

function wlascicielBudzetu() {
    return stan.budzet === 'osobisty' ? stan.uzytkownikId : null;
}

function zawezDoBudzetu(zapytanie) {
    const wlasciciel = wlascicielBudzetu();
    return wlasciciel ? zapytanie.eq('owner_id', wlasciciel) : zapytanie.is('owner_id', null);
}

function zWlascicielem(wiersze) {
    const wlasciciel = wlascicielBudzetu();
    const dopisz = w => ({ ...w, owner_id: wlasciciel });
    return Array.isArray(wiersze) ? wiersze.map(dopisz) : dopisz(wiersze);
}

if (supabaseClient) {
    supabaseClient.from = function (tabela) {
        const zapytanie = zapytanieBezBudzetu(tabela);
        if (!TABELE_BUDZETU.includes(tabela) || stan.schematBudzetow !== true) return zapytanie;
        return {
            select: (...a) => zawezDoBudzetu(zapytanie.select(...a)),
            insert: (wiersze, opcje) => zapytanie.insert(zWlascicielem(wiersze), opcje),
            upsert: (wiersze, opcje) => zapytanie.upsert(zWlascicielem(wiersze), opcje),
            update: (...a) => zawezDoBudzetu(zapytanie.update(...a)),
            delete: (...a) => zawezDoBudzetu(zapytanie.delete(...a))
        };
    };
}

// Czy baza ma już kolumnę owner_id (migracja budżetu osobistego).
// Błąd sieci zostawia null – wtedy nie pobieramy danych, bo bez zawężenia budżet wspólny
// pokazałby też wiersze z budżetu osobistego.
async function sprawdzSchematBudzetow() {
    const { error } = await zapytanieBezBudzetu('transakcje').select('owner_id').limit(1);
    if (!error) stan.schematBudzetow = true;
    else if (czyBrakSchematu(error)) stan.schematBudzetow = false;
    return stan.schematBudzetow;
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

// Kategorie z tabeli categories (w otwartym budżecie). Pusta lista -> zapis kategorii startowych.
// Brak tabeli -> lista z config.js (aplikacja działa, edycja kategorii niedostępna).
// Zwraca { kategorie, zBazy } – stan ustawia pobierzDane (po sprawdzeniu, że budżet się nie zmienił).
async function pobierzKategorie() {
    let res = await pobierzWszystkie('categories', 'sort_order');
    if (res.error) return { kategorie: kategorieDomyslne(stan.budzet), zBazy: false };
    if (res.data.length === 0) {
        // Po migracji nazwa jest unikalna w obrębie budżetu – zwykły insert; gdy drugie urządzenie
        // zdążyło zapisać kategorie pierwsze, insert się nie uda, a ponowny odczyt je pobierze.
        await (stan.schematBudzetow
            ? supabaseClient.from('categories').insert(kategorieDomyslne(stan.budzet))
            : supabaseClient.from('categories').upsert(kategorieDomyslne(stan.budzet), { onConflict: 'name', ignoreDuplicates: true }));
        res = await pobierzWszystkie('categories', 'sort_order');
    }
    return {
        kategorie: res.data && res.data.length ? res.data : kategorieDomyslne(stan.budzet),
        zBazy: !res.error
    };
}

// Historia importów, najnowsze pierwsze (null = brak tabeli imports)
async function pobierzImporty() {
    const { data, error } = await supabaseClient
        .from('imports')
        .select('*')
        .order('imported_at', { ascending: false })
        .limit(10);
    return error ? null : (data || []);
}

// Numer ostatniego pobrania: odpowiedź spóźniona po przełączeniu budżetu jest pomijana
let numerPobrania = 0;

async function pobierzDane() {
    const status = document.getElementById('status-polaczenia');
    const nr = ++numerPobrania;
    status.innerText = 'Pobieranie...';

    if (stan.schematBudzetow === null && (await sprawdzSchematBudzetow()) === null) {
        if (nr === numerPobrania) status.innerText = 'Błąd połączenia z bazą';
        return;
    }
    if (!stan.schematBudzetow && stan.budzet !== 'wspolny') {
        stan.budzet = 'wspolny'; // budżet osobisty wymaga migracji
        odswiezPrzelacznikBudzetu();
    }

    const resTrans = await pobierzWszystkie('transakcje', 'booked_on', false);
    if (nr !== numerPobrania) return;
    if (resTrans.error) {
        status.innerText = 'Błąd pobierania danych';
        return;
    }

    // Pozostałe tabele są niezależne – pobieramy je równolegle
    const budzet = stan.budzet;
    const [resRules, resGoals, kategorie, importy] = await Promise.all([
        pobierzWszystkie('rules'),
        pobierzWszystkie('goals'),
        pobierzKategorie(),
        pobierzImporty()
    ]);
    if (nr !== numerPobrania || budzet !== stan.budzet) return;

    stan.transakcje = resTrans.data || [];
    // Najnowsza reguła pierwsza: przy kilku trafieniach wygrywa ta dodana najpóźniej
    dynamiczneReguly = (resRules.data || []).slice().sort((a, b) =>
        String(b.created_at || '').localeCompare(String(a.created_at || ''))
    );
    stan.cele = resGoals.data || [];
    stan.kategorie = kategorie.kategorie;
    stan.kategorieZBazy = kategorie.zBazy;
    stan.importy = importy;

    status.innerText = `Połączono · ${nazwaBudzetu()}`;

    przeliczMiesiace();
    odswiezInterfejs();
}
