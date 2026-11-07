// =====================================================================
// EKRAN: TRANSAKCJE (specyfikacja, punkt 7.1)
//  - filtry: Wszystkie / Do przypisania / Przypisane (liczniki dla wybranego okresu)
//  - wybór miesiąca (jak na Pulpicie) + „Wszystkie miesiące”
//  - przełącznik „Zapamiętaj kategorię dla podobnych transakcji” (4.4)
//  - kolejność: data rosnąco w obrębie miesiąca (jak na wyciągu)
// =====================================================================

const KLUCZ_ZAPAMIETAJ = 'budzet.zapamietajPodobne';
const WSZYSTKIE_MIESIACE = null;

// ---- Ustawienie „Zapamiętaj dla podobnych” (domyślnie włączone) ------

function zapamietujPodobne() {
    try { return localStorage.getItem(KLUCZ_ZAPAMIETAJ) !== '0'; } catch (e) { return true; }
}

function zmienZapamietywanie(wlaczone) {
    try { localStorage.setItem(KLUCZ_ZAPAMIETAJ, wlaczone ? '1' : '0'); } catch (e) {}
}

// ---- Filtry ----------------------------------------------------------

function zmienFiltrTransakcji(typ) {
    stan.filtrTransakcji = typ;
    stan.podzial = null;
    odswiezTransakcje();
}

function wybierzMiesiacTransakcji(m) {
    stan.miesiacTransakcji = m || WSZYSTKIE_MIESIACE;
    stan.podzial = null;
    odswiezTransakcje();
}

function przejdzDoBezKategorii() {
    zmienZakladke('transakcje', { filtr: 'brak' });
}

function pasujeDoFiltra(wiersz, filtr) {
    if (filtr === 'brak') return wiersz.doPrzypisania;
    if (filtr === 'przypisane') return !wiersz.doPrzypisania;
    return true;
}

// ---- Wiersz transakcji (wygląd jak dotąd) ----------------------------

const KLASA_SELECT = 'bg-[var(--surface)] text-[var(--fg)] border rounded-lg px-2 py-1 text-[11px] max-w-[11rem] focus:ring-1 focus:ring-[var(--accent)]';

const KLASA_KWOTY = {
    wydatek: 'text-[var(--c-spend)]',
    wplata: 'text-[var(--c-save)]',
    wyplata: 'text-purple-600 dark:text-purple-300',
    przychod: 'text-[var(--c-income)]',
    pominiete: 'text-[var(--muted)] line-through'
};

function prawaKolumna(t, k) {
    if (k.podzial) {
        return `<button type="button" onclick="otworzPodzial('${esc(t.id)}')" class="status-label text-[var(--accent)] hover:underline" title="Zmień lub usuń podział">✂ Podzielona (${k.podzial.length})</button>`;
    }
    if (k.typ === 'wplata' && !k.celReczny) {
        // Wpłata rozpoznana po numerze subkonta celu -> etykieta statusu
        return `<span class="status-label text-[var(--c-save)]">Wpłata: ${esc(k.cel.name)}</span>`;
    }
    if (k.typ === 'wyplata') {
        // Wypłata ze skarbonek -> wybór celu (żółta ramka, gdy nieprzypisana)
        const celId = k.cel ? String(k.cel.id) : null;
        return `
            <select onchange="zmienKategorieTransakcji('${esc(t.id)}', this.value)" aria-label="Skarbonka, z której jest wypłata" class="${KLASA_SELECT} ${k.cel ? 'border-[var(--border)]' : 'border-amber-400 ring-1 ring-amber-400'}">
                <option value="">${k.cel ? 'Automatycznie' : 'Z której skarbonki?'}</option>
                ${stan.cele.map(c => `<option value="${esc(PREFIKS_CELU + c.id)}" ${celId === String(c.id) ? 'selected' : ''}>Wypłata: ${esc(c.name)}</option>`).join('')}
            </select>`;
    }
    const wybranyCelId = k.cel && k.celReczny ? String(k.cel.id) : null;
    const bezKat = k.typ === 'wydatek' && !k.kategoria;
    const opcjeKategorii = stan.kategorie
        .map(kat => `<option value="${esc(kat.name)}" ${k.kategoria === kat.name ? 'selected' : ''}>${esc(kat.name)}</option>`)
        .join('');
    const opcjeCelow = stan.cele
        .map(c => `<option value="${esc(PREFIKS_CELU + c.id)}" ${wybranyCelId === String(c.id) ? 'selected' : ''}>[Skarbonka] ${esc(c.name)}</option>`)
        .join('');
    return `
        <select onchange="zmienKategorieTransakcji('${esc(t.id)}', this.value)" aria-label="Kategoria transakcji" class="${KLASA_SELECT} ${bezKat ? 'border-amber-400 ring-1 ring-amber-400' : 'border-[var(--border)]'}">
            <option value="">Wybierz kategorię...</option>
            <optgroup label="Zwykłe kategorie">${opcjeKategorii}</optgroup>
            <optgroup label="Skarbonki">${opcjeCelow}</optgroup>
            <option value="${POMIN}" ${k.typ === 'pominiete' ? 'selected' : ''}>${POMIN}</option>
            ${moznaPodzielic(t, k) ? `<option value="${PODZIEL}">✂ Podziel na kilka kategorii…</option>` : ''}
        </select>`;
}

