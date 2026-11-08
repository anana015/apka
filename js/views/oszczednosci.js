// =====================================================================
// OSZCZĘDNOŚCI W KATEGORIACH (np. Akcje/Obligacje)
// Pieniądze odkładane poza subkontami celów – w kategoriach z przełącznikiem
// „Oszczędność” (Ustawienia). Karta na Pulpicie (wybrany okres + łącznie)
// i karta w Statystykach (miesiące roku + tabela kategorii).
// Wpływ w takiej kategorii (np. sprzedaż obligacji) pomniejsza zebraną kwotę.
// =====================================================================

// Kategorie oszczędnościowe, które mają jakąkolwiek transakcję albo są włączone w Ustawieniach
function nazwyKategoriiOszczednosciowych(sumyLacznie) {
    const nazwy = new Set(Object.keys(sumyLacznie));
    (stan.kategorie || []).forEach(k => { if (czyKategoriaOszczednosciowa(k.name)) nazwy.add(k.name); });
    return [...nazwy];
}

// Wpłaty i wypłaty w kategoriach oszczędnościowych dla listy transakcji
function ruchyOszczednosci(lista) {
    const s = podsumuj(lista);
    return { wplaty: s.inwestycje, wyplaty: s.inwestycjeWyplaty, kategorie: s.kategorieOszczednosci };
}

// ---- Pulpit ------------------------------------------------------------

// transOkres = transakcje okresu wybranego na Pulpicie (miesiąc albo zakres dat)
function rysujOszczednosciPulpitu(transOkres) {
    const karta = document.getElementById('pulpit-oszcz-kat');
    const lacznie = ruchyOszczednosci(stan.transakcje);
    const nazwy = nazwyKategoriiOszczednosciowych(lacznie.kategorie);
    const brakRuchow = Object.keys(lacznie.kategorie).length === 0;
    // Bez kategorii oszczędnościowych z transakcjami karta tylko by zajmowała miejsce
    karta.classList.toggle('hidden', brakRuchow || stan.transakcje.length === 0);
    if (brakRuchow) return;

    const okres = ruchyOszczednosci(transOkres);
    const nettoOkresu = okres.wplaty - okres.wyplaty;
    const sumaLacznie = Object.values(lacznie.kategorie).reduce((a, b) => a + b, 0);

    document.getElementById('pulpit-oszcz-kat-okres').innerText = zl(nettoOkresu);
    document.getElementById('pulpit-oszcz-kat-podpis').innerText = okres.wyplaty > 0
        ? `wpłaty ${zl(okres.wplaty)} − wypłaty ${zl(okres.wyplaty)} w tym okresie`
        : 'odłożone w tym okresie';
    document.getElementById('pulpit-oszcz-kat-lacznie').innerText = zl(sumaLacznie);

    const wiersze = nazwy
        .map(n => ({ nazwa: n, okres: okres.kategorie[n] || 0, lacznie: lacznie.kategorie[n] || 0 }))
        .sort((a, b) => b.lacznie - a.lacznie);
    const najwieksza = Math.max(1, ...wiersze.map(w => w.lacznie));

    document.getElementById('pulpit-oszcz-kat-lista').innerHTML = wiersze.map(w => {
        const kolor = kolorKategorii(w.nazwa);
        const dlugosc = Math.max(0, (w.lacznie / najwieksza) * 100);
        return `
            <button type="button" data-kat="${esc(w.nazwa)}" onclick="pokazTransakcjeKategorii(this.dataset.kat)"
                class="block w-full text-left space-y-1 border-b border-[var(--border)] pb-2 -mx-1 px-1 pt-1 rounded-lg hover:bg-[var(--bg)] transition"
                aria-label="${esc(`${w.nazwa}: łącznie ${zl(w.lacznie, 2)}, w tym okresie ${zl(w.okres, 2)}. Pokaż transakcje`)}">
                <span class="flex justify-between items-center gap-2">
                    <span class="flex items-center gap-2 min-w-0"><span class="dot" style="background:${esc(kolor)}"></span><span class="truncate">${esc(w.nazwa)}</span></span>
                    <span class="flex items-center gap-1.5 whitespace-nowrap">
                        <span class="kwota font-semibold">${zl(w.lacznie)}</span>
                        <span class="text-[var(--muted)]" aria-hidden="true">›</span>
                    </span>
                </span>
                <span class="block h-1.5 w-full rounded-full bg-[var(--bg)] overflow-hidden" aria-hidden="true">
                    <span class="block h-full rounded-full" style="width:${dlugosc.toFixed(1)}%;background:${esc(kolor)}"></span>
                </span>
                <span class="block text-[10px] text-[var(--muted)] kwota">w tym okresie ${w.okres >= 0 ? '+' : '−'}${zl(Math.abs(w.okres))}</span>
            </button>`;
    }).join('');
}

