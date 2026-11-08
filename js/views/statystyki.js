// =====================================================================
// EKRAN: STATYSTYKI (specyfikacja, rozdział 9)
// Zakres: bieżący rok, od stycznia do ostatniego miesiąca z danymi (n mies.).
// =====================================================================

const MIN_MIESIECY_STATYSTYK = 2; // punkt 10.3 – stan pusty
const KLUCZ_DOCELOWEJ_STOPY = 'budzet.docelowaStopa';

function procent(v, miejsca = 1) {
    return `${liczba(v, miejsca)}%`;
}

// ---- Ustawienie: docelowa stopa oszczędności -------------------------

function docelowaStopa() {
    try {
        const v = parseFloat(localStorage.getItem(KLUCZ_DOCELOWEJ_STOPY));
        return Number.isFinite(v) ? v : DOCELOWA_STOPA_DOMYSLNA;
    } catch (e) {
        return DOCELOWA_STOPA_DOMYSLNA;
    }
}

function zmienDocelowaStope(wartosc) {
    const v = parseFloat(String(wartosc).replace(',', '.'));
    if (!Number.isFinite(v) || v < 0 || v > 100) {
        pokazKomunikat('Podaj stopę od 0 do 100%');
        document.getElementById('stat-cel-stopy').value = docelowaStopa();
        return;
    }
    try { localStorage.setItem(KLUCZ_DOCELOWEJ_STOPY, String(v)); } catch (e) {}
    odswiezStatystyki();
    pokazKomunikat(`Docelowa stopa oszczędności: ${liczba(v, v % 1 ? 1 : 0)}%`);
}

// ---- Główne odświeżenie ---------------------------------------------

function odswiezStatystyki() {
    const d = daneStatystyk();
    const pusty = !d || d.miesiaceZDanymi < MIN_MIESIECY_STATYSTYK;

    document.getElementById('stat-pusty').classList.toggle('hidden', !pusty);
    document.querySelectorAll('#tab-statystyki .stat-tresc').forEach(el => el.classList.toggle('hidden', pusty));

    const podtytul = document.getElementById('stat-podtytul');
    if (d && !pusty) {
        const n = d.wiersze.length;
        podtytul.innerText = `Rok ${d.rok}, od stycznia do ${MIESIACE_DOPELNIACZ[n - 1]} (${n} mies.)`;
    } else {
        podtytul.innerText = '';
    }
    if (pusty) return;

    const cel = docelowaStopa();
    document.getElementById('stat-cel-stopy').value = cel;

    rysujKafelki(d, cel);
    rysujWydatkiIOszczednosci(d);
    rysujStopeOszczednosci(d, cel);
    rysujStruktureWydatkow(d);
    rysujTrendKategorii(d);
    rysujOdchylenia(d);
    rysujSaldoSubkont(d);
    rysujPorownanieLat(d);
}

// ---- 9.1 Kafelki wskaźników -----------------------------------------

function kafelek(tytul, wartosc, podpis, klasaKoloru = '') {
    return `
        <div class="card">
            <span class="tile-label">${esc(tytul)}</span>
            <p class="tile-value kwota ${klasaKoloru}">${esc(wartosc)}</p>
            <span class="tile-note">${esc(podpis)}</span>
        </div>`;
}

// Wydatki w kategoriach oznaczonych jako stałe (pole is_fixed) w jednym wierszu miesięcznym
function wydatkiStale(wiersz) {
    return Object.entries(wiersz.kategorie).reduce((s, [kat, kwota]) => s + (czyKategoriaStala(kat) ? kwota : 0), 0);
}

