// =====================================================================
// EKRAN: IMPORT CSV (specyfikacja 5 i 7.2)
// Etapy: start -> (mapowanie kolumn) -> podgląd -> wynik.
// Plik jest czytany w całości w przeglądarce; do bazy trafiają tylko gotowe transakcje
// (do budżetu, który jest właśnie otwarty – wspólnego albo osobistego, patrz db.js).
// Banki: Pekao, PKO BP, Alior Bank (profile w banki.js); inne pliki – ogólne
// mapowanie kolumn albo ręczny wybór, zapamiętywany jako profil banku.
// Część „czysta” (dekodowanie, wykrywanie kolumn, daty, kwoty, przygotowanie wierszy)
// nie dotyka interfejsu ani bazy.
// =====================================================================

const KLUCZ_PROFILI_BANKU = 'budzet.profileBanku';

const KOMUNIKAT_NIE_CSV = 'Ten plik nie wygląda na wyciąg CSV. Pobierz historię rachunku w formacie CSV (Pekao, PKO BP albo Alior Bank) – instrukcje są pod polem wyboru pliku.';

// Pola, które mapujemy na kolumny pliku (ekran ręcznego wyboru kolumn)
const POLA_IMPORTU = [
    { pole: 'data', etykieta: 'Data księgowania', wymagane: true },
    { pole: 'kwota', etykieta: 'Kwota operacji', wymagane: true },
    { pole: 'kontrahent', etykieta: 'Nadawca / Odbiorca' },
    { pole: 'tytul', etykieta: 'Tytuł' },
    { pole: 'waluta', etykieta: 'Waluta' },
    { pole: 'rachZrodlowy', etykieta: 'Rachunek źródłowy' },
    { pole: 'rachDocelowy', etykieta: 'Rachunek docelowy' },
    { pole: 'rachInny', etykieta: 'Rachunek kontrahenta (jedna kolumna)' }
];

// =====================================================================
// CZĘŚĆ CZYSTA
// =====================================================================

// 5.2 Kodowanie pliku:
//  - znacznik BOM: UTF-16 LE / BE (np. „Historia_Operacji_….csv” z Alior Online) albo UTF-8,
//  - UTF-16 bez BOM: co drugi bajt zerowy (litery łacińskie),
//  - inaczej UTF-8, a gdy pojawi się „�” – Windows-1250.
// Zwraca sam tekst; nazwę kodowania zapisuje w ostatnieKodowanie (podpis na ekranie importu).
let ostatnieKodowanie = '';

function wykryjKodowanie(bajty) {
    if (bajty[0] === 0xFF && bajty[1] === 0xFE) return 'utf-16le';
    if (bajty[0] === 0xFE && bajty[1] === 0xFF) return 'utf-16be';
    if (bajty[0] === 0xEF && bajty[1] === 0xBB && bajty[2] === 0xBF) return 'utf-8';
    const probka = bajty.subarray(0, Math.min(bajty.length, 2000));
    let zeraParzyste = 0, zeraNieparzyste = 0;
    probka.forEach((b, i) => { if (b === 0) (i % 2 ? zeraNieparzyste++ : zeraParzyste++); });
    const polowa = probka.length / 2;
    if (zeraNieparzyste > polowa * 0.3 && zeraNieparzyste > zeraParzyste * 4) return 'utf-16le';
    if (zeraParzyste > polowa * 0.3 && zeraParzyste > zeraNieparzyste * 4) return 'utf-16be';
    return null;
}

function dekodujPlik(bufor) {
    const bajty = new Uint8Array(bufor);
    let kodowanie = wykryjKodowanie(bajty);
    let tekst;
    if (kodowanie) {
        tekst = new TextDecoder(kodowanie).decode(bajty);
    } else {
        kodowanie = 'utf-8';
        tekst = new TextDecoder('utf-8').decode(bajty);
        if (tekst.includes('�')) {
            kodowanie = 'windows-1250';
            tekst = new TextDecoder('windows-1250').decode(bajty);
        }
    }
    ostatnieKodowanie = kodowanie;
    // BOM i ewentualne bajty zerowe (niewidoczne na ekranie, a psują rozpoznanie nagłówka)
    return tekst.replace(/^﻿/, '').replace(/\u0000/g, '');
}

// 5.2 Wiersz nagłówka: pierwszy wiersz, w którym któraś komórka zawiera „Data”.
// Wymagamy co najmniej 3 wypełnionych komórek, żeby nie wziąć za nagłówek
// linii opisu nad tabelą (np. „Data wygenerowania: …”).
function znajdzWierszNaglowka(wiersze) {
    const limit = Math.min(wiersze.length, 40);
    for (let i = 0; i < limit; i++) {
        const wypelnione = wiersze[i].filter(k => String(k || '').trim()).length;
        if (wypelnione >= 3 && wiersze[i].some(k => normalizuj(k).includes('DATA'))) return i;
    }
    return -1;
}

