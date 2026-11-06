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

// Liczba w polskim formacie: 12400.5 -> "12 400,5" (bez "-0")
function liczba(wartosc, miejsca = 0) {
    const v = +Number(wartosc).toFixed(miejsca) || 0;
    return v.toLocaleString('pl-PL', { minimumFractionDigits: miejsca, maximumFractionDigits: miejsca });
}

// Grosze -> "12 345 zł" / "12 345,67 zł"
function zl(grosze, miejsca = 0) {
    return `${liczba(grosze / 100, miejsca)} zł`;
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
