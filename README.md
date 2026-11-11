# Budżet domowy

Aplikacja w przeglądarce do budżetu **wspólnego** (dla dwóch lub więcej osób) i **osobistego**
(każda osoba ma własny, niewidoczny dla innych). Importuje wyciągi CSV z banku (Pekao, PKO BP, Alior),
kategoryzuje wydatki, śledzi cele oszczędnościowe. Dane są w Supabase (Postgres + logowanie),
strona jest statyczna (HTML + JS, bez budowania) – działa np. na GitHub Pages.

---

## 1. Instalacja od zera (własna kopia aplikacji)

1. **Supabase** – załóż darmowy projekt na <https://supabase.com>.
2. **Baza** – w panelu: *SQL Editor → New query*, wklej i uruchom (*Run*) kolejno pliki z katalogu `supabase/`:
   1. `migracja_2026-10_schemat_poczatkowy.sql`
   2. `migracja_2026-11.sql`
   3. `migracja_2026-11b_budzet_osobisty.sql`
   4. `migracja_2026-11c_kategorie_oszczednosci.sql`
   5. `migracja_2026-11d_notatki_paragony.sql`
   6. `migracja_2026-11e_wczytaj_kopie.sql`
   7. `migracja_2026-11f_dostep_i_ustawienia.sql`

   Każdy skrypt można bezpiecznie uruchomić ponownie.
3. **Logowanie** (*Authentication*):
   - *Sign In / Providers*: **wyłącz „Allow new users to sign up”** (konta zakłada się tylko w panelu)
     i upewnij się, że **„Anonymous sign-ins” są wyłączone**.
   - *Users → Add user → Create new user*: konto dla siebie i dla drugiej osoby (e-mail + hasło,
     zaznacz *Auto Confirm User*). Albo *Send invitation* – wtedy druga osoba dostaje e-mail i sama
     ustawia hasło w aplikacji (wymaga działającej poczty – punkt 5).
   - *URL Configuration*: **Site URL** i **Redirect URLs** = adres, pod którym działa aplikacja
     (np. `https://twoj-login.github.io/budzet/`). Bez tego linki z e-maili („Nie pamiętasz hasła?”,
     zaproszenie) nie wrócą do aplikacji.
4. **`js/config.js`** – wpisz `SUPABASE_URL` i klucz **publishable** (*Project Settings → API Keys*).
   Ten klucz może być jawny. **Nigdy nie wpisuj klucza `secret` / `service_role`** – omija on
   zabezpieczenia bazy.
5. **Hosting** – np. GitHub Pages (*Settings → Pages*, gałąź `main`, katalog główny).
6. **Pierwsze logowanie** – *Ustawienia → Osoby w budżecie wspólnym → Utwórz budżet wspólny*,
   a potem *+ Dodaj* drugą osobę po jej adresie e-mail. Budżet osobisty każda osoba ma od razu.
7. Opcjonalnie: *Ustawienia → Subkonto wypłat* – numer subkonta, z którego bank przelewa wypłaty
   z celów (osobno dla budżetu wspólnego i osobistego).

## 2. Aktualizacja istniejącej instalacji do 2026-11f

Kolejność ma znaczenie – po migracji budżet wspólny jest zamknięty, dopóki nie dodasz osób:

1. *SQL Editor*: uruchom `supabase/migracja_2026-11f_dostep_i_ustawienia.sql`.
   Pliki 2026-11, 11b i 11d też się zmieniły (ich ponowne uruchomienie po 11f nie osłabia już
   zasad dostępu) – podmień je w repozytorium, ale nie trzeba ich uruchamiać.
2. *SQL Editor*: dodaj pierwsze osoby – rozdział 3.
3. Wgraj nowe pliki aplikacji (także katalog `js/vendor/`).
4. W aplikacji: *Ustawienia → Subkonto wypłat* – wpisz numer subkonta (nie ma go już w `config.js`).
5. *Authentication → URL Configuration* – ustaw adres aplikacji (punkt 1.3), jeśli jeszcze go nie ma.

## 3. Pierwsze osoby budżetu wspólnego (instalacja, w której są już dane)

Budżetu wspólnego z danymi nie da się „utworzyć” przyciskiem w aplikacji – inaczej mógłby go przejąć
ktokolwiek, kto zaloguje się pierwszy. Pierwsze osoby dodajesz raz, w *SQL Editor*. Adresy wpisz
tylko tam – **nie zapisuj ich w plikach repozytorium**:

