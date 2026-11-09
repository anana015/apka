// =====================================================================
// EKRAN: USTAWIENIA (zębatka w nagłówku)
// Specyfikacja: 11.3 (kopia zapasowa, eksport do Excela), 9.1 (docelowa stopa
// oszczędności), 3 „categories” i 11.1 (kategorie: kolor, limit, stała, usuwanie).
//
// Ustawienia są „poziomowe” – szczegóły widać dopiero po wejściu głębiej:
//   poziom 1: menu – każda pozycja z krótkim podsumowaniem („21 kategorii · 3 z limitem”)
//   poziom 2: strona – Kategorie, Reguły, Przelewy na konto wspólne, Kopia i eksport, Preferencje
//   poziom 3: szczegóły jednej kategorii – nazwa, kolor, limit, stała, oszczędność, użycie, usuwanie
// „‹ …” u góry zawsze cofa o jeden poziom, zębatka w nagłówku otwiera menu (app.js).
// Kategorie, reguły, kopia i eksport dotyczą otwartego budżetu (wspólnego albo osobistego),
// preferencje – tej przeglądarki. Zapis i wczytanie kopii zapasowej: kopia.js.
// =====================================================================

const NAZWY_TYPOW = {
    przychod: 'Przychód',
    wydatek: 'Wydatek',
    wplata: 'Oszczędności',
    wyplata: 'Wypłata z celu',
    pominiete: 'Pominięte',
    zwrot: 'Zwrot',
    wyplataOszczednosci: 'Wypłata z oszczędności'
};

// Nazwy zarezerwowane: „Pomiń” jest systemowa, pozostałe to etykiety brakującej kategorii
const NAZWY_ZAREZERWOWANE = [POMIN, 'Nieprzypisane', 'Bez kategorii'];
const MAKS_NAZWA_KATEGORII = 40;

// =====================================================================
// NAWIGACJA PO POZIOMACH
// =====================================================================

// rodzic = dokąd prowadzi „‹ …” (null = wyjście z Ustawień na poprzednią zakładkę)
const STRONY_USTAWIEN = {
    menu: { tytul: 'Ustawienia', rodzic: null },
    kategorie: { tytul: 'Kategorie', rodzic: 'menu' },
    kategoria: { tytul: 'Kategoria', rodzic: 'kategorie' },
    reguly: { tytul: 'Reguły', rodzic: 'menu' },
    kontoWspolne: { tytul: 'Przelewy na konto wspólne', rodzic: 'menu' },
    dane: { tytul: 'Kopia i eksport', rodzic: 'menu' },
    preferencje: { tytul: 'Preferencje', rodzic: 'menu' }
};

// Pozycje menu: grupa „budzet” (otwarty budżet) albo „urzadzenie” (ta przeglądarka)
const MENU_USTAWIEN = [
    { strona: 'kategorie', grupa: 'budzet', ikona: 'tags', opis: opisMenuKategorii },
    { strona: 'reguly', grupa: 'budzet', ikona: 'list-checks',
      opis: () => liczbaIOdmiana(dynamiczneReguly.length, 'reguła', 'reguły', 'reguł') },
    { strona: 'kontoWspolne', grupa: 'budzet', ikona: 'arrow-left-right', opis: opisMenuKontaWspolnego, widoczna: czyKontoWspolneDostepne },
    { strona: 'dane', grupa: 'budzet', ikona: 'hard-drive-download',
      opis: () => `${liczbaIOdmiana(stan.transakcje.length, 'transakcja', 'transakcje', 'transakcji')} · zapis i wczytanie kopii, Excel` },
    { strona: 'preferencje', grupa: 'urzadzenie', ikona: 'sliders-horizontal', opis: opisMenuPreferencji }
];

const RYSOWANIE_STRON_USTAWIEN = {
    menu: rysujMenuUstawien,
    preferencje: rysujPreferencje,
    kategorie: () => { rysujKategorieUstawien(); rysujWyborKategorii(); },
    kategoria: rysujSzczegolyKategorii,
    reguly: rysujRegulyUstawien,
    kontoWspolne: rysujKontoWspolne,
    dane: rysujDaneUstawien
};

const KLASA_WIERSZA_MENU = 'w-full flex items-center gap-3 px-2 py-2.5 rounded-xl text-left hover:bg-[var(--bg)] transition';

function liczbaIOdmiana(n, jeden, kilka, wiele) {
    return `${n} ${odmiana(n, jeden, kilka, wiele)}`;
}

// Zębatka w nagłówku zawsze otwiera menu (wywołuje app.js przy wejściu do Ustawień)
function resetujNawigacjeUstawien() {
    Object.assign(stan, {
        ustawieniaStrona: 'menu',
        ustawieniaKategoria: null,
        ustawieniaPowrot: null,
        kolejnoscKategorii: false,
        wyborKategorii: null,
        kategoriaDoUsuniecia: null
    });
}

// Przejście na stronę Ustawień. opcje:
//   kategoria   – id kategorii (strona 'kategoria')
//   powrot      – { strona, kategoria } dokąd cofa „‹”, gdy weszliśmy skrótem (np. z kategorii do jej reguł)
//   filtrReguly – tekst wpisany od razu w wyszukiwarkę reguł
//   fokus       – id elementu do zaznaczenia po przejściu (przy cofaniu: wiersz, z którego weszliśmy)
function otworzStroneUstawien(strona, opcje = {}) {
    Object.assign(stan, {
        ustawieniaStrona: strona,
        ustawieniaKategoria: opcje.kategoria ?? null,
        ustawieniaPowrot: opcje.powrot || null,
        kolejnoscKategorii: false,
        wyborKategorii: null,
        kategoriaDoUsuniecia: null
    });
    if (strona === 'reguly') document.getElementById('reg-filtr').value = opcje.filtrReguly || '';
    odswiezUstawienia();
    document.getElementById('app-main').scrollTop = 0;
    ustawFokusStrony(opcje.fokus);
}

function otworzKategorie(id) {
    otworzStroneUstawien('kategoria', { kategoria: id });
}

// Dokąd prowadzi „‹ …”: zwykle strona nadrzędna, po skrócie – miejsce, z którego przyszliśmy
function celPowrotuUstawien() {
    if (stan.ustawieniaPowrot) return stan.ustawieniaPowrot;
    const rodzic = STRONY_USTAWIEN[stan.ustawieniaStrona].rodzic;
    return rodzic ? { strona: rodzic, kategoria: null } : null;
}

function wsteczUstawienia() {
    const cel = celPowrotuUstawien();
    if (!cel) return zmienZakladke(stan.poprzedniaZakladka || 'pulpit');
    const { ustawieniaStrona: strona, ustawieniaKategoria: kategoria } = stan;
    otworzStroneUstawien(cel.strona, {
        kategoria: cel.kategoria,
        fokus: strona === 'kategoria' ? `kat-wiersz-${kategoria}`
            : cel.strona === 'menu' ? `ust-poz-${strona}` : null
    });
}

// Tytuł w nagłówku aplikacji i na przycisku „‹ …” (app.js: ustawTytulKarty)
function tytulStronyUstawien(strona = stan.ustawieniaStrona, kategoriaId = stan.ustawieniaKategoria) {
    if (strona === 'kategoria') {
        const k = kategoriaPoId(kategoriaId);
        if (k) return k.name;
    }
    return (STRONY_USTAWIEN[strona] || STRONY_USTAWIEN.menu).tytul;
}

