// =====================================================================
// START APLIKACJI, LOGOWANIE, NAWIGACJA
// (ładowany jako ostatni – korzysta ze wszystkich pozostałych plików)
// =====================================================================

async function sprawdzSesje() {
    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        if (error) throw error;
        if (session) pokazAplikacje();
        else pokazEkranLogowania();
    } catch (err) {
        pokazEkranLogowania();
    }
}

async function obsluzLogowanie(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorBox = document.getElementById('login-error');
    const btn = document.getElementById('btn-login');

    btn.innerText = 'Logowanie...';
    btn.disabled = true;
    errorBox.classList.add('hidden');

    try {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) {
            errorBox.innerText = 'Błędny e-mail lub hasło!';
            errorBox.classList.remove('hidden');
        } else {
            pokazAplikacje();
        }
    } catch (err) {
        errorBox.innerText = 'Wystąpił błąd sieci lub autoryzacji.';
        errorBox.classList.remove('hidden');
    }
    btn.innerText = 'Zaloguj się';
    btn.disabled = false;
}

async function wyloguj() {
    await supabaseClient.auth.signOut();
    pokazEkranLogowania();
}

function pokazAplikacje() {
    document.getElementById('ekran-logowania').classList.add('hidden');
    document.getElementById('glowna-aplikacja').classList.remove('hidden');
    pobierzDane();
}

function pokazEkranLogowania() {
    document.getElementById('glowna-aplikacja').classList.add('hidden');
    document.getElementById('ekran-logowania').classList.remove('hidden');
}

// Komunikat nad paskiem zakładek, znika po 2,6 s (10.2)
let toastTimer = null;
function pokazKomunikat(tresc) {
    const toast = document.getElementById('toast-powiadomienie');
    toast.innerText = tresc;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 2600);
}

const TYTULY_ZAKLADEK = {
    pulpit: 'Pulpit', transakcje: 'Transakcje', import: 'Import CSV',
    cele: 'Cele oszczędnościowe', statystyki: 'Statystyki', ustawienia: 'Ustawienia'
};

// Klik w zakładkę: zamyka otwarte szczegóły, czyści filtr i przewija na górę (10.1).
// opcje.filtr pozwala wejść na zakładkę z ustawionym filtrem (np. z alertu na pulpicie).
function zmienZakladke(nazwa, opcje = {}) {
    // Ustawienia nie są zakładką paska – zapamiętujemy, skąd przyszliśmy („‹ Wróć”)
    if (nazwa === 'ustawienia' && stan.zakladka !== 'ustawienia') stan.poprzedniaZakladka = stan.zakladka;
    stan.zakladka = nazwa;
    stan.filtrTransakcji = opcje.filtr || 'wszystkie';
    if (nazwa === 'transakcje') {
        // „Do przypisania” z pulpitu obejmuje wszystkie miesiące (7.1);
        // zwykłe wejście pokazuje ten sam miesiąc, który jest wybrany na Pulpicie.
        stan.miesiacTransakcji = opcje.filtr === 'brak' ? null : (stan.miesiacWybrany || null);
    }
    if (nazwa === 'import') przygotujEkranImportu();
    stan.otwartyCel = null;           // klik w zakładkę zamyka otwarte szczegóły (10.1)
    stan.podzial = null;              // i niezapisany podział transakcji
    stan.kategoriaDoUsuniecia = null; // i niepotwierdzone usunięcie kategorii
    zamknijFormularzCelu();

    document.querySelectorAll('main > section').forEach(sec => sec.classList.add('hidden'));
    document.getElementById(`tab-${nazwa}`).classList.remove('hidden');

    document.querySelectorAll('.nav-btn').forEach(btn => {
        const aktywna = btn.dataset.tab === nazwa;
        btn.classList.toggle('is-active', aktywna);
        if (aktywna) btn.setAttribute('aria-current', 'page');
        else btn.removeAttribute('aria-current');
    });

    const tytul = TYTULY_ZAKLADEK[nazwa] || 'Budżet';
    document.getElementById('app-title').innerText = tytul;
    document.title = `${tytul} · Budżet Domowy`;

    document.getElementById('app-main').scrollTop = 0;
    odswiezAktywnyEkran();
}

const ODSWIEZANIE_EKRANOW = {
    pulpit: () => odswiezPulpit(),
    transakcje: () => odswiezTransakcje(),
    import: () => odswiezImport(),
    cele: () => odswiezCele(),
    statystyki: () => odswiezStatystyki(),
    ustawienia: () => odswiezUstawienia()
};

function odswiezAktywnyEkran() {
    const odswiez = ODSWIEZANIE_EKRANOW[stan.zakladka];
    if (odswiez) odswiez();
}

function odswiezInterfejs() {
    const bezKat = liczBezKategorii();
    const badge = document.getElementById('badge-transakcje');
    badge.innerText = bezKat;
    badge.classList.toggle('hidden', bezKat === 0);

    // Licznik na zakładce „Cele” = liczba celów „Za wolno” (8.2)
    const zaWolno = liczCeleZaWolno();
    const badgeCele = document.getElementById('badge-cele');
    badgeCele.innerText = zaWolno;
    badgeCele.classList.toggle('hidden', zaWolno === 0);

    odswiezAktywnyEkran();
}

// ---- Start ----
try {
    lucide.createIcons();
} catch (e) {}

window.onload = function() {
    sprawdzSesje();
};
