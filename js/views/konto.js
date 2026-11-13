// =====================================================================
// KONTO I DOSTĘP
//  1. Ekran logowania: „Nie pamiętasz hasła?” (link na e-mail) i ustawienie nowego hasła
//     po kliknięciu linku (Supabase Auth: resetPasswordForEmail → PASSWORD_RECOVERY → updateUser)
//  2. Ustawienia → Zmiana hasła (z obecnym hasłem)
//  3. Ustawienia → Osoby w budżecie wspólnym (migracja 2026-11f: dodawanie, usuwanie,
//     utworzenie budżetu wspólnego w nowej instalacji)
// Ładowany przed ustawienia.js i app.js.
// =====================================================================

const MIN_DLUGOSC_HASLA = 8;
const MAKS_DLUGOSC_HASLA = 72;        // Supabase Auth nie przyjmuje dłuższych haseł
const ODSTEP_WYSYLKI_LINKU_MS = 60 * 1000; // Supabase: kolejny e-mail na ten sam adres najwcześniej po minucie

// ---------------------------------------------------------------------
// LINK Z E-MAILA
// Supabase po kliknięciu linku wraca na adres aplikacji z danymi w części „#…”:
//   #access_token=…&type=recovery          – link „ustaw nowe hasło” (Nie pamiętasz hasła?)
//   #access_token=…&type=invite            – zaproszenie wysłane z panelu Supabase (Invite user):
//                                            nowe konto nie ma jeszcze hasła, więc też formularz hasła
//   #error=…&error_code=otp_expired&…       – link wygasł albo był już użyty
// Odczytujemy to przy starcie, zanim biblioteka Supabase wyczyści adres.
// ---------------------------------------------------------------------

function odczytajLinkZEmaila() {
    const zHasha = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    const zAdresu = new URLSearchParams(location.search || '');
    const pole = klucz => zHasha.get(klucz) || zAdresu.get(klucz) || '';
    const typ = pole('type');
    return {
        reset: typ === 'recovery' || typ === 'invite',
        zaproszenie: typ === 'invite',
        blad: !!(pole('error') || pole('error_code'))
    };
}

const LINK_Z_EMAILA = odczytajLinkZEmaila();

// Nie pokazujemy opisu błędu z adresu: ktoś mógłby podesłać link z własnym „komunikatem”
function bladLinkuZEmaila() {
    if (!LINK_Z_EMAILA.blad) return '';
    try { history.replaceState(null, '', location.pathname); } catch (e) {} // odświeżenie nie pokaże go ponownie
    LINK_Z_EMAILA.blad = false;
    return 'Link z e-maila wygasł albo został już użyty. Wyślij nowy: „Nie pamiętasz hasła?”.';
}

// ---------------------------------------------------------------------
// EKRAN LOGOWANIA: etapy logowanie → reset → (e-mail) → noweHaslo
// ---------------------------------------------------------------------

const ETAPY_LOGOWANIA = {
    logowanie: { formularz: 'form-login', podtytul: 'Zaloguj się do budżetu wspólnego i osobistego', fokus: 'login-email' },
    reset: { formularz: 'form-reset', podtytul: 'Odzyskiwanie hasła', fokus: 'reset-email' },
    noweHaslo: { formularz: 'form-nowe-haslo', podtytul: 'Ustaw nowe hasło', fokus: 'nowe-haslo' }
};

// opcje: { info, blad, fokus } – fokus: true przy przejściu wywołanym przez użytkownika
// (przy starcie nie przenosimy fokusu, żeby na telefonie nie wyskakiwała klawiatura)
function pokazEtapLogowania(etap, { info = '', blad = '', fokus = false } = {}) {
    const cel = ETAPY_LOGOWANIA[etap] || ETAPY_LOGOWANIA.logowanie;
    Object.values(ETAPY_LOGOWANIA).forEach(e => {
        document.getElementById(e.formularz).classList.toggle('hidden', e !== cel);
    });
    document.getElementById('login-podtytul').innerText = cel.podtytul;
    if (cel === ETAPY_LOGOWANIA.reset) {
        const pole = document.getElementById('reset-email');
        if (!pole.value) pole.value = document.getElementById('login-email').value.trim();
    }
    ustawInfoLogowania(info);
    ustawBladLogowania(blad);
    if (fokus) ustawFokusNa(cel.fokus);
}

