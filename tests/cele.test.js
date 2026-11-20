// Cele: progi oprocentowania, operacje ręczne, walidacja formularzy (migracja 2026-11h)
const test = require('node:test');
const assert = require('node:assert/strict');
const { zaladuj, ustawStan } = require('./zaladuj');

const ctx = zaladuj(['js/zdarzenia.js', 'js/config.js', 'js/utils.js', 'js/state.js', 'js/rules.js', 'js/calc.js',
    'js/views/cele.js', 'js/views/statystyki.js', 'js/views/historia.js']);
const zwykly = x => JSON.parse(JSON.stringify(x)); // obiekty z kontekstu vm -> zwykłe (deepEqual)

const SUBKONTO = '11112222333344445555666677';

test('progi „każda część salda osobno”: stopa każdego przedziału liczona od jego części', () => {
    const opr = { tryb: 'nadwyzka', progi: [{ od: 100000, stopa: 2 }, { od: 500000, stopa: 5 }] };
    assert.equal(ctx.odsetkiRoczneOdSalda(50000, opr), 0);                 // poniżej pierwszego progu
    assert.equal(ctx.odsetkiRoczneOdSalda(300000, opr), 200000 * 0.02);    // 1000–3000 zł po 2%
    assert.equal(ctx.odsetkiRoczneOdSalda(1000000, opr), 400000 * 0.02 + 500000 * 0.05);
    assert.equal(ctx.odsetkiRoczneOdSalda(-100, opr), 0);
});

test('progi „całe saldo według progu”: cała kwota ma stopę najwyższego osiągniętego progu', () => {
    const opr = { tryb: 'calosc', progi: [{ od: 0, stopa: 1 }, { od: 500000, stopa: 3 }] };
    assert.equal(ctx.odsetkiRoczneOdSalda(499999, opr), 499999 * 0.01);
    assert.equal(ctx.odsetkiRoczneOdSalda(500000, opr), 500000 * 0.03);
    assert.equal(+ctx.stopaEfektywna(500000, opr).toFixed(6), 3);
});

test('zgodność wstecz: stare pola = jeden próg; wynik jak dawniej', () => {
    assert.deepEqual(zwykly(ctx.progiOdsetek({ interest_rate: 0.5, interest_threshold_gr: 100000 })),
        { tryb: 'nadwyzka', progi: [{ od: 100000, stopa: 0.5 }], promocja: null });
    assert.deepEqual(zwykly(ctx.progiOdsetek({})), { tryb: 'nadwyzka', progi: [{ od: 100000, stopa: 0.5 }], promocja: null }); // domyślne z config.js
    const stary = ctx.odsetkiSubkonta({ saldoPoczatkowe: 300000, od: '2026-01-01', doDnia: '2026-06-30', stopa: 3.65, prog: 100000 });
    const nowy = ctx.odsetkiSubkonta({ saldoPoczatkowe: 300000, od: '2026-01-01', doDnia: '2026-06-30',
        oprocentowanie: ctx.progiOdsetek({ interest_tiers: { mode: 'marginal', tiers: [{ from_gr: 100000, rate: 3.65 }] } }) });
    assert.deepEqual(zwykly(nowy), zwykly(stary));
    assert.ok(stary.netto > 0);
});

test('interest_tiers: sortowanie, najwyżej 3 progi, tryb whole', () => {
    const p = ctx.progiOdsetek({ interest_tiers: { mode: 'whole', tiers: [
        { from_gr: 500000, rate: 3 }, { from_gr: 0, rate: 1 }, { from_gr: 900000, rate: 4 }, { from_gr: 2000000, rate: 9 }] } });
    assert.equal(p.tryb, 'calosc');
    assert.deepEqual(zwykly(p.progi.map(x => x.od)), [0, 500000, 900000]);
});