// Strona, której nie da się pokazać (usunięta kategoria, inny budżet), cofa poziom wyżej
function sprawdzStroneUstawien() {
    const strona = stan.ustawieniaStrona;
    if (!STRONY_USTAWIEN[strona]) stan.ustawieniaStrona = 'menu';
    else if (strona === 'kategoria' && !kategoriaPoId(stan.ustawieniaKategoria)) stan.ustawieniaStrona = 'kategorie';
    else if (strona === 'kontoWspolne' && !czyKontoWspolneDostepne()) stan.ustawieniaStrona = 'menu';
    if (stan.ustawieniaPowrot && stan.ustawieniaPowrot.strona === 'kategoria' && !kategoriaPoId(stan.ustawieniaPowrot.kategoria)) {
        stan.ustawieniaPowrot = null;
    }
}

// Po przejściu: wskazany element albo nagłówek nowej strony (czytnik ekranu ogłosi, gdzie jesteśmy)
function ustawFokusStrony(idFokusu) {
    const wskazany = idFokusu && document.getElementById(idFokusu);
    const cel = wskazany || document.querySelector(`#tab-ustawienia .ust-strona[data-strona="${stan.ustawieniaStrona}"] h2`);
    if (!cel) return;
    if (!wskazany) cel.tabIndex = -1;
    cel.focus({ preventScroll: !wskazany });
}

function odswiezUstawienia() {
    sprawdzStroneUstawien();
    const strona = stan.ustawieniaStrona;
    document.querySelectorAll('#tab-ustawienia .ust-strona').forEach(el => el.classList.toggle('hidden', el.dataset.strona !== strona));

    const powrot = celPowrotuUstawien();
    document.getElementById('ust-wroc-nazwa').innerText = powrot
        ? tytulStronyUstawien(powrot.strona, powrot.kategoria)
        : (TYTULY_ZAKLADEK[stan.poprzedniaZakladka] || 'Pulpit');
    ustawTytulKarty();

    RYSOWANIE_STRON_USTAWIEN[strona]();
}

// Wstawia HTML i przywraca fokus (z wpisywanym tekstem) na element o tym samym id –
// odświeżenie po zapisie nie wyrzuca kursora z pola, w którym właśnie piszesz.
// zPamiecia: pomija wstawianie, gdy HTML się nie zmienił (tylko dla treści bez pól formularza).
const ostatniHtml = new WeakMap();
function wstawHtml(el, html, zPamiecia = false) {
    if (zPamiecia && ostatniHtml.get(el) === html) return false;
    const aktywny = document.activeElement;
    const idFokusu = aktywny && aktywny.id && el.contains(aktywny) ? aktywny.id : null;
    const wpisywany = idFokusu && (aktywny.tagName === 'TEXTAREA' || /^(text|search|number)$/.test(aktywny.type || ''));
    const tekst = wpisywany ? { wartosc: aktywny.value, start: aktywny.selectionStart, koniec: aktywny.selectionEnd } : null;

    el.innerHTML = html;
    ostatniHtml.set(el, html);

    const nowy = idFokusu && document.getElementById(idFokusu);
    if (nowy && !nowy.disabled) {
        if (tekst) {
            nowy.value = tekst.wartosc;
            try { nowy.setSelectionRange(tekst.start, tekst.koniec); } catch (e) {}
        }
        nowy.focus({ preventScroll: true });
    }
    return true;
}

function odswiezIkony() {
    try { lucide.createIcons(); } catch (e) {}
}

// =====================================================================
// POZIOM 1: MENU
// =====================================================================

function opisMenuKategorii() {
    if (!stan.kategorieZBazy) return 'Lista startowa – potrzebna migracja bazy';
    const zLimitem = stan.kategorie.filter(k => k.monthly_limit_gr > 0).length;
    return liczbaIOdmiana(stan.kategorie.length, 'kategoria', 'kategorie', 'kategorii') + (zLimitem ? ` · ${zLimitem} z limitem` : '');
}

function opisMenuKontaWspolnego() {
    const regula = regulaKontaWspolnego();
    return regula ? `Konto …${regula.phrase.slice(-4)} → ${KATEGORIA_PRZELEW_WSPOLNE}` : 'Nie ustawiono';
}

function opisMenuPreferencji() {
    const stopa = docelowaStopa();
    return `Cel oszczędzania ${liczba(stopa, stopa % 1 ? 1 : 0)}% · zapamiętywanie ${zapamietujPodobne() ? 'włączone' : 'wyłączone'}`;
}

function wierszMenuUstawien(pozycja) {
    return `
        <li>
            <button type="button" id="ust-poz-${pozycja.strona}" onclick="otworzStroneUstawien('${pozycja.strona}')" class="${KLASA_WIERSZA_MENU}">
                <span class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]" aria-hidden="true">
                    <i data-lucide="${pozycja.ikona}" class="w-[18px] h-[18px]"></i>
                </span>
                <span class="flex-1 min-w-0">
                    <span class="block text-sm font-semibold">${esc(STRONY_USTAWIEN[pozycja.strona].tytul)}</span>
                    <span class="block text-[11px] text-[var(--muted)] truncate">${esc(pozycja.opis())}</span>
                </span>
                <span class="text-lg leading-none text-[var(--muted)]" aria-hidden="true">›</span>
            </button>
        </li>`;
}

function rysujMenuUstawien() {
    document.getElementById('ust-menu-budzet').innerText = nazwaBudzetu();
    let zmiana = false;
    ['budzet', 'urzadzenie'].forEach(grupa => {
        const html = MENU_USTAWIEN
            .filter(p => p.grupa === grupa && (!p.widoczna || p.widoczna()))
            .map(wierszMenuUstawien).join('');
        zmiana = wstawHtml(document.getElementById(`ust-menu-${grupa}-lista`), html, true) || zmiana;
    });
    if (zmiana) odswiezIkony();
    document.getElementById('ust-konto').innerText = stan.uzytkownikEmail ? `Zalogowano jako ${stan.uzytkownikEmail}` : '';
}

// =====================================================================
// POZIOM 2: PREFERENCJE, KOPIA I EKSPORT
// =====================================================================

function rysujPreferencje() {
    const stopa = document.getElementById('stat-cel-stopy');
    if (document.activeElement !== stopa) stopa.value = docelowaStopa();
    document.getElementById('ust-zapamietaj').checked = zapamietujPodobne();
}

function rysujDaneUstawien() {
    document.getElementById('ust-kopia-info').innerText =
        `${nazwaBudzetu()} w chmurze: ${stan.transakcje.length} transakcji, ${dynamiczneReguly.length} reguł, ${stan.cele.length} celów, ${stan.kategorie.length} kategorii.`;

    // Okres eksportu: wszystkie albo jeden miesiąc (najnowszy pierwszy)
    const select = document.getElementById('ust-eksport-okres');
    const poprzedni = select.value;
    const miesiace = Array.from(new Set(stan.transakcje.map(t => t.booked_on.substring(0, 7)))).sort().reverse();
    select.innerHTML = `<option value="">Wszystkie transakcje</option>` +
        miesiace.map(m => `<option value="${esc(m)}">${esc(nazwaMiesiaca(m))}</option>`).join('');
    if (miesiace.includes(poprzedni)) select.value = poprzedni;

    rysujWczytanieKopii();
}

// =====================================================================
// POZIOM 2: LISTA KATEGORII
// Domyślnie czysta lista (kolor, nazwa, krótkie cechy). Edycja – po kliknięciu kategorii
// (poziom 3). Strzałki kolejności widać dopiero w trybie „Zmień kolejność”.
// =====================================================================

