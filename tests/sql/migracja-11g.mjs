// Testy migracji 2026-11g i 2026-11h na prawdziwym Postgresie (PGlite – Postgres w WebAssembly, bez Dockera).
// Uruchomienie: npm run test:sql. Atrapa schematów auth/storage Supabase: atrapa-supabase.sql.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
const plik = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const M11G = readFileSync(new URL('../../supabase/migracja_2026-11g_bezpieczenstwo.sql', import.meta.url), 'utf8');
const M11H = readFileSync(new URL('../../supabase/migracja_2026-11h_cele_operacje_progi.sql', import.meta.url), 'utf8');

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
const C = '00000000-0000-0000-0000-00000000000c';

await db.exec(plik('atrapa-supabase.sql'));
await db.exec(plik('skrot-11f.sql'));
await db.exec(`insert into auth.users values ('${A}','a@x.pl',null),('${B}','b@x.pl',null),('${C}','c@x.pl',null);
  insert into auth.mfa_factors (user_id, status) values ('${B}','verified'), ('${C}','unverified');
  insert into public.budzet_czlonkowie (user_id) values ('${A}'),('${B}');
  insert into public.transakcje (title, amount_gr, owner_id, dedup_key) values ('wspolna', -100, null, 'w1'), ('A-osobista', -200, '${A}', 'a1'), ('B-osobista', -300, '${B}', 'b1');
  insert into storage.objects (bucket_id, name) values ('paragony','wspolny/1.jpg'), ('paragony','${B}/2.jpg');`);
await db.exec(M11G);
await db.exec(M11G);   // drugi raz – idempotentność
console.log('✓ migracja 11g uruchomiona dwa razy bez błędu');
await db.exec(M11H);
await db.exec(M11H);
console.log('✓ migracja 11h uruchomiona dwa razy bez błędu');

let wynikiTestow = 0;
async function jako(rola, claims) {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims ? JSON.stringify(claims) : '']);
    await db.exec(`set role ${rola}`);
}
const uzytk = (sub, aal = 'aal1', extra = {}) => ['authenticated', { sub, role: 'authenticated', aal, ...extra }];
async function wiersze(sql, p) { return (await db.query(sql, p)).rows; }
async function blad(sql, kod, p) {
    try { await db.query(sql, p); } catch (e) {
        if (kod) assert.equal(e.code, kod, `${sql}: oczekiwano ${kod}, jest ${e.code} ${e.message}`);
        return e;
    }
    assert.fail(`Brak błędu: ${sql}`);
}
async function test(nazwa, fn) { await fn(); wynikiTestow++; console.log('✓', nazwa); }

await test('anon nie ma dostępu do tabel ani funkcji', async () => {
    await jako('anon', null);
    await blad('select * from public.transakcje', '42501');
    await blad('select public.stan_bezpieczenstwa()', '42501');
    await blad('select public.historia_zmian_lista(false)', '42501');
});

await test('A (bez MFA, aal1) widzi wspólny + swój', async () => {
    await jako(...uzytk(A));
    const r = await wiersze('select title from public.transakcje order by title');
    assert.deepEqual(r.map(x => x.title), ['A-osobista', 'wspolna']);
    const s = (await wiersze('select public.stan_bezpieczenstwa() s'))[0].s;
    assert.deepEqual(s, { aal: 'aal1', ma_mfa: false, wymagaj_mfa: false, dostep: true });
});

await test('konto anonimowe nie ma dostępu', async () => {
    await jako(...uzytk(C, 'aal1', { is_anonymous: true }));
    assert.equal((await wiersze('select * from public.transakcje')).length, 0);
    await blad('select public.stan_bezpieczenstwa()', '28000');
});

await test('B (MFA włączone) z samym hasłem nie widzi nic', async () => {
    await jako(...uzytk(B));
    assert.equal((await wiersze('select * from public.transakcje')).length, 0);
    assert.equal((await wiersze(`select * from storage.objects`)).length, 0);
    await blad('select public.budzet_wspolny_stan()', '28000');
    await blad(`insert into public.transakcje (title, owner_id, dedup_key) values ('x', '${B}', 'x')`, '42501');
    const s = (await wiersze('select public.stan_bezpieczenstwa() s'))[0].s;
    assert.equal(s.ma_mfa, true); assert.equal(s.dostep, false);
});

