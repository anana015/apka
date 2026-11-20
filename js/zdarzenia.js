// =====================================================================
// ZDARZENIA BEZ INLINE JAVASCRIPTU (zamiast onclick="…", onchange="…" itd.)
//
// Dlaczego: inline handlery wymagają w Content-Security-Policy 'unsafe-inline', a wtedy CSP
// nie chroni przed wstrzyknięciem skryptu (XSS). Teraz HTML opisuje akcję atrybutem data-*,
// a jeden nasłuch na document wywołuje wskazaną funkcję. Nie ma eval ani new Function –
// akcję rozbiera mały parser, który zna tylko wywołania funkcji z prostymi argumentami.
//
// Atrybuty (wartość = to, co wcześniej było w on…):
//   data-klik     click                    data-zmiana   change
//   data-wpis     input                    data-wyslij   submit
//   data-escape   keydown Escape (zatrzymuje propagację, jak dawny if (event.key === 'Escape'))
//   data-aktywuj  keydown Enter / spacja (element z role="link" / "button", który nie jest <button>)
//   data-klawisz  każdy keydown (funkcja sama sprawdza event.key)
//
// Składnia akcji: instrukcje rozdzielone średnikiem, każda to
//   nazwaFunkcji(arg, …) | event.stopPropagation() | event.preventDefault()
// Argumenty: 'tekst', liczba, true, false, null, this, this.value, this.checked,
//   this.dataset.nazwa, event, nazwaFunkcji (przekazanie funkcji, np. odswiezUstawienia).
// Kolejność wywołań jak przy inline handlerach: od elementu docelowego w górę drzewa,
// do event.stopPropagation(). Ładowany przed pozostałymi skryptami aplikacji.
// =====================================================================

const ATRYBUTY_ZDARZEN = {
    click: 'klik',
    change: 'zmiana',
    input: 'wpis',
    submit: 'wyslij'
};

// ---- Parser akcji (czysta funkcja – testy w tests/zdarzenia.test.js) ----

const pamiecAkcji = new Map();

function bladAkcji(tekst, akcja) {
    return new Error(`Nieprawidłowa akcja „${akcja}”: ${tekst}`);
}

/**
 * „fn('a', 1, this.value); event.stopPropagation()” ->
 * [{ fn: 'fn', args: [{ t: 'lit', v: 'a' }, { t: 'lit', v: 1 }, { t: 'this', pole: 'value' }] },
 *  { metodaZdarzenia: 'stopPropagation' }]
 */
function parsujAkcje(akcja) {
    if (pamiecAkcji.has(akcja)) return pamiecAkcji.get(akcja);
    const s = String(akcja);
    let i = 0;
    const biale = () => { while (i < s.length && /\s/.test(s[i])) i++; };
    const identyfikator = () => {
        const m = /^[A-Za-z_$][\w$]*/.exec(s.slice(i));
        if (!m) throw bladAkcji(`oczekiwano nazwy w miejscu ${i}`, s);
        i += m[0].length;
        return m[0];
    };
    const tekst = () => {
        const cudzyslow = s[i++];
        let wynik = '';
        while (i < s.length && s[i] !== cudzyslow) {
            if (s[i] === '\\' && i + 1 < s.length) i++;
            wynik += s[i++];
        }
        if (s[i] !== cudzyslow) throw bladAkcji('niezamknięty tekst', s);
        i++;
        return wynik;
    };
    const argument = () => {
        biale();
        const z = s[i];
        if (z === "'" || z === '"') return { t: 'lit', v: tekst() };
        const liczbowa = /^-?\d+(\.\d+)?/.exec(s.slice(i));
        if (liczbowa) {
            i += liczbowa[0].length;
            return { t: 'lit', v: Number(liczbowa[0]) };
        }
        const nazwa = identyfikator();
        if (nazwa === 'true' || nazwa === 'false') return { t: 'lit', v: nazwa === 'true' };
        if (nazwa === 'null') return { t: 'lit', v: null };
        if (nazwa === 'event') return { t: 'event' };
        if (nazwa === 'this') {
            const sciezka = [];
            while (s[i] === '.') {
                i++;
                sciezka.push(identyfikator());
            }
            const dozwolone = sciezka.length === 0 ||
                (sciezka.length === 1 && ['value', 'checked', 'files'].includes(sciezka[0])) ||
                (sciezka.length === 2 && sciezka[0] === 'dataset');
            if (!dozwolone) throw bladAkcji(`niedozwolony argument this.${sciezka.join('.')}`, s);
            return { t: 'this', sciezka };
        }
        return { t: 'fn', nazwa };
    };

    const instrukcje = [];
    biale();
    while (i < s.length) {
        const nazwa = identyfikator();
        if (nazwa === 'event') {
            if (s[i++] !== '.') throw bladAkcji('po „event” oczekiwano kropki', s);
            const metoda = identyfikator();
            if (!['stopPropagation', 'preventDefault'].includes(metoda)) throw bladAkcji(`niedozwolone event.${metoda}`, s);
            biale();
            if (s[i++] !== '(' || (biale(), s[i++] !== ')')) throw bladAkcji(`oczekiwano event.${metoda}()`, s);
            instrukcje.push({ metodaZdarzenia: metoda });
        } else {
            biale();
            if (s[i++] !== '(') throw bladAkcji(`oczekiwano „(” po ${nazwa}`, s);
            const args = [];
            biale();
            if (s[i] === ')') {
                i++;
            } else {
                for (;;) {
                    args.push(argument());
                    biale();
                    const z = s[i++];
                    if (z === ')') break;
                    if (z !== ',') throw bladAkcji('oczekiwano „,” albo „)”', s);
                }
            }
            instrukcje.push({ fn: nazwa, args });
        }
        biale();
        if (s[i] === ';') i++;
        else if (i < s.length) throw bladAkcji(`nieoczekiwany znak „${s[i]}”`, s);
        biale();
    }
    pamiecAkcji.set(akcja, instrukcje);
    return instrukcje;
}

