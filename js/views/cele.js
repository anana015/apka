// =====================================================================
// EKRAN: CELE (specyfikacja, rozdział 8)
//  - lista celów (8.2): kafelki, karty ze statusem, licznik „Za wolno”
//  - szczegóły celu (8.3): pierścień postępu, zalecenie, kafelki, wykres,
//    ostatnie operacje, „Edytuj cel” i „Zakończ cel”
//  - operacje ręczne (migracja 2026-11h): wpłaty i wypłaty spoza wyciągu konta głównego
//  - formularz celu (8.4): saldo początkowe, opis, walidacja, kolor z palety,
//    1–3 progi oprocentowania, numer subkonta opcjonalny
//  - usunięcie i zakończenie celu z potwierdzeniem na ekranie (10.2, potwierdzenia.js)
// Przypisanie transakcji do celu (numer subkonta / słowa wypłat) – w rules.js.
// Wzory (8.1), progi odsetek i operacje ręczne w obliczeniach – calc.js.
// =====================================================================

// Paleta 5 kolorów celów (8.4)
const PALETA_CELOW = ['#2F5FB3', '#2A9D8F', '#D08A2C', '#C2508A', '#6B5BB5'];
const MAKS_NAZWA_CELU = 40;
const NOWY_CEL_ID = '__nowy__';
const MAKS_OPIS_OPERACJI = 80;
const MAKS_KWOTA_OPERACJI_GR = 1000000000;   // 10 mln zł – ochrona przed literówką
const NAJWCZESNIEJSZA_DATA_OPERACJI = '2000-01-01';
const SALDO_PRZYKLADU_ODSETEK_GR = 1000000;   // 10 000 zł, gdy w formularzu nie ma jeszcze kwoty celu

// Kolor celu: zapisany w bazie; dla starszych celów bez koloru – z palety wg kolejności
function kolorCelu(cel) {
    if (cel && cel.color) return cel.color;
    const i = Math.max(0, stan.cele.findIndex(c => String(c.id) === String(cel && cel.id)));
    return PALETA_CELOW[i % PALETA_CELOW.length];
}

// Kolor dla nowego celu: pierwszy z palety, którego nie używa żaden aktywny cel
function kolorDlaNowegoCelu() {
    const zajete = new Set(stan.cele.filter(c => !c.archived).map(c => String(kolorCelu(c)).toUpperCase()));
    return PALETA_CELOW.find(k => !zajete.has(k.toUpperCase())) || PALETA_CELOW[stan.cele.length % PALETA_CELOW.length];
}

const STATUSY_CELU = {
    'osiagniety': { tekst: 'Cel osiągnięty', klasa: 'text-[var(--c-income)]' },
    'zdazysz': { tekst: 'Zdążysz', klasa: 'text-[var(--c-income)]' },
    'za-wolno': { tekst: 'Za wolno', klasa: 'text-[var(--c-spend)]' },
    'bez-terminu': { tekst: 'Bez terminu', klasa: 'text-[var(--muted)]' }
};

function etykietaStatusu(status) {
    const s = STATUSY_CELU[status] || STATUSY_CELU['bez-terminu'];
    return `<span class="status-label ${s.klasa}">${s.tekst}</span>`;
}

// "2027-06" -> "czerwiec 2027"
function miesiacRok(klucz) {
    return klucz ? nazwaMiesiaca(klucz).toLowerCase() : '—';
}

// "2027-06" -> "czerwca 2027" (po „do …”)
function miesiacRokDopelniacz(klucz) {
    return klucz ? `${MIESIACE_DOPELNIACZ[Number(klucz.slice(5, 7)) - 1]} ${klucz.slice(0, 4)}` : '—';
}

// 0.5 -> "0,5%"
function stopaTekst(stopa) {
    return `${String(+Number(stopa).toFixed(2)).replace('.', ',')}%`;
}

// Opis progów: "0,5% rocznie od nadwyżki ponad 1 000 zł" / "do 1 000 zł: 0% · 1 000–50 000 zł: 5% · od 50 000 zł: 1% (…)"
function opisProgow(oprocentowanie) {
    const { tryb, progi } = oprocentowanie;
    if (!progi.some(p => p.stopa > 0)) return 'bez oprocentowania';
    if (progi.length === 1) {
        const p = progi[0];
        if (p.od === 0) return `${stopaTekst(p.stopa)} rocznie od całego salda`;
        return tryb === 'calosc'
            ? `${stopaTekst(p.stopa)} rocznie od całego salda, gdy saldo sięga ${zl(p.od)}`
            : `${stopaTekst(p.stopa)} rocznie od nadwyżki ponad ${zl(p.od)}`;
    }
    const czesci = progi.map((p, i) => {
        const nastepny = progi[i + 1];
        const zakres = !nastepny ? `od ${zl(p.od)}` : p.od === 0 ? `do ${zl(nastepny.od)}` : `${zl(p.od)}–${zl(nastepny.od)}`;
        return `${zakres}: ${stopaTekst(p.stopa)}`;
    });
    if (progi[0].od > 0) czesci.unshift(`do ${zl(progi[0].od)}: 0%`);
    return `${czesci.join(' · ')} (${tryb === 'calosc' ? 'całe saldo według progu' : 'każda część salda osobno'})`;
}

// 'RRRR-MM-DD' -> '20.02.2027'
function dataKrotko(iso) {
    return /^\d{4}-\d{2}-\d{2}/.test(String(iso)) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '—';
}

// Ostatni dzień promocji (p.do to pierwszy dzień bez promocji)
function ostatniDzienPromocji(p) {
    return isoZDaty(dataUTC(p.do) - DZIEN_MS);
}

function dniDo(iso, dzis) {
    return Math.round((dataUTC(iso) - dataUTC(dzis)) / DZIEN_MS);
}

// Stan promocji w dniu dzis: 'przed' | 'trwa' | 'po' (null = brak promocji)
function stanPromocji(p, dzis) {
    if (!p) return null;
    return dzis < p.od ? 'przed' : dzis < p.do ? 'trwa' : 'po';
}

// "promocja 7% do 50 000 zł: 01.11.2026–31.01.2027 (trwa, zostało 72 dni)"
function opisPromocji(p, dzis = dzisiejszaData()) {
    if (!p) return '';
    const stanTekst = {
        przed: `od ${dataKrotko(p.od)}`,
        trwa: `do ${dataKrotko(ostatniDzienPromocji(p))}, ${odmianaDni(dniDo(p.do, dzis))}`,
        po: `zakończona ${dataKrotko(ostatniDzienPromocji(p))}`
    }[stanPromocji(p, dzis)];
    return `promocja ${stopaTekst(p.stopa)}${p.limit > 0 ? ` do ${zl(p.limit)}` : ''} przez ${p.miesiace} mies. (${stanTekst})`;
}

// Liczba dni do końca promocji (ostatni dzień też się liczy): "zostało 5 dni"
function odmianaDni(n) {
    return n === 1 ? 'został 1 dzień' : `${odmiana(n, 'został', 'zostały', 'zostało')} ${n} ${odmiana(n, 'dzień', 'dni', 'dni')}`;
}

function opisOprocentowania(cel, dzis = dzisiejszaData()) {
    const oprocentowanie = progiOdsetek(cel);
    if (!czyOprocentowany(oprocentowanie)) return 'bez oprocentowania';
    const czesci = [opisProgow(oprocentowanie)];
    if (oprocentowanie.promocja) czesci.push(opisPromocji(oprocentowanie.promocja, dzis));
    const kapitalizacja = { 1: 'co miesiąc', 3: 'co kwartał', 12: 'raz w roku' }[MIESIECY_MIEDZY_KAPITALIZACJAMI] || '';
    return czesci.join('; ') + (kapitalizacja ? `, kapitalizacja ${kapitalizacja}` : '');
}

// Krótka informacja na karcie celu: promocja trwa (kończy się) albo skończyła się w ostatnich 30 dniach
const DNI_PRZYPOMNIENIA_PROMOCJI = 30;
function etykietaPromocjiNaKarcie(cel, dzis = dzisiejszaData()) {
    const p = progiOdsetek(cel).promocja;
    const stanP = stanPromocji(p, dzis);
    if (stanP === 'trwa') {
        const dni = dniDo(p.do, dzis);
        const blisko = dni <= DNI_PRZYPOMNIENIA_PROMOCJI;
        return { tekst: `Promocja ${stopaTekst(p.stopa)} do ${dataKrotko(ostatniDzienPromocji(p))}${blisko ? ` – ${odmianaDni(dni)}` : ''}`, uwaga: blisko };
    }
    if (stanP === 'po' && dniDo(dzis, p.do) < DNI_PRZYPOMNIENIA_PROMOCJI) {
        return { tekst: `Promocja skończyła się ${dataKrotko(ostatniDzienPromocji(p))} – sprawdź, gdzie przenieść środki`, uwaga: true };
    }
    return null;
}

// Analiza wszystkich celów naraz (klasyfikacja transakcji tylko raz). Aktywne cele dostają
// prognozę z odsetkami (prognozaCelu w calc.js) – z niej status „Zdążysz / Za wolno”,
// potrzebna wpłata i szacowany termin (8.1 bez odsetek byłby zbyt pesymistyczny przy wyższych stopach).
function analizyCelow(dzis = new Date()) {
    const ops = operacjeCelow();
    const M = ostatniMiesiacDanych();
    const wynik = {};
    stan.cele.forEach(c => {
        const a = analizaCelu(c, ops[c.id], M);
        if (!c.archived && c.target_gr > 0) zastosujPrognoze(a, prognozaCelu(c, a, dzis));
        wynik[c.id] = a;
    });
    return { wynik, ops, M };
}

function zastosujPrognoze(a, p) {
    a.prognoza = p;
    if (a.status === 'osiagniety') return;
    a.szacowanyKlucz = p.osiagniecie;
    if (!p.termin) return;
    a.status = p.zdazy ? 'zdazysz' : 'za-wolno';
    if (p.wymagana != null) a.potrzebna = p.wymagana;
}

// Licznik na zakładce „Cele” = liczba aktywnych celów „Za wolno” (8.2)
function liczCeleZaWolno() {
    if (!stan.cele || stan.cele.length === 0) return 0;
    const { wynik } = analizyCelow();
    return stan.cele.filter(c => !c.archived && wynik[c.id].status === 'za-wolno').length;
}

function celPoId(id) {
    return stan.cele.find(c => String(c.id) === String(id)) || null;
}

// ---- Nawigacja lista <-> szczegóły -----------------------------------

function otworzSzczegolyCelu(id) {
    stan.otwartyCel = String(id);
    stan.potwierdzenie = null;
    stan.operacjaCelu = null;
    zamknijFormularzCelu();
    document.getElementById('app-main').scrollTop = 0;
    odswiezCele();
}

function zamknijSzczegolyCelu() {
    stan.otwartyCel = null;
    stan.potwierdzenie = null;
    stan.operacjaCelu = null;
    document.getElementById('app-main').scrollTop = 0;
    odswiezCele();
}

function edytujZeSzczegolow(id) {
    stan.otwartyCel = null;
    stan.operacjaCelu = null;
    odswiezCele();
    otworzFormularzCelu(id);
}

// ---- Główne odświeżenie ----------------------------------------------

function odswiezCele() {
    const cel = stan.otwartyCel ? celPoId(stan.otwartyCel) : null;
    // Cel usunięty w międzyczasie. Przed wczytaniem danych (np. odświeżenie strony na #cele/<id>)
    // nie zamykamy szczegółów – cel pojawi się po pobraniu.
    if (stan.otwartyCel && !cel && stan.daneZaladowane) stan.otwartyCel = null;

    document.querySelectorAll('#tab-cele .cele-lista').forEach(el => el.classList.toggle('hidden', !!stan.otwartyCel));
    document.getElementById('cel-szczegoly').classList.toggle('hidden', !stan.otwartyCel);

    if (cel) rysujSzczegolyCelu(cel);
    else if (stan.otwartyCel) document.getElementById('cel-szczegoly').innerHTML = '<p class="card text-xs text-[var(--muted)]">Wczytywanie celu…</p>';
    else rysujListeCelow();
    if (stan.zakladka === 'cele') zapiszAdresWidoku();
}

// ---- 8.2 Lista celów -------------------------------------------------

