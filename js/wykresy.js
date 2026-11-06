// =====================================================================
// WYKRESY SVG (specyfikacja, punkt 9.3)
// - stała szerokość viewBox 340, wysokość 160–190, skalowanie do szerokości karty
// - góra osi = maksimum × 1,1 zaokrąglone w górę do 1, 2 lub 5 × potęga 10
// - każdy słupek i punkt ma podpowiedź <title> z miesiącem i kwotą
// - kolory ze zmiennych CSS (działa tryb ciemny); kolory kategorii z config.js (KOLORY_GRUP)
// Funkcje zwracają tekst SVG; nie dotykają bazy.
// =====================================================================

const WYKRES_SZER = 340;
const WYKRES_MARG = { lewy: 32, prawy: 8, gora: 16, dol: 18 };
const STYL_OSI = 'fill:var(--muted);font-size:9px;font-family:"IBM Plex Mono",monospace';
const STYL_LINII = 'stroke:var(--muted);stroke-width:1';

function okraglaGora(maks) {
    const v = maks * 1.1;
    if (!(v > 0)) return 1;
    const potega = 10 ** Math.floor(Math.log10(v));
    for (const m of [1, 2, 5, 10]) {
        if (m * potega >= v) return m * potega;
    }
    return 10 * potega;
}

// Etykieta osi w tysiącach: 3000 -> "3k", 2500 -> "2,5k", 400 -> "400"
function etykietaTys(zlote) {
    if (Math.abs(zlote) >= 1000) return `${liczba(zlote / 1000, zlote % 1000 === 0 ? 0 : 1)}k`;
    return liczba(zlote);
}

function svgStart(wysokosc, opis) {
    // Na szerokich kartach (komputer) wykres nie rośnie ponad 240 px wysokości – napisy zostają czytelne
    return `<svg viewBox="0 0 ${WYKRES_SZER} ${wysokosc}" width="100%" role="img" aria-label="${esc(opis)}" class="block overflow-visible mx-auto" style="max-height:240px">`;
}

// Wspólna geometria osi X: środek i-tej kolumny
function geometriaX(n) {
    const szerPola = WYKRES_SZER - WYKRES_MARG.lewy - WYKRES_MARG.prawy;
    const szerKolumny = szerPola / Math.max(n, 1);
    return { szerKolumny, srodek: i => WYKRES_MARG.lewy + szerKolumny * (i + 0.5) };
}

function geometriaY(wysokosc, min, max) {
    const wysPola = wysokosc - WYKRES_MARG.gora - WYKRES_MARG.dol;
    return v => WYKRES_MARG.gora + wysPola * (1 - (v - min) / (max - min));
}

function liniaPozioma(y, styl) {
    return `<line x1="${WYKRES_MARG.lewy}" x2="${WYKRES_SZER - WYKRES_MARG.prawy}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" style="${styl}"/>`;
}

function etykietyMiesiecy(etykiety, wysokosc) {
    const { srodek } = geometriaX(etykiety.length);
    return etykiety.map((e, i) =>
        `<text x="${srodek(i).toFixed(1)}" y="${wysokosc - 5}" text-anchor="middle" style="${STYL_OSI}">${esc(e)}</text>`
    ).join('');
}

// Linie pomocnicze z podpisami osi Y
function siatka(wartosci, y, format, wyroznij = 0) {
    return wartosci.map(v =>
        liniaPozioma(y(v), `${STYL_LINII};stroke-opacity:${v === wyroznij ? 0.5 : 0.18}`) +
        `<text x="${WYKRES_MARG.lewy - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end" style="${STYL_OSI}">${esc(format(v))}</text>`
    ).join('');
}

// Przerywana linia pozioma z etykietą przy lewej krawędzi pola
// (prawa strona zostaje wolna na etykietę ostatniego punktu)
function liniaPrzerywana(y, etykieta, kolor) {
    return liniaPozioma(y, `stroke:${kolor};stroke-width:1.2;stroke-dasharray:4 3`) +
        `<text x="${WYKRES_MARG.lewy + 3}" y="${(y - 4).toFixed(1)}" text-anchor="start" style="fill:${kolor};font-size:9px;font-weight:600;paint-order:stroke;stroke:var(--surface);stroke-width:3px">${esc(etykieta)}</text>`;
}

