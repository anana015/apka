// =====================================================================
// SZYFROWANIE KOPII ZAPASOWYCH HASŁEM (WebCrypto, bez bibliotek)
//
// Kopia budżetu (kopia.js) to plik JSON z całą historią finansową. Zaszyfrowana trafia na dysk
// jako koperta:
//   { format: 'budzet-domowy-kopia-szyfrowana', version: 1,
//     kdf:  { name: 'PBKDF2', hash: 'SHA-256', iterations, salt },   – klucz z hasła
//     szyfr: { name: 'AES-GCM', iv },                                – szyfrowanie z kontrolą integralności
//     dane: '<base64>' }
// AES-GCM wykrywa każdą zmianę pliku i złe hasło (odszyfrowanie się nie uda).
// Hasła nie da się odzyskać – bez niego kopia jest bezużyteczna (komunikat w Ustawieniach).
// Czyste funkcje – testy w tests/bezpieczenstwo.test.js.
// =====================================================================

const FORMAT_KOPII_SZYFROWANEJ = 'budzet-domowy-kopia-szyfrowana';
const WERSJA_SZYFROWANIA = 1;
// PBKDF2-HMAC-SHA256: 600 000 iteracji (zalecenie OWASP) – na telefonie ok. 0,5–1 s
const ITERACJE_PBKDF2 = 600000;
const MIN_DLUGOSC_HASLA_KOPII = 8;

function bajtyNaBase64(bajty) {
    let tekst = '';
    const KAWALEK = 0x8000; // String.fromCharCode z bardzo dużą tablicą przepełnia stos
    for (let i = 0; i < bajty.length; i += KAWALEK) {
        tekst += String.fromCharCode.apply(null, bajty.subarray(i, i + KAWALEK));
    }
    return btoa(tekst);
}

function base64NaBajty(tekst) {
    const binarny = atob(String(tekst || ''));
    const bajty = new Uint8Array(binarny.length);
    for (let i = 0; i < binarny.length; i++) bajty[i] = binarny.charCodeAt(i);
    return bajty;
}

async function kluczZHasla(haslo, sol, iteracje) {
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(haslo), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', salt: sol, iterations: iteracje },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

// Tekst (JSON kopii) -> koperta do zapisania w pliku
async function zaszyfrujTekst(tekst, haslo, iteracje = ITERACJE_PBKDF2) {
    if (String(haslo || '').length < MIN_DLUGOSC_HASLA_KOPII) {
        throw new Error(`Hasło do kopii musi mieć co najmniej ${MIN_DLUGOSC_HASLA_KOPII} znaków.`);
    }
    const sol = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const klucz = await kluczZHasla(haslo, sol, iteracje);
    const szyfrogram = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, klucz, new TextEncoder().encode(tekst));
    return {
        format: FORMAT_KOPII_SZYFROWANEJ,
        version: WERSJA_SZYFROWANIA,
        kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: iteracje, salt: bajtyNaBase64(sol) },
        szyfr: { name: 'AES-GCM', iv: bajtyNaBase64(iv) },
        dane: bajtyNaBase64(new Uint8Array(szyfrogram))
    };
}

function czyKopiaSzyfrowana(obiekt) {
    return !!obiekt && typeof obiekt === 'object' && obiekt.format === FORMAT_KOPII_SZYFROWANEJ;
}

// Koperta -> tekst. Złe hasło albo zmieniony plik: błąd z czytelnym komunikatem.
async function odszyfrujTekst(koperta, haslo) {
    if (!czyKopiaSzyfrowana(koperta)) throw new Error('To nie jest zaszyfrowana kopia z tej aplikacji.');
    if (koperta.version !== WERSJA_SZYFROWANIA || !koperta.kdf || !koperta.szyfr) {
        throw new Error('Nieznana wersja zaszyfrowanej kopii – odśwież aplikację i spróbuj ponownie.');
    }
    const iteracje = Number(koperta.kdf.iterations);
    if (!Number.isInteger(iteracje) || iteracje < 100000 || iteracje > 10000000) throw new Error('Uszkodzony nagłówek kopii.');
    try {
        const klucz = await kluczZHasla(String(haslo || ''), base64NaBajty(koperta.kdf.salt), iteracje);
        const tekst = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64NaBajty(koperta.szyfr.iv) }, klucz, base64NaBajty(koperta.dane));
        return new TextDecoder().decode(tekst);
    } catch (e) {
        throw new Error('Złe hasło albo plik kopii został zmieniony.');
    }
}