function kartaCelu(c, a, zakonczony = false) {
    const procent = Math.round(a.postep * 100);
    const kolor = kolorCelu(c);
    const id = esc(c.id);
    return `
        <article class="card space-y-2.5 cursor-pointer hover:ring-1 hover:ring-[var(--border)] transition ${zakonczony ? 'opacity-70' : ''}" data-klik="otworzSzczegolyCelu('${id}')">
            <div class="flex justify-between items-start gap-2 text-xs">
                <div class="min-w-0">
                    <h3 class="font-bold text-sm truncate">${esc(c.name)}</h3>
                    ${c.note ? `<span class="text-[11px] block truncate">${esc(c.note)}</span>` : ''}
                    <span class="text-[10px] text-[var(--muted)] block truncate">${c.keyword ? `Subkonto: ${esc(c.keyword)}` : 'Bez subkonta – operacje ręczne'}</span>
                    ${c.keywords_out ? `<span class="text-[10px] text-[var(--muted)] block truncate">Słowa wypłat: ${esc(c.keywords_out)}</span>` : ''}
                </div>
                <div class="text-right shrink-0 space-y-1">
                    ${zakonczony ? '<span class="status-label text-[var(--muted)]">Zakończony</span>' : etykietaStatusu(a.status)}
                    <div class="whitespace-nowrap">
                        <span class="font-bold kwota" style="color:${esc(kolor)}">${zl(a.saldo)}</span>
                        <span class="text-[10px] text-[var(--muted)]"> / ${zl(c.target_gr)}</span>
                    </div>
                </div>
            </div>
            <div class="w-full bg-[var(--bg)] h-2.5 rounded-full overflow-hidden" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${procent}" aria-label="Postęp celu ${esc(c.name)}">
                <div class="h-full transition-all duration-500" style="width:${procent}%;background:${esc(kolor)}"></div>
            </div>
            <div class="flex justify-between items-center gap-2 text-[11px] text-[var(--muted)]">
                <span>Postęp: ${procent}%${a.terminKlucz ? ` · do ${esc(miesiacRokDopelniacz(a.terminKlucz))}`
                    : a.prognoza && a.prognoza.osiagniecie && a.status !== 'osiagniety' ? ` · ok. ${esc(miesiacRok(a.prognoza.osiagniecie))}` : ''}</span>
                <div class="space-x-3 whitespace-nowrap">
                    ${zakonczony
                        ? `<button type="button" data-klik="event.stopPropagation(); zakonczCel('${id}', false)" class="text-[var(--accent)] font-semibold hover:underline">Przywróć</button>`
                        : `<button type="button" data-klik="event.stopPropagation(); otworzFormularzCelu('${id}')" class="text-[var(--accent)] font-semibold hover:underline">Edytuj</button>`}
                    <button type="button" id="cel-usun-${id}" data-klik="event.stopPropagation(); pytajOUsuniecieCelu('${id}')" class="text-[var(--c-spend)] hover:underline"
                        aria-expanded="${czyPotwierdzenie('cel-usun', c.id)}">Usuń</button>
                    <button type="button" data-klik="event.stopPropagation(); otworzSzczegolyCelu('${id}')" class="text-[var(--fg)] font-semibold hover:underline">Szczegóły ›</button>
                </div>
            </div>
            ${htmlPromocjiNaKarcie(c)}
            ${potwierdzenieUsunieciaCelu(c)}
        </article>`;
}

function htmlPromocjiNaKarcie(c) {
    const e = c.archived ? null : etykietaPromocjiNaKarcie(c);
    if (!e) return '';
    return `<p class="text-[11px] font-semibold flex items-center gap-1.5 ${e.uwaga ? 'text-amber-700 dark:text-amber-300' : 'text-[var(--accent)]'}">
                <i data-lucide="${e.uwaga ? 'alarm-clock' : 'percent'}" class="w-3.5 h-3.5 shrink-0" aria-hidden="true"></i>${esc(e.tekst)}</p>`;
}

function potwierdzenieUsunieciaCelu(c) {
    if (!czyPotwierdzenie('cel-usun', c.id)) return '';
    const id = esc(c.id);
    const reczne = operacjeReczneCelu(c).length;
    return htmlPotwierdzenia({
        rodzaj: 'cel-usun',
        id: c.id,
        pytanie: `Usunąć cel „${c.name}”?`,
        opis: 'Transakcje zostaną, ale przestaną być przypisane do tego celu.' +
            (reczne ? ` Usuniesz też ${reczne} ${odmiana(reczne, 'operację ręczną', 'operacje ręczne', 'operacji ręcznych')}.` : '') +
            (c.archived ? '' : ' Jeśli chcesz zachować historię celu, zakończ go zamiast usuwać.'),
        tak: 'Usuń cel',
        tekstWTrakcie: 'Usuwam…',
        akcjaTak: `usunCel('${id}')`,
        akcjaNie: `anulujPotwierdzenieCelu('cel-usun-${id}')`,
        klasa: 'pt-2 border-t border-[var(--border)] cursor-default'
    });
}

function rysujListeCelow() {
    const lista = document.getElementById('lista-celow');
    const boxZakonczone = document.getElementById('cele-zakonczone-box');

    // Stan pusty (10.3): zachęta + formularz
    if (!stan.cele || stan.cele.length === 0) {
        lista.innerHTML = `<div class="card text-center text-xs text-[var(--muted)] py-6">Dodaj pierwszy cel, np. poduszkę finansową.</div>`;
        document.getElementById('cele-suma-ogolna').innerText = `0 zł`;
        document.getElementById('cele-suma-cel').innerText = '';
        document.getElementById('cele-wplacone').innerText = '0 zł';
        document.getElementById('cele-wplacone-proc').innerText = '';
        boxZakonczone.classList.add('hidden');
        document.getElementById('cele-porownanie').classList.add('hidden');
        if (stan.daneZaladowane && !stan.trybOffline && document.getElementById('modal-cel').classList.contains('hidden')) otworzFormularzCelu();
        return;
    }

    const { wynik, ops, M } = analizyCelow();
    const aktywne = stan.cele.filter(c => !c.archived);
    const zakonczone = stan.cele.filter(c => c.archived);

    // Kafelek 1: „Na subkontach” – suma sald (wszystkie cele) i „z X zł celu” (aktywne)
    const sumaSald = stan.cele.reduce((s, c) => s + wynik[c.id].saldo, 0);
    const sumaCelow = aktywne.reduce((s, c) => s + (c.target_gr || 0), 0);
    document.getElementById('cele-suma-ogolna').innerText = zl(sumaSald);
    document.getElementById('cele-suma-cel').innerText = `z ${zl(sumaCelow)} celu`;

    // Kafelek 2: „Wpłacone w [M]” – suma wpłat w M (przelewy i operacje ręczne, bez przeniesień między celami) i procent przychodów M
    const wplaconeM = stan.cele.reduce((s, c) =>
        s + ops[c.id].filter(o => o.typ === 'wplata' && o.klucz === M && !o.przeniesienie).reduce((x, o) => x + o.kwota, 0), 0);
    const przychodyM = podsumuj(stan.transakcje.filter(t => t.booked_on.startsWith(M))).przychody;
    document.getElementById('cele-wplacone-etykieta').innerText = `Wpłacone w ${nazwaMiesiacaMiejscownik(M)}`;
    document.getElementById('cele-wplacone').innerText = zl(wplaconeM);
    document.getElementById('cele-wplacone-proc').innerText =
        przychodyM > 0 ? `${Math.round((wplaconeM / przychodyM) * 100)}% przychodów` : 'brak przychodów w tym miesiącu';

    rysujPorownanieCelow(wynik);

    lista.innerHTML = aktywne.length
        ? aktywne.map(c => kartaCelu(c, wynik[c.id])).join('')
        : `<div class="card text-center text-xs text-[var(--muted)] py-6">Wszystkie cele są zakończone. Dodaj nowy cel.</div>`;

    boxZakonczone.classList.toggle('hidden', zakonczone.length === 0);
    document.getElementById('cele-zakonczone-licznik').innerText = zakonczone.length;
    document.getElementById('lista-celow-zakonczonych').innerHTML =
        zakonczone.map(c => kartaCelu(c, wynik[c.id], true)).join('');
}


// =====================================================================
// GDZIE TRZYMAĆ PIENIĄDZE – porównanie oprocentowania celów; przy końcu promocji
// podpowiedź, ile i dokąd przenieść, żeby odsetki były wyższe.
// =====================================================================

const KWOTA_PROBNA_GR = 100000;            // „kolejne 1 000 zł”
const MIN_ZYSK_PODPOWIEDZI_GR = 1000;      // podpowiadamy dopiero od 10 zł rocznie po podatku

/**
 * Czysta funkcja. cele: aktywne cele, salda: { [id]: grosze }, dzis: 'RRRR-MM-DD'.
 * Zwraca wiersze: { cel, saldo, opr, teraz, kolejne, poPromocji, stanPromocji } – stopy w % rocznie przed podatkiem:
 *  teraz – efektywna przy obecnym saldzie; kolejne – dla dołożonych 1 000 zł; poPromocji – efektywna po końcu promocji.
 */
function porownanieOprocentowania(cele, salda, dzis) {
    return cele.map(cel => {
        const opr = progiOdsetek(cel);
        const saldo = Math.max(0, salda[cel.id] || 0);
        const p = opr.promocja;
        const stanP = stanPromocji(p, dzis);
        return {
            cel, saldo, opr,
            teraz: stopaEfektywna(saldo, opr, dzis),
            kolejne: (odsetkiRoczneOdSalda(saldo + KWOTA_PROBNA_GR, opr, dzis) - odsetkiRoczneOdSalda(saldo, opr, dzis)) / KWOTA_PROBNA_GR * 100,
            poPromocji: stanP === 'trwa' || stanP === 'przed' ? stopaEfektywna(saldo, opr, p.do) : null,
            stanPromocji: stanP
        };
    });
}

/**
 * Czysta funkcja: dla celu, którego promocja kończy się w ciągu 30 dni (albo skończyła się w ostatnich 30),
 * najlepsze przeniesienie na inny cel liczone na dzień po końcu promocji.
 * Zwraca [{ z, do, kwota (gr), zysk (gr rocznie po podatku), dzien }].
 */
function podpowiedziPrzeniesienia(wiersze, dzis) {
    const wynik = [];
    for (const a of wiersze) {
        const p = a.opr.promocja;
        if (!p || !(a.saldo > 0)) continue;
        const stanP = stanPromocji(p, dzis);
        const blisko = (stanP === 'trwa' && dniDo(p.do, dzis) <= DNI_PRZYPOMNIENIA_PROMOCJI) ||
            (stanP === 'po' && dniDo(dzis, p.do) < DNI_PRZYPOMNIENIA_PROMOCJI);
        if (!blisko) continue;
        const dzien = p.do > dzis ? p.do : dzis;
        let najlepsza = null;
        for (const b of wiersze) {
            if (b === a) continue;
            const kandydaci = [a.saldo];
            const pb = promocjaWDniu(b.opr, dzien);
            if (pb && pb.limit > b.saldo && pb.limit - b.saldo < a.saldo) kandydaci.push(pb.limit - b.saldo);
            for (const x0 of kandydaci) {
                const x = Math.floor(x0 / 100) * 100; // pełne złote
                if (x <= 0) continue;
                const zysk = (odsetkiRoczneOdSalda(b.saldo + x, b.opr, dzien) - odsetkiRoczneOdSalda(b.saldo, b.opr, dzien)) -
                    (odsetkiRoczneOdSalda(a.saldo, a.opr, dzien) - odsetkiRoczneOdSalda(a.saldo - x, a.opr, dzien));
                const netto = zysk * (1 - PODATEK_BELKI);
                if (netto >= MIN_ZYSK_PODPOWIEDZI_GR && (!najlepsza || netto > najlepsza.zysk)) {
                    najlepsza = { z: a.cel, do: b.cel, kwota: x, zysk: netto, dzien };
                }
            }
        }
        if (najlepsza) wynik.push(najlepsza);
    }
    return wynik;
}