test('operacje ręczne: saldo celu, miesiące, niepoprawne wpisy pominięte', () => {
    ustawStan(ctx, {
        transakcje: [{ id: 1, booked_on: '2026-10-04', amount_gr: -30000, account_number: SUBKONTO }],
        cele: [{ id: 'c1', name: 'Wakacje', keyword: SUBKONTO, target_gr: 1000000, interest_rate: 0, manual_operations: [
            { id: 'a', date: '2026-09-10', amount_gr: 50000, note: 'z innego banku' },
            { id: 'b', date: '2026-10-20', amount_gr: -20000 },
            { id: 'zla-data', date: '10.10.2026', amount_gr: 100 },
            { id: 'zero', date: '2026-10-01', amount_gr: 0 }
        ] }],
        kategorie: ctx.kategorieDomyslne('wspolny')
    });
    assert.equal(ctx.saldaCelow().c1, 30000 + 50000 - 20000);
    assert.deepEqual(zwykly(ctx.operacjeReczneMiesiecznie()), { '2026-09': 50000, '2026-10': -20000 });
    const ops = ctx.operacjeCelow().c1;
    assert.equal(ops.length, 3);
    assert.equal(ops.filter(o => o.reczna).length, 2);
    // Średnia wpłat (8.1) liczy też wpłaty ręczne w oknie 6 miesięcy
    const a = ctx.analizaCelu(ctx.wartosc('stan').cele[0], ops, '2026-10');
    assert.equal(a.wplaty, 80000);
    assert.equal(a.wyplaty, 20000);
    assert.equal(a.srednia, 80000 / 6);
    // Pulpit („Odłożone”) liczy tylko wyciąg – operacje ręczne go nie zmieniają
    assert.equal(ctx.podsumuj(ctx.wartosc('stan').transakcje).netto, 30000);
});

test('cel prowadzony tylko ręcznie dostaje odsetki od pierwszej operacji', () => {
    ustawStan(ctx, {
        transakcje: [],
        cele: [{ id: 'r', name: 'Gotówka', keyword: null, target_gr: 100000,
            interest_tiers: { mode: 'marginal', tiers: [{ from_gr: 0, rate: 3.65 }] },
            manual_operations: [{ id: 'a', date: '2026-09-10', amount_gr: 50000 }] }]
    });
    const cel = ctx.wartosc('stan').cele[0];
    const o = ctx.odsetkiCelu(cel, ctx.operacjeCelow().r, new Date(2026, 10, 20));
    // 500 zł × 3,65% / 365 = 5 gr dziennie, 21 dni września
    assert.equal(o.kapitalizacje[0].data, '2026-09-30');
    assert.equal(o.kapitalizacje[0].brutto, 105);
});

test('formularz: sprawdzProgiOdsetek', () => {
    const ok = ctx.sprawdzProgiOdsetek([{ od: '50 000', stopa: '1' }, { od: '', stopa: '5,5' }], 'nadwyzka');
    assert.deepEqual(zwykly(ok.oprocentowanie), { tryb: 'nadwyzka', progi: [{ od: 0, stopa: 5.5 }, { od: 5000000, stopa: 1 }] });
    assert.match(ctx.sprawdzProgiOdsetek([{ od: '100', stopa: '1' }, { od: '100,00', stopa: '2' }]).blad, /tej samej kwoty/);
    assert.match(ctx.sprawdzProgiOdsetek([{ od: '0', stopa: '' }]).blad, /oprocentowanie/);
    assert.match(ctx.sprawdzProgiOdsetek([{ od: 'abc', stopa: '1' }]).blad, /w złotych/);
    assert.match(ctx.sprawdzProgiOdsetek([{ od: '0', stopa: '25' }]).blad, /od 0 do 20%/);
    assert.match(ctx.sprawdzProgiOdsetek([1, 2, 3, 4].map(i => ({ od: String(i), stopa: '1' }))).blad, /najwyżej 3/);
    assert.match(ctx.sprawdzProgiOdsetek([]).blad, /co najmniej jeden/);
    assert.equal(ctx.sprawdzProgiOdsetek([{ od: '0', stopa: '1' }], 'calosc').oprocentowanie.tryb, 'calosc');
});

