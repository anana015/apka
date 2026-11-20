-- =====================================================================
-- MIGRACJA 2026-11g: BEZPIECZEŃSTWO (darmowy plan Supabase)
-- Uruchom raz w Supabase: SQL Editor → New query → wklej → Run
-- (po migracjach 2026-10 … 2026-11f). Skrypt można uruchomić ponownie.
--
-- 1. Weryfikacja dwuetapowa (MFA, kod z aplikacji typu Google Authenticator):
--    - osoba, która włączyła MFA, bez kodu nie zobaczy ŻADNYCH danych (także po kradzieży hasła),
--    - opcjonalnie: „wymagaj MFA od wszystkich” (Ustawienia → Weryfikacja dwuetapowa).
--    Sprawdzenie siedzi w funkcji uzytkownik_budzetu(), więc obejmuje wszystkie zasady RLS,
--    funkcje budżetu wspólnego, wczytanie kopii i pliki paragonów.
-- 2. Historia zmian (kto, kiedy, co zmienił lub usunął) – tylko do odczytu, zapisują ją wyzwalacze.
-- 3. Rola „anon” (niezalogowany) nie ma żadnych uprawnień do tabel ani funkcji budżetu.
-- 4. Limity długości tekstów (ochrona przed zapchaniem bazy) – tylko dla nowych i zmienianych wierszy.
--
-- AWARYJNIE (zgubiony telefon z kodami): README.md → „Utrata dostępu do MFA”.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Ustawienia bezpieczeństwa: jeden wiersz dla całej instalacji
-- ---------------------------------------------------------------------
create table if not exists public.ustawienia_bezpieczenstwa (
    id boolean primary key default true check (id),           -- zawsze jeden wiersz
    wymagaj_mfa boolean not null default false,
    zmienil uuid references auth.users on delete set null,
    zmieniono timestamptz not null default now()
);
alter table public.ustawienia_bezpieczenstwa enable row level security;
revoke all on table public.ustawienia_bezpieczenstwa from anon, authenticated;
insert into public.ustawienia_bezpieczenstwa (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2. Dostęp do danych zależy od poziomu logowania (AAL)
--    aal2 = hasło + kod MFA; aal1 = samo hasło.
--    Samo hasło wystarcza tylko osobie bez MFA i tylko gdy MFA nie jest wymagane od wszystkich.
-- ---------------------------------------------------------------------
create or replace function public.uzytkownik_budzetu()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_uid uuid := auth.uid();
    v_jwt jsonb := auth.jwt();
begin
    if v_uid is null or coalesce((v_jwt ->> 'is_anonymous')::boolean, false) then
        return null;
    end if;
    if v_jwt ->> 'aal' = 'aal2' then
        return v_uid;
    end if;
    if exists (select 1 from public.ustawienia_bezpieczenstwa where wymagaj_mfa)
        or exists (select 1 from auth.mfa_factors where user_id = v_uid and status = 'verified') then
        return null;    -- potrzebny kod MFA
    end if;
    return v_uid;
end;
$$;

-- Stan zabezpieczeń zalogowanej osoby (aplikacja pyta o niego tuż po zalogowaniu):
--   aal         – obecny poziom sesji ('aal1' albo 'aal2'),
--   ma_mfa      – czy osoba ma potwierdzony drugi składnik,
--   wymagaj_mfa – czy MFA jest wymagane od wszystkich,
--   dostep      – czy w tej sesji widzi dane (false = trzeba podać kod albo włączyć MFA).
create or replace function public.stan_bezpieczenstwa()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_uid uuid := auth.uid();
begin
    if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
        raise exception 'Wymaga zalogowania' using errcode = '28000';
    end if;
    return jsonb_build_object(
        'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
        'ma_mfa', exists (select 1 from auth.mfa_factors where user_id = v_uid and status = 'verified'),
        'wymagaj_mfa', coalesce((select wymagaj_mfa from public.ustawienia_bezpieczenstwa), false),
        'dostep', public.uzytkownik_budzetu() is not null
    );
end;
$$;

-- Włączenie/wyłączenie „wymagaj MFA od wszystkich”: osoba z budżetu wspólnego zalogowana kodem MFA
-- (nie da się więc zablokować samego siebie).
create or replace function public.ustaw_wymagaj_mfa(p_wymagaj boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
    if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' or public.uzytkownik_budzetu() is null then
        raise exception 'Najpierw włącz weryfikację dwuetapową na swoim koncie i zaloguj się kodem.' using errcode = '42501';
    end if;
    if not public.czy_czlonek_budzetu() then
        raise exception 'To ustawienie zmienia osoba z budżetu wspólnego.' using errcode = '42501';
    end if;
    if p_wymagaj is null then
        raise exception 'Brak wartości ustawienia' using errcode = '22023';
    end if;
    insert into public.ustawienia_bezpieczenstwa (id, wymagaj_mfa, zmienil, zmieniono)
    values (true, p_wymagaj, auth.uid(), now())
    on conflict (id) do update
        set wymagaj_mfa = excluded.wymagaj_mfa, zmienil = excluded.zmienil, zmieniono = excluded.zmieniono;
    return public.stan_bezpieczenstwa();
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Historia zmian
--    owner_id jak w tabelach budżetu (NULL = wspólny). Wpisy dodają tylko wyzwalacze;
--    nikt z aplikacji nie może ich zmienić ani usunąć. Odczyt: funkcja historia_zmian_lista().
-- ---------------------------------------------------------------------
create table if not exists public.historia_zmian (
    id bigint generated always as identity primary key,
    owner_id uuid references auth.users on delete cascade,
    kto uuid references auth.users on delete set null,
    kiedy timestamptz not null default now(),
    tabela text not null,
    operacja text not null check (operacja in ('INSERT', 'UPDATE', 'DELETE', 'KOPIA')),
    liczba integer not null default 1,      -- ile wierszy obejmuje wpis (import = wiele)
    wiersz_id text,                         -- id wiersza (gdy wpis dotyczy jednego wiersza)
    zmiany jsonb                            -- INSERT/DELETE: wiersz; UPDATE: {pole: [stare, nowe]}
);
create index if not exists historia_zmian_budzet_idx on public.historia_zmian (owner_id, kiedy desc);
alter table public.historia_zmian enable row level security;
revoke all on table public.historia_zmian from anon, authenticated;

-- Jeden wyzwalacz na instrukcję (nie na wiersz): import 500 transakcji = jeden wpis „dodano 500”.
create or replace function public.zapisz_historie()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_kto uuid := auth.uid();
begin
    -- wczytanie kopii zapisuje jeden wpis zbiorczy zamiast tysięcy
    if coalesce(current_setting('budzet.bez_historii', true), '') = 'on' then
        return null;
    end if;

    if tg_op = 'INSERT' then
        insert into public.historia_zmian (owner_id, kto, tabela, operacja, liczba, wiersz_id, zmiany)
        select g.owner_id, v_kto, tg_table_name, 'INSERT', g.n,
               case when g.n = 1 then g.klucz end,
               case when g.n = 1 then g.wiersz end
          from (select (to_jsonb(r) ->> 'owner_id')::uuid as owner_id,
                       count(*)::int as n,
                       min(coalesce(to_jsonb(r) ->> 'id', to_jsonb(r) ->> 'user_id')) as klucz,
                       (array_agg(to_jsonb(r)))[1] as wiersz
                  from nowe r
                 group by 1) g;

    elsif tg_op = 'DELETE' then
        insert into public.historia_zmian (owner_id, kto, tabela, operacja, liczba, wiersz_id, zmiany)
        select g.owner_id, v_kto, tg_table_name, 'DELETE', g.n,
               case when g.n = 1 then g.klucz end,
               case when g.n = 1 then g.wiersz end
          from (select (to_jsonb(r) ->> 'owner_id')::uuid as owner_id,
                       count(*)::int as n,
                       min(coalesce(to_jsonb(r) ->> 'id', to_jsonb(r) ->> 'user_id')) as klucz,
                       (array_agg(to_jsonb(r)))[1] as wiersz
                  from stare r
                 group by 1) g;

    else -- UPDATE: tylko zmienione pola, osobny wpis na wiersz
        insert into public.historia_zmian (owner_id, kto, tabela, operacja, liczba, wiersz_id, zmiany)
        select (n.j ->> 'owner_id')::uuid, v_kto, tg_table_name, 'UPDATE', 1, n.klucz, d.zmiany
          from (select to_jsonb(r) as j, coalesce(to_jsonb(r) ->> 'id', to_jsonb(r) ->> 'user_id') as klucz from nowe r) n
          join (select to_jsonb(r) as j, coalesce(to_jsonb(r) ->> 'id', to_jsonb(r) ->> 'user_id') as klucz from stare r) s
            on s.klucz = n.klucz
         cross join lateral (
               select jsonb_object_agg(k.pole, jsonb_build_array(s.j -> k.pole, n.j -> k.pole)) as zmiany
                 from jsonb_object_keys(n.j) as k(pole)
                where (s.j -> k.pole) is distinct from (n.j -> k.pole)
                  and k.pole not in ('zmieniono')
             ) d
         where d.zmiany is not null;
    end if;
    return null;
end;
$$;
revoke all on function public.zapisz_historie() from public, anon, authenticated;

do $$
declare
    t text;
begin
    foreach t in array array['transakcje', 'rules', 'goals', 'categories', 'imports',
                             'ustawienia_budzetu', 'budzet_czlonkowie', 'ustawienia_bezpieczenstwa'] loop
        execute format('drop trigger if exists historia_insert on public.%I', t);
        execute format('drop trigger if exists historia_update on public.%I', t);
        execute format('drop trigger if exists historia_delete on public.%I', t);
        execute format('create trigger historia_insert after insert on public.%I
                            referencing new table as nowe
                            for each statement execute function public.zapisz_historie()', t);
        execute format('create trigger historia_update after update on public.%I
                            referencing old table as stare new table as nowe
                            for each statement execute function public.zapisz_historie()', t);
        execute format('create trigger historia_delete after delete on public.%I
                            referencing old table as stare
                            for each statement execute function public.zapisz_historie()', t);
    end loop;
end $$;

-- Odczyt historii jednego budżetu (z adresem e-mail osoby, która zmieniała)
create or replace function public.historia_zmian_lista(p_osobisty boolean, p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_ja uuid := public.uzytkownik_budzetu();
begin
    if v_ja is null then
        raise exception 'Wymaga zalogowania' using errcode = '28000';
    end if;
    if not coalesce(p_osobisty, false) and not public.czy_czlonek_budzetu() then
        raise exception 'Brak dostępu do budżetu wspólnego' using errcode = '42501';
    end if;
    return (
        select coalesce(jsonb_agg(jsonb_build_object(
                   'id', h.id, 'kiedy', h.kiedy, 'tabela', h.tabela, 'operacja', h.operacja,
                   'liczba', h.liczba, 'wiersz_id', h.wiersz_id, 'zmiany', h.zmiany,
                   'email', u.email, 'to_ja', h.kto = v_ja) order by h.kiedy desc, h.id desc), '[]'::jsonb)
          from (select * from public.historia_zmian
                 where case when coalesce(p_osobisty, false) then owner_id = v_ja else owner_id is null end
                 order by kiedy desc, id desc
                 limit least(greatest(coalesce(p_limit, 100), 1), 500)) h
          left join auth.users u on u.id = h.kto
    );
end;
$$;

-- Sprzątanie starej historii – tylko w SQL Editor, np.: select public.usun_stara_historie(365);
create or replace function public.usun_stara_historie(p_dni integer default 365)
returns bigint
language sql
security definer
set search_path = ''
as $$
    with usuniete as (
        delete from public.historia_zmian where kiedy < now() - make_interval(days => greatest(p_dni, 30)) returning 1
    )
    select count(*) from usuniete
$$;
revoke all on function public.usun_stara_historie(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Wczytanie kopii: sprawdzenie MFA (przez uzytkownik_budzetu) + jeden wpis w historii
-- ---------------------------------------------------------------------
create or replace function public.wczytaj_kopie(p_osobisty boolean, p_tabele jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_ja uuid := public.uzytkownik_budzetu();
    v_wlasciciel uuid;
    -- Usuwanie od tabel, które wskazują na inne (transakcje -> cele, importy), wstawianie odwrotnie
    v_usuwanie text[] := array['transakcje', 'rules', 'goals', 'categories', 'imports', 'ustawienia_budzetu'];
    v_wstawianie text[] := array['imports', 'categories', 'goals', 'rules', 'transakcje', 'ustawienia_budzetu'];
    v_tabela text;
    v_wiersze jsonb;
    v_klucze text[];
    v_grupa jsonb;
    v_kolumny text;
    v_wartosci text;
    v_licznik text;
    v_n bigint;
    v_razem bigint;
    v_wynik jsonb := '{}'::jsonb;
begin
    if v_ja is null then
        raise exception 'Wczytanie kopii wymaga zalogowania' using errcode = '28000';
    end if;
    if not p_osobisty and not public.czy_czlonek_budzetu() then
        raise exception 'Brak dostępu do budżetu wspólnego' using errcode = '42501';
    end if;
    if p_tabele is null or jsonb_typeof(p_tabele) <> 'object' then
        raise exception 'Nieprawidłowa kopia: brak tabel' using errcode = '22023';
    end if;
    v_wlasciciel := case when p_osobisty then v_ja end;
    perform set_config('budzet.bez_historii', 'on', true);

    -- 1. Usunięcie obecnych danych budżetu – tylko z tabel, które są w kopii
    foreach v_tabela in array v_usuwanie loop
        continue when not (p_tabele ? v_tabela);
        if jsonb_typeof(p_tabele -> v_tabela) <> 'array' then
            raise exception 'Nieprawidłowa kopia: tabela % nie jest listą', v_tabela using errcode = '22023';
        end if;
        if exists (select 1 from jsonb_array_elements(p_tabele -> v_tabela) w where jsonb_typeof(w.value) <> 'object') then
            raise exception 'Nieprawidłowa kopia: w tabeli % jest wiersz, który nie jest obiektem', v_tabela using errcode = '22023';
        end if;
        execute format('delete from public.%I where owner_id is not distinct from $1', v_tabela) using v_wlasciciel;
    end loop;

    -- 2. Wstawienie wierszy z kopii
    foreach v_tabela in array v_wstawianie loop
        continue when not (p_tabele ? v_tabela);
        v_wiersze := p_tabele -> v_tabela;
        if jsonb_array_length(v_wiersze) = 0 then
            v_wynik := v_wynik || jsonb_build_object(v_tabela, 0);
            continue;
        end if;

        -- Wiersze o tym samym zestawie pól wstawiamy razem (w kopii z aplikacji to jedna grupa).
        -- Pole, którego wiersz nie ma, dostaje wartość domyślną z bazy, a nie NULL.
        v_razem := 0;
        for v_klucze, v_grupa in
            select klucze, jsonb_agg(wiersz)
              from (select w.value as wiersz,
                           array(select k from jsonb_object_keys(w.value) k order by k) as klucze
                      from jsonb_array_elements(v_wiersze) w) s
             group by klucze
        loop
            select string_agg(quote_ident(a.attname), ', ' order by a.attnum),
                   string_agg(case when a.attname = 'owner_id' then '$2' else 'r.' || quote_ident(a.attname) end, ', ' order by a.attnum)
              into v_kolumny, v_wartosci
              from pg_attribute a
             where a.attrelid = format('public.%I', v_tabela)::regclass
               and a.attnum > 0
               and not a.attisdropped
               and a.attgenerated = ''
               and (a.attname = 'owner_id' or a.attname = any(v_klucze));

            execute format(
                'insert into public.%I (%s) overriding system value select %s from jsonb_populate_recordset(null::public.%I, $1) r',
                v_tabela, v_kolumny, v_wartosci, v_tabela)
              using v_grupa, v_wlasciciel;
            get diagnostics v_n = row_count;
            v_razem := v_razem + v_n;
        end loop;
        v_wynik := v_wynik || jsonb_build_object(v_tabela, v_razem);

        -- 3. Licznik id nie może zostać poniżej wczytanych id (tylko rośnie)
        v_licznik := pg_get_serial_sequence(format('public.%I', v_tabela), 'id');
        if v_licznik is not null then
            begin
                execute format(
                    'select setval(%L, greatest((select last_value from %s), (select coalesce(max(id), 1) from public.%I)))',
                    v_licznik, v_licznik, v_tabela);
            exception when insufficient_privilege then
                null;
            end;
        end if;
    end loop;

    perform set_config('budzet.bez_historii', '', true);
    -- Wpis zbiorczy (funkcja pomocnicza security definer – tabela historii nie ma uprawnień dla aplikacji)
    perform public.zapisz_wczytanie_kopii(p_osobisty, v_wynik);
    return v_wynik;
end;
$$;

create or replace function public.zapisz_wczytanie_kopii(p_osobisty boolean, p_wynik jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_ja uuid := public.uzytkownik_budzetu();
begin
    if v_ja is null then
        raise exception 'Wymaga zalogowania' using errcode = '28000';
    end if;
    if not p_osobisty and not public.czy_czlonek_budzetu() then
        raise exception 'Brak dostępu do budżetu wspólnego' using errcode = '42501';
    end if;
    insert into public.historia_zmian (owner_id, kto, tabela, operacja, liczba, zmiany)
    values (case when p_osobisty then v_ja end, v_ja, 'kopia', 'KOPIA',
            coalesce((select sum(value::bigint) from jsonb_each_text(p_wynik)), 0)::int, p_wynik);
end;
$$;

comment on function public.wczytaj_kopie(boolean, jsonb) is
    'Zastępuje dane jednego budżetu (wspólnego albo osobistego) danymi z kopii zapasowej – wszystko albo nic.';

-- ---------------------------------------------------------------------
-- 5. Uprawnienia: anon (niezalogowany) nie ma nic; authenticated tylko to, czego używa aplikacja
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from public;

-- TRUNCATE omija RLS – aplikacja go nie używa
revoke truncate, references, trigger on table
    public.transakcje, public.rules, public.goals, public.categories, public.imports, public.ustawienia_budzetu
    from authenticated;

revoke all on function public.uzytkownik_budzetu() from public, anon;
revoke all on function public.stan_bezpieczenstwa() from public, anon;
revoke all on function public.ustaw_wymagaj_mfa(boolean) from public, anon;
revoke all on function public.historia_zmian_lista(boolean, integer) from public, anon;
revoke all on function public.wczytaj_kopie(boolean, jsonb) from public, anon;
revoke all on function public.zapisz_wczytanie_kopii(boolean, jsonb) from public, anon;
grant execute on function public.uzytkownik_budzetu() to authenticated;
grant execute on function public.stan_bezpieczenstwa() to authenticated;
grant execute on function public.ustaw_wymagaj_mfa(boolean) to authenticated;
grant execute on function public.historia_zmian_lista(boolean, integer) to authenticated;
grant execute on function public.wczytaj_kopie(boolean, jsonb) to authenticated;
grant execute on function public.zapisz_wczytanie_kopii(boolean, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Limity danych (NOT VALID = istniejące wiersze nie są sprawdzane, tylko nowe i zmieniane).
--    Limity są dużo wyższe niż w formularzach aplikacji – chronią przed zapchaniem bazy.
-- ---------------------------------------------------------------------
do $$
declare
    o record;
begin
    for o in select * from (values
        ('transakcje', 'transakcje_limit_kontrahent', 'counterparty', 'char_length(counterparty) <= 500'),
        ('transakcje', 'transakcje_limit_tytul', 'title', 'char_length(title) <= 1000'),
        ('transakcje', 'transakcje_limit_notatka', 'note', 'char_length(note) <= 2000'),
        ('transakcje', 'transakcje_limit_kategoria', 'category_manual', 'char_length(category_manual) <= 100'),
        ('transakcje', 'transakcje_limit_konto', 'account_number', 'char_length(account_number) <= 64'),
        ('transakcje', 'transakcje_limit_podzial', 'splits',
            'splits is null or (jsonb_typeof(splits) = ''array'' and jsonb_array_length(splits) <= 10)'),
        ('transakcje', 'transakcje_limit_paragon', 'receipt_path', 'char_length(receipt_path) <= 300'),
        ('rules', 'rules_limit_fraza', 'phrase', 'char_length(phrase) <= 200'),
        ('rules', 'rules_limit_kategoria', 'category', 'char_length(category) <= 100'),
        ('goals', 'goals_limit_nazwa', 'name', 'char_length(name) <= 100'),
        ('goals', 'goals_limit_notatka', 'note', 'char_length(note) <= 2000'),
        ('goals', 'goals_limit_kolor', 'color', 'color ~ ''^#[0-9A-Fa-f]{6}$'''),
        ('categories', 'categories_limit_nazwa', 'name', 'char_length(name) <= 100'),
        ('categories', 'categories_limit_kolor', 'color', 'color ~ ''^#[0-9A-Fa-f]{6}$'''),
        ('imports', 'imports_limit_plik', 'file_name', 'char_length(file_name) <= 300')
    ) as v(tabela, nazwa, kolumna, warunek)
    loop
        continue when not exists (select 1 from information_schema.columns
                                   where table_schema = 'public' and table_name = o.tabela and column_name = o.kolumna);
        continue when exists (select 1 from pg_constraint
                               where conname = o.nazwa and conrelid = format('public.%I', o.tabela)::regclass);
        execute format('alter table public.%I add constraint %I check (%s) not valid', o.tabela, o.nazwa, o.warunek);
    end loop;
end $$;

-- Odświeżenie schematu API
notify pgrst, 'reload schema';