// Przyciski „Nie pamiętasz hasła?” / „‹ Wróć do logowania” (data-klik w index.html)
function przejdzDoEtapuLogowania(etap) {
    pokazEtapLogowania(etap, { fokus: true });
}

function ustawBladLogowania(tekst) {
    const el = document.getElementById('login-error');
    el.innerText = tekst || '';
    el.classList.toggle('hidden', !tekst);
}

function ustawInfoLogowania(tekst) {
    const el = document.getElementById('login-info');
    el.innerText = tekst || '';
    el.classList.toggle('hidden', !tekst);
}

function czyLimitProb(error) {
    return !!error && (error.status === 429 || /rate_limit/.test(String(error.code || '')));
}

// Czytelne komunikaty błędów Supabase Auth (kody: error.code)
function opisBleduAuth(error, poczatek) {
    const kod = String((error && error.code) || '');
    if (kod === 'over_email_send_rate_limit') {
        return 'Wysłano już za dużo e-maili. Spróbuj ponownie za jakiś czas – wbudowana poczta Supabase wysyła tylko kilka wiadomości na godzinę.';
    }
    if (czyLimitProb(error)) return 'Za dużo prób w krótkim czasie. Odczekaj chwilę i spróbuj ponownie.';
    if (kod === 'email_address_not_authorized') {
        return 'Supabase nie może wysłać e-maila na ten adres: wbudowana poczta działa tylko dla adresów z zespołu projektu. Potrzebny jest własny serwer poczty (SMTP) – instrukcja w README.md.';
    }
    if (kod === 'weak_password') return 'Hasło jest za słabe – wybierz dłuższe i trudniejsze do odgadnięcia.';
    if (kod === 'same_password') return 'Nowe hasło musi różnić się od obecnego.';
    if (kod === 'reauthentication_needed') return 'Supabase wymaga ponownego potwierdzenia tożsamości – wyloguj się i ustaw hasło przez „Nie pamiętasz hasła?”.';
    if (kod === 'session_not_found' || kod === 'session_expired' || (error && error.name === 'AuthSessionMissingError')) {
        return 'Sesja wygasła – otwórz link z e-maila jeszcze raz albo wyślij nowy.';
    }
    return `${poczatek}: ${(error && error.message) || 'nieznany błąd'}`;
}

function bladNowegoHasla(haslo, powtorzone) {
    if (haslo.length < MIN_DLUGOSC_HASLA) return `Hasło musi mieć co najmniej ${MIN_DLUGOSC_HASLA} znaków.`;
    if (haslo.length > MAKS_DLUGOSC_HASLA) return `Hasło może mieć najwyżej ${MAKS_DLUGOSC_HASLA} znaki.`;
    if (haslo !== powtorzone) return 'Hasła się różnią – wpisz to samo hasło dwa razy.';
    return '';
}

function wyczyscPola(...idPol) {
    idPol.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}

// Adres, na który ma wrócić link z e-maila: ta sama strona, bez „#…” i parametrów.
// Musi być na liście Supabase: Authentication → URL Configuration → Redirect URLs.
function adresAplikacji() {
    return location.origin + location.pathname;
}

let ostatniaWysylkaLinku = 0;

