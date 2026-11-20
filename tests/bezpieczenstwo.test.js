// Bezpieczeństwo: szyfrowanie kopii, automatyczne wylogowanie, opisy historii zmian
const test = require('node:test');
const assert = require('node:assert/strict');
const { zaladuj } = require('./zaladuj');

const ctx = zaladuj(['js/zdarzenia.js', 'js/config.js', 'js/utils.js', 'js/state.js', 'js/szyfrowanie.js',
    'js/bezpieczenstwo.js', 'js/views/historia.js'], {
    crypto: globalThis.crypto, TextEncoder, btoa, atob
});

test('szyfrowanie kopii: zapis i odczyt tym samym hasłem', async () => {
    const tekst = JSON.stringify({ format: 'budzet-domowy-kopia', tabele: ['Żółć ąę', 1, 2] });
    const koperta = await ctx.zaszyfrujTekst(tekst, 'długie hasło 1', 100000);
    assert.equal(ctx.czyKopiaSzyfrowana(koperta), true);
    assert.equal(koperta.kdf.iterations, 100000);
    assert.ok(!JSON.stringify(koperta).includes('Żółć'));
    assert.equal(await ctx.odszyfrujTekst(koperta, 'długie hasło 1'), tekst);
});

test('szyfrowanie kopii: złe hasło, zmieniony plik, za krótkie hasło', async () => {
    const koperta = await ctx.zaszyfrujTekst('{"a":1}', 'poprawne-haslo', 100000);
    await assert.rejects(ctx.odszyfrujTekst(koperta, 'zle-haslo-123'), /Złe hasło/);
    const zmieniona = { ...koperta, dane: koperta.dane.slice(0, -4) + (koperta.dane.endsWith('AAAA') ? 'BBBB' : 'AAAA') };
    await assert.rejects(ctx.odszyfrujTekst(zmieniona, 'poprawne-haslo'), /Złe hasło albo plik/);
    await assert.rejects(ctx.zaszyfrujTekst('x', 'krotkie'), /co najmniej 8/);
    const zaMaloIteracji = { ...koperta, kdf: { ...koperta.kdf, iterations: 1000 } };
    await assert.rejects(ctx.odszyfrujTekst(zaMaloIteracji, 'poprawne-haslo'), /Uszkodzony/);
    // dwa szyfrowania tego samego tekstu dają różne pliki (losowa sól i IV)
    const druga = await ctx.zaszyfrujTekst('{"a":1}', 'poprawne-haslo', 100000);
    assert.notEqual(druga.dane, koperta.dane);
    assert.notEqual(druga.kdf.salt, koperta.kdf.salt);
});

test('szyfrowanie kopii: duży plik (base64 w kawałkach)', async () => {
    const duzy = 'x'.repeat(300000) + 'ąę';
    const koperta = await ctx.zaszyfrujTekst(duzy, 'haslo-do-kopii', 100000);
    assert.equal(await ctx.odszyfrujTekst(koperta, 'haslo-do-kopii'), duzy);
});

test('bezczynność: limit, brak zapisu, „nigdy”', () => {
    const MIN = 60 * 1000;
    assert.equal(ctx.czyPrzekroczonoBezczynnosc(0, 100 * MIN, 15), false);         // brak zapisu
    assert.equal(ctx.czyPrzekroczonoBezczynnosc(null, 100 * MIN, 15), false);
    assert.equal(ctx.czyPrzekroczonoBezczynnosc(10 * MIN, 24 * MIN, 15), false);
    assert.equal(ctx.czyPrzekroczonoBezczynnosc(10 * MIN, 25 * MIN, 15), true);
    assert.equal(ctx.czyPrzekroczonoBezczynnosc(10 * MIN, 999 * MIN, 0), false);    // nigdy
    assert.equal(ctx.poprawnyLimitBezczynnosci('30'), 30);
    assert.equal(ctx.poprawnyLimitBezczynnosci('0'), 0);
    assert.equal(ctx.poprawnyLimitBezczynnosci('7'), 15);
    assert.equal(ctx.poprawnyLimitBezczynnosci('abc'), 15);
    assert.equal(ctx.limitBezczynnosciMin(), 15);                                  // domyślnie
    assert.equal(ctx.opisLimituBezczynnosci(60), 'po 1 godzinie');
    assert.equal(ctx.opisLimituBezczynnosci(5), 'po 5 min');
});

test('historia: opisy wpisów', () => {
    const o = w => ctx.opisZmiany(w);
    assert.equal(o({ tabela: 'transakcje', operacja: 'INSERT', liczba: 250 }).tekst, 'Dodano 250 transakcji');
    assert.equal(o({ tabela: 'transakcje', operacja: 'INSERT', liczba: 3 }).tekst, 'Dodano 3 transakcje');
    assert.equal(o({ tabela: 'transakcje', operacja: 'DELETE', liczba: 1, zmiany: { counterparty: 'Żabka', amount_gr: -1250 } }).tekst,
        'Usunięto transakcję: Żabka, -12,50 zł');
    assert.equal(o({ tabela: 'rules', operacja: 'INSERT', liczba: 1, zmiany: { phrase: 'ORLEN', category: 'Transport' } }).tekst,
        'Dodano regułę: „ORLEN” → Transport');
    const zmiana = ctx.opisZmiany({ tabela: 'transakcje', operacja: 'UPDATE', liczba: 1, wiersz_id: '7',
        zmiany: { category_manual: [null, 'Jedzenie'], note: ['a', 'b'], dedup_key: ['x', 'y'] } },
        { counterparty: 'Biedronka', amount_gr: -500 });
    assert.equal(zmiana.tekst, 'Zmieniono transakcję: Biedronka, -5,00 zł');
    assert.deepEqual([...zmiana.szczegoly], ['kategoria: — → Jedzenie', 'notatka: a → b']);
    assert.deepEqual([...o({ tabela: 'categories', operacja: 'UPDATE', zmiany: { monthly_limit_gr: [90000, 120000], is_fixed: [false, true] } }).szczegoly]
        .map(t => t.replace(/\s/g, ' ')),
        ['limit miesięczny: 900,00 zł → 1 200,00 zł', 'stała: nie → tak']);
    assert.equal(o({ tabela: 'kopia', operacja: 'KOPIA', liczba: 12 }).tekst, 'Wczytano kopię zapasową (12 wierszy)');
    assert.equal(o({ tabela: 'budzet_czlonkowie', operacja: 'INSERT', liczba: 1, zmiany: { user_id: 'x' } }).tekst, 'Dodano osobę do budżetu wspólnego');
    assert.deepEqual([...o({ tabela: 'ustawienia_bezpieczenstwa', operacja: 'UPDATE', zmiany: { wymagaj_mfa: [false, true], zmienil: ['a', 'b'] } }).szczegoly],
        ['wymagaj MFA od wszystkich: nie → tak']);
});

test('kod QR: SVG z Supabase kodowany, inne adresy odrzucane', () => {
    assert.equal(ctx.adresObrazuQr('data:image/svg+xml;utf-8,<svg a="1"/>'), 'data:image/svg+xml;charset=utf-8,%3Csvg%20a%3D%221%22%2F%3E');
    assert.equal(ctx.adresObrazuQr('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
    assert.equal(ctx.adresObrazuQr('https://zly.example/qr.png'), '');
    assert.equal(ctx.adresObrazuQr('javascript:alert(1)'), '');
});
