// =====================================================================
// BEZPIECZEŃSTWO KONTA (migracja 2026-11g)
//  1. Weryfikacja dwuetapowa (MFA, TOTP – kody z aplikacji typu Google Authenticator):
//     etap „kod” po haśle, włączanie (kod QR), wyłączanie, „wymagaj od wszystkich”.
//     Dostęp do danych pilnuje baza (uzytkownik_budzetu() zwraca NULL bez kodu) – aplikacja
//     tylko prowadzi przez kolejne kroki.
//  2. Automatyczne wylogowanie po bezczynności (darmowy plan Supabase nie ma limitu sesji).
//     Ostatnia aktywność jest w localStorage, więc liczy się też zamknięta karta i inne karty.
//  3. Wylogowanie na wszystkich urządzeniach.
//  4. Ochrona przed osadzeniem strony w ramce (clickjacking) – hosting bez nagłówków HTTP.
// Ładowany przed konto.js, ustawienia.js i app.js.
// =====================================================================

const KLUCZ_OSTATNIEJ_AKTYWNOSCI = 'budzet.ostatniaAktywnosc';
const KLUCZ_LIMITU_BEZCZYNNOSCI = 'budzet.wylogujPoMin';
const DOMYSLNY_LIMIT_BEZCZYNNOSCI_MIN = 15;
const OPCJE_LIMITU_BEZCZYNNOSCI = [5, 15, 30, 60, 0];   // 0 = nigdy
const ZAPIS_AKTYWNOSCI_CO_MS = 15 * 1000;                // localStorage nie przy każdym ruchu myszy
const SPRAWDZANIE_BEZCZYNNOSCI_CO_MS = 30 * 1000;
const KOD_MFA = /^[0-9]{6}$/;

// ---------------------------------------------------------------------
// 0. RAMKI: strona nie działa osadzona w cudzej witrynie (podstawianie kliknięć)
// ---------------------------------------------------------------------
(function chronPrzedRamka() {
    if (typeof window === 'undefined') return;
    try {
        if (window.top === window.self) return;
    } catch (e) { /* inna domena – też ramka */ }
    document.documentElement.style.display = 'none';
    try { window.top.location = window.self.location.href; } catch (e) {}
})();

// ---------------------------------------------------------------------
// 1. AUTOMATYCZNE WYLOGOWANIE (czyste funkcje: tests/bezpieczenstwo.test.js)
// ---------------------------------------------------------------------

function poprawnyLimitBezczynnosci(wartosc) {
    const n = Number(wartosc);
    return OPCJE_LIMITU_BEZCZYNNOSCI.includes(n) ? n : DOMYSLNY_LIMIT_BEZCZYNNOSCI_MIN;
}

function limitBezczynnosciMin() {
    try {
        const zapisany = localStorage.getItem(KLUCZ_LIMITU_BEZCZYNNOSCI);
        return zapisany === null ? DOMYSLNY_LIMIT_BEZCZYNNOSCI_MIN : poprawnyLimitBezczynnosci(zapisany);
    } catch (e) {
        return DOMYSLNY_LIMIT_BEZCZYNNOSCI_MIN;
    }
}

// ostatnia – znacznik czasu (ms) albo null (brak zapisu = nie wylogowujemy na ślepo)
function czyPrzekroczonoBezczynnosc(ostatnia, teraz, limitMin) {
    if (!limitMin || !Number.isFinite(ostatnia) || ostatnia <= 0) return false;
    return teraz - ostatnia >= limitMin * 60 * 1000;
}

function opisLimituBezczynnosci(limitMin) {
    if (!limitMin) return 'nigdy';
    return limitMin === 60 ? 'po 1 godzinie' : `po ${limitMin} min`;
}

function ostatniaAktywnosc() {
    try {
        const n = Number(localStorage.getItem(KLUCZ_OSTATNIEJ_AKTYWNOSCI));
        return Number.isFinite(n) && n > 0 ? n : null;
    } catch (e) {
        return null;
    }
}

let ostatniZapisAktywnosci = 0;
function zapiszAktywnosc(wymus = false) {
    const teraz = Date.now();
    if (!wymus && teraz - ostatniZapisAktywnosci < ZAPIS_AKTYWNOSCI_CO_MS) return;
    ostatniZapisAktywnosci = teraz;
    try { localStorage.setItem(KLUCZ_OSTATNIEJ_AKTYWNOSCI, String(teraz)); } catch (e) {}
}