// Separator wybieramy sami, nie zgadywaniem PapaParse: przy kwotach z przecinkiem
// („-45,99”) potrafiło ono wybrać przecinek dla pliku ze średnikami (Alior) i rozciąć
// kwoty na pół. Próbujemy każdego separatora i bierzemy ten, przy którym wiersz nagłówka
// (z „Data”) ma najwięcej wypełnionych kolumn. Brak nagłówka -> najwięcej kolumn w ogóle.
const SEPARATORY_CSV = [';', ',', '\t'];
const NAZWY_SEPARATOROW = { ';': 'średnik', ',': 'przecinek', '\t': 'tabulator' };

function parsujCSV(tekst) {
    let najlepszy = null;
    for (const delimiter of SEPARATORY_CSV) {
        const { data } = Papa.parse(tekst, { delimiter, skipEmptyLines: 'greedy' });
        const wiersze = (data || []).filter(w => Array.isArray(w));
        const naglowekIdx = znajdzWierszNaglowka(wiersze);
        const kolumnyNaglowka = naglowekIdx >= 0
            ? wiersze[naglowekIdx].filter(k => String(k || '').trim()).length
            : 0;
        const maksKolumn = wiersze.reduce((m, w) => Math.max(m, w.length), 0);
        const ocena = [kolumnyNaglowka, maksKolumn];
        if (!najlepszy || ocena[0] > najlepszy.ocena[0] || (ocena[0] === najlepszy.ocena[0] && ocena[1] > najlepszy.ocena[1])) {
            najlepszy = { wiersze, naglowekIdx, maksKolumn, ocena, delimiter };
        }
    }
    return najlepszy;
}

// Indeks pierwszego nagłówka spełniającego warunek (-1 = brak)
function indeksNaglowka(naglowki, warunek) {
    return naglowki.findIndex(n => warunek(normalizuj(n).replace(/\s+/g, ' ').trim()));
}

// 5.2 Mapowanie kolumn po słowach w nagłówkach. Zwraca { pole: indeks | -1 }.
function wykryjKolumny(naglowki) {
    const ma = (...slowa) => n => slowa.some(s => n.includes(s));
    const bez = (...slowa) => n => !slowa.some(s => n.includes(s));
    const i = warunek => indeksNaglowka(naglowki, warunek);
    const pierwszy = (...indeksy) => indeksy.find(x => x >= 0) ?? -1;

    return {
        data: pierwszy(
            i(ma('DATA KSIEGOWANIA')),
            i(ma('DATA OPERACJI')),
            i(ma('DATA TRANSAKCJI')),
            i(n => n.includes('DATA') && bez('WALUTY')(n))
        ),
        kwota: pierwszy(
            i(ma('KWOTA OPERACJI')),
            i(n => n.includes('KWOTA') && bez('SALDO', 'WALUCIE RACHUNKU')(n)),
            i(ma('KWOTA'))
        ),
        kontrahent: pierwszy(
            i(n => ma('NADAWCA', 'ODBIORCA', 'KONTRAHENT')(n) && bez('ADRES', 'RACHUN', 'KONTO', 'NUMER')(n))
        ),
        tytul: pierwszy(i(ma('TYTUL')), i(ma('OPIS'))),
        waluta: i(n => n.startsWith('WALUTA')),
        rachZrodlowy: pierwszy(i(ma('RACHUNEK ZRODLOWY')), i(n => n.includes('RACHUN') && n.includes('NADAWC'))),
        rachDocelowy: pierwszy(i(ma('RACHUNEK DOCELOWY')), i(n => n.includes('RACHUN') && n.includes('ODBIORC'))),
        rachInny: pierwszy(i(ma('RACHUNEK PRZECIWSTAWNY')), i(ma('NUMER RACHUNKU')), i(ma('RACHUNEK KONTRAHENTA')))
    };
}

// Brakujące pola wymagane: data, kwota i (tytuł lub kontrahent)
function brakujacePola(mapa) {
    const braki = [];
    if (!(mapa.data >= 0)) braki.push('data');
    if (!(mapa.kwota >= 0)) braki.push('kwota');
    if (!(mapa.tytul >= 0) && !(mapa.kontrahent >= 0)) braki.push('tytuł lub kontrahent');
    return braki;
}