function wierszTransakcji({ t, k }) {
    return `
        <article class="card text-xs">
          <div class="flex justify-between items-start gap-3">
            <div class="flex-1 min-w-0">
                <p class="font-semibold truncate">${esc(t.counterparty || 'Brak kontrahenta')}</p>
                ${t.title ? `<p class="text-[11px] text-[var(--muted)] line-clamp-2 mt-0.5 leading-tight">${esc(t.title)}</p>` : ''}
                ${t.account_number && (k.typ === 'wplata' || k.typ === 'wyplata') ? `<p class="text-[10px] text-[var(--accent)] font-mono mt-0.5 truncate">Konto: ${esc(t.account_number)}</p>` : ''}
                <time class="inline-block text-[10px] text-[var(--muted)] mt-1" datetime="${esc(t.booked_on)}">${esc(t.booked_on)}</time>
                ${k.podzial ? `<p class="text-[10px] text-[var(--muted)] mt-0.5">${k.podzial.map(c => `${esc(c.category)} ${(Math.abs(c.amount_gr) / 100).toFixed(2)} zł`).join(' · ')}</p>` : ''}
            </div>
            <div class="text-right shrink-0 flex flex-col items-end gap-1.5">
                <div class="flex items-center gap-1">
                    <span class="font-bold kwota ${KLASA_KWOTY[k.typ] || ''}">${(t.amount_gr / 100).toFixed(2)} zł</span>
                    <button type="button" onclick="usunTransakcje('${esc(t.id)}')" class="text-[var(--muted)] hover:text-[var(--c-spend)] transition p-1" title="Usuń transakcję" aria-label="Usuń transakcję">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                </div>
                <div>${prawaKolumna(t, k)}</div>
            </div>
          </div>
          ${edytorPodzialu(t)}
        </article>`;
}

// ---- Główne odświeżenie ----------------------------------------------

