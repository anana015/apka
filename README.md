# Budżet domowy

Aplikacja w przeglądarce do budżetu **wspólnego** (dla dwóch lub więcej osób) i **osobistego**
(każda osoba ma własny, niewidoczny dla innych). Importuje wyciągi CSV z banku (Pekao, PKO BP, Alior),
kategoryzuje wydatki, śledzi cele oszczędnościowe. Dane są w Supabase (Postgres + logowanie),
strona jest statyczna (HTML + JS, bez budowania kodu JS) – działa np. na GitHub Pages.
Można ją zainstalować jako aplikację (PWA) na iPhonie, Androidzie i w Windows; bez internetu
pokazuje ostatnio pobrane dane (tylko podgląd).

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
   8. `migracja_2026-11g_bezpieczenstwo.sql`
   9. `migracja_2026-11h_cele_operacje_progi.sql`

   Każdy skrypt można bezpiecznie uruchomić ponownie.
3. **Logowanie** (*Authentication*):
   - *Sign In / Providers*: **wyłącz „Allow new users to sign up”** (konta zakłada się tylko w panelu)
     i upewnij się, że **„Anonymous sign-ins” są wyłączone**.
   - *Users → Add user → Create new user*: konto dla siebie i dla drugiej osoby (e-mail + hasło,
     zaznacz *Auto Confirm User*). Albo *Send invitation* – wtedy druga osoba dostaje e-mail i sama
     ustawia hasło w aplikacji (wymaga działającej poczty – punkt 5).
   - *Multi-Factor*: **TOTP – Enabled** (domyślnie włączone; dostępne na darmowym planie).
   - *Sign In / Providers → Email*: **minimalna długość hasła 12** i wymagane cyfry + litery
     (aplikacja też wymaga 12 znaków).
   - *URL Configuration*: **Site URL** i **Redirect URLs** = adres, pod którym działa aplikacja
     (np. `https://twoj-login.github.io/budzet/`). Bez tego linki z e-maili („Nie pamiętasz hasła?”,
     zaproszenie) nie wrócą do aplikacji.
4. **`js/config.js`** – wpisz `SUPABASE_URL` i klucz **publishable** (*Project Settings → API Keys*).
   Ten klucz może być jawny. **Nigdy nie wpisuj klucza `secret` / `service_role`** – omija on
   zabezpieczenia bazy.
5. **Hosting** – np. GitHub Pages (*Settings → Pages*, gałąź `main`, katalog główny). Wgraj wszystkie
   pliki z repozytorium, także `sw.js`, `manifest.webmanifest`, `icons/` i zbudowany `css/tailwind.css`
   (katalogu `node_modules/` nie wgrywaj). Aplikacja musi działać przez **HTTPS** – inaczej nie
   zadziała tryb offline ani instalacja.
6. **Pierwsze logowanie** – *Ustawienia → Osoby w budżecie wspólnym → Utwórz budżet wspólny*,
   a potem *+ Dodaj* drugą osobę po jej adresie e-mail. Budżet osobisty każda osoba ma od razu.
7. Opcjonalnie: *Ustawienia → Subkonto wypłat* – numer subkonta, z którego bank przelewa wypłaty
   z celów (osobno dla budżetu wspólnego i osobistego).

## 2. Aktualizacja istniejącej instalacji

### Do wersji 2026-11h (cele: operacje ręczne, progi i promocje oprocentowania)

1. *SQL Editor*: uruchom `supabase/migracja_2026-11h_cele_operacje_progi.sql` (można ponownie).
   Dodaje do tabeli `goals` kolumny `manual_operations` i `interest_tiers`, a numer subkonta
   (`keyword`) staje się opcjonalny. Bez migracji zapis celu kończy się komunikatem z nazwą skryptu.
2. `npm run build:css` (nowe klasy w formularzu celu), potem wgraj zmienione pliki: `index.html`,
   `css/tailwind.css`, `js/config.js`, `js/state.js`, `js/calc.js`, `js/views/cele.js`,
   `js/views/statystyki.js`, `js/views/historia.js`.
