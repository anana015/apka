// Wyszukiwarka transakcji, prognoza limitu i czas komunikatów
const test = require('node:test');
const assert = require('node:assert/strict');
const { zaladuj } = require('./zaladuj');

const ctx = zaladuj();

const t = { counterparty: 'Żabka Z4521 Kraków', title: 'Płatność kartą', note: 'piwo na grilla', booked_on: '2026-10-02', amount_gr: -12345 };

test('wyszukiwarka: tekst bez wielkości liter i polskich znaków, wszystkie słowa', () => {
    assert.equal(ctx.pasujeDoSzukania(t, 'zabka'), true);
    assert.equal(ctx.pasujeDoSzukania(t, 'KRAKÓW płatność'), true);
    assert.equal(ctx.pasujeDoSzukania(t, 'grill'), true);          // notatka
    assert.equal(ctx.pasujeDoSzukania(t, '2026-10'), true);        // data
    assert.equal(ctx.pasujeDoSzukania(t, 'zabka biedronka'), false);
    assert.equal(ctx.pasujeDoSzukania(t, '   '), true);            // puste = wszystko
});

test('wyszukiwarka: kwota z przecinkiem, kropką i znakiem', () => {
    assert.equal(ctx.pasujeDoSzukania(t, '123,45'), true);
    assert.equal(ctx.pasujeDoSzukania(t, '123.45'), true);
    assert.equal(ctx.pasujeDoSzukania(t, '-123,45'), true);
    assert.equal(ctx.pasujeDoSzukania(t, '−123,45'), true);
    assert.equal(ctx.pasujeDoSzukania(t, '123'), true);
    assert.equal(ctx.pasujeDoSzukania(t, '999,99'), false);
});

test('wyszukiwarka: kategoria z reguły, cel i części podziału', () => {
    assert.equal(ctx.pasujeDoSzukania(t, 'spozywcze', { kategoria: 'Zakupy spożywcze' }), true);
    assert.equal(ctx.pasujeDoSzukania(t, 'wakacje', { cel: { name: 'Wakacje 2027' } }), true);
    assert.equal(ctx.pasujeDoSzukania(t, 'apteka', { podzial: [{ category: 'Apteka' }, { category: 'Inne' }] }), true);
});

test('prognoza limitu: tempo liniowe, dopiero od 5. dnia, bez ostatniego dnia', () => {
    assert.equal(ctx.dniWMiesiacu(2026, 2), 28);
    assert.equal(ctx.dniWMiesiacu(2028, 2), 29);
    assert.equal(ctx.dniWMiesiacu(2026, 11), 30);
    // 600 zł przez 10 dni z 30 -> 1 800 zł
    assert.equal(ctx.prognozaKoncaMiesiaca(60000, 10, 30), 180000);
    assert.equal(ctx.prognozaKoncaMiesiaca(60000, 4, 30), null);
    assert.equal(ctx.prognozaKoncaMiesiaca(60000, 30, 30), null);
    assert.equal(ctx.prognozaKoncaMiesiaca(0, 10, 30), null);
});

test('ostrzeżenie limitu: tylko gdy tempo przekroczy limit, a limit jeszcze nie jest przekroczony', () => {
    const o = ctx.ostrzezenieLimitu(60000, 90000, 10, 30);
    assert.deepEqual({ ...o }, { prognoza: 180000, ponad: 90000 });
    assert.equal(ctx.ostrzezenieLimitu(20000, 90000, 10, 30), null);  // 600 zł prognozy < 900 zł
    assert.equal(ctx.ostrzezenieLimitu(95000, 90000, 10, 30), null);  // już ponad limit
    assert.equal(ctx.ostrzezenieLimitu(60000, null, 10, 30), null);   // bez limitu
});

test('czas komunikatu: zależny od długości, z „Cofnij” co najmniej 8 s, najwyżej 10 s', () => {
    assert.equal(ctx.czasKomunikatu(''), 2600);
    assert.equal(ctx.czasKomunikatu('Dodano nowy cel'), 2600 + 15 * 50);
    assert.equal(ctx.czasKomunikatu('x'.repeat(500)), 10000);
    assert.equal(ctx.czasKomunikatu('Usunięto', true), 8000);
});
