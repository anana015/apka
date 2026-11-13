// Obliczenia (specyfikacja 6, 8.1, 9 i testy akceptacyjne 11.2)
const test = require('node:test');
const assert = require('node:assert/strict');
const { zaladuj, ustawStan } = require('./zaladuj');

const ctx = zaladuj();
const NBSP = ' ';

const SUBKONTO = '11112222333344445555666677';
const KONTO_WYPLAT = '99998888777766665555444433';

function przykladowyMiesiac() {
    return [
        { id: 1, booked_on: '2026-10-01', amount_gr: 800000, counterparty: 'PRACODAWCA' },
        { id: 2, booked_on: '2026-10-02', amount_gr: -12345, counterparty: 'BIEDRONKA', category_manual: 'Zakupy spożywcze' },
        { id: 3, booked_on: '2026-10-03', amount_gr: -250000, counterparty: 'WSPOLNOTA', category_manual: 'Czynsz' },
        { id: 4, booked_on: '2026-10-04', amount_gr: -30000, account_number: SUBKONTO, title: 'Na wakacje' },
        { id: 5, booked_on: '2026-10-05', amount_gr: 10000, account_number: KONTO_WYPLAT, title: 'Wypłata wakacje' },
        { id: 6, booked_on: '2026-10-06', amount_gr: -50000, counterparty: 'XTB', category_manual: 'Akcje/Obligacje' },
        { id: 7, booked_on: '2026-10-07', amount_gr: 2345, counterparty: 'BIEDRONKA', category_manual: 'Zakupy spożywcze' }, // zwrot
        { id: 8, booked_on: '2026-10-08', amount_gr: -7777, counterparty: 'PRZELEW WLASNY', category_manual: 'Pomiń' },
        { id: 9, booked_on: '2026-10-09', amount_gr: -9999, counterparty: 'NIEZNANY' },
        { id: 10, booked_on: '2026-10-10', amount_gr: -10000, counterparty: 'IKEA',
          splits: [{ category: 'Wydatki na dom', amount_gr: -7000 }, { category: 'Pomiń', amount_gr: -3000 }] }
    ];
}

function przygotuj(transakcje = przykladowyMiesiac()) {
    ustawStan(ctx, {
        transakcje,
        cele: [{ id: 'c1', name: 'Wakacje', keyword: SUBKONTO, keywords_out: 'wakacje', target_gr: 1000000, deadline: '2027-06-01', interest_rate: 0 }],
        kategorie: ctx.kategorieDomyslne('wspolny'),
        ustawieniaBudzetu: { konto_wyplat: KONTO_WYPLAT }
    });
}

test('pulpit: przychody − wydatki − odłożone = zostało; suma kategorii = wydatki (11.2)', () => {
    przygotuj();
    const s = ctx.podsumuj(ctx.wartosc('stan').transakcje);
    assert.equal(s.przychody, 800000);
    // 12345 + 250000 + 9999 (bez kategorii) + 7000 (część podziału) − 2345 (zwrot)
    assert.equal(s.wydatki, 12345 + 250000 + 9999 + 7000 - 2345);
    assert.equal(s.zwroty, 2345);
    // wpłata na cel 30000 + Akcje/Obligacje 50000 − wypłata z celu 10000
    assert.equal(s.wplaty, 80000);
    assert.equal(s.wyplaty, 10000);
    assert.equal(s.netto, 70000);
    const sumaKategorii = Object.values(s.kategorie).reduce((a, b) => a + b, 0);
    assert.equal(sumaKategorii, s.wydatki);
    assert.equal(s.kategorie.Nieprzypisane, 9999);
    // „Zostało na koncie” = przychody − wydatki − odłożone netto; pominięta transakcja (7777) nigdzie się nie liczy
    const zostalo = s.przychody - s.wydatki - s.netto;
    assert.equal(zostalo, 800000 - 276999 - 70000);
});

test('wpłata na subkonto zwiększa saldo celu, wypłata je zmniejsza (11.2)', () => {
    przygotuj();
    const salda = ctx.saldaCelow();
    assert.equal(salda.c1, 30000 - 10000);
});

