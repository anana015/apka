// =====================================================================
// EKRAN: IMPORT CSV
// =====================================================================

function obsluzPlikCSV(e) {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('import-nazwa-pliku').innerText = file.name;

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        encoding: 'UTF-8',
        complete: function(results) {
            parsowanieWierszy(results.data);
        }
    });
}

function parsowanieWierszy(wiersze) {
    przygotowaneTransakcjeCSV = [];
    const istniejaceKlucze = new Set(stan.transakcje.map(t => t.dedup_key));
    const wystapieniaKlucza = {}; // ile razy dany klucz pojawił się już w tym pliku

    let noweLicznik = 0, duplikatyLicznik = 0;

    wiersze.forEach(row => {
        const dataRaw = row['Data księgowania'] || row['Data operacji'] || row['Data transaction'] || row['Data'];
        const kontrahent = row['Nadawca / Odbiorca'] || row['Kontrahent'] || row['Odbiorca'] || '';
        const tytul = row['Tytułem'] || row['Tytuł'] || row['Opis'] || '';
        const kwotaRaw = row['Kwota operacji'] || row['Kwota'] || '0';

        if (!dataRaw) return;

        let booked_on = dataRaw.trim();
        if (booked_on.includes('.')) {
            const parts = booked_on.split('.');
            if (parts.length === 3) booked_on = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }

        const kwotaCzysta = kwotaRaw.replace(/\s/g, '').replace('PLN', '').replace(',', '.');
        const amount_gr = Math.round(parseFloat(kwotaCzysta) * 100);
        if (isNaN(amount_gr)) return;

        // Rachunek drugiej strony zależy od kierunku przelewu:
        // wypływ (kwota < 0) -> rachunek docelowy, wpływ (kwota > 0) -> rachunek źródłowy.
        // Dzięki temu wypłata ze wspólnego subkonta niesie jego numer.
        const rachDocelowy = row['Rachunek docelowy'] || '';
        const rachZrodlowy = row['Rachunek źródłowy'] || '';
        const rachInny = row['Rachunek przeciwstawny'] || row['Numer rachunku'] || '';
        const surowyRachunek = amount_gr > 0
            ? (rachZrodlowy || rachInny || rachDocelowy)
            : (rachDocelowy || rachInny || rachZrodlowy);
        const numerKonta = czystyNumer(surowyRachunek);

        // Klucz bazowy w dotychczasowym formacie (zgodność z danymi już zapisanymi w bazie).
        // Kolejne identyczne wiersze w pliku dostają dopisek |2, |3...
        const tytulSkrocony = (tytul || kontrahent).replace(/\s+/g, '').substring(0, 40);
        const kluczBazowy = `${booked_on}-${amount_gr}-${tytulSkrocony}`;
        wystapieniaKlucza[kluczBazowy] = (wystapieniaKlucza[kluczBazowy] || 0) + 1;
        const n = wystapieniaKlucza[kluczBazowy];
        const dedup_key = n === 1 ? kluczBazowy : `${kluczBazowy}|${n}`;

        const czyDuplikat = istniejaceKlucze.has(dedup_key);
        if (czyDuplikat) duplikatyLicznik++;
        else noweLicznik++;

        przygotowaneTransakcjeCSV.push({
            booked_on,
            counterparty: kontrahent,
            title: tytul,
            account_number: numerKonta,
            amount_gr,
            dedup_key,
            czyDuplikat
        });
    });

    document.getElementById('import-krok-1').classList.add('hidden');
    document.getElementById('import-krok-2').classList.remove('hidden');

    document.getElementById('import-podgladz-kafelki').innerHTML = `
        <div class="card !p-2"><span class="block font-bold kwota text-[var(--c-income)]">${noweLicznik}</span>Nowe</div>
        <div class="card !p-2"><span class="block font-bold kwota text-[var(--muted)]">${duplikatyLicznik}</span>Duplikaty</div>
        <div class="card !p-2"><span class="block font-bold kwota text-[var(--accent)]">${przygotowaneTransakcjeCSV.length}</span>Wszystkie</div>
    `;

    document.getElementById('import-lista-preview').innerHTML = przygotowaneTransakcjeCSV.map(t => `
        <div class="card !p-2.5 flex justify-between items-center gap-2 text-xs ${t.czyDuplikat ? 'opacity-50' : ''}">
            <div class="min-w-0">
                <p class="font-semibold truncate">${esc(t.counterparty || t.title)}</p>
                ${t.account_number ? `<span class="text-[10px] text-[var(--accent)] block font-mono truncate">Konto: ${esc(t.account_number)}</span>` : ''}
                <span class="text-[10px] text-[var(--muted)]">${esc(t.booked_on)} ${t.czyDuplikat ? '(Już zapisana)' : ''}</span>
            </div>
            <span class="font-bold kwota whitespace-nowrap ${t.amount_gr < 0 ? 'text-[var(--c-spend)]' : 'text-[var(--c-income)]'}">${(t.amount_gr / 100).toFixed(2)} zł</span>
        </div>
    `).join('');
}

async function zapiszZaimportowaneTransakcje() {
    const doZapisu = przygotowaneTransakcjeCSV.filter(t => !t.czyDuplikat).map(t => ({
        booked_on: t.booked_on,
        counterparty: t.counterparty,
        title: t.title,
        account_number: t.account_number,
        amount_gr: t.amount_gr,
        dedup_key: t.dedup_key
    }));

    if (doZapisu.length === 0) {
        alert('Brak nowych transakcji do zapisania (wszystkie to duplikaty).');
        return;
    }

    const btn = document.getElementById('btn-zapisz-import');
    btn.innerText = 'Zapisywanie w chmurze...';
    btn.disabled = true;

    const { error } = await supabaseClient.from('transakcje').insert(doZapisu);
    btn.innerText = 'Zapisz nowe transakcje';
    btn.disabled = false;

    if (error) {
        alert('Błąd podczas zapisywania: ' + error.message);
    } else {
        alert(`Pomyślnie zaimportowano ${doZapisu.length} nowych transakcji!`);
        resetujImport();
        pobierzDane();
        zmienZakladke('pulpit');
    }
}

function resetujImport() {
    document.getElementById('import-krok-2').classList.add('hidden');
    document.getElementById('import-krok-1').classList.remove('hidden');
    document.getElementById('csv-file-input').value = '';
    przygotowaneTransakcjeCSV = [];
}
