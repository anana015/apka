// =====================================================================
// KOPIA ZAPASOWA: ZAPIS I WCZYTANIE (Ustawienia → Kopia i eksport, specyfikacja 11.3)
//
// Zapis: plik JSON z tabelami otwartego budżetu, polem version i preferencjami.
// Wczytanie: plik → sprawdzenie → podgląd (teraz / po wczytaniu) → potwierdzenie na ekranie.
//   - Podmianę robi funkcja bazy wczytaj_kopie (migracja 2026-11e) w jednej transakcji:
//     wczytuje się wszystko albo nic, przy błędzie dane budżetu zostają bez zmian.
//   - Tuż przed podmianą pobieramy obecne dane z chmury: domyślnie zapisują się też jako plik,
//     a do czasu zmiany budżetu lub wylogowania można je przywrócić przyciskiem „Cofnij wczytanie”.
//   - Kopia trafia tylko do budżetu, z którego pochodzi (pole budget w pliku).
// =====================================================================

const FORMAT_KOPII = 'budzet-domowy-kopia';
const WERSJA_KOPII = 2;
const MAKS_ROZMIAR_KOPII = 50 * 1024 * 1024;

// Tabele kopii. opcjonalna: przed migracją tabela mogła nie istnieć (wtedy nie ma jej w pliku
// i przy wczytaniu zostaje bez zmian). poprawny: minimalne wymagania wobec wiersza z pliku.
const TABELE_KOPII = [
    { nazwa: 'transakcje', sort: 'booked_on', etykieta: 'Transakcje', odmiana: ['transakcja', 'transakcje', 'transakcji'],
      poprawny: w => /^\d{4}-\d{2}-\d{2}/.test(String(w.booked_on || '')) && Number.isInteger(w.amount_gr),
      bladWiersza: 'nie ma poprawnej daty albo kwoty' },
    { nazwa: 'rules', sort: null, etykieta: 'Reguły', odmiana: ['reguła', 'reguły', 'reguł'],
      poprawny: w => typeof w.phrase === 'string' && w.phrase.trim() !== '', bladWiersza: 'nie ma frazy' },
    { nazwa: 'goals', sort: null, etykieta: 'Cele', odmiana: ['cel', 'cele', 'celów'],
      poprawny: w => typeof w.name === 'string' && w.name.trim() !== '', bladWiersza: 'nie ma nazwy' },
    { nazwa: 'categories', sort: 'sort_order', opcjonalna: true, etykieta: 'Kategorie', odmiana: ['kategoria', 'kategorie', 'kategorii'],
      poprawny: w => typeof w.name === 'string' && w.name.trim() !== '', bladWiersza: 'nie ma nazwy' },
    { nazwa: 'imports', sort: 'imported_at', opcjonalna: true, etykieta: 'Historia importów', odmiana: ['import', 'importy', 'importów'],
      poprawny: () => true, bladWiersza: '' },
    // Subkonto wypłat ze skarbonek (migracja 2026-11f); jeden wiersz na budżet
    // ukrytaGdyBrak: w podglądzie pomijana, gdy nie ma jej ani w kopii, ani w bazie (przed migracją)
    { nazwa: 'ustawienia_budzetu', sort: null, opcjonalna: true, ukrytaGdyBrak: true, etykieta: 'Ustawienia budżetu',
      odmiana: ['ustawienie budżetu', 'ustawienia budżetu', 'ustawień budżetu'],
      poprawny: w => w.konto_wyplat == null || /^\d{10,34}$/.test(String(w.konto_wyplat)),
      bladWiersza: 'ma niepoprawny numer subkonta wypłat' }
];

const BUDZET_DOPELNIACZ = { wspolny: 'budżetu wspólnego', osobisty: 'budżetu osobistego' };

// ---- Pobranie pliku (także eksport CSV w ustawienia.js) ---------------

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

// =====================================================================
// ZAPIS KOPII
// =====================================================================