/**
 * Wykres słupkowy (pojedynczy lub zgrupowany). Wartości w groszach, oś Y od 0.
 * Wartość ujemna rysowana jest jako słupek zerowy; prawdziwa kwota jest w podpowiedzi.
 * serie: [{ kolor: 'var(--c-spend)', wartosci: [...], podpowiedz: (i, v) => '...' }]
 */
function wykresSlupkowy({ etykiety, serie, wysokosc = 170, opis, srednia = null }) {
    const maks = Math.max(0, ...serie.flatMap(s => s.wartosci), srednia ? srednia.wartosc : 0) / 100;
    const gora = okraglaGora(maks);
    const y = geometriaY(wysokosc, 0, gora);
    const { szerKolumny, srodek } = geometriaX(etykiety.length);
    const szerSlupka = Math.min(16, (szerKolumny * 0.72) / serie.length);
    const dno = y(0);

    let svg = svgStart(wysokosc, opis) + siatka([0, gora / 2, gora], y, etykietaTys);

    etykiety.forEach((_, i) => {
        const start = srodek(i) - (szerSlupka * serie.length) / 2;
        serie.forEach((s, j) => {
            const v = s.wartosci[i];
            const x = start + j * szerSlupka;
            const gornaKrawedz = Math.min(y(Math.max(0, v) / 100), dno - 1); // słupek zerowy = 1 px
            svg += `<g><title>${esc(s.podpowiedz(i, v))}</title>` +
                `<rect x="${x.toFixed(1)}" y="${WYKRES_MARG.gora}" width="${(szerSlupka - 1).toFixed(1)}" height="${(dno - WYKRES_MARG.gora).toFixed(1)}" style="fill:transparent"/>` +
                `<rect x="${x.toFixed(1)}" y="${gornaKrawedz.toFixed(1)}" width="${(szerSlupka - 1).toFixed(1)}" height="${(dno - gornaKrawedz).toFixed(1)}" rx="1.5" style="fill:${s.kolor}"/></g>`;
        });
    });

    if (srednia) svg += liniaPrzerywana(y(srednia.wartosc / 100), srednia.etykieta, 'var(--fg)');
    return svg + etykietyMiesiecy(etykiety, wysokosc) + '</svg>';
}

/**
 * Wykres liniowy z punktami. wartosci mogą zawierać null (brak punktu).
 * min/max w jednostkach wykresu; format(v) – podpis osi; podpowiedz(i, v) – <title>.
 */
function wykresLiniowy({
    etykiety, wartosci, min, max, kolor, opis, wysokosc = 170,
    format, podpowiedz, siatkaY, wypelnienie = false, cel = null, etykietaOstatniego = null
}) {
    const y = geometriaY(wysokosc, min, max);
    const { srodek } = geometriaX(etykiety.length);
    const punkty = wartosci
        .map((v, i) => (v == null ? null : { x: srodek(i), y: y(v), v, i }))
        .filter(Boolean);

    let svg = svgStart(wysokosc, opis) + siatka(siatkaY, y, format);
    if (cel) svg += liniaPrzerywana(y(cel.wartosc), cel.etykieta, 'var(--c-income)');

    if (punkty.length > 0) {
        const sciezka = punkty.map((p, k) => `${k ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
        if (wypelnienie) {
            const baza = y(Math.max(min, 0)).toFixed(1);
            svg += `<path d="${sciezka} L${punkty[punkty.length - 1].x.toFixed(1)},${baza} L${punkty[0].x.toFixed(1)},${baza} Z" style="fill:${kolor};fill-opacity:0.15"/>`;
        }
        svg += `<path d="${sciezka}" style="fill:none;stroke:${kolor};stroke-width:2;stroke-linejoin:round"/>`;
        svg += punkty.map(p =>
            `<g><title>${esc(podpowiedz(p.i, p.v))}</title>` +
            `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="9" style="fill:transparent"/>` +
            `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" style="fill:${kolor};stroke:var(--surface);stroke-width:1.5"/></g>`
        ).join('');

        if (etykietaOstatniego) {
            const p = punkty[punkty.length - 1];
            const kotwica = p.x > WYKRES_SZER - 40 ? 'end' : 'middle';
            svg += `<text x="${p.x.toFixed(1)}" y="${(p.y - 8).toFixed(1)}" text-anchor="${kotwica}" style="fill:${kolor};font-size:10px;font-weight:700">${esc(etykietaOstatniego(p.v))}</text>`;
        }
    }
    return svg + etykietyMiesiecy(etykiety, wysokosc) + '</svg>';
}
