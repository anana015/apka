// =====================================================================
// EKRAN: TRANSAKCJE (specyfikacja, punkt 7.1)
//  - filtry: Wszystkie / Do przypisania / Przypisane (liczniki dla wybranego okresu)
//  - wybór miesiąca (jak na Pulpicie) + „Wszystkie miesiące”
//  - filtr kategorii i zakresu dat – wejście z Pulpitu („Wydatki według kategorii”)
//  - przełącznik „Zapamiętaj kategorię dla podobnych transakcji” (4.4)
//  - kolejność: data rosnąco w obrębie miesiąca (jak na wyciągu)
//  - usuwanie transakcji z potwierdzeniem pod wierszem (10.2, potwierdzenia.js)
// =====================================================================

const KLUCZ_ZAPAMIETAJ = 'budzet.zapamietajPodobne';
const WSZYSTKIE_MIESIACE = null;
const BEZ_KATEGORII = 'Nieprzypisane'; // nazwa grupy wydatków bez kategorii (jak w podsumuj())

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
    stan.potwierdzenie = null;
    odswiezTransakcje();
}

function wybierzMiesiacTransakcji(m) {
    stan.miesiacTransakcji = m || WSZYSTKIE_MIESIACE;
    stan.podzial = null;
    stan.potwierdzenie = null;
    odswiezTransakcje();
}

// Wyszukiwarka: zapis po krótkiej przerwie w pisaniu (lista nie przerysowuje się przy każdej literze)
const OPOZNIENIE_SZUKANIA_MS = 150;
let timerSzukania = null;
function szukajTransakcji(tekst) {
    clearTimeout(timerSzukania);
    timerSzukania = setTimeout(() => {
        stan.szukajTransakcji = String(tekst || '').trim();
        stan.podzial = null;
        stan.potwierdzenie = null;
        odswiezTransakcje();
    }, OPOZNIENIE_SZUKANIA_MS);
}

// Czy transakcja pasuje do wyszukiwania. Każde słowo zapytania musi wystąpić w kontrahencie,
// tytule, notatce, dacie, kategorii lub nazwie celu (bez wielkości liter i polskich znaków)
// albo w kwocie („123,45”, „123.45”, „-123,45” – znak nie ma znaczenia).
// k – gotowa klasyfikacja (kategoria z reguły też się liczy).
function pasujeDoSzukania(t, zapytanie, k = null) {
    const slowa = normalizuj(zapytanie).split(/\s+/).filter(Boolean);
    if (slowa.length === 0) return true;
    const tekst = normalizuj([
        t.counterparty, t.title, t.note, t.booked_on,
        k && k.kategoria, k && k.cel && k.cel.name,
        ...(k && k.podzial ? k.podzial.map(c => c.category) : [])
    ].filter(Boolean).join(' '));
    const kwota = (Math.abs(t.amount_gr) / 100).toFixed(2);
    const kwoty = `${kwota} ${kwota.replace('.', ',')}`;
    return slowa.every(s => tekst.includes(s) || kwoty.includes(s.replace(/^[+\-\u2212]/, '')));
}

function przejdzDoBezKategorii() {
    zmienZakladke('transakcje', { filtr: 'brak' });
}

function pasujeDoFiltra(wiersz, filtr) {
    if (filtr === 'brak') return wiersz.doPrzypisania;
    if (filtr === 'przypisane') return !wiersz.doPrzypisania;
    return true;
}

// Wydatek należy do kategorii: wprost, przez część podziału albo (BEZ_KATEGORII) bez kategorii.
// Zwrot (wpływ z wybraną kategorią) też należy do swojej kategorii – pomniejsza jej sumę.
function pasujeDoKategorii(k, kategoria) {
    if (k.typ === 'przychod') return !!k.kategoria && k.kategoria === kategoria;
    if (k.typ !== 'wydatek') return false;
    if (kategoria === BEZ_KATEGORII) return !k.kategoria && !k.podzial;
    return k.kategoria === kategoria || (!!k.podzial && k.podzial.some(c => c.category === kategoria));
}

