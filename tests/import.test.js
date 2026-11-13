// Import CSV (specyfikacja 5 i testy akceptacyjne 11.2)
const test = require('node:test');
const assert = require('node:assert/strict');
const { zaladuj, ustawStan } = require('./zaladuj');

const ctx = zaladuj();

test('kwota: „-1 234,56” zapisuje się jako −123456 groszy (11.2)', () => {
    assert.equal(ctx.parsujKwote('-1 234,56'), -123456);
    assert.equal(ctx.parsujKwote('-1 234,56'), -123456);      // twarda spacja
    assert.equal(ctx.parsujKwote('-1 234,56 PLN'), -123456);  // wąska spacja + PLN
    assert.equal(ctx.parsujKwote('− 25,00'), -2500);          // typograficzny minus
    assert.equal(ctx.parsujKwote('+1500.00'), 150000);
    assert.equal(ctx.parsujKwote('1.234,56'), 123456);
    assert.equal(ctx.parsujKwote('-44,2'), -4420);
    assert.equal(ctx.parsujKwote('abc'), null);
    assert.equal(ctx.parsujKwote(''), null);
});

test('data: DD.MM.RRRR, DD-MM-RRRR, RRRR-MM-DD; błędna -> null', () => {
    assert.equal(ctx.parsujDate('05.10.2026'), '2026-10-05');
    assert.equal(ctx.parsujDate('5-1-2026'), '2026-01-05');
    assert.equal(ctx.parsujDate('2026-10-30'), '2026-10-30');
    assert.equal(ctx.parsujDate('2026-10-30T12:00:00'), '2026-10-30');
    assert.equal(ctx.parsujDate('31.02.2026'), null);
    assert.equal(ctx.parsujDate('Saldo końcowe'), null);
});

// 30 transakcji Pekao, w tym dwa identyczne bilety tego samego dnia (4.5: dopisek |2)
function plikPekao() {
    const wiersze = ['Data księgowania;Data waluty;Nadawca / Odbiorca;Adres;Rachunek źródłowy;Rachunek docelowy;Tytułem;Kwota operacji;Waluta'];
    for (let i = 1; i <= 28; i++) {
        const dzien = String(i).padStart(2, '0');
        wiersze.push(`${dzien}.10.2026;${dzien}.10.2026;SKLEP ${i};;;;Zakup ${i};-${i},50;PLN`);
    }
    wiersze.push('29.10.2026;29.10.2026;MPK KRAKOW;;;;Bilet;-4,40;PLN');
    wiersze.push('29.10.2026;29.10.2026;MPK KRAKOW;;;;Bilet;-4,40;PLN');
    wiersze.push('Saldo końcowe;;;;;;;;');
    return wiersze.join('\n');
}

function przygotuj(tekst, istniejace = new Set()) {
    const { wiersze, naglowekIdx } = ctx.parsujCSV(tekst);
    const naglowki = wiersze[naglowekIdx];
    const mapa = ctx.wykryjKolumny(naglowki);
    return ctx.przygotujWiersze(wiersze.slice(naglowekIdx + 1), ctx.czytnikZMapy(mapa), istniejace);
}

test('import 30 transakcji dodaje 30, ponowny import 0 (11.2)', () => {
    ustawStan(ctx, {});
    const pierwszy = przygotuj(plikPekao());
    assert.equal(pierwszy.length, 30);
    assert.equal(pierwszy.filter(w => w.status === 'nowa').length, 30);

    const bilety = pierwszy.filter(w => w.counterparty === 'MPK KRAKOW').map(w => w.dedup_key);
    assert.equal(bilety.length, 2);
    assert.equal(bilety[1], `${bilety[0]}|2`);

    const zapisane = new Set(pierwszy.map(w => w.dedup_key));
    const drugi = przygotuj(plikPekao(), zapisane);
    assert.equal(drugi.filter(w => w.status === 'nowa').length, 0);
    assert.equal(drugi.filter(w => w.status === 'duplikat').length, 30);
});