function zmienLimitBezczynnosci(wartosc) {
    const limit = poprawnyLimitBezczynnosci(wartosc);
    try { localStorage.setItem(KLUCZ_LIMITU_BEZCZYNNOSCI, String(limit)); } catch (e) {}
    zapiszAktywnosc(true);
    pokazKomunikat(limit ? `Automatyczne wylogowanie ${opisLimituBezczynnosci(limit)} bez aktywności` : 'Automatyczne wylogowanie wyłączone');
    if (stan.zakladka === 'ustawienia') odswiezUstawienia();
}

// Przy starcie: sesja z zapisaną aktywnością sprzed limitu = wylogowanie zamiast otwarcia danych
function czySesjaWygaslaZBezczynnosci() {
    return czyPrzekroczonoBezczynnosc(ostatniaAktywnosc(), Date.now(), limitBezczynnosciMin());
}

// Zapis do bazy w toku (import, wczytanie kopii) – nie przerywamy go wylogowaniem
function czyPracaWToku() {
    return (typeof czyWczytanieKopiiTrwa === 'function' && czyWczytanieKopiiTrwa()) ||
        (typeof imp !== 'undefined' && imp && imp.etap === 'zapis');
}

function czyAplikacjaOtwarta() {
    return !!stan.uzytkownikId && !document.getElementById('glowna-aplikacja').classList.contains('hidden');
}

async function wylogujZPowoduBezczynnosci() {
    const limit = limitBezczynnosciMin();
    try { await supabaseClient.auth.signOut({ scope: 'local' }); } catch (e) {}
    zakonczSesjeLokalnie();
    pokazEtapLogowania('logowanie', {
        info: `Wylogowano automatycznie ${opisLimituBezczynnosci(limit)} bez aktywności – Twoje dane zostały usunięte z tego urządzenia. Zaloguj się ponownie.`
    });
}

function sprawdzBezczynnosc() {
    if (!czyAplikacjaOtwarta() || czyPracaWToku()) return;
    if (czySesjaWygaslaZBezczynnosci()) wylogujZPowoduBezczynnosci();
}

(function nasluchAktywnosci() {
    if (typeof document === 'undefined' || !document.addEventListener) return;
    const aktywnosc = () => { if (czyAplikacjaOtwarta()) zapiszAktywnosc(); };
    ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(typ =>
        document.addEventListener(typ, aktywnosc, { passive: true, capture: true }));
    // Powrót do karty (telefon wybudzony po godzinie): sprawdzenie od razu, przed pokazaniem danych
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') sprawdzBezczynnosc();
    });
    setInterval(sprawdzBezczynnosc, SPRAWDZANIE_BEZCZYNNOSCI_CO_MS);
})();

// ---------------------------------------------------------------------
// 2. WYLOGOWANIE: to urządzenie / wszystkie urządzenia
// ---------------------------------------------------------------------

async function wyloguj() {
    try { await supabaseClient.auth.signOut({ scope: 'local' }); } catch (e) {}
    zakonczSesjeLokalnie();
}

async function wylogujWszedzie() {
    const btn = document.getElementById('btn-wyloguj-wszedzie');
    if (btn) { btn.disabled = true; btn.innerText = 'Wylogowywanie...'; }
    let blad = null;
    try {
        const { error } = await supabaseClient.auth.signOut({ scope: 'global' });
        blad = error;
    } catch (e) {
        blad = e;
    }
    if (blad && !/session/i.test(String(blad.message || ''))) {
        if (btn) { btn.disabled = false; btn.innerText = 'Wyloguj na wszystkich urządzeniach'; }
        return pokazKomunikat('Nie udało się wylogować wszędzie: ' + (blad.message || 'błąd sieci'));
    }
    zakonczSesjeLokalnie();
    pokazEtapLogowania('logowanie', { info: 'Wylogowano na wszystkich urządzeniach. Inne urządzenia stracą dostęp najpóźniej po godzinie (gdy wygaśnie ich bieżący token).' });
}

// ---------------------------------------------------------------------
// 3. MFA – stan konta
// ---------------------------------------------------------------------