3. Istniejące cele działają bez zmian: dotychczasowe „X% od nadwyżki ponad Y zł” to jeden próg.

### Do wersji 2026-11g (bezpieczeństwo)

1. *SQL Editor*: uruchom `supabase/migracja_2026-11g_bezpieczenstwo.sql` (można ponownie).
2. Wgraj wszystkie pliki – nowe: `js/bezpieczenstwo.js`, `js/szyfrowanie.js`, `js/views/historia.js`,
   `css/czcionki.css`, katalog `fonts/`, `_headers`.
3. W aplikacji każda osoba: *Ustawienia → Bezpieczeństwo → Włącz weryfikację dwuetapową*.
   Gdy obie osoby mają MFA – włącz **„Wymagaj od wszystkich osób”**.
4. Lista kontrolna w panelu Supabase – rozdział 5.

### Do wersji 2026-11f (dostęp i ustawienia)

Kolejność ma znaczenie – po migracji budżet wspólny jest zamknięty, dopóki nie dodasz osób:

1. *SQL Editor*: uruchom `supabase/migracja_2026-11f_dostep_i_ustawienia.sql`.
   Pliki 2026-11, 11b i 11d też się zmieniły (ich ponowne uruchomienie po 11f nie osłabia już
   zasad dostępu) – podmień je w repozytorium, ale nie trzeba ich uruchamiać.
2. *SQL Editor*: dodaj pierwsze osoby – rozdział 3.
3. Wgraj nowe pliki aplikacji (także katalog `js/vendor/`).
4. W aplikacji: *Ustawienia → Subkonto wypłat* – wpisz numer subkonta (nie ma go już w `config.js`).
5. *Authentication → URL Configuration* – ustaw adres aplikacji (punkt 1.3), jeśli jeszcze go nie ma.

### Do wersji 2026-11-13 (PWA, offline, CSP) – bez zmian w bazie

1. Wgraj wszystkie pliki. Nowe: `sw.js`, `manifest.webmanifest`, `icons/`, `css/tailwind.css`,
   `js/zdarzenia.js`, `js/offline.js`, `js/nawigacja.js`, `js/pwa.js`.
2. Otwórz aplikację i odśwież stronę raz – service worker zapisze pliki do pracy bez internetu.
3. Instalacja: iPhone – Safari → *Udostępnij → Do ekranu początkowego*; Android / Chrome / Edge –
   ikona instalacji w pasku adresu albo menu → *Zainstaluj aplikację*.

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
- **Zmiana hasła**: *Ustawienia → Zmiana hasła* (wymaga obecnego hasła, a przy włączonym MFA –
  także kodu z aplikacji). Minimum **12 znaków**.
- **Ograniczenie wbudowanej poczty Supabase**: bez własnego serwera poczty (SMTP) Supabase wysyła
  e-maile tylko na adresy osób z zespołu organizacji w Supabase (*Organization → Team*) i tylko
  2 wiadomości na godzinę. Żeby link resetu dotarł do drugiej osoby, ustaw własny SMTP:
  *Authentication → Emails → SMTP Settings* (dowolny dostawca obsługujący SMTP).
- **Powiadomienie „hasło zostało zmienione”**: *Authentication → Emails* – szablony powiadomień
  bezpieczeństwa (np. *Password changed*), domyślnie wyłączone.
- **E-mail przy zakładaniu konta**: zamiast *Create new user* użyj *Send invitation* (punkt 1.3).

## 5. Bezpieczeństwo

Co chroni dane:

- **Zasady RLS w bazie** (migracje 2026-11b, 11f i 11g): budżet wspólny widzą tylko osoby z listy,
  budżet osobisty – tylko właściciel. Tak samo pliki paragonów (folder `wspolny/` i `<id osoby>/`).
  Konta anonimowe i rola `anon` (sam klucz publishable, bez logowania) nie mają żadnych uprawnień.
