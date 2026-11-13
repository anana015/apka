// =====================================================================
// POTWIERDZENIA NA EKRANIE (specyfikacja 10.2: aplikacja nie używa okienek
// przeglądarki alert / confirm – potwierdzenia są częścią ekranu)
//
// Naraz otwarte jest jedno potwierdzenie: stan.potwierdzenie = { rodzaj, id, wTrakcie }.
// Ekran rysuje htmlPotwierdzenia() przy elemencie, którego dotyczy (czyPotwierdzenie).
// Fokus trafia na „Anuluj” (bezpieczny wybór), Escape zamyka, a na czas zapisu
// przyciski są wyłączone – drugi klik nie wyśle drugiego zapytania.
// Klik w zakładkę, zmiana budżetu i otwarcie innego panelu zamykają potwierdzenie.
// =====================================================================

function czyPotwierdzenie(rodzaj, id) {
    const p = stan.potwierdzenie;
    return !!p && p.rodzaj === rodzaj && p.id === String(id);
}

function ustawFokusNa(idElementu) {
    const el = idElementu && document.getElementById(idElementu);
    if (el && !el.disabled) el.focus();
}

// odswiez – funkcja rysująca ekran, na którym jest potwierdzenie (np. odswiezTransakcje)
function otworzPotwierdzenie(rodzaj, id, odswiez) {
    stan.potwierdzenie = { rodzaj, id: String(id), wTrakcie: false };
    odswiez();
    ustawFokusNa(`potw-nie-${rodzaj}-${id}`);
}

// idFokusu – przycisk, który otworzył potwierdzenie (po zamknięciu fokus wraca na niego)
function zamknijPotwierdzenie(odswiez, idFokusu) {
    if (stan.potwierdzenie && stan.potwierdzenie.wTrakcie) return;
    stan.potwierdzenie = null;
    odswiez();
    ustawFokusNa(idFokusu);
}

// Wykonuje potwierdzoną akcję. akcja() zwraca true po udanym zapisie; przy błędzie sama
// pokazuje komunikat i zwraca false – wtedy potwierdzenie zostaje otwarte (można ponowić).
// Bez otwartego potwierdzenia tego rodzaju i id nic się nie dzieje.
async function wykonajPotwierdzenie(rodzaj, id, odswiez, akcja) {
    const p = stan.potwierdzenie;
    if (!czyPotwierdzenie(rodzaj, id) || p.wTrakcie) return false;
    p.wTrakcie = true;
    odswiez();

    let udane = false;
    try {
        udane = await akcja();
    } catch (err) {
        pokazKomunikat(`Coś poszło nie tak: ${err && err.message ? err.message : 'nieznany błąd'}`);
    }
    if (stan.potwierdzenie === p) {
        if (udane) stan.potwierdzenie = null;
        else p.wTrakcie = false;
    }
    if (!udane) {
        odswiez();
        ustawFokusNa(`potw-tak-${rodzaj}-${id}`);
    }
    return udane;
}

// Blok potwierdzenia. akcjaTak / akcjaNie – akcje dla data-klik (zdarzenia.js), z już
// zabezpieczonymi (esc) wartościami, np. `usunTransakcje('${esc(id)}')`.
// Klik w środku nie dociera do karty pod spodem (event.stopPropagation()), Escape = „Anuluj”.
function htmlPotwierdzenia({ rodzaj, id, pytanie, opis = '', tak, tekstWTrakcie = 'Zapisuję…', akcjaTak, akcjaNie, klasa = '' }) {
    const wTrakcie = czyPotwierdzenie(rodzaj, id) && stan.potwierdzenie.wTrakcie;
    const sufiks = `${rodzaj}-${esc(id)}`;
    return `
        <div class="space-y-2 ${klasa}" role="alert" data-klik="event.stopPropagation()" data-escape="${akcjaNie}">
            <p class="text-xs"><strong>${esc(pytanie)}</strong>${opis ? ` <span class="text-[var(--muted)]">${esc(opis)}</span>` : ''}</p>
            <div class="flex gap-2 flex-wrap">
                <button type="button" id="potw-tak-${sufiks}" data-klik="${akcjaTak}" class="chip !bg-[var(--c-spend)] !text-white" ${wTrakcie ? 'disabled' : ''}>${esc(wTrakcie ? tekstWTrakcie : tak)}</button>
                <button type="button" id="potw-nie-${sufiks}" data-klik="${akcjaNie}" class="chip" ${wTrakcie ? 'disabled' : ''}>Anuluj</button>
            </div>
        </div>`;
}
