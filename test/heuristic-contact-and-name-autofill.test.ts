import { describe, it, expect, vi } from 'vitest';
import { NameParser } from '../src/affordance/NameParser.js';
import { ContactFieldMapper } from '../src/affordance/ContactFieldMapper.js';
import { FormManager } from '../src/manager/FormManager.js';
import { MultiStepFormManager } from '../src/manager/MultiStepFormManager.js';
import type { FormSchema, FormField } from '../src/schema/FormSchema.js';
import type { PickedContact, AddressCandidate } from '../src/ports/IAddressAutofillPort.js';
import { MemoryStorageAdapter } from '../src/adapters/storage/MemoryStorageAdapter.js';

describe('Heuristic Name Decomposition Engine (NameParser)', () => {
  it('correctly decomposes mononyms (single name) without phantom surnames', () => {
    const plato = NameParser.parse('Plato');
    expect(plato.firstName).toBe('Plato');
    expect(plato.lastName).toBe('');
    expect(plato.middleName).toBeUndefined();

    const cher = NameParser.parse('  Cher ');
    expect(cher.firstName).toBe('Cher');
    expect(cher.lastName).toBe('');
  });

  it('correctly parses standard two-word names', () => {
    const ada = NameParser.parse('Ada Lovelace');
    expect(ada.firstName).toBe('Ada');
    expect(ada.lastName).toBe('Lovelace');
    expect(ada.prefix).toBeUndefined();
    expect(ada.suffix).toBeUndefined();
  });

  it('correctly parses names with honorific prefixes and post-nominal suffixes', () => {
    const mlk = NameParser.parse('Dr. Martin Luther King Jr.');
    expect(mlk.prefix).toBe('Dr.');
    expect(mlk.firstName).toBe('Martin');
    expect(mlk.middleName).toBe('Luther');
    expect(mlk.lastName).toBe('King');
    expect(mlk.suffix).toBe('Jr.');

    const prof = NameParser.parse('Prof. Albert Einstein PhD');
    expect(prof.prefix).toBe('Prof.');
    expect(prof.firstName).toBe('Albert');
    expect(prof.lastName).toBe('Einstein');
    expect(prof.suffix).toBe('PhD');
  });

  it('correctly preserves multi-part compound surnames with particles (Germanic, Dutch, Romance, Arabic)', () => {
    const vanGogh = NameParser.parse('Vincent van Gogh');
    expect(vanGogh.firstName).toBe('Vincent');
    expect(vanGogh.lastName).toBe('van Gogh');

    const vonDerLeyen = NameParser.parse('Ursula von der Leyen');
    expect(vonDerLeyen.firstName).toBe('Ursula');
    expect(vonDerLeyen.lastName).toBe('von der Leyen');

    const daVinci = NameParser.parse('Leonardo da Vinci');
    expect(daVinci.firstName).toBe('Leonardo');
    expect(daVinci.lastName).toBe('da Vinci');

    const ibnZiyad = NameParser.parse('Tariq ibn Ziyad');
    expect(ibnZiyad.firstName).toBe('Tariq');
    expect(ibnZiyad.lastName).toBe('ibn Ziyad');
  });

  it('handles inverted official/directory comma format ("Last, First")', () => {
    const inverted = NameParser.parse('Lovelace, Ada');
    expect(inverted.firstName).toBe('Ada');
    expect(inverted.lastName).toBe('Lovelace');

    const complexInverted = NameParser.parse('King, Jr., Martin Luther');
    expect(complexInverted.firstName).toBe('Martin');
    expect(complexInverted.middleName).toBe('Luther');
    expect(complexInverted.lastName).toBe('King');
    expect(complexInverted.suffix).toBe('Jr.');
  });

  it('handles South Asian / Sri Lankan names with initials', () => {
    const kpSilva = NameParser.parse('K. P. Silva');
    expect(kpSilva.firstName).toBe('K. P.');
    expect(kpSilva.lastName).toBe('Silva');

    const wmMendis = NameParser.parse('W. M. Mendis');
    expect(wmMendis.firstName).toBe('W. M.');
    expect(wmMendis.lastName).toBe('Mendis');
  });

  it('is fail-safe on empty strings and punctuation', () => {
    const empty = NameParser.parse('');
    expect(empty.firstName).toBe('');
    expect(empty.lastName).toBe('');

    const spaces = NameParser.parse('     ');
    expect(spaces.firstName).toBe('');
    expect(spaces.lastName).toBe('');
  });
});