- **Weryfikacja dwuetapowa (MFA, TOTP)** – *Ustawienia → Bezpieczeństwo*. Sprawdza ją **baza**, nie
  tylko aplikacja: funkcja `uzytkownik_budzetu()` (na niej opierają się wszystkie zasady RLS, funkcje
  budżetu wspólnego, wczytanie kopii i paragony) zwraca brak dostępu, gdy osoba ma MFA, a sesja
  nie została potwierdzona kodem (`aal1`). Wykradzione hasło nie wystarczy do odczytu danych –
  nawet z pominięciem aplikacji, wprost przez API.
  **„Wymagaj od wszystkich osób”**: osoba bez MFA po zalogowaniu musi je najpierw włączyć.
- **Automatyczne wylogowanie** po bezczynności (domyślnie 15 min; 5/15/30/60 min albo nigdy –
  *Ustawienia → Bezpieczeństwo*, osobno na każdym urządzeniu). Liczy też czas zamkniętej karty:
  po powrocie po limicie aplikacja wylogowuje i usuwa dane z urządzenia, zanim cokolwiek pokaże.
  (Supabase ma limit długości sesji tylko w planie Pro – to jego zamiennik).
- **Wylogowanie**: przycisk w nagłówku – to urządzenie; *Ustawienia → Bezpieczeństwo → Wyloguj na
  wszystkich urządzeniach* – unieważnia sesje wszędzie (zgubiony telefon). Inne urządzenia tracą
  dostęp najpóźniej po wygaśnięciu bieżącego tokenu (domyślnie 1 h).
- **Historia zmian** (*Ustawienia → Historia zmian*): kto i kiedy dodał, zmienił lub usunął
  transakcje, reguły, cele, kategorie, importy, ustawienia i osoby. Zapisują ją wyzwalacze w bazie;
  z aplikacji nie da się jej zmienić ani usunąć. Import i wczytanie kopii = jeden wpis zbiorczy.
  Sprzątanie starych wpisów (SQL Editor): `select public.usun_stara_historie(365);`
- **Szyfrowane kopie zapasowe**: pole *Hasło do kopii* przy „Zapisz kopię” – plik `.szyfr.json`
  zaszyfrowany AES-256-GCM, klucz z hasła przez PBKDF2-SHA256 (600 000 iteracji, wg OWASP).
  Zgubione hasło = kopii nie da się odczytać. Plik „przed wczytaniem” dostaje to samo hasło.
- **Content-Security-Policy** (`<meta>` w `index.html`): tylko skrypty, style i czcionki z tej
  strony, połączenia tylko do `*.supabase.co`. W kodzie nie ma `onclick="…"` – akcje opisują
  atrybuty `data-klik` itd., wykonuje je `js/zdarzenia.js` (bez `eval`).
- **Czcionki w repozytorium** (`fonts/`, licencja OFL) zamiast Google Fonts – przeglądarka nie
  wysyła adresu IP ani adresu strony do zewnętrznych serwerów.
- **Ochrona przed osadzeniem w ramce** (clickjacking): `js/bezpieczenstwo.js` ukrywa stronę
  otwartą w cudzej ramce; na hostingu z nagłówkami – `_headers` (`frame-ancestors 'none'`).
- **Limity w bazie**: długość tekstów, liczba części podziału, liczba operacji ręcznych celu (500)
  i progów oprocentowania (3), format koloru (CHECK) – chronią przed zapchaniem bazy przez kogoś
  z dostępem do API. `TRUNCATE` (omija RLS) – odebrany.
- **Brak sekretów w kodzie**: w repozytorium jest tylko adres projektu i klucz publishable.
- **Biblioteki w repozytorium** (`js/vendor/`, stałe wersje i sumy kontrolne).
- **Dane offline**: kopia budżetu w IndexedDB – osobno dla każdej osoby; **wylogowanie (także
  automatyczne) ją usuwa**.

Lista kontrolna – panel Supabase (darmowy plan):