test('formularz: zapis progów do bazy z polami zgodności wstecz', () => {
    const z = ctx.oprocentowanieDoZapisu({ tryb: 'nadwyzka', progi: [{ od: 0, stopa: 0 }, { od: 100000, stopa: 0.5 }, { od: 5000000, stopa: 1 }] });
    assert.deepEqual(zwykly(z), {
        interest_tiers: { mode: 'marginal', tiers: [{ from_gr: 0, rate: 0 }, { from_gr: 100000, rate: 0.5 }, { from_gr: 5000000, rate: 1 }] },
        interest_rate: 0.5, interest_threshold_gr: 100000
    });
    assert.equal(ctx.oprocentowanieDoZapisu({ tryb: 'calosc', progi: [{ od: 0, stopa: 0 }] }).interest_rate, 0);
});

test('formularz: sprawdzOperacjeReczna', () => {
    const dzis = '2026-11-20';
    assert.deepEqual(zwykly(ctx.sprawdzOperacjeReczna({ wyplata: false, kwota: '1 200,50', data: '2026-11-01', opis: '  gotówka ' }, dzis)),
        { operacja: { date: '2026-11-01', amount_gr: 120050, note: 'gotówka' } });
    assert.equal(ctx.sprawdzOperacjeReczna({ wyplata: true, kwota: '300', data: dzis, opis: '' }, dzis).operacja.amount_gr, -30000);
    assert.match(ctx.sprawdzOperacjeReczna({ kwota: '0', data: dzis }, dzis).blad, /większą od 0/);
    assert.match(ctx.sprawdzOperacjeReczna({ kwota: '12,345', data: dzis }, dzis).blad, /większą od 0/);
    assert.match(ctx.sprawdzOperacjeReczna({ kwota: '10', data: '2026-11-21' }, dzis).blad, /przyszłości/);
    assert.match(ctx.sprawdzOperacjeReczna({ kwota: '10', data: '' }, dzis).blad, /datę/);
    assert.equal(ctx.sprawdzOperacjeReczna({ kwota: '10', data: dzis, opis: 'x'.repeat(200) }, dzis).operacja.note.length, 80);
});

test('opisy oprocentowania na ekranie celu', () => {
    assert.equal(ctx.opisProgow({ tryb: 'nadwyzka', progi: [{ od: 100000, stopa: 0.5 }] }).replace(/\s/g, ' '),
        '0,5% rocznie od nadwyżki ponad 1 000 zł');
    assert.equal(ctx.opisProgow({ tryb: 'nadwyzka', progi: [{ od: 0, stopa: 0 }] }), 'bez oprocentowania');
    assert.equal(ctx.opisProgow({ tryb: 'nadwyzka', progi: [{ od: 0, stopa: 5 }, { od: 5000000, stopa: 1 }] }).replace(/\s/g, ' '),
        'do 50 000 zł: 5% · od 50 000 zł: 1% (każda część salda osobno)');
    assert.equal(ctx.opisProgow({ tryb: 'calosc', progi: [{ od: 100000, stopa: 1 }, { od: 500000, stopa: 2 }] }).replace(/\s/g, ' '),
        'do 1 000 zł: 0% · 1 000 zł–5 000 zł: 1% · od 5 000 zł: 2% (całe saldo według progu)');
});

test('Statystyki: saldo subkont od końca uwzględnia operacje ręczne i odsetki', () => {
    const w = [{ klucz: '2026-08', netto: 10000 }, { klucz: '2026-09', netto: 20000 }, { klucz: '2026-10', netto: 30000 }];
    // dziś 200 000 gr; w listopadzie (po ostatnim miesiącu wierszy) operacja ręczna +5 000 i odsetki 100
    const salda = ctx.saldaSubkontOdKonca(w, 200000, { '2026-10': 50, '2026-11': 100 }, { '2026-09': 40000, '2026-11': 5000 });
    assert.deepEqual(zwykly(salda), [
        200000 - 100 - 5000 - 30000 - 50 - 20000 - 40000,
        200000 - 100 - 5000 - 30000 - 50,
        200000 - 100 - 5000
    ]);
});

