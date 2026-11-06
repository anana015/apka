// =====================================================================
// EKRAN: CELE (specyfikacja, rozdział 8)
//  - lista celów (8.2): kafelki, karty ze statusem, licznik „Za wolno”
//  - szczegóły celu (8.3): pierścień postępu, zalecenie, kafelki, wykres,
//    ostatnie operacje, „Edytuj cel” i „Zakończ cel”
// Przypisanie transakcji do celu (numer subkonta / słowa wypłat) – bez zmian, w rules.js.
// Wzory (8.1) – analizaCelu() w calc.js.
// =====================================================================

// Kolor celu: zapisany w bazie albo z palety 5 kolorów (kolejność celów)
const PALETA_CELOW = ['#2F5FB3', '#2A9D8F', '#D08A2C', '#C2508A', '#6B5BB5'];

function kolorCelu(cel) {
    if (cel && cel.color) return cel.color;
    const i = Math.max(0, stan.cele.findIndex(c => String(c.id) === String(cel && cel.id)));
    return PALETA_CELOW[i % PALETA_CELOW.length];
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

// Analiza wszystkich celów naraz (klasyfikacja transakcji tylko raz)
function analizyCelow() {
    const ops = operacjeCelow();
    const M = ostatniMiesiacDanych();
    const wynik = {};
    stan.cele.forEach(c => { wynik[c.id] = analizaCelu(c, ops[c.id], M); });
    return { wynik, ops, M };
}

// Licznik na zakładce „Cele” = liczba aktywnych celów „Za wolno” (8.2)
function liczCeleZaWolno() {
    if (!stan.cele || stan.cele.length === 0) return 0;
    const { wynik } = analizyCelow();
    return stan.cele.filter(c => !c.archived && wynik[c.id].status === 'za-wolno').length;
}

// ---- Nawigacja lista <-> szczegóły -----------------------------------

function otworzSzczegolyCelu(id) {
    stan.otwartyCel = String(id);
    zamknijFormularzCelu();
    document.getElementById('app-main').scrollTop = 0;
    odswiezCele();
}

function zamknijSzczegolyCelu() {
    stan.otwartyCel = null;
    document.getElementById('app-main').scrollTop = 0;
    odswiezCele();
}

function edytujZeSzczegolow(id) {
    stan.otwartyCel = null;
    odswiezCele();
    otworzFormularzCelu(id);
}

// ---- Główne odświeżenie ----------------------------------------------

function odswiezCele() {
    const cel = stan.otwartyCel ? stan.cele.find(c => String(c.id) === stan.otwartyCel) : null;
    if (stan.otwartyCel && !cel) stan.otwartyCel = null; // cel usunięty w międzyczasie

    document.querySelectorAll('#tab-cele .cele-lista').forEach(el => el.classList.toggle('hidden', !!cel));
    document.getElementById('cel-szczegoly').classList.toggle('hidden', !cel);

    if (cel) rysujSzczegolyCelu(cel);
    else rysujListeCelow();
}

// ---- 8.2 Lista celów -------------------------------------------------

function kartaCelu(c, a, zakonczony = false) {
    const procent = Math.round(a.postep * 100);
    const kolor = kolorCelu(c);
    return `
        <article class="card space-y-2.5 cursor-pointer hover:ring-1 hover:ring-[var(--border)] transition ${zakonczony ? 'opacity-70' : ''}" onclick="otworzSzczegolyCelu('${esc(c.id)}')">
            <div class="flex justify-between items-start gap-2 text-xs">
                <div class="min-w-0">
                    <h3 class="font-bold text-sm truncate">${esc(c.name)}</h3>
                    <span class="text-[10px] text-[var(--muted)] block truncate">Subkonto: ${esc(c.keyword || 'brak')}</span>
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
                <span>Postęp: ${procent}%${a.terminKlucz ? ` · do ${esc(miesiacRokDopelniacz(a.terminKlucz))}` : ''}</span>
                <div class="space-x-3 whitespace-nowrap">
                    ${zakonczony
                        ? `<button type="button" onclick="event.stopPropagation(); zakonczCel('${esc(c.id)}', false)" class="text-[var(--accent)] font-semibold hover:underline">Przywróć</button>`
                        : `<button type="button" onclick="event.stopPropagation(); otworzFormularzCelu('${esc(c.id)}')" class="text-[var(--accent)] font-semibold hover:underline">Edytuj</button>`}
                    <button type="button" onclick="event.stopPropagation(); usunCel('${esc(c.id)}')" class="text-[var(--c-spend)] hover:underline">Usuń</button>
                    <button type="button" onclick="event.stopPropagation(); otworzSzczegolyCelu('${esc(c.id)}')" class="text-[var(--fg)] font-semibold hover:underline">Szczegóły ›</button>
                </div>
            </div>
        </article>`;
}

function rysujListeCelow() {
    const lista = document.getElementById('lista-celow');
    const boxZakonczone = document.getElementById('cele-zakonczone-box');

    // Stan pusty (10.3): zachęta + od razu otwarty formularz
    if (!stan.cele || stan.cele.length === 0) {
        lista.innerHTML = `<div class="card text-center text-xs text-[var(--muted)] py-6">Dodaj pierwszy cel, np. poduszkę finansową.</div>`;
        document.getElementById('cele-suma-ogolna').innerText = `0 zł`;
        document.getElementById('cele-suma-cel').innerText = '';
        document.getElementById('cele-wplacone').innerText = '0 zł';
        document.getElementById('cele-wplacone-proc').innerText = '';
        boxZakonczone.classList.add('hidden');
        otworzFormularzCelu();
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

    // Kafelek 2: „Wpłacone w [M]” – suma wpłat w M i procent przychodów M
    const wplaconeM = stan.cele.reduce((s, c) =>
        s + ops[c.id].filter(o => o.typ === 'wplata' && o.klucz === M).reduce((x, o) => x + o.kwota, 0), 0);
    const przychodyM = podsumuj(stan.transakcje.filter(t => t.booked_on.startsWith(M))).przychody;
    document.getElementById('cele-wplacone-etykieta').innerText = `Wpłacone w ${nazwaMiesiacaMiejscownik(M)}`;
    document.getElementById('cele-wplacone').innerText = zl(wplaconeM);
    document.getElementById('cele-wplacone-proc').innerText =
        przychodyM > 0 ? `${Math.round((wplaconeM / przychodyM) * 100)}% przychodów` : 'brak przychodów w tym miesiącu';

    lista.innerHTML = aktywne.length
        ? aktywne.map(c => kartaCelu(c, wynik[c.id])).join('')
        : `<div class="card text-center text-xs text-[var(--muted)] py-6">Wszystkie cele są zakończone. Dodaj nowy cel.</div>`;

    boxZakonczone.classList.toggle('hidden', zakonczone.length === 0);
    document.getElementById('cele-zakonczone-licznik').innerText = zakonczone.length;
    document.getElementById('lista-celow-zakonczonych').innerHTML =
        zakonczone.map(c => kartaCelu(c, wynik[c.id], true)).join('');
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
        return a.szacowanyKlucz
            ? `Cel nie ma terminu. Przy średniej wpłacie ${zl(a.srednia)} miesięcznie osiągniesz go około: ${miesiacRok(a.szacowanyKlucz)}.`
            : 'Cel nie ma terminu i w ostatnich 6 miesiącach nie było wpłat. Ustaw termin w edycji celu.';
    }
    if (a.status === 'zdazysz') {
        return `Przy średniej wpłacie ${zl(a.srednia)} miesięcznie zdążysz przed terminem. ` +
            `Szacowany termin osiągnięcia celu: ${miesiacRok(a.szacowanyKlucz)}.`;
    }
    // Za wolno: Y i Z zaokrąglone w górę do 10 zł
    const Y = wGoreDo10zl(a.potrzebna);
    const Z = wGoreDo10zl(a.potrzebna - a.srednia);
    return `Żeby zdążyć do terminu (${miesiacRok(a.terminKlucz)}), wpłacaj ${zl(Y)} miesięcznie, czyli o ${zl(Z)} więcej niż obecnie. ` +
        (a.szacowanyKlucz
            ? `W obecnym tempie cel osiągniesz około: ${miesiacRok(a.szacowanyKlucz)}.`
            : 'W ostatnich 6 miesiącach nie było wpłat, więc nie da się oszacować terminu.');
}

function kafelekCelu(tytul, wartosc, podpis = '', klasa = '') {
    return `
        <div class="card">
            <span class="tile-label">${esc(tytul)}</span>
            <p class="tile-value kwota ${klasa} break-all">${esc(wartosc)}</p>
            ${podpis ? `<span class="tile-note">${esc(podpis)}</span>` : ''}
        </div>`;
}

// Wykres „Wpłaty i wypłaty”: od pierwszego miesiąca z operacją do M, najwyżej 12 ostatnich
function wykresWplatWyplat(a, kolor) {
    const klucze = Object.keys(a.miesiecznie).sort();
    if (klucze.length === 0) return '<p class="text-xs text-[var(--muted)]">Brak wpłat i wypłat dla tego celu.</p>';
    let od = klucze[0];
    if (roznicaMiesiecy(od, a.M) > 11) od = przesunKlucz(a.M, -11);
    const zakres = [];
    for (let k = od; k <= a.M; k = przesunKlucz(k, 1)) zakres.push(k);

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

function rysujSzczegolyCelu(c) {
    const { wynik, ops } = analizyCelow();
    const a = wynik[c.id];
    const kolor = kolorCelu(c);
    const operacje = ops[c.id].slice().sort((x, y) => y.t.booked_on.localeCompare(x.t.booked_on));
    const zaWolno = a.status === 'za-wolno';

    const termin = a.terminKlucz
        ? kafelekCelu('Termin', miesiacRok(a.terminKlucz), `za ${a.miesiecyDoTerminu} mies.`)
        : kafelekCelu('Termin', 'brak');

    document.getElementById('cel-szczegoly').innerHTML = `
        <div class="space-y-3">
            <div class="flex justify-between items-center">
                <button type="button" onclick="zamknijSzczegolyCelu()" class="text-sm font-semibold text-[var(--accent)]">‹ Cele</button>
                ${c.archived ? '<span class="status-label text-[var(--muted)]">Zakończony</span>' : etykietaStatusu(a.status)}
            </div>

            <h2 class="text-lg font-bold">${esc(c.name)}</h2>

            <div class="card flex items-center gap-4">
                ${pierscienPostepu(a.postep, kolor)}
                <div class="min-w-0 space-y-0.5">
                    <p class="tile-value kwota" style="color:${esc(kolor)}">${zl(a.saldo)}</p>
                    <p class="text-xs text-[var(--muted)]">z ${zl(c.target_gr)} · brakuje ${zl(a.brakuje)}</p>
                    ${c.note ? `<p class="text-xs">${esc(c.note)}</p>` : ''}
                    <p class="text-[10px] text-[var(--muted)] truncate">Subkonto: <span class="font-mono">${esc(c.keyword || 'brak')}</span></p>
                    ${c.keywords_out ? `<p class="text-[10px] text-[var(--muted)] truncate">Słowa wypłat: ${esc(c.keywords_out)}</p>` : ''}
                </div>
            </div>

            <div class="card text-sm leading-snug border-l-4" style="border-color:${esc(kolor)};background:color-mix(in srgb, ${esc(kolor)} 10%, var(--surface))">
                ${esc(zalecenieCelu(a))}
            </div>

            <div class="tiles">
                ${kafelekCelu('Średnia wpłata (6 mies.)', zl(a.srednia), `do ${miesiacRokDopelniacz(a.M)}`)}
                ${kafelekCelu('Potrzebna miesięcznie', a.potrzebna == null ? '—' : zl(a.potrzebna), '', zaWolno ? 'text-[var(--c-spend)]' : '')}
                ${termin}
                ${kafelekCelu('Subkonto (wpłaty)', c.keyword ? '…' + String(c.keyword).slice(-8) : 'brak', 'końcówka numeru')}
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

                <article class="card space-y-2">
                    <h3 class="font-semibold text-sm">Ostatnie operacje</h3>
                    ${operacje.length === 0 ? '<p class="text-xs text-[var(--muted)]">Brak operacji.</p>' : `
                    <div class="scroll-box">
                        <table class="w-full text-xs">
                            <thead class="text-[10px] text-[var(--muted)]">
                                <tr><th class="text-left font-normal pb-1">Data</th><th class="text-left font-normal pb-1">Rodzaj</th><th class="text-right font-normal pb-1">Kwota</th></tr>
                            </thead>
                            <tbody>
                                ${operacje.map(o => `
                                    <tr class="border-t border-[var(--border)]">
                                        <td class="py-1.5 kwota whitespace-nowrap">${esc(o.t.booked_on)}</td>
                                        <td class="py-1.5">${o.typ === 'wplata' ? 'wpłata' : 'wypłata'}</td>
                                        <td class="py-1.5 text-right kwota whitespace-nowrap ${o.typ === 'wplata' ? '' : 'text-[var(--c-spend)]'}">${o.typ === 'wplata' ? '' : '−'}${zl(o.kwota, 2)}</td>
                                    </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>`}
                </article>
            </div>

            <div class="flex gap-2 flex-wrap">
                <button type="button" onclick="edytujZeSzczegolow('${esc(c.id)}')" class="btn-secondary">Edytuj cel</button>
                ${c.archived
                    ? `<button type="button" onclick="zakonczCel('${esc(c.id)}', false)" class="btn-secondary">Przywróć cel</button>`
                    : `<button type="button" onclick="zakonczCel('${esc(c.id)}', true)" class="btn-secondary !text-[var(--c-spend)]">Zakończ cel</button>`}
            </div>
        </div>`;
}

// „Zakończ cel” ustawia archived (8.3); zakończony cel nie łapie już nowych przelewów
async function zakonczCel(id, zakoncz = true) {
    if (zakoncz && !confirm('Zakończyć ten cel? Zniknie z listy aktywnych celów i przestanie łapać nowe przelewy. Możesz go później przywrócić.')) return;
    const { error } = await supabaseClient.from('goals').update({ archived: zakoncz }).eq('id', id);
    if (error) {
        pokazKomunikat('Nie udało się zapisać: ' + error.message);
        return;
    }
    stan.otwartyCel = null;
    await pobierzDane();
    pokazKomunikat(zakoncz ? 'Zakończono cel' : 'Przywrócono cel');
}

// ---- Formularz celu (bez zmian) --------------------------------------

function otworzFormularzCelu(id = null) {
    document.getElementById('modal-cel').classList.remove('hidden');
    const cel = id ? stan.cele.find(x => String(x.id) === String(id)) : null;

    document.getElementById('modal-tytul').innerText = cel ? 'Edytuj cel oszczędnościowy' : 'Dodaj nowy cel oszczędnościowy';
    document.getElementById('cel-id').value = cel ? cel.id : '';
    document.getElementById('cel-nazwa').value = cel ? cel.name : '';
    document.getElementById('cel-kwota').value = cel ? cel.target_gr / 100 : '';
    document.getElementById('cel-termin').value = (cel && cel.deadline) || '2026-12-31';
    document.getElementById('cel-keyword').value = cel ? (cel.keyword || '') : '';
    document.getElementById('cel-keywords-out').value = cel ? (cel.keywords_out || '') : '';

    // Formularz jest nad listą – przewijamy do niego przy edycji z dołu listy
    if (id) document.getElementById('modal-cel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function zamknijFormularzCelu() {
    document.getElementById('modal-cel').classList.add('hidden');
}

async function zapiszCel(e) {
    e.preventDefault();
    const id = document.getElementById('cel-id').value;
    const name = document.getElementById('cel-nazwa').value;
    const target_gr = Math.round(parseFloat(document.getElementById('cel-kwota').value) * 100);
    const deadline = document.getElementById('cel-termin').value;
    const keyword = czystyNumer(document.getElementById('cel-keyword').value);
    const keywords_out = document.getElementById('cel-keywords-out').value;

    let error;
    if (id) {
        const res = await supabaseClient.from('goals').update({ name, target_gr, deadline, keyword, keywords_out }).eq('id', id);
        error = res.error;
    } else {
        const res = await supabaseClient.from('goals').insert([{ name, target_gr, deadline, keyword, keywords_out, opening_balance_gr: 0 }]);
        error = res.error;
    }

    if (error) {
        alert('Błąd podczas zapisu celu: ' + error.message);
    } else {
        zamknijFormularzCelu();
        pobierzDane();
        pokazKomunikat(id ? 'Zapisano cel' : 'Dodano nowy cel');
    }
}

async function usunCel(id) {
    if (!confirm('Czy na pewno chcesz usunąć ten cel?')) return;
    const { error } = await supabaseClient.from('goals').delete().eq('id', id);
    if (!error) pobierzDane();
    else alert('Błąd usuwania: ' + error.message);
}