async function wyslijLinkResetu(e) {
    e.preventDefault();
    const email = document.getElementById('reset-email').value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return ustawBladLogowania('Podaj adres e-mail konta.');
    const zostalo = Math.ceil((ostatniaWysylkaLinku + ODSTEP_WYSYLKI_LINKU_MS - Date.now()) / 1000);
    if (zostalo > 0) return ustawBladLogowania(`Link został już wysłany. Kolejny możesz wysłać za ${zostalo} s.`);

    const btn = document.getElementById('btn-reset');
    btn.disabled = true;
    btn.innerText = 'Wysyłanie...';
    ustawBladLogowania('');
    ustawInfoLogowania('');
    try {
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: adresAplikacji() });
        if (error) {
            ustawBladLogowania(opisBleduAuth(error, 'Nie wysłano linku'));
        } else {
            ostatniaWysylkaLinku = Date.now();
            // Ten sam komunikat dla każdego adresu – nie zdradzamy, czy konto istnieje
            ustawInfoLogowania('Jeśli konto z tym adresem istnieje, za chwilę przyjdzie e-mail z linkiem do ustawienia nowego hasła (sprawdź też folder spam). Link jest jednorazowy i ważny przez ograniczony czas.');
        }
    } catch (err) {
        ustawBladLogowania('Wystąpił błąd sieci. Spróbuj ponownie.');
    }
    btn.disabled = false;
    btn.innerText = 'Wyślij link';
}

// Po kliknięciu linku z e-maila: formularz nowego hasła zamiast aplikacji
function pokazNoweHaslo(uzytkownik) {
    stan.odzyskiwanieHasla = true;
    document.getElementById('glowna-aplikacja').classList.add('hidden');
    document.getElementById('ekran-logowania').classList.remove('hidden');
    document.getElementById('nowe-haslo-email').innerText = (uzytkownik && uzytkownik.email) || 'Twojego konta';
    document.getElementById('nowe-haslo-login').value = (uzytkownik && uzytkownik.email) || '';
    pokazEtapLogowania('noweHaslo', { fokus: true });
    if (LINK_Z_EMAILA.zaproszenie) document.getElementById('login-podtytul').innerText = 'Witaj! Ustaw hasło do swojego konta';
}

async function zapiszNoweHasloZLinku(e) {
    e.preventDefault();
    const haslo = document.getElementById('nowe-haslo').value;
    const blad = bladNowegoHasla(haslo, document.getElementById('nowe-haslo-2').value);
    if (blad) return ustawBladLogowania(blad);

    const btn = document.getElementById('btn-nowe-haslo');
    btn.disabled = true;
    btn.innerText = 'Zapisywanie...';
    ustawBladLogowania('');
    try {
        const { data, error } = await supabaseClient.auth.updateUser({ password: haslo });
        if (error) {
            ustawBladLogowania(opisBleduAuth(error, 'Nie zmieniono hasła'));
        } else {
            wyczyscPola('nowe-haslo', 'nowe-haslo-2');
            const zaproszenie = LINK_Z_EMAILA.zaproszenie;
            LINK_Z_EMAILA.reset = LINK_Z_EMAILA.zaproszenie = false;
            pokazAplikacje(data.user);
            pokazKomunikat(zaproszenie ? 'Hasło ustawione – witaj w budżecie!' : 'Ustawiono nowe hasło');
        }
    } catch (err) {
        ustawBladLogowania('Wystąpił błąd sieci. Spróbuj ponownie.');
    }
    btn.disabled = false;
    btn.innerText = 'Zapisz hasło';
}

// ---------------------------------------------------------------------
// USTAWIENIA → ZMIANA HASŁA
// Najpierw sprawdzamy obecne hasło: ktoś przy odblokowanym telefonie z otwartą aplikacją
// nie przejmie konta, zmieniając hasło bez jego znajomości.
// ---------------------------------------------------------------------

function rysujZmianeHasla() {
    document.getElementById('haslo-konto').innerText = stan.uzytkownikEmail ? `Konto: ${stan.uzytkownikEmail}` : '';
    document.getElementById('haslo-login').value = stan.uzytkownikEmail || '';
}

