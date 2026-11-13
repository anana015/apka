// =====================================================================
// START APLIKACJI, LOGOWANIE, NAWIGACJA, PRZEŁĄCZANIE BUDŻETU
// (ładowany jako ostatni – korzysta ze wszystkich pozostałych plików)
// =====================================================================

const ODSWIEZ_PO_POWROCIE_MS = 5 * 60 * 1000; // powrót do karty po 5 min = świeże dane (druga osoba mogła coś zmienić)

async function sprawdzSesje() {
    let sesja = null;
    let blad = null;
    try {
        const { data, error } = await supabaseClient.auth.getSession();
        sesja = data && data.session;
        blad = error;
    } catch (err) {
        blad = err;
    }
    // Link „ustaw nowe hasło” z e-maila: sesja jest, ale najpierw formularz nowego hasła
    if (sesja && (LINK_Z_EMAILA.reset || stan.odzyskiwanieHasla)) return pokazNoweHaslo(sesja.user);
    if (sesja) return pokazAplikacje(sesja.user);
    // Bez internetu wygasłej sesji nie da się odświeżyć: otwieramy kopię danych ostatniego
    // konta z tego urządzenia (tylko podgląd). Po powrocie sieci sesja jest sprawdzana od nowa.
    const konto = kontoOffline();
    if (konto && czyBladSieci(blad)) return pokazAplikacje({ id: konto.id, email: konto.email });
    pokazEkranLogowania({ blad: bladLinkuZEmaila() });
}

async function obsluzLogowanie(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('btn-login');

    btn.innerText = 'Logowanie...';
    btn.disabled = true;
    ustawBladLogowania('');
    ustawInfoLogowania('');

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) {
            // Bez rozróżniania „nie ma konta” / „złe hasło” – nie zdradzamy, które adresy mają konto
            ustawBladLogowania(czyLimitProb(error) ? opisBleduAuth(error, 'Nie zalogowano') : 'Błędny e-mail lub hasło!');
        } else {
            document.getElementById('login-password').value = '';
            pokazAplikacje(data.user);
        }
    } catch (err) {
        ustawBladLogowania('Wystąpił błąd sieci lub autoryzacji.');
    }
    btn.innerText = 'Zaloguj się';
    btn.disabled = false;
}

async function wyloguj() {
    try { await supabaseClient.auth.signOut(); } catch (e) {}
    zakonczSesjeLokalnie();
}

// Dane (także osobiste) nie mogą zostać w pamięci ani na urządzeniu dla kolejnej osoby.
// Wywoływane też, gdy sesja skończy się sama (wylogowanie w innej karcie, odebrany dostęp).
function zakonczSesjeLokalnie() {
    stan.uzytkownikId = null;
    stan.uzytkownikEmail = '';
    stan.budzet = 'wspolny';
    stan.dostepWspolny = null;
    stan.odzyskiwanieHasla = false;
    wylaczTrybOffline();
    wyczyscDaneBudzetu();
    imp = nowyStanImportu();
    usunDaneOffline();
    wylaczHistorie();
    pokazEkranLogowania();
}

function pokazAplikacje(uzytkownik) {
    stan.uzytkownikId = uzytkownik ? uzytkownik.id : null;
    stan.uzytkownikEmail = uzytkownik ? uzytkownik.email || '' : '';
    stan.odzyskiwanieHasla = false;
    stan.dostepWspolny = null; // sprawdza pobierzDane – dla tej osoby, nie poprzedniej
    stan.budzet = zapamietanyBudzet();
    if (stan.uzytkownikId) zapamietajKontoOffline(stan.uzytkownikId, stan.uzytkownikEmail);
    odswiezPrzelacznikBudzetu();

    document.getElementById('ekran-logowania').classList.add('hidden');
    document.getElementById('glowna-aplikacja').classList.remove('hidden');
    wlaczHistorie();
    pobierzDane();
}

// opcje: { info, blad } – komunikat pod formularzem (np. „link wygasł”)
function pokazEkranLogowania(opcje = {}) {
    document.getElementById('glowna-aplikacja').classList.add('hidden');
    document.getElementById('ekran-logowania').classList.remove('hidden');
    pokazEtapLogowania('logowanie', opcje);
}