function rysujPorownanieCelow(wynik) {
    const kontener = document.getElementById('cele-porownanie');
    const dzis = dzisiejszaData();
    const aktywne = stan.cele.filter(c => !c.archived);
    const salda = Object.fromEntries(aktywne.map(c => [c.id, wynik[c.id].saldo]));
    const wiersze = porownanieOprocentowania(aktywne, salda, dzis);
    if (aktywne.length < 2 || !wiersze.some(w => czyOprocentowany(w.opr))) {
        kontener.classList.add('hidden');
        kontener.innerHTML = '';
        return;
    }
    const podpowiedzi = stan.trybOffline ? [] : podpowiedziPrzeniesienia(wiersze, dzis);
    const procentLubKreska = v => (v == null ? '—' : stopaTekst(v));
    const najwyzsza = Math.max(...wiersze.map(w => w.kolejne));
    kontener.classList.remove('hidden');
    kontener.innerHTML = `
        <section class="card space-y-2" aria-labelledby="por-tytul">
            <h2 id="por-tytul" class="font-semibold text-sm">Gdzie trzymać pieniądze</h2>
            ${podpowiedzi.map(pp => `
                <div class="p-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800/60 dark:text-amber-100 text-xs space-y-2">
                    <p><strong>Promocja na „${esc(pp.z.name)}” ${pp.dzien > dzis ? `kończy się ${esc(dataKrotko(ostatniDzienPromocji(progiOdsetek(pp.z).promocja)))}` : 'już się skończyła'}.</strong>
                       Przeniesienie ${zl(pp.kwota)} na „${esc(pp.do.name)}” da ok. <strong>+${zl(pp.zysk)} rocznie</strong> po podatku.
                       Pamiętaj, że zmieni to postęp obu celów.</p>
                    <button type="button" data-klik="otworzPrzeniesienie('${esc(pp.z.id)}', '${esc(pp.do.id)}', ${pp.kwota})" class="btn-secondary !w-auto">Przenieś ${zl(pp.kwota)}…</button>
                </div>`).join('')}
            <details ${podpowiedzi.length ? '' : 'open'}>
                <summary class="cursor-pointer text-xs font-semibold text-[var(--muted)]">Oprocentowanie celów – porównanie (${wiersze.length})</summary>
                <div class="scroll-box mt-2">
                    <table class="w-full text-xs">
                        <thead class="text-[10px] text-[var(--muted)]">
                            <tr><th class="text-left font-normal pb-1">Cel</th>
                                <th class="text-right font-normal pb-1">Saldo</th>
                                <th class="text-right font-normal pb-1">Teraz</th>
                                <th class="text-right font-normal pb-1">Kolejne 1 000 zł</th>
                                <th class="text-right font-normal pb-1">Po promocji</th></tr>
                        </thead>
                        <tbody>${wiersze.slice().sort((x, y) => y.kolejne - x.kolejne).map(w => `
                            <tr class="border-t border-[var(--border)]">
                                <td class="py-1.5 pr-1"><span class="dot mr-1" style="background:${esc(kolorCelu(w.cel))}"></span>${esc(w.cel.name)}</td>
                                <td class="py-1.5 text-right kwota whitespace-nowrap">${zl(w.saldo)}</td>
                                <td class="py-1.5 text-right kwota">${procentLubKreska(w.teraz)}</td>
                                <td class="py-1.5 text-right kwota ${w.kolejne === najwyzsza && najwyzsza > 0 ? 'font-bold text-[var(--c-income)]' : ''}">${procentLubKreska(w.kolejne)}</td>
                                <td class="py-1.5 text-right kwota ${w.poPromocji != null && w.poPromocji < w.teraz ? 'text-[var(--c-spend)]' : ''}">${procentLubKreska(w.poPromocji)}</td>
                            </tr>`).join('')}</tbody>
                    </table>
                </div>
                <p class="text-[10px] text-[var(--muted)] mt-1">Stopy roczne przed podatkiem, z progami i promocjami. „Kolejne 1 000 zł” – ile dałoby dołożenie 1 000 zł do celu; najwyższa jest wyróżniona.</p>
            </details>
        </section>`;
    if (typeof odswiezIkony === 'function') odswiezIkony();
}

// ---- 8.3 Szczegóły celu ----------------------------------------------

function pierscienPostepu(postep, kolor) {
    const r = 38;
    const obwod = 2 * Math.PI * r;
    const procent = Math.round(postep * 100);
    return `
        <svg viewBox="0 0 88 88" class="w-24 h-24 shrink-0" role="img" aria-label="Postęp ${procent}%">
            <circle cx="44" cy="44" r="${r}" fill="none" stroke="var(--bg)" stroke-width="9"/>
            <circle cx="44" cy="44" r="${r}" fill="none" stroke="${esc(kolor)}" stroke-width="9" stroke-linecap="round"
                stroke-dasharray="${(obwod * postep).toFixed(1)} ${obwod.toFixed(1)}" transform="rotate(-90 44 44)"/>
            <text x="44" y="49" text-anchor="middle" style="fill:var(--fg);font-size:17px;font-weight:700;font-family:'IBM Plex Mono',monospace">${procent}%</text>
        </svg>`;
}

function zalecenieCelu(a) {
    if (a.status === 'osiagniety') {
        return 'Cel osiągnięty. Nadwyżkę możesz przenieść na inny cel.';
    }
    if (a.status === 'bez-terminu') {
        if (!a.szacowanyKlucz) return 'Cel nie ma terminu i w ostatnich 6 miesiącach nie było wpłat. Zacznij wpłacać albo ustaw termin w edycji celu – wtedy policzymy potrzebną kwotę.';
        return a.srednia > 0
            ? `Cel nie ma terminu. Przy średniej wpłacie ${zl(a.srednia)} miesięcznie osiągniesz go około: ${miesiacRok(a.szacowanyKlucz)}.`
            : `Cel nie ma terminu i w ostatnich 6 miesiącach nie było wpłat – same odsetki doprowadzą go do celu około: ${miesiacRok(a.szacowanyKlucz)}.`;
    }
    if (a.status === 'zdazysz') {
        return (a.srednia > 0 ? `Przy średniej wpłacie ${zl(a.srednia)} miesięcznie zdążysz przed terminem` : 'Dzięki odsetkom zdążysz przed terminem nawet bez kolejnych wpłat') +
            (a.szacowanyKlucz ? `. Szacowany termin osiągnięcia celu: ${miesiacRok(a.szacowanyKlucz)}.` : '.');
    }
    // Za wolno: Y i Z zaokrąglone w górę do 10 zł
    const Y = wGoreDo10zl(a.potrzebna);
    const Z = wGoreDo10zl(a.potrzebna - a.srednia);
    return `Żeby zdążyć do terminu (${miesiacRok(a.terminKlucz)}), wpłacaj ${zl(Y)} miesięcznie, czyli o ${zl(Z)} więcej niż obecnie. ` +
        (a.szacowanyKlucz
            ? `W obecnym tempie cel osiągniesz około: ${miesiacRok(a.szacowanyKlucz)}.`
            : 'W ostatnich 6 miesiącach nie było wpłat, więc nie da się oszacować terminu.');
}

// Liczby prognozy pod zaleceniem: saldo na termin, odsetki, ile zabraknie albo zostanie
function htmlPrognozyCelu(c, a) {
    const p = a.prognoza;
    if (!p || a.status === 'osiagniety') return '';
    const promocja = progiOdsetek(c).promocja;
    const zPromocja = promocja && stanPromocji(promocja, dzisiejszaData()) !== 'po'
        ? ` i promocję ${stopaTekst(promocja.stopa)} do ${dataKrotko(ostatniDzienPromocji(promocja))}` : '';
    const zalozenia = `Założenia: co miesiąc ${zl(a.srednia)} (średnia z 6 mies.) na początku miesiąca, obecne oprocentowanie${zPromocja}, odsetki po podatku.`;
    let wiersze;
    if (p.termin) {
        const roznica = p.saldoNaTermin - (c.target_gr || 0);
        wiersze = `
            <div class="flex justify-between gap-3"><dt>Saldo na koniec ${esc(miesiacRokDopelniacz(p.termin))}</dt>
                <dd class="kwota font-bold whitespace-nowrap">≈ ${zl(p.saldoNaTermin)}</dd></div>
            <div class="flex justify-between gap-3 text-[var(--muted)]"><dt>w tym odsetki do terminu</dt><dd class="kwota whitespace-nowrap">≈ ${zl(p.odsetki)}</dd></div>
            <div class="flex justify-between gap-3 ${roznica >= 0 ? 'text-[var(--c-income)]' : 'text-[var(--c-spend)]'}">
                <dt>${roznica >= 0 ? 'Zapas ponad cel' : 'Zabraknie'}</dt><dd class="kwota font-semibold whitespace-nowrap">${zl(Math.abs(roznica))}</dd></div>
            ${p.wymagana != null ? `<div class="flex justify-between gap-3"><dt>Wpłata, żeby zdążyć (z odsetkami)</dt>
                <dd class="kwota font-semibold whitespace-nowrap">${zl(wGoreDo10zl(p.wymagana))} / mies.</dd></div>` : ''}`;
    } else {
        wiersze = p.osiagniecie
            ? `<div class="flex justify-between gap-3"><dt>Cel osiągniesz około</dt><dd class="font-bold whitespace-nowrap">${esc(miesiacRok(p.osiagniecie))}</dd></div>
               <div class="flex justify-between gap-3 text-[var(--muted)]"><dt>odsetki do tego czasu</dt><dd class="kwota whitespace-nowrap">≈ ${zl(p.odsetki)}</dd></div>`
            : '<p>Bez regularnych wpłat nie da się oszacować, kiedy osiągniesz cel.</p>';
    }
    return `
        <dl class="text-xs space-y-1 pt-2 mt-2 border-t border-[var(--border)]" aria-label="Prognoza">${wiersze}</dl>
        <p class="text-[10px] text-[var(--muted)] pt-1">${esc(zalozenia)}</p>`;
}

function kafelekCelu(tytul, wartosc, podpis = '', klasa = '') {
    return `
        <div class="card">
            <span class="tile-label">${esc(tytul)}</span>
            <p class="tile-value kwota ${klasa} break-all">${esc(wartosc)}</p>
            ${podpis ? `<span class="tile-note">${esc(podpis)}</span>` : ''}
        </div>`;
}

// Kafelek „Odsetki rocznie”: ile przy obecnym saldzie daje rok (po podatku) i stopa efektywna
// W czasie promocji: stopa promocyjna teraz i dla porównania kwota po jej końcu
function kafelekOdsetekCelu(c, a, dzis = dzisiejszaData()) {
    const oprocentowanie = progiOdsetek(c);
    if (!czyOprocentowany(oprocentowanie)) return kafelekCelu('Odsetki rocznie', '—', 'subkonto bez oprocentowania');
    const netto = brutto => zl(brutto * (1 - PODATEK_BELKI));
    const teraz = odsetkiRoczneOdSalda(a.saldo, oprocentowanie, dzis);
    const efektywnie = `efektywnie ${stopaTekst(stopaEfektywna(a.saldo, oprocentowanie, dzis))}`;
    if (promocjaWDniu(oprocentowanie, dzis)) {
        return kafelekCelu('Odsetki rocznie ≈ (promocja)', netto(teraz),
            `po podatku · ${efektywnie} · po promocji ${netto(odsetkiZProgow(a.saldo, oprocentowanie))}`);
    }
    return kafelekCelu('Odsetki rocznie ≈', netto(teraz), `po podatku · ${efektywnie}`);
}

// Wykres „Wpłaty i wypłaty”: od pierwszego miesiąca z operacją do M (albo do późniejszej
// operacji ręcznej, gdy wyciągi jeszcze do niej nie sięgają), najwyżej 12 ostatnich
function wykresWplatWyplat(a, kolor) {
    const klucze = Object.keys(a.miesiecznie).sort();
    if (klucze.length === 0) return '<p class="text-xs text-[var(--muted)]">Brak wpłat i wypłat dla tego celu.</p>';
    const koniec = klucze[klucze.length - 1] > a.M ? klucze[klucze.length - 1] : a.M;
    let od = klucze[0];
    if (roznicaMiesiecy(od, koniec) > 11) od = przesunKlucz(koniec, -11);
    const zakres = [];
    for (let k = od; k <= koniec; k = przesunKlucz(k, 1)) zakres.push(k);

    const dane = zakres.map(k => a.miesiecznie[k] || { wplaty: 0, wyplaty: 0 });
    const etykieta = k => MIESIACE_KROTKIE[Number(k.slice(5, 7)) - 1];
    return wykresSlupkowy({
        etykiety: zakres.map(etykieta),
        opis: 'Wpłaty i wypłaty celu w kolejnych miesiącach',
        serie: [
            { kolor, wartosci: dane.map(d => d.wplaty), podpowiedz: (i, v) => `${nazwaMiesiaca(zakres[i])}: wpłaty ${zl(v)}` },
            { kolor: 'var(--c-spend)', wartosci: dane.map(d => d.wyplaty), podpowiedz: (i, v) => `${nazwaMiesiaca(zakres[i])}: wypłaty ${zl(v)}` }
        ]
    });
}