function pokazBladZmianyHasla(tekst) {
    const el = document.getElementById('haslo-blad');
    el.innerText = tekst || '';
    el.classList.toggle('hidden', !tekst);
}

async function zmienHaslo(e) {
    e.preventDefault();
    const obecne = document.getElementById('haslo-obecne').value;
    const nowe = document.getElementById('haslo-nowe').value;
    const blad = !obecne ? 'Wpisz obecne hasło.'
        : bladNowegoHasla(nowe, document.getElementById('haslo-nowe-2').value)
            || (nowe === obecne ? 'Nowe hasło musi różnić się od obecnego.' : '');
    if (blad) return pokazBladZmianyHasla(blad);
    if (!stan.uzytkownikEmail) return pokazBladZmianyHasla('To konto nie ma adresu e-mail – hasło można zmienić tylko w panelu Supabase.');
    if (stan.trybOffline) return pokazBladZmianyHasla('Bez internetu nie można zmienić hasła.');

    const btn = document.getElementById('btn-zmien-haslo');
    btn.disabled = true;
    btn.innerText = 'Zapisywanie...';
    pokazBladZmianyHasla('');
    try {
        const sprawdzenie = await supabaseClient.auth.signInWithPassword({ email: stan.uzytkownikEmail, password: obecne });
        if (sprawdzenie.error) {
            pokazBladZmianyHasla(czyLimitProb(sprawdzenie.error)
                ? opisBleduAuth(sprawdzenie.error, 'Nie sprawdzono hasła')
                : 'Obecne hasło jest nieprawidłowe.');
        } else {
            const { error } = await supabaseClient.auth.updateUser({ password: nowe });
            if (error) {
                pokazBladZmianyHasla(opisBleduAuth(error, 'Nie zmieniono hasła'));
            } else {
                wyczyscPola('haslo-obecne', 'haslo-nowe', 'haslo-nowe-2');
                pokazKomunikat('Hasło zmienione');
                wsteczUstawienia();
            }
        }
    } catch (err) {
        pokazBladZmianyHasla('Wystąpił błąd sieci. Spróbuj ponownie.');
    }
    btn.disabled = false;
    btn.innerText = 'Zmień hasło';
}

// ---------------------------------------------------------------------
// USTAWIENIA → OSOBY W BUDŻECIE WSPÓLNYM (stan.dostepWspolny, db.js)
// Każda osoba z listy widzi i zmienia cały budżet wspólny oraz może dodawać i usuwać osoby.
// ---------------------------------------------------------------------

function opisMenuCzlonkow() {
    const d = stan.dostepWspolny;
    if (!d) return 'Sprawdzanie dostępu…';
    if (!d.schemat) return 'Każde zalogowane konto – uruchom migrację';
    if (d.czlonek) return `${liczbaIOdmiana(d.czlonkowie.length, 'osoba', 'osoby', 'osób')} z dostępem`;
    if (!d.maCzlonkow) return d.maDane ? 'Nikt nie ma dostępu – dodaj osoby w Supabase' : 'Nie utworzono – możesz go utworzyć';
    return 'Nie masz dostępu – poproś o dodanie';
}

function akapitKonta(tekst) {
    return `<p class="text-xs text-[var(--muted)]">${esc(tekst)}</p>`;
}

function dataDodania(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('pl-PL');
}