function nowyStanBezpieczenstwa() {
    return {
        zaladowany: false,
        ladowanie: false,
        aal: null,              // 'aal1' | 'aal2'
        czynnik: null,          // potwierdzony czynnik TOTP { id, friendly_name, created_at }
        wymagajMfa: null,       // null = migracja 2026-11g nieuruchomiona
        blad: '',
        wlaczanie: null,        // { miejsce, factorId, qr, sekret, blad, zapis }
        wylaczanie: null,       // { blad, zapis }
        zapisWymagania: false
    };
}
let bezp = nowyStanBezpieczenstwa();

function resetujBezpieczenstwo() {
    bezp = nowyStanBezpieczenstwa();
}

// Stan MFA z biblioteki (z sesji na urządzeniu – działa też bez internetu) i z bazy
async function wczytajStanMfa() {
    const wynik = { aal: null, nastepny: null, czynnik: null, wymagajMfa: null, dostep: null };
    try {
        const { data } = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
        if (data) { wynik.aal = data.currentLevel; wynik.nastepny = data.nextLevel; }
    } catch (e) {}
    try {
        const { data } = await supabaseClient.auth.mfa.listFactors();
        const potwierdzone = ((data && data.all) || []).filter(f => f.factor_type === 'totp' && f.status === 'verified');
        wynik.czynnik = potwierdzone[0] || null;
    } catch (e) {}
    try {
        const { data, error } = await rpcBezBlokady('stan_bezpieczenstwa');
        if (!error && data) {
            wynik.wymagajMfa = !!data.wymagaj_mfa;
            wynik.dostep = !!data.dostep;
            if (data.ma_mfa && !wynik.czynnik) wynik.czynnik = { id: null };
        }
    } catch (e) {}
    return wynik;
}

// Po zalogowaniu hasłem (i przy starcie z zapamiętaną sesją): kod MFA, włączenie MFA albo aplikacja
async function poZalogowaniu(uzytkownik) {
    zapiszAktywnosc(true);   // właśnie podano hasło – liczymy bezczynność od teraz
    let poziom = null;
    try {
        const { data } = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
        poziom = data;
    } catch (e) {}
    if (poziom && poziom.nextLevel === 'aal2' && poziom.currentLevel !== 'aal2') {
        return pokazKodMfa(uzytkownik);
    }
    pokazAplikacje(uzytkownik);
}

// Baza odmówiła dostępu (błąd 28000 z db.js): sprawdzamy, czego brakuje
async function obsluzBrakDostepuMfa() {
    const s = await wczytajStanMfa();
    const uzytkownik = { id: stan.uzytkownikId, email: stan.uzytkownikEmail };
    if (s.czynnik && s.aal !== 'aal2') return pokazKodMfa(uzytkownik);
    if (s.wymagajMfa && !s.czynnik) return pokazWymaganeMfa(uzytkownik);
    ustawStatusPolaczenia('Brak dostępu do danych – zaloguj się ponownie');
}

function pokazEkranMfa(uzytkownik, etap, opcje) {
    stan.uzytkownikId = uzytkownik ? uzytkownik.id : stan.uzytkownikId;
    stan.uzytkownikEmail = uzytkownik ? uzytkownik.email || '' : stan.uzytkownikEmail;
    document.getElementById('glowna-aplikacja').classList.add('hidden');
    document.getElementById('ekran-logowania').classList.remove('hidden');
    pokazEtapLogowania(etap, opcje);
}

function pokazKodMfa(uzytkownik, blad = '') {
    document.getElementById('mfa-email').innerText = (uzytkownik && uzytkownik.email) || 'Twojego konta';
    document.getElementById('mfa-kod').value = '';
    pokazEkranMfa(uzytkownik, 'mfa', { blad, fokus: true });
}

function pokazWymaganeMfa(uzytkownik) {
    pokazEkranMfa(uzytkownik, 'mfaWlacz', {});
    rozpocznijWlaczanieMfa('logowanie');
}