- [ ] *Authentication → Sign In / Providers*: *Allow new users to sign up* – **wyłączone**;
      *Anonymous sign-ins* – **wyłączone**; e-mail: *Confirm email* – włączone.
- [ ] *Authentication → Sign In / Providers → Email*: minimalna długość hasła **12**, wymagane
      litery i cyfry. (*Leaked password protection* – tylko plan Pro.)
- [ ] *Authentication → Multi-Factor*: TOTP – **Enabled**. Każda osoba włącza MFA w aplikacji,
      potem „Wymagaj od wszystkich osób”.
- [ ] *Authentication → Rate Limits*: zostaw domyślne (chronią logowanie przed zgadywaniem haseł).
- [ ] *Project Settings → JWT Keys*: migracja na **asymetryczne klucze podpisu** (JWT signing keys)
      i unieważnienie starego sekretu HS256, gdy panel to proponuje.
- [ ] *Advisors → Security Advisor*: zero ostrzeżeń (szczególnie „RLS disabled”,
      „Function search_path mutable”). Po migracji 11g uruchom ponownie.
- [ ] *Integrations / Database → Extensions*: wyłącz nieużywane (np. `pg_graphql`, jeśli nie
      korzystasz z GraphQL – zmniejsza powierzchnię API). *Realtime* – aplikacja go nie używa.
- [ ] *Database → Network restrictions* / *SSL enforcement*: wymuszaj SSL; ogranicz bezpośredni
      dostęp do bazy do swoich adresów IP (aplikacja łączy się przez API, nie bezpośrednio).
- [ ] **Konto w Supabase, GitHub i skrzynka e-mail**: każde z MFA. Kto przejmie konto Supabase albo
      e-mail (reset hasła), ominie wszystkie zabezpieczenia aplikacji.
- [ ] W `js/config.js` jest klucz **publishable**, nie `secret`.
- [ ] Do repozytorium nie trafiają wyciągi CSV, kopie zapasowe ani skany (pilnuje `.gitignore`).
- [ ] Repozytorium **prywatne** albo wyczyszczona historia, jeśli kiedyś trafiły do niego dane.
- [ ] Kopie zapasowe zapisuj **z hasłem** i trzymaj poza aplikacją.

### Utrata dostępu do MFA (zgubiony telefon)

1. Jeśli druga osoba ma dostęp: wyłącza w aplikacji „Wymagaj od wszystkich osób”.
2. Administrator w panelu Supabase: *Authentication → Users → (osoba) → usuń składnik MFA*
   (*Factors / Remove*). Albo w *SQL Editor*:
   ```sql
   -- gdy MFA było wymagane od wszystkich, a nikt nie może się zalogować
   update public.ustawienia_bezpieczenstwa set wymagaj_mfa = false;
   -- usunięcie składników MFA jednej osoby (adres wpisz tylko tutaj, nie w repozytorium)
   delete from auth.mfa_factors where user_id = (select id from auth.users where lower(email) = lower('adres@osoby.pl'));
   ```
3. Osoba loguje się samym hasłem i od razu włącza MFA na nowym telefonie.

### Hosting z nagłówkami

GitHub Pages nie pozwala ustawić nagłówków HTTP, więc część zabezpieczeń jest w `<meta>` i w JS.
Na **Cloudflare Pages** albo **Netlify** (oba mają darmowe plany) plik `_headers` dodaje:
`frame-ancestors 'none'`, `X-Frame-Options`, `Strict-Transport-Security`, `X-Content-Type-Options`,
`Permissions-Policy`. Po przeniesieniu zmień adres w *Authentication → URL Configuration*.

Ograniczenia (świadomie zostawione):

- `style-src 'unsafe-inline'` w CSP – potrzebne dla atrybutów `style="…"` (kolory kategorii,
  szerokości pasków). Nie pozwala uruchamiać skryptów.
- Kto ma dostęp do skrzynki e-mail osoby **bez MFA**, może przez „Nie pamiętasz hasła?” przejąć
  jej konto. Z włączonym MFA link z e-maila nie daje dostępu do danych – potrzebny jest też kod.