await test('B z kodem MFA (aal2) widzi wspólny + swój i pliki', async () => {
    await jako(...uzytk(B, 'aal2'));
    const r = await wiersze('select title from public.transakcje order by title');
    assert.deepEqual(r.map(x => x.title), ['B-osobista', 'wspolna']);
    assert.equal((await wiersze(`select * from storage.objects`)).length, 2);
});

await test('C: niepotwierdzony składnik nie blokuje, budżet wspólny niedostępny', async () => {
    await jako(...uzytk(C));
    assert.equal((await wiersze('select * from public.transakcje')).length, 0);
    await blad('select public.historia_zmian_lista(false)', '42501');
    assert.deepEqual((await wiersze('select public.historia_zmian_lista(true) h'))[0].h, []);
});

await test('historia: dodanie, zmiana, usunięcie, import zbiorczy', async () => {
    await jako(...uzytk(A));
    await db.query(`insert into public.transakcje (title, amount_gr, dedup_key) values ('nowa', -50, 'n1')`);
    await db.query(`update public.transakcje set category_manual = 'Jedzenie' where dedup_key = 'n1'`);
    await db.query(`update public.transakcje set category_manual = 'Jedzenie' where dedup_key = 'n1'`); // bez zmian = bez wpisu
    await db.query(`delete from public.transakcje where dedup_key = 'n1'`);
    await db.query(`insert into public.transakcje (title, amount_gr, dedup_key) select 'imp'||g, -1, 'i'||g from generate_series(1,250) g`);
    await db.query(`insert into public.transakcje (title, amount_gr, dedup_key, owner_id) values ('moja', -1, 'm1', '${A}')`);
    const h = (await wiersze('select public.historia_zmian_lista(false) h'))[0].h;
    assert.deepEqual(h.map(x => [x.operacja, x.liczba]), [['INSERT', 250], ['DELETE', 1], ['UPDATE', 1], ['INSERT', 1]]);
    assert.deepEqual(h[2].zmiany, { category_manual: [null, 'Jedzenie'] });
    assert.equal(h[1].zmiany.title, 'nowa');
    assert.equal(h[0].email, 'a@x.pl'); assert.equal(h[0].to_ja, true); assert.equal(h[0].wiersz_id, null);
    const osobista = (await wiersze('select public.historia_zmian_lista(true) h'))[0].h;
    assert.equal(osobista.length, 1); assert.equal(osobista[0].zmiany.title, 'moja');
    await blad('select * from public.historia_zmian', '42501');
    await blad('delete from public.historia_zmian', '42501');
    await blad('select public.zapisz_historie()', '42501');
    // B (aal2) widzi historię wspólną, ale nie osobistą A
    await jako(...uzytk(B, 'aal2'));
    const hb = (await wiersze('select public.historia_zmian_lista(false) h'))[0].h;
    assert.equal(hb.length, 4); assert.equal(hb[0].to_ja, false);
    assert.equal((await wiersze('select public.historia_zmian_lista(true) h'))[0].h.length, 0);
});

await test('wczytanie kopii = jeden wpis zbiorczy, bez tysięcy wpisów', async () => {
    await jako(...uzytk(B, 'aal2'));
    const w = (await wiersze(`select public.wczytaj_kopie(false, $1::jsonb) w`, [JSON.stringify({
        transakcje: [{ id: 900, title: 'z kopii 1', amount_gr: -1, dedup_key: 'k1' }, { id: 901, title: 'z kopii 2', amount_gr: -2, dedup_key: 'k2' }],
        rules: [{ phrase: 'ORLEN', category: 'Transport' }]
    })]))[0].w;
    assert.deepEqual(w, { rules: 1, transakcje: 2 });
    const h = (await wiersze('select public.historia_zmian_lista(false, 2) h'))[0].h;
    assert.equal(h[0].operacja, 'KOPIA'); assert.equal(h[0].liczba, 3); assert.equal(h[1].operacja, 'INSERT');
    const r = await wiersze('select title from public.transakcje where owner_id is null order by id');
    assert.deepEqual(r.map(x => x.title), ['z kopii 1', 'z kopii 2']);
    // po kopii historia znów działa w tej samej sesji
    await db.query(`delete from public.rules where phrase = 'ORLEN'`);
    assert.equal((await wiersze('select public.historia_zmian_lista(false, 1) h'))[0].h[0].operacja, 'DELETE');
    // osobista kopia trafia do budżetu osobistego B
    await db.query(`select public.wczytaj_kopie(true, $1::jsonb)`, [JSON.stringify({ rules: [{ phrase: 'LIDL', category: 'Jedzenie' }] })]);
    assert.equal((await wiersze(`select owner_id from public.rules where phrase = 'LIDL'`))[0].owner_id, B);
});

