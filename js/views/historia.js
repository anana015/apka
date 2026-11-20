// =====================================================================
// USTAWIENIA → HISTORIA ZMIAN (migracja 2026-11g: tabela historia_zmian, wyzwalacze w bazie)
// Kto i kiedy dodał, zmienił albo usunął dane otwartego budżetu. Odczyt: funkcja
// historia_zmian_lista (tylko budżet, do którego osoba ma dostęp). opisZmiany – czysta funkcja
// (tests/bezpieczenstwo.test.js).
// =====================================================================

const LIMIT_HISTORII = 200;

// Rzeczownik w bierniku (1) i dopełniaczu (wiele) dla każdej tabeli
const NAZWY_TABEL_HISTORII = {
    transakcje: ['transakcję', 'transakcje', 'transakcji'],
    rules: ['regułę', 'reguły', 'reguł'],
    goals: ['cel', 'cele', 'celów'],
    categories: ['kategorię', 'kategorie', 'kategorii'],
    imports: ['import', 'importy', 'importów'],
    ustawienia_budzetu: ['ustawienia budżetu', 'ustawienia budżetu', 'ustawień budżetu'],
    budzet_czlonkowie: ['osobę do budżetu wspólnego', 'osoby do budżetu wspólnego', 'osób do budżetu wspólnego'],
    ustawienia_bezpieczenstwa: ['ustawienia bezpieczeństwa', 'ustawienia bezpieczeństwa', 'ustawień bezpieczeństwa']
};

const NAZWY_POL_HISTORII = {
    booked_on: 'data', counterparty: 'kontrahent', title: 'tytuł', account_number: 'konto', amount_gr: 'kwota',
    category_manual: 'kategoria', splits: 'podział', note: 'notatka', receipt_path: 'paragon', import_id: 'import',
    phrase: 'fraza', category: 'kategoria', name: 'nazwa', keyword: 'nr subkonta', keywords_out: 'słowa wypłat',
    target_gr: 'kwota celu', deadline: 'termin', archived: 'archiwum', opening_balance_gr: 'saldo początkowe',
    color: 'kolor', interest_rate: 'oprocentowanie', interest_threshold_gr: 'próg oprocentowania',
    interest_tiers: 'progi oprocentowania', manual_operations: 'operacje ręczne',
    monthly_limit_gr: 'limit miesięczny', is_fixed: 'stała', sort_order: 'kolejność', is_saving: 'oszczędność',
    konto_wyplat: 'subkonto wypłat', wymagaj_mfa: 'wymagaj MFA od wszystkich', owner_id: 'budżet'
};
// Pola techniczne – zmiana samej kolejności czy znacznika czasu nie jest ciekawa w historii
const POLA_POMIJANE_W_HISTORII = ['created_at', 'zmieniono', 'zmienil', 'user_id', 'dedup_key'];

function wartoscWHistorii(pole, wartosc) {
    if (wartosc === null || wartosc === undefined || wartosc === '') return '—';
    if (typeof wartosc === 'boolean') return wartosc ? 'tak' : 'nie';
    if (/_gr$/.test(pole) && Number.isFinite(Number(wartosc))) return zl(Number(wartosc), 2);
    if (pole === 'splits') return Array.isArray(wartosc) ? `${wartosc.length} ${odmiana(wartosc.length, 'część', 'części', 'części')}` : '—';
    if (pole === 'manual_operations') {
        return Array.isArray(wartosc) ? `${wartosc.length} ${odmiana(wartosc.length, 'operacja', 'operacje', 'operacji')}` : '—';
    }
    if (pole === 'interest_tiers') {
        const progi = wartosc && Array.isArray(wartosc.tiers) ? wartosc.tiers.length : 0;
        return progi ? `${progi} ${odmiana(progi, 'próg', 'progi', 'progów')}${wartosc.promo ? ` + promocja ${String(wartosc.promo.rate).replace('.', ',')}%` : ''}` : '—';
    }
    if (pole === 'receipt_path') return 'plik';
    if (typeof wartosc === 'object') return '(zmieniono)';
    const tekst = String(wartosc);
    return tekst.length > 40 ? tekst.slice(0, 39) + '…' : tekst;
}