function rysujKafelki(d, cel) {
    const w = d.wiersze;
    const n = w.length;
    const przychody = sumaPola(w, 'przychody');
    const wydatki = sumaPola(w, 'wydatki');
    const netto = sumaPola(w, 'netto');

    const stopa = przychody > 0 ? (netto / przychody) * 100 : 0;

    const stale = w.reduce((s, r) => s + wydatkiStale(r), 0) / n;

    const najdrozszy = w.reduce((a, r) => (r.wydatki > a.wydatki ? r : a), w[0]);

    const ostatnie = w.slice(-3);
    const sredniaOstatnich = sumaPola(ostatnie, 'netto') / ostatnie.length;
    const pozostale = 12 - w[n - 1].miesiac;
    const prognoza = netto + sredniaOstatnich * pozostale;

    document.getElementById('stat-kafelki').innerHTML = [
        kafelek('Stopa oszczędności', procent(stopa), `cel ${liczba(cel, cel % 1 ? 1 : 0)}%`,
            stopa >= cel ? 'text-[var(--c-income)]' : 'text-[var(--c-spend)]'),
        kafelek('Śr. wydatki / mies.', zl(wydatki / n), `w tym stałe ${zl(stale)}`),
        kafelek('Najdroższy miesiąc', MIESIACE_PELNE[najdrozszy.miesiac - 1], zl(najdrozszy.wydatki)),
        kafelek('Prognoza na 31 grudnia', zl(prognoza),
            pozostale > 0 ? `${zl(netto)} + ${pozostale} × ${zl(sredniaOstatnich)}` : 'odłożone w całym roku',
            'text-[var(--c-save)]')
    ].join('');
}

// ---- 9.2.1 Wydatki i oszczędności -----------------------------------

function rysujWydatkiIOszczednosci(d) {
    const w = d.wiersze;
    document.getElementById('stat-wykres-wydatki').innerHTML = wykresSlupkowy({
        etykiety: w.map(r => r.etykieta),
        opis: 'Wydatki i odłożone netto w kolejnych miesiącach',
        serie: [
            { kolor: 'var(--c-spend)', wartosci: w.map(r => r.wydatki),
              podpowiedz: (i, v) => `${MIESIACE_PELNE[w[i].miesiac - 1]}: wydatki ${zl(v)}` },
            { kolor: 'var(--c-save)', wartosci: w.map(r => r.netto),
              podpowiedz: (i, v) => `${MIESIACE_PELNE[w[i].miesiac - 1]}: odłożone netto ${zl(v)}` }
        ]
    });
}

// ---- 9.2.2 Stopa oszczędności ---------------------------------------

function rysujStopeOszczednosci(d, cel) {
    const w = d.wiersze;
    const wartosci = w.map(r => r.stopa);
    const znane = wartosci.filter(v => v != null);
    const min = Math.min(-40, Math.floor(Math.min(...znane, 0) / 10) * 10);
    const max = Math.max(30, Math.ceil(Math.max(...znane, cel) / 10) * 10);

    document.getElementById('stat-wykres-stopa').innerHTML = wykresLiniowy({
        etykiety: w.map(r => r.etykieta),
        wartosci, min, max,
        kolor: 'var(--c-save)',
        opis: 'Stopa oszczędności w kolejnych miesiącach',
        siatkaY: [min, 0, max],
        format: v => `${v}%`,
        podpowiedz: (i, v) => `${MIESIACE_PELNE[w[i].miesiac - 1]}: ${procent(v)} (odłożone ${zl(w[i].netto)})`,
        cel: { wartosc: cel, etykieta: `cel ${liczba(cel, cel % 1 ? 1 : 0)}%` },
        etykietaOstatniego: v => procent(v)
    });

    // Automatyczne wyjaśnienie miesięcy poniżej zera
    const wyjasnienia = w.filter(r => r.netto < 0).map(r => {
        const [nazwa, kwota] = Object.entries(r.wyplatyCele).sort((a, b) => b[1] - a[1])[0] || ['', r.wyplaty];
        const skad = nazwa ? `z subkonta „${nazwa}”` : 'z subkont (bez przypisanego celu)';
        return `<li><strong>${esc(MIESIACE_PELNE[r.miesiac - 1])}</strong> poniżej zera: wypłata ${esc(zl(kwota))} ${esc(skad)}</li>`;
    });
    const bezPrzychodu = w.filter(r => r.stopa == null).map(r => MIESIACE_PELNE[r.miesiac - 1]);
    if (bezPrzychodu.length) {
        wyjasnienia.push(`<li>Brak przychodów (bez punktu): ${esc(bezPrzychodu.join(', '))}</li>`);
    }
    document.getElementById('stat-stopa-wyjasnienia').innerHTML = wyjasnienia.join('');
}

// ---- 9.2.3 Struktura wydatków ---------------------------------------