```sql
insert into public.budzet_czlonkowie (user_id)
select id from auth.users
 where lower(email) in (lower('pierwszy@adres.pl'), lower('drugi@adres.pl'))
on conflict (user_id) do nothing;

-- sprawdzenie: powinny być dwa wiersze
select u.email, c.dodano
  from public.budzet_czlonkowie c join auth.users u on u.id = c.user_id;
```

Później listę zmienia się już w aplikacji: *Ustawienia → Osoby w budżecie wspólnym*. Każda osoba
z listy widzi i zmienia cały budżet wspólny i może dodawać lub usuwać osoby. Ostatniej osoby usunąć
się nie da.

## 4. Hasła i e-maile

- **„Nie pamiętasz hasła?”** na ekranie logowania wysyła link (Supabase Auth). Po kliknięciu
  aplikacja pokazuje formularz nowego hasła.
- **Zmiana hasła**: *Ustawienia → Zmiana hasła* (wymaga obecnego hasła).
- **Ograniczenie wbudowanej poczty Supabase**: bez własnego serwera poczty (SMTP) Supabase wysyła
  e-maile tylko na adresy osób z zespołu organizacji w Supabase (*Organization → Team*) i tylko
  2 wiadomości na godzinę. Żeby link resetu dotarł do drugiej osoby, ustaw własny SMTP:
  *Authentication → Emails → SMTP Settings* (dowolny dostawca obsługujący SMTP).
- **Powiadomienie „hasło zostało zmienione”**: *Authentication → Emails* – szablony powiadomień
  bezpieczeństwa (np. *Password changed*), domyślnie wyłączone.
- **E-mail przy zakładaniu konta**: zamiast *Create new user* użyj *Send invitation* (punkt 1.3).

## 5. Bezpieczeństwo

Co chroni dane:

- **Zasady RLS w bazie** (migracje 2026-11b i 2026-11f): budżet wspólny widzą tylko osoby z listy,
  budżet osobisty – tylko właściciel. Tak samo pliki paragonów (folder `wspolny/` i `<id osoby>/`).
  Konta anonimowe nie mają dostępu do niczego, a sam klucz publishable (bez logowania) – też nie.
- **Brak sekretów w kodzie**: w repozytorium jest tylko adres projektu i klucz publishable.
  Numer subkonta wypłat jest w tabeli `ustawienia_budzetu` (widoczny tylko dla osób z dostępem).
- **Biblioteki w repozytorium** (`js/vendor/`, stałe wersje): klient Supabase, który widzi sesję
  logowania, nie jest ładowany z zewnętrznego serwera.

Lista kontrolna:

- [ ] *Allow new users to sign up* – wyłączone; *Anonymous sign-ins* – wyłączone.
- [ ] W `js/config.js` jest klucz **publishable**, nie `secret`.
- [ ] Do repozytorium nie trafiają wyciągi CSV, kopie zapasowe JSON ani skany (pilnuje `.gitignore`).
- [ ] Repozytorium **prywatne** albo wyczyszczona historia, jeśli kiedyś trafiły do niego dane
      (np. numer subkonta w starszych wersjach `config.js` jest nadal w historii gita).
- [ ] Hasła: co najmniej 8 znaków, inne niż w pozostałych serwisach.

Ograniczenia (świadomie zostawione):

- **Tailwind** jest ładowany z `cdn.tailwindcss.com` – to jedyny skrypt spoza repozytorium.
  Kolejny krok: zbudować plik CSS narzędziem Tailwind i usunąć ten skrypt.
- Kto ma dostęp do skrzynki e-mail osoby, może przez „Nie pamiętasz hasła?” przejąć jej konto –
  chroń też konto pocztowe (silne hasło, weryfikacja dwuetapowa).
- Osoby z listy budżetu wspólnego ufają sobie nawzajem: każda może zmienić dane i listę osób.

## 6. Struktura

```
index.html            szkielet strony
css/app.css           wygląd
js/config.js          adres Supabase, klucz publishable, kategorie startowe
js/db.js              dostęp do bazy, budżet wspólny / osobisty, sprawdzanie dostępu
js/rules.js, calc.js  klasyfikacja i obliczenia (bez interfejsu)
js/views/*.js         ekrany (konto.js: logowanie, hasło, osoby w budżecie wspólnym)
js/vendor/            biblioteki w stałych wersjach (README z wersjami i sumami kontrolnymi)
supabase/*.sql        migracje bazy – uruchamiane ręcznie w SQL Editor
```
