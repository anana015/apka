// =====================================================================
// NOTATKI I PARAGONY PRZY TRANSAKCJACH
// Kolumny transakcje.note i transakcje.receipt_path (migracja 2026-11d).
// Pliki w prywatnym magazynie Supabase Storage „paragony”:
//   wspolny/<id transakcji>/<czas>.jpg      – budżet wspólny
//   <id osoby>/<id transakcji>/<czas>.jpg   – budżet osobisty (widzi tylko właściciel)
// Zdjęcia przed wysłaniem są zmniejszane (dłuższy bok 1600 px, JPEG), PDF idzie bez zmian.
// Podgląd otwiera link ważny 10 minut – plik nigdy nie jest publiczny.
// =====================================================================

const BUCKET_PARAGONOW = 'paragony';
const MAKS_NOTATKA = 500;
const MAKS_ROZMIAR_PARAGONU = 10 * 1024 * 1024;   // jak limit w migracji
const MAKS_BOK_ZDJECIA = 1600;
const JAKOSC_JPEG = 0.8;
const WAZNOSC_LINKU_S = 600;

function transakcjaPoId(id) {
    return stan.transakcje.find(t => String(t.id) === String(id)) || null;
}

// Panel pod wierszem transakcji (otwierany ikoną spinacza); zamyka podział i potwierdzenie usunięcia
function otworzSzczegolyTransakcji(id) {
    stan.szczegolyTransakcji = stan.szczegolyTransakcji === String(id) ? null : String(id);
    stan.podzial = null;
    stan.potwierdzenie = null;
    odswiezTransakcje();
}

function zamknijSzczegolyTransakcji() {
    stan.szczegolyTransakcji = null;
    odswiezTransakcje();
}

// Krótka informacja w wierszu: notatka i znaczek paragonu
function opisNotatkiWWierszu(t) {
    const czesci = [];
    if (t.note) czesci.push(`<span class="block text-[11px] mt-0.5 leading-tight line-clamp-2"><span aria-hidden="true">📝 </span>${esc(t.note)}</span>`);
    if (t.receipt_path) czesci.push(`<button type="button" data-klik="pokazParagon('${esc(t.id)}')" class="text-[10px] text-[var(--accent)] font-semibold hover:underline mt-0.5"><span aria-hidden="true">📎 </span>paragon</button>`);
    return czesci.join('');
}

function panelSzczegolowTransakcji(t) {
    if (stan.szczegolyTransakcji !== String(t.id)) return '';
    const id = esc(t.id);
    return `
        <div class="mt-2 pt-2 border-t border-[var(--border)] space-y-2" role="group" aria-label="Notatka i paragon">
            <label for="notatka-${id}" class="field-label !mb-1">Notatka</label>
            <textarea id="notatka-${id}" maxlength="${MAKS_NOTATKA}" rows="2" class="input !text-xs" placeholder="np. prezent dla mamy, zwrot do 14 dni">${esc(t.note || '')}</textarea>
            <div class="flex flex-wrap items-center gap-2">
                <button type="button" data-klik="zapiszNotatke('${id}')" class="chip is-active">Zapisz notatkę</button>
                ${t.receipt_path
                    ? `<button type="button" data-klik="pokazParagon('${id}')" class="chip">📎 Pokaż paragon</button>
                       <label class="chip cursor-pointer">Zmień plik<input type="file" accept="image/*,application/pdf" class="sr-only" data-zmiana="wybierzParagon('${id}', this)"></label>
                       <button type="button" data-klik="usunParagon('${id}')" class="chip !text-[var(--c-spend)]">Usuń paragon</button>`
                    : `<label class="chip cursor-pointer">📎 Dodaj zdjęcie lub PDF paragonu<input type="file" accept="image/*,application/pdf" class="sr-only" data-zmiana="wybierzParagon('${id}', this)"></label>`}
                <button type="button" data-klik="zamknijSzczegolyTransakcji()" class="text-[11px] text-[var(--muted)] underline ml-auto">Zamknij</button>
            </div>
            <p id="paragon-status-${id}" class="text-[10px] text-[var(--muted)]" aria-live="polite">Zdjęcie zmniejszamy przed wysłaniem. Paragon widzi tylko ten, kto widzi ten budżet.</p>
        </div>`;
}

async function zapiszNotatke(id) {
    const t = transakcjaPoId(id);
    const pole = document.getElementById(`notatka-${id}`);
    if (!t || !pole) return;
    const note = pole.value.trim().slice(0, MAKS_NOTATKA) || null;
    const { error } = await supabaseClient.from('transakcje').update({ note }).eq('id', id);
    if (error) return pokazKomunikat(komunikatBledu(error, 'Nie zapisano notatki'));
    t.note = note;
    odswiezTransakcje();
    zaplanujZapisMigawki();
    pokazKomunikat(note ? 'Zapisano notatkę' : 'Usunięto notatkę');
}

// ---- Plik paragonu -----------------------------------------------------

