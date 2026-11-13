// Klasyfikacja transakcji (specyfikacja 4.1–4.4 i testy akceptacyjne 11.2)
const test = require('node:test');
const assert = require('node:assert/strict');
const { zaladuj, ustawStan } = require('./zaladuj');

const ctx = zaladuj();
const SUBKONTO_WAKACJE = '11112222333344445555666677';
const KONTO_WYPLAT = '99998888777766665555444433';

const CEL_WAKACJE = { id: 'c1', name: 'Wakacje 2027', keyword: SUBKONTO_WAKACJE, keywords_out: 'wakacje, bilety', target_gr: 1400000, deadline: '2027-06-01' };
const CEL_PREZENTY = { id: 'c2', name: 'Prezenty', keyword: '55556666777788889999000011', keywords_out: 'prezenty', target_gr: 100000, deadline: '2026-12-01' };

function przygotuj(reguly = []) {
    ustawStan(ctx, {
        cele: [CEL_WAKACJE, CEL_PREZENTY],
        ustawieniaBudzetu: { konto_wyplat: KONTO_WYPLAT }
    }, reguly);
}

test('„Pomiń” wyklucza transakcję ze wszystkich sum', () => {
    przygotuj();
    const k = ctx.klasyfikuj({ amount_gr: -1000, category_manual: 'Pomiń', counterparty: 'X' });
    assert.equal(k.typ, 'pominiete');
});

test('przelew na subkonto celu = wpłata na cel, nie wydatek (11.2)', () => {
    przygotuj();
    const k = ctx.klasyfikuj({ amount_gr: -30000, account_number: SUBKONTO_WAKACJE, title: 'Przelew na subkonto' });
    assert.equal(k.typ, 'wplata');
    assert.equal(k.cel.name, 'Wakacje 2027');
});

test('wpływ z konta wypłat ze słowem celu = wypłata z celu, nie przychód (11.2)', () => {
    przygotuj();
    const k = ctx.klasyfikuj({ amount_gr: 25000, account_number: KONTO_WYPLAT, title: 'Wypłata z subkonta PREZENTY' });
    assert.equal(k.typ, 'wyplata');
    assert.equal(k.cel.name, 'Prezenty');
    // Bez słowa celu: wypłata „do przypisania”
    const bez = ctx.klasyfikuj({ amount_gr: 25000, account_number: KONTO_WYPLAT, title: 'Przelew' });
    assert.equal(bez.typ, 'wyplata');
    assert.equal(bez.cel, null);
    assert.equal(ctx.czyKlasyfikacjaDoPrzypisania(bez), true);
});

test('zwykły wpływ = przychód, wypływ bez reguły = wydatek bez kategorii', () => {
    przygotuj();
    assert.equal(ctx.klasyfikuj({ amount_gr: 500000, counterparty: 'PRACODAWCA' }).typ, 'przychod');
    const k = ctx.klasyfikuj({ amount_gr: -1299, counterparty: 'ZABKA Z4521 KRAKOW' });
    assert.equal(k.typ, 'wydatek');
    assert.equal(k.kategoria, null);
});

test('reguły: bez polskich znaków, najnowsza wygrywa, numer konta ma pierwszeństwo', () => {
    przygotuj([
        { id: 'r3', phrase: 'ORLEN', category: 'Paliwo', created_at: '2026-11-03' },
        { id: 'r2', phrase: '12345678901234567890123456', category: 'Przelew na wspólne', created_at: '2026-11-02' },
        { id: 'r1', phrase: 'ŻABKA', category: 'Zakupy spożywcze', created_at: '2026-11-01' }
    ]);
    assert.equal(ctx.klasyfikuj({ amount_gr: -500, counterparty: 'ZABKA Z1' }).kategoria, 'Zakupy spożywcze');
    const naKonto = { amount_gr: -500, counterparty: 'ORLEN', account_number: '12345678901234567890123456' };
    assert.equal(ctx.klasyfikuj(naKonto).kategoria, 'Przelew na wspólne');
    // Ręczny wybór ma pierwszeństwo przed regułą
    assert.equal(ctx.klasyfikuj({ amount_gr: -500, counterparty: 'ORLEN', category_manual: 'Nieplanowane' }).kategoria, 'Nieplanowane');
});

test('fraza reguły „Zapamiętaj dla podobnych” pomija numery sklepów i formułki banku', () => {
    assert.equal(ctx.utworzFraze('ZABKA Z4521 KRAKOW', ''), 'ZABKA KRAKOW');
    assert.equal(ctx.utworzFraze('', 'Płatność kartą BIEDRONKA 1234'), 'BIEDRONKA');
    assert.equal(ctx.utworzFraze('Żabka Polska sp. z o.o.', ''), 'ZABKA');
});

test('ZABKA: po wybraniu kategorii z zapamiętaniem druga transakcja też ją dostaje (11.2)', () => {
    przygotuj();
    const t1 = { id: 1, amount_gr: -1299, counterparty: 'ZABKA Z4521 KRAKOW', category_manual: null };
    const t2 = { id: 2, amount_gr: -899, counterparty: 'ZABKA Z0001 KRAKOW', category_manual: null };
    ctx.wartosc('stan').transakcje = [t1, t2];
    assert.equal(ctx.liczBezKategorii(), 2);

    // To, co robi zmienKategorieTransakcji: ręczny wybór + reguła z frazy
    t1.category_manual = 'Zakupy spożywcze';
    ctx.wartosc('dynamiczneReguly').unshift({ id: 'r', phrase: ctx.utworzFraze(t1.counterparty, t1.title), category: 'Zakupy spożywcze' });

    assert.equal(ctx.klasyfikuj(t2).kategoria, 'Zakupy spożywcze');
    assert.equal(ctx.liczBezKategorii(), 0); // licznik maleje o 2
});

test('podział: uznawany tylko, gdy suma części = kwota transakcji', () => {
    przygotuj();
    const dobry = { amount_gr: -10000, splits: [{ category: 'A', amount_gr: -6000 }, { category: 'B', amount_gr: -4000 }] };
    const zly = { amount_gr: -10000, splits: [{ category: 'A', amount_gr: -6000 }, { category: 'B', amount_gr: -3000 }] };
    assert.equal(ctx.klasyfikuj(dobry).podzial.length, 2);
    assert.equal(ctx.klasyfikuj(zly).podzial, undefined);
});