function rysujStruktureWydatkow(d) {
    const w = d.wiersze;
    const n = w.length;
    const grupy = {}; // grupa -> { suma, kategorie: {nazwa: suma} }
    for (const r of w) {
        for (const [kat, kwota] of Object.entries(r.kategorie)) {
            const g = grupaKategorii(kat);
            grupy[g] = grupy[g] || { suma: 0, kategorie: {} };
            grupy[g].suma += kwota;
            grupy[g].kategorie[kat] = (grupy[g].kategorie[kat] || 0) + kwota;
        }
    }
    const razem = Object.values(grupy).reduce((s, g) => s + g.suma, 0);
    const pasek = document.getElementById('stat-struktura-pasek');
    const tabela = document.getElementById('stat-struktura-tabela');

    if (razem === 0) {
        pasek.innerHTML = '';
        tabela.innerHTML = '<tr><td class="py-2 text-[var(--muted)]">Brak wydatków w tym roku.</td></tr>';
        return;
    }

    const posortowane = Object.entries(grupy).sort((a, b) => b[1].suma - a[1].suma);

    pasek.innerHTML = posortowane.map(([g, dane]) => {
        const udzial = (dane.suma / razem) * 100;
        return `<div style="width:${udzial.toFixed(2)}%;background:${kolorGrupy(g)}" title="${esc(`${g}: ${procent(udzial)}`)}"></div>`;
    }).join('');

    tabela.innerHTML = posortowane.map(([g, dane]) => {
        const skladowe = Object.entries(dane.kategorie).sort((a, b) => b[1] - a[1]).map(([k]) => k).join(', ');
        return `
            <tr class="border-b border-[var(--border)] align-top">
                <td class="py-1.5 pr-2">
                    <span class="dot mr-1.5" style="background:${kolorGrupy(g)}"></span>
                    <span class="font-semibold">${esc(g)}</span>
                    <span class="block text-[10px] text-[var(--muted)] pl-4 leading-tight">${esc(skladowe)}</span>
                </td>
                <td class="py-1.5 text-right kwota">${procent((dane.suma / razem) * 100)}</td>
                <td class="py-1.5 text-right kwota pl-2 whitespace-nowrap">${zl(dane.suma / n)}</td>
            </tr>`;
    }).join('');
}

// ---- 9.2.4 Trend kategorii ------------------------------------------

let ostatnieDaneTrendu = null;

