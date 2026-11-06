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

// Grosze -> "1234 zł"
function zl(grosze, miejsca = 0) {
    return `${(grosze / 100).toFixed(miejsca)} zł`;
}
