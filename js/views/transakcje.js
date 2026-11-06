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
    odswiezTransakcje();
}

function wybierzMiesiacTransakcji(m) {
    stan.miesiacTransakcji = m || WSZYSTKIE_MIESIACE;
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
        </select>`;
}

function wierszTransakcji({ t, k }) {
    return `
        <article class="card flex justify-between items-start gap-3 text-xs">
            <div class="flex-1 min-w-0">
                <p class="font-semibold truncate">${esc(t.counterparty || 'Brak kontrahenta')}</p>
                ${t.title ? `<p class="text-[11px] text-[var(--muted)] line-clamp-2 mt-0.5 leading-tight">${esc(t.title)}</p>` : ''}
                ${t.account_number ? `<p class="text-[10px] text-[var(--accent)] font-mono mt-0.5 truncate">Konto: ${esc(t.account_number)}</p>` : ''}
                <time class="inline-block text-[10px] text-[var(--muted)] mt-1" datetime="${esc(t.booked_on)}">${esc(t.booked_on)}</time>
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
                    x !== t && !kategoriaReczna(x) && klasyfikuj(x).typ === 'wydatek' && pasujeFraza(x, fraza)
                ).length;
                komunikat = `Zapamiętano: ${fraza} → ${wartosc}` + (podobne > 0 ? ` (+${podobne} podobnych)` : '');
            }
        }
    }

    odswiezInterfejs();
    pokazKomunikat(komunikat);
}