test('historia: pola celu z migracji 2026-11h', () => {
    const o = ctx.opisZmiany({ tabela: 'goals', operacja: 'UPDATE', zmiany: {
        manual_operations: [[], [{ id: 'a' }, { id: 'b' }]],
        interest_tiers: [null, { mode: 'marginal', tiers: [{}, {}] }],
        keywords_out: ['a', 'b'] } });
    assert.deepEqual([...o.szczegoly], ['operacje ręczne: 0 operacji → 2 operacje', 'progi oprocentowania: — → 2 progi', 'słowa wypłat: a → b']);
});

test('promocja: okres (miesiące z przycięciem dnia), stopa do limitu, nadwyżka według progów', () => {
    assert.equal(ctx.dodajMiesiace('2026-11-30', 3), '2027-02-28');
    assert.equal(ctx.dodajMiesiace('2026-01-31', 1), '2026-02-28');
    assert.equal(ctx.dodajMiesiace('2026-11-01', 3), '2027-02-01');
    const opr = ctx.progiOdsetek({ interest_tiers: { mode: 'marginal', tiers: [{ from_gr: 0, rate: 1 }, { from_gr: 1000000, rate: 2 }],
        promo: { rate: 7, from: '2026-11-01', months: 3, max_gr: 500000 } } });
    assert.deepEqual(zwykly(opr.promocja), { stopa: 7, od: '2026-11-01', miesiace: 3, do: '2027-02-01', limit: 500000 });
    // poza promocją: progi
    assert.equal(ctx.odsetkiRoczneOdSalda(1500000, opr, '2027-02-01'), 20000);
    // w promocji: 5 000 zł po 7%, 5 000–10 000 zł po 1%, ponad 10 000 zł po 2%
    assert.equal(+ctx.odsetkiRoczneOdSalda(1500000, opr, '2027-01-31').toFixed(6), 500000 * 0.07 + 500000 * 0.01 + 500000 * 0.02);
    assert.equal(Math.round(ctx.odsetkiRoczneOdSalda(300000, opr, '2026-11-15')), 21000);
    // tryb „całe saldo”: nadwyżka ponad limit ma stopę progu, do którego sięga całe saldo
    const calosc = ctx.progiOdsetek({ interest_tiers: { mode: 'whole', tiers: [{ from_gr: 0, rate: 1 }, { from_gr: 1000000, rate: 2 }],
        promo: { rate: 7, from: '2026-11-01', months: 3, max_gr: 500000 } } });
    assert.equal(+ctx.odsetkiRoczneOdSalda(1500000, calosc, '2026-12-01').toFixed(6), 500000 * 0.07 + 1000000 * 0.02);
    // niepoprawna promocja jest pomijana
    assert.equal(ctx.progiOdsetek({ interest_tiers: { tiers: [{ from_gr: 0, rate: 1 }], promo: { rate: 5, from: 'x', months: 3 } } }).promocja, null);
});

test('promocja: odsetki dzień po dniu tylko w okresie promocji', () => {
    // 1 000 zł, zwykle 0%, promocja 3,65% przez 1 miesiąc od 15 stycznia -> 10 gr dziennie przez 31 dni
    const opr = ctx.progiOdsetek({ interest_tiers: { mode: 'marginal', tiers: [{ from_gr: 0, rate: 0 }],
        promo: { rate: 3.65, from: '2026-01-15', months: 1, max_gr: 0 } } });
    const w = ctx.odsetkiSubkonta({ saldoPoczatkowe: 100000, od: '2026-01-01', doDnia: '2026-03-31', oprocentowanie: opr });
    assert.deepEqual(zwykly(w.kapitalizacje.map(k => [k.data, k.brutto])), [['2026-01-31', 170], ['2026-02-28', 140]]);
    assert.equal(ctx.czyOprocentowany(opr), true);
});

