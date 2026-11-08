// =====================================================================
// EKRAN: PULPIT (specyfikacja, rozdział 6)
// =====================================================================

const PROG_OSTRZEZENIA_LIMITU = 0.8; // od 80% limitu tekst czerwony i pogrubiony (6, #10)

// Domyślny miesiąc: ostatni pełny miesiąc z transakcjami, a gdy go nie ma – najnowszy (6, #2)
function domyslnyMiesiacPulpitu(miesiace, dzis = new Date()) {
    const biezacy = kluczMiesiaca(dzis.getFullYear(), dzis.getMonth() + 1);
    const pelne = miesiace.filter(m => m < biezacy).sort();
    if (pelne.length) return pelne[pelne.length - 1];
    return miesiace.slice().sort().pop() || null;
}

function przeliczMiesiace() {
    const miesiace = Array.from(new Set(stan.transakcje.map(t => t.booked_on.substring(0, 7))));
    if (!stan.miesiacWybrany || !miesiace.includes(stan.miesiacWybrany)) {
        stan.miesiacWybrany = domyslnyMiesiacPulpitu(miesiace);
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

    const trybMiesiac = stan.trybFiltraPulpit === 'miesiac';
    const transOkres = trybMiesiac
        ? stan.transakcje.filter(t => t.booked_on.startsWith(stan.miesiacWybrany))
        : stan.transakcje.filter(t => {
            const data = t.booked_on;
            if (stan.pulpitDataOd && data < stan.pulpitDataOd) return false;
            if (stan.pulpitDataDo && data > stan.pulpitDataDo) return false;
            return true;
        });

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
        document.getElementById('alert-tekst').innerText =
            `${bezKatOgolem} ${odmiana(bezKatOgolem, 'transakcja czeka', 'transakcje czekają', 'transakcji czeka')} na kategorię lub skarbonkę`;
    } else alertBox.classList.add('hidden');

    rysujKarteCelow();
    rysujKategoriePulpitu(s.kategorie, trybMiesiac);
}

// ---- Karta „Cele oszczędnościowe” (6, #8) ------------------------------
// Suma sald, pasek z kolorowych odcinków (saldo celu ÷ suma sald), „N subkonta”

function rysujKarteCelow() {
    const karta = document.getElementById('pulpit-cele');
    const aktywne = stan.cele.filter(c => !c.archived);
    if (stan.cele.length === 0) {
        document.getElementById('pulpit-cele-suma').innerText = '0 zł';
        document.getElementById('pulpit-cele-pasek').innerHTML = '';
        document.getElementById('pulpit-cele-legenda').innerHTML = '';
        document.getElementById('pulpit-cele-podpis').innerText = 'Nie masz jeszcze celów. Dodaj pierwszy w zakładce Cele.';
        return;
    }

    const salda = saldaCelow();
    // Cele z dodatnim saldem: aktywne i zakończone, na których zostały pieniądze
    const zSaldem = stan.cele.filter(c => salda[c.id] > 0);
    const suma = zSaldem.reduce((a, c) => a + salda[c.id], 0);

    document.getElementById('pulpit-cele-suma').innerText = zl(suma);
    document.getElementById('pulpit-cele-pasek').innerHTML = suma > 0
        ? zSaldem.map(c => {
            const udzial = (salda[c.id] / suma) * 100;
            return `<div style="width:${udzial.toFixed(2)}%;background:${esc(kolorCelu(c))}" title="${esc(`${c.name}: ${zl(salda[c.id])} (${Math.round(udzial)}%)`)}"></div>`;
        }).join('')
        : '';
    document.getElementById('pulpit-cele-legenda').innerHTML = zSaldem.map(c => `
        <span class="flex items-center gap-1 min-w-0"><span class="dot" style="background:${esc(kolorCelu(c))}"></span><span class="truncate">${esc(c.name)}</span></span>`).join('');

    const n = aktywne.length;
    document.getElementById('pulpit-cele-podpis').innerText = `${n} ${odmiana(n, 'subkonto', 'subkonta', 'subkont')}`;
    karta.setAttribute('aria-label', `Cele oszczędnościowe: ${zl(suma)} na ${n} ${odmiana(n, 'subkoncie', 'subkontach', 'subkontach')}. Przejdź do celów.`);
}

// ---- „Wydatki według kategorii” z paskami i limitami (6, #9 i #10) ------

function rysujKategoriePulpitu(kategorie, trybMiesiac) {
    const lista = document.getElementById('pulpit-kategorie-lista');
    const posortowane = Object.entries(kategorie).sort((a, b) => b[1] - a[1]);
    if (posortowane.length === 0) {
        lista.innerHTML = `<p class="text-[var(--muted)] text-xs">Brak wydatków w tym okresie.</p>`;
        return;
    }
    const najwieksza = posortowane[0][1];

    lista.innerHTML = posortowane.map(([kat, kwota]) => {
        const kolor = kolorKategorii(kat);
        const dlugosc = najwieksza > 0 ? (kwota / najwieksza) * 100 : 0;
        const kategoria = kategoriaPoNazwie(kat);
        const limit = trybMiesiac && kategoria && kategoria.monthly_limit_gr > 0 ? kategoria.monthly_limit_gr : null;
        let linijkaLimitu = '';
        if (limit) {
            const wykorzystanie = kwota / limit;
            const ostrzezenie = wykorzystanie >= PROG_OSTRZEZENIA_LIMITU;
            linijkaLimitu = `<p class="text-[10px] ${ostrzezenie ? 'text-[var(--c-spend)] font-bold' : 'text-[var(--muted)]'}">Limit ${zl(limit)} · wykorzystano ${Math.round(wykorzystanie * 100)}%</p>`;
        }
        return `
            <div class="space-y-1 border-b border-[var(--border)] pb-2">
                <div class="flex justify-between items-center gap-2">
                    <span class="flex items-center gap-2 min-w-0"><span class="dot" style="background:${esc(kolor)}"></span><span class="truncate">${esc(kat)}</span></span>
                    <span class="kwota font-semibold whitespace-nowrap">${zl(kwota, 2)}</span>
                </div>
                <div class="h-1.5 w-full rounded-full bg-[var(--bg)] overflow-hidden" aria-hidden="true">
                    <div class="h-full rounded-full" style="width:${dlugosc.toFixed(1)}%;background:${esc(kolor)}"></div>
                </div>
                ${linijkaLimitu}
            </div>`;
    }).join('');
}