// ---- Statystyki --------------------------------------------------------

function rysujOszczednosciStatystyk() {
    const karta = document.getElementById('stat-oszcz-kat');
    const d = daneStatystyk();
    const lacznie = ruchyOszczednosci(stan.transakcje);
    const nazwy = nazwyKategoriiOszczednosciowych(lacznie.kategorie);
    const pusty = !d || d.miesiaceZDanymi < MIN_MIESIECY_STATYSTYK || Object.keys(lacznie.kategorie).length === 0;
    karta.classList.toggle('hidden', pusty);
    if (pusty) return;

    // Miesiące roku ze Statystyk (od stycznia do ostatniego miesiąca z danymi)
    const miesiace = d.wiersze.map(r => ({ r, ruch: ruchyOszczednosci(d.grupy[r.klucz] || []) }));
    const wplatyRoku = miesiace.reduce((s, m) => s + m.ruch.wplaty, 0);
    const wyplatyRoku = miesiace.reduce((s, m) => s + m.ruch.wyplaty, 0);
    const sumaLacznie = Object.values(lacznie.kategorie).reduce((a, b) => a + b, 0);

    document.getElementById('stat-oszcz-kat-kafelki').innerHTML = `
        <div><span class="tile-label">Odłożone w ${d.rok}</span>
            <p class="tile-value kwota text-[var(--c-save)]">${zl(wplatyRoku - wyplatyRoku)}</p>
            <span class="tile-note">${wyplatyRoku > 0 ? `wpłaty ${zl(wplatyRoku)} − wypłaty ${zl(wyplatyRoku)}` : `średnio ${zl(wplatyRoku / miesiace.length)} / mies.`}</span></div>
        <div><span class="tile-label">Zebrane łącznie</span>
            <p class="tile-value kwota">${zl(sumaLacznie)}</p>
            <span class="tile-note">wpłaty − wypłaty od początku historii</span></div>`;

    document.getElementById('stat-oszcz-kat-wykres').innerHTML = wykresSlupkowy({
        etykiety: miesiace.map(m => m.r.etykieta),
        opis: 'Wpłaty i wypłaty w kategoriach oszczędnościowych w kolejnych miesiącach',
        serie: [
            { kolor: 'var(--c-save)', wartosci: miesiace.map(m => m.ruch.wplaty),
              podpowiedz: (i, v) => `${MIESIACE_PELNE[miesiace[i].r.miesiac - 1]}: wpłaty ${zl(v)}` },
            { kolor: 'var(--c-spend)', wartosci: miesiace.map(m => m.ruch.wyplaty),
              podpowiedz: (i, v) => `${MIESIACE_PELNE[miesiace[i].r.miesiac - 1]}: wypłaty ${zl(v)}` }
        ]
    });

    const rokPoKategorii = {};
    miesiace.forEach(m => Object.entries(m.ruch.kategorie).forEach(([k, v]) => { rokPoKategorii[k] = (rokPoKategorii[k] || 0) + v; }));
    const wiersze = nazwy
        .map(n => ({ nazwa: n, rok: rokPoKategorii[n] || 0, lacznie: lacznie.kategorie[n] || 0 }))
        .sort((a, b) => b.lacznie - a.lacznie);

    document.getElementById('stat-oszcz-kat-tabela').innerHTML = wiersze.map(w => `
        <tr class="border-t border-[var(--border)]">
            <td class="py-1.5 pr-2"><span class="dot mr-1.5" style="background:${esc(kolorKategorii(w.nazwa))}"></span>${esc(w.nazwa)}</td>
            <td class="py-1.5 text-right kwota">${zl(w.rok)}</td>
            <td class="py-1.5 text-right kwota text-[var(--muted)] pl-2 whitespace-nowrap">${zl(w.rok / miesiace.length)}</td>
            <td class="py-1.5 text-right kwota font-semibold pl-2 whitespace-nowrap">${zl(w.lacznie)}</td>
        </tr>`).join('');
}
