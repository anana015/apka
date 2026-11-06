// =====================================================================
// NARZĘDZIA
// =====================================================================

// Escapowanie tekstu wstawianego do innerHTML (ochrona przed XSS z pliku CSV)
function esc(wartosc) {
    return String(wartosc ?? '').replace(/[&<>"']/g, z => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[z]));
}

// Wielkie litery bez polskich znaków: "Żabka" -> "ZABKA"
const ZNAKI_DIAKRYTYCZNE = new RegExp('[\\u0300-\\u036f]', 'g');
function normalizuj(tekst) {
    return String(tekst || '')
        .toUpperCase()
        .replace(/Ł/g, 'L')
        .normalize('NFD')
        .replace(ZNAKI_DIAKRYTYCZNE, '');
}

// Numer konta / słowo kluczowe bez spacji i cudzysłowów
function czystyNumer(tekst) {
    return String(tekst || '').replace(/['"\s]+/g, '').toUpperCase();
}

// Liczba w polskim formacie: 4996 -> "4 996", 12400.5 -> "12 400,5" (bez "-0").
// Ręcznie, bo toLocaleString('pl-PL') nie grupuje liczb 4-cyfrowych („4996 zł”),
// a specyfikacja (pkt 6) wymaga spacji jako separatora tysięcy. Spacja twarda – kwota się nie łamie.
function liczba(wartosc, miejsca = 0) {
    const v = +Number(wartosc).toFixed(miejsca) || 0;
    const [calkowite, ulamek] = Math.abs(v).toFixed(miejsca).split('.');
    const zGrupami = calkowite.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return `${v < 0 ? '-' : ''}${zGrupami}${ulamek ? ',' + ulamek : ''}`;
}

// Grosze -> "12 345 zł" / "12 345,67 zł"
function zl(grosze, miejsca = 0) {
    return `${liczba(grosze / 100, miejsca)} zł`;
}

// Klucz "2026-10" -> "Październik 2026" (wybór miesiąca, pkt 6 i 7.1).
// Tablice nazw miesięcy są w calc.js (wywołanie dopiero po załadowaniu wszystkich plików).
function nazwaMiesiaca(klucz) {
    const m = Number(String(klucz).slice(5, 7));
    return m ? `${MIESIACE_PELNE[m - 1]} ${String(klucz).slice(0, 4)}` : String(klucz);
}

// Klucz "2026-10" -> "październiku 2026" (do zdań „w …”)
function nazwaMiesiacaMiejscownik(klucz) {
    const m = Number(String(klucz).slice(5, 7));
    return m ? `${MIESIACE_MIEJSCOWNIK[m - 1]} ${String(klucz).slice(0, 4)}` : String(klucz);
}

// Wartość zmiennej CSS (np. '--c-spend')
function kolorCSS(nazwa) {
    return getComputedStyle(document.documentElement).getPropertyValue(nazwa).trim();
}

// Kolor kategorii wg grup ze specyfikacji (10.4); nieznane -> "Inne"
function kolorKategorii(nazwa) {
    if (nazwa === 'Nieprzypisane') return 'var(--muted)';
    return KOLORY_GRUP[GRUPA_KATEGORII[nazwa]] || KOLORY_GRUP.Inne;
}
