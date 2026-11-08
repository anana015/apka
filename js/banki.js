// =====================================================================
// PROFILE BANKÓW DLA IMPORTU CSV: Pekao, PKO BP, Alior Bank
// Każdy profil rozpoznaje plik po nagłówkach i zamienia wiersz pliku na
// wspólny „odczyt”: { data, kwota, kontrahent, tytul, waluta, rachunki }.
// Dalej (daty, kwoty, duplikaty, klasyfikacja) wszystkie banki idą tą samą ścieżką
// (przygotujWiersze w import.js). Funkcje nie dotykają interfejsu ani bazy.
// =====================================================================

// Znormalizowany nagłówek: wielkie litery, bez polskich znaków i podwójnych spacji
function naglowekN(tekst) {
    return normalizuj(tekst).replace(/\s+/g, ' ').trim();
}

// Indeks pierwszej kolumny o nagłówku równym jednej z nazw (-1 = brak)
function kolumna(naglowkiN, ...nazwy) {
    for (const n of nazwy) {
        const i = naglowkiN.indexOf(n);
        if (i >= 0) return i;
    }
    return -1;
}

function komorkaZ(wiersz, i) {
    return i >= 0 ? String(wiersz[i] ?? '').trim() : '';
}

// ---- Alior Bank ------------------------------------------------------
// Data transakcji;Data księgowania;Nazwa nadawcy;Nazwa odbiorcy;Szczegóły transakcji;
// Kwota operacji;Waluta operacji;Kwota w walucie rachunku;Waluta rachunku;
// Numer rachunku nadawcy;Numer rachunku odbiorcy   (daty DD-MM-RRRR, kwoty „-300.00”)
// Kontrahent zależy od kierunku: przy wydatku „Nazwa odbiorcy”, przy wpływie „Nazwa nadawcy”
// (w drugiej kolumnie jest właściciel rachunku). Kwota w walucie rachunku = PLN także
// dla płatności kartą za granicą.
function czytnikAlior(naglowkiN) {
    const k = {
        data: kolumna(naglowkiN, 'DATA KSIEGOWANIA', 'DATA TRANSAKCJI'),
        kwota: kolumna(naglowkiN, 'KWOTA W WALUCIE RACHUNKU', 'KWOTA OPERACJI'),
        waluta: kolumna(naglowkiN, 'WALUTA RACHUNKU', 'WALUTA OPERACJI'),
        nadawca: kolumna(naglowkiN, 'NAZWA NADAWCY'),
        odbiorca: kolumna(naglowkiN, 'NAZWA ODBIORCY'),
        tytul: kolumna(naglowkiN, 'SZCZEGOLY TRANSAKCJI', 'TYTUL'),
        rachNadawcy: kolumna(naglowkiN, 'NUMER RACHUNKU NADAWCY'),
        rachOdbiorcy: kolumna(naglowkiN, 'NUMER RACHUNKU ODBIORCY')
    };
    return wiersz => {
        const kwota = komorkaZ(wiersz, k.kwota);
        const wplyw = (parsujKwote(kwota) || 0) > 0;
        const nadawca = komorkaZ(wiersz, k.nadawca);
        const odbiorca = komorkaZ(wiersz, k.odbiorca);
        return {
            data: komorkaZ(wiersz, k.data),
            kwota,
            waluta: komorkaZ(wiersz, k.waluta),
            kontrahent: wplyw ? (nadawca || odbiorca) : (odbiorca || nadawca),
            tytul: komorkaZ(wiersz, k.tytul),
            rachunki: { zrodlowy: komorkaZ(wiersz, k.rachNadawcy), docelowy: komorkaZ(wiersz, k.rachOdbiorcy) }
        };
    };
}

// ---- PKO BP (iPKO) ---------------------------------------------------
// "Data operacji","Data waluty","Typ transakcji","Kwota","Waluta","Saldo po transakcji",
// "Opis transakcji","","",…   (daty RRRR-MM-DD, kwoty „-25.00” / „+1500.00”)
// Opis jest rozłożony na kolumnę „Opis transakcji” i kolejne kolumny bez nazwy,
// każda w postaci „Klucz: wartość”, np. „Tytuł: …”, „Nazwa odbiorcy: …”,
// „Rachunek odbiorcy: …”, „Lokalizacja: Adres: ŻABKA Z1234 Miasto: WARSZAWA Kraj: POLSKA”.

// Komórki opisu -> { 'TYTUL': '…', 'NAZWA ODBIORCY': '…', … } + teksty bez klucza
function rozbierzOpisPKO(komorki) {
    const pola = {};
    const bezKlucza = [];
    for (const surowa of komorki) {
        const tekst = String(surowa || '').trim();
        if (!tekst) continue;
        const m = tekst.match(/^([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż ]{3,40}):\s*(.*)$/);
        if (m) {
            const klucz = naglowekN(m[1]);
            pola[klucz] = pola[klucz] ? `${pola[klucz]} ${m[2].trim()}` : m[2].trim();
        } else {
            bezKlucza.push(tekst);
        }
    }
    return { pola, bezKlucza };
}