// Kod z aplikacji po zalogowaniu hasłem
async function potwierdzKodMfa(e) {
    e.preventDefault();
    const pole = document.getElementById('mfa-kod');
    const kod = pole.value.replace(/\s/g, '');
    if (!KOD_MFA.test(kod)) {
        ustawBladLogowania('Wpisz 6 cyfr z aplikacji uwierzytelniającej.');
        return pole.focus();
    }
    const btn = document.getElementById('btn-mfa');
    btn.disabled = true;
    btn.innerText = 'Sprawdzanie...';
    ustawBladLogowania('');
    try {
        const { error } = await zweryfikujKodMfa(kod);
        if (error) {
            ustawBladLogowania(opisBleduMfa(error));
            pole.value = '';
            pole.focus();
        } else {
            const { data } = await supabaseClient.auth.getUser();
            pole.value = '';
            zapiszAktywnosc(true);
            pokazAplikacje(data && data.user ? data.user : { id: stan.uzytkownikId, email: stan.uzytkownikEmail });
        }
    } catch (err) {
        ustawBladLogowania('Wystąpił błąd sieci. Spróbuj ponownie.');
    }
    btn.disabled = false;
    btn.innerText = 'Potwierdź';
}

// Weryfikacja kodem potwierdzonego czynnika (logowanie i zmiana hasła)
async function zweryfikujKodMfa(kod) {
    const { data, error } = await supabaseClient.auth.mfa.listFactors();
    if (error) return { error };
    const czynnik = ((data && data.all) || []).find(f => f.factor_type === 'totp' && f.status === 'verified');
    if (!czynnik) return { error: { message: 'To konto nie ma włączonej weryfikacji dwuetapowej.' } };
    return supabaseClient.auth.mfa.challengeAndVerify({ factorId: czynnik.id, code: kod });
}

async function czyKontoMaMfa() {
    try {
        const { data } = await supabaseClient.auth.mfa.listFactors();
        return ((data && data.all) || []).some(f => f.factor_type === 'totp' && f.status === 'verified');
    } catch (e) {
        return false;
    }
}

function opisBleduMfa(error) {
    const kod = String((error && error.code) || '');
    const tekst = String((error && error.message) || '');
    if (kod === 'mfa_verification_failed' || /invalid.*code|totp code/i.test(tekst)) {
        return 'Nieprawidłowy albo przeterminowany kod. Sprawdź, czy czas w telefonie jest ustawiony automatycznie, i wpisz aktualny kod.';
    }
    if (czyLimitProb(error)) return 'Za dużo prób w krótkim czasie. Odczekaj chwilę i spróbuj ponownie.';
    if (kod === 'mfa_totp_enroll_not_enabled' || kod === 'mfa_totp_verify_not_enabled' || /not enabled/i.test(tekst)) {
        return 'Weryfikacja kodem (TOTP) jest wyłączona w Supabase: Authentication → Multi-Factor → TOTP → Enabled.';
    }
    if (kod === 'too_many_enrolled_mfa_factors') return 'Konto ma za dużo niedokończonych prób włączenia MFA – odśwież stronę i spróbuj ponownie.';
    if (kod === 'insufficient_aal') return 'Ta operacja wymaga zalogowania kodem z aplikacji – wyloguj się i zaloguj ponownie.';
    return tekst || 'Nieznany błąd weryfikacji';
}

// ---------------------------------------------------------------------
// 4. WŁĄCZANIE MFA (ekran logowania – gdy wymagane, i Ustawienia → Bezpieczeństwo)
// ---------------------------------------------------------------------

function kontenerWlaczania(miejsce) {
    return document.getElementById(miejsce === 'logowanie' ? 'mfa-wlacz-tresc' : 'bezp-wlaczanie');
}