- Osoby z listy budżetu wspólnego ufają sobie nawzajem: każda może zmienić dane i listę osób
  (historia zmian pokazuje, kto co zrobił).
- Dane w bazie nie są szyfrowane po stronie aplikacji (end-to-end) – Supabase szyfruje dyski
  i połączenia, ale administrator projektu widzi dane. Szyfrowanie E2E wyłączyłoby wyszukiwanie,
  statystyki w bazie i wczytywanie kopii po stronie serwera.

## 6. Praca bez internetu (PWA)

- **Pliki aplikacji** zapisuje `sw.js`: najpierw sieć (nowa wersja od razu po wgraniu),
  a bez sieci – kopia z pamięci podręcznej.
- **Dane**: po każdym pobraniu i każdej zmianie kopia otwartego budżetu trafia do IndexedDB
  (`js/offline.js`). Bez internetu aplikacja startuje z tej kopii: szary nagłówek, napis
  „Offline · dane z …”, zapisy są zablokowane z komunikatem. Po powrocie sieci dane pobierają się same.
- **„Wstecz”** w telefonie wraca do poprzedniego widoku (np. ze szczegółów celu do listy) –
  każdy widok ma adres `#pulpit`, `#cele/<id>`, `#ustawienia/reguly` itd. (`js/nawigacja.js`).
- Po powrocie do karty po ponad 5 minutach dane odświeżają się same (druga osoba mogła coś zmienić).

## 7. Ułatwienia w codziennej pracy

- **Cofnij** – po usunięciu transakcji, celu, kategorii albo reguły, po zmianie kategorii oraz po
  dodaniu lub usunięciu operacji ręcznej celu komunikat ma przycisk *Cofnij* (co najmniej 8 s).
  Cofnięcie zmiany kategorii cofa też regułę utworzoną przez „Zapamiętaj dla podobnych”. Plik
  paragonu usuwanej transakcji jest kasowany dopiero, gdy minie czas na cofnięcie (jeśli w tym
  czasie zamkniesz kartę, plik zostaje w magazynie).
- **Komunikaty** są widoczne tym dłużej, im dłuższy tekst (2,6–10 s); najechanie kursorem albo
  fokus wstrzymuje znikanie, *Escape* zamyka.
- **Wyszukiwarka w Transakcjach** – kontrahent, tytuł, notatka, data, kategoria, cel albo kwota
  („123,45”, „123.45”); szuka we wszystkich miesiącach, łączy się z filtrami „Do przypisania” itd.
- **Prognoza limitu** (Pulpit, bieżący miesiąc, od 5. dnia): „W tym tempie ok. X zł do końca
  miesiąca – o Y zł ponad limit”. Liczona liniowo z dotychczasowych wydatków; pomija kategorie
  oznaczone jako wydatek stały (np. czynsz), bo płaci się je raz w miesiącu.
- **Operacje ręczne celu** (*Cele → szczegóły → + Wpłata / wypłata ręczna*): wpłaty i wypłaty,
  których nie ma w wyciągu konta głównego (subkonto zasilane z innego banku, gotówka, korekta).
  Zmieniają saldo celu, średnią wpłat, odsetki i wykres „Saldo subkont”, ale nie przychody, wydatki
  ani „Odłożone” na Pulpicie. Cel może nie mieć numeru subkonta – wtedy prowadzi się go tylko ręcznie.
- **Progi oprocentowania** (formularz celu, 1–3 progi): „każda część salda osobno” (np. do
  50 000 zł 5%, nadwyżka 1%) albo „całe saldo według progu”. Pod progami – przykład odsetek
  rocznie dla kwoty celu; w szczegółach celu – kafelek „Odsetki rocznie” ze stopą efektywną.