// „Adres: ŻABKA Z1234 Miasto: WARSZAWA Kraj: POLSKA” -> „ŻABKA Z1234”
function sklepZLokalizacji(lokalizacja) {
    const m = String(lokalizacja || '').match(/Adres:\s*(.*?)\s*(?:Miasto:|Kraj:|$)/i);
    return m ? m[1].trim() : String(lokalizacja || '').trim();
}

// Tytuł płatności kartą to zwykle sam numer referencyjny – bez wartości dla kategorii
function samNumer(tekst) {
    return /^[\d\s/.-]*$/.test(String(tekst || ''));
}

function czytnikPKO(naglowkiN) {
    const k = {
        data: kolumna(naglowkiN, 'DATA OPERACJI', 'DATA WALUTY', 'DATA KSIEGOWANIA'),
        kwota: kolumna(naglowkiN, 'KWOTA', 'KWOTA OPERACJI'),
        waluta: kolumna(naglowkiN, 'WALUTA'),
        typ: kolumna(naglowkiN, 'TYP TRANSAKCJI', 'TYP OPERACJI'),
        opis: kolumna(naglowkiN, 'OPIS TRANSAKCJI', 'OPIS OPERACJI')
    };
    return wiersz => {
        const kwota = komorkaZ(wiersz, k.kwota);
        const wplyw = (parsujKwote(kwota) || 0) > 0;
        const typ = komorkaZ(wiersz, k.typ);
        const { pola, bezKlucza } = rozbierzOpisPKO(k.opis >= 0 ? wiersz.slice(k.opis) : []);

        const odbiorca = pola['NAZWA ODBIORCY'] || '';
        const nadawca = pola['NAZWA NADAWCY'] || '';
        const sklep = pola['LOKALIZACJA'] ? sklepZLokalizacji(pola['LOKALIZACJA']) : '';
        const kontrahent = (wplyw ? (nadawca || odbiorca) : (odbiorca || nadawca)) || sklep;

        let tytul = pola['TYTUL'] || bezKlucza.join(' ');
        if (samNumer(tytul)) tytul = ''; // np. numer karty / referencja płatności kartą
        if (!tytul) tytul = [typ, pola['OPERACJA']].filter(Boolean).join(' – ');

        return {
            data: komorkaZ(wiersz, k.data),
            kwota,
            waluta: komorkaZ(wiersz, k.waluta),
            kontrahent: kontrahent || typ,
            tytul,
            rachunki: {
                zrodlowy: pola['RACHUNEK NADAWCY'] || '',
                docelowy: pola['RACHUNEK ODBIORCY'] || ''
            }
        };
    };
}

// ---- Lista profili ---------------------------------------------------
// rozpoznaj(naglowkiN) -> true, gdy nagłówki pasują do układu banku.
// czytnik(naglowkiN) -> funkcja wiersz -> odczyt.
// Pekao nie ma własnego czytnika: jego układ rozpoznaje ogólne mapowanie kolumn
// (wykryjKolumny w import.js), dostrojone wcześniej pod Pekao24.
const PROFILE_BANKOW = [
    {
        id: 'alior',
        nazwa: 'Alior Bank',
        rozpoznaj: n => n.includes('NAZWA NADAWCY') && n.includes('NAZWA ODBIORCY') && n.includes('SZCZEGOLY TRANSAKCJI'),
        czytnik: czytnikAlior
    },
    {
        id: 'pko',
        nazwa: 'PKO BP',
        rozpoznaj: n => (n.includes('OPIS TRANSAKCJI') || n.includes('OPIS OPERACJI')) &&
            (n.includes('SALDO PO TRANSAKCJI') || n.includes('TYP TRANSAKCJI')),
        czytnik: czytnikPKO
    },
    {
        id: 'pekao',
        nazwa: 'Pekao',
        rozpoznaj: n => n.includes('RACHUNEK ZRODLOWY') && n.includes('RACHUNEK DOCELOWY'),
        czytnik: null
    }
];

// Instrukcje eksportu pokazywane na ekranie importu
const INSTRUKCJE_EKSPORTU = [
    { bank: 'Pekao24', droga: 'Historia → Eksport → CSV' },
    { bank: 'PKO BP (iPKO)', droga: 'Historia → Pobierz zestawienie / Eksportuj → CSV' },
    { bank: 'Alior Online', droga: 'Historia operacji → Eksportuj → CSV (separator średnik)' }
];

// Profil banku dla nagłówków pliku albo null (nieznany bank -> ogólne mapowanie / ręczny wybór)
function rozpoznajBank(naglowki) {
    const n = naglowki.map(naglowekN);
    return PROFILE_BANKOW.find(p => p.rozpoznaj(n)) || null;
}

function profilBankuPoId(id) {
    return PROFILE_BANKOW.find(p => p.id === id) || null;
}