describe('ContactFieldMapper & Native Contact Unpacking', () => {
  it('infers field mappings from schema fields using semanticIntent and names', () => {
    const fields: FormField[] = [
      { id: '1', name: 'user_full_name', type: 'text', label: 'Full Name', semanticIntent: 'name-full', order: 0 },
      { id: '2', name: 'user_first_name', type: 'text', label: 'First Name', semanticIntent: 'name-given', order: 1 },
      { id: '3', name: 'user_middle_name', type: 'text', label: 'Middle Name', semanticIntent: 'name-middle', order: 2 },
      { id: '4', name: 'user_last_name', type: 'text', label: 'Last Name', semanticIntent: 'name-family', order: 3 },
      { id: '5', name: 'email_addr', type: 'email', label: 'Email', semanticIntent: 'contact-email', order: 4 },
      { id: '6', name: 'phone_num', type: 'tel', label: 'Phone', semanticIntent: 'contact-phone', order: 5 },
      { id: '7', name: 'street_address', type: 'text', label: 'Street', semanticIntent: 'address-line1', order: 6 },
      { id: '8', name: 'city_name', type: 'text', label: 'City', semanticIntent: 'address-city', order: 7 },
      { id: '9', name: 'zip_code', type: 'text', label: 'ZIP', semanticIntent: 'address-postal-code', order: 8 },
    ];

    const map = ContactFieldMapper.inferFieldMap(fields);
    expect(map.fullName).toBe('user_full_name');
    expect(map.firstName).toBe('user_first_name');
    expect(map.middleName).toBe('user_middle_name');
    expect(map.lastName).toBe('user_last_name');
    expect(map.email).toBe('email_addr');
    expect(map.phone).toBe('phone_num');
    expect(map.addressLine1).toBe('street_address');
    expect(map.city).toBe('city_name');
    expect(map.postalCode).toBe('zip_code');
  });

  it('maps PickedContact payload with decomposed name, phone, email, and unpacked address', () => {
    const contact: PickedContact = {
      name: 'Dr. Jane Alice Doe Jr.',
      email: 'jane.doe@example.org',
      tel: '+1 555-0199',
      address: {
        addressLine: ['742 Evergreen Terrace', 'Apt 2B'],
        city: 'Springfield',
        region: 'Oregon',
        postalCode: '97477',
        country: 'USA',
      },
    };

    const fieldMap = {
      fullName: 'name',
      prefix: 'title',
      firstName: 'first',
      middleName: 'middle',
      lastName: 'last',
      suffix: 'suffix',
      email: 'contact_email',
      phone: 'mobile',
      addressLine1: 'street',
      addressLine2: 'suite',
      city: 'city',
      stateOrProvince: 'state',
      postalCode: 'postal',
      country: 'country',
    };

    const values = ContactFieldMapper.contactToFormValues(contact, fieldMap);

    expect(values).toEqual({
      name: 'Dr. Jane Alice Doe Jr.',
      title: 'Dr.',
      first: 'Jane',
      middle: 'Alice',
      last: 'Doe',
      suffix: 'Jr.',
      contact_email: 'jane.doe@example.org',
      mobile: '+1 555-0199',
      street: '742 Evergreen Terrace',
      suite: 'Apt 2B',
      city: 'Springfield',
      state: 'Oregon',
      postal: '97477',
      country: 'USA',
    });
  });
});

