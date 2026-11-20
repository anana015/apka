-- =====================================================================
-- MIGRACJA 2026-11h: CELE – OPERACJE RĘCZNE I PROGI OPROCENTOWANIA
-- Uruchom raz w Supabase: SQL Editor → New query → wklej → Run
-- (po migracjach 2026-10 … 2026-11g). Skrypt można uruchomić ponownie.
--
-- 1. goals.manual_operations – wpłaty i wypłaty celu wpisane ręcznie (nie ma ich w wyciągu
--    z konta głównego, np. subkonto zasilane z innego banku, gotówka, korekta salda):
--      [{ "id": "…", "date": "RRRR-MM-DD", "amount_gr": 12345, "note": "…" }]
--      amount_gr ze znakiem: plus = wpłata do celu, minus = wypłata z celu.
-- 2. goals.interest_tiers – 1–3 progi oprocentowania subkonta:
--      { "mode": "marginal" | "whole", "tiers": [{ "from_gr": 100000, "rate": 0.5 }, …] }
--      marginal = każda część salda ma stopę swojego progu (np. do 50 000 zł 5%, nadwyżka 1%),
--      whole    = całe saldo ma stopę najwyższego progu, do którego sięga saldo.
--    Puste (NULL) = dotychczasowe pola interest_rate / interest_threshold_gr (aplikacja zapisuje
--    w nich nadal pierwszy oprocentowany próg – starsza wersja aplikacji też coś pokaże).
-- 3. goals.keyword może być pusty: cel bez subkonta w wyciągach prowadzi się operacjami ręcznymi.
--
-- Obie kolumny są w tabeli goals, więc działają bez zmian: zasady RLS (2026-11b, 11f, 11g),
-- historia zmian (wyzwalacze 2026-11g), kopia zapasowa i jej wczytanie (wczytaj_kopie
-- wstawia kolumny po nazwach; starsza kopia bez tych pól dostaje wartości domyślne).
-- =====================================================================

alter table public.goals add column if not exists manual_operations jsonb not null default '[]'::jsonb;
alter table public.goals add column if not exists interest_tiers jsonb;

-- Cel bez numeru subkonta (tylko operacje ręczne). W bazie założonej według specyfikacji
-- kolumna mogła być NOT NULL; puste pole aplikacja zapisuje jako NULL (unikalność numeru
-- – jeśli jest – nie obejmuje wartości NULL).
alter table public.goals alter column keyword drop not null;

-- Limity (NOT VALID = sprawdzane tylko nowe i zmieniane wiersze, jak w migracji 2026-11g)
do $$
declare
    o record;
begin
    for o in select * from (values
        ('goals_limit_operacje_reczne',
            'jsonb_typeof(manual_operations) = ''array'' and jsonb_array_length(manual_operations) <= 500'),
        ('goals_limit_progi',
            'interest_tiers is null or (jsonb_typeof(interest_tiers) = ''object''
                and jsonb_typeof(interest_tiers -> ''tiers'') = ''array''
                and jsonb_array_length(interest_tiers -> ''tiers'') between 1 and 3
                and coalesce(interest_tiers ->> ''mode'', ''marginal'') in (''marginal'', ''whole''))')
    ) as v(nazwa, warunek)
    loop
        continue when exists (select 1 from pg_constraint
                               where conname = o.nazwa and conrelid = 'public.goals'::regclass);
        execute format('alter table public.goals add constraint %I check (%s) not valid', o.nazwa, o.warunek);
    end loop;
end $$;

comment on column public.goals.manual_operations is
    'Operacje ręczne celu: [{id, date, amount_gr (+ wpłata, − wypłata), note}] – spoza wyciągu konta głównego';
comment on column public.goals.interest_tiers is
    'Progi oprocentowania: {mode: marginal|whole, tiers: [{from_gr, rate}]}; NULL = interest_rate / interest_threshold_gr';

-- Odświeżenie schematu API (nowe kolumny widoczne od razu)
notify pgrst, 'reload schema';
