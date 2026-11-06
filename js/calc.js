// =====================================================================
// OBLICZENIA (sumy w groszach). Funkcje nie dotykają interfejsu ani bazy.
// =====================================================================

// "Do przypisania": wydatek bez kategorii albo wypłata ze skarbonek bez celu
function czyBezKategorii(t) {
    const k = klasyfikuj(t);
    return (k.typ === 'wydatek' && !k.kategoria) || (k.typ === 'wyplata' && !k.cel);
}

function liczBezKategorii() {
    return stan.transakcje.filter(czyBezKategorii).length;
}

// Sumy dla listy transakcji. Pominięte nie wchodzą do żadnej sumy.
function podsumuj(lista) {
    const s = { przychody: 0, wydatki: 0, wplaty: 0, wyplaty: 0, kategorie: {} };
    for (const t of lista) {
        const k = klasyfikuj(t);
        const kwota = Math.abs(t.amount_gr);
        if (k.typ === 'przychod') {
            s.przychody += kwota;
        } else if (k.typ === 'wydatek') {
            s.wydatki += kwota;
            const nazwa = k.kategoria || 'Nieprzypisane';
            s.kategorie[nazwa] = (s.kategorie[nazwa] || 0) + kwota;
        } else if (k.typ === 'wplata') {
            s.wplaty += kwota;
        } else if (k.typ === 'wyplata') {
            s.wyplaty += kwota;
        }
    }
    s.netto = s.wplaty - s.wyplaty; // odłożone netto
    return s;
}

// Saldo każdego celu: saldo początkowe + wpłaty − wypłaty (wszystkie transakcje)
function saldaCelow() {
    const salda = {};
    stan.cele.forEach(c => { salda[c.id] = c.opening_balance_gr || 0; });
    stan.transakcje.forEach(t => {
        const k = klasyfikuj(t);
        if (!k.cel || !(k.cel.id in salda)) return;
        if (k.typ === 'wplata') salda[k.cel.id] += Math.abs(t.amount_gr);
        if (k.typ === 'wyplata') salda[k.cel.id] -= Math.abs(t.amount_gr);
    });
    return salda;
}