// Kategorie zmienne (bez stałych i nieprzypisanych), od największej sumy
function kategorieTrendu(w) {
    const sumy = {};
    for (const r of w) {
        for (const [kat, kwota] of Object.entries(r.kategorie)) {
            if (czyKategoriaStala(kat) || kat === 'Nieprzypisane') continue;
            sumy[kat] = (sumy[kat] || 0) + kwota;
        }
    }
    return Object.entries(sumy).sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

function rysujTrendKategorii(d) {
    ostatnieDaneTrendu = d;
    const kategorie = kategorieTrendu(d.wiersze);
    const przyciski = document.getElementById('stat-trend-przyciski');

    if (kategorie.length === 0) {
        przyciski.innerHTML = '';
        przyciski.dataset.klucz = '';
        document.getElementById('stat-trend-wykres').innerHTML =
            '<p class="text-xs text-[var(--muted)]">Brak skategoryzowanych wydatków zmiennych.</p>';
        return;
    }
    if (!kategorie.includes(stan.statKategoria)) stan.statKategoria = kategorie[0];

    // Przyciski przebudowujemy tylko, gdy zmieniła się lista (zachowuje przewinięcie paska)
    const klucz = kategorie.join('|');
    if (przyciski.dataset.klucz !== klucz) {
        przyciski.dataset.klucz = klucz;
        przyciski.innerHTML = kategorie.map(k => `
            <button type="button" data-kat="${esc(k)}" onclick="wybierzKategorieTrendu(this.dataset.kat)"
                class="chip stat-chip" aria-pressed="false">
                ${esc(k)}
            </button>`).join('');
    }
    rysujWykresTrendu();
}

function wybierzKategorieTrendu(kategoria) {
    stan.statKategoria = kategoria;
    rysujWykresTrendu(); // tylko ta karta – ekran się nie przewija
}

function rysujWykresTrendu() {
    const d = ostatnieDaneTrendu;
    if (!d) return;
    const kat = stan.statKategoria;
    const w = d.wiersze;

    document.querySelectorAll('#stat-trend-przyciski .stat-chip').forEach(b => {
        const aktywny = b.dataset.kat === kat;
        b.classList.toggle('is-active', aktywny);
        b.setAttribute('aria-pressed', aktywny ? 'true' : 'false');
    });

    const wartosci = w.map(r => r.kategorie[kat] || 0);
    const srednia = wartosci.reduce((a, b) => a + b, 0) / w.length;

    document.getElementById('stat-trend-wykres').innerHTML = wykresSlupkowy({
        etykiety: w.map(r => r.etykieta),
        opis: `Wydatki w kategorii ${kat} w kolejnych miesiącach`,
        serie: [{
            kolor: kolorKategorii(kat),
            wartosci,
            podpowiedz: (i, v) => `${MIESIACE_PELNE[w[i].miesiac - 1]}: ${kat} ${zl(v)}`
        }],
        srednia: { wartosc: srednia, etykieta: `średnio ${zl(srednia)}` }
    });
}

// ---- 9.2.5 Odchylenia w ostatnim miesiącu ---------------------------

function rysujOdchylenia(d) {
    const ostatni = d.wiersze[d.wiersze.length - 1];
    document.getElementById('stat-odchylenia-tytul').innerText =
        `Odchylenia w ${MIESIACE_MIEJSCOWNIK[ostatni.miesiac - 1]}`;

    // 3 poprzednie miesiące (także z poprzedniego roku), tylko od początku danych
    const poprzednie = [1, 2, 3]
        .map(k => przesunKlucz(ostatni.klucz, -k))
        .filter(k => k >= d.pierwszyKlucz)
        .map(k => wierszMiesiaca(k, d.grupy[k]));

    const kontener = document.getElementById('stat-odchylenia');
    const dopisek = document.getElementById('stat-odchylenia-dopisek');
    dopisek.innerText = ostatni.klucz === d.biezacyKlucz
        ? `${MIESIACE_PELNE[ostatni.miesiac - 1]} jest dopiero rozpoczęty, więc wydatki są niższe niż średnia.`
        : '';

    if (poprzednie.length === 0) {
        kontener.innerHTML = '<p class="text-xs text-[var(--muted)]">Za mało danych do porównania.</p>';
        return;
    }

    const kategorie = new Set([
        ...Object.keys(ostatni.kategorie),
        ...poprzednie.flatMap(r => Object.keys(r.kategorie))
    ]);
    kategorie.delete('Nieprzypisane');

    const wiersze = [...kategorie].map(kat => {
        const kwota = ostatni.kategorie[kat] || 0;
        const srednia = poprzednie.reduce((s, r) => s + (r.kategorie[kat] || 0), 0) / poprzednie.length;
        return { kat, kwota, srednia, odch: srednia > 0 ? ((kwota - srednia) / srednia) * 100 : null };
    }).filter(r => r.odch != null)
      .sort((a, b) => Math.abs(b.odch) - Math.abs(a.odch))
      .slice(0, 5);

    if (wiersze.length === 0) {
        kontener.innerHTML = '<p class="text-xs text-[var(--muted)]">Brak kategorii do porównania.</p>';
        return;
    }

    kontener.innerHTML = `
        <table class="w-full text-xs">
            <thead class="text-[10px] text-[var(--muted)]">
                <tr><th class="text-left font-normal pb-1">Kategoria</th>
                    <th class="text-right font-normal pb-1">Kwota</th>
                    <th class="text-right font-normal pb-1">Śr. ${poprzednie.length} mies.</th>
                    <th class="text-right font-normal pb-1">Zmiana</th></tr>
            </thead>
            <tbody>${wiersze.map(r => {
                const kolor = r.odch > 10 ? 'text-[var(--c-spend)]' : r.odch < -10 ? 'text-[var(--c-income)]' : 'text-[var(--muted)]';
                const strzalka = r.odch > 0 ? '▲' : r.odch < 0 ? '▼' : '';
                return `
                <tr class="border-t border-[var(--border)]">
                    <td class="py-1.5 pr-1">${esc(r.kat)}</td>
                    <td class="py-1.5 text-right kwota">${zl(r.kwota)}</td>
                    <td class="py-1.5 text-right kwota text-[var(--muted)]">${zl(r.srednia)}</td>
                    <td class="py-1.5 text-right kwota font-bold ${kolor}">${strzalka} ${procent(Math.abs(r.odch), 0)}</td>
                </tr>`;
            }).join('')}</tbody>
        </table>`;
}

// ---- 9.2.6 Saldo subkont --------------------------------------------

function rysujSaldoSubkont(d) {
    const w = d.wiersze;
    const odsetki = odsetkiCelowMiesiecznie();
    // Saldo na koniec ostatniego miesiąca: dzisiejsze saldo bez odsetek dopisanych później
    const odsetkiPozniej = Object.entries(odsetki)
        .filter(([klucz]) => klucz > w[w.length - 1].klucz)
        .reduce((s, [, v]) => s + v, 0);
    const saldoDzis = Object.values(saldaCelow()).reduce((a, b) => a + b, 0) - odsetkiPozniej;

    // Liczone od końca: dla wcześniejszych miesięcy odejmujemy odłożone netto i dopisane odsetki
    const salda = new Array(w.length);
    salda[w.length - 1] = saldoDzis;
    for (let i = w.length - 2; i >= 0; i--) salda[i] = salda[i + 1] - w[i + 1].netto - (odsetki[w[i + 1].klucz] || 0);

    const wZl = salda.map(v => v / 100);
    const max = okraglaGora(Math.max(...wZl, 0));
    const min = Math.min(...wZl) < 0 ? -okraglaGora(-Math.min(...wZl)) : 0;

    document.getElementById('stat-wykres-saldo').innerHTML = wykresLiniowy({
        etykiety: w.map(r => r.etykieta),
        wartosci: wZl, min, max,
        kolor: 'var(--c-save)',
        wypelnienie: true,
        opis: 'Łączne saldo subkont na koniec kolejnych miesięcy',
        siatkaY: min < 0 ? [min, 0, max] : [0, max / 2, max],
        format: etykietaTys,
        podpowiedz: (i, v) => `${MIESIACE_PELNE[w[i].miesiac - 1]}: ${zl(v * 100)}`,
        etykietaOstatniego: v => zl(v * 100)
    });
}

// ---- 9.2.7 Porównanie lat -------------------------------------------

function wskaznikiRoku(w) {
    if (w.length === 0) return null;
    const n = w.length;
    const przychody = sumaPola(w, 'przychody');
    const netto = sumaPola(w, 'netto');
    return {
        n,
        przychod: przychody / n,
        wydatki: sumaPola(w, 'wydatki') / n,
        stopa: przychody > 0 ? (netto / przychody) * 100 : 0,
        odlozone: netto
    };
}

function rysujPorownanieLat(d) {
    const pop = wskaznikiRoku(d.wierszePop);
    const biez = wskaznikiRoku(d.wiersze);
    const kom = (x, f) => (x ? f(x) : '—');

    const wiersze = [
        ['Śr. przychód / mies.', x => zl(x.przychod)],
        ['Śr. wydatki / mies.', x => zl(x.wydatki)],
        ['Stopa oszczędności', x => procent(x.stopa)],
        ['Odłożone łącznie', x => zl(x.odlozone)]
    ];

    document.getElementById('stat-porownanie-lat').innerHTML = `
        <table class="w-full text-xs">
            <thead class="text-[10px] text-[var(--muted)]">
                <tr><th class="text-left font-normal pb-1"></th>
                    <th class="text-right font-normal pb-1">${d.rok - 1}*</th>
                    <th class="text-right font-normal pb-1">${d.rok}*</th></tr>
            </thead>
            <tbody>${wiersze.map(([nazwa, f]) => `
                <tr class="border-t border-[var(--border)]">
                    <td class="py-1.5">${nazwa}</td>
                    <td class="py-1.5 text-right kwota text-[var(--muted)]">${kom(pop, f)}</td>
                    <td class="py-1.5 text-right kwota font-semibold">${kom(biez, f)}</td>
                </tr>`).join('')}</tbody>
        </table>
        <p class="text-[10px] text-[var(--muted)] mt-2">
            * ${pop ? `${d.rok - 1}: ${pop.n} mies.` : `${d.rok - 1}: brak danych`}, ${d.rok}: ${biez.n} mies.
            Średnie miesięczne pozwalają porównać niepełny rok.
        </p>`;
}
