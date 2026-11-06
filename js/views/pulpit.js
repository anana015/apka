// =====================================================================
// EKRAN: PULPIT
// =====================================================================

function przeliczMiesiace() {
    const miesiaceSet = new Set(stan.transakcje.map(t => t.booked_on.substring(0, 7)));
    const miesiaceArr = Array.from(miesiaceSet).sort().reverse();
    if (miesiaceArr.length > 0 && !stan.miesiacWybrany) {
        stan.miesiacWybrany = miesiaceArr[0];
    }
}

function zmienTrybFiltraPulpit(tryb) {
    stan.trybFiltraPulpit = tryb;
    const btnMiesiac = document.getElementById('btn-pulpit-miesiac');
    const btnZakres = document.getElementById('btn-pulpit-zakres');
    const kontMiesiac = document.getElementById('pulpit-kontener-miesiac');
    const kontZakres = document.getElementById('pulpit-kontener-zakres');
    const aktywny = 'flex-1 py-1.5 rounded-xl font-semibold transition bg-[var(--accent)] text-white';
    const nieaktywny = 'flex-1 py-1.5 rounded-xl font-semibold transition bg-transparent text-[var(--muted)]';

    if (tryb === 'miesiac') {
        btnMiesiac.className = aktywny;
        btnZakres.className = nieaktywny;
        kontMiesiac.classList.remove('hidden');
        kontZakres.classList.add('hidden');
    } else {
        btnZakres.className = aktywny;
        btnMiesiac.className = nieaktywny;
        kontZakres.classList.remove('hidden');
        kontMiesiac.classList.add('hidden');
    }
    odswiezPulpit();
}

function zmienZakresPulpit() {
    stan.pulpitDataOd = document.getElementById('pulpit-data-od').value;
    stan.pulpitDataDo = document.getElementById('pulpit-data-do').value;
    odswiezPulpit();
}

function odswiezPulpit() {
    const kontenerMiesiace = document.getElementById('pulpit-kontener-miesiac');
    const miesiace = Array.from(new Set(stan.transakcje.map(t => t.booked_on.substring(0, 7)))).sort().reverse();

    kontenerMiesiace.innerHTML = miesiace.map(m => {
        const isSelected = m === stan.miesiacWybrany;
        return `
            <button onclick="stan.miesiacWybrany='${esc(m)}'; odswiezPulpit();" class="px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${isSelected ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg)] text-[var(--muted)]'}">
                ${esc(m)}
            </button>
        `;
    }).join('');

    let transOkres = [];
    if (stan.trybFiltraPulpit === 'miesiac') {
        transOkres = stan.transakcje.filter(t => t.booked_on.startsWith(stan.miesiacWybrany));
    } else {
        transOkres = stan.transakcje.filter(t => {
            const data = t.booked_on;
            if (stan.pulpitDataOd && data < stan.pulpitDataOd) return false;
            if (stan.pulpitDataDo && data > stan.pulpitDataDo) return false;
            return true;
        });
    }

    const s = podsumuj(transOkres);
    const stopa = s.przychody > 0 ? Math.round((s.netto / s.przychody) * 100) : 0;

    document.getElementById('pulpit-przychody').innerText = zl(s.przychody);
    document.getElementById('pulpit-wydatki').innerText = zl(s.wydatki);
    document.getElementById('pulpit-oszczednosci').innerText = zl(s.netto);
    document.getElementById('pulpit-stopa-proc').innerText = s.wyplaty > 0
        ? `wpłaty ${zl(s.wplaty)} − wypłaty ${zl(s.wyplaty)} · ${stopa}%`
        : `${stopa}% przychodów`;
    document.getElementById('pulpit-zostalo').innerText = zl(s.przychody - s.wydatki - s.netto);

    const bezKatOgolem = liczBezKategorii();
    const alertBox = document.getElementById('alert-bez-kategorii');
    if (bezKatOgolem > 0) {
        alertBox.classList.remove('hidden');
        document.getElementById('alert-tekst').innerText = `${bezKatOgolem} transakcji czeka na kategorię lub skarbonkę`;
    } else alertBox.classList.add('hidden');

    document.getElementById('pulpit-kategorie-lista').innerHTML = Object.entries(s.kategorie).map(([kat, kwota]) => `
        <div class="flex justify-between items-center border-b border-gray-100 dark:border-gray-800 pb-1">
            <span>${esc(kat)}</span>
            <span class="tabular-nums font-semibold">${zl(kwota, 2)}</span>
        </div>
    `).join('');
}
