// =====================================================================
// EKRAN: USTAWIENIA (zębatka w nagłówku)
// Specyfikacja: 11.3 (kopia zapasowa, eksport do Excela), 9.1 (docelowa stopa
// oszczędności), 3 „categories” i 11.1 (kategorie: kolor, limit, stała, usuwanie).
// Wszystko na tym ekranie dotyczy otwartego budżetu (wspólnego albo osobistego):
// kategorie, reguły, kopia i eksport. „Wczytaj kopię” – osobny, kolejny etap.
// =====================================================================

const WERSJA_KOPII = 2;
const TABELE_KOPII = [
    { nazwa: 'transakcje', sort: 'booked_on' },
    { nazwa: 'rules', sort: null },
    { nazwa: 'goals', sort: null },
    { nazwa: 'categories', sort: 'sort_order', opcjonalna: true },
    { nazwa: 'imports', sort: 'imported_at', opcjonalna: true }
];

const NAZWY_TYPOW = {
    przychod: 'Przychód',
    wydatek: 'Wydatek',
    wplata: 'Oszczędności',
    wyplata: 'Wypłata z celu',
    pominiete: 'Pominięte'
};

// Nazwy zarezerwowane: „Pomiń” jest systemowa, pozostałe to etykiety brakującej kategorii
const NAZWY_ZAREZERWOWANE = [POMIN, 'Nieprzypisane', 'Bez kategorii'];
const MAKS_NAZWA_KATEGORII = 40;

function wrocZUstawien() {
    zmienZakladke(stan.poprzedniaZakladka || 'pulpit');
}

function odswiezUstawienia() {
    document.getElementById('ust-wroc-nazwa').innerText = TYTULY_ZAKLADEK[stan.poprzedniaZakladka] || 'Pulpit';
    document.getElementById('stat-cel-stopy').value = docelowaStopa();
    document.getElementById('ust-zapamietaj').checked = zapamietujPodobne();

    document.getElementById('ust-kopia-info').innerText =
        `${nazwaBudzetu()} w chmurze: ${stan.transakcje.length} transakcji, ${dynamiczneReguly.length} reguł, ${stan.cele.length} celów, ${stan.kategorie.length} kategorii.`;

    // Okres eksportu: wszystkie albo jeden miesiąc (najnowszy pierwszy)
    const select = document.getElementById('ust-eksport-okres');
    const poprzedni = select.value;
    const miesiace = Array.from(new Set(stan.transakcje.map(t => t.booked_on.substring(0, 7)))).sort().reverse();
    select.innerHTML = `<option value="">Wszystkie transakcje</option>` +
        miesiace.map(m => `<option value="${esc(m)}">${esc(nazwaMiesiaca(m))}</option>`).join('');
    if (miesiace.includes(poprzedni)) select.value = poprzedni;

    rysujKontoWspolne();
    rysujKategorieUstawien();
    rysujWyborKategorii();

    const konto = document.getElementById('ust-konto');
    supabaseClient.auth.getUser()
        .then(({ data }) => { konto.innerText = data && data.user ? `Zalogowano jako ${data.user.email}` : ''; })
        .catch(() => { konto.innerText = ''; });
}

// =====================================================================
// KATEGORIE
// =====================================================================

