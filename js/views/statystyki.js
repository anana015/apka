// =====================================================================
// EKRAN: STATYSTYKI
// =====================================================================

function resetujFiltryStatystyki() {
    document.getElementById('stat-data-od').value = '';
    document.getElementById('stat-data-do').value = '';
    odswiezStatystyki();
}

function odswiezStatystyki() {
    const dataOd = document.getElementById('stat-data-od').value;
    const dataDo = document.getElementById('stat-data-do').value;

    const transFiltered = stan.transakcje.filter(t => {
        if (dataOd && t.booked_on < dataOd) return false;
        if (dataDo && t.booked_on > dataDo) return false;
        return true;
    });

    const miesiace = Array.from(new Set(transFiltered.map(t => t.booked_on.substring(0, 7)))).sort();
    const liczbaMiesiecy = miesiace.length || 1;

    let sumaPrzychodow = 0, sumaWydatkow = 0, sumaNetto = 0;
    const przychodyMiesieczne = [];
    const wydatkiMiesieczne = [];
    const oszczednosciMiesieczne = [];
    const topKatMap = {};

    miesiace.forEach(m => {
        const s = podsumuj(transFiltered.filter(t => t.booked_on.startsWith(m)));

        przychodyMiesieczne.push(s.przychody / 100);
        wydatkiMiesieczne.push(s.wydatki / 100);
        oszczednosciMiesieczne.push(s.netto / 100);

        sumaPrzychodow += s.przychody;
        sumaWydatkow += s.wydatki;
        sumaNetto += s.netto;
        for (const [kat, kwota] of Object.entries(s.kategorie)) {
            topKatMap[kat] = (topKatMap[kat] || 0) + kwota;
        }
    });

    const sredniaStopa = sumaPrzychodow > 0 ? Math.round((sumaNetto / sumaPrzychodow) * 100) : 0;

    document.getElementById('stat-sredni-przychod').innerText = zl(sumaPrzychodow / liczbaMiesiecy);
    document.getElementById('stat-sredni-wydatek').innerText = zl(sumaWydatkow / liczbaMiesiecy);
    document.getElementById('stat-srednia-stopa').innerText = `${sredniaStopa}%`;
    document.getElementById('stat-bilans-ogolny').innerText = zl(sumaPrzychodow - sumaWydatkow - sumaNetto);

    const posortowaneKat = Object.entries(topKatMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topKatKontener = document.getElementById('stat-top-kategorie');

    if (posortowaneKat.length === 0) {
        topKatKontener.innerHTML = `<p class="text-[var(--muted)]">Brak wydatków w wybranym zakresie.</p>`;
    } else {
        topKatKontener.innerHTML = posortowaneKat.map(([kat, kwota], index) => `
            <div class="flex justify-between items-center border-b border-gray-100 dark:border-gray-800 pb-1.5">
                <span class="font-medium">${index + 1}. ${esc(kat)}</span>
                <span class="tabular-nums font-bold text-[var(--c-spend)]">${zl(kwota, 2)}</span>
            </div>
        `).join('');
    }

    const ctx = document.getElementById('wykresStatystyki').getContext('2d');
    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: miesiace,
            datasets: [
                { label: 'Przychody', data: przychodyMiesieczne, borderColor: '#2A7D4F', backgroundColor: '#2A7D4F', tension: 0.2 },
                { label: 'Wydatki', data: wydatkiMiesieczne, borderColor: '#B4472E', backgroundColor: '#B4472E', tension: 0.2 },
                { label: 'Odłożone netto', data: oszczednosciMiesieczne, borderColor: '#2F5FB3', backgroundColor: '#2F5FB3', tension: 0.2 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
            },
            scales: {
                y: { grid: { color: 'rgba(200,200,200,0.1)' } },
                x: { grid: { display: false } }
            }
        }
    });
}