- **Oprocentowanie promocyjne** (formularz celu): stopa przez 1–36 miesięcy od wybranego dnia,
  opcjonalnie do limitu kwoty (nadwyżka ma zwykłą stopę z progów). Pod formularzem – ile promocja
  da więcej niż zwykłe progi. Karta celu pokazuje datę końca promocji, ostrzega na 30 dni przed nią
  i jeszcze 30 dni po niej („sprawdź, gdzie przenieść środki”). Promocja jest zapisana w
  `interest_tiers.promo` – nie wymaga nowej migracji.

## 8. Praca nad kodem

Potrzebny jest Node.js 18+ (tylko do budowania CSS i testów – aplikacja go nie wymaga).

```bash
npm install          # Tailwind CSS i PapaParse (do testów)
npm run build:css    # css/tailwind.src.css -> css/tailwind.css (po zmianie klas w HTML/JS)
npm run watch:css    # to samo, na bieżąco
npm test             # testy: obliczenia, cele, klasyfikacja, import CSV, zdarzenia, adresy widoków, szyfrowanie
npm run test:sql     # migracja 2026-11g na Postgresie w WebAssembly: MFA, RLS, historia, limity
```

- **Klasy Tailwinda w JS** zapisuj w całości (`'text-[var(--c-spend)]'`), nie sklejaj z kawałków –
  inaczej `build:css` ich nie znajdzie. Zbudowany `css/tailwind.css` trafia do repozytorium.
- **Nowy przycisk / pole**: zamiast `onclick="f('x')"` pisz `data-klik="f('x')"`
  (`data-zmiana`, `data-wpis`, `data-wyslij`, `data-escape`, `data-aktywuj`, `data-klawisz`).
  Argumenty: teksty w apostrofach, liczby, `true/false/null`, `this`, `this.value`, `this.checked`,
  `this.dataset.x`, `event`. Test `tests/zdarzenia.test.js` sprawdza każdą akcję w kodzie.
- **Zmiana listy plików JS**: dopisz plik w `index.html` i w `PLIKI_APLIKACJI` w `sw.js`,
  a w `sw.js` zmień `WERSJA`.
- **Po zapisie do bazy** popraw stan w pamięci i wywołaj `odswiezPoZmianie()` zamiast
  `pobierzDane()` – pełne pobranie zostaje dla „Odśwież”, zmiany budżetu i wczytania kopii.

## 9. Struktura

```
index.html            szkielet strony (CSP, manifest)
manifest.webmanifest  PWA: nazwa, ikony, kolory, skróty
sw.js                 service worker: pliki aplikacji offline
icons/                ikony 192, 512, maskable, apple-touch, favicon
css/app.css           wygląd (zmienne kolorów, komponenty, układ)
css/tailwind.css      klasy narzędziowe (zbudowane z css/tailwind.src.css)
css/czcionki.css      @font-face czcionek z katalogu fonts/
fonts/                czcionki woff2 (SIL OFL)
_headers              nagłówki bezpieczeństwa (Cloudflare Pages / Netlify)
js/zdarzenia.js       obsługa data-klik / data-zmiana … bez inline JS
js/config.js          adres Supabase, klucz publishable, kategorie startowe
js/state.js           stan aplikacji
js/offline.js         kopia danych w IndexedDB, tryb offline
js/nawigacja.js       adresy widoków i przycisk „Wstecz”
js/db.js              dostęp do bazy, budżet wspólny / osobisty, blokada zapisów offline
js/rules.js, calc.js  klasyfikacja i obliczenia (bez interfejsu – testy w tests/)
js/bezpieczenstwo.js  MFA, automatyczne wylogowanie, wylogowanie wszędzie, ochrona przed ramką
js/szyfrowanie.js     szyfrowanie kopii zapasowych hasłem (WebCrypto)
js/views/*.js         ekrany (konto.js: logowanie, hasło, osoby; historia.js: historia zmian)
js/pwa.js             rejestracja service workera
js/vendor/            biblioteki w stałych wersjach (README z wersjami i sumami kontrolnymi)
tests/                testy node --test
supabase/*.sql        migracje bazy – uruchamiane ręcznie w SQL Editor
```
