import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { zbudujIndeksy } from '../js/dane.js';
import {
  daneUmowy, kwotaSlownie, liczbaSlownie, nazwaPlikuUmowy, polaWzoru, PUSTE_MIEJSCE, wypelnijDocx, wypelnijXml,
} from '../js/umowy.js';

test('kwota słownie: odmiana złotych, tysiące, grosze', () => {
  assert.equal(liczbaSlownie(0), 'zero');
  assert.equal(liczbaSlownie(1), 'jeden');
  assert.equal(liczbaSlownie(12), 'dwanaście');
  assert.equal(liczbaSlownie(330), 'trzysta trzydzieści');
  assert.equal(liczbaSlownie(1000), 'tysiąc');
  assert.equal(liczbaSlownie(2215), 'dwa tysiące dwieście piętnaście');
  assert.equal(liczbaSlownie(15000), 'piętnaście tysięcy');
  assert.equal(kwotaSlownie(33000), 'trzysta trzydzieści złotych 00/100');
  assert.equal(kwotaSlownie(100), 'jeden złoty 00/100');
  assert.equal(kwotaSlownie(18250), 'sto osiemdziesiąt dwa złote 50/100');
  assert.equal(kwotaSlownie(1200000), 'dwanaście tysięcy złotych 00/100');
});

test('wypelnijXml: pole podzielone przez Worda na kilka fragmentów, formatowanie i spacje', () => {
  const xml = '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Najemca: {{kli</w:t></w:r><w:proofErr w:type="spellStart"/>'
    + '<w:r><w:t>ent</w:t></w:r><w:r><w:t>}}, lokal {{ jednostka }}</w:t></w:r></w:p>'
    + '<w:p><w:r><w:t xml:space="preserve">Czynsz {{stawka}} ({{stawka_slownie}}). {{nieznane_pole}} {{pesel_x}} {{klient_pesel}}</w:t></w:r></w:p>';
  const w = wypelnijXml(xml, { klient: 'Jan & Anna <Nowak>', jednostka: 'G-03', stawka: '330,00 zł', stawka_slownie: 'trzysta' });
  assert.match(w.xml, /<w:t xml:space="preserve">Najemca: Jan &amp; Anna &lt;Nowak&gt;<\/w:t>/);
  assert.match(w.xml, /<w:t xml:space="preserve"><\/w:t>/);   // środkowy fragment opróżniony
  assert.match(w.xml, /, lokal G-03/);
  assert.match(w.xml, /Czynsz 330,00 zł \(trzysta\)/);
  assert.ok(w.xml.includes(`${PUSTE_MIEJSCE}`), 'brak PESEL → miejsce do wpisania');
  assert.ok(w.xml.includes('{{nieznane_pole}}'), 'nieznane pole zostaje bez zmian');
  assert.deepEqual(w.nieznane.sort(), ['nieznane_pole', 'pesel_x']);
  assert.deepEqual(w.puste, ['klient_pesel']);
  assert.ok(w.xml.includes('<w:proofErr w:type="spellStart"/>'));
});

async function wzorDocx(tresc) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${tresc}</w:body></w:document>`);
  zip.file('word/footer1.xml', '<w:ftr><w:p><w:r><w:t>Umowa {{numer_umowy}}</w:t></w:r></w:p></w:ftr>');
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('wypelnijDocx i polaWzoru: treść i stopka, odrzucenie pliku, który nie jest .docx', async () => {
  const wzor = await wzorDocx('<w:p><w:r><w:t>{{klient}}</w:t></w:r><w:r><w:t>, {{kaucja}}</w:t></w:r></w:p>');
  assert.deepEqual((await polaWzoru(JSZip, wzor)).pola.sort(), ['kaucja', 'klient', 'numer_umowy']);
  const w = await wypelnijDocx(JSZip, wzor, { klient: 'Jan Nowak', numer_umowy: '12/2026' }, { typ: 'nodebuffer' });
  const zip = await JSZip.loadAsync(w.plik);
  assert.match(await zip.file('word/document.xml').async('string'), /Jan Nowak/);
  assert.match(await zip.file('word/footer1.xml').async('string'), /Umowa 12\/2026/);
  assert.deepEqual(w.puste, ['kaucja']);
  await assert.rejects(polaWzoru(JSZip, Buffer.from('to nie zip')), /nie jest plik Word/);
});

test('daneUmowy: klient, dwie jednostki, promocja, kaucja, konto, dokument', () => {
  const dane = {
    clients: [{ id: 'k1', name: 'Jan Nowak', address: 'ul. Polna 1, 00-001 Wieś', phone: '600100200', email: 'j@n.pl',
      pesel: '44051401359', doc_type: 'dowod', doc_number: 'ABC123456' }],
    contracts: [{ id: 'u1', client_id: 'k1', number: '7/2026', signed_on: null, valid_until: null, notice_period: '1 miesiąc' }],
    units: [{ id: 'j1', code: 'G-03', type: 'garaz', area_m2: 18 }, { id: 'j2', code: 'B-12', type: 'box_maly', area_m2: 4.5 }],
    rentals: [
      { id: 'n1', contract_id: 'u1', unit_id: 'j1', start_on: '2026-12-01', billing_day: 20, pay_method: 'przelew', bank_account_id: 'b1' },
      { id: 'n2', contract_id: 'u1', unit_id: 'j2', start_on: '2026-12-01', billing_day: 20, pay_method: 'przelew', bank_account_id: 'b1' },
    ],
    rental_rates: [
      { rental_id: 'n1', valid_from: '2026-12-01', amount_gr: 33000 },
      { rental_id: 'n2', valid_from: '2026-12-01', amount_gr: 9000, reason: 'Promocja startowa' },
      { rental_id: 'n2', valid_from: '2027-02-01', amount_gr: 18000, reason: 'koniec promocji' },
    ],
    deposits: [{ contract_id: 'u1', kind: 'przyjecie', amount_gr: 50000 }],
    bank_accounts: [{ id: 'b1', name: 'Nest', iban: '12345678901234567890123456' }],
    payments: [],
  };
  const s = { dane, indeksy: zbudujIndeksy(dane) };
  const w = Object.fromEntries(Object.entries(daneUmowy(s, { klientId: 'k1', najemIds: ['n1', 'n2'], dzis: '2026-11-11' }))
    .map(([k, v]) => [k, v.replace(/\s/g, ' ')]));   // formatZl daje twardą spację
  assert.equal(w.jednostka, 'B-12, G-03');
  assert.equal(w.jednostka_typ, 'box xs (mały), garaż');
  assert.equal(w.jednostka_powierzchnia, '22,5 m²');
  assert.equal(w.stawka, '510,00 zł');
  assert.equal(w.stawka_poczatkowa, '420,00 zł');
  assert.equal(w.promocja_do, '31.01.2027');
  assert.equal(w.kaucja_slownie, 'pięćset złotych 00/100');
  assert.equal(w.klient_dokument, 'dowód osobisty ABC123456');
  assert.equal(w.forma_platnosci, 'przelewem na rachunek nr 12 3456 7890 1234 5678 9012 3456');
  assert.equal(w.umowa_do, 'czas nieokreślony');
  assert.equal(w.data_umowy, '11.11.2026');
  assert.equal(w.dzien_platnosci, '20');
  assert.equal(nazwaPlikuUmowy(w, '2026-11-11'), 'Umowa_B-12_G-03_Jan_Nowak_2026-11-11.docx');
});
