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
5. **Hosting** – np. GitHub Pages (*Settings → Pages*, gałąź `main`, katalog główny). Wgraj wszystkie
   pliki z repozytorium, także `sw.js`, `manifest.webmanifest`, `icons/` i zbudowany `css/tailwind.css`
   (katalogu `node_modules/` nie wgrywaj). Aplikacja musi działać przez **HTTPS** – inaczej nie
   zadziała tryb offline ani instalacja.
6. **Pierwsze logowanie** – *Ustawienia → Osoby w budżecie wspólnym → Utwórz budżet wspólny*,
   a potem *+ Dodaj* drugą osobę po jej adresie e-mail. Budżet osobisty każda osoba ma od razu.
7. Opcjonalnie: *Ustawienia → Subkonto wypłat* – numer subkonta, z którego bank przelewa wypłaty
   z celów (osobno dla budżetu wspólnego i osobistego).

## 2. Aktualizacja istniejącej instalacji

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
- **Content-Security-Policy** (`<meta>` w `index.html`): przeglądarka uruchamia tylko skrypty z tej
  strony – żadnych skryptów z innych serwerów ani wstrzykniętych w HTML. Dlatego w kodzie nie ma
  `onclick="…"`: akcje opisują atrybuty `data-klik`, `data-zmiana` itd., a wykonuje je
  `js/zdarzenia.js` (bez `eval`). Połączenia sieciowe – tylko do `*.supabase.co`.
- **Brak sekretów w kodzie**: w repozytorium jest tylko adres projektu i klucz publishable.
  Numer subkonta wypłat jest w tabeli `ustawienia_budzetu` (widoczny tylko dla osób z dostępem).
- **Biblioteki w repozytorium** (`js/vendor/`, stałe wersje): klient Supabase, który widzi sesję
  logowania, nie jest ładowany z zewnętrznego serwera. Tailwind jest zbudowany do zwykłego pliku CSS.
- **Dane offline**: kopia budżetu w IndexedDB przeglądarki – osobno dla każdej osoby; **wylogowanie
  ją usuwa**. Na wspólnym komputerze zawsze się wylogowuj.

Lista kontrolna:

- [ ] *Allow new users to sign up* – wyłączone; *Anonymous sign-ins* – wyłączone.
- [ ] W `js/config.js` jest klucz **publishable**, nie `secret`.
- [ ] Do repozytorium nie trafiają wyciągi CSV, kopie zapasowe JSON ani skany (pilnuje `.gitignore`).
- [ ] Repozytorium **prywatne** albo wyczyszczona historia, jeśli kiedyś trafiły do niego dane
      (np. numer subkonta w starszych wersjach `config.js` jest nadal w historii gita).
- [ ] Hasła: co najmniej 8 znaków, inne niż w pozostałych serwisach.

Ograniczenia (świadomie zostawione):

- Czcionki ładują się z Google Fonts (dozwolone w CSP). Offline działają z pamięci service workera.
- `style-src 'unsafe-inline'` w CSP – potrzebne dla atrybutów `style="…"` (kolory kategorii,
  szerokości pasków). Nie pozwala uruchamiać skryptów.
- Kto ma dostęp do skrzynki e-mail osoby, może przez „Nie pamiętasz hasła?” przejąć jej konto –
  chroń też konto pocztowe (silne hasło, weryfikacja dwuetapowa).
- Osoby z listy budżetu wspólnego ufają sobie nawzajem: każda może zmienić dane i listę osób.

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

- **Cofnij** – po usunięciu transakcji, celu, kategorii albo reguły i po zmianie kategorii
  komunikat ma przycisk *Cofnij* (co najmniej 8 s). Cofnięcie zmiany kategorii cofa też regułę
  utworzoną przez „Zapamiętaj dla podobnych”. Plik paragonu usuwanej transakcji jest kasowany
  dopiero, gdy minie czas na cofnięcie (jeśli w tym czasie zamkniesz kartę, plik zostaje w magazynie).
- **Komunikaty** są widoczne tym dłużej, im dłuższy tekst (2,6–10 s); najechanie kursorem albo
  fokus wstrzymuje znikanie, *Escape* zamyka.
- **Wyszukiwarka w Transakcjach** – kontrahent, tytuł, notatka, data, kategoria, cel albo kwota
  („123,45”, „123.45”); szuka we wszystkich miesiącach, łączy się z filtrami „Do przypisania” itd.
- **Prognoza limitu** (Pulpit, bieżący miesiąc, od 5. dnia): „W tym tempie ok. X zł do końca
  miesiąca – o Y zł ponad limit”. Liczona liniowo z dotychczasowych wydatków; pomija kategorie
  oznaczone jako wydatek stały (np. czynsz), bo płaci się je raz w miesiącu.

## 8. Praca nad kodem

Potrzebny jest Node.js 18+ (tylko do budowania CSS i testów – aplikacja go nie wymaga).

```bash
npm install          # Tailwind CSS i PapaParse (do testów)
npm run build:css    # css/tailwind.src.css -> css/tailwind.css (po zmianie klas w HTML/JS)
npm run watch:css    # to samo, na bieżąco
npm test             # testy: obliczenia, klasyfikacja, import CSV, zdarzenia, adresy widoków
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
js/zdarzenia.js       obsługa data-klik / data-zmiana … bez inline JS
js/config.js          adres Supabase, klucz publishable, kategorie startowe
js/state.js           stan aplikacji
js/offline.js         kopia danych w IndexedDB, tryb offline
js/nawigacja.js       adresy widoków i przycisk „Wstecz”
js/db.js              dostęp do bazy, budżet wspólny / osobisty, blokada zapisów offline
js/rules.js, calc.js  klasyfikacja i obliczenia (bez interfejsu – testy w tests/)
js/views/*.js         ekrany (konto.js: logowanie, hasło, osoby w budżecie wspólnym)
js/pwa.js             rejestracja service workera
js/vendor/            biblioteki w stałych wersjach (README z wersjami i sumami kontrolnymi)
tests/                testy node --test
supabase/*.sql        migracje bazy – uruchamiane ręcznie w SQL Editor
```