test('cel z przykładu 8.1: „Za wolno”, potrzebna wpłata 371 zł, szacowany termin M + 12', () => {
    przygotuj([]);
    // brakuje 2 600 zł, średnia 217 zł (6 × 217 = 1302 zł w oknie), termin za 7 miesięcy
    const M = '2026-10';
    const operacje = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
        .map(klucz => ({ typ: 'wplata', kwota: 21700, klucz, t: { booked_on: `${klucz}-10` } }));
    const cel = { target_gr: 130200 + 260000, opening_balance_gr: 0, deadline: '2027-05-01' };
    const bezOdsetek = { netto: 0, brutto: 0, podatek: 0, kapitalizacje: [] };
    const a = ctx.analizaCelu(cel, operacje, M, bezOdsetek);
    assert.equal(a.brakuje, 260000);
    assert.equal(a.srednia, 21700);
    assert.equal(a.miesiecyDoTerminu, 7);
    assert.equal(Math.round(a.potrzebna / 100), 371);
    assert.equal(a.status, 'za-wolno');
    assert.equal(a.szacowanyKlucz, '2027-10');
    // Zalecenie (8.3): Y i Z w górę do pełnych 10 zł
    assert.equal(ctx.wGoreDo10zl(a.potrzebna), 38000);
    assert.equal(ctx.wGoreDo10zl(a.potrzebna - a.srednia), 16000);
});

test('cel z terminem w przeszłości: 1 miesiąc, potrzebna = cała brakująca kwota (11.1)', () => {
    przygotuj([]);
    const a = ctx.analizaCelu({ target_gr: 50000, deadline: '2025-01-01' }, [], '2026-10', { netto: 0, kapitalizacje: [] });
    assert.equal(a.miesiecyDoTerminu, 1);
    assert.equal(a.potrzebna, 50000);
});

test('odsetki: 3,65% od 1000 zł = 10 gr dziennie, kapitalizacja z podatkiem Belki', () => {
    const w = ctx.odsetkiSubkonta({ saldoPoczatkowe: 100000, od: '2026-01-01', doDnia: '2026-01-31', stopa: 3.65, prog: 0 });
    assert.equal(w.brutto, 310);
    assert.equal(w.podatek, 59);   // round(310 × 0,19 = 58,9)
    assert.equal(w.netto, 251);
    assert.equal(w.kapitalizacje.length, 1);
    assert.equal(w.kapitalizacje[0].data, '2026-01-31');
    // Próg: odsetki tylko od nadwyżki
    const zProgiem = ctx.odsetkiSubkonta({ saldoPoczatkowe: 100000, od: '2026-01-01', doDnia: '2026-01-31', stopa: 3.65, prog: 100000 });
    assert.equal(zProgiem.brutto, 0);
});

test('miesiąc bez przychodu: stopa oszczędności bez dzielenia przez zero (11.1)', () => {
    przygotuj([{ id: 1, booked_on: '2026-10-02', amount_gr: -1000, counterparty: 'X' }]);
    const w = ctx.wierszMiesiaca('2026-10', ctx.wartosc('stan').transakcje);
    assert.equal(w.stopa, null);
});

test('klucze miesięcy: przejście przez rok', () => {
    assert.equal(ctx.przesunKlucz('2026-12', 1), '2027-01');
    assert.equal(ctx.przesunKlucz('2026-01', -1), '2025-12');
    assert.equal(ctx.przesunKlucz('2026-10', -5), '2026-05');
    assert.equal(ctx.roznicaMiesiecy('2026-10', '2027-06'), 8);
});

test('format kwot po polsku: spacja twarda jako separator tysięcy (6)', () => {
    assert.equal(ctx.zl(499600), `4${NBSP}996 zł`);
    assert.equal(ctx.zl(123456789, 2), `1${NBSP}234${NBSP}567,89 zł`);
    assert.equal(ctx.zl(-50), '-1 zł'); // −0,50 zł zaokrąglone do pełnych złotych (jak toFixed)
    assert.equal(ctx.zlZeZnakiem(-1250), '−12,50 zł');
    assert.equal(ctx.liczba(-0.4), '0'); // bez „-0”
});

test('odmiana polska', () => {
    assert.equal(ctx.odmiana(1, 'transakcja', 'transakcje', 'transakcji'), 'transakcja');
    assert.equal(ctx.odmiana(3, 'transakcja', 'transakcje', 'transakcji'), 'transakcje');
    assert.equal(ctx.odmiana(12, 'transakcja', 'transakcje', 'transakcji'), 'transakcji');
    assert.equal(ctx.odmiana(22, 'transakcja', 'transakcje', 'transakcji'), 'transakcje');
});