// Przyciski pod szczegółami celu; „Zakończ cel” najpierw pokazuje potwierdzenie na ekranie
function akcjeSzczegolowCelu(c) {
    const id = esc(c.id);
    if (czyPotwierdzenie('cel-zakoncz', c.id)) {
        return htmlPotwierdzenia({
            rodzaj: 'cel-zakoncz',
            id: c.id,
            pytanie: `Zakończyć cel „${c.name}”?`,
            opis: 'Zniknie z listy aktywnych celów i przestanie łapać nowe przelewy. Możesz go później przywrócić.',
            tak: 'Zakończ cel',
            akcjaTak: `zakonczCel('${id}', true)`,
            akcjaNie: `anulujPotwierdzenieCelu('cel-zakoncz-${id}')`,
            klasa: 'card border border-[var(--c-spend)]'
        });
    }
    return `
        <div class="flex gap-2 flex-wrap">
            <button type="button" data-klik="edytujZeSzczegolow('${id}')" class="btn-secondary">Edytuj cel</button>
            ${c.archived
                ? `<button type="button" data-klik="zakonczCel('${id}', false)" class="btn-secondary">Przywróć cel</button>`
                : `<button type="button" id="cel-zakoncz-${id}" data-klik="pytajOZakonczenieCelu('${id}')" class="btn-secondary !text-[var(--c-spend)]">Zakończ cel</button>`}
        </div>`;
}

// Id operacji ręcznej, które można bezpiecznie wstawić do akcji data-klik
function bezpieczneIdOperacji(o) {
    return o && /^[\w-]{1,64}$/.test(String(o.id || '')) ? String(o.id) : null;
}

// Wiersze tabeli „Ostatnie operacje”: przelewy, operacje ręczne i szacowane odsetki, od najnowszej
function wierszeOperacjiCelu(c, ops, a) {
    const id = esc(c.id);
    const operacje = [
        ...ops.map(o => ({ data: o.data, typ: o.typ, kwota: o.kwota, reczna: o.reczna })),
        ...a.odsetki.kapitalizacje.map(k => ({ data: k.data, typ: 'odsetki', kwota: k.netto, brutto: k.brutto, podatek: k.podatek }))
    ].sort((x, y) => y.data.localeCompare(x.data));
    const RODZAJE = { wplata: 'wpłata', wyplata: 'wypłata', odsetki: 'odsetki ≈' };
    return operacje.map(o => {
        const rodzaj = o.reczna && o.reczna.transfer ? opisPrzeniesienia(o.reczna)
            : o.reczna ? `${RODZAJE[o.typ]} ręczna` : RODZAJE[o.typ];
        const idOp = o.reczna ? bezpieczneIdOperacji(o.reczna) : null;
        const usun = idOp
            ? `<button type="button" data-klik="usunOperacjeReczna('${id}', '${esc(idOp)}')" class="icon-btn !w-7 !h-7 text-[var(--c-spend)]"
                   aria-label="${esc(`Usuń: ${rodzaj} ${zl(o.kwota, 2)} z ${o.data}`)}" title="${o.reczna && o.reczna.transfer ? 'Usuń przeniesienie (z obu celów)' : 'Usuń operację ręczną'}"><i data-lucide="x" class="w-3.5 h-3.5" aria-hidden="true"></i></button>`
            : '';
        return `
            <tr class="border-t border-[var(--border)] align-top ${o.typ === 'odsetki' ? 'text-[var(--muted)]' : ''}"
                ${o.typ === 'odsetki' ? `title="${esc(`Brutto ${zl(o.brutto, 2)} − podatek ${zl(o.podatek, 2)}`)}"` : ''}>
                <td class="py-1.5 kwota whitespace-nowrap">${esc(o.data)}</td>
                <td class="py-1.5 pr-1">${esc(rodzaj)}${o.reczna && o.reczna.note ? `<span class="block text-[10px] text-[var(--muted)] break-words">${esc(o.reczna.note)}</span>` : ''}</td>
                <td class="py-1.5 text-right kwota whitespace-nowrap ${o.typ === 'wyplata' ? 'text-[var(--c-spend)]' : ''}">${o.typ === 'wyplata' ? '−' : '+'}${zl(o.kwota, 2)}</td>
                <td class="py-0.5 pl-1 text-right w-8">${usun}</td>
            </tr>`;
    }).join('');
}

function rysujSzczegolyCelu(c) {
    const { wynik, ops } = analizyCelow();
    const a = wynik[c.id];
    const kolor = kolorCelu(c);
    const id = esc(c.id);
    const zaWolno = a.status === 'za-wolno';
    const formularzOtwarty = !!stan.operacjaCelu && String(stan.operacjaCelu.celId) === String(c.id);
    const rodzajFormularza = formularzOtwarty ? stan.operacjaCelu.rodzaj : null;
    const wpisaneWFormularzu = formularzOtwarty ? (rodzajFormularza === 'przeniesienie' ? polaPrzeniesienia() : polaOperacjiRecznej()) : null;
    const moznaPrzeniesc = !c.archived && a.saldo > 0 && celeDoPrzeniesienia(c.id).length > 0;
    const tabela = wierszeOperacjiCelu(c, ops[c.id], a);

    const termin = a.terminKlucz
        ? kafelekCelu('Termin', miesiacRok(a.terminKlucz), `za ${a.miesiecyDoTerminu} mies.`)
        : kafelekCelu('Termin', 'brak');

    const kontener = document.getElementById('cel-szczegoly');
    kontener.innerHTML = `
        <div class="space-y-3">
            <div class="flex justify-between items-center">
                <button type="button" data-klik="zamknijSzczegolyCelu()" class="text-sm font-semibold text-[var(--accent)]">‹ Cele</button>
                ${c.archived ? '<span class="status-label text-[var(--muted)]">Zakończony</span>' : etykietaStatusu(a.status)}
            </div>

            <h2 class="text-lg font-bold">${esc(c.name)}</h2>

            <div class="card flex items-center gap-4">
                ${pierscienPostepu(a.postep, kolor)}
                <div class="min-w-0 space-y-0.5">
                    <p class="tile-value kwota" style="color:${esc(kolor)}">${zl(a.saldo)}</p>
                    <p class="text-xs text-[var(--muted)]">z ${zl(c.target_gr)} · brakuje ${zl(a.brakuje)}</p>
                    ${c.note ? `<p class="text-xs">${esc(c.note)}</p>` : ''}
                    <p class="text-[11px] text-[var(--muted)]">${a.odsetki.netto > 0
                        ? `w tym odsetki ≈ ${zl(a.odsetki.netto, 2)} (po ${Math.round(PODATEK_BELKI * 100)}% podatku Belki: −${zl(a.odsetki.podatek, 2)})`
                        : 'odsetki: jeszcze brak'} · ${esc(opisOprocentowania(c))}</p>
                    <p class="text-[10px] text-[var(--muted)] truncate">${c.keyword
                        ? `Subkonto: <span class="font-mono">${esc(c.keyword)}</span>`
                        : 'Bez subkonta w wyciągach – saldo zmieniasz operacjami ręcznymi'}</p>
                    ${c.keywords_out ? `<p class="text-[10px] text-[var(--muted)] truncate">Słowa wypłat: ${esc(c.keywords_out)}</p>` : ''}
                </div>
            </div>

            <div class="card text-sm leading-snug border-l-4" style="border-color:${esc(kolor)};background:color-mix(in srgb, ${esc(kolor)} 10%, var(--surface))">
                <p>${esc(zalecenieCelu(a))}</p>
                ${a.status === 'osiagniety' && a.saldo > (c.target_gr || 0) && moznaPrzeniesc && !stan.trybOffline
                    ? `<button type="button" data-klik="otworzPrzeniesienie('${id}', '', ${a.saldo - (c.target_gr || 0)})" class="btn-secondary !w-auto mt-2">Przenieś nadwyżkę ${zl(a.saldo - (c.target_gr || 0))}</button>` : ''}
                ${c.archived ? '' : htmlPrognozyCelu(c, a)}
            </div>

            <div class="tiles">
                ${kafelekCelu('Średnia wpłata (6 mies.)', zl(a.srednia), `do ${miesiacRokDopelniacz(a.M)}`)}
                ${kafelekCelu('Potrzebna miesięcznie', a.potrzebna == null ? '—' : zl(a.potrzebna), '', zaWolno ? 'text-[var(--c-spend)]' : '')}
                ${termin}
                ${kafelekOdsetekCelu(c, a)}
            </div>

            <div class="grid gap-3 min-[900px]:grid-cols-2 items-start">
                <article class="card space-y-2">
                    <h3 class="font-semibold text-sm">Wpłaty i wypłaty</h3>
                    ${wykresWplatWyplat(a, kolor)}
                    <div class="flex gap-4 justify-center text-[11px] text-[var(--muted)]">
                        <span class="flex items-center gap-1.5"><span class="dot rounded-sm" style="background:${esc(kolor)}"></span>Wpłaty</span>
                        <span class="flex items-center gap-1.5"><span class="dot rounded-sm bg-[var(--c-spend)]"></span>Wypłaty</span>
                    </div>
                </article>

                <article id="cel-operacje" class="card space-y-2" aria-labelledby="cel-operacje-tytul">
                    <div class="flex justify-between items-center gap-x-3 gap-y-1 flex-wrap">
                        <h3 id="cel-operacje-tytul" class="font-semibold text-sm">Ostatnie operacje</h3>
                        ${formularzOtwarty || stan.trybOffline ? '' : `<span class="flex gap-3">
                            <button type="button" id="btn-operacja-reczna" data-klik="otworzOperacjeReczna('${id}')"
                                class="text-xs font-semibold text-[var(--accent)] hover:underline" aria-controls="cel-operacje">+ Wpłata / wypłata ręczna</button>
                            ${moznaPrzeniesc ? `<button type="button" id="btn-przeniesienie" data-klik="otworzPrzeniesienie('${id}', '', 0)"
                                class="text-xs font-semibold text-[var(--accent)] hover:underline" aria-controls="cel-operacje">⇄ Przenieś na inny cel</button>` : ''}
                        </span>`}
                    </div>
                    ${rodzajFormularza === 'przeniesienie' ? htmlFormularzaPrzeniesienia(c, a) : formularzOtwarty ? htmlFormularzaOperacji() : ''}
                    ${tabela ? `
                    <div class="scroll-box">
                        <table class="w-full text-xs">
                            <thead class="text-[10px] text-[var(--muted)]">
                                <tr><th class="text-left font-normal pb-1">Data</th><th class="text-left font-normal pb-1">Rodzaj</th>
                                    <th class="text-right font-normal pb-1">Kwota</th><th class="pb-1"><span class="sr-only">Akcje</span></th></tr>
                            </thead>
                            <tbody>${tabela}</tbody>
                        </table>
                    </div>` : '<p class="text-xs text-[var(--muted)]">Brak operacji.</p>'}
                    <p class="text-[10px] text-[var(--muted)]">Odsetki są szacunkiem: bank dopisuje je na subkoncie, więc nie ma ich w wyciągu z konta głównego. Operacje ręczne zmieniają saldo celu, ale nie przychody, wydatki ani „Odłożone” na Pulpicie.</p>
                </article>
            </div>

            ${akcjeSzczegolowCelu(c)}
        </div>`;
    if (wpisaneWFormularzu) {
        if (rodzajFormularza === 'przeniesienie') przywrocPolaPrzeniesienia(wpisaneWFormularzu);
        else przywrocPolaOperacjiRecznej(wpisaneWFormularzu);
    }
    if (typeof odswiezIkony === 'function') odswiezIkony();
}

// ---- Operacje ręczne (wpłaty i wypłaty spoza wyciągu konta głównego) ----

