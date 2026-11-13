// Wczytuje pliki aplikacji (zwykłe skrypty, nie moduły) do osobnego kontekstu Node,
// tak jak przeglądarka: funkcje i stałe najwyższego poziomu stają się globalne.
// Testują tylko część „czystą” (bez DOM i bez bazy) – wymaga tego zasada ze specyfikacji (pkt 2).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const KATALOG = path.join(__dirname, '..');

const PLIKI_LOGIKI = [
    'js/zdarzenia.js',
    'js/config.js',
    'js/utils.js',
    'js/state.js',
    'js/nawigacja.js',
    'js/rules.js',
    'js/calc.js',
    'js/banki.js',
    'js/views/import.js'
];

function zaladuj(pliki = PLIKI_LOGIKI) {
    const kontekst = vm.createContext({
        console,
        TextDecoder,
        Papa: require('papaparse'),
        localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
    });
    for (const plik of pliki) {
        vm.runInContext(fs.readFileSync(path.join(KATALOG, plik), 'utf8'), kontekst, { filename: plik });
    }
    // const/let z najwyższego poziomu nie są właściwościami kontekstu – pomocnik do odczytu
    kontekst.wartosc = nazwa => vm.runInContext(nazwa, kontekst);
    return kontekst;
}

// Ustawia stan aplikacji (stan to `let` w state.js – zmieniamy jego pola, nie podmieniamy obiektu)
function ustawStan(ctx, pola, reguly = []) {
    vm.runInContext('wyczyscDaneBudzetu()', ctx);
    Object.assign(ctx.wartosc('stan'), pola);
    ctx.__reguly = reguly;
    vm.runInContext('dynamiczneReguly = __reguly', ctx);
}

module.exports = { zaladuj, ustawStan, KATALOG, PLIKI_LOGIKI };