function pasujeDoZakresu(t, zakres) {
    return (!zakres.od || t.booked_on >= zakres.od) && (!zakres.do || t.booked_on <= zakres.do);
}

// Wejście z Pulpitu: lista transakcji jednej kategorii w okresie wybranym na Pulpicie
function pokazTransakcjeKategorii(kategoria) {
    const zakres = stan.trybFiltraPulpit === 'zakres'
        ? { od: stan.pulpitDataOd || '', do: stan.pulpitDataDo || '' }
        : null;
    zmienZakladke('transakcje', {
        kategoria,
        zakres,
        miesiac: zakres ? WSZYSTKIE_MIESIACE : stan.miesiacWybrany
    });
}

function wyczyscFiltrKategorii() {
    stan.filtrKategorii = null;
    stan.zakresTransakcji = null;
    stan.podzial = null;
    stan.potwierdzenie = null;
    odswiezTransakcje();
}

// "2026-10-05" -> "05.10.2026"
function dataPL(iso) {
    return iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '';
}

function opisZakresu(zakres) {
    if (zakres.od && zakres.do) return `${dataPL(zakres.od)} – ${dataPL(zakres.do)}`;
    if (zakres.od) return `od ${dataPL(zakres.od)}`;
    if (zakres.do) return `do ${dataPL(zakres.do)}`;
    return 'cały okres';
}

