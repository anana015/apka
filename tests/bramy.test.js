import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zbudujIndeksy } from '../js/dane.js';
import {
  bramaJednostki, bramyDoZrobienia, czyIos, linkSms, polecenieDodania, polecenieUsuniecia, stanBramKlienta,
  telefonMiedzynarodowy, wiadomoscDlaKlienta, wolnaPozycja,
} from '../js/bramy.js';

const B1 = { id: 'g1', numer: 1, sim_phone: '+48500000001', password: '1234', first_slot: 200 };
const B2 = { id: 'g2', numer: 2, sim_phone: '+48500000002', password: '9999', first_slot: 200, remove_template: '{haslo}#DEL#{pozycja}#' };

test('brama jednostki: rzędy (garaże, kontenery) → 1, boxy → 2', () => {
  assert.equal(bramaJednostki({ code: 'G05R1', type: 'garaz' }), 1);
  assert.equal(bramaJednostki({ code: 'K12R4', type: 'kontener' }), 1);
  assert.equal(bramaJednostki({ code: 'B01XS', type: 'box_maly' }), 2);
  assert.equal(bramaJednostki({ code: 'B02XL', type: 'box_duzy' }), 2);
});

test('telefon, polecenia, SMS do klienta i link sms: na iPhone i Androidzie', () => {
  assert.equal(telefonMiedzynarodowy('600 100-200'), '+48600100200');
  assert.equal(telefonMiedzynarodowy('0048600100200'), '+48600100200');
  assert.equal(telefonMiedzynarodowy('+48 600 100 200'), '+48600100200');
  assert.equal(telefonMiedzynarodowy('12345'), null);
  assert.equal(polecenieDodania(B1, { telefon: '+48600100200', pozycja: 200 }), '1234#TEL#+48600100200#200#');
  assert.equal(polecenieUsuniecia(B1, { telefon: '+48600100200', pozycja: 200 }), null);
  assert.equal(polecenieUsuniecia(B2, { telefon: '+48600100200', pozycja: 201 }), '9999#DEL#201#');
  assert.match(wiadomoscDlaKlienta(B1, { telefon: '+48600100200' }), /bramy 1.*\+48500000001/);
  assert.equal(linkSms('+48 500 000 001', 'a#b c', true), 'sms:+48500000001&body=a%23b%20c');
  assert.equal(linkSms('+48500000001', 'x', false), 'sms:+48500000001?body=x');
  assert.equal(czyIos('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5), true);
  assert.equal(czyIos('Mozilla/5.0 (Linux; Android 14)', 5), false);
});

test('wolna pozycja: od 200, zwolnione wracają do puli, limit sterownika', () => {
  const d = [{ gate_id: 'g1', slot: 200 }, { gate_id: 'g1', slot: 201, removed_on: '2026-11-01' }, { gate_id: 'g1', slot: 202 },
    { gate_id: 'g2', slot: 201 }, { gate_id: 'g1', slot: null }];
  assert.equal(wolnaPozycja(B1, d), 201);
  assert.equal(wolnaPozycja({ ...B1, max_slot: 200 }, d), null);
});

function stan() {
  const dane = {
    gates: [B1, B2],
    bank_accounts: [], rental_rates: [],
    clients: [{ id: 'k1', name: 'Anna' }, { id: 'k2', name: 'Bartek' }, { id: 'k3', name: 'Celina' }],
    contracts: [{ id: 'u1', client_id: 'k1' }, { id: 'u2', client_id: 'k2' }, { id: 'u3', client_id: 'k3' }],
    units: [{ id: 'j1', code: 'G01R1', type: 'garaz' }, { id: 'j2', code: 'B01XS', type: 'box_maly' }, { id: 'j3', code: 'G02R2', type: 'garaz' }],
    rentals: [
      // Anna: garaż wypowiedziany do 30.11, box trwa → brama 1 do usunięcia 03.12, brama 2 zostaje
      { id: 'n1', contract_id: 'u1', unit_id: 'j1', start_on: '2026-01-01', notice_end_on: '2026-11-30' },
      { id: 'n2', contract_id: 'u1', unit_id: 'j2', start_on: '2026-01-01' },
      // Bartek: nowy najem od grudnia, bez dostępu → do przypisania
      { id: 'n3', contract_id: 'u2', unit_id: 'j3', start_on: '2026-12-01' },
    ],
    gate_access: [
      { id: 'a1', gate_id: 'g1', client_id: 'k1', phone: '+48600000001', slot: 200, added_on: '2026-01-01' },
      { id: 'a2', gate_id: 'g2', client_id: 'k1', phone: '+48600000001', slot: 200, added_on: '2026-01-01' },
      // Celina nie ma już najmów, a ma dostęp → do usunięcia od razu
      { id: 'a3', gate_id: 'g1', client_id: 'k3', phone: '+48600000003', slot: null, added_on: '2025-01-01' },
    ],
  };
  return { dane, indeksy: zbudujIndeksy(dane) };
}

test('stan bram klienta: koniec okresu wypowiedzenia + 3 dni, inna jednostka za tą samą bramą wstrzymuje usunięcie', () => {
  const s = stan();
  const anna = stanBramKlienta(s, 'k1', '2026-11-11');
  assert.equal(anna.find((b) => b.numer === 1).usunOd, '2026-12-03');
  assert.equal(anna.find((b) => b.numer === 2).usunOd, null);
  assert.equal(anna.find((b) => b.numer === 1).potrzebna, false);
  // drugi garaż Anny za bramą 1 bez końca → nie usuwamy
  s.dane.rentals.push({ id: 'n4', contract_id: 'u1', unit_id: 'j3', start_on: '2026-05-01' });
  s.indeksy = zbudujIndeksy(s.dane);
  assert.equal(stanBramKlienta(s, 'k1', '2026-12-10').find((b) => b.numer === 1).usunOd, null);
});

test('lista do zrobienia: do przypisania (także przyszły najem) i do usunięcia po terminie', () => {
  const s = stan();
  const l = bramyDoZrobienia(s, '2026-11-11');
  assert.deepEqual(l.doPrzypisania.map((x) => `${x.klient.name}/${x.numer}`), ['Bartek/1']);
  assert.deepEqual(l.doUsuniecia.map((x) => `${x.klient.name}/${x.numer}`), ['Celina/1']);
  const pozniej = bramyDoZrobienia(s, '2026-12-03');
  assert.deepEqual(pozniej.doUsuniecia.map((x) => `${x.klient.name}/${x.numer}`).sort(), ['Anna/1', 'Celina/1']);
});