describe('FormManager & MultiStepFormManager Contact Enrichment Integration', () => {
  it('enriches single-step FormManager from PickedContact with DAG recalculations and user agency', () => {
    const manager = new FormManager<{
      name: string;
      first: string;
      last: string;
      email: string;
      phone: string;
      displayName: string;
    }>({
      fields: {
        name: { type: 'text', semanticIntent: 'name-full' },
        first: { type: 'text', semanticIntent: 'name-given' },
        last: { type: 'text', semanticIntent: 'name-family' },
        email: { type: 'email', semanticIntent: 'contact-email' },
        phone: { type: 'tel', semanticIntent: 'contact-phone' },
        displayName: {
          type: 'text',
          computed: {
            dependsOn: ['first', 'last'],
            fn: (v) => `${v.first || ''} ${v.last || ''}`.trim(),
          },
        },
      },
      onSubmit: vi.fn(),
    });

    // User pre-filled email
    manager.setFieldValue('email', 'custom-user-email@domain.com');

    const result = manager.enrichFromContact(
      {
        name: 'Ada Lovelace',
        email: 'ada@analytical.org',
        tel: '+44 7700 900077',
      },
      {
        overwritePolicy: 'preserve-user-edits',
      },
    );

    expect(result.appliedFields).toContain('name');
    expect(result.appliedFields).toContain('first');
    expect(result.appliedFields).toContain('last');
    expect(result.appliedFields).toContain('phone');
    expect(result.skippedFields).toContainEqual(
      expect.objectContaining({
        field: 'email',
        reason: 'user_edited',
      }),
    );

    const state = manager.getState();
    expect(state.values.first).toBe('Ada');
    expect(state.values.last).toBe('Lovelace');
    expect(state.values.displayName).toBe('Ada Lovelace');
    expect(state.values.email).toBe('custom-user-email@domain.com');
  });

  it('MultiStepFormManager performs cross-page contact enrichment and auto-persists draft', async () => {
    const storage = new MemoryStorageAdapter();
    const onSubmit = vi.fn();

    const schema: FormSchema = {
      id: 'onboarding-wizard',
      title: 'Customer Onboarding',
      pages: [
        {
          id: 'step_identity',
          title: 'Identity',
          fields: [
            { id: 'f1', name: 'first_name', type: 'text', label: 'First Name', semanticIntent: 'name-given', order: 0 },
            { id: 'f2', name: 'last_name', type: 'text', label: 'Last Name', semanticIntent: 'name-family', order: 1 },
            { id: 'f3', name: 'email', type: 'email', label: 'Email', semanticIntent: 'contact-email', order: 2 },
          ],
        },
        {
          id: 'step_address',
          title: 'Billing Address',
          fields: [
            { id: 'f4', name: 'street', type: 'text', label: 'Street', semanticIntent: 'address-line1', order: 0 },
            { id: 'f5', name: 'city', type: 'text', label: 'City', semanticIntent: 'address-city', order: 1 },
            { id: 'f6', name: 'postal_code', type: 'text', label: 'Postal Code', semanticIntent: 'address-postal-code', order: 2 },
          ],
        },
      ],
    };

    const manager = new MultiStepFormManager<{
      first_name: string;
      last_name: string;
      email: string;
      street: string;
      city: string;
      postal_code: string;
    }>(schema, onSubmit, {
      resilience: {
        storage,
        autoSaveDraft: true,
      },
    });

    const contactPayload: PickedContact = {
      name: 'Vincent van Gogh',
      email: 'vincent@arles.fr',
      tel: '+33 4 90 00 00',
      address: {
        addressLine: ['2 Place Lamartine'],
        city: 'Arles',
        postalCode: '13200',
        country: 'France',
      },
    };

    // Enrich across step 1 and step 2 fields in a single transaction
    const result = manager.enrichFromContact(contactPayload);

    expect([...result.appliedFields].sort()).toEqual([
      'street',
      'city',
      'postal_code',
      'first_name',
      'last_name',
      'email',
    ].sort());

    const state = manager.getState();
    expect(state.values.first_name).toBe('Vincent');
    expect(state.values.last_name).toBe('van Gogh');
    expect(state.values.email).toBe('vincent@arles.fr');
    expect(state.values.street).toBe('2 Place Lamartine');
    expect(state.values.city).toBe('Arles');
    expect(state.values.postal_code).toBe('13200');

    // Verify origin audit trail
    expect(manager.getFieldOrigin('first_name')?.origin).toBe('autofill-contact');
    expect(manager.getFieldOrigin('street')?.origin).toBe('autofill-contact');

    // Verify revertEnrichedFields restores initial empty values
    const reverted = manager.revertEnrichedFields(['street', 'first_name']);
    expect(reverted).toEqual(['street', 'first_name']);
    expect(manager.getState().values.first_name).toBe('');
    expect(manager.getState().values.street).toBe('');
    // untouched enriched fields stay intact
    expect(manager.getState().values.last_name).toBe('van Gogh');
    expect(manager.getState().values.city).toBe('Arles');
  });

  it('MultiStepFormManager enriches from AddressCandidate with reverse-geocode data', () => {
    const schema: FormSchema = {
      id: 'shipping-form',
      title: 'Shipping Details',
      pages: [
        {
          id: 'shipping_page',
          title: 'Address',
          fields: [
            { id: 's1', name: 'address_line', type: 'text', label: 'Address Line', semanticIntent: 'address-line1', order: 0 },
            { id: 's2', name: 'town', type: 'text', label: 'Town / City', semanticIntent: 'address-city', order: 1 },
            { id: 's3', name: 'district_val', type: 'text', label: 'District', semanticIntent: 'address-state', order: 2 },
            { id: 's4', name: 'postcode', type: 'text', label: 'Postcode', semanticIntent: 'address-postal-code', order: 3 },
          ],
        },
      ],
    };

    const manager = new MultiStepFormManager<{
      address_line: string;
      town: string;
      district_val: string;
      postcode: string;
    }>(schema, vi.fn());

    const candidate: AddressCandidate = {
      id: 'rev_1',
      formattedAddress: 'Lotus Tower, Colombo 10',
      addressLine1: 'Lotus Tower',
      city: 'Colombo 10',
      countyOrDistrict: 'Colombo',
      postalCode: '01000',
      country: 'Sri Lanka',
      countryCode: 'LK',
    };

    const result = manager.enrichFromAddressCandidate(candidate);
    expect(result.appliedFields).toEqual(['address_line', 'town', 'district_val', 'postcode']);

    const state = manager.getState();
    expect(state.values.address_line).toBe('Lotus Tower');
    expect(state.values.town).toBe('Colombo 10');
    expect(state.values.district_val).toBe('Colombo');
    expect(state.values.postcode).toBe('01000');
  });
});