// Pasek nad filtrami: aktywna kategoria (i zakres dat), powrót na Pulpit, wyczyszczenie filtra
function rysujFiltrKategorii(kategoria, zakres) {
    const pasek = document.getElementById('transakcje-filtr-kategorii');
    if (!kategoria && !zakres) {
        pasek.classList.add('hidden');
        pasek.innerHTML = '';
        return;
    }
    const nazwa = kategoria === BEZ_KATEGORII ? 'Bez kategorii' : kategoria;
    pasek.classList.remove('hidden');
    pasek.innerHTML = `
        <div class="flex items-center justify-between gap-2 flex-wrap">
            <button type="button" data-klik="zmienZakladke('pulpit')" class="text-sm font-semibold text-[var(--accent)]">‹ Pulpit</button>
            <button type="button" data-klik="wyczyscFiltrKategorii()" class="text-[11px] text-[var(--muted)] underline">Pokaż wszystkie transakcje</button>
        </div>
        <div class="flex items-center gap-2 flex-wrap text-xs">
            ${kategoria ? `<span class="chip is-active !inline-flex items-center gap-1.5"><span class="dot" style="background:${esc(kolorKategorii(kategoria))}"></span>${esc(nazwa)}</span>` : ''}
            ${zakres ? `<span class="chip">${esc(opisZakresu(zakres))}</span>` : ''}
        </div>`;
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

// Kolor kwoty: wydatek w kategorii oszczędnościowej (np. Akcje/Obligacje) jak wpłata na oszczędności
function klasaKwoty(k) {
    return KLASA_KWOTY[czyWydatekOszczednosciowy(k) ? 'wplata' : k.typ] || '';
}

function prawaKolumna(t, k) {
    if (k.podzial) {
        return `<button type="button" data-klik="otworzPodzial('${esc(t.id)}')" class="status-label text-[var(--accent)] hover:underline" title="Zmień lub usuń podział">✂ Podzielona (${k.podzial.length})</button>`;
    }
    if (k.typ === 'wplata' && !k.celReczny) {
        // Wpłata rozpoznana po numerze subkonta celu -> etykieta statusu
        return `<span class="status-label text-[var(--c-save)]">Wpłata: ${esc(k.cel.name)}</span>`;
    }
    if (k.typ === 'wyplata') {
        // Wypłata ze skarbonek -> wybór celu (żółta ramka, gdy nieprzypisana)
        const celId = k.cel ? String(k.cel.id) : null;
        return `
            <select data-zmiana="zmienKategorieTransakcji('${esc(t.id)}', this.value)" aria-label="Skarbonka, z której jest wypłata" class="${KLASA_SELECT} ${k.cel ? 'border-[var(--border)]' : 'border-amber-400 ring-1 ring-amber-400'}">
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
    // „Pomiń” zaraz pod „Wybierz…”, żeby nie ginęła pod długą listą kategorii i skarbonek
    return `
        <select data-zmiana="zmienKategorieTransakcji('${esc(t.id)}', this.value)" aria-label="Kategoria transakcji" class="${KLASA_SELECT} ${bezKat ? 'border-amber-400 ring-1 ring-amber-400' : 'border-[var(--border)]'}">
            <option value="">Wybierz kategorię...</option>
            <option value="${POMIN}" ${k.typ === 'pominiete' ? 'selected' : ''}>${POMIN} (nie licz w sumach)</option>
            <optgroup label="Kategorie">${opcjeKategorii}</optgroup>
            ${opcjeCelow ? `<optgroup label="Skarbonki">${opcjeCelow}</optgroup>` : ''}
            ${moznaPodzielic(t, k) ? `<option value="${PODZIEL}">✂ Podziel na kilka kategorii…</option>` : ''}
        </select>`;
}

function wierszTransakcji({ t, k }) {
    // Przy filtrze kategorii część podziału z tej kategorii jest wyróżniona
    const opisPodzialu = k.podzial ? k.podzial.map(c => {
        const tekst = `${esc(c.category)} ${(Math.abs(c.amount_gr) / 100).toFixed(2)} zł`;
        return c.category === stan.filtrKategorii ? `<strong class="text-[var(--fg)]">${tekst}</strong>` : tekst;
    }).join(' · ') : '';
    const id = esc(t.id);
    return `
        <article class="card text-xs">
          <div class="flex justify-between items-start gap-3">
            <div class="flex-1 min-w-0">
                <p class="font-semibold truncate">${esc(t.counterparty || 'Brak kontrahenta')}</p>
                ${t.title ? `<p class="text-[11px] text-[var(--muted)] line-clamp-2 mt-0.5 leading-tight">${esc(t.title)}</p>` : ''}
                ${t.account_number && (k.typ === 'wplata' || k.typ === 'wyplata') ? `<p class="text-[10px] text-[var(--accent)] font-mono mt-0.5 truncate">Konto: ${esc(t.account_number)}</p>` : ''}
                ${opisNotatkiWWierszu(t)}
                <time class="inline-block text-[10px] text-[var(--muted)] mt-1" datetime="${esc(t.booked_on)}">${esc(t.booked_on)}</time>${k.typ === 'przychod' && k.kategoria
                    ? `<span class="text-[10px] text-[var(--muted)]"> · ${czyKategoriaOszczednosciowa(k.kategoria) ? 'wypłata z oszczędności' : 'zwrot – pomniejsza wydatki kategorii'}</span>` : ''}
                ${k.podzial ? `<p class="text-[10px] text-[var(--muted)] mt-0.5">${opisPodzialu}</p>` : ''}
            </div>
            <div class="text-right shrink-0 flex flex-col items-end gap-1.5">
                <div class="flex items-center gap-1">
                    <span class="font-bold kwota ${klasaKwoty(k)}">${(t.amount_gr / 100).toFixed(2)} zł</span>
                    <button type="button" data-klik="otworzSzczegolyTransakcji('${id}')" class="${t.note || t.receipt_path ? 'text-[var(--accent)]' : 'text-[var(--muted)]'} hover:text-[var(--accent)] transition p-1"
                        title="Notatka i paragon" aria-label="Notatka i paragon" aria-expanded="${stan.szczegolyTransakcji === String(t.id)}">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.4 11.6-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/></svg>
                    </button>
                    <button type="button" id="btn-usun-${id}" data-klik="pytajOUsuniecieTransakcji('${id}')" class="text-[var(--muted)] hover:text-[var(--c-spend)] transition p-1"
                        title="Usuń transakcję" aria-label="Usuń transakcję" aria-expanded="${czyPotwierdzenie('transakcja', t.id)}">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                </div>
                <div>${prawaKolumna(t, k)}</div>
            </div>
          </div>
          ${edytorPodzialu(t)}
          ${panelSzczegolowTransakcji(t)}
          ${panelUsuwaniaTransakcji(t)}
        </article>`;
}

// ---- Główne odświeżenie ----------------------------------------------

function odswiezTransakcje() {
    const lista = document.getElementById('lista-transakcji');
    const filtr = stan.filtrTransakcji || 'wszystkie';
    const kategoria = stan.filtrKategorii;
    const zakres = stan.zakresTransakcji;
    const szukaj = stan.szukajTransakcji || '';

    rysujFiltrKategorii(kategoria, zakres);

    // Klasyfikacja raz na transakcję, kolejność: data rosnąco (jak na wyciągu).
    // Filtr kategorii i zakresu dat zawęża wszystko poniżej (liczniki, miesiące, listę).
    const wszystkie = stan.transakcje
        .slice()
        .sort((a, b) => a.booked_on.localeCompare(b.booked_on) || String(a.id).localeCompare(String(b.id)))
        .map(t => {
            const k = klasyfikuj(t);
            return { t, k, doPrzypisania: czyKlasyfikacjaDoPrzypisania(k) };
        })
        .filter(w => (!kategoria || pasujeDoKategorii(w.k, kategoria)) && (!zakres || pasujeDoZakresu(w.t, zakres)) &&
            (!szukaj || pasujeDoSzukania(w.t, szukaj, w.k)));

    // Miesiące z transakcjami (najnowszy pierwszy); nieistniejący wybór -> wszystkie
    const miesiace = Array.from(new Set(wszystkie.map(w => w.t.booked_on.substring(0, 7)))).sort().reverse();
    if (stan.miesiacTransakcji && !miesiace.includes(stan.miesiacTransakcji)) {
        stan.miesiacTransakcji = WSZYSTKIE_MIESIACE;
    }
    // Wyszukiwanie i zakres dat z Pulpitu obejmują wszystkie miesiące
    const miesiac = zakres || szukaj ? WSZYSTKIE_MIESIACE : stan.miesiacTransakcji;
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

    // Wybór miesiąca: liczba pozycji pasujących do filtra w każdym miesiącu.
    // Przy zakresie dat z Pulpitu okres jest już ustalony – miesięcy nie pokazujemy.
    const kontenerMiesiecy = document.getElementById('transakcje-miesiace');
    kontenerMiesiecy.classList.toggle('hidden', !!zakres || !!szukaj);
    const naMiesiac = {};
    wszystkie.forEach(w => {
        if (!pasujeDoFiltra(w, filtr)) return;
        const m = w.t.booked_on.substring(0, 7);
        naMiesiac[m] = (naMiesiac[m] || 0) + 1;
    });
    const chipMiesiaca = (wartosc, etykieta, ile) => {
        const wybrany = (wartosc || null) === (miesiac || null);
        const pokazLicznik = filtr !== 'wszystkie' || kategoria;
        return `<button type="button" data-klik="wybierzMiesiacTransakcji(${wartosc ? `'${esc(wartosc)}'` : 'null'})" class="chip ${wybrany ? 'is-active' : ''}" aria-pressed="${wybrany}">${esc(etykieta)}${pokazLicznik ? ` <span class="opacity-70">(${ile || 0})</span>` : ''}</button>`;
    };
    const sumaFiltra = Object.values(naMiesiac).reduce((a, b) => a + b, 0);
    kontenerMiesiecy.innerHTML =
        chipMiesiaca(null, 'Wszystkie miesiące', sumaFiltra) +
        miesiace.map(m => chipMiesiaca(m, nazwaMiesiaca(m), naMiesiac[m])).join('');

    const przelacznik = document.getElementById('przelacznik-zapamietaj');
    przelacznik.checked = zapamietujPodobne();

    // Lista
    const dane = wOkresie.filter(w => pasujeDoFiltra(w, filtr));
    const podsumowanie = document.getElementById('transakcje-podsumowanie');

    if (dane.length === 0) {
        podsumowanie.innerText = '';
        const wOkresieTekst = zakres ? ` (${opisZakresu(zakres)})` : miesiac ? ` w ${nazwaMiesiacaMiejscownik(miesiac)}` : '';
        const nazwaKat = kategoria === BEZ_KATEGORII ? 'bez kategorii' : `w kategorii ${kategoria}`;
        const komunikat = stan.transakcje.length === 0
            ? 'Brak transakcji. Zaimportuj wyciąg w zakładce Import.'
            : szukaj ? `Nic nie pasuje do „${szukaj}”${filtr !== 'wszystkie' || kategoria ? ' przy wybranych filtrach' : ''}.`
            : kategoria ? `Brak transakcji ${nazwaKat}${wOkresieTekst}.`
            : filtr === 'brak' ? `Wszystkie transakcje${wOkresieTekst} mają kategorię.`
            : filtr === 'przypisane' ? `Brak przypisanych transakcji${wOkresieTekst}.`
            : `Brak transakcji${wOkresieTekst}.`;
        lista.innerHTML = `<div class="card text-center text-xs text-[var(--muted)] py-8">${esc(komunikat)}</div>`;
        return;
    }

    const s = podsumuj(dane.map(w => w.t));
    // Przy filtrze kategorii liczymy tylko części z tej kategorii – suma = kwota z Pulpitu
    const wKategorii = kategoria ? (s.kategorie[kategoria] || s.kategorieOszczednosci[kategoria] || 0) : 0;
    const prefiksSzukania = szukaj ? `Wyniki dla „${szukaj}” we wszystkich miesiącach: ` : '';
    podsumowanie.innerText = prefiksSzukania + (kategoria
        ? `${dane.length} ${odmianaTransakcji(dane.length)} · razem w kategorii ${zl(wKategorii, 2)}`
        : `${dane.length} ${odmianaTransakcji(dane.length)} · wpływy ${zl(s.przychody + s.wyplaty, 2)} · wydatki ${zl(s.wydatki, 2)}` +
            (s.zwroty ? ` (po odjęciu zwrotów ${zl(s.zwroty, 2)})` : '') +
            (s.inwestycje ? ` · odłożone w kategoriach ${zl(s.inwestycje, 2)}` : ''));

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
    return odmiana(n, 'transakcja', 'transakcje', 'transakcji');
}

// ---- Usuwanie transakcji (potwierdzenie pod wierszem, 10.2) ----------

function pytajOUsuniecieTransakcji(id) {
    if (czyPotwierdzenie('transakcja', id)) return anulujUsuwanieTransakcji(id); // drugi klik w kosz zamyka
    stan.podzial = null;
    stan.szczegolyTransakcji = null;
    otworzPotwierdzenie('transakcja', id, odswiezTransakcje);
}

function anulujUsuwanieTransakcji(id) {
    zamknijPotwierdzenie(odswiezTransakcje, `btn-usun-${id}`);
}

function panelUsuwaniaTransakcji(t) {
    if (!czyPotwierdzenie('transakcja', t.id)) return '';
    const id = esc(t.id);
    const znikna = [t.note && 'notatka', t.receipt_path && 'zdjęcie paragonu'].filter(Boolean);
    const opis = [
        znikna.length ? `Razem z nią ${znikna.length > 1 ? 'znikną' : 'zniknie'} ${znikna.join(' i ')}.` : '',
        // Klucz duplikatu znika razem z transakcją, więc ponowny import ją doda
        'Jeśli ponownie zaimportujesz ten wyciąg, transakcja wróci.'
    ].filter(Boolean).join(' ');
    return htmlPotwierdzenia({
        rodzaj: 'transakcja',
        id: t.id,
        pytanie: 'Usunąć tę transakcję?',
        opis,
        tak: 'Usuń',
        tekstWTrakcie: 'Usuwam…',
        akcjaTak: `usunTransakcje('${id}')`,
        akcjaNie: `anulujUsuwanieTransakcji('${id}')`,
        klasa: 'mt-2 pt-2 border-t border-[var(--border)]'
    });
}

// Wywoływane tylko przyciskiem „Usuń” w potwierdzeniu.
// Plik paragonu kasujemy dopiero, gdy minie czas na „Cofnij” (komunikat zniknie bez cofnięcia).
async function usunTransakcje(id) {
    const usuwana = stan.transakcje.find(t => String(t.id) === String(id));
    const udane = await wykonajPotwierdzenie('transakcja', id, odswiezTransakcje, async () => {
        const { error } = await supabaseClient.from('transakcje').delete().eq('id', id);
        if (error) {
            pokazKomunikat(komunikatBledu(error, 'Nie udało się usunąć transakcji'));
            return false;
        }
        stan.transakcje = stan.transakcje.filter(t => String(t.id) !== String(id));
        return true;
    });
    if (!udane) return;
    odswiezPoZmianie();
    if (!usuwana) return pokazKomunikat('Usunięto transakcję');
    const kopia = { ...usuwana };
    pokazKomunikat(`Usunięto transakcję: ${usuwana.counterparty || usuwana.title || zlZeZnakiem(usuwana.amount_gr)}`, {
        akcja: { etykieta: COFNIJ, wykonaj: () => przywrocTransakcje(kopia) },
        poWygasnieciu: () => usunPlikParagonu(kopia.receipt_path)
    });
}

async function przywrocTransakcje(kopia) {
    const wiersz = await przywrocWiersz('transakcje', kopia, 'Nie przywrócono transakcji');
    if (!wiersz) return usunPlikParagonu(kopia.receipt_path); // nie wróciła – plik już niepotrzebny
    stan.transakcje = [...stan.transakcje, wiersz];
    odswiezPoZmianie();
    pokazKomunikat('Przywrócono transakcję');
}

// ---- Zapis kategorii -------------------------------------------------

async function zmienKategorieTransakcji(id, nowaKat) {
    if (nowaKat === PODZIEL) {
        otworzPodzial(id);
        return;
    }
    const t = stan.transakcje.find(x => String(x.id) === String(id));
    if (!t) return;
    const wartosc = nowaKat || null;
    const poprzednia = t.category_manual ?? null;
    let zmianaReguly = null; // do „Cofnij”: { nowa: regula } albo { regula, poprzedniaKategoria }

    const { error } = await supabaseClient
        .from('transakcje')
        .update({ category_manual: wartosc })
        .eq('id', id);

    if (error) {
        pokazKomunikat(komunikatBledu(error, 'Błąd zapisu kategorii'));
        odswiezTransakcje(); // przywraca poprzednią wartość listy
        return;
    }
    t.category_manual = wartosc;

    let komunikat = 'Zaktualizowano kategorię';

    // „Zapamiętaj dla podobnych” (4.4): reguła z dwóch pierwszych sensownych słów.
    // Reguła zapisuje się w otwartym budżecie (wspólnym albo osobistym) – patrz db.js.
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
                    zmianaReguly = { nowa: insData[0] };
                    zapisano = true;
                }
            } else if (istniejaca.category !== wartosc) {
                const { error: errUpd } = await supabaseClient
                    .from('rules')
                    .update({ category: wartosc })
                    .eq('id', istniejaca.id);
                if (!errUpd) {
                    zmianaReguly = { regula: istniejaca, poprzedniaKategoria: istniejaca.category };
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
    pokazKomunikat(komunikat, {
        akcja: { etykieta: COFNIJ, wykonaj: () => cofnijZmianeKategorii(id, poprzednia, zmianaReguly) }
    });
}

// „Cofnij” po zmianie kategorii: poprzedni wybór transakcji i reguła sprzed zmiany
async function cofnijZmianeKategorii(id, poprzednia, zmianaReguly) {
    const t = stan.transakcje.find(x => String(x.id) === String(id));
    if (!t) return;
    const { error } = await supabaseClient.from('transakcje').update({ category_manual: poprzednia }).eq('id', id);
    if (error) return pokazKomunikat(komunikatBledu(error, 'Nie cofnięto zmiany'));
    t.category_manual = poprzednia;

    let bladReguly = null;
    if (zmianaReguly && zmianaReguly.nowa) {
        ({ error: bladReguly } = await supabaseClient.from('rules').delete().eq('id', zmianaReguly.nowa.id));
        if (!bladReguly) dynamiczneReguly = dynamiczneReguly.filter(r => r !== zmianaReguly.nowa);
    } else if (zmianaReguly && zmianaReguly.regula) {
        const { regula, poprzedniaKategoria } = zmianaReguly;
        ({ error: bladReguly } = await supabaseClient.from('rules').update({ category: poprzedniaKategoria }).eq('id', regula.id));
        if (!bladReguly) regula.category = poprzedniaKategoria;
    }
    odswiezInterfejs();
    pokazKomunikat(bladReguly
        ? komunikatBledu(bladReguly, 'Przywrócono kategorię transakcji, ale nie regułę')
        : 'Cofnięto zmianę kategorii');
}

// =====================================================================
// PODZIAŁ TRANSAKCJI NA 2–5 KATEGORII (rzadko używany, ukryty na dole listy kategorii)
// Zapis: kolumna transakcje.splits = [{ category, amount_gr }], kwoty ujemne jak transakcja.
// Ostatnia część = reszta, więc suma zawsze równa się kwocie transakcji.
// Podział nie tworzy reguły „Zapamiętaj dla podobnych”.
// =====================================================================

const PODZIEL = '__PODZIEL__';
const MAKS_CZESCI = 5;

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
    stan.szczegolyTransakcji = null;
    stan.potwierdzenie = null;
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
        `<option value="${POMIN}" ${wybrana === POMIN ? 'selected' : ''}>${POMIN} (nie licz)</option>` +
        stan.kategorie.map(kat => `<option value="${esc(kat.name)}" ${wybrana === kat.name ? 'selected' : ''}>${esc(kat.name)}</option>`).join('');

    const wiersze = cz.map((c, i) => {
        const ostatnia = i === n - 1;
        return `
            <div class="flex items-center gap-2">
                <select data-podzial-kat="${i}" aria-label="Kategoria części ${i + 1}" class="${KLASA_SELECT} border-[var(--border)] flex-1 !max-w-none">${opcje(c.category)}</select>
                ${ostatnia
                    ? `<span id="podzial-reszta" class="kwota w-24 text-right font-semibold" aria-live="polite" title="Reszta kwoty transakcji"></span>`
                    : `<input type="text" inputmode="decimal" data-podzial-kwota="${i}" value="${esc(c.kwota)}" data-wpis="przeliczReszte()" placeholder="0,00" aria-label="Kwota części ${i + 1} w zł" class="input !w-24 !py-1 text-right kwota">`}
                ${n > 2
                    ? `<button type="button" data-klik="usunCzescPodzialu(${i})" class="p-1 text-[var(--muted)] hover:text-[var(--c-spend)]" aria-label="Usuń część ${i + 1}">✕</button>`
                    : '<span class="w-6 shrink-0" aria-hidden="true"></span>'}
            </div>`;
    }).join('');

    return `
        <div class="mt-2 pt-2 border-t border-[var(--border)] space-y-2" role="group" aria-label="Podział transakcji">
            <p class="text-[11px]"><span class="font-semibold">Podział ${(Math.abs(t.amount_gr) / 100).toFixed(2)} zł</span>
                <span class="text-[var(--muted)]"> · ostatnia część to reszta kwoty</span></p>
            ${wiersze}
            <div class="flex flex-wrap gap-2 pt-1">
                ${n < MAKS_CZESCI ? `<button type="button" data-klik="dodajCzescPodzialu()" class="chip">+ Dodaj część</button>` : ''}
                <button type="button" data-klik="zapiszPodzial()" class="chip is-active">Zapisz podział</button>
                <button type="button" data-klik="anulujPodzial()" class="chip">Anuluj</button>
                ${t.splits ? `<button type="button" data-klik="usunPodzial('${esc(t.id)}')" class="chip !text-[var(--c-spend)] ml-auto">Usuń podział</button>` : ''}
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
        pokazKomunikat(komunikatBledu(error, 'Nie udało się zapisać podziału'));
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
        pokazKomunikat(komunikatBledu(error, 'Nie udało się usunąć podziału'));
        return;
    }
    t.splits = null;
    stan.podzial = null;
    odswiezInterfejs();
    pokazKomunikat('Usunięto podział – wybierz kategorię');
}