async function rozpocznijWlaczanieMfa(miejsce) {
    bezp.wlaczanie = { miejsce, factorId: null, qr: '', sekret: '', blad: '', zapis: false, przygotowanie: true };
    rysujWlaczanieMfa();
    const w = bezp.wlaczanie;
    try {
        // Niedokończone wcześniejsze próby (bez potwierdzenia kodem) – usuwamy, Supabase ma limit czynników
        const lista = await supabaseClient.auth.mfa.listFactors();
        const niedokonczone = ((lista.data && lista.data.all) || []).filter(f => f.factor_type === 'totp' && f.status !== 'verified');
        for (const f of niedokonczone) await supabaseClient.auth.mfa.unenroll({ factorId: f.id });

        const { data, error } = await supabaseClient.auth.mfa.enroll({
            factorType: 'totp',
            friendlyName: `Budżet domowy ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
        });
        if (bezp.wlaczanie !== w) return;
        if (error) {
            Object.assign(w, { przygotowanie: false, blad: opisBleduMfa(error) });
        } else {
            Object.assign(w, { przygotowanie: false, factorId: data.id, qr: data.totp.qr_code, sekret: data.totp.secret });
        }
    } catch (err) {
        if (bezp.wlaczanie !== w) return;
        Object.assign(w, { przygotowanie: false, blad: 'Wystąpił błąd sieci. Spróbuj ponownie.' });
    }
    rysujWlaczanieMfa();
    const pole = document.getElementById('mfa-wlacz-kod');
    if (pole) pole.focus({ preventScroll: true });
}

// Supabase zwraca „data:image/svg+xml;utf-8,<svg…>” z niezakodowanym SVG – nie każda przeglądarka
// to wyświetli. Kodujemy treść; przyjmujemy wyłącznie obrazki data: (nic z zewnętrznych adresów).
function adresObrazuQr(qr) {
    const tekst = String(qr || '');
    const svg = /^data:image\/svg\+xml;(?:charset=)?utf-8,([\s\S]*)$/i.exec(tekst);
    if (svg && svg[1].trim().startsWith('<')) return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg[1]);
    return /^data:image\//i.test(tekst) ? tekst : '';
}

function sekretWGrupach(sekret) {
    return String(sekret || '').replace(/(.{4})/g, '$1 ').trim();
}

function htmlWlaczaniaMfa(w) {
    if (w.przygotowanie) return '<p role="status" class="text-xs">Przygotowuję kod QR…</p>';
    if (!w.factorId) {
        return `
            <p role="alert" class="text-xs text-[var(--c-spend)]">${esc(w.blad)}</p>
            <div class="flex gap-2 flex-wrap">
                <button type="button" data-klik="rozpocznijWlaczanieMfa('${w.miejsce}')" class="btn-secondary !w-auto px-4">Spróbuj ponownie</button>
                ${w.miejsce === 'logowanie' ? '' : '<button type="button" data-klik="anulujWlaczanieMfa()" class="btn-secondary !w-auto px-4">Anuluj</button>'}
            </div>`;
    }
    return `
        <ol class="text-xs space-y-1 list-decimal pl-5">
            <li>Zainstaluj aplikację uwierzytelniającą, np. <strong>Google Authenticator</strong>, <strong>Microsoft Authenticator</strong>, <strong>Aegis</strong> albo menedżer haseł z kodami (1Password, Bitwarden).</li>
            <li>Zeskanuj kod QR (albo wpisz klucz ręcznie).</li>
            <li>Wpisz 6-cyfrowy kod, który pokaże aplikacja.</li>
        </ol>
        <div class="flex flex-wrap items-center gap-4">
            <img id="mfa-qr" alt="Kod QR do zeskanowania w aplikacji uwierzytelniającej" width="176" height="176"
                 class="w-44 h-44 rounded-xl bg-white p-2 border border-[var(--border)]">
            <div class="text-xs space-y-1 min-w-0">
                <p class="text-[var(--muted)]">Klucz do wpisania ręcznie:</p>
                <p class="font-mono break-all select-all" aria-label="Klucz ${esc(w.sekret.split('').join(' '))}">${esc(sekretWGrupach(w.sekret))}</p>
                <p class="text-[10px] text-[var(--muted)]">Nie pokazuj go nikomu – kto go ma, generuje Twoje kody.</p>
            </div>
        </div>
        <form data-wyslij="potwierdzWlaczenieMfa(event)" class="space-y-2" novalidate>
            <label for="mfa-wlacz-kod" class="field-label">Kod z aplikacji</label>
            <input type="text" id="mfa-wlacz-kod" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required
                   class="input kwota max-w-[10rem] text-center tracking-[0.3em]" ${w.zapis ? 'disabled' : ''}
                   ${w.blad ? 'aria-invalid="true" aria-describedby="mfa-wlacz-blad"' : ''}>
            ${w.blad ? `<p id="mfa-wlacz-blad" role="alert" class="text-xs text-[var(--c-spend)]">${esc(w.blad)}</p>` : ''}
            <div class="flex gap-2 flex-wrap">
                <button type="submit" class="btn-primary !w-auto px-5" ${w.zapis ? 'disabled' : ''}>${w.zapis ? 'Sprawdzanie…' : 'Włącz weryfikację'}</button>
                ${w.miejsce === 'logowanie'
                    ? '<button type="button" data-klik="wyloguj()" class="btn-secondary !w-auto px-4">Wyloguj</button>'
                    : '<button type="button" data-klik="anulujWlaczanieMfa()" class="btn-secondary !w-auto px-4">Anuluj</button>'}
            </div>
        </form>`;
}

function rysujWlaczanieMfa() {
    const w = bezp.wlaczanie;
    if (!w) return;
    const kontener = kontenerWlaczania(w.miejsce);
    if (!kontener) return;
    // wstawHtml (ustawienia.js) zachowuje wpisywany kod przy odświeżeniu ekranu
    if (typeof wstawHtml === 'function') wstawHtml(kontener, htmlWlaczaniaMfa(w));
    else kontener.innerHTML = htmlWlaczaniaMfa(w);
    // Obraz QR (data:image/svg+xml) ustawiany z kodu, nie przez HTML – bez wstrzykiwania znaczników
    const qr = document.getElementById('mfa-qr');
    if (qr && w.qr) qr.src = adresObrazuQr(w.qr);
    if (typeof odswiezIkony === 'function') odswiezIkony();
}

async function potwierdzWlaczenieMfa(e) {
    e.preventDefault();
    const w = bezp.wlaczanie;
    if (!w || !w.factorId || w.zapis) return;
    const kod = document.getElementById('mfa-wlacz-kod').value.replace(/\s/g, '');
    if (!KOD_MFA.test(kod)) {
        w.blad = 'Wpisz 6 cyfr z aplikacji uwierzytelniającej.';
        rysujWlaczanieMfa();
        return document.getElementById('mfa-wlacz-kod').focus();
    }
    Object.assign(w, { zapis: true, blad: '' });
    rysujWlaczanieMfa();
    let error;
    try {
        ({ error } = await supabaseClient.auth.mfa.challengeAndVerify({ factorId: w.factorId, code: kod }));
    } catch (err) {
        error = { message: 'Wystąpił błąd sieci. Spróbuj ponownie.' };
    }
    if (bezp.wlaczanie !== w) return;
    if (error) {
        Object.assign(w, { zapis: false, blad: opisBleduMfa(error) });
        rysujWlaczanieMfa();
        return document.getElementById('mfa-wlacz-kod').focus();
    }
    bezp.wlaczanie = null;
    zapiszAktywnosc(true);
    pokazKomunikat('Weryfikacja dwuetapowa włączona – przy logowaniu podasz też kod z aplikacji');
    if (w.miejsce === 'logowanie') {
        const { data } = await supabaseClient.auth.getUser();
        return pokazAplikacje(data && data.user ? data.user : { id: stan.uzytkownikId, email: stan.uzytkownikEmail });
    }
    await odswiezStanBezpieczenstwa();
}

async function anulujWlaczanieMfa() {
    const w = bezp.wlaczanie;
    bezp.wlaczanie = null;
    rysujBezpieczenstwo();
    if (w && w.factorId) {
        try { await supabaseClient.auth.mfa.unenroll({ factorId: w.factorId }); } catch (e) {}
    }
    const btn = document.getElementById('btn-mfa-wlacz');
    if (btn) btn.focus();
}

// ---------------------------------------------------------------------
// 5. USTAWIENIA → BEZPIECZEŃSTWO
// ---------------------------------------------------------------------

function opisMenuBezpieczenstwa() {
    const mfa = bezp.zaladowany ? (bezp.czynnik ? 'MFA włączone' : 'MFA wyłączone') : 'Weryfikacja dwuetapowa';
    return `${mfa} · wylogowanie ${opisLimituBezczynnosci(limitBezczynnosciMin())}`;
}

async function odswiezStanBezpieczenstwa() {
    if (bezp.ladowanie) return;
    bezp.ladowanie = true;
    const s = await wczytajStanMfa();
    Object.assign(bezp, {
        ladowanie: false,
        zaladowany: true,
        aal: s.aal,
        czynnik: s.czynnik,
        wymagajMfa: s.wymagajMfa,
        blad: ''
    });
    if (stan.zakladka === 'ustawienia') odswiezUstawienia();
}

function htmlStatusuMfa() {
    if (!bezp.zaladowany) return '<p role="status" class="text-xs text-[var(--muted)]">Sprawdzanie…</p>';
    if (bezp.wlaczanie && bezp.wlaczanie.miejsce === 'ustawienia') return '';
    if (!bezp.czynnik) {
        return `
            <p class="text-xs">Weryfikacja dwuetapowa jest <strong>wyłączona</strong>. Po włączeniu do logowania potrzebne będzie hasło <em>i</em> 6-cyfrowy kod z aplikacji w telefonie – samo wykradzione hasło nie wystarczy.</p>
            <button type="button" id="btn-mfa-wlacz" data-klik="rozpocznijWlaczanieMfa('ustawienia')" class="btn-primary !w-auto px-5" ${stan.trybOffline ? 'disabled' : ''}>Włącz weryfikację dwuetapową</button>`;
    }
    const kiedy = bezp.czynnik.created_at ? ` (od ${new Date(bezp.czynnik.created_at).toLocaleDateString('pl-PL')})` : '';
    const wylaczanie = bezp.wylaczanie;
    let akcje;
    if (bezp.wymagajMfa) {
        akcje = '<p class="text-[11px] text-[var(--muted)]">Nie można wyłączyć, dopóki MFA jest wymagane od wszystkich (przełącznik niżej).</p>';
    } else if (wylaczanie) {
        akcje = `
            <div class="p-3 rounded-xl border border-[var(--c-spend)] space-y-2">
                <p class="text-xs">Po wyłączeniu do logowania wystarczy samo hasło. Na pewno?</p>
                ${wylaczanie.blad ? `<p role="alert" class="text-xs text-[var(--c-spend)]">${esc(wylaczanie.blad)}</p>` : ''}
                <div class="flex gap-2 flex-wrap">
                    <button type="button" id="btn-mfa-wylacz-tak" data-klik="wylaczMfa()" class="btn-primary !w-auto px-5 !bg-[var(--c-spend)] !text-white" ${wylaczanie.zapis ? 'disabled' : ''}>${wylaczanie.zapis ? 'Wyłączanie…' : 'Tak, wyłącz'}</button>
                    <button type="button" data-klik="anulujWylaczanieMfa()" class="btn-secondary !w-auto px-4">Anuluj</button>
                </div>
            </div>`;
    } else {
        akcje = `<button type="button" id="btn-mfa-wylacz" data-klik="pytajOWylaczenieMfa()" class="btn-secondary !w-auto px-4" ${stan.trybOffline ? 'disabled' : ''}>Wyłącz…</button>`;
    }
    return `
        <p class="text-xs flex items-center gap-2"><i data-lucide="shield-check" class="w-4 h-4 text-[var(--c-income)]" aria-hidden="true"></i>
            <span>Weryfikacja dwuetapowa jest <strong>włączona</strong>${esc(kiedy)}.</span></p>
        ${akcje}`;
}

function htmlWymaganiaMfa() {
    if (!czyDostepDoWspolnego()) return '';
    if (bezp.wymagajMfa === null) {
        return `<p class="text-[11px] text-[var(--muted)] border-t border-[var(--border)] pt-3">„Wymagaj od wszystkich” wymaga migracji bazy <span class="font-mono">${esc(PLIK_MIGRACJI)}</span>.</p>`;
    }
    const mozna = bezp.aal === 'aal2' && !stan.trybOffline && !bezp.zapisWymagania;
    return `
        <label class="flex items-center justify-between gap-3 text-xs border-t border-[var(--border)] pt-3">
            <span>
                <span class="font-semibold block">Wymagaj od wszystkich osób</span>
                <span class="text-[10px] text-[var(--muted)] block">Osoba bez MFA po zalogowaniu musi je najpierw włączyć – inaczej nie zobaczy żadnych danych.${mozna || bezp.zapisWymagania ? '' : ' Zmienić to może osoba zalogowana kodem MFA.'}</span>
            </span>
            <input type="checkbox" id="bezp-wymagaj" role="switch" class="switch" ${bezp.wymagajMfa ? 'checked' : ''} ${mozna ? '' : 'disabled'}
                   data-zmiana="zmienWymaganieMfa(this.checked)">
        </label>`;
}

function htmlLimituBezczynnosci() {
    const limit = limitBezczynnosciMin();
    const opcje = OPCJE_LIMITU_BEZCZYNNOSCI.map(n =>
        `<option value="${n}" ${n === limit ? 'selected' : ''}>${n ? (n === 60 ? 'Po 1 godzinie' : `Po ${n} minutach`) : 'Nigdy (niezalecane)'}</option>`).join('');
    return `
        <div class="flex items-center justify-between gap-3 text-xs flex-wrap">
            <label for="bezp-bezczynnosc">
                <span class="font-semibold block">Wyloguj po bezczynności</span>
                <span class="text-[10px] text-[var(--muted)]">Na tym urządzeniu. Dane znikają z pamięci i z kopii offline.</span>
            </label>
            <select id="bezp-bezczynnosc" class="input !w-auto" data-zmiana="zmienLimitBezczynnosci(this.value)">${opcje}</select>
        </div>`;
}

function rysujBezpieczenstwo() {
    const status = document.getElementById('bezp-mfa');
    if (!status) return;
    if (!bezp.zaladowany && !bezp.ladowanie && !stan.trybOffline) odswiezStanBezpieczenstwa();
    document.getElementById('bezp-konto').innerText = stan.uzytkownikEmail ? `Konto: ${stan.uzytkownikEmail}` : '';
    wstawHtml(status, htmlStatusuMfa() + htmlWymaganiaMfa());
    const wlaczanie = document.getElementById('bezp-wlaczanie');
    const pokazWlaczanie = !!(bezp.wlaczanie && bezp.wlaczanie.miejsce === 'ustawienia');
    wlaczanie.classList.toggle('hidden', !pokazWlaczanie);
    if (pokazWlaczanie) rysujWlaczanieMfa(); else if (wlaczanie.innerHTML) wlaczanie.innerHTML = '';
    wstawHtml(document.getElementById('bezp-sesja'), htmlLimituBezczynnosci());
    odswiezIkony();
}

function pytajOWylaczenieMfa() {
    bezp.wylaczanie = { blad: '', zapis: false };
    rysujBezpieczenstwo();
    const btn = document.getElementById('btn-mfa-wylacz-tak');
    if (btn) btn.focus();
}

function anulujWylaczanieMfa() {
    bezp.wylaczanie = null;
    rysujBezpieczenstwo();
    const btn = document.getElementById('btn-mfa-wylacz');
    if (btn) btn.focus();
}

async function wylaczMfa() {
    const w = bezp.wylaczanie;
    if (!w || w.zapis) return;
    Object.assign(w, { zapis: true, blad: '' });
    rysujBezpieczenstwo();
    try {
        const { data } = await supabaseClient.auth.mfa.listFactors();
        const czynniki = ((data && data.all) || []).filter(f => f.factor_type === 'totp');
        for (const f of czynniki) {
            const { error } = await supabaseClient.auth.mfa.unenroll({ factorId: f.id });
            if (error) throw error;
        }
        // Nowy token bez poziomu aal2 (stary jest ważny do godziny)
        await supabaseClient.auth.refreshSession();
    } catch (err) {
        Object.assign(w, { zapis: false, blad: opisBleduMfa(err) });
        return rysujBezpieczenstwo();
    }
    bezp.wylaczanie = null;
    pokazKomunikat('Weryfikacja dwuetapowa wyłączona');
    await odswiezStanBezpieczenstwa();
    const btn = document.getElementById('btn-mfa-wlacz');
    if (btn) btn.focus();
}

async function zmienWymaganieMfa(wymagaj) {
    if (bezp.zapisWymagania) return;
    bezp.zapisWymagania = true;
    rysujBezpieczenstwo();
    const { data, error } = await rpcBezBlokady('ustaw_wymagaj_mfa', { p_wymagaj: !!wymagaj });
    bezp.zapisWymagania = false;
    if (error) {
        pokazKomunikat(czyBrakSchematu(error)
            ? `Brak funkcji w bazie – uruchom w Supabase skrypt ${PLIK_MIGRACJI}.`
            : `Nie zmieniono ustawienia: ${error.message}`);
    } else {
        bezp.wymagajMfa = !!(data && data.wymagaj_mfa);
        pokazKomunikat(bezp.wymagajMfa ? 'MFA jest teraz wymagane od wszystkich osób' : 'MFA nie jest już wymagane od wszystkich');
    }
    rysujBezpieczenstwo();
    const pole = document.getElementById('bezp-wymagaj');
    if (pole) pole.focus();
}