function htmlCzlonka(c, jedyny) {
    const id = String(c.user_id);
    const idE = esc(id);
    const potwierdzenie = czyPotwierdzenie('czlonek', id) ? htmlPotwierdzenia({
        rodzaj: 'czlonek',
        id,
        pytanie: c.to_ja ? 'Opuścić budżet wspólny?' : `Usunąć ${c.email || 'tę osobę'} z budżetu wspólnego?`,
        opis: c.to_ja
            ? 'Stracisz dostęp do wspólnych danych, dopóki ktoś znów nie doda Twojego adresu. Dane zostają.'
            : 'Ta osoba straci dostęp do wspólnych danych. Dane zostają, a osobę można dodać ponownie.',
        tak: c.to_ja ? 'Opuść' : 'Usuń',
        tekstWTrakcie: 'Usuwanie…',
        akcjaTak: `usunCzlonka('${idE}')`,
        akcjaNie: `zamknijPotwierdzenie(odswiezUstawienia, 'btn-czl-usun-${idE}')`,
        klasa: 'mt-2'
    }) : '';
    const przycisk = jedyny ? '' : `
        <button type="button" id="btn-czl-usun-${idE}" data-klik="pytajOUsuniecieCzlonka('${idE}')"
            class="chip" aria-label="${esc(c.to_ja ? 'Opuść budżet wspólny' : `Usuń ${c.email || 'osobę'} z budżetu wspólnego`)}">${c.to_ja ? 'Opuść' : 'Usuń'}</button>`;
    return `
        <li class="py-2">
            <div class="flex items-center gap-3">
                <span class="flex-1 min-w-0">
                    <span class="block text-sm font-semibold truncate">${esc(c.email || 'konto bez adresu e-mail')}${c.to_ja ? ' <span class="font-normal text-[var(--muted)]">(Ty)</span>' : ''}</span>
                    <span class="block text-[11px] text-[var(--muted)]">Dostęp od ${esc(dataDodania(c.dodano))}</span>
                </span>
                ${przycisk}
            </div>
            ${potwierdzenie}
        </li>`;
}

function htmlCzlonkow() {
    const d = stan.dostepWspolny;
    if (!d) return akapitKonta('Sprawdzanie dostępu…');
    if (!d.schemat) {
        return akapitKonta(`Teraz budżet wspólny widzi każde zalogowane konto. Żeby ograniczyć go do wybranych osób, uruchom w Supabase skrypt ${PLIK_MIGRACJI} (instrukcja w README.md).`);
    }
    if (!d.czlonek && !d.maCzlonkow && !d.maDane) {
        return `
            <p class="text-xs">Budżet wspólny jeszcze nie istnieje. Utwórz go – będziesz pierwszą osobą z dostępem, a potem dodasz drugą osobę po jej adresie e-mail.</p>
            <button type="button" id="btn-utworz-wspolny" data-klik="utworzBudzetWspolny()" class="btn-primary !w-auto px-6">Utwórz budżet wspólny</button>`;
    }
    if (!d.czlonek && !d.maCzlonkow) {
        return akapitKonta('W bazie są dane budżetu wspólnego, ale nikt nie ma do nich dostępu. Ze względów bezpieczeństwa pierwsze osoby dodaje się w Supabase (SQL Editor) – instrukcja w README.md, „Pierwsze osoby budżetu wspólnego”.');
    }
    if (!d.czlonek) {
        return akapitKonta(`Nie masz dostępu do budżetu wspólnego. Poproś osobę, która go używa, żeby dodała Twój adres (${stan.uzytkownikEmail || 'adres Twojego konta'}) w Ustawienia → Osoby w budżecie wspólnym. Twój budżet osobisty działa normalnie.`);
    }
    const jedyny = d.czlonkowie.length <= 1;
    return `
        <ul class="divide-y divide-[var(--border)]" aria-label="Osoby z dostępem do budżetu wspólnego">
            ${d.czlonkowie.map(c => htmlCzlonka(c, jedyny)).join('')}
        </ul>
        <form data-wyslij="dodajCzlonka(event)" class="flex gap-2 pt-1">
            <label for="czl-email" class="sr-only">Adres e-mail osoby do dodania</label>
            <input type="email" id="czl-email" required autocomplete="off" placeholder="adres e-mail drugiej osoby" class="input flex-1 min-w-0">
            <button type="submit" id="btn-czl-dodaj" class="btn-secondary whitespace-nowrap">+ Dodaj</button>
        </form>
        <p class="text-[10px] text-[var(--muted)]">Osoba musi mieć już konto w tej aplikacji (konta zakłada się w Supabase: Authentication → Users → Add user). Każda osoba z listy widzi i zmienia cały budżet wspólny i może zarządzać tą listą. Budżetu osobistego nie widzi nikt poza jego właścicielem.</p>`;
}

