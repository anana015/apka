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

function pokazKomunikat(tresc) {
    const toast = document.getElementById('toast-powiadomienie');
    toast.innerText = tresc;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2600);
}

function zmienZakladke(nazwa) {
    stan.zakladka = nazwa;
    document.querySelectorAll('main > section').forEach(sec => sec.classList.add('hidden'));
    document.getElementById(`tab-${nazwa}`).classList.remove('hidden');

    document.querySelectorAll('.nav-btn').forEach(btn => {
        const aktywna = btn.dataset.tab === nazwa;
        btn.classList.toggle('text-[var(--accent)]', aktywna);
        btn.classList.toggle('text-[var(--muted)]', !aktywna);
    });

    const tytuly = { pulpit: 'Pulpit', transakcje: 'Transakcje', import: 'Import CSV', cele: 'Cele oszczędnościowe', statystyki: 'Statystyki' };
    document.getElementById('app-title').innerText = tytuly[nazwa] || 'Budżet';

    odswiezAktywnyEkran();
}

function odswiezAktywnyEkran() {
    if (stan.zakladka === 'pulpit') odswiezPulpit();
    if (stan.zakladka === 'transakcje') odswiezTransakcje();
    if (stan.zakladka === 'cele') odswiezCele();
    if (stan.zakladka === 'statystyki') odswiezStatystyki();
}

function odswiezInterfejs() {
    const bezKat = liczBezKategorii();
    const badge = document.getElementById('badge-transakcje');
    if (bezKat > 0) {
        badge.innerText = bezKat;
        badge.classList.remove('hidden');
    } else badge.classList.add('hidden');

    odswiezAktywnyEkran();
}

// ---- Start ----
try {
    lucide.createIcons();
} catch (e) {}

window.onload = function() {
    sprawdzSesje();
};