// 5.2 Data: DD.MM.RRRR, DD-MM-RRRR, DD/MM/RRRR, RRRR-MM-DD (ew. z godziną) -> 'RRRR-MM-DD' | null
function parsujDate(tekst) {
    const s = String(tekst || '').trim().split(/[\sT]/)[0];
    let r, m, d;
    let x = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
    if (x) [, d, m, r] = x;
    else if ((x = s.match(/^(\d{4})[-.](\d{1,2})[-.](\d{1,2})$/))) [, r, m, d] = x;
    else return null;
    const data = new Date(Date.UTC(+r, +m - 1, +d));
    if (data.getUTCFullYear() !== +r || data.getUTCMonth() !== +m - 1 || data.getUTCDate() !== +d) return null;
    return `${r}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// 5.2 Kwota: bez spacji (też twardych), bez „PLN”, przecinek -> kropka, × 100.
// „-1 234,56” -> -123456, „+1500.00” -> 150000. Błędna -> null.
function parsujKwote(tekst) {
    let s = String(tekst || '')
        .replace(/[\s  ]/g, '')
        .replace(/PLN/i, '')
        .replace(/−/g, '-'); // typograficzny minus
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, ''); // „1.234,56”
    s = s.replace(',', '.');
    if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return null;
    return Math.round(parseFloat(s) * 100);
}

// Klucz duplikatu w formacie już zapisanym w bazie (zgodność z wcześniejszymi importami):
// data-kwota-tytuł bez spacji (40 znaków); kolejne identyczne wiersze pliku: |2, |3 (4.5)
function kluczDuplikatuBazowy(booked_on, amount_gr, tytul, kontrahent) {
    const tekst = String(tytul || kontrahent || '').replace(/\s+/g, '').substring(0, 40);
    return `${booked_on}-${amount_gr}-${tekst}`;
}

// Rachunek drugiej strony: wypływ -> docelowy, wpływ -> źródłowy
// (wypłata ze wspólnego subkonta niesie wtedy jego numer)
function rachunekKontrahenta({ zrodlowy = '', docelowy = '', inny = '' }, amount_gr) {
    const surowy = amount_gr > 0 ? (zrodlowy || inny || docelowy) : (docelowy || inny || zrodlowy);
    return czystyNumer(surowy);
}

// Czytnik wiersza wg mapy kolumn (ogólne mapowanie, Pekao, profil zapisany, wybór ręczny)
function czytnikZMapy(mapa) {
    return wiersz => {
        const komorka = pole => (mapa[pole] >= 0 ? String(wiersz[mapa[pole]] ?? '').trim() : '');
        return {
            data: komorka('data'),
            kwota: komorka('kwota'),
            kontrahent: komorka('kontrahent'),
            tytul: komorka('tytul'),
            waluta: komorka('waluta'),
            rachunki: { zrodlowy: komorka('rachZrodlowy'), docelowy: komorka('rachDocelowy'), inny: komorka('rachInny') }
        };
    };
}

/**
 * Wiersze danych -> wiersze podglądu.
 * odczytaj(wiersz) -> { data, kwota, kontrahent, tytul, waluta, rachunki } (czytnik banku lub mapy)
 * status: 'nowa' | 'duplikat' | 'blad' (z polem powod)
 */
function przygotujWiersze(daneWiersze, odczytaj, istniejaceKlucze) {
    const wystapienia = {};
    const wynik = [];

    daneWiersze.forEach((wiersz, nr) => {
        if (wiersz.every(k => !String(k || '').trim())) return; // pusty wiersz
        const o = odczytaj(wiersz);
        const surowaData = o.data;
        const surowaKwota = o.kwota;
        const counterparty = o.kontrahent;
        const title = o.tytul;
        const waluta = o.waluta;

        const booked_on = parsujDate(surowaData);
        const amount_gr = parsujKwote(surowaKwota);
        // Wiersz bez daty (pusta lub sam tekst) albo bez daty i kwoty to nie transakcja,
        // tylko stopka / saldo końcowe / opis pod tabelą. Błędną datę z cyframi pokazujemy jako błąd.
        if (!booked_on && (!/\d/.test(surowaData) || amount_gr === null)) return;

        let powod = '';
        if (!booked_on) powod = surowaData ? `Niepoprawna data „${surowaData}”` : 'Brak daty';
        else if (amount_gr === null) powod = surowaKwota ? `Niepoprawna kwota „${surowaKwota}”` : 'Brak kwoty';
        else if (amount_gr === 0) powod = 'Kwota 0 zł';
        else if (waluta && normalizuj(waluta) !== 'PLN') powod = `Inna waluta (${waluta})`;

        const t = { nr: nr + 1, booked_on, counterparty, title, amount_gr, surowaData, surowaKwota };
        if (powod) {
            wynik.push({ ...t, status: 'blad', powod });
            return;
        }

        const bazowy = kluczDuplikatuBazowy(booked_on, amount_gr, title, counterparty);
        wystapienia[bazowy] = (wystapienia[bazowy] || 0) + 1;
        const n = wystapienia[bazowy];
        const dedup_key = n === 1 ? bazowy : `${bazowy}|${n}`;

        wynik.push({
            ...t,
            account_number: rachunekKontrahenta(o.rachunki || {}, amount_gr),
            dedup_key,
            status: istniejaceKlucze.has(dedup_key) ? 'duplikat' : 'nowa'
        });
    });
    return wynik;
}

// Najnowszy miesiąc ('RRRR-MM') wśród poprawnych wierszy
function najnowszyMiesiac(wiersze) {
    return wiersze.reduce((m, w) => (w.booked_on && w.booked_on.slice(0, 7) > m ? w.booked_on.slice(0, 7) : m), '');
}

// Podpis profilu banku = znormalizowane nagłówki (ten sam układ pliku -> ten sam profil)
function podpisNaglowkow(naglowki) {
    return naglowki.map(n => normalizuj(n).trim()).join('|');
}

// =====================================================================
// STAN EKRANU
// =====================================================================

let imp = nowyStanImportu();

function nowyStanImportu() {
    return {
        etap: 'start',        // 'start' | 'mapowanie' | 'podglad' | 'zapis' | 'wynik'
        blad: '',             // komunikat na ekranie startowym
        bladZapisu: '',       // komunikat w podglądzie
        nazwaPliku: '',
        wiersze: [],          // surowe wiersze z PapaParse (tablice komórek)
        naglowekIdx: -1,      // -1 = plik bez wiersza nagłówka
        naglowki: [],
        mapa: {},
        odczyt: '',           // „UTF-16LE · separator: średnik” – podpis diagnostyczny
        bank: null,           // id rozpoznanego banku ('pekao' | 'pko' | 'alior') albo null
        profil: '',           // 'bank' | 'auto' | 'zapisany' | 'reczny'
        przygotowane: [],
        wynik: null           // { dodane, doCelow, miesiac }
    };
}

// ---- Profile banku (localStorage) -----------------------------------

function wczytajProfile() {
    try { return JSON.parse(localStorage.getItem(KLUCZ_PROFILI_BANKU)) || {}; } catch (e) { return {}; }
}

function zapiszProfil(podpis, mapa) {
    try {
        const profile = wczytajProfile();
        profile[podpis] = { mapa, zapisano: new Date().toISOString() };
        localStorage.setItem(KLUCZ_PROFILI_BANKU, JSON.stringify(profile));
    } catch (e) {}
}

// =====================================================================
// WCZYTANIE PLIKU
// =====================================================================

function obsluzPlikCSV(e) {
    wczytajPlik(e.target.files[0]);
    e.target.value = ''; // ten sam plik można wybrać ponownie
}

function pokazBladImportu(tresc) {
    imp = nowyStanImportu();
    imp.blad = tresc;
    odswiezImport();
}

async function wczytajPlik(plik) {
    if (!plik) return;
    const nazwa = plik.name || 'plik.csv';
    const rozszerzenieOk = /\.(csv|txt)$/i.test(nazwa) || /csv|text\/plain/i.test(plik.type || '');
    if (!rozszerzenieOk || plik.size === 0) return pokazBladImportu(KOMUNIKAT_NIE_CSV);

    let tekst;
    try {
        tekst = dekodujPlik(await plik.arrayBuffer());
    } catch (err) {
        return pokazBladImportu(KOMUNIKAT_NIE_CSV);
    }

    // Separator: średnik (Pekao, Alior) albo przecinek (PKO BP) – patrz parsujCSV
    const { wiersze, naglowekIdx, maksKolumn, delimiter } = parsujCSV(tekst);
    if (wiersze.length < 2 || maksKolumn < 3) return pokazBladImportu(KOMUNIKAT_NIE_CSV);

    imp = nowyStanImportu();
    imp.nazwaPliku = nazwa;
    imp.odczyt = `${ostatnieKodowanie.toUpperCase()} · separator: ${NAZWY_SEPARATOROW[delimiter] || delimiter}`;
    imp.wiersze = wiersze;
    imp.naglowekIdx = naglowekIdx;

    if (imp.naglowekIdx < 0) {
        // Brak nagłówka z datą (5.4) -> ręczny wybór kolumn
        imp.naglowki = Array.from({ length: maksKolumn }, (_, i) => `Kolumna ${i + 1}`);
        imp.mapa = {};
        imp.etap = 'mapowanie';
        return odswiezImport();
    }

    imp.naglowki = wiersze[imp.naglowekIdx].map(n => String(n || '').trim());
    const bank = rozpoznajBank(imp.naglowki);
    imp.bank = bank ? bank.id : null;

    // Kolejność: profil zapisany przez użytkownika -> czytnik banku -> ogólne mapowanie kolumn
    const zapisany = wczytajProfile()[podpisNaglowkow(imp.naglowki)];
    if (zapisany && brakujacePola(zapisany.mapa).length === 0) {
        imp.mapa = zapisany.mapa;
        imp.profil = 'zapisany';
    } else if (bank && bank.czytnik) {
        imp.profil = 'bank';
        return przygotujPodglad();
    } else {
        imp.mapa = wykryjKolumny(imp.naglowki);
        imp.profil = 'auto';
    }

    if (brakujacePola(imp.mapa).length > 0) {
        imp.etap = 'mapowanie';
        return odswiezImport();
    }
    przygotujPodglad();
}

function wierszeDanych() {
    return imp.wiersze.slice(imp.naglowekIdx + 1);
}

// Czytnik dla bieżącego pliku: profil banku albo mapa kolumn
function czytnikImportu() {
    const bank = imp.profil === 'bank' ? profilBankuPoId(imp.bank) : null;
    return bank && bank.czytnik ? bank.czytnik(imp.naglowki.map(naglowekN)) : czytnikZMapy(imp.mapa);
}

function przygotujPodglad() {
    const istniejace = new Set(stan.transakcje.map(t => t.dedup_key));
    imp.przygotowane = przygotujWiersze(wierszeDanych(), czytnikImportu(), istniejace);
    // Klasyfikacja nowych wierszy tymi samymi regułami co zapisane transakcje
    imp.przygotowane.forEach(w => {
        if (w.status === 'nowa') {
            w.klas = klasyfikuj(w);
            w.doPrzypisania = czyKlasyfikacjaDoPrzypisania(w.klas);
        }
    });
    imp.bladZapisu = '';
    imp.etap = 'podglad';
    odswiezImport();
}

// ---- Ręczny wybór kolumn ---------------------------------------------

function otworzMapowanie() {
    // Przy czytniku banku nie ma jeszcze mapy – startujemy od automatycznego rozpoznania
    if (imp.profil === 'bank' && brakujacePola(imp.mapa).length > 0) imp.mapa = wykryjKolumny(imp.naglowki);
    imp.etap = 'mapowanie';
    odswiezImport();
}

function zatwierdzMapowanie() {
    const mapa = {};
    POLA_IMPORTU.forEach(({ pole }) => {
        const el = document.getElementById(`mapa-${pole}`);
        mapa[pole] = el && el.value !== '' ? Number(el.value) : -1;
    });
    const braki = brakujacePola(mapa);
    if (braki.length > 0) {
        document.getElementById('mapa-blad').innerText = `Wybierz kolumny: ${braki.join(', ')}.`;
        return;
    }
    imp.mapa = mapa;
    imp.profil = 'reczny';
    if (imp.naglowekIdx >= 0) zapiszProfil(podpisNaglowkow(imp.naglowki), mapa);
    przygotujPodglad();
}

// ---- Zapis -----------------------------------------------------------

async function zapiszZaimportowaneTransakcje() {
    const nowe = imp.przygotowane.filter(w => w.status === 'nowa');
    if (nowe.length === 0 || imp.etap !== 'podglad') return;

    imp.etap = 'zapis';
    imp.bladZapisu = '';
    odswiezImport();

    const miesiac = najnowszyMiesiac(nowe);
    const doCelow = nowe.filter(w => w.klas && w.klas.cel).length;

    // Wpis w historii importów. Bez tabeli imports import działa dalej, tylko bez historii.
    // Kolumna bank powstaje w migracji budżetu osobistego – wysyłamy ją tylko po tej migracji.
    let importId = null;
    const resImport = await supabaseClient.from('imports').insert([{
        file_name: imp.nazwaPliku,
        rows_total: imp.przygotowane.length,
        rows_added: nowe.length,
        rows_duplicate: imp.przygotowane.filter(w => w.status === 'duplikat').length,
        rows_error: imp.przygotowane.filter(w => w.status === 'blad').length,
        newest_month: miesiac,
        ...(stan.schematBudzetow && imp.bank ? { bank: imp.bank } : {})
    }]).select('id').single();
    if (!resImport.error && resImport.data) importId = resImport.data.id;

    const rekordy = nowe.map(w => ({
        booked_on: w.booked_on,
        counterparty: w.counterparty,
        title: w.title,
        account_number: w.account_number,
        amount_gr: w.amount_gr,
        dedup_key: w.dedup_key,
        ...(importId ? { import_id: importId } : {})
    }));

    // Jedno zapytanie = jedna transakcja w bazie: zapisują się wszystkie wiersze albo żaden (5.3)
    const { error } = await supabaseClient.from('transakcje').insert(rekordy);
    if (error) {
        if (importId) await supabaseClient.from('imports').delete().eq('id', importId);
        imp.etap = 'podglad';
        imp.bladZapisu = komunikatBledu(error, 'Nie zapisano żadnej transakcji');
        odswiezImport();
        return;
    }

    imp.wynik = { dodane: nowe.length, doCelow, miesiac };
    imp.etap = 'wynik';
    await pobierzDane(); // odświeża też historię importów i ekran
    pokazKomunikat(`Zapisano ${nowe.length} ${odmiana(nowe.length, 'transakcję', 'transakcje', 'transakcji')}, ${doCelow} trafiło do celów`);
}

function resetujImport() {
    imp = nowyStanImportu();
    odswiezImport();
}

// Wejście na zakładkę po zakończonym imporcie zaczyna od nowa
function przygotujEkranImportu() {
    if (imp.etap === 'wynik') imp = nowyStanImportu();
}

function pokazMiesiacNaPulpicie(miesiac) {
    stan.miesiacWybrany = miesiac;
    if (stan.trybFiltraPulpit !== 'miesiac') zmienTrybFiltraPulpit('miesiac');
    zmienZakladke('pulpit');
}

// =====================================================================
// RYSOWANIE
// =====================================================================

function odswiezImport() {
    const etap = imp.etap === 'zapis' ? 'podglad' : imp.etap;
    const widoczne = {
        'import-start': etap === 'start',
        'import-mapowanie': etap === 'mapowanie',
        'import-podglad': etap === 'podglad',
        'import-wynik': etap === 'wynik',
        'import-historia': etap === 'start' || etap === 'wynik'
    };
    Object.entries(widoczne).forEach(([id, pokaz]) => document.getElementById(id).classList.toggle('hidden', !pokaz));

    const blad = document.getElementById('import-blad');
    blad.innerText = imp.blad;
    blad.classList.toggle('hidden', !imp.blad);

    // Do którego budżetu trafi import – widoczne od pierwszego ekranu
    const cel = document.getElementById('import-budzet');
    if (cel) cel.innerText = `Transakcje trafią do: ${nazwaBudzetu().toLowerCase()}`;
    if (etap === 'start') rysujInstrukcjeEksportu();

    if (etap === 'mapowanie') rysujMapowanie();
    if (etap === 'podglad') rysujPodglad();
    if (etap === 'wynik') rysujWynik();
    if (widoczne['import-historia']) rysujHistorieImportow();
}

function rysujInstrukcjeEksportu() {
    const lista = document.getElementById('import-banki');
    if (!lista || lista.childElementCount) return; // treść stała – rysujemy raz
    lista.innerHTML = INSTRUKCJE_EKSPORTU.map(({ bank, droga }) => `
        <li class="flex flex-col min-[480px]:flex-row min-[480px]:justify-between gap-0.5 py-1.5">
            <span class="font-semibold">${esc(bank)}</span>
            <span class="text-[var(--muted)]">${esc(droga)}</span>
        </li>`).join('');
}

function rysujMapowanie() {
    const probki = wierszeDanych().filter(w => w.some(k => String(k || '').trim())).slice(0, 3);
    const opcje = wybrany => `<option value="">— brak —</option>` + imp.naglowki.map((n, i) =>
        `<option value="${i}" ${wybrany === i ? 'selected' : ''}>${esc(n || `Kolumna ${i + 1}`)}</option>`).join('');

    document.getElementById('import-mapowanie').innerHTML = `
        <div>
            <h2 class="font-semibold text-sm">Wybierz kolumny: <span class="text-[var(--accent)]">${esc(imp.nazwaPliku)}</span></h2>
            <p class="text-xs text-[var(--muted)] mt-1">${imp.naglowekIdx < 0
                ? 'Nie znaleziono wiersza nagłówka z datą. Wskaż, w której kolumnie są dane.'
                : 'Nie udało się rozpoznać wszystkich kolumn. Wybór zapamiętamy jako profil banku dla plików o tym układzie.'}</p>
            <p class="text-[10px] text-[var(--muted)] mt-0.5">Odczyt pliku: ${esc(imp.odczyt)}</p>
        </div>
        <div class="grid gap-2 min-[900px]:grid-cols-2 text-xs">
            ${POLA_IMPORTU.map(({ pole, etykieta, wymagane }) => `
                <div>
                    <label for="mapa-${pole}" class="field-label">${esc(etykieta)}${wymagane ? ' *' : ''}</label>
                    <select id="mapa-${pole}" class="input">${opcje(imp.mapa[pole] >= 0 ? imp.mapa[pole] : null)}</select>
                </div>`).join('')}
        </div>
        <p class="text-[10px] text-[var(--muted)]">* wymagane; potrzebny jest też tytuł lub kontrahent. Rachunki pozwalają rozpoznać wpłaty na cele.</p>
        <div>
            <h3 class="text-xs font-semibold mb-1">Podgląd pierwszych wierszy</h3>
            <div class="overflow-x-auto">
                <table class="text-[11px] whitespace-nowrap">
                    <thead class="text-[var(--muted)]"><tr>${imp.naglowki.map(n => `<th class="text-left font-semibold pr-3 pb-1">${esc(n)}</th>`).join('')}</tr></thead>
                    <tbody>${probki.map(w => `<tr class="border-t border-[var(--border)]">${imp.naglowki.map((_, i) =>
                        `<td class="pr-3 py-1 max-w-[12rem] truncate">${esc(w[i] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody>
                </table>
            </div>
        </div>
        <p id="mapa-blad" role="alert" class="text-xs text-[var(--c-spend)]"></p>
        <div class="flex items-center gap-4">
            <button type="button" onclick="zatwierdzMapowanie()" class="btn-primary !w-auto px-6">Dalej</button>
            <button type="button" onclick="resetujImport()" class="text-xs text-[var(--muted)] underline">Anuluj</button>
        </div>`;
}

// Opis wiersza w podglądzie: przychód, cel, kategoria z reguły albo „do przypisania”
function opisWierszaImportu(w) {
    if (w.status === 'duplikat') return { tekst: 'już zapisana, pominięta', klasa: 'text-[var(--muted)]' };
    if (w.status === 'blad') return { tekst: w.powod, klasa: 'text-[var(--c-spend)]' };
    const k = w.klas;
    if (k.typ === 'przychod') return { tekst: 'przychód', klasa: 'text-[var(--c-income)]' };
    if (k.typ === 'wplata') return { tekst: `cel: ${k.cel.name}`, klasa: 'text-[var(--c-save)]' };
    if (k.typ === 'wyplata') return k.cel
        ? { tekst: `wypłata z celu: ${k.cel.name}`, klasa: 'text-[var(--c-save)]' }
        : { tekst: 'wypłata z celu – do przypisania', klasa: 'text-amber-600' };
    if (k.kategoria) return { tekst: k.kategoria, klasa: 'text-[var(--fg)]' };
    return { tekst: 'do przypisania', klasa: 'text-amber-600' };
}

function opisProfilu() {
    const bank = profilBankuPoId(imp.bank);
    if (imp.profil === 'bank') return `Rozpoznano wyciąg: ${bank ? bank.nazwa : 'bank'}`;
    if (imp.profil === 'auto') return bank ? `Rozpoznano wyciąg: ${bank.nazwa}` : 'Rozpoznano kolumny automatycznie';
    if (imp.profil === 'zapisany') return 'Użyto zapisanego profilu banku';
    if (imp.profil === 'reczny') return 'Kolumny wybrane ręcznie – zapisano jako profil banku';
    return '';
}

function rysujPodglad() {
    const p = imp.przygotowane;
    const nowe = p.filter(w => w.status === 'nowa');
    const duplikaty = p.filter(w => w.status === 'duplikat').length;
    const bledne = p.filter(w => w.status === 'blad').length;
    const doCelow = nowe.filter(w => w.klas.cel).length;
    const bezKategorii = nowe.filter(w => w.doPrzypisania).length;
    const zapisywanie = imp.etap === 'zapis';

    let info = '';
    if (nowe.length === 0 && duplikaty > 0 && bledne === 0) info = 'Wszystkie transakcje z tego pliku są już zapisane.';
    else if (nowe.length === 0) info = 'W pliku nie ma nowych, poprawnych transakcji.';

    const kafelek = (liczba, podpis, klasa) =>
        `<div class="card !p-2"><span class="block font-bold text-base kwota ${klasa}">${liczba}</span>${podpis}</div>`;

    const lista = p.map(w => {
        const opis = opisWierszaImportu(w);
        const wyszarzony = w.status !== 'nowa';
        const kwota = w.amount_gr != null && w.status !== 'blad'
            ? zlZeZnakiem(w.amount_gr)
            : esc(w.surowaKwota || '—');
        return `
        <div class="card !p-2.5 flex justify-between items-center gap-2 text-xs ${wyszarzony ? 'opacity-55' : ''}">
            <div class="min-w-0">
                <p class="font-semibold truncate">${esc(w.counterparty || w.title || `Wiersz ${w.nr}`)}</p>
                <span class="text-[10px] text-[var(--muted)]">${esc(w.booked_on || w.surowaData || '')} · </span><span class="text-[10px] ${opis.klasa}">${esc(opis.tekst)}</span>
            </div>
            <span class="font-bold kwota whitespace-nowrap ${w.amount_gr < 0 ? 'text-[var(--c-spend)]' : 'text-[var(--c-income)]'}">${kwota}</span>
        </div>`;
    }).join('');

    document.getElementById('import-podglad').innerHTML = `
        <div class="flex justify-between items-start gap-3">
            <div class="min-w-0">
                <h2 class="font-semibold text-sm truncate">Podgląd: <span class="text-[var(--accent)]">${esc(imp.nazwaPliku)}</span></h2>
                <p class="text-[11px] text-[var(--muted)]">${esc(opisProfilu())} · ${esc(nazwaBudzetu())} · ${esc(imp.odczyt)} ·
                    <button type="button" onclick="otworzMapowanie()" class="underline">zmień kolumny</button></p>
            </div>
        </div>
        <div class="grid grid-cols-3 gap-2 text-center text-xs min-[900px]:max-w-xl">
            ${kafelek(nowe.length, 'nowe', 'text-[var(--c-income)]')}
            ${kafelek(doCelow, 'do celów', 'text-[var(--c-save)]')}
            ${kafelek(bezKategorii, 'bez kategorii', bezKategorii ? 'text-amber-600' : 'text-[var(--muted)]')}
        </div>
        <p class="text-[11px] text-[var(--muted)]">Wierszy w pliku: ${p.length} · już zapisane: ${duplikaty} · błędne: ${bledne}${bledne ? ' (nie zostaną zapisane)' : ''}</p>
        ${info ? `<p class="card !p-3 text-xs font-semibold" role="status">${esc(info)}</p>` : ''}
        <div class="card-grid scroll-box text-xs pr-1">${lista}</div>
        ${imp.bladZapisu ? `<p role="alert" class="text-xs text-[var(--c-spend)] card !p-3 border border-current">${esc(imp.bladZapisu)}</p>` : ''}
        <div class="flex items-center gap-4 flex-wrap">
            <button type="button" id="btn-zapisz-import" onclick="zapiszZaimportowaneTransakcje()" class="btn-primary min-[900px]:max-w-sm"
                ${nowe.length === 0 || zapisywanie ? 'disabled' : ''}>
                ${zapisywanie ? 'Zapisywanie…' : `Zapisz ${nowe.length} ${odmiana(nowe.length, 'transakcję', 'transakcje', 'transakcji')}`}
            </button>
            <button type="button" onclick="resetujImport()" class="text-xs text-[var(--muted)] underline" ${zapisywanie ? 'disabled' : ''}>Anuluj</button>
        </div>`;
}

function rysujWynik() {
    const w = imp.wynik;
    const nazwa = w.miesiac ? nazwaMiesiaca(w.miesiac).toLowerCase() : '';
    const nazwaKrotka = w.miesiac ? MIESIACE_PELNE[Number(w.miesiac.slice(5, 7)) - 1].toLowerCase() : '';
    document.getElementById('import-wynik').innerHTML = `
        <div class="card space-y-3 text-center py-6">
            <div class="w-12 h-12 rounded-full mx-auto flex items-center justify-center bg-[var(--accent)] text-[var(--on-accent)] text-xl" aria-hidden="true">✓</div>
            <h2 class="font-bold">Wyciąg za ${esc(nazwa)} zapisany</h2>
            <p class="text-xs text-[var(--muted)]">Dodano ${w.dodane} ${odmiana(w.dodane, 'transakcję', 'transakcje', 'transakcji')} do budżetu: ${esc(nazwaBudzetu().toLowerCase())}, ${w.doCelow} trafiło do celów.</p>
            <div class="flex flex-col min-[480px]:flex-row gap-2 justify-center pt-1">
                <button type="button" onclick="pokazMiesiacNaPulpicie('${esc(w.miesiac)}')" class="btn-primary min-[480px]:!w-auto px-5">Pokaż ${esc(nazwaKrotka)} na pulpicie</button>
                <button type="button" onclick="zmienZakladke('cele')" class="btn-secondary">Zobacz cele</button>
            </div>
            <button type="button" onclick="resetujImport()" class="text-xs text-[var(--muted)] underline">Importuj kolejny plik</button>
        </div>`;
}

function rysujHistorieImportow() {
    const kontener = document.getElementById('import-historia');
    if (!stan.importy || stan.importy.length === 0) {
        kontener.innerHTML = stan.importy === null
            ? `<p class="text-[10px] text-[var(--muted)]">Historia importów pojawi się po uruchomieniu w Supabase skryptu ${esc(PLIK_MIGRACJI)}.</p>`
            : '';
        return;
    }
    const data = iso => {
        const d = new Date(iso);
        return isNaN(d) ? '' : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };
    kontener.innerHTML = `
        <article class="card space-y-2">
            <h2 class="font-semibold text-sm">Ostatnie importy</h2>
            <ul class="text-xs divide-y divide-[var(--border)]">
                ${stan.importy.slice(0, 5).map(i => {
                    const bank = profilBankuPoId(i.bank);
                    return `
                    <li class="py-1.5 flex justify-between gap-3">
                        <span class="min-w-0">
                            <span class="block font-semibold truncate">${esc(i.file_name || 'plik CSV')}</span>
                            <span class="text-[10px] text-[var(--muted)]">${bank ? `${esc(bank.nazwa)} · ` : ''}${esc(data(i.imported_at))}${i.newest_month ? ` · ${esc(nazwaMiesiaca(i.newest_month))}` : ''}</span>
                        </span>
                        <span class="text-right text-[10px] text-[var(--muted)] whitespace-nowrap kwota">
                            <span class="block text-[var(--c-income)] font-semibold">+${i.rows_added ?? 0} nowych</span>
                            ${i.rows_duplicate ?? 0} dupl.${i.rows_error ? ` · ${i.rows_error} błędnych` : ''}
                        </span>
                    </li>`;
                }).join('')}
            </ul>
        </article>`;
}

// ---- Przeciągnięcie pliku (komputer) ---------------------------------

(function obslugaPrzeciagania() {
    const strefa = () => document.getElementById('import-strefa');
    ['dragover', 'drop'].forEach(typ => window.addEventListener(typ, e => e.preventDefault())); // przeglądarka nie otwiera pliku
    document.addEventListener('dragover', e => {
        const s = strefa();
        if (s && s.contains(e.target)) s.classList.add('!border-[var(--accent)]');
    });
    document.addEventListener('dragleave', e => {
        const s = strefa();
        if (s && !s.contains(e.relatedTarget)) s.classList.remove('!border-[var(--accent)]');
    });
    document.addEventListener('drop', e => {
        const s = strefa();
        if (!s) return;
        s.classList.remove('!border-[var(--accent)]');
        if (stan.zakladka === 'import' && e.dataTransfer && e.dataTransfer.files.length) {
            wczytajPlik(e.dataTransfer.files[0]);
        }
    });
})();