function odswiezTransakcje() {
    const lista = document.getElementById('lista-transakcji');
    const filtr = stan.filtrTransakcji || 'wszystkie';

    // Klasyfikacja raz na transakcję, kolejność: data rosnąco (jak na wyciągu)
    const wszystkie = stan.transakcje
        .slice()
        .sort((a, b) => a.booked_on.localeCompare(b.booked_on) || String(a.id).localeCompare(String(b.id)))
        .map(t => {
            const k = klasyfikuj(t);
            return { t, k, doPrzypisania: czyKlasyfikacjaDoPrzypisania(k) };
        });

    // Miesiące z transakcjami (najnowszy pierwszy); nieistniejący wybór -> wszystkie
    const miesiace = Array.from(new Set(wszystkie.map(w => w.t.booked_on.substring(0, 7)))).sort().reverse();
    if (stan.miesiacTransakcji && !miesiace.includes(stan.miesiacTransakcji)) {
        stan.miesiacTransakcji = WSZYSTKIE_MIESIACE;
    }
    const miesiac = stan.miesiacTransakcji;
    const wOkresie = miesiac ? wszystkie.filter(w => w.t.booked_on.startsWith(miesiac)) : wszystkie;

    // Filtry z licznikami dla wybranego okresu
    const liczniki = {
        wszystkie: wOkresie.length,
        brak: wOkresie.filter(w => w.doPrzypisania).length,
        przypisane: wOkresie.filter(w => !w.doPrzypisania).length
    };
    ['wszystkie', 'brak', 'przypisane'].forEach(f => {
        const btn = document.getElementById(`btn-filtr-${f}`);
        btn.classList.toggle('is-active', f === filtr);
        btn.setAttribute('aria-pressed', String(f === filtr));
        document.getElementById(`licznik-${f}`).innerText = liczniki[f];
    });

    // Wybór miesiąca: liczba pozycji pasujących do filtra w każdym miesiącu
    const naMiesiac = {};
    wszystkie.forEach(w => {
        if (!pasujeDoFiltra(w, filtr)) return;
        const m = w.t.booked_on.substring(0, 7);
        naMiesiac[m] = (naMiesiac[m] || 0) + 1;
    });
    const chipMiesiaca = (wartosc, etykieta, ile) => {
        const wybrany = (wartosc || null) === (miesiac || null);
        return `<button type="button" onclick="wybierzMiesiacTransakcji(${wartosc ? `'${esc(wartosc)}'` : 'null'})" class="chip ${wybrany ? 'is-active' : ''}" aria-pressed="${wybrany}">${esc(etykieta)}${filtr !== 'wszystkie' ? ` <span class="opacity-70">(${ile || 0})</span>` : ''}</button>`;
    };
    const sumaFiltra = Object.values(naMiesiac).reduce((a, b) => a + b, 0);
    document.getElementById('transakcje-miesiace').innerHTML =
        chipMiesiaca(null, 'Wszystkie miesiące', sumaFiltra) +
        miesiace.map(m => chipMiesiaca(m, nazwaMiesiaca(m), naMiesiac[m])).join('');

    const przelacznik = document.getElementById('przelacznik-zapamietaj');
    przelacznik.checked = zapamietujPodobne();

    // Lista
    const dane = wOkresie.filter(w => pasujeDoFiltra(w, filtr));
    const podsumowanie = document.getElementById('transakcje-podsumowanie');

    if (dane.length === 0) {
        podsumowanie.innerText = '';
        const wOkresieTekst = miesiac ? ` w ${nazwaMiesiacaMiejscownik(miesiac)}` : '';
        const komunikat = stan.transakcje.length === 0
            ? 'Brak transakcji. Zaimportuj wyciąg w zakładce Import.'
            : filtr === 'brak' ? `Wszystkie transakcje${wOkresieTekst} mają kategorię.`
            : filtr === 'przypisane' ? `Brak przypisanych transakcji${wOkresieTekst}.`
            : `Brak transakcji${wOkresieTekst}.`;
        lista.innerHTML = `<div class="card text-center text-xs text-[var(--muted)] py-8">${esc(komunikat)}</div>`;
        return;
    }

    const s = podsumuj(dane.map(w => w.t));
    podsumowanie.innerText = `${dane.length} ${odmianaTransakcji(dane.length)} · wpływy ${zl(s.przychody + s.wyplaty, 2)} · wydatki ${zl(s.wydatki, 2)}`;

    // „Wszystkie miesiące”: sekcje miesięcy od najnowszego, w środku data rosnąco
    const grupy = {};
    dane.forEach(w => { (grupy[w.t.booked_on.substring(0, 7)] = grupy[w.t.booked_on.substring(0, 7)] || []).push(w); });
    lista.innerHTML = Object.keys(grupy).sort().reverse().map(m => `
        <section class="space-y-2" aria-label="${esc(nazwaMiesiaca(m))}">
            ${miesiac ? '' : `<h2 class="text-xs font-semibold text-[var(--muted)] pt-2">${esc(nazwaMiesiaca(m))} · ${grupy[m].length}</h2>`}
            <div class="card-grid">${grupy[m].map(wierszTransakcji).join('')}</div>
        </section>`).join('');

    if (stan.podzial) przeliczReszte();
}