test('wiersz w innej walucie jest błędny, stopka pliku jest pomijana', () => {
    const tekst = 'Data księgowania;Nadawca / Odbiorca;Tytułem;Kwota operacji;Waluta\n' +
        '01.10.2026;HOTEL;Nocleg;-100,00;EUR\n02.10.2026;ZABKA;Zakupy;-10,00;PLN\nRazem:;;;-110,00;';
    const w = przygotuj(tekst);
    assert.equal(w.length, 2);
    assert.equal(w[0].status, 'blad');
    assert.match(w[0].powod, /Inna waluta/);
    assert.equal(w[1].status, 'nowa');
});

test('plik w Windows-1250 pokazuje polskie znaki (11.2)', () => {
    // „Żabka;Łódź” w Windows-1250
    const bajty = Uint8Array.from([0xAF, 0x61, 0x62, 0x6B, 0x61, 0x3B, 0xA3, 0xF3, 0x64, 0x9F]);
    assert.equal(ctx.dekodujPlik(bajty.buffer), 'Żabka;Łódź');
    assert.equal(ctx.wartosc('ostatnieKodowanie'), 'windows-1250');
});

test('plik UTF-8 z BOM i UTF-16 LE z BOM', () => {
    const utf8 = new TextEncoder().encode('﻿Data;Kwota');
    assert.equal(ctx.dekodujPlik(utf8.buffer), 'Data;Kwota');
    const utf16 = Uint8Array.from([0xFF, 0xFE, 0x44, 0x00, 0x61, 0x00]);
    assert.equal(ctx.dekodujPlik(utf16.buffer), 'Da');
});

test('separator: średnik wygrywa z przecinkiem w kwotach (Alior)', () => {
    const tekst = 'Data transakcji;Data księgowania;Nazwa nadawcy;Nazwa odbiorcy;Szczegóły transakcji;Kwota operacji;Waluta operacji\n' +
        '01.10.2026;01.10.2026;;BIEDRONKA;Zakup;-45,99;PLN';
    const { delimiter, naglowekIdx } = ctx.parsujCSV(tekst);
    assert.equal(delimiter, ';');
    assert.equal(naglowekIdx, 0);
});

test('rozpoznanie banku i czytnik Alior: płatność kartą -> sprzedawca z opisu', () => {
    const naglowki = ['Data transakcji', 'Data księgowania', 'Nazwa nadawcy', 'Nazwa odbiorcy', 'Szczegóły transakcji',
        'Kwota operacji', 'Waluta operacji', 'Kwota w walucie rachunku', 'Waluta rachunku',
        'Numer rachunku nadawcy', 'Numer rachunku odbiorcy'];
    const bank = ctx.rozpoznajBank(naglowki);
    assert.equal(bank.id, 'alior');
    const czytaj = bank.czytnik(naglowki.map(ctx.naglowekN));
    const o = czytaj(['01.10.2026', '02.10.2026', '', '', 'Spotify P4898D70C7 Stockholm SE', '-23,99', 'PLN', '-23,99', 'PLN', '', '']);
    assert.equal(o.kontrahent, 'Spotify');
    assert.equal(o.data, '02.10.2026');
});

test('Pekao: kolumny rozpoznane ogólnym mapowaniem', () => {
    const mapa = ctx.wykryjKolumny(['Data księgowania', 'Data waluty', 'Nadawca / Odbiorca', 'Adres nadawcy / odbiorcy',
        'Rachunek źródłowy', 'Rachunek docelowy', 'Tytułem', 'Kwota operacji', 'Waluta']);
    assert.deepEqual({ ...mapa }, {
        data: 0, kwota: 7, kontrahent: 2, tytul: 6, waluta: 8, rachZrodlowy: 4, rachDocelowy: 5, rachInny: -1
    });
    assert.equal(ctx.brakujacePola(mapa).length, 0);
});

test('rachunek drugiej strony: wpływ -> źródłowy, wypływ -> docelowy', () => {
    const r = { zrodlowy: '11 1111', docelowy: '22 2222' };
    assert.equal(ctx.rachunekKontrahenta(r, 100), '111111');
    assert.equal(ctx.rachunekKontrahenta(r, -100), '222222');
});