// Wartość argumentu w chwili zdarzenia
function wartoscArgumentu(arg, el, zdarzenie, zasieg) {
    if (arg.t === 'lit') return arg.v;
    if (arg.t === 'event') return zdarzenie;
    if (arg.t === 'fn') {
        const f = zasieg[arg.nazwa];
        if (typeof f !== 'function') throw new Error(`Nie ma funkcji ${arg.nazwa}`);
        return f;
    }
    return arg.sciezka.reduce((obiekt, pole) => (obiekt == null ? obiekt : obiekt[pole]), el);
}

// Wykonuje akcję tak, jak przeglądarka wykonałaby inline handler na elemencie el
function wykonajAkcje(akcja, el, zdarzenie, zasieg = globalThis) {
    for (const instr of parsujAkcje(akcja)) {
        if (instr.metodaZdarzenia) {
            zdarzenie[instr.metodaZdarzenia]();
            continue;
        }
        const f = zasieg[instr.fn];
        if (typeof f !== 'function') throw new Error(`Nie ma funkcji ${instr.fn} (akcja „${akcja}”)`);
        const wynik = f.apply(el, instr.args.map(a => wartoscArgumentu(a, el, zdarzenie, zasieg)));
        // Funkcje async: błąd nie może zginąć bez śladu
        if (wynik && typeof wynik.catch === 'function') wynik.catch(err => console.error(err));
    }
}

// ---- Nasłuch na całym dokumencie ------------------------------------

// Elementy na ścieżce zdarzenia (ustalonej w chwili zdarzenia – jak dla inline handlerów,
// także gdy akcja przerysuje fragment strony)
function elementyNaSciezce(zdarzenie) {
    const sciezka = typeof zdarzenie.composedPath === 'function' ? zdarzenie.composedPath() : [];
    return sciezka.filter(w => w && w.nodeType === 1);
}

function obsluzZdarzenie(zdarzenie, atrybut) {
    for (const el of elementyNaSciezce(zdarzenie)) {
        const akcja = el.getAttribute(`data-${atrybut}`);
        if (akcja == null) continue;
        // Formularze aplikacji nigdy nie wysyłają się „po staremu” (przeładowanie strony),
        // nawet gdy akcja rzuci błąd przed własnym preventDefault()
        if (zdarzenie.type === 'submit') zdarzenie.preventDefault();
        try {
            wykonajAkcje(akcja, el, zdarzenie);
        } catch (err) {
            console.error(err);
        }
        if (zdarzenie.cancelBubble) break;
    }
}

function obsluzKlawisz(zdarzenie) {
    for (const el of elementyNaSciezce(zdarzenie)) {
        const wlasny = el.getAttribute('data-klawisz');
        if (wlasny != null) {
            try { wykonajAkcje(wlasny, el, zdarzenie); } catch (err) { console.error(err); }
        }
        const escape = zdarzenie.key === 'Escape' && el.getAttribute('data-escape');
        if (escape) {
            zdarzenie.stopPropagation();
            try { wykonajAkcje(escape, el, zdarzenie); } catch (err) { console.error(err); }
        }
        // Enter / spacja aktywuje tylko element, na którym jest fokus (nie jego przodków)
        const aktywuj = el === zdarzenie.target && (zdarzenie.key === 'Enter' || zdarzenie.key === ' ') &&
            el.getAttribute('data-aktywuj');
        if (aktywuj) {
            zdarzenie.preventDefault();
            try { wykonajAkcje(aktywuj, el, zdarzenie); } catch (err) { console.error(err); }
        }
        if (zdarzenie.cancelBubble) break;
    }
}

// Przycisk HTML otwierający ukryte pole wyboru pliku
function kliknijElement(id) {
    const el = document.getElementById(id);
    if (el) el.click();
}

if (typeof document !== 'undefined') {
    Object.entries(ATRYBUTY_ZDARZEN).forEach(([typ, atrybut]) => {
        document.addEventListener(typ, e => obsluzZdarzenie(e, atrybut));
    });
    document.addEventListener('keydown', obsluzKlawisz);
}