// Zdarzenia logowania z Supabase. W funkcji zwrotnej nie wywołujemy innych metod Supabase
// bezpośrednio (zalecenie supabase-js – groziłoby zakleszczeniem), stąd setTimeout.
if (supabaseClient) {
    supabaseClient.auth.onAuthStateChange((zdarzenie, sesja) => {
        if (zdarzenie === 'PASSWORD_RECOVERY' && sesja) {
            setTimeout(() => pokazNoweHaslo(sesja.user), 0);
        } else if (zdarzenie === 'SIGNED_OUT' && stan.uzytkownikId && !stan.trybOffline) {
            setTimeout(zakonczSesjeLokalnie, 0);
        }
    });
}

// =====================================================================
// BUDŻET WSPÓLNY / OSOBISTY
// Wybór jest zapamiętany osobno dla każdej osoby (localStorage na tym urządzeniu).
// Budżet wspólny jest dostępny tylko dla osób z listy (db.js: czyDostepDoWspolnego).
// =====================================================================

function kluczWyboruBudzetu() {
    return `budzet.widok.${stan.uzytkownikId || 'gosc'}`;
}

function zapamietanyBudzet() {
    try {
        return localStorage.getItem(kluczWyboruBudzetu()) === 'osobisty' ? 'osobisty' : 'wspolny';
    } catch (e) {
        return 'wspolny';
    }
}

// Wiadomo już, że ta osoba nie ma dostępu do budżetu wspólnego (null = jeszcze nie sprawdzono)
function bezBudzetuWspolnego() {
    return !!stan.dostepWspolny && !stan.dostepWspolny.czlonek;
}

async function zmienBudzet(budzet) {
    if (!BUDZETY[budzet] || budzet === stan.budzet) return;
    if (czyWczytanieKopiiTrwa()) {
        pokazKomunikat('Poczekaj, aż skończy się wczytywanie kopii');
        return;
    }
    if (budzet === 'osobisty' && stan.schematBudzetow === false) {
        pokazKomunikat('Budżet osobisty wymaga migracji bazy: uruchom w Supabase supabase/migracja_2026-11b_budzet_osobisty.sql');
        return;
    }
    if (budzet === 'wspolny' && bezBudzetuWspolnego()) {
        pokazKomunikat('Nie masz dostępu do budżetu wspólnego – szczegóły: Ustawienia → Osoby w budżecie wspólnym');
        return;
    }
    stan.budzet = budzet;
    try { localStorage.setItem(kluczWyboruBudzetu(), budzet); } catch (e) {}

    // Nowy budżet = czyste dane i filtry; niedokończony import zaczyna się od nowa
    wyczyscDaneBudzetu();
    imp = nowyStanImportu();
    zamknijFormularzCelu();
    odswiezPrzelacznikBudzetu();
    // Do czasu pobrania pokazujemy pusty ekran nowego budżetu, nie dane poprzedniego
    przeliczMiesiace();
    odswiezInterfejs();
    document.getElementById('app-main').scrollTop = 0;
    await pobierzDane();
    pokazKomunikat(`Otwarto: ${nazwaBudzetu()}`);
}

// Przełącznik w nagłówku, motyw (klasa na <body>), nazwa w menu i tytuł karty.
// Osoba bez dostępu do budżetu wspólnego ma tylko budżet osobisty – przełącznik znika.
function odswiezPrzelacznikBudzetu() {
    const osobisty = stan.budzet === 'osobisty';
    document.body.classList.toggle('budzet-osobisty', osobisty);
    const przelacznik = document.querySelector('.budzet-przelacznik');
    if (przelacznik) przelacznik.classList.toggle('hidden', bezBudzetuWspolnego());
    document.querySelectorAll('[data-budzet]').forEach(btn => {
        const aktywny = btn.dataset.budzet === stan.budzet;
        btn.classList.toggle('is-active', aktywny);
        btn.setAttribute('aria-checked', String(aktywny));
        btn.tabIndex = aktywny ? 0 : -1;
    });
    document.getElementById('nav-brand-nazwa').innerText = nazwaBudzetu();
    ustawTytulKarty();
}

// Strzałki w lewo / w prawo w grupie radiowej (wzorzec WAI-ARIA)
function klawiszPrzelacznikaBudzetu(e) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const nowy = stan.budzet === 'wspolny' ? 'osobisty' : 'wspolny';
    zmienBudzet(nowy);
    const btn = document.querySelector(`[data-budzet="${nowy}"]`);
    if (btn) btn.focus();
}

// =====================================================================
// KOMUNIKATY I ZAKŁADKI
// =====================================================================

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