// Świeże dane otwartego budżetu prosto z bazy (nie tylko to, co jest w pamięci ekranu).
// Tabele opcjonalne, których nie ma w bazie (przed migracją), pomijamy bez błędu.
async function zbierzKopie() {
    const tabele = {};
    for (const { nazwa, sort, opcjonalna } of TABELE_KOPII) {
        const { data, error } = await pobierzWszystkie(nazwa, sort);
        if (error) {
            if (opcjonalna && czyBrakSchematu(error)) continue;
            throw new Error(`${nazwa}: ${error.message}`);
        }
        tabele[nazwa] = data;
    }
    return {
        format: FORMAT_KOPII,
        version: WERSJA_KOPII,
        budget: stan.budzet,
        created_at: new Date().toISOString(),
        counts: Object.fromEntries(Object.entries(tabele).map(([k, v]) => [k, v.length])),
        settings: { docelowaStopa: docelowaStopa(), zapamietajPodobne: zapamietujPodobne() },
        tables: tabele
    };
}

function pobierzPlikKopii(kopia, nazwaPliku) {
    pobierzPlik(nazwaPliku, JSON.stringify(kopia, null, 2), 'application/json');
}

async function zapiszKopie() {
    const btn = document.getElementById('btn-zapisz-kopie');
    btn.disabled = true;
    btn.innerText = 'Pobieranie danych z chmury...';
    try {
        // Nazwa pliku mówi, z którego budżetu jest kopia
        pobierzPlikKopii(await zbierzKopie(), `budzet-${stan.budzet}-kopia-${dzisIso()}.json`);
        pokazKomunikat('Kopia zapasowa zapisana');
    } catch (err) {
        pokazKomunikat('Nie udało się zapisać kopii: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = 'Zapisz kopię';
    }
}

// =====================================================================
// WCZYTANIE KOPII – sprawdzenie pliku
// stan.wczytanieKopii: null (start) albo
//   { etap: 'blad' | 'podglad' | 'zapis' | 'gotowe' | 'cofanie', plik, analiza, blad, status,
//     pobierzZapas, importyTeraz, zapas, budzet, wynik, cofniete, bladCofania }
// =====================================================================

// Tekst pliku -> { blad } albo { kopia, tabele, budzetKopii, wlascicielKopii, zakres }
function analizujKopie(tekst) {
    let kopia;
    try {
        kopia = JSON.parse(tekst);
    } catch (e) {
        return { blad: 'Nie da się odczytać pliku – to nie jest poprawny plik JSON.' };
    }
    if (!kopia || typeof kopia !== 'object' || kopia.format !== FORMAT_KOPII) {
        return { blad: 'To nie jest plik kopii zapasowej z tej aplikacji. Wybierz plik zapisany przyciskiem „Zapisz kopię”.' };
    }
    const wersja = Number(kopia.version);
    if (!Number.isInteger(wersja) || wersja < 1) return { blad: 'Plik kopii nie ma poprawnego numeru wersji.' };
    if (wersja > WERSJA_KOPII) {
        return { blad: `Kopia pochodzi z nowszej wersji aplikacji (wersja ${wersja}). Odśwież stronę i spróbuj ponownie.` };
    }
    if (!kopia.tables || typeof kopia.tables !== 'object') return { blad: 'W pliku kopii nie ma danych.' };

    const tabele = {};
    for (const t of TABELE_KOPII) {
        const wiersze = kopia.tables[t.nazwa];
        if (wiersze === undefined) {
            if (t.opcjonalna) continue;
            return { blad: `W pliku brakuje tabeli „${t.etykieta}” – plik jest niekompletny.` };
        }
        if (!Array.isArray(wiersze)) return { blad: `Tabela „${t.etykieta}” w pliku jest uszkodzona.` };
        const oczekiwane = kopia.counts ? kopia.counts[t.nazwa] : undefined;
        if (Number.isInteger(oczekiwane) && oczekiwane !== wiersze.length) {
            return { blad: `Plik jest niekompletny: tabela „${t.etykieta}” powinna mieć ${oczekiwane} wierszy, a ma ${wiersze.length}.` };
        }
        const zly = wiersze.findIndex(w => !w || typeof w !== 'object' || Array.isArray(w) || !t.poprawny(w));
        if (zly >= 0) return { blad: `${t.etykieta}: wiersz nr ${zly + 1} ${t.bladWiersza || 'jest uszkodzony'}.` };
        tabele[t.nazwa] = wiersze;
    }

    // Nazwa kategorii jest unikalna w budżecie – baza i tak by odrzuciła, ale tu powiemy, która
    if (tabele.categories) {
        const widziane = new Set();
        const powtorzona = tabele.categories.find(k => {
            if (widziane.has(k.name)) return true;
            widziane.add(k.name);
            return false;
        });
        if (powtorzona) return { blad: `Kategoria „${powtorzona.name}” występuje w kopii dwa razy.` };
    }
    // Bez historii importów w kopii odwołania transakcji do importów nie miałyby czego wskazywać
    if (!tabele.imports) {
        tabele.transakcje = tabele.transakcje.map(w => ('import_id' in w ? { ...w, import_id: null } : w));
    }

    const daty = tabele.transakcje.map(w => String(w.booked_on).slice(0, 10)).sort();
    const wlasciciel = TABELE_KOPII.flatMap(t => tabele[t.nazwa] || []).map(w => w.owner_id).find(Boolean) || null;
    return {
        kopia,
        tabele,
        // Kopie sprzed budżetu osobistego nie mają pola budget – wtedy były tylko wspólne
        budzetKopii: kopia.budget === 'osobisty' ? 'osobisty' : 'wspolny',
        wlascicielKopii: wlasciciel,
        zakres: daty.length ? { od: daty[0], do: daty[daty.length - 1] } : null
    };
}

// Czy kopię można wczytać do otwartego budżetu. Zwraca null albo { tekst, przelacz }.
function bladZgodnosciKopii(analiza) {
    if (analiza.budzetKopii !== stan.budzet) {
        return {
            tekst: `Ta kopia pochodzi z ${BUDZET_DOPELNIACZ[analiza.budzetKopii]}, a otwarty jest ${nazwaBudzetu().toLowerCase()}. Kopię wczytasz tylko do budżetu, z którego pochodzi.`,
            przelacz: true
        };
    }
    if (analiza.budzetKopii === 'osobisty' && analiza.wlascicielKopii && analiza.wlascicielKopii !== stan.uzytkownikId) {
        return { tekst: 'To kopia budżetu osobistego innego konta. Wczytać ją może tylko osoba, do której należy ten budżet.', przelacz: false };
    }
    return null;
}

function dataKopiiTekst(iso) {
    const d = new Date(iso);
    if (!iso || Number.isNaN(d.getTime())) return 'nieznana data';
    return d.toLocaleString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function opisLiczbTabel(liczby) {
    return TABELE_KOPII
        .filter(t => Number.isInteger(liczby[t.nazwa]))
        .map(t => liczbaIOdmiana(liczby[t.nazwa], ...t.odmiana))
        .join(' · ');
}

// Liczba wierszy otwartego budżetu teraz (null = nie wiadomo)
function liczbaTeraz(nazwa, w) {
    switch (nazwa) {
        case 'transakcje': return stan.transakcje.length;
        case 'rules': return dynamiczneReguly.length;
        case 'goals': return stan.cele.length;
        case 'categories': return stan.kategorieZBazy ? stan.kategorie.length : null;
        case 'imports': return w.importyTeraz;
        case 'ustawienia_budzetu': return stan.ustawieniaBudzetuDostepne ? (stan.ustawieniaBudzetu ? 1 : 0) : null;
        default: return null;
    }
}

// Historia importów w pamięci to tylko 10 ostatnich – do podglądu potrzebna pełna liczba
async function policzImportyTeraz(w) {
    const { count, error } = await supabaseClient.from('imports').select('id', { count: 'exact', head: true });
    if (error || stan.wczytanieKopii !== w) return;
    w.importyTeraz = count;
    rysujWczytanieKopii();
}

// =====================================================================
// WCZYTANIE KOPII – ekran
// =====================================================================

const KLASA_PRZYCISKU_ZASTAP = 'btn-primary !w-auto px-5 !bg-[var(--c-spend)] !text-white';

function rysujWczytanieKopii() {
    const kontener = document.getElementById('ust-wczytaj');
    const w = stan.wczytanieKopii;
    let html;
    if (stan.schematBudzetow !== true) {
        html = `<p class="text-xs text-[var(--muted)]">Wczytanie kopii wymaga aktualnej bazy – uruchom w Supabase skrypt <span class="font-mono">${esc(PLIK_MIGRACJI)}</span> (i wcześniejsze migracje).</p>`;
    } else if (stan.trybOffline) {
        html = '<p class="text-xs text-[var(--muted)]">Bez internetu nie można wczytać kopii – wróć tu po powrocie połączenia.</p>';
    } else if (!w) {
        html = `
            <p class="text-xs text-[var(--muted)]">Zastępuje dane <strong>${esc(BUDZET_DOPELNIACZ[stan.budzet])}</strong> danymi z pliku kopii. Zanim cokolwiek się zmieni, zobaczysz, co jest w pliku, i potwierdzisz.</p>
            <button type="button" id="btn-wczytaj-wybierz" data-klik="kliknijElement('ust-wczytaj-plik')" class="btn-secondary">Wybierz plik kopii…</button>`;
    } else if (w.etap === 'blad') {
        html = `
            <div role="alert" class="text-xs p-3 rounded-xl border border-current text-[var(--c-spend)]">
                <h3 id="wczytaj-naglowek" tabindex="-1" class="font-semibold">Nie można wczytać pliku ${esc(w.plik)}</h3>
                <p class="mt-1">${esc(w.blad)}</p>
            </div>
            <div class="flex gap-2 flex-wrap">
                <button type="button" data-klik="kliknijElement('ust-wczytaj-plik')" class="btn-secondary">Wybierz inny plik</button>
                <button type="button" data-klik="anulujWczytanieKopii()" class="btn-secondary">Anuluj</button>
            </div>`;
    } else if (w.etap === 'cofanie') {
        html = `<p role="status" aria-live="polite" class="text-xs font-semibold">${esc(w.status)}</p>`;
    } else if (w.etap === 'gotowe') {
        html = htmlWynikuWczytania(w);
    } else {
        html = htmlPodgladuKopii(w);
    }
    wstawHtml(kontener, html);
}

function htmlPodgladuKopii(w) {
    const { analiza } = w;
    const zgodnosc = bladZgodnosciKopii(analiza);
    const wTrakcie = w.etap === 'zapis';
    const liczba = n => (Number.isInteger(n) ? String(n) : '—');

    const widoczne = TABELE_KOPII.filter(t => analiza.tabele[t.nazwa] || !t.ukrytaGdyBrak || liczbaTeraz(t.nazwa, w) !== null);
    const wiersze = widoczne.map(t => {
        const wKopii = analiza.tabele[t.nazwa];
        return `
            <tr class="border-t border-[var(--border)]">
                <td class="py-1.5 pr-2">${esc(t.etykieta)}</td>
                <td class="py-1.5 text-right kwota text-[var(--muted)]">${esc(liczba(liczbaTeraz(t.nazwa, w)))}</td>
                <td class="py-1.5 text-right kwota font-semibold pl-3">${wKopii ? esc(String(wKopii.length)) : '<span class="font-normal text-[var(--muted)]">bez zmian</span>'}</td>
            </tr>`;
    }).join('');

    const pominiete = widoczne.filter(t => !analiza.tabele[t.nazwa]).map(t => t.etykieta.toLowerCase());
    const ustawienia = analiza.kopia.settings || {};
    const preferencje = Number.isFinite(ustawienia.docelowaStopa) || typeof ustawienia.zapamietajPodobne === 'boolean';

    const uwagi = [
        analiza.zakres ? `Transakcje w kopii: od ${dataPL(analiza.zakres.od)} do ${dataPL(analiza.zakres.do)}.` : 'Kopia nie zawiera transakcji.',
        pominiete.length ? `Kopia nie zawiera tabel: ${pominiete.join(', ')} – te dane zostaną bez zmian.` : '',
        preferencje ? 'Preferencje z kopii (cel oszczędzania, zapamiętywanie kategorii) zastąpią obecne na tym urządzeniu.' : ''
    ].filter(Boolean).map(t => `<li>${esc(t)}</li>`).join('');

    let dol;
    if (zgodnosc) {
        dol = `
            <div role="alert" class="text-xs p-3 rounded-xl border border-current text-[var(--c-spend)] space-y-2">
                <p>${esc(zgodnosc.tekst)}</p>
                ${zgodnosc.przelacz ? `<button type="button" data-klik="przelaczBudzetDlaKopii()" class="chip is-active">Przełącz na ${esc(nazwaBudzetu(analiza.budzetKopii).toLowerCase())}</button>` : ''}
            </div>
            <div class="flex gap-2 flex-wrap">
                <button type="button" data-klik="kliknijElement('ust-wczytaj-plik')" class="btn-secondary">Wybierz inny plik</button>
                <button type="button" data-klik="anulujWczytanieKopii()" class="btn-secondary">Anuluj</button>
            </div>`;
    } else {
        dol = `
            ${w.blad ? `<p role="alert" class="text-xs p-3 rounded-xl border border-current text-[var(--c-spend)]">${esc(w.blad)}</p>` : ''}
            <div class="p-3 rounded-xl border border-[var(--c-spend)] space-y-3">
                <p class="text-xs"><strong>Obecne dane ${esc(BUDZET_DOPELNIACZ[stan.budzet])} zostaną usunięte</strong> i zastąpione danymi z kopii. Pliki paragonów zostają w magazynie.</p>
                <label class="flex items-start gap-2 text-xs ${wTrakcie ? '' : 'cursor-pointer'}">
                    <input type="checkbox" id="wczytaj-zapas" class="mt-0.5 w-4 h-4 shrink-0 accent-[var(--accent)]" ${w.pobierzZapas ? 'checked' : ''} ${wTrakcie ? 'disabled' : ''}
                        data-zmiana="ustawZapasKopii(this.checked)">
                    <span>Najpierw pobierz plik z obecnymi danymi <span class="text-[var(--muted)]">(zalecane – na wypadek, gdyby trzeba było wrócić później)</span></span>
                </label>
                ${wTrakcie
                    ? `<p role="status" aria-live="polite" class="text-xs font-semibold">${esc(w.status)}</p>`
                    : `<div class="flex gap-2 flex-wrap">
                           <button type="button" id="btn-wczytaj-zastap" data-klik="zastapDaneKopia()" class="${KLASA_PRZYCISKU_ZASTAP}">Zastąp dane ${esc(BUDZET_DOPELNIACZ[stan.budzet])}</button>
                           <button type="button" data-klik="anulujWczytanieKopii()" class="btn-secondary">Anuluj</button>
                       </div>`}
            </div>`;
    }

    return `
        <div class="text-xs">
            <h3 id="wczytaj-naglowek" tabindex="-1" class="font-semibold truncate">${esc(w.plik)}</h3>
            <p class="text-[var(--muted)]">Kopia ${esc(BUDZET_DOPELNIACZ[analiza.budzetKopii])} z ${esc(dataKopiiTekst(analiza.kopia.created_at))}</p>
        </div>
        <table class="w-full text-xs max-w-md">
            <thead class="text-[10px] text-[var(--muted)]">
                <tr><th class="text-left font-normal pb-1">Dane budżetu</th>
                    <th class="text-right font-normal pb-1">Teraz</th>
                    <th class="text-right font-normal pb-1 pl-3">Po wczytaniu</th></tr>
            </thead>
            <tbody>${wiersze}</tbody>
        </table>
        <ul class="text-[11px] text-[var(--muted)] space-y-0.5 list-disc pl-4">${uwagi}</ul>
        ${dol}`;
}

function htmlWynikuWczytania(w) {
    if (w.cofniete) {
        return `
            <div role="status" class="p-3 rounded-xl bg-[var(--bg)] space-y-2 text-xs">
                <h3 id="wczytaj-naglowek" tabindex="-1" class="font-semibold">Przywrócono dane sprzed wczytania</h3>
                <p class="text-[var(--muted)]">${esc(opisLiczbTabel(w.zapas.counts || {}))}</p>
                <button type="button" data-klik="anulujWczytanieKopii()" class="btn-secondary">Gotowe</button>
            </div>`;
    }
    const moznaCofnac = w.budzet === stan.budzet;
    return `
        <div role="status" class="p-3 rounded-xl bg-[var(--bg)] space-y-2 text-xs">
            <h3 id="wczytaj-naglowek" tabindex="-1" class="font-semibold">Wczytano kopię z ${esc(dataKopiiTekst(w.analiza.kopia.created_at))}</h3>
            <p>${esc(opisLiczbTabel(w.wynik))}</p>
            ${w.bladCofania ? `<p role="alert" class="text-[var(--c-spend)]">${esc(w.bladCofania)}</p>` : ''}
            ${moznaCofnac ? '<p class="text-[11px] text-[var(--muted)]">Coś się nie zgadza? Możesz przywrócić dane sprzed wczytania – do czasu zmiany budżetu albo wylogowania.</p>' : ''}
            <div class="flex gap-2 flex-wrap items-center">
                ${moznaCofnac ? '<button type="button" id="btn-wczytaj-cofnij" data-klik="cofnijWczytanieKopii()" class="btn-secondary">Cofnij wczytanie</button>' : ''}
                <button type="button" data-klik="pobierzZapasKopii()" class="btn-secondary">Pobierz dane sprzed wczytania</button>
                <button type="button" data-klik="anulujWczytanieKopii()" class="text-xs text-[var(--muted)] underline">Gotowe</button>
            </div>
        </div>`;
}

function ustawFokusWczytania() {
    const naglowek = document.getElementById('wczytaj-naglowek');
    if (naglowek) naglowek.focus();
}

// =====================================================================
// WCZYTANIE KOPII – akcje
// =====================================================================

async function wybierzPlikKopii(input) {
    const plik = input.files && input.files[0];
    input.value = ''; // ten sam plik można wybrać ponownie
    if (!plik) return;

    let analiza;
    if (plik.size > MAKS_ROZMIAR_KOPII) {
        analiza = { blad: 'Plik ma ponad 50 MB – to nie wygląda na kopię z tej aplikacji.' };
    } else {
        try {
            analiza = analizujKopie(await plik.text());
        } catch (e) {
            analiza = { blad: 'Nie udało się odczytać pliku.' };
        }
    }
    stan.wczytanieKopii = analiza.blad
        ? { etap: 'blad', plik: plik.name, blad: analiza.blad }
        : { etap: 'podglad', plik: plik.name, analiza, pobierzZapas: true, importyTeraz: null, blad: null };
    rysujWczytanieKopii();
    ustawFokusWczytania();
    if (stan.wczytanieKopii.etap === 'podglad') policzImportyTeraz(stan.wczytanieKopii);
}

function ustawZapasKopii(wlaczone) {
    if (stan.wczytanieKopii) stan.wczytanieKopii.pobierzZapas = wlaczone;
}

// Trwa zapis do bazy – wtedy nie można anulować ani przełączyć budżetu (app.js: zmienBudzet)
function czyWczytanieKopiiTrwa() {
    return !!stan.wczytanieKopii && ['zapis', 'cofanie'].includes(stan.wczytanieKopii.etap);
}

function anulujWczytanieKopii() {
    if (czyWczytanieKopiiTrwa()) return;
    stan.wczytanieKopii = null;
    rysujWczytanieKopii();
    const btn = document.getElementById('btn-wczytaj-wybierz');
    if (btn) btn.focus();
}

// Kopia z drugiego budżetu: przełączamy budżet i zostawiamy wybrany plik
async function przelaczBudzetDlaKopii() {
    const w = stan.wczytanieKopii;
    if (!w || w.etap !== 'podglad') return;
    await zmienBudzet(w.analiza.budzetKopii);
    if (stan.budzet !== w.analiza.budzetKopii) return; // przełączenie się nie udało
    Object.assign(w, { importyTeraz: null, blad: null });
    stan.wczytanieKopii = w;
    rysujWczytanieKopii();
    ustawFokusWczytania();
    policzImportyTeraz(w);
}

function wyslijKopieDoBazy(budzet, tabele) {
    return supabaseClient.rpc('wczytaj_kopie', { p_osobisty: budzet === 'osobisty', p_tabele: tabele });
}

function opisBleduWczytania(error) {
    const tekst = String((error && error.message) || '');
    if (error && (error.code === 'PGRST202' || /could not find the function/i.test(tekst))) {
        return `W bazie brakuje funkcji wczytywania kopii – niczego nie zmieniono. Uruchom w Supabase skrypt ${PLIK_MIGRACJI} i spróbuj ponownie.`;
    }
    if (/fetch|network|timeout/i.test(tekst)) {
        return 'Brak połączenia z bazą – nie wiadomo, czy kopia zdążyła się wczytać. Odśwież dane i sprawdź liczby transakcji.';
    }
    if (error && error.code === '23505') {
        return `Nie wczytano kopii – dane budżetu są bez zmian. Kopia zawiera powtórzone dane, np. wiersze, które są już w innym budżecie (${tekst}).`;
    }
    return `Nie wczytano kopii – dane budżetu są bez zmian. Powód: ${tekst || 'nieznany błąd'}.`;
}

// Preferencje z pliku (localStorage tej przeglądarki)
function przywrocPreferencje(ustawienia) {
    if (!ustawienia) return;
    const stopa = Number(ustawienia.docelowaStopa);
    if (Number.isFinite(stopa) && stopa >= 0 && stopa <= 100) {
        try { localStorage.setItem(KLUCZ_DOCELOWEJ_STOPY, String(stopa)); } catch (e) {}
    }
    if (typeof ustawienia.zapamietajPodobne === 'boolean') zmienZapamietywanie(ustawienia.zapamietajPodobne);
}

function nazwaPlikuZapasu(budzet) {
    return `budzet-${budzet}-przed-wczytaniem-${dzisIso()}.json`;
}

async function zastapDaneKopia() {
    const w = stan.wczytanieKopii;
    if (!w || w.etap !== 'podglad' || bladZgodnosciKopii(w.analiza)) return;
    const budzet = stan.budzet;
    const krok = status => {
        Object.assign(w, { etap: 'zapis', status, blad: null });
        if (stan.wczytanieKopii === w) rysujWczytanieKopii();
    };
    const przerwij = blad => {
        Object.assign(w, { etap: 'podglad', blad });
        if (stan.wczytanieKopii === w) rysujWczytanieKopii();
    };

    // 1. Obecne dane – do pliku i do „Cofnij wczytanie”. Bez nich niczego nie zmieniamy.
    krok('Pobieram obecne dane z chmury…');
    let zapas;
    try {
        zapas = await zbierzKopie();
    } catch (err) {
        return przerwij(`Nie udało się pobrać obecnych danych, więc niczego nie zmieniono. ${err.message}`);
    }
    if (w.pobierzZapas) pobierzPlikKopii(zapas, nazwaPlikuZapasu(budzet));

    // 2. Podmiana w bazie – wszystko albo nic
    krok('Wczytuję kopię…');
    const { data, error } = await wyslijKopieDoBazy(budzet, w.analiza.tabele);
    if (error) return przerwij(opisBleduWczytania(error));

    przywrocPreferencje(w.analiza.kopia.settings);
    Object.assign(w, { etap: 'gotowe', wynik: data || {}, zapas, budzet, cofniete: false, bladCofania: null });
    await pobierzDane();
    pokazKomunikat(`Wczytano kopię ${BUDZET_DOPELNIACZ[budzet]}`);
    if (stan.wczytanieKopii === w) ustawFokusWczytania();
}

async function cofnijWczytanieKopii() {
    const w = stan.wczytanieKopii;
    if (!w || w.etap !== 'gotowe' || w.cofniete || !w.zapas || w.budzet !== stan.budzet) return;
    Object.assign(w, { etap: 'cofanie', status: 'Przywracam dane sprzed wczytania…' });
    rysujWczytanieKopii();

    const { error } = await wyslijKopieDoBazy(w.budzet, w.zapas.tables);
    if (error) {
        Object.assign(w, { etap: 'gotowe', bladCofania: opisBleduWczytania(error).replace('Nie wczytano kopii', 'Nie cofnięto wczytania') });
        return rysujWczytanieKopii();
    }
    przywrocPreferencje(w.zapas.settings);
    Object.assign(w, { etap: 'gotowe', cofniete: true, bladCofania: null });
    await pobierzDane();
    pokazKomunikat('Przywrócono dane sprzed wczytania');
    if (stan.wczytanieKopii === w) ustawFokusWczytania();
}

function pobierzZapasKopii() {
    const w = stan.wczytanieKopii;
    if (w && w.zapas) pobierzPlikKopii(w.zapas, nazwaPlikuZapasu(w.budzet));
}
