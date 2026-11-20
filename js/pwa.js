// =====================================================================
// PWA: rejestracja service workera (sw.js) – instalacja na ekranie głównym i praca bez internetu
// (specyfikacja 2 i test akceptacyjny 11.2). Dane budżetu offline: offline.js.
// =====================================================================

if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', async () => {
        try {
            // Bez kontrolera przy starcie = pierwsza instalacja, a nie aktualizacja – bez komunikatu
            const bylaWersja = !!navigator.serviceWorker.controller;
            const rejestracja = await navigator.serviceWorker.register('sw.js');
            // Nowa wersja aplikacji zainstalowała się w tle – pliki są już w pamięci podręcznej,
            // a pełne przejście na nią nastąpi po odświeżeniu strony
            rejestracja.addEventListener('updatefound', () => {
                const nowy = rejestracja.installing;
                if (!nowy) return;
                nowy.addEventListener('statechange', () => {
                    if (nowy.state === 'activated' && bylaWersja && stan.uzytkownikId) {
                        pokazKomunikat('Jest nowa wersja aplikacji – odśwież stronę, żeby z niej korzystać');
                    }
                });
            });
        } catch (err) {
            console.warn('Nie zarejestrowano service workera:', err);
        }
    });
}