// „limit 900 zł · stała · oszczędność” – podpis w liście i w nagłówku szczegółów
function cechyKategorii(k) {
    const cechy = [];
    if (k.monthly_limit_gr > 0) cechy.push(`limit ${zl(k.monthly_limit_gr)}`);
    if (k.is_fixed) cechy.push('stała');
    if (czyKategoriaOszczednosciowa(k.name)) cechy.push('oszczędność');
    return cechy.join(' · ');
}

function kolorKategoriiUstawien(k) {
    return k.color || KOLORY_GRUP.Inne;
}

function wierszListyKategorii(k) {
    const id = esc(k.id);
    const cechy = cechyKategorii(k);
    return `
        <li class="break-inside-avoid border-b border-[var(--border)]">
            <button type="button" id="kat-wiersz-${id}" onclick="otworzKategorie('${id}')"
                class="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-left hover:bg-[var(--bg)] transition">
                <span class="dot !w-3 !h-3" style="background:${esc(kolorKategoriiUstawien(k))}" aria-hidden="true"></span>
                <span class="flex-1 min-w-0">
                    <span class="block text-sm truncate">${esc(k.name)}</span>
                    ${cechy ? `<span class="block text-[11px] text-[var(--muted)] truncate">${esc(cechy)}</span>` : ''}
                </span>
                <span class="text-[var(--muted)]" aria-hidden="true">›</span>
            </button>
        </li>`;
}

function wierszKolejnosciKategorii(k, i, n) {
    const id = esc(k.id);
    const nazwa = esc(k.name);
    const klasaStrzalki = 'w-9 h-9 rounded-lg text-[var(--muted)] hover:bg-[var(--bg)] disabled:opacity-30 disabled:hover:bg-transparent';
    return `
        <li class="flex items-center gap-3 py-1.5 border-b border-[var(--border)]">
            <span class="w-5 text-right text-[11px] text-[var(--muted)] kwota" aria-hidden="true">${i + 1}</span>
            <span class="dot !w-3 !h-3" style="background:${esc(kolorKategoriiUstawien(k))}" aria-hidden="true"></span>
            <span class="flex-1 min-w-0 text-sm truncate">${nazwa}</span>
            <button type="button" id="kat-gora-${id}" onclick="przesunKategorie('${id}', -1)" class="${klasaStrzalki}" ${i === 0 ? 'disabled' : ''} aria-label="Przesuń ${nazwa} wyżej">▲</button>
            <button type="button" id="kat-dol-${id}" onclick="przesunKategorie('${id}', 1)" class="${klasaStrzalki}" ${i === n - 1 ? 'disabled' : ''} aria-label="Przesuń ${nazwa} niżej">▼</button>
        </li>`;
}

function rysujKategorieUstawien() {
    const lista = document.getElementById('kat-lista');
    const formularz = document.getElementById('kat-form');
    const info = document.getElementById('kat-info');
    const opis = document.getElementById('kat-opis');
    const btnWybor = document.getElementById('btn-kat-wybor');
    const btnKolejnosc = document.getElementById('btn-kat-kolejnosc');
    document.getElementById('kat-budzet').innerText = `· ${nazwaBudzetu().toLowerCase()}`;

    if (!stan.kategorieZBazy) {
        info.innerText = '';
        opis.innerText = '';
        [formularz, btnWybor, btnKolejnosc].forEach(el => el.classList.add('hidden'));
        wstawHtml(lista, `<p class="text-xs text-[var(--c-spend)]">W bazie nie ma jeszcze tabeli kategorii, więc aplikacja używa listy startowej i nie można jej zmieniać. Uruchom w Supabase skrypt <span class="font-mono">${esc(PLIK_MIGRACJI)}</span> i odśwież dane.</p>`);
        return;
    }

    const n = stan.kategorie.length;
    const kolejnosc = stan.kolejnoscKategorii;
    const wybor = !!stan.wyborKategorii;
    info.innerText = liczbaIOdmiana(n, 'kategoria', 'kategorie', 'kategorii');
    opis.innerText = kolejnosc
        ? 'Przesuwaj strzałkami. W tej kolejności kategorie pojawiają się na listach wyboru i na Pulpicie.'
        : 'Kliknij kategorię, żeby zmienić nazwę, kolor, limit miesięczny albo to, czy jest wydatkiem stałym lub oszczędnością.';
    btnWybor.classList.toggle('hidden', wybor || kolejnosc);
    btnKolejnosc.classList.toggle('hidden', wybor || n < 2);
    btnKolejnosc.classList.toggle('is-active', kolejnosc);
    btnKolejnosc.innerText = kolejnosc ? 'Gotowe' : 'Zmień kolejność';
    formularz.classList.toggle('hidden', kolejnosc);

    const wiersze = stan.kategorie
        .map((k, i) => (kolejnosc ? wierszKolejnosciKategorii(k, i, n) : wierszListyKategorii(k)))
        .join('');
    // Na komputerze dwie kolumny czytane z góry na dół – kolejność na liście się zgadza
    wstawHtml(lista, `<ul class="${kolejnosc ? '' : 'min-[900px]:columns-2 min-[900px]:gap-x-8'}">${wiersze}</ul>`);
}

function przelaczKolejnoscKategorii() {
    stan.kolejnoscKategorii = !stan.kolejnoscKategorii;
    stan.wyborKategorii = null;
    rysujKategorieUstawien();
    rysujWyborKategorii();
    document.getElementById('btn-kat-kolejnosc').focus();
}

function kategoriaPoId(id) {
    return stan.kategorie.find(k => String(k.id) === String(id)) || null;
}

// Kolejność dla nowej kategorii: na końcu listy
function nastepnaKolejnosc() {
    return stan.kategorie.reduce((m, k) => Math.max(m, k.sort_order || 0), 0) + 10;
}

// Nazwa poprawna i niezajęta (bez wielkości liter). Zwraca komunikat błędu albo ''.
function bladNazwyKategorii(nazwa, pomijaneId = null) {
    if (!nazwa) return 'Podaj nazwę kategorii.';
    if (nazwa.length > MAKS_NAZWA_KATEGORII) return `Nazwa może mieć najwyżej ${MAKS_NAZWA_KATEGORII} znaków.`;
    if (NAZWY_ZAREZERWOWANE.some(z => normalizuj(z) === normalizuj(nazwa))) return `Nazwa „${nazwa}” jest zarezerwowana.`;
    const zajeta = stan.kategorie.find(k => String(k.id) !== String(pomijaneId) && normalizuj(k.name) === normalizuj(nazwa));
    return zajeta ? `Kategoria „${zajeta.name}” już istnieje.` : '';
}

async function dodajKategorie(e) {
    e.preventDefault();
    const pole = document.getElementById('kat-nowa');
    const nazwa = pole.value.trim();
    const blad = bladNazwyKategorii(nazwa);
    if (blad) return pokazKomunikat(blad);

    const kolory = Object.values(KOLORY_GRUP);
    const nowa = {
        ...wierszKategorii(nazwa, nastepnaKolejnosc()),
        // nazwa spoza list startowych nie ma grupy – kolor kolejny z palety, żeby się różniły
        ...(GRUPA_KATEGORII[nazwa] ? {} : { color: kolory[stan.kategorie.length % kolory.length] })
    };
    const { data, error } = await supabaseClient.from('categories').insert([nowa]).select();
    if (error) return pokazKomunikat(komunikatBledu(error, 'Nie dodano kategorii'));
    stan.kategorie.push(data && data[0] ? data[0] : nowa);
    pole.value = '';
    odswiezInterfejs();
    pokazKomunikat(`Dodano kategorię ${nazwa} – kliknij ją, żeby ustawić kolor i limit`);
}

