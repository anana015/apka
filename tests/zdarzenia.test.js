// Zdarzenia bez inline JS (js/zdarzenia.js) + kontrola wszystkich akcji data-* w kodzie
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { zaladuj, KATALOG } = require('./zaladuj');

const ctx = zaladuj(['js/zdarzenia.js']);

test('parser: wywołania z literałami, this.*, event i funkcją jako argumentem', () => {
    const akcja = "fn('a\\'b', -1.5, true, null, this.value, this.dataset.kat, event, odswiez); event.stopPropagation()";
    const [wywolanie, stop] = JSON.parse(JSON.stringify(ctx.parsujAkcje(akcja)));
    assert.equal(wywolanie.fn, 'fn');
    assert.deepEqual(wywolanie.args, [
        { t: 'lit', v: "a'b" }, { t: 'lit', v: -1.5 }, { t: 'lit', v: true }, { t: 'lit', v: null },
        { t: 'this', sciezka: ['value'] }, { t: 'this', sciezka: ['dataset', 'kat'] }, { t: 'event' }, { t: 'fn', nazwa: 'odswiez' }
    ]);
    assert.deepEqual(stop, { metodaZdarzenia: 'stopPropagation' });
});

test('parser odrzuca dowolny kod (to nie jest eval)', () => {
    for (const zly of [
        "alert(1)//", "fn(document.cookie)", "a.b()", "fn(this.innerHTML)", "if (x) { fn() }",
        "fn('x') + 1", "event.target.remove()", "fn(`x`)", "fn(1", "new Function('x')()"
    ]) {
        assert.throws(() => ctx.parsujAkcje(zly), `powinno odrzucić: ${zly}`);
    }
});

test('wykonanie: this = element, kolejność i stopPropagation jak przy inline handlerze', () => {
    const log = [];
    const zasieg = {
        zapisz: function (a, b) { log.push([this.id, a, b]); },
        drugi: () => log.push('drugi')
    };
    const el = { id: 'btn', value: '42', checked: true, dataset: { kat: 'Paliwo' } };
    let zatrzymane = false;
    const zdarzenie = { stopPropagation: () => { zatrzymane = true; } };
    ctx.wykonajAkcje("zapisz(this.value, this.dataset.kat); event.stopPropagation(); drugi()", el, zdarzenie, zasieg);
    assert.deepEqual(log, [['btn', '42', 'Paliwo'], 'drugi']);
    assert.equal(zatrzymane, true);
    assert.throws(() => ctx.wykonajAkcje('nieMaTakiej()', el, zdarzenie, zasieg), /Nie ma funkcji/);
});

// ---- Kontrola całego kodu -------------------------------------------

function plikiZrodlowe() {
    const wynik = ['index.html'];
    const przejdz = katalog => {
        for (const wpis of fs.readdirSync(path.join(KATALOG, katalog), { withFileTypes: true })) {
            const sciezka = path.join(katalog, wpis.name);
            if (wpis.isDirectory() && wpis.name !== 'vendor') przejdz(sciezka);
            else if (wpis.name.endsWith('.js')) wynik.push(sciezka);
        }
    };
    przejdz('js');
    return wynik;
}

// Zastępuje ${…} (z zagnieżdżeniami) zwykłą wartością – zostaje sama składnia akcji
function bezWstawek(tekst) {
    let wynik = '';
    for (let i = 0; i < tekst.length; i++) {
        if (tekst[i] === '$' && tekst[i + 1] === '{') {
            let glebokosc = 0;
            for (; i < tekst.length; i++) {
                if (tekst[i] === '{') glebokosc++;
                else if (tekst[i] === '}' && --glebokosc === 0) break;
            }
            wynik += '0';
        } else {
            wynik += tekst[i];
        }
    }
    return wynik;
}

const zrodla = plikiZrodlowe().map(p => ({ plik: p, tresc: fs.readFileSync(path.join(KATALOG, p), 'utf8') }));
const zadeklarowane = new Set();
for (const { tresc } of zrodla) {
    for (const m of tresc.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) zadeklarowane.add(m[1]);
}

test('w kodzie nie ma inline handlerów (on…="…") ani javascript:', () => {
    for (const { plik, tresc } of zrodla) {
        const html = plik.endsWith('.html') ? tresc : tresc.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
        const znalezione = [...html.matchAll(/\son(click|change|input|submit|keydown|keyup|load|error|focus|blur)\s*=\s*["']/gi)];
        assert.equal(znalezione.length, 0, `${plik}: ${znalezione.map(m => m[0]).join(', ')}`);
        assert.ok(!/javascript:/i.test(html), `${plik}: javascript:`);
    }
});

test('każda akcja data-* da się rozebrać i wskazuje istniejącą funkcję', () => {
    let sprawdzone = 0;
    const wzorce = [
        /data-(?:klik|zmiana|wpis|wyslij|escape|aktywuj|klawisz)="([^"]*)"/g,
        /akcja(?:Tak|Nie):\s*`([^`]*)`/g
    ];
    for (const { plik, tresc } of zrodla) {
        for (const wzorzec of wzorce) {
            for (const m of tresc.matchAll(wzorzec)) {
                const akcja = bezWstawek(m[1]);
                if (/^0$/.test(akcja.trim())) continue; // całość z wstawki (htmlPotwierdzenia) – sprawdzana przez akcjaTak/akcjaNie
                const instrukcje = ctx.parsujAkcje(akcja);
                for (const i of instrukcje) {
                    if (i.fn) assert.ok(zadeklarowane.has(i.fn), `${plik}: brak funkcji ${i.fn} (akcja „${m[1]}”)`);
                    for (const a of i.args || []) {
                        if (a.t === 'fn') assert.ok(zadeklarowane.has(a.nazwa), `${plik}: brak funkcji ${a.nazwa}`);
                    }
                }
                sprawdzone++;
            }
        }
    }
    assert.ok(sprawdzone > 100, `sprawdzono tylko ${sprawdzone} akcji`);
});