// Zdjęcie -> JPEG o dłuższym boku najwyżej MAKS_BOK_ZDJECIA. Gdy przeglądarka nie umie
// odczytać formatu (np. HEIC poza Safari), wysyłamy oryginał.
async function zmniejszZdjecie(plik) {
    if (!plik.type.startsWith('image/')) return plik;
    try {
        const obraz = await createImageBitmap(plik);
        const skala = Math.min(1, MAKS_BOK_ZDJECIA / Math.max(obraz.width, obraz.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(obraz.width * skala);
        canvas.height = Math.round(obraz.height * skala);
        canvas.getContext('2d').drawImage(obraz, 0, 0, canvas.width, canvas.height);
        obraz.close();
        const blob = await new Promise(ok => canvas.toBlob(ok, 'image/jpeg', JAKOSC_JPEG));
        return blob && blob.size < plik.size ? new File([blob], 'paragon.jpg', { type: 'image/jpeg' }) : plik;
    } catch (e) {
        return plik;
    }
}

function rozszerzeniePliku(plik) {
    if (plik.type === 'application/pdf') return 'pdf';
    if (plik.type === 'image/jpeg') return 'jpg';
    return (plik.type.split('/')[1] || 'bin').replace(/[^a-z0-9]/g, '');
}

function ustawStatusParagonu(id, tekst) {
    const el = document.getElementById(`paragon-status-${id}`);
    if (el) el.innerText = tekst;
}

async function wybierzParagon(id, input) {
    const t = transakcjaPoId(id);
    const zrodlo = input.files && input.files[0];
    input.value = '';
    if (!t || !zrodlo) return;
    if (stan.trybOffline) return pokazKomunikat(komunikatBledu(BLAD_OFFLINE, 'Nie wysłano paragonu'));
    if (!/^image\/|^application\/pdf$/.test(zrodlo.type)) return pokazKomunikat('Paragon może być zdjęciem albo plikiem PDF');

    ustawStatusParagonu(id, 'Przygotowuję plik…');
    const plik = await zmniejszZdjecie(zrodlo);
    if (plik.size > MAKS_ROZMIAR_PARAGONU) {
        ustawStatusParagonu(id, '');
        return pokazKomunikat('Plik jest większy niż 10 MB – zrób zdjęcie w niższej jakości albo zmniejsz PDF');
    }

    const folder = wlascicielBudzetu() || 'wspolny';
    const sciezka = `${folder}/${t.id}/${Date.now()}.${rozszerzeniePliku(plik)}`;
    ustawStatusParagonu(id, `Wysyłam ${liczba(plik.size / 1024, 0)} KB…`);

    const magazyn = supabaseClient.storage.from(BUCKET_PARAGONOW);
    const { error: bladPliku } = await magazyn.upload(sciezka, plik, { contentType: plik.type, upsert: false });
    if (bladPliku) {
        ustawStatusParagonu(id, '');
        return pokazKomunikat(/bucket|not found/i.test(bladPliku.message || '')
            ? `Brak magazynu na paragony – uruchom w Supabase skrypt ${PLIK_MIGRACJI}`
            : `Nie wysłano paragonu: ${bladPliku.message}`);
    }

    const stary = t.receipt_path;
    const { error } = await supabaseClient.from('transakcje').update({ receipt_path: sciezka }).eq('id', id);
    if (error) {
        await magazyn.remove([sciezka]); // bez wpisu w transakcji plik byłby osierocony
        ustawStatusParagonu(id, '');
        return pokazKomunikat(komunikatBledu(error, 'Nie zapisano paragonu'));
    }
    if (stary) await magazyn.remove([stary]);
    t.receipt_path = sciezka;
    odswiezTransakcje();
    zaplanujZapisMigawki();
    pokazKomunikat('Dodano paragon');
}

// Link ważny 10 minut. Karta otwierana od razu po kliknięciu, a adres ustawiany po jego
// otrzymaniu – inaczej przeglądarka w telefonie blokuje okno otwarte „po czasie”.
async function pokazParagon(id) {
    const t = transakcjaPoId(id);
    if (!t || !t.receipt_path) return;
    if (stan.trybOffline) return pokazKomunikat('Paragon otworzysz po powrocie internetu');
    const okno = window.open('', '_blank');
    const { data, error } = await supabaseClient.storage.from(BUCKET_PARAGONOW).createSignedUrl(t.receipt_path, WAZNOSC_LINKU_S);
    if (error || !data) {
        if (okno) okno.close();
        return pokazKomunikat(`Nie udało się otworzyć paragonu: ${error ? error.message : 'brak pliku'}`);
    }
    if (okno) okno.location.href = data.signedUrl;
    else window.location.href = data.signedUrl;
}

async function usunParagon(id) {
    const t = transakcjaPoId(id);
    if (!t || !t.receipt_path) return;
    const sciezka = t.receipt_path;
    const { error } = await supabaseClient.from('transakcje').update({ receipt_path: null }).eq('id', id);
    if (error) return pokazKomunikat(komunikatBledu(error, 'Nie usunięto paragonu'));
    await usunPlikParagonu(sciezka);
    t.receipt_path = null;
    odswiezTransakcje();
    zaplanujZapisMigawki();
    pokazKomunikat('Usunięto paragon');
}

// Przy usuwaniu transakcji (błąd pliku nie blokuje usunięcia transakcji)
async function usunPlikParagonu(sciezka) {
    if (!sciezka) return;
    try { await supabaseClient.storage.from(BUCKET_PARAGONOW).remove([sciezka]); } catch (e) {}
}