// Kolejność na listach: zamiana z sąsiadem, potem numeracja co 10
async function przesunKategorie(id, kierunek) {
    const lista = stan.kategorie.slice();
    const i = lista.findIndex(k => String(k.id) === String(id));
    const j = i + kierunek;
    if (i < 0 || j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];

    const zmiany = [];
    lista.forEach((k, idx) => {
        const kolejnosc = (idx + 1) * 10;
        if (k.sort_order !== kolejnosc) {
            k.sort_order = kolejnosc;
            zmiany.push(supabaseClient.from('categories').update({ sort_order: kolejnosc }).eq('id', k.id));
        }
    });
    stan.kategorie = lista;
    odswiezUstawienia();
    // Kategoria doszła do brzegu listy, a jej strzałka jest teraz wyłączona – fokus na drugą strzałkę
    if (!document.getElementById('kat-lista').contains(document.activeElement)) {
        const druga = document.getElementById(`kat-${kierunek < 0 ? 'dol' : 'gora'}-${id}`);
        if (druga && !druga.disabled) druga.focus({ preventScroll: true });
    }
    const wyniki = await Promise.all(zmiany);
    if (wyniki.some(r => r.error)) pokazKomunikat('Nie zapisano kolejności – odśwież dane');
}

// =====================================================================
// POZIOM 3: SZCZEGÓŁY KATEGORII
// =====================================================================

// Wszystkie transakcje w kategorii (ręczny wybór, reguła, część podziału, zwrot)
function liczbaTransakcjiKategorii(nazwa) {
    return stan.transakcje.filter(t => pasujeDoKategorii(klasyfikuj(t), nazwa)).length;
}

// 900 -> „900”, 900.5 -> „900,50” (pole limitu w złotych)
function kwotaDoPola(grosze) {
    return grosze % 100 ? (grosze / 100).toFixed(2).replace('.', ',') : String(grosze / 100);
}

function rysujSzczegolyKategorii() {
    const k = kategoriaPoId(stan.ustawieniaKategoria);
    if (!k) return;
    const id = esc(k.id);
    const nazwa = esc(k.name);
    const kolor = kolorKategoriiUstawien(k).toLowerCase();
    const cechy = cechyKategorii(k);
    const { transakcje: reczne, reguly } = powiazaniaKategorii(k.name);
    const wszystkie = liczbaTransakcjiKategorii(k.name);

    const probki = Object.entries(KOLORY_GRUP).map(([grupa, hex]) => {
        const wybrany = hex.toLowerCase() === kolor;
        return `<button type="button" id="kat-kolor-${esc(grupa)}" onclick="zmienPoleKategorii('${id}', 'color', '${esc(hex)}')"
            class="w-8 h-8 rounded-full ${wybrany ? 'ring-2 ring-offset-2 ring-[var(--fg)] ring-offset-[var(--surface)]' : ''}"
            style="background:${esc(hex)}" title="${esc(grupa)}" aria-label="Kolor: ${esc(grupa)}" aria-pressed="${wybrany}"></button>`;
    }).join('');

    const uzycie = [`${liczbaIOdmiana(wszystkie, 'transakcja', 'transakcje', 'transakcji')} w tej kategorii`];
    if (reczne) uzycie.push(`${reczne} ${odmiana(reczne, 'wybrana', 'wybrane', 'wybranych')} ręcznie`);
    uzycie.push(liczbaIOdmiana(reguly, 'reguła', 'reguły', 'reguł'));

    wstawHtml(document.getElementById('kat-szczegoly'), `
        <div class="flex items-center gap-3">
            <span class="w-11 h-11 rounded-xl shrink-0" style="background:${esc(kolor)}" aria-hidden="true"></span>
            <div class="min-w-0">
                <h2 class="font-semibold text-base truncate">${nazwa}</h2>
                <p class="text-[11px] text-[var(--muted)]">${esc(cechy || 'zwykły wydatek, bez limitu')}</p>
            </div>
        </div>

        <div>
            <label for="kat-szcz-nazwa" class="field-label">Nazwa</label>
            <input type="text" id="kat-szcz-nazwa" value="${nazwa}" maxlength="${MAKS_NAZWA_KATEGORII}" onchange="zmienNazweKategorii('${id}', this)"
                class="input" aria-describedby="kat-szcz-nazwa-opis">
            <p id="kat-szcz-nazwa-opis" class="text-[10px] text-[var(--muted)] mt-1">Nowa nazwa przejdzie też na transakcje i reguły z tą kategorią.</p>
        </div>

        <fieldset>
            <legend class="field-label">Kolor</legend>
            <div class="flex flex-wrap items-center gap-3">
                ${probki}
                <label class="flex items-center gap-1.5 text-[11px] text-[var(--muted)] cursor-pointer">
                    <input type="color" id="kat-szcz-kolor" value="${esc(kolor)}" onchange="zmienPoleKategorii('${id}', 'color', this.value)"
                        class="w-8 h-8 rounded-lg border border-[var(--border)] bg-transparent cursor-pointer">
                    własny
                </label>
            </div>
        </fieldset>

        <div>
            <label for="kat-szcz-limit" class="field-label">Limit miesięczny</label>
            <div class="flex items-center gap-2">
                <input type="text" inputmode="decimal" id="kat-szcz-limit" value="${k.monthly_limit_gr > 0 ? esc(kwotaDoPola(k.monthly_limit_gr)) : ''}"
                    placeholder="bez limitu" onchange="zmienLimitKategorii('${id}', this)" class="input !w-36 text-right kwota" aria-describedby="kat-szcz-limit-opis">
                <span class="text-xs">zł</span>
            </div>
            <p id="kat-szcz-limit-opis" class="text-[10px] text-[var(--muted)] mt-1">Pasek wykorzystania limitu pojawi się pod kategorią na Pulpicie. Puste pole = bez limitu.</p>
        </div>

        <div class="space-y-3 border-t border-[var(--border)] pt-3">
            <label class="flex items-start justify-between gap-3 text-xs cursor-pointer">
                <span>
                    <span class="font-semibold block">Wydatek stały</span>
                    <span class="text-[10px] text-[var(--muted)]">Co miesiąc podobna kwota, np. czynsz. Statystyki pokazują go w „w tym stałe” i pomijają w „Trendzie kategorii”.</span>
                </span>
                <input type="checkbox" id="kat-szcz-stala" role="switch" class="switch" ${k.is_fixed ? 'checked' : ''}
                    onchange="zmienPoleKategorii('${id}', 'is_fixed', this.checked)">
            </label>
            <label class="flex items-start justify-between gap-3 text-xs cursor-pointer">
                <span>
                    <span class="font-semibold block">Oszczędność, nie wydatek</span>
                    <span class="text-[10px] text-[var(--muted)]">Płatności w tej kategorii (np. akcje, obligacje) liczą się do odłożonych pieniędzy i stopy oszczędności, a nie do wydatków.</span>
                </span>
                <input type="checkbox" id="kat-szcz-oszcz" role="switch" class="switch" ${czyKategoriaOszczednosciowa(k.name) ? 'checked' : ''}
                    onchange="zmienPoleKategorii('${id}', 'is_saving', this.checked)">
            </label>
        </div>

        <div class="space-y-1.5 border-t border-[var(--border)] pt-3">
            <h3 class="field-label !mb-0">Użycie</h3>
            <p class="text-xs">${esc(uzycie.join(' · '))}</p>
            <div class="flex flex-wrap gap-4">
                ${wszystkie ? `<button type="button" data-kat="${nazwa}" onclick="pokazTransakcjeZUstawien(this.dataset.kat)" class="text-xs font-semibold text-[var(--accent)]">Pokaż transakcje ›</button>` : ''}
                ${reguly ? `<button type="button" data-kat="${nazwa}" onclick="pokazRegulyKategorii(this.dataset.kat)" class="text-xs font-semibold text-[var(--accent)]">Pokaż reguły ›</button>` : ''}
            </div>
        </div>

        <div class="border-t border-[var(--border)] pt-3">${sekcjaUsuwaniaKategorii(k, reczne, reguly)}</div>`);
}