function dzisiejszaData() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function htmlFormularzaOperacji() {
    const dzis = dzisiejszaData();
    return `
        <form id="form-operacja-reczna" data-wyslij="zapiszOperacjeReczna(event)" data-escape="zamknijOperacjeReczna()"
              class="space-y-2.5 p-3 rounded-xl border border-[var(--border)] text-xs" novalidate aria-labelledby="op-tytul">
            <h4 id="op-tytul" class="font-semibold">Operacja spoza wyciągu konta głównego</h4>
            <div class="flex flex-wrap gap-x-4 gap-y-1.5" role="radiogroup" aria-label="Rodzaj operacji">
                <label class="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="op-typ" id="op-typ-wplata" checked class="accent-[var(--accent)]"> Wpłata do celu
                </label>
                <label class="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="op-typ" id="op-typ-wyplata" class="accent-[var(--accent)]"> Wypłata z celu
                </label>
            </div>
            <div class="grid grid-cols-2 gap-2">
                <div>
                    <label for="op-kwota" class="field-label">Kwota (zł)</label>
                    <input type="text" id="op-kwota" inputmode="decimal" autocomplete="off" required placeholder="np. 500" class="input kwota" aria-describedby="op-blad">
                </div>
                <div>
                    <label for="op-data" class="field-label">Data</label>
                    <input type="date" id="op-data" required value="${dzis}" min="${NAJWCZESNIEJSZA_DATA_OPERACJI}" max="${dzis}" class="input">
                </div>
            </div>
            <div>
                <label for="op-opis" class="field-label">Opis (opcjonalnie)</label>
                <input type="text" id="op-opis" maxlength="${MAKS_OPIS_OPERACJI}" autocomplete="off" placeholder="np. przelew z innego banku, gotówka, korekta salda" class="input">
            </div>
            <p id="op-blad" role="alert" class="hidden text-xs text-[var(--c-spend)]"></p>
            <div class="flex gap-2">
                <button type="submit" id="btn-zapisz-operacje" class="btn-primary !w-auto px-5">Zapisz</button>
                <button type="button" data-klik="zamknijOperacjeReczna()" class="btn-secondary">Anuluj</button>
            </div>
        </form>`;
}

// Wartości wpisane w formularz – żeby przerysowanie szczegółów (np. odświeżenie danych) ich nie skasowało
function polaOperacjiRecznej() {
    const pole = id => document.getElementById(id);
    if (!pole('form-operacja-reczna')) return null;
    return {
        wyplata: pole('op-typ-wyplata').checked,
        kwota: pole('op-kwota').value,
        data: pole('op-data').value,
        opis: pole('op-opis').value
    };
}

function przywrocPolaOperacjiRecznej(p) {
    if (!document.getElementById('form-operacja-reczna')) return;
    document.getElementById(p.wyplata ? 'op-typ-wyplata' : 'op-typ-wplata').checked = true;
    document.getElementById('op-kwota').value = p.kwota;
    document.getElementById('op-data').value = p.data;
    document.getElementById('op-opis').value = p.opis;
}

function otworzOperacjeReczna(celId) {
    if (stan.trybOffline) return pokazKomunikat(komunikatBledu(BLAD_OFFLINE, 'Nie dodano operacji'));
    stan.operacjaCelu = { celId: String(celId), rodzaj: 'reczna' };
    odswiezCele();
    const karta = document.getElementById('cel-operacje');
    if (karta) karta.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const kwota = document.getElementById('op-kwota');
    if (kwota) kwota.focus();
}

function zamknijOperacjeReczna() {
    stan.operacjaCelu = null;
    odswiezCele();
    const btn = document.getElementById('btn-operacja-reczna');
    if (btn) btn.focus();
}

function pokazBladOperacji(tresc) {
    const el = document.getElementById('op-blad');
    if (!el) return pokazKomunikat(tresc);
    el.innerText = tresc;
    el.classList.toggle('hidden', !tresc);
    document.getElementById('op-kwota').setAttribute('aria-invalid', tresc ? 'true' : 'false');
}

function noweIdOperacji() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Czysta funkcja – walidacja operacji ręcznej z formularza.
 * pola: { wyplata: bool, kwota: tekst, data: 'RRRR-MM-DD', opis: tekst }
 * Zwraca { operacja: { date, amount_gr, note } } albo { blad }.
 */
function sprawdzOperacjeReczna(pola, dzis = dzisiejszaData()) {
    const kwota = groszeZPolaFormularza(pola.kwota);
    if (!Number.isFinite(kwota) || kwota <= 0) return { blad: 'Podaj kwotę większą od 0 zł, np. 500 albo 499,99.' };
    if (kwota > MAKS_KWOTA_OPERACJI_GR) return { blad: `Kwota może wynosić najwyżej ${zl(MAKS_KWOTA_OPERACJI_GR)}.` };
    const data = String(pola.data || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(dataUTC(data))) return { blad: 'Wybierz datę operacji.' };
    if (data > dzis) return { blad: 'Data operacji nie może być w przyszłości.' };
    if (data < NAJWCZESNIEJSZA_DATA_OPERACJI) return { blad: 'Data operacji jest zbyt odległa.' };
    const opis = String(pola.opis || '').trim().slice(0, MAKS_OPIS_OPERACJI);
    return { operacja: { date: data, amount_gr: pola.wyplata ? -kwota : kwota, note: opis } };
}

// Zmiana listy operacji ręcznych jednego celu. Pobiera świeżą listę z bazy (druga osoba mogła
// w międzyczasie coś dodać), zmienia ją funkcją zmiana(lista) i zapisuje. Zwraca { ok } albo { blad }.
async function zmienOperacjeReczne(celId, zmiana, poczatekBledu = 'Nie zapisano operacji') {
    const odczyt = await supabaseClient.from('goals').select('manual_operations').eq('id', celId).limit(1);
    if (odczyt.error) return { blad: komunikatBledu(odczyt.error, poczatekBledu) };
    if (!odczyt.data || !odczyt.data[0]) return { blad: `${poczatekBledu}: tego celu nie ma już w bazie – odśwież dane.` };
    const obecne = Array.isArray(odczyt.data[0].manual_operations) ? odczyt.data[0].manual_operations : [];
    const nowe = zmiana(obecne);
    if (nowe.length > MAKS_OPERACJI_RECZNYCH) {
        return { blad: `${poczatekBledu}: cel może mieć najwyżej ${MAKS_OPERACJI_RECZNYCH} operacji ręcznych.` };
    }
    const zapis = await supabaseClient.from('goals').update({ manual_operations: nowe }).eq('id', celId).select();
    if (zapis.error) return { blad: komunikatBledu(zapis.error, poczatekBledu) };
    const zapisany = zapis.data && zapis.data[0];
    stan.cele = stan.cele.map(c => (String(c.id) === String(celId) ? (zapisany || { ...c, manual_operations: nowe }) : c));
    return { ok: true };
}

function opisOperacji(o) {
    return `${o.amount_gr > 0 ? 'wpłatę' : 'wypłatę'} ${zl(Math.abs(o.amount_gr), 2)}`;
}

async function zapiszOperacjeReczna(e) {
    e.preventDefault();
    const otwarta = stan.operacjaCelu;
    const cel = otwarta ? celPoId(otwarta.celId) : null;
    if (!cel) return;
    const pola = polaOperacjiRecznej();
    const { operacja, blad } = sprawdzOperacjeReczna(pola);
    if (blad) {
        pokazBladOperacji(blad);
        return document.getElementById('op-kwota').focus();
    }
    pokazBladOperacji('');
    const nowa = { id: noweIdOperacji(), ...operacja };

    const btn = document.getElementById('btn-zapisz-operacje');
    btn.disabled = true;
    btn.innerText = 'Zapisuję…';
    const wynik = await zmienOperacjeReczne(cel.id, lista => [...lista, nowa]);
    if (wynik.blad) {
        if (document.getElementById('btn-zapisz-operacje')) {
            btn.disabled = false;
            btn.innerText = 'Zapisz';
        }
        return pokazBladOperacji(wynik.blad);
    }
    stan.operacjaCelu = null;
    odswiezPoZmianie();
    const przycisk = document.getElementById('btn-operacja-reczna');
    if (przycisk) przycisk.focus();
    pokazKomunikat(`Dodano ${opisOperacji(nowa)} – ${cel.name}`, {
        akcja: { etykieta: COFNIJ, wykonaj: () => cofnijOperacjeReczna(cel.id, nowa) }
    });
}

// „Cofnij” po dodaniu: usuwa tę samą operację (bez kolejnego „Cofnij”)
async function cofnijOperacjeReczna(celId, operacja) {
    const wynik = await zmienOperacjeReczne(celId, lista => lista.filter(o => !o || String(o.id) !== String(operacja.id)), 'Nie cofnięto');
    if (wynik.blad) return pokazKomunikat(wynik.blad);
    odswiezPoZmianie();
    pokazKomunikat(`Cofnięto ${opisOperacji(operacja)}`);
}

// Usunięcie od razu, z „Cofnij” w komunikacie (jak przy transakcjach)
async function usunOperacjeReczna(celId, idOperacji) {
    const cel = celPoId(celId);
    const operacja = cel ? operacjeReczneCelu(cel).find(o => String(o.id) === String(idOperacji)) : null;
    if (!operacja) return;
    if (operacja.transfer) return usunPrzeniesienie(celId, operacja);
    const wynik = await zmienOperacjeReczne(celId, lista => lista.filter(o => !o || String(o.id) !== String(idOperacji)), 'Nie usunięto operacji');
    if (wynik.blad) return pokazKomunikat(wynik.blad);
    odswiezPoZmianie();
    const przycisk = document.getElementById('btn-operacja-reczna');
    if (przycisk) przycisk.focus();
    pokazKomunikat(`Usunięto ${opisOperacji(operacja)}`, {
        akcja: { etykieta: COFNIJ, wykonaj: () => przywrocOperacjeReczna(celId, operacja) }
    });
}

async function przywrocOperacjeReczna(celId, operacja) {
    const wynik = await zmienOperacjeReczne(celId,
        lista => (lista.some(o => o && String(o.id) === String(operacja.id)) ? lista : [...lista, operacja]), 'Nie cofnięto');
    if (wynik.blad) return pokazKomunikat(wynik.blad);
    odswiezPoZmianie();
    pokazKomunikat(`Przywrócono ${opisOperacji(operacja)}`);
}


// =====================================================================
// PRZENIESIENIE MIĘDZY CELAMI – para operacji ręcznych powiązanych polem transfer:
//   cel źródłowy: { amount_gr: −kwota, transfer: { id, goal_id: <cel docelowy> } }
//   cel docelowy: { amount_gr: +kwota, transfer: { id, goal_id: <cel źródłowy> } }
// Zmienia salda obu celów; nie liczy się do średniej wpłat (calc.js: operacjaCeluZRecznej).
// =====================================================================

// Aktywne cele, na które można przenieść pieniądze z celu celId
function celeDoPrzeniesienia(celId) {
    return stan.cele.filter(c => !c.archived && String(c.id) !== String(celId));
}

// "przeniesienie do „Wakacje”" / "przeniesienie z „Poduszka”"
function opisPrzeniesienia(o) {
    const drugi = celPoId(o.transfer.goal_id);
    const nazwa = drugi ? `„${drugi.name}”` : 'usuniętego celu';
    return o.amount_gr < 0 ? `przeniesienie do ${nazwa}` : `przeniesienie z ${nazwa}`;
}

// Otwiera formularz przeniesienia w szczegółach celu zId (doId i kwota – podpowiedź, np. z porównania)
function otworzPrzeniesienie(zId, doId = '', kwotaGr = 0) {
    if (stan.trybOffline) return pokazKomunikat(komunikatBledu(BLAD_OFFLINE, 'Nie przeniesiono'));
    stan.otwartyCel = String(zId);
    stan.potwierdzenie = null;
    stan.operacjaCelu = { celId: String(zId), rodzaj: 'przeniesienie', doCelu: String(doId || ''), kwota: kwotaGr > 0 ? Math.floor(kwotaGr) : 0 };
    zamknijFormularzCelu();
    odswiezCele();
    const karta = document.getElementById('cel-operacje');
    if (karta) karta.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const pole = document.getElementById(doId ? 'pr-kwota' : 'pr-cel');
    if (pole) pole.focus();
}

