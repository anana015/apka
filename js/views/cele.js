// =====================================================================
// EKRAN: CELE
// =====================================================================

function odswiezCele() {
    const lista = document.getElementById('lista-celow');

    if (!stan.cele || stan.cele.length === 0) {
        lista.innerHTML = `<div class="text-center text-xs text-[var(--muted)] py-6">Brak celów. Kliknij "+ Nowy cel".</div>`;
        document.getElementById('cele-suma-ogolna').innerText = `0 zł`;
        return;
    }

    const salda = saldaCelow();
    let sumaOgolnaGr = 0;

    lista.innerHTML = stan.cele.map(c => {
        const zebraneGr = salda[c.id];
        const procent = c.target_gr > 0 ? Math.min(Math.max(Math.round((zebraneGr / c.target_gr) * 100), 0), 100) : 0;
        sumaOgolnaGr += zebraneGr;

        return `
            <div class="bg-[var(--bg)] p-4 rounded-2xl space-y-2.5">
                <div class="flex justify-between items-center text-xs">
                    <div>
                        <h4 class="font-bold text-sm text-gray-900 dark:text-gray-100">${esc(c.name)}</h4>
                        <span class="text-[10px] text-[var(--muted)] block">Subkonto: ${esc(c.keyword || 'brak')}</span>
                        ${c.keywords_out ? `<span class="text-[10px] text-[var(--muted)] block">Słowa wypłat: ${esc(c.keywords_out)}</span>` : ''}
                    </div>
                    <div class="text-right">
                        <span class="font-bold tabular-nums text-[var(--c-save)]">${zl(zebraneGr)}</span>
                        <span class="text-[10px] text-[var(--muted)]"> / ${zl(c.target_gr)}</span>
                    </div>
                </div>
                <div class="w-full bg-gray-200 dark:bg-gray-700 h-2.5 rounded-full overflow-hidden">
                    <div class="bg-[var(--c-save)] h-full transition-all duration-500" style="width: ${procent}%;"></div>
                </div>
                <div class="flex justify-between items-center text-[10px] text-[var(--muted)]">
                    <span>Postęp: ${procent}%</span>
                    <div class="space-x-2">
                        <button onclick="otworzFormularzCelu('${esc(c.id)}')" class="text-[var(--accent)] font-semibold hover:underline">Edytuj</button>
                        <button onclick="usunCel('${esc(c.id)}')" class="text-red-500 hover:underline">Usuń</button>
                    </div>
                </div>
            </div>
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
        pokazKomunikat('Zapisano cel');
    }
}

async function usunCel(id) {
    if (!confirm('Czy na pewno chcesz usunąć ten cel?')) return;
    const { error } = await supabaseClient.from('goals').delete().eq('id', id);
    if (!error) pobierzDane();
    else alert('Błąd usuwania: ' + error.message);
}