function odmianaTransakcji(n) {
    if (n === 1) return 'transakcja';
    const d = n % 10, s = n % 100;
    return d >= 2 && d <= 4 && (s < 12 || s > 14) ? 'transakcje' : 'transakcji';
}

// ---- Zapis -----------------------------------------------------------

async function usunTransakcje(id) {
    if (!confirm('Czy na pewno chcesz usunąć tę transakcję?')) return;

    const { error } = await supabaseClient.from('transakcje').delete().eq('id', id);
    if (error) {
        pokazKomunikat('Nie udało się usunąć: ' + error.message);
        return;
    }
    stan.transakcje = stan.transakcje.filter(t => String(t.id) !== String(id));
    odswiezInterfejs();
    pokazKomunikat('Usunięto transakcję');
}

async function zmienKategorieTransakcji(id, nowaKat) {
    if (nowaKat === PODZIEL) {
        otworzPodzial(id);
        return;
    }
    const t = stan.transakcje.find(x => String(x.id) === String(id));
    if (!t) return;
    const wartosc = nowaKat || null;

    const { error } = await supabaseClient
        .from('transakcje')
        .update({ category_manual: wartosc })
        .eq('id', id);

    if (error) {
        pokazKomunikat('Błąd zapisu kategorii: ' + error.message);
        odswiezTransakcje(); // przywraca poprzednią wartość listy
        return;
    }
    t.category_manual = wartosc;

    let komunikat = 'Zaktualizowano kategorię';

    // „Zapamiętaj dla podobnych” (4.4): reguła z dwóch pierwszych sensownych słów
    if (zapamietujPodobne() && wartosc && wartosc !== POMIN && !wartosc.startsWith(PREFIKS_CELU)) {
        const fraza = utworzFraze(t.counterparty, t.title);
        if (fraza) {
            const istniejaca = dynamiczneReguly.find(r => normalizuj(r.phrase) === fraza);
            let zapisano = false;

            if (!istniejaca) {
                const { data: insData, error: errRule } = await supabaseClient
                    .from('rules')
                    .insert([{ phrase: fraza, category: wartosc }])
                    .select();
                if (!errRule && insData && insData.length > 0) {
                    dynamiczneReguly.unshift(insData[0]);
                    zapisano = true;
                }
            } else if (istniejaca.category !== wartosc) {
                const { error: errUpd } = await supabaseClient
                    .from('rules')
                    .update({ category: wartosc })
                    .eq('id', istniejaca.id);
                if (!errUpd) {
                    istniejaca.category = wartosc;
                    dynamiczneReguly = [istniejaca, ...dynamiczneReguly.filter(r => r !== istniejaca)];
                    zapisano = true;
                }
            }

            if (zapisano) {
                const podobne = stan.transakcje.filter(x =>
                    x !== t && !kategoriaReczna(x) && klasyfikuj(x).typ === 'wydatek' && !klasyfikuj(x).podzial && pasujeFraza(x, fraza)
                ).length;
                komunikat = `Zapamiętano: ${fraza} → ${wartosc}` + (podobne > 0 ? ` (+${podobne} podobnych)` : '');
            }
        }
    }

    odswiezInterfejs();
    pokazKomunikat(komunikat);
}

// =====================================================================
// PODZIAŁ TRANSAKCJI NA 2–3 KATEGORIE (rzadko używany, ukryty na dole listy kategorii)
// Zapis: kolumna transakcje.splits = [{ category, amount_gr }], kwoty ujemne jak transakcja.
// Ostatnia część = reszta, więc suma zawsze równa się kwocie transakcji.
// Podział nie tworzy reguły „Zapamiętaj dla podobnych”.
// =====================================================================