function htmlFormularzaPrzeniesienia(c, a) {
    const dzis = dzisiejszaData();
    const o = stan.operacjaCelu;
    const opcje = celeDoPrzeniesienia(c.id).map(d =>
        `<option value="${esc(d.id)}" ${String(d.id) === o.doCelu ? 'selected' : ''}>${esc(d.name)}</option>`).join('');
    return `
        <form id="form-przeniesienie" data-wyslij="zapiszPrzeniesienie(event)" data-escape="zamknijOperacjeReczna()"
              class="space-y-2.5 p-3 rounded-xl border border-[var(--border)] text-xs" novalidate aria-labelledby="pr-tytul">
            <h4 id="pr-tytul" class="font-semibold">Przenieś z „${esc(c.name)}” na inny cel</h4>
            <div class="grid grid-cols-2 gap-2">
                <div class="col-span-2">
                    <label for="pr-cel" class="field-label">Na cel</label>
                    <select id="pr-cel" class="input" required>
                        <option value="" ${o.doCelu ? '' : 'selected'} disabled>Wybierz cel…</option>${opcje}
                    </select>
                </div>
                <div>
                    <label for="pr-kwota" class="field-label">Kwota (zł)</label>
                    <input type="text" id="pr-kwota" inputmode="decimal" autocomplete="off" required class="input kwota"
                        value="${o.kwota > 0 ? esc(zlDoPola(o.kwota)) : ''}" placeholder="np. 1000" aria-describedby="pr-blad pr-saldo">
                    <p id="pr-saldo" class="text-[10px] text-[var(--muted)] mt-1">Na celu: ${zl(a.saldo, 2)}</p>
                </div>
                <div>
                    <label for="pr-data" class="field-label">Data</label>
                    <input type="date" id="pr-data" required value="${dzis}" min="${NAJWCZESNIEJSZA_DATA_OPERACJI}" max="${dzis}" class="input">
                </div>
            </div>
            <div>
                <label for="pr-opis" class="field-label">Opis (opcjonalnie)</label>
                <input type="text" id="pr-opis" maxlength="${MAKS_OPIS_OPERACJI}" autocomplete="off" placeholder="np. koniec promocji" class="input">
            </div>
            <p id="pr-blad" role="alert" class="hidden text-xs text-[var(--c-spend)]"></p>
            <div class="flex gap-2">
                <button type="submit" id="btn-zapisz-przeniesienie" class="btn-primary !w-auto px-5">Przenieś</button>
                <button type="button" data-klik="zamknijOperacjeReczna()" class="btn-secondary">Anuluj</button>
            </div>
            <p class="text-[10px] text-[var(--muted)]">Zapisze wypłatę z tego celu i wpłatę na wybrany cel. Pamiętaj o przelewie między subkontami w banku.</p>
        </form>`;
}

function polaPrzeniesienia() {
    if (!document.getElementById('form-przeniesienie')) return null;
    return {
        doCelu: document.getElementById('pr-cel').value,
        kwota: document.getElementById('pr-kwota').value,
        data: document.getElementById('pr-data').value,
        opis: document.getElementById('pr-opis').value
    };
}

function przywrocPolaPrzeniesienia(p) {
    if (!document.getElementById('form-przeniesienie')) return;
    document.getElementById('pr-cel').value = p.doCelu;
    document.getElementById('pr-kwota').value = p.kwota;
    document.getElementById('pr-data').value = p.data;
    document.getElementById('pr-opis').value = p.opis;
}

/**
 * Czysta funkcja – walidacja przeniesienia. pola: { doCelu, kwota, data, opis }, saldo – saldo celu źródłowego.
 * Zwraca { przeniesienie: { doCelu, kwota (gr), date, note } } albo { blad }.
 */
function sprawdzPrzeniesienie(pola, saldo, zCelu, dzis = dzisiejszaData()) {
    if (!pola.doCelu) return { blad: 'Wybierz cel, na który przenosisz pieniądze.' };
    if (String(pola.doCelu) === String(zCelu)) return { blad: 'Wybierz inny cel niż ten, z którego przenosisz.' };
    const { operacja, blad } = sprawdzOperacjeReczna({ wyplata: false, kwota: pola.kwota, data: pola.data, opis: pola.opis }, dzis);
    if (blad) return { blad };
    if (operacja.amount_gr > Math.max(0, Math.floor(saldo))) {
        return { blad: `Na tym celu jest ${zl(Math.max(0, saldo), 2)} – nie przeniesiesz więcej.` };
    }
    return { przeniesienie: { doCelu: String(pola.doCelu), kwota: operacja.amount_gr, date: operacja.date, note: operacja.note } };
}

function pokazBladPrzeniesienia(tresc) {
    const el = document.getElementById('pr-blad');
    if (!el) return pokazKomunikat(tresc);
    el.innerText = tresc;
    el.classList.toggle('hidden', !tresc);
}

// Zapis pary operacji. Gdy druga połowa się nie zapisze – pierwsza jest wycofywana.
async function wykonajPrzeniesienie(zId, doId, para) {
    const [opZ, opDo] = para;
    const pierwszy = await zmienOperacjeReczne(zId, lista => [...lista, opZ], 'Nie przeniesiono');
    if (pierwszy.blad) return pierwszy;
    const drugi = await zmienOperacjeReczne(doId, lista => [...lista, opDo], 'Nie przeniesiono');
    if (drugi.blad) {
        await zmienOperacjeReczne(zId, lista => lista.filter(o => !o || String(o.id) !== String(opZ.id)), 'Nie wycofano');
        return drugi;
    }
    return { ok: true };
}

async function usunParePrzeniesienia(transferId, zId, doId) {
    const bezPary = lista => lista.filter(o => !o || !o.transfer || String(o.transfer.id) !== String(transferId));
    const pierwszy = await zmienOperacjeReczne(zId, bezPary, 'Nie usunięto przeniesienia');
    if (pierwszy.blad) return pierwszy;
    if (celPoId(doId)) return zmienOperacjeReczne(doId, bezPary, 'Nie usunięto przeniesienia');
    return { ok: true };
}

async function zapiszPrzeniesienie(e) {
    e.preventDefault();
    const otwarta = stan.operacjaCelu;
    const z = otwarta ? celPoId(otwarta.celId) : null;
    if (!z) return;
    const { wynik } = analizyCelow();
    const { przeniesienie, blad } = sprawdzPrzeniesienie(polaPrzeniesienia(), wynik[z.id].saldo, z.id);
    if (blad) return pokazBladPrzeniesienia(blad);
    pokazBladPrzeniesienia('');
    const cel = celPoId(przeniesienie.doCelu);
    const transfer = noweIdOperacji();
    const para = [
        { id: noweIdOperacji(), date: przeniesienie.date, amount_gr: -przeniesienie.kwota, note: przeniesienie.note, transfer: { id: transfer, goal_id: String(cel.id) } },
        { id: noweIdOperacji(), date: przeniesienie.date, amount_gr: przeniesienie.kwota, note: przeniesienie.note, transfer: { id: transfer, goal_id: String(z.id) } }
    ];
    const btn = document.getElementById('btn-zapisz-przeniesienie');
    btn.disabled = true;
    btn.innerText = 'Przenoszę…';
    const wynikZapisu = await wykonajPrzeniesienie(z.id, cel.id, para);
    if (wynikZapisu.blad) {
        if (document.getElementById('btn-zapisz-przeniesienie')) {
            btn.disabled = false;
            btn.innerText = 'Przenieś';
        }
        return pokazBladPrzeniesienia(wynikZapisu.blad);
    }
    stan.operacjaCelu = null;
    odswiezPoZmianie();
    const przycisk = document.getElementById('btn-przeniesienie') || document.getElementById('btn-operacja-reczna');
    if (przycisk) przycisk.focus();
    pokazKomunikat(`Przeniesiono ${zl(przeniesienie.kwota, 2)}: ${z.name} → ${cel.name}`, {
        akcja: { etykieta: COFNIJ, wykonaj: () => cofnijPrzeniesienie(transfer, z.id, cel.id) }
    });
}

async function cofnijPrzeniesienie(transferId, zId, doId) {
    const wynik = await usunParePrzeniesienia(transferId, zId, doId);
    if (wynik.blad) return pokazKomunikat(wynik.blad);
    odswiezPoZmianie();
    pokazKomunikat('Cofnięto przeniesienie');
}

// Usunięcie jednej połowy usuwa całą parę (z „Cofnij”)
async function usunPrzeniesienie(celId, operacja) {
    const drugiId = operacja.transfer.goal_id;
    const drugi = celPoId(drugiId);
    const polowaDrugiego = drugi ? operacjeReczneCelu(drugi).find(o => o.transfer && String(o.transfer.id) === String(operacja.transfer.id)) : null;
    const wynik = await usunParePrzeniesienia(operacja.transfer.id, celId, drugiId);
    if (wynik.blad) return pokazKomunikat(wynik.blad);
    odswiezPoZmianie();
    pokazKomunikat(`Usunięto przeniesienie ${zl(Math.abs(operacja.amount_gr), 2)}`, {
        akcja: {
            etykieta: COFNIJ, wykonaj: async () => {
                const w1 = await zmienOperacjeReczne(celId, l => [...l, operacja], 'Nie cofnięto');
                if (w1.blad) return pokazKomunikat(w1.blad);
                if (polowaDrugiego && celPoId(drugiId)) {
                    const w2 = await zmienOperacjeReczne(drugiId, l => [...l, polowaDrugiego], 'Nie cofnięto');
                    if (w2.blad) return pokazKomunikat(w2.blad);
                }
                odswiezPoZmianie();
                pokazKomunikat('Przywrócono przeniesienie');
            }
        }
    });
}

// ---- Usunięcie i zakończenie celu (potwierdzenie na ekranie, 10.2) ----

function pytajOUsuniecieCelu(id) {
    if (czyPotwierdzenie('cel-usun', id)) return anulujPotwierdzenieCelu(`cel-usun-${id}`); // drugi klik zamyka
    otworzPotwierdzenie('cel-usun', id, odswiezCele);
}

function pytajOZakonczenieCelu(id) {
    otworzPotwierdzenie('cel-zakoncz', id, odswiezCele);
}

function anulujPotwierdzenieCelu(idFokusu) {
    zamknijPotwierdzenie(odswiezCele, idFokusu);
}

// „Zakończ cel” ustawia archived (8.3); zakończony cel nie łapie już nowych przelewów.
// Zakończenie – po potwierdzeniu na ekranie; przywrócenie od razu (łatwo je cofnąć).
async function zakonczCel(id, zakoncz = true) {
    const zapisz = async () => {
        const { error } = await supabaseClient.from('goals').update({ archived: zakoncz }).eq('id', id);
        if (error) {
            pokazKomunikat(komunikatBledu(error, 'Nie udało się zapisać'));
            return false;
        }
        return true;
    };
    const udane = zakoncz ? await wykonajPotwierdzenie('cel-zakoncz', id, odswiezCele, zapisz) : await zapisz();
    if (!udane) return;
    const cel = celPoId(id);
    if (cel) cel.archived = zakoncz;
    stan.otwartyCel = null;
    stan.operacjaCelu = null;
    odswiezPoZmianie();
    pokazKomunikat(zakoncz ? 'Zakończono cel' : 'Przywrócono cel');
}

// Wywoływane tylko przyciskiem „Usuń cel” w potwierdzeniu
async function usunCel(id) {
    const cel = celPoId(id);
    const udane = await wykonajPotwierdzenie('cel-usun', id, odswiezCele, async () => {
        const { error } = await supabaseClient.from('goals').delete().eq('id', id);
        if (error) {
            pokazKomunikat(komunikatBledu(error, 'Nie usunięto celu'));
            return false;
        }
        return true;
    });
    if (!udane) return;
    stan.cele = stan.cele.filter(c => String(c.id) !== String(id));
    odswiezPoZmianie();
    if (!cel) return pokazKomunikat('Usunięto cel');
    // Transakcje przypisane ręcznie (SKARBONKA:<id>) zostają – po przywróceniu celu z tym samym id znów do niego trafią.
    // Operacje ręczne są w wierszu celu, więc „Cofnij” przywraca je razem z nim.
    const kopia = { ...cel };
    pokazKomunikat(`Usunięto cel ${cel.name}`, { akcja: { etykieta: COFNIJ, wykonaj: () => przywrocCel(kopia) } });
}

async function przywrocCel(kopia) {
    const wiersz = await przywrocWiersz('goals', kopia, 'Nie przywrócono celu');
    if (!wiersz) return;
    stan.cele = [...stan.cele, wiersz];
    odswiezPoZmianie();
    pokazKomunikat(`Przywrócono cel ${wiersz.name}`);
}

// =====================================================================
// FORMULARZ CELU (8.4)
// =====================================================================

// Bieżący miesiąc 'RRRR-MM' – najwcześniejszy dozwolony termin
function biezacyMiesiac() {
    const d = new Date();
    return kluczMiesiaca(d.getFullYear(), d.getMonth() + 1);
}