// Krótki opis wiersza: tytuł transakcji, nazwa kategorii, fraza reguły…
function etykietaWierszaHistorii(tabela, w) {
    if (!w) return '';
    if (tabela === 'transakcje') {
        const nazwa = w.counterparty || w.title || '';
        return [nazwa && wartoscWHistorii('title', nazwa), Number.isFinite(Number(w.amount_gr)) && w.amount_gr !== null ? zl(Number(w.amount_gr), 2) : '']
            .filter(Boolean).join(', ');
    }
    if (tabela === 'rules') return w.phrase ? `„${wartoscWHistorii('phrase', w.phrase)}”${w.category ? ` → ${w.category}` : ''}` : '';
    if (tabela === 'imports') return w.file_name ? wartoscWHistorii('file_name', w.file_name) : '';
    return w.name ? wartoscWHistorii('name', w.name) : '';
}

// wpis z historia_zmian_lista -> { tekst, szczegoly: ['kategoria: — → Jedzenie', …] }
// znane: opcjonalnie wiersz z pamięci aplikacji (dla UPDATE – nazwa zmienionego wiersza)
function opisZmiany(wpis, znane = null) {
    const nazwy = NAZWY_TABEL_HISTORII[wpis.tabela] || [wpis.tabela, wpis.tabela, wpis.tabela];
    const n = Number(wpis.liczba) || 1;
    if (wpis.operacja === 'KOPIA') {
        return { tekst: `Wczytano kopię zapasową (${n} ${odmiana(n, 'wiersz', 'wiersze', 'wierszy')})`, szczegoly: [] };
    }
    if (wpis.tabela === 'budzet_czlonkowie' && wpis.operacja !== 'UPDATE') {
        return { tekst: wpis.operacja === 'INSERT' ? 'Dodano osobę do budżetu wspólnego' : 'Usunięto osobę z budżetu wspólnego', szczegoly: [] };
    }
    const czasownik = { INSERT: 'Dodano', DELETE: 'Usunięto', UPDATE: 'Zmieniono' }[wpis.operacja] || wpis.operacja;
    if (wpis.operacja !== 'UPDATE') {
        if (n > 1) return { tekst: `${czasownik} ${n} ${odmiana(n, nazwy[0], nazwy[1], nazwy[2])}`, szczegoly: [] };
        const etykieta = etykietaWierszaHistorii(wpis.tabela, wpis.zmiany);
        return { tekst: `${czasownik} ${nazwy[0]}${etykieta ? `: ${etykieta}` : ''}`, szczegoly: [] };
    }
    const zmiany = wpis.zmiany && typeof wpis.zmiany === 'object' ? wpis.zmiany : {};
    const szczegoly = Object.keys(zmiany)
        .filter(pole => !POLA_POMIJANE_W_HISTORII.includes(pole))
        .map(pole => {
            const [stara, nowa] = Array.isArray(zmiany[pole]) ? zmiany[pole] : [null, null];
            return `${NAZWY_POL_HISTORII[pole] || pole}: ${wartoscWHistorii(pole, stara)} → ${wartoscWHistorii(pole, nowa)}`;
        });
    const etykieta = etykietaWierszaHistorii(wpis.tabela, znane);
    return { tekst: `${czasownik} ${nazwy[0]}${etykieta ? `: ${etykieta}` : ''}`, szczegoly };
}

// ---------------------------------------------------------------------
// Pobieranie i rysowanie
// ---------------------------------------------------------------------

const HISTORIA_WAZNA_MS = 30 * 1000;   // po powrocie na stronę starsza lista odświeża się sama
let historia = { budzet: null, wpisy: null, ladowanie: false, blad: '', pobrano: 0 };

function opisMenuHistorii() {
    return 'Kto i kiedy zmieniał dane';
}