const PODZIEL = '__PODZIEL__';
const MAKS_CZESCI = 3;

function moznaPodzielic(t, k) {
    return t.amount_gr < 0 && (k.typ === 'wydatek' || k.typ === 'pominiete');
}

// "12,50" / "1 234.5" -> grosze; puste lub błędne -> NaN
function groszeZPola(tekst) {
    const s = String(tekst || '').replace(/[\s ]/g, '').replace(',', '.');
    if (!/^\d+(\.\d{0,2})?$/.test(s)) return NaN;
    return Math.round(parseFloat(s) * 100);
}

function poleZGroszy(gr) {
    return (gr / 100).toFixed(2).replace('.', ',');
}

function transakcjaPodzialu() {
    return stan.podzial ? stan.transakcje.find(x => String(x.id) === stan.podzial.id) : null;
}

function otworzPodzial(id) {
    const t = stan.transakcje.find(x => String(x.id) === String(id));
    if (!t) return;
    const k = klasyfikuj(t);
    const czesci = k.podzial
        ? k.podzial.map(c => ({ category: c.category, kwota: poleZGroszy(Math.abs(c.amount_gr)) }))
        : [{ category: k.kategoria || '', kwota: '' }, { category: '', kwota: '' }];
    czesci[czesci.length - 1].kwota = ''; // ostatnia = reszta
    stan.podzial = { id: String(id), czesci };
    odswiezTransakcje();
}

// Wartości wpisane w formularzu -> stan (przed dodaniem / usunięciem części i przed zapisem)
function zbierzPodzial() {
    if (!stan.podzial) return;
    stan.podzial.czesci.forEach((c, i) => {
        const kat = document.querySelector(`[data-podzial-kat="${i}"]`);
        const kw = document.querySelector(`[data-podzial-kwota="${i}"]`);
        if (kat) c.category = kat.value;
        if (kw) c.kwota = kw.value;
    });
}

function przeliczReszte() {
    const t = transakcjaPodzialu();
    const pole = document.getElementById('podzial-reszta');
    if (!t || !pole) return;
    const n = stan.podzial.czesci.length;
    let suma = 0;
    for (let i = 0; i < n - 1; i++) {
        const el = document.querySelector(`[data-podzial-kwota="${i}"]`);
        const gr = groszeZPola(el ? el.value : '');
        if (Number.isFinite(gr)) suma += gr;
    }
    const reszta = Math.abs(t.amount_gr) - suma;
    pole.innerText = `${(reszta / 100).toFixed(2)} zł`;
    pole.classList.toggle('text-[var(--c-spend)]', reszta <= 0);
}

function dodajCzescPodzialu() {
    zbierzPodzial();
    if (stan.podzial.czesci.length >= MAKS_CZESCI) return;
    stan.podzial.czesci.push({ category: '', kwota: '' });
    odswiezTransakcje();
}

function usunCzescPodzialu(i) {
    zbierzPodzial();
    if (stan.podzial.czesci.length <= 2) return;
    stan.podzial.czesci.splice(i, 1);
    stan.podzial.czesci[stan.podzial.czesci.length - 1].kwota = '';
    odswiezTransakcje();
}

function anulujPodzial() {
    stan.podzial = null;
    odswiezTransakcje();
}