function sekcjaUsuwaniaKategorii(k, reczne, reguly) {
    const id = esc(k.id);
    if (reczne || reguly) {
        return `<p class="text-[11px] text-[var(--muted)]">Tej kategorii nie można usunąć – używa jej ${esc(opisPowiazan(reczne, reguly))}. Możesz za to zmienić jej nazwę.</p>`;
    }
    if (String(stan.kategoriaDoUsuniecia) === String(k.id)) {
        return `
            <div class="flex flex-wrap items-center justify-between gap-2 text-xs" role="alert">
                <span>Usunąć kategorię <strong>${esc(k.name)}</strong>?</span>
                <span class="flex gap-2">
                    <button type="button" id="kat-usun-tak" onclick="usunKategorie('${id}')" class="chip !bg-[var(--c-spend)] !text-white">Usuń</button>
                    <button type="button" id="kat-usun-nie" onclick="anulujUsuwanieKategorii()" class="chip">Anuluj</button>
                </span>
            </div>`;
    }
    return `<button type="button" id="kat-usun" onclick="pytajOUsuniecieKategorii('${id}')" class="text-xs font-semibold text-[var(--c-spend)]">Usuń kategorię</button>`;
}

// Skrót: transakcje tej kategorii ze wszystkich miesięcy
function pokazTransakcjeZUstawien(nazwa) {
    zmienZakladke('transakcje', { kategoria: nazwa, miesiac: null });
}

// Skrót: reguły tej kategorii – „‹” wraca do szczegółów kategorii
function pokazRegulyKategorii(nazwa) {
    otworzStroneUstawien('reguly', {
        filtrReguly: nazwa,
        powrot: { strona: 'kategoria', kategoria: stan.ustawieniaKategoria }
    });
}

async function zmienPoleKategorii(id, pole, wartosc) {
    const k = kategoriaPoId(id);
    if (!k) return;
    const { error } = await supabaseClient.from('categories').update({ [pole]: wartosc }).eq('id', id);
    if (error) {
        pokazKomunikat(komunikatBledu(error, 'Nie zapisano kategorii'));
        return odswiezUstawienia();
    }
    k[pole] = wartosc;
    odswiezInterfejs();
}

async function zmienLimitKategorii(id, pole) {
    const k = kategoriaPoId(id);
    if (!k) return;
    const tekst = pole.value.replace(/[\s ]/g, '').replace(',', '.');
    if (tekst !== '' && !/^\d+(\.\d{0,2})?$/.test(tekst)) {
        pokazKomunikat('Limit podaj w złotych, np. 900. Puste pole = bez limitu.');
        pole.value = k.monthly_limit_gr > 0 ? kwotaDoPola(k.monthly_limit_gr) : '';
        return;
    }
    const grosze = tekst === '' ? null : Math.round(parseFloat(tekst) * 100);
    await zmienPoleKategorii(id, 'monthly_limit_gr', grosze > 0 ? grosze : null);
    pokazKomunikat(grosze > 0 ? `Limit: ${zl(grosze)} miesięcznie` : 'Usunięto limit');
}

// Zmiana nazwy: kategoria, ręczne wybory w transakcjach, reguły i podziały – wszędzie nowa nazwa
async function zmienNazweKategorii(id, pole) {
    const k = kategoriaPoId(id);
    if (!k) return;
    const stara = k.name;
    const nowa = pole.value.trim();
    if (nowa === stara) return;
    const blad = bladNazwyKategorii(nowa, id);
    if (blad) {
        pokazKomunikat(blad);
        pole.value = stara;
        return;
    }

    const { error } = await supabaseClient.from('categories').update({ name: nowa }).eq('id', id);
    if (error) {
        pokazKomunikat(komunikatBledu(error, 'Nie zmieniono nazwy'));
        pole.value = stara;
        return;
    }

    const zPodzialem = stan.transakcje.filter(t => Array.isArray(t.splits) && t.splits.some(c => c.category === stara));
    const wyniki = await Promise.all([
        supabaseClient.from('transakcje').update({ category_manual: nowa }).eq('category_manual', stara),
        supabaseClient.from('rules').update({ category: nowa }).eq('category', stara),
        ...zPodzialem.map(t => supabaseClient.from('transakcje')
            .update({ splits: t.splits.map(c => (c.category === stara ? { ...c, category: nowa } : c)) })
            .eq('id', t.id))
    ]);
    const blednych = wyniki.filter(r => r.error).length;
    if (stan.statKategoria === stara) stan.statKategoria = nowa;

    await pobierzDane();
    pokazKomunikat(blednych
        ? `Zmieniono nazwę, ale ${blednych} ${odmiana(blednych, 'zapis się nie udał', 'zapisy się nie udały', 'zapisów się nie udało')} – odśwież i sprawdź transakcje`
        : `Zmieniono nazwę: ${stara} → ${nowa}`);
}

// Powiązania kategorii (11.1): ręczne wybory w transakcjach (też w podziałach) i reguły
function powiazaniaKategorii(nazwa) {
    const transakcje = stan.transakcje.filter(t =>
        t.category_manual === nazwa || (Array.isArray(t.splits) && t.splits.some(c => c.category === nazwa))).length;
    const reguly = dynamiczneReguly.filter(r => (r.category || r.category_name) === nazwa).length;
    return { transakcje, reguly };
}

function czyKategoriaUzywana(nazwa) {
    const { transakcje, reguly } = powiazaniaKategorii(nazwa);
    return transakcje + reguly > 0;
}

// „3 transakcje z ręcznym wyborem i 2 reguły”
function opisPowiazan(transakcje, reguly) {
    const czesci = [];
    if (transakcje) czesci.push(`${liczbaIOdmiana(transakcje, 'transakcja', 'transakcje', 'transakcji')} z ręcznym wyborem`);
    if (reguly) czesci.push(liczbaIOdmiana(reguly, 'reguła', 'reguły', 'reguł'));
    return czesci.join(' i ');
}

function pytajOUsuniecieKategorii(id) {
    const k = kategoriaPoId(id);
    if (!k) return;
    const { transakcje, reguly } = powiazaniaKategorii(k.name);
    if (transakcje || reguly) {
        pokazKomunikat(`Nie można usunąć „${k.name}”: używa jej ${opisPowiazan(transakcje, reguly)}`);
        return;
    }
    stan.kategoriaDoUsuniecia = k.id;
    odswiezUstawienia();
    const anuluj = document.getElementById('kat-usun-nie');
    if (anuluj) anuluj.focus();
}

function anulujUsuwanieKategorii() {
    stan.kategoriaDoUsuniecia = null;
    odswiezUstawienia();
    const usun = document.getElementById('kat-usun');
    if (usun) usun.focus();
}

