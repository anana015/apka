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
    const miesiac = tryb === 'miesiac';
    document.getElementById('btn-pulpit-miesiac').classList.toggle('is-active', miesiac);
    document.getElementById('btn-pulpit-zakres').classList.toggle('is-active', !miesiac);
    document.getElementById('pulpit-kontener-miesiac').classList.toggle('hidden', !miesiac);
    document.getElementById('pulpit-kontener-zakres').classList.toggle('hidden', miesiac);
    odswiezPulpit();
}

function zmienZakresPulpit() {
    stan.pulpitDataOd = document.getElementById('pulpit-data-od').value;
    stan.pulpitDataDo = document.getElementById('pulpit-data-do').value;
    odswiezPulpit();
}

function wybierzMiesiacPulpit(m) {
    stan.miesiacWybrany = m;
    odswiezPulpit();
}

function odswiezPulpit() {
    // Stan pusty (10.3)
    const brakDanych = stan.transakcje.length === 0;
    document.getElementById('pulpit-pusty').classList.toggle('hidden', !brakDanych);
    document.querySelectorAll('#tab-pulpit .pulpit-tresc').forEach(el => el.classList.toggle('hidden', brakDanych));
    if (brakDanych) {
        document.getElementById('alert-bez-kategorii').classList.add('hidden');
        return;
    }

    const kontenerMiesiace = document.getElementById('pulpit-kontener-miesiac');
    const miesiace = Array.from(new Set(stan.transakcje.map(t => t.booked_on.substring(0, 7)))).sort().reverse();

    // Etykiety miesięcy jak w specyfikacji (pkt 6): „Październik 2026”
    kontenerMiesiace.innerHTML = miesiace.map(m => {
        const wybrany = m === stan.miesiacWybrany;
        return `<button type="button" onclick="wybierzMiesiacPulpit('${esc(m)}')" class="chip ${wybrany ? 'is-active' : ''}" aria-pressed="${wybrany}">${esc(nazwaMiesiaca(m))}</button>`;
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

    const posortowane = Object.entries(s.kategorie).sort((a, b) => b[1] - a[1]);
    document.getElementById('pulpit-kategorie-lista').innerHTML = posortowane.length === 0
        ? `<p class="text-[var(--muted)] text-xs">Brak wydatków w tym okresie.</p>`
        : posortowane.map(([kat, kwota]) => `
            <div class="flex justify-between items-center gap-2 border-b border-[var(--border)] pb-1.5">
                <span class="flex items-center gap-2 min-w-0"><span class="dot" style="background:${kolorKategorii(kat)}"></span><span class="truncate">${esc(kat)}</span></span>
                <span class="kwota font-semibold whitespace-nowrap">${zl(kwota, 2)}</span>
            </div>
        `).join('');
}
