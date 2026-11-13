// Adresy widoków dla przycisku „Wstecz” (js/nawigacja.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const { zaladuj } = require('./zaladuj');

const ctx = zaladuj(['js/nawigacja.js']);
const zwykly = o => JSON.parse(JSON.stringify(o));

test('adres -> widok', () => {
    assert.deepEqual(zwykly(ctx.parsujAdres('#pulpit')), { zakladka: 'pulpit', cel: null, strona: null, kategoria: null });
    assert.deepEqual(zwykly(ctx.parsujAdres('#cele/abc-123')), { zakladka: 'cele', cel: 'abc-123', strona: null, kategoria: null });
    assert.deepEqual(zwykly(ctx.parsujAdres('#ustawienia')), { zakladka: 'ustawienia', cel: null, strona: 'menu', kategoria: null });
    assert.deepEqual(zwykly(ctx.parsujAdres('#ustawienia/kategoria/7')), { zakladka: 'ustawienia', cel: null, strona: 'kategoria', kategoria: '7' });
});

test('adresy z linków e-mail Supabase i nieznane nie są widokami', () => {
    assert.equal(ctx.parsujAdres('#access_token=abc&type=recovery'), null);
    assert.equal(ctx.parsujAdres('#error=access_denied'), null);
    assert.equal(ctx.parsujAdres(''), null);
    assert.equal(ctx.parsujAdres('#cokolwiek'), null);
});

test('widok -> adres -> ten sam widok', () => {
    const przypadki = [
        { zakladka: 'transakcje' },
        { zakladka: 'cele', otwartyCel: 'id z/ukośnikiem' },
        { zakladka: 'ustawienia', ustawieniaStrona: 'reguly' },
        { zakladka: 'ustawienia', ustawieniaStrona: 'kategoria', ustawieniaKategoria: 42 }
    ];
    for (const s of przypadki) {
        const adres = ctx.adresDlaStanu(s);
        const w = ctx.parsujAdres(adres);
        assert.equal(w.zakladka, s.zakladka, adres);
        if (s.otwartyCel) assert.equal(w.cel, s.otwartyCel, adres);
        if (s.ustawieniaStrona) assert.equal(w.strona, s.ustawieniaStrona, adres);
        if (s.ustawieniaKategoria != null) assert.equal(w.kategoria, String(s.ustawieniaKategoria), adres);
    }
});
