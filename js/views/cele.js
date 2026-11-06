// =====================================================================
// EKRAN: CELE
// =====================================================================

function odswiezCele() {
    const lista = document.getElementById('lista-celow');

    // Stan pusty (10.3): zachęta + od razu otwarty formularz
    if (!stan.cele || stan.cele.length === 0) {
        lista.innerHTML = `<div class="card text-center text-xs text-[var(--muted)] py-6">Dodaj pierwszy cel, np. poduszkę finansową.</div>`;
        document.getElementById('cele-suma-ogolna').innerText = `0 zł`;
        otworzFormularzCelu();
        return;
    }

    const salda = saldaCelow();
    let sumaOgolnaGr = 0;

    lista.innerHTML = stan.cele.map(c => {
        const zebraneGr = salda[c.id];
        const procent = c.target_gr > 0 ? Math.min(Math.max(Math.round((zebraneGr / c.target_gr) * 100), 0), 100) : 0;
        sumaOgolnaGr += zebraneGr;

        return `
            <article class="card space-y-2.5">
                <div class="flex justify-between items-start gap-2 text-xs">
                    <div class="min-w-0">
                        <h3 class="font-bold text-sm truncate">${esc(c.name)}</h3>
                        <span class="text-[10px] text-[var(--muted)] block truncate">Subkonto: ${esc(c.keyword || 'brak')}</span>
                        ${c.keywords_out ? `<span class="text-[10px] text-[var(--muted)] block truncate">Słowa wypłat: ${esc(c.keywords_out)}</span>` : ''}
                    </div>
                    <div class="text-right whitespace-nowrap">
                        <span class="font-bold kwota text-[var(--c-save)]">${zl(zebraneGr)}</span>
                        <span class="text-[10px] text-[var(--muted)]"> / ${zl(c.target_gr)}</span>
                    </div>
                </div>
                <div class="w-full bg-[var(--bg)] h-2.5 rounded-full overflow-hidden" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${procent}" aria-label="Postęp celu ${esc(c.name)}">
                    <div class="bg-[var(--c-save)] h-full transition-all duration-500" style="width: ${procent}%;"></div>
                </div>
                <div class="flex justify-between items-center text-[11px] text-[var(--muted)]">
                    <span>Postęp: ${procent}%</span>
                    <div class="space-x-3">
                        <button type="button" onclick="otworzFormularzCelu('${esc(c.id)}')" class="text-[var(--accent)] font-semibold hover:underline">Edytuj</button>
                        <button type="button" onclick="usunCel('${esc(c.id)}')" class="text-[var(--c-spend)] hover:underline">Usuń</button>
                    </div>
                </div>
            </article>
        `;
    }).join('');

    document.getElementById('cele-suma-ogolna').innerText = zl(sumaOgolnaGr);
}

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
