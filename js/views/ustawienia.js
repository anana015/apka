// =====================================================================
// EKRAN: USTAWIENIA (zębatka w nagłówku)
// Specyfikacja: 11.3 (kopia zapasowa, eksport do Excela) i 9.1 (docelowa stopa
// oszczędności jako ustawienie użytkownika).
// „Wczytaj kopię” (nadpisuje dane w chmurze) – osobny, kolejny etap.
// =====================================================================

const WERSJA_KOPII = 1;
const TABELE_KOPII = [
    { nazwa: 'transakcje', sort: 'booked_on' },
    { nazwa: 'rules', sort: null },
    { nazwa: 'goals', sort: null }
];

const NAZWY_TYPOW = {
    przychod: 'Przychód',
    wydatek: 'Wydatek',
    wplata: 'Oszczędności',
    wyplata: 'Wypłata z celu',
    pominiete: 'Pominięte'
};

function wrocZUstawien() {
    zmienZakladke(stan.poprzedniaZakladka || 'pulpit');
}

function odswiezUstawienia() {
    document.getElementById('ust-wroc-nazwa').innerText = TYTULY_ZAKLADEK[stan.poprzedniaZakladka] || 'Pulpit';
    document.getElementById('stat-cel-stopy').value = docelowaStopa();
    document.getElementById('ust-zapamietaj').checked = zapamietujPodobne();

    document.getElementById('ust-kopia-info').innerText =
        `W chmurze: ${stan.transakcje.length} transakcji, ${dynamiczneReguly.length} reguł, ${stan.cele.length} celów.`;

    // Okres eksportu: wszystkie albo jeden miesiąc (najnowszy pierwszy)
    const select = document.getElementById('ust-eksport-okres');
    const poprzedni = select.value;
    const miesiace = Array.from(new Set(stan.transakcje.map(t => t.booked_on.substring(0, 7)))).sort().reverse();
    select.innerHTML = `<option value="">Wszystkie transakcje</option>` +
        miesiace.map(m => `<option value="${esc(m)}">${esc(nazwaMiesiaca(m))}</option>`).join('');
    if (miesiace.includes(poprzedni)) select.value = poprzedni;

    const konto = document.getElementById('ust-konto');
    supabaseClient.auth.getUser()
        .then(({ data }) => { konto.innerText = data && data.user ? `Zalogowano jako ${data.user.email}` : ''; })
        .catch(() => { konto.innerText = ''; });
}

// ---- Pobranie pliku --------------------------------------------------

function pobierzPlik(nazwaPliku, tresc, typ) {
    const blob = new Blob([tresc], { type: typ });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nazwaPliku;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function dzisIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---- Zapisz kopię (JSON) ---------------------------------------------

async function zapiszKopie() {
    const btn = document.getElementById('btn-zapisz-kopie');
    btn.disabled = true;
    btn.innerText = 'Pobieranie danych z chmury...';

    try {
        // Zawsze świeże dane z bazy, nie tylko to, co jest w pamięci ekranu
        const tabele = {};
        for (const { nazwa, sort } of TABELE_KOPII) {
            const { data, error } = await pobierzWszystkie(nazwa, sort);
            if (error) throw new Error(`${nazwa}: ${error.message}`);
            tabele[nazwa] = data;
        }

        const kopia = {
            format: 'budzet-domowy-kopia',
            version: WERSJA_KOPII,
            created_at: new Date().toISOString(),
            counts: Object.fromEntries(Object.entries(tabele).map(([k, v]) => [k, v.length])),
            settings: { docelowaStopa: docelowaStopa(), zapamietajPodobne: zapamietujPodobne() },
            tables: tabele
        };

        pobierzPlik(`budzet-kopia-${dzisIso()}.json`, JSON.stringify(kopia, null, 2), 'application/json');
        pokazKomunikat('Kopia zapasowa zapisana');
    } catch (err) {
        pokazKomunikat('Nie udało się zapisać kopii: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = 'Zapisz kopię';
    }
}

// ---- Eksport do Excela (CSV) -----------------------------------------

// Pole CSV: średnik jako separator (polski Excel), cudzysłowy podwajane.
// Tekst zaczynający się od = + @ dostaje apostrof, żeby Excel nie uznał go za formułę.
function poleCSV(wartosc, tekstowe = true) {
    let s = String(wartosc ?? '');
    if (tekstowe && /^[=+@\t\r]/.test(s)) s = "'" + s;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function kategoriaLubCel(k) {
    if (k.typ === 'wydatek') return k.kategoria || 'Bez kategorii';
    if (k.typ === 'wplata' || k.typ === 'wyplata') return k.cel ? k.cel.name : '';
    if (k.typ === 'przychod') return k.kategoria || '';
    return '';
}

function eksportujCSV() {
    const okres = document.getElementById('ust-eksport-okres').value;
    const lista = stan.transakcje
        .filter(t => !okres || t.booked_on.startsWith(okres))
        .slice()
        .sort((a, b) => a.booked_on.localeCompare(b.booked_on));

    if (lista.length === 0) {
        pokazKomunikat('Brak transakcji do eksportu');
        return;
    }

    // Kolumny A–F: Data, Kontrahent, Tytuł, Kwota, Typ, Kategoria / cel
    const wiersze = [['Data', 'Kontrahent', 'Tytuł', 'Kwota', 'Typ', 'Kategoria / cel'].join(';')];
    for (const t of lista) {
        const k = klasyfikuj(t);
        wiersze.push([
            poleCSV(t.booked_on),
            poleCSV(t.counterparty),
            poleCSV(t.title),
            poleCSV((t.amount_gr / 100).toFixed(2).replace('.', ','), false),
            poleCSV(NAZWY_TYPOW[k.typ] || k.typ),
            poleCSV(kategoriaLubCel(k))
        ].join(';'));
    }

    // BOM – Excel rozpozna UTF-8 i pokaże polskie znaki
    const nazwa = `budzet-transakcje-${okres || 'wszystkie'}.csv`;
    pobierzPlik(nazwa, '﻿' + wiersze.join('\r\n'), 'text/csv;charset=utf-8');
    pokazKomunikat(`Wyeksportowano ${lista.length} transakcji`);
}