async function usunKategorie(id) {
    const k = kategoriaPoId(id);
    stan.kategoriaDoUsuniecia = null;
    if (!k) return odswiezUstawienia();
    const { error } = await supabaseClient.from('categories').delete().eq('id', id);
    if (error) {
        pokazKomunikat(komunikatBledu(error, 'Nie usunięto kategorii'));
        return odswiezUstawienia();
    }
    stan.kategorie = stan.kategorie.filter(x => x !== k);
    // Ze szczegółów usuniętej kategorii wracamy do listy
    const zeSzczegolow = stan.ustawieniaStrona === 'kategoria' && String(stan.ustawieniaKategoria) === String(id);
    if (zeSzczegolow) Object.assign(stan, { ustawieniaStrona: 'kategorie', ustawieniaKategoria: null });
    odswiezInterfejs();
    if (zeSzczegolow) ustawFokusStrony();
    pokazKomunikat(`Usunięto kategorię ${k.name}`);
}

// =====================================================================
// WYBÓR KATEGORII Z LISTY
// Szybkie skrócenie lub uzupełnienie listy: propozycje obu budżetów + własne kategorie,
// zaznaczone = zostają / zostaną dodane. Kategorii w użyciu nie da się odznaczyć.
// =====================================================================

// Propozycje: najpierw lista startowa otwartego budżetu, potem drugiego, potem własne
function kandydaciKategorii() {
    const drugi = stan.budzet === 'osobisty' ? 'wspolny' : 'osobisty';
    return [...new Set([
        ...nazwyKategoriiDomyslnych(stan.budzet),
        ...nazwyKategoriiDomyslnych(drugi),
        ...stan.kategorie.map(k => k.name)
    ])];
}

function otworzWyborKategorii() {
    stan.wyborKategorii = new Set(stan.kategorie.map(k => k.name));
    stan.kolejnoscKategorii = false;
    rysujKategorieUstawien();
    rysujWyborKategorii();
    ustawFokusStrony('kat-wybor-tytul');
}

function zamknijWyborKategorii() {
    stan.wyborKategorii = null;
    rysujKategorieUstawien();
    rysujWyborKategorii();
    document.getElementById('btn-kat-wybor').focus();
}

function przelaczWyborKategorii(nazwa, zaznaczona) {
    if (!stan.wyborKategorii) return;
    if (zaznaczona) stan.wyborKategorii.add(nazwa);
    else stan.wyborKategorii.delete(nazwa);
    odswiezPodsumowanieWyboru();
}

// „Tylko podstawowe”: lista startowa tego budżetu + kategorie w użyciu
function wybierzZestawPodstawowy() {
    stan.wyborKategorii = new Set([
        ...nazwyKategoriiDomyslnych(stan.budzet),
        ...stan.kategorie.map(k => k.name).filter(czyKategoriaUzywana)
    ]);
    rysujWyborKategorii();
}

function zmianyWyboruKategorii() {
    const wybrane = stan.wyborKategorii || new Set();
    const istniejace = new Set(stan.kategorie.map(k => k.name));
    return {
        doDodania: kandydaciKategorii().filter(n => wybrane.has(n) && !istniejace.has(n)),
        doUsuniecia: stan.kategorie.filter(k => !wybrane.has(k.name) && !czyKategoriaUzywana(k.name))
    };
}

function odswiezPodsumowanieWyboru() {
    const { doDodania, doUsuniecia } = zmianyWyboruKategorii();
    const czesci = [];
    if (doDodania.length) czesci.push(`dodasz ${doDodania.length}`);
    if (doUsuniecia.length) czesci.push(`usuniesz ${doUsuniecia.length}`);
    const brakZmian = czesci.length === 0;
    document.getElementById('kat-wybor-podsumowanie').innerText = brakZmian
        ? 'Bez zmian.'
        : `Po zapisaniu: ${czesci.join(', ')} · na liście zostanie ${stan.wyborKategorii.size}.`;
    document.getElementById('btn-kat-wybor-zapisz').disabled = brakZmian;
}

function rysujWyborKategorii() {
    const panel = document.getElementById('kat-wybor');
    panel.classList.toggle('hidden', !stan.wyborKategorii);
    if (!stan.wyborKategorii) {
        panel.innerHTML = '';
        return;
    }
    const pozycje = kandydaciKategorii().map(nazwa => {
        const uzywana = czyKategoriaUzywana(nazwa);
        const zaznaczona = uzywana || stan.wyborKategorii.has(nazwa);
        return `
            <label class="flex items-center gap-2 py-1 text-xs ${uzywana ? 'text-[var(--muted)]' : 'cursor-pointer'}">
                <input type="checkbox" class="accent-[var(--accent)] w-4 h-4 shrink-0" data-kat="${esc(nazwa)}"
                    ${zaznaczona ? 'checked' : ''} ${uzywana ? 'disabled' : ''}
                    onchange="przelaczWyborKategorii(this.dataset.kat, this.checked)">
                <span class="dot" style="background:${esc(kolorKategorii(nazwa))}" aria-hidden="true"></span>
                <span class="truncate">${esc(nazwa)}${uzywana ? ' <span class="text-[10px]">(w użyciu)</span>' : ''}</span>
            </label>`;
    }).join('');

    panel.innerHTML = `
        <div class="flex justify-between items-baseline gap-2 flex-wrap">
            <h3 id="kat-wybor-tytul" class="text-xs font-semibold">Zaznacz kategorie, których chcesz używać w: ${esc(nazwaBudzetu().toLowerCase())}</h3>
            <button type="button" onclick="wybierzZestawPodstawowy()" class="text-[11px] text-[var(--accent)] font-semibold underline">Tylko podstawowe</button>
        </div>
        <fieldset class="grid grid-cols-1 min-[480px]:grid-cols-2 min-[1100px]:grid-cols-3 gap-x-4">
            <legend class="sr-only">Kategorie budżetu</legend>
            <label class="flex items-center gap-2 py-1 text-xs text-[var(--muted)]">
                <input type="checkbox" class="accent-[var(--accent)] w-4 h-4 shrink-0" checked disabled>
                <span class="dot bg-[var(--muted)]" aria-hidden="true"></span>
                <span class="truncate">${esc(POMIN)} <span class="text-[10px]">(zawsze dostępna – transakcja nie wchodzi do sum)</span></span>
            </label>
            ${pozycje}
        </fieldset>
        <p class="text-[10px] text-[var(--muted)]">Kategorii „w użyciu” (ręcznie wybranych w transakcjach albo w regułach) nie można odznaczyć, ale <strong>nazwę każdej kategorii, także używanej, zmienisz po kliknięciu jej na liście</strong> – nowa nazwa przejdzie na transakcje i reguły. Odznaczone, nieużywane kategorie zostaną usunięte – zawsze możesz je tu dodać z powrotem.</p>
        <p id="kat-wybor-podsumowanie" class="text-xs font-semibold" aria-live="polite"></p>
        <div class="flex gap-2 flex-wrap">
            <button type="button" id="btn-kat-wybor-zapisz" onclick="zapiszWyborKategorii()" class="btn-primary !w-auto px-6">Zapisz listę</button>
            <button type="button" onclick="zamknijWyborKategorii()" class="btn-secondary">Anuluj</button>
        </div>`;
    odswiezPodsumowanieWyboru();
}

async function zapiszWyborKategorii() {
    const { doDodania, doUsuniecia } = zmianyWyboruKategorii();
    if (!doDodania.length && !doUsuniecia.length) return;
    document.getElementById('btn-kat-wybor-zapisz').disabled = true;

    const start = nastepnaKolejnosc();
    const zapytania = [];
    if (doDodania.length) {
        zapytania.push(supabaseClient.from('categories').insert(doDodania.map((n, i) => wierszKategorii(n, start + i * 10))));
    }
    if (doUsuniecia.length) {
        zapytania.push(supabaseClient.from('categories').delete().in('id', doUsuniecia.map(k => k.id)));
    }
    const wyniki = await Promise.all(zapytania);
    const blad = wyniki.find(r => r.error);

    stan.wyborKategorii = null;
    await pobierzDane();
    pokazKomunikat(blad
        ? komunikatBledu(blad.error, 'Nie wszystkie zmiany kategorii się zapisały')
        : `Lista kategorii zapisana: +${doDodania.length} / −${doUsuniecia.length}`);
}