// "12,5" / "1 200" -> grosze; puste -> 0; błędne -> NaN
function groszeZPolaFormularza(tekst) {
    const s = String(tekst ?? '').replace(/[\s ]/g, '').replace(',', '.');
    if (s === '') return 0;
    if (!/^\d+(\.\d{0,2})?$/.test(s)) return NaN;
    return Math.round(parseFloat(s) * 100);
}

// "0,5" -> 0.5; puste -> wartość domyślna; błędne -> NaN
function liczbaZPola(tekst, domyslna) {
    const s = String(tekst ?? '').replace(/[\s %]/g, '').replace(',', '.');
    if (s === '') return domyslna;
    return /^\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NaN;
}

// Grosze -> tekst do pola: 100000 -> "1000", 12345 -> "123,45"
function zlDoPola(grosze) {
    return String(grosze / 100).replace('.', ',');
}

// ---- Progi oprocentowania w formularzu --------------------------------

/**
 * Czysta funkcja – progi z pól formularza.
 * wiersze: [{ od: tekst zł, stopa: tekst % }], tryb: 'nadwyzka' | 'calosc'
 * Zwraca { oprocentowanie: { tryb, progi: [{ od (gr), stopa }] } } (rosnąco) albo { blad }.
 */
function sprawdzProgiOdsetek(wiersze, tryb = 'nadwyzka') {
    if (!Array.isArray(wiersze) || wiersze.length === 0) return { blad: 'Dodaj co najmniej jeden próg oprocentowania.' };
    if (wiersze.length > MAKS_PROGOW_ODSETEK) return { blad: `Możesz ustawić najwyżej ${MAKS_PROGOW_ODSETEK} progi oprocentowania.` };
    const progi = [];
    for (let i = 0; i < wiersze.length; i++) {
        const nazwa = wiersze.length > 1 ? `Próg ${i + 1}: ` : '';
        const od = groszeZPolaFormularza(wiersze[i].od);
        if (!Number.isFinite(od) || od < 0) return { blad: `${nazwa}kwotę „od” podaj w złotych, np. 1000 (0 = od pierwszej złotówki).` };
        const stopa = liczbaZPola(wiersze[i].stopa, NaN);
        if (!Number.isFinite(stopa)) return { blad: `${nazwa}podaj oprocentowanie w procentach, np. 0,5 (0 = bez odsetek).` };
        if (stopa > MAKS_STOPA_ODSETEK) return { blad: `${nazwa}oprocentowanie może wynosić od 0 do ${MAKS_STOPA_ODSETEK}%.` };
        progi.push({ od, stopa });
    }
    progi.sort((a, b) => a.od - b.od);
    if (progi.some((p, i) => i > 0 && p.od === progi[i - 1].od)) {
        return { blad: 'Dwa progi nie mogą zaczynać się od tej samej kwoty.' };
    }
    return { oprocentowanie: { tryb: tryb === 'calosc' ? 'calosc' : 'nadwyzka', progi } };
}

/**
 * Czysta funkcja – oprocentowanie promocyjne z pól formularza.
 * pola: { wlaczona: bool, stopa: tekst %, od: 'RRRR-MM-DD', miesiace: tekst, limit: tekst zł (puste = bez limitu) }
 * Zwraca { promocja: null | { stopa, od, miesiace, do, limit } } albo { blad }.
 */
function sprawdzPromocjeOdsetek(pola) {
    if (!pola || !pola.wlaczona) return { promocja: null };
    const stopa = liczbaZPola(pola.stopa, NaN);
    if (!Number.isFinite(stopa) || stopa <= 0) return { blad: 'Promocja: podaj oprocentowanie promocyjne w procentach, np. 7.' };
    if (stopa > MAKS_STOPA_ODSETEK) return { blad: `Promocja: oprocentowanie może wynosić najwyżej ${MAKS_STOPA_ODSETEK}%.` };
    const od = String(pola.od || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(od) || Number.isNaN(dataUTC(od)) || od < NAJWCZESNIEJSZA_DATA_OPERACJI) {
        return { blad: 'Promocja: wybierz datę, od której obowiązuje.' };
    }
    const miesiace = Number(String(pola.miesiace ?? '').trim());
    if (!Number.isInteger(miesiace) || miesiace < 1 || miesiace > MAKS_MIESIECY_PROMOCJI) {
        return { blad: `Promocja: podaj czas trwania w pełnych miesiącach, od 1 do ${MAKS_MIESIECY_PROMOCJI}.` };
    }
    const limit = groszeZPolaFormularza(pola.limit);
    if (!Number.isFinite(limit) || limit < 0) return { blad: 'Promocja: limit kwoty podaj w złotych (puste = bez limitu).' };
    return { promocja: { stopa, od, miesiace, do: dodajMiesiace(od, miesiace), limit } };
}

// Zapis do bazy: interest_tiers (z promocją) + stare pola (pierwszy oprocentowany próg) dla zgodności wstecz
function oprocentowanieDoZapisu({ tryb, progi, promocja = null }) {
    const pierwszy = progi.find(p => p.stopa > 0);
    const interest_tiers = { mode: tryb === 'calosc' ? 'whole' : 'marginal', tiers: progi.map(p => ({ from_gr: p.od, rate: p.stopa })) };
    if (promocja) interest_tiers.promo = { rate: promocja.stopa, from: promocja.od, months: promocja.miesiace, max_gr: promocja.limit };
    return {
        interest_tiers,
        interest_rate: pierwszy ? pierwszy.stopa : 0,
        interest_threshold_gr: pierwszy ? pierwszy.od : 0
    };
}

function polaPromocjiZFormularza() {
    return {
        wlaczona: document.getElementById('cel-promo').checked,
        stopa: document.getElementById('cel-promo-stopa').value,
        od: document.getElementById('cel-promo-od').value,
        miesiace: document.getElementById('cel-promo-mies').value,
        limit: document.getElementById('cel-promo-limit').value
    };
}

// Pokazuje / ukrywa pola promocji; przy włączeniu – dzisiejsza data i 3 miesiące jako start
function przelaczPromocje(wlaczona) {
    document.getElementById('cel-promo-pola').classList.toggle('hidden', !wlaczona);
    if (wlaczona) {
        const od = document.getElementById('cel-promo-od');
        const mies = document.getElementById('cel-promo-mies');
        if (!od.value) od.value = dzisiejszaData();
        if (!mies.value) mies.value = '3';
        document.getElementById('cel-promo-stopa').focus();
    }
    odswiezPodpowiedzSalda();
}

function ustawPolaPromocji(p) {
    document.getElementById('cel-promo').checked = !!p;
    document.getElementById('cel-promo-stopa').value = p ? String(p.stopa).replace('.', ',') : '';
    document.getElementById('cel-promo-od').value = p ? p.od : '';
    document.getElementById('cel-promo-mies').value = p ? String(p.miesiace) : '';
    document.getElementById('cel-promo-limit').value = p && p.limit > 0 ? zlDoPola(p.limit) : '';
    document.getElementById('cel-promo-pola').classList.toggle('hidden', !p);
}

function trybOdsetekZFormularza() {
    return document.getElementById('cel-odsetki-calosc').checked ? 'calosc' : 'nadwyzka';
}

function wierszeProgowZFormularza() {
    return [...document.querySelectorAll('#cel-progi [data-prog]')].map((_, i) => ({
        od: document.getElementById(`cel-prog-od-${i}`).value,
        stopa: document.getElementById(`cel-prog-stopa-${i}`).value
    }));
}

function oprocentowanieZFormularza() {
    const progi = sprawdzProgiOdsetek(wierszeProgowZFormularza(), trybOdsetekZFormularza());
    if (progi.blad) return progi;
    const { promocja, blad } = sprawdzPromocjeOdsetek(polaPromocjiZFormularza());
    if (blad) return { blad };
    return { oprocentowanie: { ...progi.oprocentowanie, promocja } };
}

// Wiersze progów: „Od kwoty (zł)” + „% rocznie” + usuń (gdy jest więcej niż jeden)
function rysujProgiFormularza(wiersze) {
    const wielu = wiersze.length > 1;
    document.getElementById('cel-progi').innerHTML = wiersze.map((w, i) => `
        <div class="flex gap-2 items-end" data-prog>
            <div class="flex-1 min-w-0">
                <label for="cel-prog-od-${i}" class="field-label">${wielu ? `Próg ${i + 1} – od kwoty (zł)` : 'Od kwoty (zł)'}</label>
                <input type="text" inputmode="decimal" id="cel-prog-od-${i}" value="${esc(w.od)}" placeholder="0" autocomplete="off"
                    class="input kwota" aria-describedby="cel-odsetki-opis" data-wpis="odswiezPodpowiedzSalda()">
            </div>
            <div class="flex-1 min-w-0">
                <label for="cel-prog-stopa-${i}" class="field-label">Oprocentowanie (% rocznie)</label>
                <input type="text" inputmode="decimal" id="cel-prog-stopa-${i}" value="${esc(w.stopa)}" placeholder="np. 0,5" autocomplete="off"
                    class="input kwota" aria-describedby="cel-odsetki-opis" data-wpis="odswiezPodpowiedzSalda()">
            </div>
            ${wielu ? `<button type="button" data-klik="usunProgOdsetek(${i})" class="icon-btn shrink-0 text-[var(--c-spend)]"
                aria-label="Usuń próg ${i + 1}" title="Usuń próg"><i data-lucide="x" class="w-4 h-4" aria-hidden="true"></i></button>` : ''}
        </div>`).join('');
    const btn = document.getElementById('btn-dodaj-prog');
    btn.disabled = wiersze.length >= MAKS_PROGOW_ODSETEK;
    btn.classList.toggle('hidden', wiersze.length >= MAKS_PROGOW_ODSETEK);
    if (typeof odswiezIkony === 'function') odswiezIkony();
}

function dodajProgOdsetek() {
    const wiersze = wierszeProgowZFormularza();
    if (wiersze.length >= MAKS_PROGOW_ODSETEK) return;
    wiersze.push({ od: '', stopa: '' });
    rysujProgiFormularza(wiersze);
    document.getElementById(`cel-prog-od-${wiersze.length - 1}`).focus();
    odswiezPodpowiedzSalda();
}

function usunProgOdsetek(indeks) {
    const wiersze = wierszeProgowZFormularza();
    if (wiersze.length <= 1) return;
    wiersze.splice(indeks, 1);
    rysujProgiFormularza(wiersze);
    document.getElementById(`cel-prog-od-${Math.min(indeks, wiersze.length - 1)}`).focus();
    odswiezPodpowiedzSalda();
}

// Przykład pod progami: ile odsetek da kwota docelowa (albo 10 000 zł) w rok
function odswiezPrzykladOdsetek() {
    const p = document.getElementById('cel-odsetki-przyklad');
    const { oprocentowanie, blad } = oprocentowanieZFormularza();
    if (blad) {
        p.innerText = blad;
        return;
    }
    if (!czyOprocentowany(oprocentowanie)) {
        p.innerText = 'Subkonto bez oprocentowania – aplikacja nie doliczy odsetek.';
        return;
    }
    const cel = groszeZPolaFormularza(document.getElementById('cel-kwota').value);
    const saldo = Number.isFinite(cel) && cel > 0 ? cel : SALDO_PRZYKLADU_ODSETEK_GR;
    const netto = brutto => zl(brutto * (1 - PODATEK_BELKI), 2);
    const zwykle = odsetkiZProgow(saldo, oprocentowanie);
    let tekst = `Przykład: przy saldzie ${zl(saldo)} to ok. ${netto(zwykle)} odsetek rocznie po podatku ` +
        `(efektywnie ${stopaTekst(stopaEfektywna(saldo, oprocentowanie))} przed podatkiem).`;
    const promocja = oprocentowanie.promocja;
    if (promocja) {
        // Odsetki z całego okresu promocji przy stałym saldzie (dzień po dniu, jak w obliczeniach)
        const dni = Math.round((dataUTC(promocja.do) - dataUTC(promocja.od)) / DZIEN_MS);
        const wPromocji = odsetkiRoczneOdSalda(saldo, oprocentowanie, promocja.od) * dni / DNI_W_ROKU_ODSETKI;
        const bezPromocji = zwykle * dni / DNI_W_ROKU_ODSETKI;
        tekst += ` Promocja ${dataKrotko(promocja.od)}–${dataKrotko(ostatniDzienPromocji(promocja))}: ok. ${netto(wPromocji)} ` +
            `po podatku za cały okres, czyli ${netto(wPromocji - bezPromocji)} więcej niż bez promocji.`;
    }
    p.innerText = tekst;
}