// W Ustawieniach tytuł mówi, na którym poziomie jesteśmy (np. „Kategorie”, „Czynsz”)
function ustawTytulKarty() {
    const tytul = stan.zakladka === 'ustawienia'
        ? tytulStronyUstawien()
        : (TYTULY_ZAKLADEK[stan.zakladka] || 'Budżet');
    document.getElementById('app-title').innerText = tytul;
    document.title = `${tytul} · ${nazwaBudzetu()}`;
}

// Klik w zakładkę: zamyka otwarte szczegóły, czyści filtr i przewija na górę (10.1).
// opcje pozwalają wejść na zakładkę z ustawionym filtrem (np. z Pulpitu):
//   filtr ('brak' | 'przypisane'), kategoria, zakres { od, do }, miesiac ('RRRR-MM' | null)
function zmienZakladke(nazwa, opcje = {}) {
    if (nazwa === 'ustawienia') {
        // Ustawienia nie są zakładką paska – zapamiętujemy, skąd przyszliśmy („‹ Wróć”),
        // a zębatka zawsze otwiera menu ustawień (pierwszy poziom)
        if (stan.zakladka !== 'ustawienia') stan.poprzedniaZakladka = stan.zakladka;
        resetujNawigacjeUstawien();
    }
    stan.zakladka = nazwa;
    stan.filtrTransakcji = opcje.filtr || 'wszystkie';
    stan.filtrKategorii = opcje.kategoria || null;
    stan.zakresTransakcji = opcje.zakres || null;
    if (nazwa === 'transakcje') {
        // „Do przypisania” z pulpitu obejmuje wszystkie miesiące (7.1);
        // zwykłe wejście pokazuje ten sam miesiąc, który jest wybrany na Pulpicie.
        stan.miesiacTransakcji = 'miesiac' in opcje ? opcje.miesiac
            : opcje.filtr === 'brak' ? null : (stan.miesiacWybrany || null);
    }
    if (nazwa === 'import') przygotujEkranImportu();
    stan.otwartyCel = null;           // klik w zakładkę zamyka otwarte szczegóły (10.1)
    stan.podzial = null;              // i niezapisany podział transakcji
    stan.szczegolyTransakcji = null;  // i panel notatki / paragonu
    stan.kategoriaDoUsuniecia = null; // i niepotwierdzone usunięcie kategorii
    stan.potwierdzenie = null;        // i każde inne otwarte potwierdzenie (10.2)
    zamknijFormularzCelu();

    document.querySelectorAll('main > section').forEach(sec => sec.classList.add('hidden'));
    document.getElementById(`tab-${nazwa}`).classList.remove('hidden');

    document.querySelectorAll('.nav-btn').forEach(btn => {
        const aktywna = btn.dataset.tab === nazwa;
        btn.classList.toggle('is-active', aktywna);
        if (aktywna) btn.setAttribute('aria-current', 'page');
        else btn.removeAttribute('aria-current');
    });

    ustawTytulKarty();
    document.getElementById('app-main').scrollTop = 0;
    odswiezAktywnyEkran();
    zapiszAdresWidoku();
}

const ODSWIEZANIE_EKRANOW = {
    pulpit: () => odswiezPulpit(),
    transakcje: () => odswiezTransakcje(),
    import: () => odswiezImport(),
    cele: () => odswiezCele(),
    statystyki: () => { odswiezStatystyki(); rysujOszczednosciStatystyk(); },
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
    zaplanujZapisMigawki(); // kopia na urządzeniu nadąża za zmianami (offline.js)
}

// ---- Powrót internetu i powrót do karty -----------------------------

// Sieć wróciła: najpierw sesja (mogła wygasnąć), potem świeże dane
window.addEventListener('online', () => {
    if (stan.trybOffline) sprawdzSesje();
});

// Druga osoba mogła w tym czasie coś zmienić. Nie odświeżamy, gdy na ekranie jest
// niedokończona edycja (podział, notatka, potwierdzenie, import, wczytywanie kopii).
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !stan.uzytkownikId || stan.trybOffline) return;
    if (Date.now() - stan.ostatniePobranie < ODSWIEZ_PO_POWROCIE_MS) return;
    const edycja = stan.podzial || stan.szczegolyTransakcji || stan.potwierdzenie ||
        czyWczytanieKopiiTrwa() || imp.etap === 'zapis' ||
        !document.getElementById('modal-cel').classList.contains('hidden');
    if (!edycja) pobierzDane();
});

// ---- Start ----
try {
    lucide.createIcons();
} catch (e) {}

window.addEventListener('load', sprawdzSesje);