function rysujKategorieUstawien() {
    const lista = document.getElementById('kat-lista');
    const formularz = document.getElementById('kat-form');
    const info = document.getElementById('kat-info');
    document.getElementById('kat-budzet').innerText = `· ${nazwaBudzetu().toLowerCase()}`;
    document.getElementById('btn-kat-wybor').classList.toggle('hidden', !stan.kategorieZBazy || !!stan.wyborKategorii);

    if (!stan.kategorieZBazy) {
        info.innerText = '';
        formularz.classList.add('hidden');
        lista.innerHTML = `<p class="text-xs text-[var(--c-spend)]">W bazie nie ma jeszcze tabeli kategorii, więc aplikacja używa listy startowej i nie można jej zmieniać. Uruchom w Supabase skrypt <span class="font-mono">${esc(PLIK_MIGRACJI)}</span> i odśwież dane.</p>`;
        return;
    }
    formularz.classList.remove('hidden');
    info.innerText = `${stan.kategorie.length} ${odmiana(stan.kategorie.length, 'kategoria', 'kategorie', 'kategorii')}`;

    const n = stan.kategorie.length;
    lista.innerHTML = stan.kategorie.map((k, i) => {
        const id = esc(k.id);
        const nazwa = esc(k.name);
        if (String(stan.kategoriaDoUsuniecia) === String(k.id)) {
            return `
            <div class="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-[var(--border)] text-xs" role="alert">
                <span>Usunąć kategorię <strong>${nazwa}</strong>?</span>
                <span class="flex gap-2">
                    <button type="button" onclick="usunKategorie('${id}')" class="chip !bg-[var(--c-spend)] !text-white">Usuń</button>
                    <button type="button" onclick="anulujUsuwanieKategorii()" class="chip">Anuluj</button>
                </span>
            </div>`;
        }
        const limit = k.monthly_limit_gr > 0 ? String(k.monthly_limit_gr / 100) : '';
        return `
            <div class="flex flex-wrap items-center gap-x-3 gap-y-2 py-2 border-b border-[var(--border)] text-xs">
                <input type="color" value="${esc(k.color || KOLORY_GRUP.Inne)}" onchange="zmienPoleKategorii('${id}', 'color', this.value)"
                    class="w-8 h-8 rounded-lg border border-[var(--border)] bg-transparent cursor-pointer shrink-0" aria-label="Kolor kategorii ${nazwa}">
                <input type="text" value="${nazwa}" maxlength="${MAKS_NAZWA_KATEGORII}" onchange="zmienNazweKategorii('${id}', this)"
                    class="input !py-1.5 flex-1 min-w-[9rem]" aria-label="Nazwa kategorii ${nazwa}">
                <label class="flex items-center gap-1 text-[var(--muted)]">Limit
                    <input type="text" inputmode="decimal" value="${esc(limit)}" placeholder="—" onchange="zmienLimitKategorii('${id}', this)"
                        class="input !py-1.5 !w-20 text-right kwota" aria-label="Limit miesięczny kategorii ${nazwa} w zł">zł
                </label>
                <label class="flex items-center gap-1.5 text-[var(--muted)] cursor-pointer">
                    <input type="checkbox" role="switch" class="switch" ${k.is_fixed ? 'checked' : ''} onchange="zmienPoleKategorii('${id}', 'is_fixed', this.checked)"
                        aria-label="Wydatek stały: ${nazwa}">Stała
                </label>
                <label class="flex items-center gap-1.5 text-[var(--muted)] cursor-pointer" title="Liczy się jako oszczędność, nie wydatek (np. akcje, obligacje)">
                    <input type="checkbox" role="switch" class="switch" ${czyKategoriaOszczednosciowa(k.name) ? 'checked' : ''} onchange="zmienPoleKategorii('${id}', 'is_saving', this.checked)"
                        aria-label="Oszczędność, nie wydatek: ${nazwa}">Oszczędność
                </label>
                <span class="flex items-center gap-1 ml-auto">
                    <button type="button" onclick="przesunKategorie('${id}', -1)" class="p-1 text-[var(--muted)] disabled:opacity-30" ${i === 0 ? 'disabled' : ''} aria-label="Przesuń ${nazwa} wyżej">▲</button>
                    <button type="button" onclick="przesunKategorie('${id}', 1)" class="p-1 text-[var(--muted)] disabled:opacity-30" ${i === n - 1 ? 'disabled' : ''} aria-label="Przesuń ${nazwa} niżej">▼</button>
                    <button type="button" onclick="pytajOUsuniecieKategorii('${id}')" class="p-1 text-[var(--muted)] hover:text-[var(--c-spend)]" aria-label="Usuń kategorię ${nazwa}">✕</button>
                </span>
            </div>`;
    }).join('');
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
    pokazKomunikat(`Dodano kategorię ${nazwa}`);
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
    const tekst = pole.value.replace(/[\s ]/g, '').replace(',', '.');
    if (tekst !== '' && !/^\d+(\.\d{0,2})?$/.test(tekst)) {
        pokazKomunikat('Limit podaj w złotych, np. 900. Puste pole = bez limitu.');
        return odswiezUstawienia();
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
    const wyniki = await Promise.all(zmiany);
    if (wyniki.some(r => r.error)) pokazKomunikat('Nie zapisano kolejności – odśwież dane');
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

function pytajOUsuniecieKategorii(id) {
    const k = kategoriaPoId(id);
    if (!k) return;
    const { transakcje, reguly } = powiazaniaKategorii(k.name);
    if (transakcje || reguly) {
        const czesci = [];
        if (transakcje) czesci.push(`${transakcje} ${odmiana(transakcje, 'transakcja', 'transakcje', 'transakcji')} z ręcznym wyborem`);
        if (reguly) czesci.push(`${reguly} ${odmiana(reguly, 'reguła', 'reguły', 'reguł')}`);
        pokazKomunikat(`Nie można usunąć „${k.name}”: używa jej ${czesci.join(' i ')}`);
        return;
    }
    stan.kategoriaDoUsuniecia = k.id;
    rysujKategorieUstawien();
}

function anulujUsuwanieKategorii() {
    stan.kategoriaDoUsuniecia = null;
    rysujKategorieUstawien();
}

async function usunKategorie(id) {
    const k = kategoriaPoId(id);
    stan.kategoriaDoUsuniecia = null;
    if (!k) return rysujKategorieUstawien();
    const { error } = await supabaseClient.from('categories').delete().eq('id', id);
    if (error) {
        pokazKomunikat(komunikatBledu(error, 'Nie usunięto kategorii'));
        return rysujKategorieUstawien();
    }
    stan.kategorie = stan.kategorie.filter(x => x !== k);
    odswiezInterfejs();
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
    rysujKategorieUstawien();
    rysujWyborKategorii();
}

function zamknijWyborKategorii() {
    stan.wyborKategorii = null;
    rysujKategorieUstawien();
    rysujWyborKategorii();
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
            <h3 class="text-xs font-semibold">Zaznacz kategorie, których chcesz używać w: ${esc(nazwaBudzetu().toLowerCase())}</h3>
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
        <p class="text-[10px] text-[var(--muted)]">Kategorii „w użyciu” (ręcznie wybranych w transakcjach albo w regułach) nie można odznaczyć, ale <strong>nazwę każdej kategorii, także używanej, zmienisz na liście poniżej</strong> – nowa nazwa przejdzie na transakcje i reguły. Odznaczone, nieużywane kategorie zostaną usunięte – zawsze możesz je tu dodać z powrotem.</p>
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

function regulaKontaWspolnego() {
    return dynamiczneReguly.find(r => czyRegulaRachunku(r.phrase || '') && r.category === KATEGORIA_PRZELEW_WSPOLNE) || null;
}

function przelewyNaKonto(numer) {
    return stan.transakcje.filter(t => t.amount_gr < 0 && numer && czystyNumer(t.account_number).includes(numer));
}

function rysujKontoWspolne() {
    const karta = document.getElementById('ust-konto-wspolne-karta');
    const widoczna = stan.budzet === 'osobisty' && stan.kategorieZBazy;
    karta.classList.toggle('hidden', !widoczna);
    if (!widoczna) return;

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

// ---- Pobranie pliku --------------------------------------------------

function pobierzPlik(nazwaPliku, tresc, typ) {
    const blob = new Blob([tresc], { type: typ });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nazwaPliku;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function dzisIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---- Zapisz kopię (JSON) ---------------------------------------------

async function zapiszKopie() {
    const btn = document.getElementById('btn-zapisz-kopie');
    btn.disabled = true;
    btn.innerText = 'Pobieranie danych z chmury...';

    try {
        // Zawsze świeże dane z bazy, nie tylko to, co jest w pamięci ekranu.
        // Tabele opcjonalne (przed migracją mogą nie istnieć) pomijamy bez błędu.
        const tabele = {};
        for (const { nazwa, sort, opcjonalna } of TABELE_KOPII) {
            const { data, error } = await pobierzWszystkie(nazwa, sort);
            if (error) {
                if (opcjonalna && czyBrakSchematu(error)) continue;
                throw new Error(`${nazwa}: ${error.message}`);
            }
            tabele[nazwa] = data;
        }

        const kopia = {
            format: 'budzet-domowy-kopia',
            version: WERSJA_KOPII,
            budget: stan.budzet,
            created_at: new Date().toISOString(),
            counts: Object.fromEntries(Object.entries(tabele).map(([k, v]) => [k, v.length])),
            settings: { docelowaStopa: docelowaStopa(), zapamietajPodobne: zapamietujPodobne() },
            tables: tabele
        };

        // Nazwa pliku mówi, z którego budżetu jest kopia
        pobierzPlik(`budzet-${stan.budzet}-kopia-${dzisIso()}.json`, JSON.stringify(kopia, null, 2), 'application/json');
        pokazKomunikat('Kopia zapasowa zapisana');
    } catch (err) {
        pokazKomunikat('Nie udało się zapisać kopii: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = 'Zapisz kopię';
    }
}

// ---- Eksport do Excela (CSV) -----------------------------------------

// Pole CSV: średnik jako separator (polski Excel), cudzysłowy podwajane.
// Tekst zaczynający się od = + @ dostaje apostrof, żeby Excel nie uznał go za formułę.
function poleCSV(wartosc, tekstowe = true) {
    let s = String(wartosc ?? '');
    if (tekstowe && /^[=+@\t\r]/.test(s)) s = "'" + s;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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
            : [{ tytul: t.title, kwota: t.amount_gr, typ: czyWydatekOszczednosciowy(k) ? NAZWY_TYPOW.wplata : (NAZWY_TYPOW[k.typ] || k.typ), kategoria: kategoriaLubCel(k) }];
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