function rysujCzlonkow() {
    wstawHtml(document.getElementById('czl-tresc'), htmlCzlonkow(), true);
}

// Błąd funkcji dostępu: komunikaty z bazy są po polsku i bez danych technicznych
function opisBleduDostepu(error, poczatek) {
    if (czyBrakSchematu(error)) return komunikatBledu(error, poczatek);
    const kod = String((error && error.code) || '');
    if (kod === BLAD_OFFLINE.code) return komunikatBledu(error, poczatek);
    if (['P0001', 'P0002', '42501', '22023', '28000'].includes(kod) && error.message) return error.message;
    return `${poczatek}: ${(error && error.message) || 'nieznany błąd'}`;
}

// Wywołuje funkcję z migracji 2026-11f; zwraca true po sukcesie (nowy stan już w stan.dostepWspolny)
async function wywolajFunkcjeDostepu(funkcja, parametry, poczatekBledu) {
    const { data, error } = await supabaseClient.rpc(funkcja, parametry);
    if (error) {
        pokazKomunikat(opisBleduDostepu(error, poczatekBledu));
        return false;
    }
    stan.dostepWspolny = przeksztalcStanDostepu(data);
    return true;
}

async function dodajCzlonka(e) {
    e.preventDefault();
    const pole = document.getElementById('czl-email');
    const email = pole.value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return pokazKomunikat('Podaj poprawny adres e-mail.');
    const znany = (stan.dostepWspolny.czlonkowie || []).some(c => String(c.email || '').toLowerCase() === email.toLowerCase());
    if (znany) return pokazKomunikat(`${email} już ma dostęp do budżetu wspólnego`);

    const btn = document.getElementById('btn-czl-dodaj');
    btn.disabled = true;
    const udane = await wywolajFunkcjeDostepu('dodaj_czlonka_budzetu', { p_email: email }, 'Nie dodano osoby');
    if (udane) {
        pole.value = '';
        pokazKomunikat(`Dodano: ${email} – po zalogowaniu zobaczy budżet wspólny`);
    }
    btn.disabled = false;
    odswiezUstawienia();
}

function pytajOUsuniecieCzlonka(id) {
    otworzPotwierdzenie('czlonek', id, odswiezUstawienia);
}

async function usunCzlonka(id) {
    const ja = String(id) === String(stan.uzytkownikId);
    const osoba = (stan.dostepWspolny.czlonkowie || []).find(c => String(c.user_id) === String(id));
    const udane = await wykonajPotwierdzenie('czlonek', id, odswiezUstawienia,
        () => wywolajFunkcjeDostepu('usun_czlonka_budzetu', { p_user_id: id }, 'Nie usunięto osoby'));
    if (!udane) return;
    if (ja) {
        // Bez dostępu: pobierzDane przełączy na budżet osobisty
        await pobierzDane();
        pokazKomunikat('Opuszczono budżet wspólny');
    } else {
        odswiezUstawienia();
        pokazKomunikat(`Usunięto dostęp: ${(osoba && osoba.email) || 'osoba'}`);
    }
}

async function utworzBudzetWspolny() {
    const btn = document.getElementById('btn-utworz-wspolny');
    if (btn) btn.disabled = true;
    const udane = await wywolajFunkcjeDostepu('utworz_budzet_wspolny', {}, 'Nie utworzono budżetu wspólnego');
    if (udane) {
        odswiezPrzelacznikBudzetu();
        pokazKomunikat('Utworzono budżet wspólny – dodaj teraz drugą osobę');
    } else if (btn) {
        btn.disabled = false;
    }
    odswiezUstawienia();
    ustawFokusNa('czl-email');
}
