# Biblioteki w repozytorium

Pliki skopiowane **bez zmian** z paczek npm. Trzymamy je w repozytorium zamiast ładować z CDN,
bo klient Supabase widzi sesję logowania: wersja „najnowsza” z zewnętrznego serwera mogłaby się
zmienić bez naszej wiedzy.

| Plik | Paczka npm | Plik w paczce | Licencja | SHA-384 (base64) |
| --- | --- | --- | --- | --- |
| `supabase-js-2.119.0.js` | `@supabase/supabase-js@2.119.0` | `dist/umd/supabase.js` | MIT | `uteMfOloLDGt042uDz+xHGF3ym63/WQ6rFq7murQRG8Ih7QrXGEGNtWd8688sb4O` |
| `papaparse-5.4.1.min.js` | `papaparse@5.4.1` | `papaparse.min.js` | MIT | `D/t0ZMqQW31H3az8ktEiNb39wyKnS82iFY52QPACM+IjKW3jDUhyIgh2PApRqJZs` |
| `lucide-1.70.0.min.js` | `lucide@1.70.0` | `dist/umd/lucide.min.js` | ISC | `64z4N640tVzhAicQVGzxE/48VNN9yS53U5kv9UH8ca7xGU4KSJ9zz8nD4C2BEerP` |

Pełne teksty licencji: `LICENCJE.txt`. (W projekcie Claude jest tylko ten opis – same pliki
bibliotek są w paczce ZIP z wdrożeniem i w repozytorium.)

## Sprawdzenie i aktualizacja

```bash
npm pack @supabase/supabase-js@2.119.0 && tar -xzf supabase-supabase-js-2.119.0.tgz
openssl dgst -sha384 -binary package/dist/umd/supabase.js | openssl base64 -A   # = suma z tabeli
```

Aktualizacja: pobierz nową wersję tak samo, zmień nazwę pliku (numer wersji), podmień ścieżkę
w `index.html`, uzupełnij tabelę i sprawdź aplikację (logowanie, import, ikony).