// ---- Saldo początkowe -------------------------------------------------

// Wartości formularza jako tymczasowy cel (do podpowiedzi o zaimportowanych przelewach)
function celZFormularza() {
    const id = document.getElementById('cel-id').value || NOWY_CEL_ID;
    const zapisany = celPoId(id);
    const { oprocentowanie } = oprocentowanieZFormularza();
    return {
        id,
        name: document.getElementById('cel-nazwa').value.trim(),
        keyword: czystyNumer(document.getElementById('cel-keyword').value),
        keywords_out: document.getElementById('cel-keywords-out').value,
        archived: false,
        // Błędne progi = na razie bez odsetek (błąd pokaże podpowiedź i walidacja przy zapisie)
        interest_tiers: oprocentowanie ? oprocentowanieDoZapisu(oprocentowanie).interest_tiers : { mode: 'marginal', tiers: [{ from_gr: 0, rate: 0 }] },
        manual_operations: zapisany ? zapisany.manual_operations : []
    };
}

// Operacje celu z formularza (format jak w operacjeCelow()): przelewy z zaimportowanych transakcji,
// które trafiłyby do tego celu (prawdziwa klasyfikacja z celem z formularza w miejsce zapisanego),
// i zapisane operacje ręczne.
function operacjeTymczasowegoCelu(tymczasowy) {
    const ops = [];
    const zapisane = stan.cele;
    stan.cele = [...zapisane.filter(c => String(c.id) !== String(tymczasowy.id)), tymczasowy];
    try {
        for (const t of stan.transakcje) {
            const k = klasyfikuj(t);
            if (k.cel !== tymczasowy || (k.typ !== 'wplata' && k.typ !== 'wyplata')) continue;
            ops.push({ t, data: t.booked_on, typ: k.typ, kwota: Math.abs(t.amount_gr), klucz: t.booked_on.substring(0, 7), reczna: null });
        }
    } finally {
        stan.cele = zapisane;
    }
    for (const o of operacjeReczneCelu(tymczasowy)) ops.push(operacjaCeluZRecznej(o));
    return ops;
}

// Saldo początkowe do zapisu. Przy „dzisiejszym saldzie” odejmujemy przelewy, operacje ręczne
// i szacowane odsetki. Odsetki zależą od salda początkowego, więc liczymy kilka przybliżeń
// (różnice maleją ~100× w każdym kroku, 5 kroków wystarcza z zapasem).
function wyliczSaldoPoczatkowe() {
    const wpisane = groszeZPolaFormularza(document.getElementById('cel-saldo').value);
    const dzisiejsze = document.getElementById('cel-saldo-dzis').checked;
    const tymczasowy = celZFormularza();
    const ops = operacjeTymczasowegoCelu(tymczasowy);
    const zeZnakiem = o => (o.typ === 'wplata' ? o.kwota : -o.kwota);
    const nettoPrzelewow = ops.filter(o => !o.reczna).reduce((s, o) => s + zeZnakiem(o), 0);
    const nettoRecznych = ops.filter(o => o.reczna).reduce((s, o) => s + zeZnakiem(o), 0);
    const netto = nettoPrzelewow + nettoRecznych;
    const odsetkiDla = poczatkowe => odsetkiCelu({ ...tymczasowy, opening_balance_gr: poczatkowe }, ops).netto;

    if (!Number.isFinite(wpisane)) return { wpisane, dzisiejsze, netto, nettoPrzelewow, nettoRecznych, odsetki: 0, poczatkowe: NaN };
    let poczatkowe = dzisiejsze ? wpisane - netto : wpisane;
    let odsetki = odsetkiDla(poczatkowe);
    if (dzisiejsze) {
        for (let i = 0; i < 5; i++) {
            poczatkowe = wpisane - netto - odsetki;
            odsetki = odsetkiDla(poczatkowe);
        }
    }
    return { wpisane, dzisiejsze, netto, nettoPrzelewow, nettoRecznych, odsetki, poczatkowe };
}

function nettoTekst(grosze) {
    return `${grosze > 0 ? '+' : '−'}${zl(Math.abs(grosze), 2)}`;
}

// Podpowiedź pod polem salda (aktualizowana przy każdej zmianie numeru, słów, salda i oprocentowania)
function odswiezPodpowiedzSalda() {
    odswiezPrzykladOdsetek();
    const p = document.getElementById('cel-saldo-podpowiedz');
    const { wpisane, dzisiejsze, netto, nettoPrzelewow, nettoRecznych, odsetki, poczatkowe } = wyliczSaldoPoczatkowe();
    if (!Number.isFinite(wpisane)) {
        p.innerText = 'Podaj kwotę, np. 1200 albo 1200,50.';
        return;
    }
    const zImportow = nettoPrzelewow === 0
        ? 'Wśród zaimportowanych transakcji nie ma jeszcze przelewów tego celu.'
        : `Zaimportowane przelewy tego celu: ${nettoTekst(nettoPrzelewow)} netto.`;
    const zRecznych = nettoRecznych !== 0 ? ` Operacje ręczne: ${nettoTekst(nettoRecznych)} netto.` : '';
    const zOdsetek = odsetki > 0 ? ` Szacowane odsetki po podatku: +${zl(odsetki, 2)}.` : '';
    const wynik = dzisiejsze
        ? ` Zapiszemy saldo sprzed importów: ${zl(poczatkowe, 2)}, a w aplikacji cel pokaże ${zl(poczatkowe + netto + odsetki, 2)}.`
        : ` W aplikacji cel pokaże ${zl(poczatkowe + netto + odsetki, 2)}.`;
    p.innerText = zImportow + zRecznych + zOdsetek + wynik;
}

function pokazBladCelu(tresc) {
    const el = document.getElementById('cel-blad');
    el.innerText = tresc;
    el.classList.toggle('hidden', !tresc);
}

function otworzFormularzCelu(id = null) {
    stan.potwierdzenie = null;
    document.getElementById('modal-cel').classList.remove('hidden');
    const cel = id ? celPoId(id) : null;
    const terminCelu = cel && cel.deadline ? String(cel.deadline).slice(0, 7) : '';

    document.getElementById('modal-tytul').innerText = cel ? 'Edytuj cel oszczędnościowy' : 'Dodaj nowy cel oszczędnościowy';
    document.getElementById('cel-id').value = cel ? cel.id : '';
    document.getElementById('cel-nazwa').value = cel ? cel.name : '';
    document.getElementById('cel-kwota').value = cel ? zlDoPola(cel.target_gr) : '';
    document.getElementById('cel-termin').value = terminCelu;
    document.getElementById('cel-termin').min = terminCelu && terminCelu < biezacyMiesiac() ? terminCelu : biezacyMiesiac();
    document.getElementById('cel-termin').dataset.poprzedni = terminCelu;
    document.getElementById('cel-keyword').value = cel ? (cel.keyword || '') : '';
    document.getElementById('cel-keywords-out').value = cel ? (cel.keywords_out || '') : '';
    document.getElementById('cel-saldo').value = cel ? zlDoPola(cel.opening_balance_gr || 0) : '0';
    document.getElementById('cel-saldo-poczatkowe').checked = true;
    document.getElementById('cel-notatka').value = cel ? (cel.note || '') : '';

    const { tryb, progi, promocja } = progiOdsetek(cel || {});
    document.getElementById(tryb === 'calosc' ? 'cel-odsetki-calosc' : 'cel-odsetki-nadwyzka').checked = true;
    ustawPolaPromocji(promocja);
    rysujProgiFormularza(progi.map(p => ({ od: zlDoPola(p.od), stopa: String(p.stopa).replace('.', ',') })));

    pokazBladCelu('');
    odswiezPodpowiedzSalda();

    // Formularz jest nad listą – przewijamy do niego przy edycji z dołu listy
    if (id) document.getElementById('modal-cel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function zamknijFormularzCelu() {
    document.getElementById('modal-cel').classList.add('hidden');
}

// Walidacja wg 8.4. Zwraca { dane } albo { blad }.
function sprawdzFormularzCelu() {
    const id = document.getElementById('cel-id').value;
    const name = document.getElementById('cel-nazwa').value.trim();
    const target_gr = groszeZPolaFormularza(document.getElementById('cel-kwota').value);
    const termin = document.getElementById('cel-termin').value; // 'RRRR-MM'
    const terminPoprzedni = document.getElementById('cel-termin').dataset.poprzedni || '';
    const keyword = czystyNumer(document.getElementById('cel-keyword').value);
    const keywords_out = document.getElementById('cel-keywords-out').value.trim();
    const note = document.getElementById('cel-notatka').value.trim();

    if (!name) return { blad: 'Podaj nazwę celu.' };
    if (name.length > MAKS_NAZWA_CELU) return { blad: `Nazwa celu może mieć najwyżej ${MAKS_NAZWA_CELU} znaków.` };
    if (!Number.isFinite(target_gr) || target_gr <= 0) return { blad: 'Kwota docelowa musi być większa od 0 zł.' };
    // Termin jest opcjonalny (cel bez terminu: prognoza „kiedy osiągniesz”); gdy jest –
    // nie wcześniej niż bieżący miesiąc, a przy edycji można zostawić dotychczasowy
    if (termin && !/^\d{4}-\d{2}$/.test(termin)) return { blad: 'Wybierz miesiąc terminu albo zostaw pole puste.' };
    if (termin && termin < biezacyMiesiac() && termin !== terminPoprzedni) return { blad: 'Termin nie może być wcześniejszy niż bieżący miesiąc.' };
    // Numer subkonta jest opcjonalny: cel bez niego prowadzi się operacjami ręcznymi
    if (keyword) {
        const zajety = stan.cele.find(c => String(c.id) !== String(id) && czystyNumer(c.keyword) === keyword);
        if (zajety) return { blad: `Ten numer subkonta ma już cel „${zajety.name}”.` };
    }

    const { oprocentowanie, blad: bladProgow } = oprocentowanieZFormularza();
    if (bladProgow) return { blad: bladProgow };

    const saldo = wyliczSaldoPoczatkowe();
    if (!Number.isFinite(saldo.wpisane) || saldo.wpisane < 0) return { blad: 'Obecne saldo subkonta nie może być ujemne.' };
    if (saldo.poczatkowe < 0) {
        return { blad: `Dzisiejsze saldo jest mniejsze niż zaimportowane wpłaty i operacje ręczne tego celu (${zl(saldo.netto, 2)}). Sprawdź numer subkonta albo wybierz „saldo sprzed pierwszego importu”.` };
    }

    return {
        dane: {
            id, name, target_gr, keywords_out, note,
            keyword: keyword || null,
            ...oprocentowanieDoZapisu(oprocentowanie),
            deadline: termin ? `${termin}-01` : null, // pierwszy dzień miesiąca terminu (3 „goals”); null = bez terminu
            opening_balance_gr: saldo.poczatkowe
        }
    };
}

async function zapiszCel(e) {
    e.preventDefault();
    const { dane, blad } = sprawdzFormularzCelu();
    if (blad) return pokazBladCelu(blad);
    pokazBladCelu('');

    const { id, ...pola } = dane;
    const istniejacy = id ? celPoId(id) : null;
    // Kolor nadawany automatycznie z palety; starszy cel bez koloru dostaje go przy edycji
    if (!istniejacy) pola.color = kolorDlaNowegoCelu();
    else if (!istniejacy.color) pola.color = kolorCelu(istniejacy);

    const btn = document.getElementById('btn-zapisz-cel');
    btn.disabled = true;
    const res = istniejacy
        ? await supabaseClient.from('goals').update(pola).eq('id', id).select()
        : await supabaseClient.from('goals').insert([pola]).select();
    btn.disabled = false;

    if (res.error) return pokazBladCelu(komunikatBledu(res.error, 'Nie zapisano celu'));

    zamknijFormularzCelu();
    const zapisany = res.data && res.data[0];
    if (zapisany) {
        // Zapisany wiersz z bazy (z id i wartościami domyślnymi) zastępuje / uzupełnia listę
        stan.cele = istniejacy
            ? stan.cele.map(c => (String(c.id) === String(id) ? zapisany : c))
            : [...stan.cele, zapisany];
        odswiezPoZmianie();
    } else {
        await pobierzDane();
    }
    pokazKomunikat(istniejacy ? 'Zapisano cel' : 'Dodano nowy cel');
}