async function odswiezHistorie() {
    if (historia.ladowanie) return;
    const budzet = stan.budzet;
    historia = { budzet, wpisy: historia.budzet === budzet ? historia.wpisy : null, ladowanie: true, blad: '', pobrano: historia.pobrano };
    rysujHistorie();
    const { data, error } = await rpcBezBlokady('historia_zmian_lista', { p_osobisty: budzet === 'osobisty', p_limit: LIMIT_HISTORII });
    if (stan.budzet !== budzet) { historia.ladowanie = false; return; }
    historia.ladowanie = false;
    historia.pobrano = Date.now();
    if (error) {
        historia.blad = czyBrakSchematu(error)
            ? `Historia zmian wymaga migracji bazy – uruchom w Supabase skrypt ${PLIK_MIGRACJI}.`
            : `Nie udało się pobrać historii: ${error.message}`;
    } else {
        historia.wpisy = Array.isArray(data) ? data : [];
    }
    if (stan.zakladka === 'ustawienia' && stan.ustawieniaStrona === 'historia') rysujHistorie();
}

function znanyWiersz(tabela, id) {
    const lista = { transakcje: stan.transakcje, goals: stan.cele, categories: stan.kategorie, rules: dynamiczneReguly }[tabela];
    return Array.isArray(lista) ? lista.find(w => String(w.id) === String(id)) || null : null;
}

function czasWpisuHistorii(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function htmlWpisuHistorii(wpis) {
    const opis = opisZmiany(wpis, wpis.operacja === 'UPDATE' ? znanyWiersz(wpis.tabela, wpis.wiersz_id) : null);
    const kto = wpis.to_ja ? 'Ty' : (wpis.email || 'osoba usunięta');
    const ikona = { INSERT: 'plus', DELETE: 'trash-2', UPDATE: 'pencil', KOPIA: 'hard-drive-upload' }[wpis.operacja] || 'dot';
    return `
        <li class="flex gap-3 py-2 border-t border-[var(--border)] first:border-t-0">
            <i data-lucide="${ikona}" class="w-4 h-4 mt-0.5 shrink-0 text-[var(--muted)]" aria-hidden="true"></i>
            <div class="min-w-0 text-xs">
                <p class="font-semibold break-words">${esc(opis.tekst)}</p>
                ${opis.szczegoly.length ? `<ul class="text-[11px] text-[var(--muted)]">${opis.szczegoly.map(sz => `<li class="break-words">${esc(sz)}</li>`).join('')}</ul>` : ''}
                <p class="text-[10px] text-[var(--muted)]"><time datetime="${esc(wpis.kiedy)}">${esc(czasWpisuHistorii(wpis.kiedy))}</time> · ${esc(kto)}</p>
            </div>
        </li>`;
}

function rysujHistorie() {
    const lista = document.getElementById('hist-lista');
    if (!lista) return;
    document.getElementById('hist-budzet').innerText = `· ${nazwaBudzetu().toLowerCase()}`;
    const btn = document.getElementById('btn-hist-odswiez');
    btn.disabled = historia.ladowanie || !!stan.trybOffline;

    if (!stan.trybOffline && !historia.ladowanie &&
        (historia.budzet !== stan.budzet || Date.now() - historia.pobrano > HISTORIA_WAZNA_MS)) {
        setTimeout(odswiezHistorie, 0);
    }
    let html;
    if (stan.trybOffline) {
        html = '<p class="text-xs text-[var(--muted)]">Historia jest dostępna tylko z internetem.</p>';
    } else if (historia.budzet !== stan.budzet) {
        html = '<p role="status" class="text-xs text-[var(--muted)]">Wczytywanie…</p>';
    } else if (historia.blad) {
        html = `<p role="alert" class="text-xs text-[var(--c-spend)]">${esc(historia.blad)}</p>`;
    } else if (historia.wpisy === null) {
        html = '<p role="status" class="text-xs text-[var(--muted)]">Wczytywanie…</p>';
    } else if (!historia.wpisy.length) {
        html = '<p class="text-xs text-[var(--muted)]">Brak wpisów – historia zbiera zmiany od uruchomienia migracji 2026-11g.</p>';
    } else {
        html = `<ul>${historia.wpisy.map(htmlWpisuHistorii).join('')}</ul>` +
            (historia.wpisy.length >= LIMIT_HISTORII ? `<p class="text-[10px] text-[var(--muted)] pt-2">Pokazano ${LIMIT_HISTORII} najnowszych wpisów.</p>` : '');
    }
    if (wstawHtml(lista, html, true)) odswiezIkony();
}

function resetujHistorie() {
    historia = { budzet: null, wpisy: null, ladowanie: false, blad: '', pobrano: 0 };
}