function edytorPodzialu(t) {
    if (!stan.podzial || stan.podzial.id !== String(t.id)) return '';
    const cz = stan.podzial.czesci;
    const n = cz.length;
    const opcje = wybrana => `<option value="">Kategoria…</option>` +
        stan.kategorie.map(kat => `<option value="${esc(kat.name)}" ${wybrana === kat.name ? 'selected' : ''}>${esc(kat.name)}</option>`).join('') +
        `<option value="${POMIN}" ${wybrana === POMIN ? 'selected' : ''}>${POMIN}</option>`;

    const wiersze = cz.map((c, i) => {
        const ostatnia = i === n - 1;
        return `
            <div class="flex items-center gap-2">
                <select data-podzial-kat="${i}" aria-label="Kategoria części ${i + 1}" class="${KLASA_SELECT} border-[var(--border)] flex-1 !max-w-none">${opcje(c.category)}</select>
                ${ostatnia
                    ? `<span id="podzial-reszta" class="kwota w-24 text-right font-semibold" aria-live="polite" title="Reszta kwoty transakcji"></span>`
                    : `<input type="text" inputmode="decimal" data-podzial-kwota="${i}" value="${esc(c.kwota)}" oninput="przeliczReszte()" placeholder="0,00" aria-label="Kwota części ${i + 1} w zł" class="input !w-24 !py-1 text-right kwota">`}
                ${n > 2
                    ? `<button type="button" onclick="usunCzescPodzialu(${i})" class="p-1 text-[var(--muted)] hover:text-[var(--c-spend)]" aria-label="Usuń część ${i + 1}">✕</button>`
                    : '<span class="w-6 shrink-0" aria-hidden="true"></span>'}
            </div>`;
    }).join('');

    return `
        <div class="mt-2 pt-2 border-t border-[var(--border)] space-y-2" role="group" aria-label="Podział transakcji">
            <p class="text-[11px]"><span class="font-semibold">Podział ${(Math.abs(t.amount_gr) / 100).toFixed(2)} zł</span>
                <span class="text-[var(--muted)]"> · ostatnia część to reszta kwoty</span></p>
            ${wiersze}
            <div class="flex flex-wrap gap-2 pt-1">
                ${n < MAKS_CZESCI ? `<button type="button" onclick="dodajCzescPodzialu()" class="chip">+ Dodaj część</button>` : ''}
                <button type="button" onclick="zapiszPodzial()" class="chip is-active">Zapisz podział</button>
                <button type="button" onclick="anulujPodzial()" class="chip">Anuluj</button>
                ${t.splits ? `<button type="button" onclick="usunPodzial('${esc(t.id)}')" class="chip !text-[var(--c-spend)] ml-auto">Usuń podział</button>` : ''}
            </div>
        </div>`;
}

async function zapiszPodzial() {
    const t = transakcjaPodzialu();
    if (!t) return;
    zbierzPodzial();
    const cz = stan.podzial.czesci;

    if (cz.some(c => !c.category)) {
        pokazKomunikat('Wybierz kategorię w każdej części');
        return;
    }
    const kwoty = cz.slice(0, -1).map(c => groszeZPola(c.kwota));
    if (kwoty.some(gr => !Number.isFinite(gr) || gr <= 0)) {
        pokazKomunikat('Podaj kwotę każdej części (np. 25,50)');
        return;
    }
    const reszta = Math.abs(t.amount_gr) - kwoty.reduce((a, b) => a + b, 0);
    if (reszta <= 0) {
        pokazKomunikat('Części przekraczają kwotę transakcji');
        return;
    }

    // Kwoty ze znakiem transakcji (wydatek = ujemne)
    const splits = cz.map((c, i) => ({
        category: c.category,
        amount_gr: -(i < kwoty.length ? kwoty[i] : reszta)
    }));

    const { error } = await supabaseClient
        .from('transakcje')
        .update({ splits, category_manual: null })
        .eq('id', t.id);
    if (error) {
        pokazKomunikat('Nie udało się zapisać podziału: ' + error.message);
        return;
    }
    t.splits = splits;
    t.category_manual = null;
    stan.podzial = null;
    odswiezInterfejs();
    pokazKomunikat(`Podzielono na ${splits.length} części`);
}

async function usunPodzial(id) {
    const t = stan.transakcje.find(x => String(x.id) === String(id));
    if (!t) return;
    const { error } = await supabaseClient.from('transakcje').update({ splits: null }).eq('id', id);
    if (error) {
        pokazKomunikat('Nie udało się usunąć podziału: ' + error.message);
        return;
    }
    t.splits = null;
    stan.podzial = null;
    odswiezInterfejs();
    pokazKomunikat('Usunięto podział – wybierz kategorię');
}