await test('wczytanie kopii bez kodu MFA – odmowa', async () => {
    await jako(...uzytk(B));
    await blad(`select public.wczytaj_kopie(true, '{"rules": []}'::jsonb)`, '28000');
});

await test('wymagaj MFA: tylko aal2 + członek, potem A z samym hasłem nic nie widzi', async () => {
    await jako(...uzytk(A));
    await blad('select public.ustaw_wymagaj_mfa(true)', '42501');
    await jako(...uzytk(B, 'aal2'));
    const s = (await wiersze('select public.ustaw_wymagaj_mfa(true) s'))[0].s;
    assert.equal(s.wymagaj_mfa, true); assert.equal(s.dostep, true);
    await jako(...uzytk(A));
    assert.equal((await wiersze('select * from public.transakcje')).length, 0);
    const sa = (await wiersze('select public.stan_bezpieczenstwa() s'))[0].s;
    assert.deepEqual(sa, { aal: 'aal1', ma_mfa: false, wymagaj_mfa: true, dostep: false });
    await jako(...uzytk(A, 'aal2'));
    assert.ok((await wiersze('select * from public.transakcje')).length > 0);
    await jako(...uzytk(B, 'aal2'));
    await db.query('select public.ustaw_wymagaj_mfa(false)');
    const h = (await wiersze('select public.historia_zmian_lista(false, 1) h'))[0].h[0];
    assert.equal(h.tabela, 'ustawienia_bezpieczenstwa'); assert.deepEqual(h.zmiany.wymagaj_mfa, [true, false]);
});

await test('limity danych i brak TRUNCATE', async () => {
    await jako(...uzytk(A));
    await blad(`insert into public.transakcje (title, dedup_key) values (repeat('x', 1001), 'd')`, '23514');
    await blad(`insert into public.categories (name, color) values ('Zła', 'red')`, '23514');
    await blad(`insert into public.transakcje (title, dedup_key, splits) values ('s', 's', '{"a":1}')`, '23514');
    await db.query(`insert into public.categories (name, color) values ('Dobra', '#A0643C')`);
    await blad('truncate public.transakcje', '42501');
});

await test('11h: cel bez subkonta i terminu, operacje ręczne, progi z promocją, limity', async () => {
    await jako(...uzytk(A));
    const cel = (await wiersze(`insert into public.goals (name, target_gr, manual_operations, interest_tiers)
        values ('Gotówka', 100000, '[{"id":"a","date":"2026-11-01","amount_gr":5000,"transfer":{"id":"t","goal_id":"2"}}]',
                '{"mode":"marginal","tiers":[{"from_gr":0,"rate":1}],"promo":{"rate":7,"from":"2026-11-01","months":3,"max_gr":0}}')
        returning keyword, deadline, manual_operations`))[0];
    assert.equal(cel.keyword, null); assert.equal(cel.deadline, null); assert.equal(cel.manual_operations.length, 1);
    await blad(`insert into public.goals (name, interest_tiers) values ('zły', '{"mode":"x","tiers":[{"from_gr":0,"rate":1}]}')`, '23514');
    await blad(`insert into public.goals (name, interest_tiers) values ('zły', '{"tiers":[]}')`, '23514');
    await blad(`insert into public.goals (name, manual_operations) values ('zły', '{}')`, '23514');
    const h = (await wiersze('select public.historia_zmian_lista(false, 1) h'))[0].h[0];
    assert.equal(h.tabela, 'goals'); assert.equal(h.operacja, 'INSERT');
});

console.log(`\nWszystkie testy SQL: ${wynikiTestow} ✓`);