test('formularz: sprawdzPromocjeOdsetek i zapis promocji', () => {
    assert.deepEqual(zwykly(ctx.sprawdzPromocjeOdsetek({ wlaczona: false })), { promocja: null });
    const ok = ctx.sprawdzPromocjeOdsetek({ wlaczona: true, stopa: '7,5', od: '2026-11-20', miesiace: '3', limit: '50 000' });
    assert.deepEqual(zwykly(ok.promocja), { stopa: 7.5, od: '2026-11-20', miesiace: 3, do: '2027-02-20', limit: 5000000 });
    assert.equal(ctx.sprawdzPromocjeOdsetek({ wlaczona: true, stopa: '7', od: '2026-11-20', miesiace: '3', limit: '' }).promocja.limit, 0);
    assert.match(ctx.sprawdzPromocjeOdsetek({ wlaczona: true, stopa: '0', od: '2026-11-20', miesiace: '3' }).blad, /oprocentowanie promocyjne/);
    assert.match(ctx.sprawdzPromocjeOdsetek({ wlaczona: true, stopa: '7', od: '', miesiace: '3' }).blad, /datę/);
    assert.match(ctx.sprawdzPromocjeOdsetek({ wlaczona: true, stopa: '7', od: '2026-11-20', miesiace: '2,5' }).blad, /pełnych miesiącach/);
    assert.match(ctx.sprawdzPromocjeOdsetek({ wlaczona: true, stopa: '7', od: '2026-11-20', miesiace: '40' }).blad, /od 1 do 36/);
    const zapis = ctx.oprocentowanieDoZapisu({ tryb: 'nadwyzka', progi: [{ od: 0, stopa: 1 }], promocja: ok.promocja });
    assert.deepEqual(zwykly(zapis.interest_tiers.promo), { rate: 7.5, from: '2026-11-20', months: 3, max_gr: 5000000 });
    // zapis -> odczyt daje tę samą promocję
    assert.deepEqual(zwykly(ctx.progiOdsetek({ interest_tiers: zapis.interest_tiers }).promocja), zwykly(ok.promocja));
});

test('promocja: opisy i przypomnienie na karcie celu', () => {
    const cel = { interest_tiers: { mode: 'marginal', tiers: [{ from_gr: 0, rate: 1 }], promo: { rate: 7, from: '2026-11-01', months: 3, max_gr: 5000000 } } };
    const p = ctx.progiOdsetek(cel).promocja;
    assert.equal(ctx.opisPromocji(p, '2026-12-01').replace(/\s/g, ' '), 'promocja 7% do 50 000 zł przez 3 mies. (do 31.01.2027, zostały 62 dni)');
    assert.equal(ctx.opisPromocji(p, '2026-10-01').replace(/\s/g, ' '), 'promocja 7% do 50 000 zł przez 3 mies. (od 01.11.2026)');
    assert.match(ctx.opisPromocji(p, '2026-12-25'), /zostało 38 dni/);
    assert.equal(ctx.etykietaPromocjiNaKarcie(cel, '2026-12-01').uwaga, false);
    assert.equal(zwykly(ctx.etykietaPromocjiNaKarcie(cel, '2027-01-30')).tekst, 'Promocja 7% do 31.01.2027 – zostały 2 dni');
    assert.match(ctx.etykietaPromocjiNaKarcie(cel, '2027-02-10').tekst, /skończyła się 31.01.2027/);
    assert.equal(ctx.etykietaPromocjiNaKarcie(cel, '2027-04-10'), null);
    assert.equal(ctx.opisOprocentowania(cel, '2026-12-01').startsWith('1% rocznie od całego salda; promocja 7%'), true);
});

test('historia: progi z promocją', () => {
    assert.equal(ctx.wartoscWHistorii('interest_tiers', { tiers: [{}, {}], promo: { rate: 7.5 } }), '2 progi + promocja 7,5%');
});