// =====================================================================
// BUDŻET OSOBISTY: PRZELEWY NA KONTO WSPÓLNE
// Zapisywane jako reguła rachunku w regułach budżetu osobistego:
// phrase = numer konta wspólnego, category = „Przelew na wspólne” (patrz pasujeRegula w rules.js).
// =====================================================================

function czyKontoWspolneDostepne() {
    return stan.budzet === 'osobisty' && stan.kategorieZBazy;
}

function regulaKontaWspolnego() {
    return dynamiczneReguly.find(r => czyRegulaRachunku(r.phrase || '') && r.category === KATEGORIA_PRZELEW_WSPOLNE) || null;
}

function przelewyNaKonto(numer) {
    return stan.transakcje.filter(t => t.amount_gr < 0 && numer && czystyNumer(t.account_number).includes(numer));
}

function rysujKontoWspolne() {
    const regula = regulaKontaWspolnego();
    const pole = document.getElementById('ust-konto-wspolne');
    if (document.activeElement !== pole) pole.value = regula ? regula.phrase : '';
    const ile = regula ? przelewyNaKonto(regula.phrase).length : 0;
    document.getElementById('ust-konto-wspolne-info').innerText = regula
        ? `Zaimportowane przelewy na to konto: ${ile}. Pole puste + „Zapisz” wyłącza regułę.`
        : 'Numer konta wspólnego znajdziesz w bankowości, w której prowadzicie wspólny rachunek.';
}

// Kategoria o podanej nazwie w otwartym budżecie – dodaje ją, gdy jej brak
async function zapewnijKategorie(nazwa) {
    if (kategoriaPoNazwie(nazwa)) return true;
    const { data, error } = await supabaseClient.from('categories').insert([wierszKategorii(nazwa, nastepnaKolejnosc())]).select();
    if (error) {
        pokazKomunikat(komunikatBledu(error, `Nie dodano kategorii ${nazwa}`));
        return false;
    }
    if (data && data[0]) stan.kategorie.push(data[0]);
    return true;
}

async function zapiszKontoWspolne(e) {
    e.preventDefault();
    if (stan.budzet !== 'osobisty') return;
    const numer = czystyNumer(document.getElementById('ust-konto-wspolne').value).replace(/^PL/, '');
    const regula = regulaKontaWspolnego();

    if (!numer) {
        if (!regula) return;
        const { error } = await supabaseClient.from('rules').delete().eq('id', regula.id);
        if (error) return pokazKomunikat(komunikatBledu(error, 'Nie usunięto reguły'));
        await pobierzDane();
        return pokazKomunikat('Wyłączono automatyczne „Przelew na wspólne”');
    }
    if (!/^\d{26}$/.test(numer)) return pokazKomunikat('Podaj 26 cyfr numeru konta (bez „PL”).');
    if (!(await zapewnijKategorie(KATEGORIA_PRZELEW_WSPOLNE))) return;

    const { error } = regula
        ? await supabaseClient.from('rules').update({ phrase: numer }).eq('id', regula.id)
        : await supabaseClient.from('rules').insert([{ phrase: numer, category: KATEGORIA_PRZELEW_WSPOLNE }]);
    if (error) return pokazKomunikat(komunikatBledu(error, 'Nie zapisano reguły'));

    await pobierzDane();
    const ile = przelewyNaKonto(numer).length;
    pokazKomunikat(`Zapisano: przelewy na konto wspólne → ${KATEGORIA_PRZELEW_WSPOLNE}` + (ile ? ` (${ile} już zaimportowanych)` : ''));
}

// =====================================================================
// LISTA REGUŁ (otwartego budżetu)
// Reguła = fraza → kategoria (wydatek, którego kontrahent lub tytuł zawiera wszystkie słowa
// frazy) albo numer konta → kategoria (rachunek drugiej strony). Przy kilku pasujących
// wygrywa reguła numeru konta, potem najnowsza (rules.js).
// =====================================================================

const MIN_DLUGOSC_FRAZY = 3;

function regulaPoId(id) {
    return dynamiczneReguly.find(r => String(r.id) === String(id)) || null;
}

function opcjeKategoriiReguly(wybrana) {
    const nazwy = stan.kategorie.map(k => k.name);
    const brakujaca = wybrana && !nazwy.includes(wybrana)
        ? `<option value="${esc(wybrana)}" selected>${esc(wybrana)} (brak takiej kategorii)</option>` : '';
    return brakujaca + nazwy.map(n => `<option value="${esc(n)}" ${n === wybrana ? 'selected' : ''}>${esc(n)}</option>`).join('');
}

// Fraza poprawna i niezajęta. Zwraca komunikat błędu albo ''.
function bladFrazyReguly(fraza, pomijaneId = null) {
    if (normalizuj(fraza).replace(/\s+/g, '').length < MIN_DLUGOSC_FRAZY) return `Fraza musi mieć co najmniej ${MIN_DLUGOSC_FRAZY} znaki.`;
    const zajeta = dynamiczneReguly.find(r => String(r.id) !== String(pomijaneId) &&
        normalizuj(czyRegulaRachunku(r.phrase) ? czystyNumer(r.phrase) : r.phrase) ===
        normalizuj(czyRegulaRachunku(fraza) ? czystyNumer(fraza) : fraza));
    return zajeta ? `Reguła „${zajeta.phrase}” już istnieje (→ ${zajeta.category}).` : '';
}

function rysujRegulyUstawien() {
    const lista = document.getElementById('reg-lista');
    const szukaj = normalizuj(document.getElementById('reg-filtr').value.trim());
    const trafienia = trafieniaRegul();
    document.getElementById('reg-budzet').innerText = `· ${nazwaBudzetu().toLowerCase()}`;
    document.getElementById('reg-info').innerText =
        `${dynamiczneReguly.length} ${odmiana(dynamiczneReguly.length, 'reguła', 'reguły', 'reguł')}`;

    const nowaKat = document.getElementById('reg-nowa-kat');
    const wybranaNowa = nowaKat.value;
    nowaKat.innerHTML = `<option value="">Kategoria…</option>` + opcjeKategoriiReguly(null);
    if (stan.kategorie.some(k => k.name === wybranaNowa)) nowaKat.value = wybranaNowa;

    const widoczne = dynamiczneReguly.filter(r => !szukaj ||
        normalizuj(r.phrase).includes(szukaj) || normalizuj(r.category).includes(szukaj));
    if (widoczne.length === 0) {
        lista.innerHTML = `<p class="text-xs text-[var(--muted)] py-2">${dynamiczneReguly.length
            ? 'Żadna reguła nie pasuje do wyszukiwania.'
            : 'Nie ma jeszcze reguł. Powstają same, gdy wybierasz kategorię z włączonym „Zapamiętaj dla podobnych”, albo dodaj je poniżej.'}</p>`;
        return;
    }

    lista.innerHTML = widoczne.map(r => {
        const id = esc(r.id);
        const rachunek = czyRegulaRachunku(r.phrase);
        const n = trafienia[r.id] || 0;
        return `
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5 py-2 border-b border-[var(--border)] text-xs">
                <input type="text" value="${esc(r.phrase)}" maxlength="60" onchange="zmienFrazeReguly('${id}', this)"
                    class="input !py-1.5 flex-1 min-w-[8rem] ${rachunek ? 'kwota' : ''}" aria-label="Fraza reguły ${esc(r.phrase)}">
                <span class="text-[var(--muted)]" aria-hidden="true">→</span>
                <select onchange="zmienKategorieReguly('${id}', this.value)" class="input !py-1.5 !w-auto max-w-[13rem]" aria-label="Kategoria reguły ${esc(r.phrase)}">
                    ${opcjeKategoriiReguly(r.category)}
                </select>
                <span class="text-[10px] text-[var(--muted)] whitespace-nowrap ml-auto" title="Transakcje, którym ta reguła nadaje kategorię">
                    ${rachunek ? 'numer konta · ' : ''}${n} ${odmiana(n, 'transakcja', 'transakcje', 'transakcji')}
                </span>
                <button type="button" onclick="usunRegule('${id}')" class="p-1 text-[var(--muted)] hover:text-[var(--c-spend)]" aria-label="Usuń regułę ${esc(r.phrase)}">✕</button>
            </div>`;
    }).join('');
}

