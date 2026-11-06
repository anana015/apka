// =====================================================================
// EKRAN: TRANSAKCJE
// =====================================================================

function zmienFiltrTransakcji(typ) {
    stan.filtrTransakcji = typ;
    odswiezTransakcje();
}

function przejdzDoBezKategorii() {
    zmienZakladke('transakcje', { filtr: 'brak' });
}

function odswiezTransakcje() {
    const lista = document.getElementById('lista-transakcji');

    // Podświetlenie aktywnego filtra
    const brak = stan.filtrTransakcji === 'brak';
    document.getElementById('btn-filtr-wszystkie').classList.toggle('is-active', !brak);
    document.getElementById('btn-filtr-brak').classList.toggle('is-active', brak);

    let dane = stan.transakcje;
    if (brak) {
        dane = dane.filter(czyBezKategorii);
    }

    document.getElementById('licznik-brak').innerText = liczBezKategorii();

    if (dane.length === 0) {
        lista.innerHTML = `<div class="card text-center text-xs text-[var(--muted)] py-8">${
            brak ? 'Wszystkie transakcje mają kategorię.' : 'Brak transakcji. Zaimportuj wyciąg w zakładce Import.'
        }</div>`;
        return;
    }

    const opcjeKategorii = (wybrana) => stan.kategorie
        .map(k => `<option value="${esc(k.name)}" ${wybrana === k.name ? 'selected' : ''}>${esc(k.name)}</option>`)
        .join('');
    const opcjeCelow = (wybranyId) => stan.cele
        .map(c => `<option value="${esc(PREFIKS_CELU + c.id)}" ${wybranyId === String(c.id) ? 'selected' : ''}>[Skarbonka] ${esc(c.name)}</option>`)
        .join('');

    const klasaSelect = 'bg-[var(--surface)] text-[var(--fg)] border rounded-lg px-2 py-1 text-[11px] max-w-[11rem] focus:ring-1 focus:ring-[var(--accent)]';

    lista.innerHTML = dane.map(t => {
        const k = klasyfikuj(t);
        const kolorKwoty = {
            wydatek: 'text-[var(--c-spend)]',
            wplata: 'text-[var(--c-save)]',
            wyplata: 'text-purple-600 dark:text-purple-300',
            przychod: 'text-[var(--c-income)]',
            pominiete: 'text-[var(--muted)] line-through'
        }[k.typ];

        const wybranyCelId = k.cel && k.celReczny ? String(k.cel.id) : null;
        let prawaKolumna;

        if (k.typ === 'wplata' && !k.celReczny) {
            // Wpłata rozpoznana po numerze subkonta celu -> etykieta statusu
            prawaKolumna = `<span class="status-label text-[var(--c-save)]">Wpłata: ${esc(k.cel.name)}</span>`;
        } else if (k.typ === 'wyplata') {
            // Wypłata ze skarbonek -> wybór celu (żółta ramka, gdy nieprzypisana)
            const celId = k.cel ? String(k.cel.id) : null;
            prawaKolumna = `
                <select onchange="zmienKategorieTransakcji('${esc(t.id)}', this.value)" aria-label="Skarbonka, z której jest wypłata" class="${klasaSelect} ${k.cel ? 'border-[var(--border)]' : 'border-amber-400 ring-1 ring-amber-400'}">
                    <option value="">${k.cel ? 'Automatycznie' : 'Z której skarbonki?'}</option>
                    ${stan.cele.map(c => `<option value="${esc(PREFIKS_CELU + c.id)}" ${celId === String(c.id) ? 'selected' : ''}>Wypłata: ${esc(c.name)}</option>`).join('')}
                </select>
            `;
        } else {
            const bezKat = k.typ === 'wydatek' && !k.kategoria;
            prawaKolumna = `
                <select onchange="zmienKategorieTransakcji('${esc(t.id)}', this.value)" aria-label="Kategoria transakcji" class="${klasaSelect} ${bezKat ? 'border-amber-400 ring-1 ring-amber-400' : 'border-[var(--border)]'}">
                    <option value="">Wybierz kategorię...</option>
                    <optgroup label="Zwykłe kategorie">${opcjeKategorii(k.kategoria)}</optgroup>
                    <optgroup label="Skarbonki">${opcjeCelow(wybranyCelId)}</optgroup>
                    <option value="${POMIN}" ${k.typ === 'pominiete' ? 'selected' : ''}>${POMIN}</option>
                </select>
            `;
        }

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
                        <span class="font-bold kwota ${kolorKwoty}">${(t.amount_gr / 100).toFixed(2)} zł</span>
                        <button type="button" onclick="usunTransakcje('${esc(t.id)}')" class="text-[var(--muted)] hover:text-[var(--c-spend)] transition p-1" title="Usuń transakcję" aria-label="Usuń transakcję">
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                    </div>
                    <div>${prawaKolumna}</div>
                </div>
            </article>
        `;
    }).join('');
}

async function usunTransakcje(id) {
    if (!confirm('Czy na pewno chcesz usunąć tę transakcję?')) return;

    const { error } = await supabaseClient.from('transakcje').delete().eq('id', id);
    if (error) {
        alert('Błąd podczas usuwania: ' + error.message);
    } else {
        stan.transakcje = stan.transakcje.filter(t => String(t.id) !== String(id));
        odswiezInterfejs();
        pokazKomunikat('Usunięto transakcję');
    }
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
        alert('Błąd zapisu kategorii: ' + error.message);
        return;
    }
    t.category_manual = wartosc;

    let komunikat = 'Zaktualizowano kategorię';

    // "Zapamiętaj dla podobnych": reguła z dwóch pierwszych sensownych słów
    if (wartosc && wartosc !== POMIN && !wartosc.startsWith(PREFIKS_CELU)) {
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