async function zmienFrazeReguly(id, pole) {
    const r = regulaPoId(id);
    if (!r) return;
    const fraza = pole.value.trim();
    if (fraza === r.phrase) return;
    const blad = bladFrazyReguly(fraza, id);
    if (blad) {
        pokazKomunikat(blad);
        pole.value = r.phrase;
        return;
    }
    const zapis = czyRegulaRachunku(fraza) ? czystyNumer(fraza) : fraza.toUpperCase();
    const { error } = await supabaseClient.from('rules').update({ phrase: zapis }).eq('id', id);
    if (error) {
        pokazKomunikat(komunikatBledu(error, 'Nie zapisano reguły'));
        pole.value = r.phrase;
        return;
    }
    r.phrase = zapis;
    odswiezInterfejs();
    pokazKomunikat(`Reguła: ${zapis} → ${r.category}`);
}

async function zmienKategorieReguly(id, kategoria) {
    const r = regulaPoId(id);
    if (!r || !kategoria || kategoria === r.category) return;
    const { error } = await supabaseClient.from('rules').update({ category: kategoria }).eq('id', id);
    if (error) {
        pokazKomunikat(komunikatBledu(error, 'Nie zapisano reguły'));
        return rysujRegulyUstawien();
    }
    r.category = kategoria;
    odswiezInterfejs();
    pokazKomunikat(`Reguła: ${r.phrase} → ${kategoria}`);
}

async function usunRegule(id) {
    const r = regulaPoId(id);
    if (!r) return;
    const { error } = await supabaseClient.from('rules').delete().eq('id', id);
    if (error) return pokazKomunikat(komunikatBledu(error, 'Nie usunięto reguły'));
    dynamiczneReguly = dynamiczneReguly.filter(x => x !== r);
    odswiezInterfejs();
    pokazKomunikat(`Usunięto regułę ${r.phrase}`);
}

async function dodajRegule(e) {
    e.preventDefault();
    const poleFrazy = document.getElementById('reg-nowa-fraza');
    const fraza = poleFrazy.value.trim();
    const kategoria = document.getElementById('reg-nowa-kat').value;
    const blad = bladFrazyReguly(fraza) || (kategoria ? '' : 'Wybierz kategorię reguły.');
    if (blad) return pokazKomunikat(blad);

    const zapis = czyRegulaRachunku(fraza) ? czystyNumer(fraza) : fraza.toUpperCase();
    const { data, error } = await supabaseClient.from('rules').insert([{ phrase: zapis, category: kategoria }]).select();
    if (error) return pokazKomunikat(komunikatBledu(error, 'Nie dodano reguły'));
    dynamiczneReguly.unshift(data && data[0] ? data[0] : { id: `tmp-${Date.now()}`, phrase: zapis, category: kategoria });
    poleFrazy.value = '';
    odswiezInterfejs();
    const n = trafieniaRegul()[dynamiczneReguly[0].id] || 0;
    pokazKomunikat(`Dodano regułę ${zapis} → ${kategoria}` + (n ? ` (${n} ${odmiana(n, 'transakcja', 'transakcje', 'transakcji')})` : ''));
}

// ---- Eksport do Excela (CSV) -----------------------------------------

// Pole CSV: średnik jako separator (polski Excel), cudzysłowy podwajane.
// Tekst zaczynający się od = + @ dostaje apostrof, żeby Excel nie uznał go za formułę.
function poleCSV(wartosc, tekstowe = true) {
    let s = String(wartosc ?? '');
    if (tekstowe && /^[=+@\t\r]/.test(s)) s = "'" + s;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Typ do eksportu: wydatek w kategorii oszczędnościowej = oszczędności, wpływ z kategorią = zwrot
function typDoEksportu(k) {
    if (czyWydatekOszczednosciowy(k)) return NAZWY_TYPOW.wplata;
    if (k.typ === 'przychod' && k.kategoria) {
        return czyKategoriaOszczednosciowa(k.kategoria) ? NAZWY_TYPOW.wyplataOszczednosci : NAZWY_TYPOW.zwrot;
    }
    return NAZWY_TYPOW[k.typ] || k.typ;
}

function kategoriaLubCel(k) {
    if (k.typ === 'wydatek') return k.kategoria || 'Bez kategorii';
    if (k.typ === 'wplata' || k.typ === 'wyplata') return k.cel ? k.cel.name : '';
    if (k.typ === 'przychod') return k.kategoria || '';
    return '';
}

function eksportujCSV() {
    const okres = document.getElementById('ust-eksport-okres').value;
    const lista = stan.transakcje
        .filter(t => !okres || t.booked_on.startsWith(okres))
        .slice()
        .sort((a, b) => a.booked_on.localeCompare(b.booked_on));

    if (lista.length === 0) {
        pokazKomunikat('Brak transakcji do eksportu');
        return;
    }

    // Kolumny A–F: Data, Kontrahent, Tytuł, Kwota, Typ, Kategoria / cel
    const wiersze = [['Data', 'Kontrahent', 'Tytuł', 'Kwota', 'Typ', 'Kategoria / cel'].join(';')];
    for (const t of lista) {
        const k = klasyfikuj(t);
        // Podzielony wydatek: jeden wiersz na część, żeby sumy kategorii w Excelu się zgadzały
        const czesci = k.podzial
            ? k.podzial.map((c, i) => ({
                tytul: `${t.title || ''} [część ${i + 1}/${k.podzial.length}]`,
                kwota: c.amount_gr,
                typ: c.category === POMIN ? NAZWY_TYPOW.pominiete
                    : czyKategoriaOszczednosciowa(c.category) ? NAZWY_TYPOW.wplata : NAZWY_TYPOW.wydatek,
                kategoria: c.category === POMIN ? '' : c.category
            }))
            : [{ tytul: t.title, kwota: t.amount_gr, typ: typDoEksportu(k), kategoria: kategoriaLubCel(k) }];
        for (const c of czesci) {
            wiersze.push([
                poleCSV(t.booked_on),
                poleCSV(t.counterparty),
                poleCSV(c.tytul),
                poleCSV((c.kwota / 100).toFixed(2).replace('.', ','), false),
                poleCSV(c.typ),
                poleCSV(c.kategoria)
            ].join(';'));
        }
    }

    // BOM – Excel rozpozna UTF-8 i pokaże polskie znaki
    const nazwa = `budzet-${stan.budzet}-transakcje-${okres || 'wszystkie'}.csv`;
    pobierzPlik(nazwa, '﻿' + wiersze.join('\r\n'), 'text/csv;charset=utf-8');
    pokazKomunikat(`Wyeksportowano ${lista.length} transakcji`);
}
