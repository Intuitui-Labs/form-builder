import { describe, it, expect, vi } from 'vitest';
import { StandardFetchAddressAdapter } from '../src/adapters/geo/StandardFetchAddressAdapter.js';
import { CompositeAddressAutofillAdapter } from '../src/adapters/geo/CompositeAddressAutofillAdapter.js';
import { LkEduGeoAddressAdapter } from '../src/adapters/geo/LkEduGeoAddressAdapter.js';
import { BrowserGeolocationAdapter } from '../src/adapters/geo/BrowserGeolocationAdapter.js';
import { BrowserContactPickerAdapter } from '../src/adapters/geo/BrowserContactPickerAdapter.js';
import type { IAddressAutofillPort, AddressCandidate } from '../src/ports/IAddressAutofillPort.js';

describe('Heuristic Address Resilience & Hostile Fail-Safe Defenses', () => {
  it('StandardFetchAddressAdapter safely handles complete network failure and HTTP 500 without crashing', async () => {
    // 1. Complete network drop (fetch rejects)
    const failingFetch = vi.fn().mockRejectedValue(new Error('Failed to fetch (DNS resolution failed)'));
    const adapter = new StandardFetchAddressAdapter({
      fetchFn: failingFetch as unknown as typeof fetch,
      timeoutMs: 100,
    });

    const searchResults = await adapter.searchAddresses({ query: 'Main Street' });
    expect(searchResults).toEqual([]);

    const reverseResult = await adapter.lookupByCoordinates({ latitude: 6.9271, longitude: 79.8612 });
    expect(reverseResult).toBeNull();

    const postalResult = await adapter.lookupByPostalCode({ postalCode: '00100' });
    expect(postalResult).toBeNull();

    // 2. HTTP 500 Internal Server Error
    const serverErrorFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });
    const errorAdapter = new StandardFetchAddressAdapter({
      fetchFn: serverErrorFetch as unknown as typeof fetch,
      timeoutMs: 100,
    });

    const errorResults = await errorAdapter.searchAddresses({ query: '123 Market' });
    expect(errorResults).toEqual([]);
  });

  it('StandardFetchAddressAdapter enforces strict timeout budget and aborts hung requests', async () => {
    // Hanging request that takes 2000ms
    const hungFetch = vi.fn().mockImplementation((_url, options) => {
      return new Promise((_resolve, reject) => {
        const signal = options?.signal as AbortSignal | undefined;
        if (signal) {
          signal.addEventListener('abort', () => {
            reject(new Error('Aborted'));
          });
        }
      });
    });

    const timeoutAdapter = new StandardFetchAddressAdapter({
      fetchFn: hungFetch as unknown as typeof fetch,
      timeoutMs: 50, // 50ms timeout threshold
    });

    const start = Date.now();
    const results = await timeoutAdapter.searchAddresses({ query: 'High Street' });
    const elapsed = Date.now() - start;

    expect(results).toEqual([]);
    expect(elapsed).toBeLessThan(500); // Must resolve quickly without hanging the form
  });

  it('StandardFetchAddressAdapter respects external AbortController to neutralize async race conditions', async () => {
    const controller = new AbortController();
    const abortableFetch = vi.fn().mockImplementation((_url, options) => {
      return new Promise((_resolve, reject) => {
        const signal = options?.signal as AbortSignal | undefined;
        if (signal) {
          signal.addEventListener('abort', () => reject(new Error('Aborted by caller')));
        }
      });
    });

    const adapter = new StandardFetchAddressAdapter({
      fetchFn: abortableFetch as unknown as typeof fetch,
      timeoutMs: 2000,
    });

    // Fire query and immediately abort it (simulating fast user backspace/typing)
    const promise = adapter.searchAddresses({
      query: 'Colom',
      signal: controller.signal,
    });

    controller.abort();

    const results = await promise;
    expect(results).toEqual([]);
  });

  it('CompositeAddressAutofillAdapter catches hostile unhandled provider exceptions and falls back cleanly', async () => {
    const hostileFailingProvider: IAddressAutofillPort = {
      providerId: 'hostile-failing',
      searchAddresses: vi.fn().mockRejectedValue(new Error('Fatal remote service explosion')),
      lookupByCoordinates: vi.fn().mockRejectedValue(new Error('Geocoding quota exceeded')),
      lookupByPostalCode: vi.fn().mockRejectedValue(new Error('Database lock deadlock')),
    };

    const reliableSecondaryProvider: IAddressAutofillPort = {
      providerId: 'reliable-secondary',
      searchAddresses: vi.fn().mockResolvedValue([
        {
          id: 'cand_1',
          formattedAddress: 'Backup Address 1',
          addressLine1: 'Backup St',
          city: 'Backup City',
          postalCode: '12345',
          country: 'US',
          countryCode: 'US',
        },
      ]),
      lookupByCoordinates: vi.fn().mockResolvedValue({
        id: 'rev_1',
        formattedAddress: 'Fallback Coordinates Address',
        addressLine1: 'Fallback St',
        city: 'Fallback City',
        postalCode: '54321',
        country: 'US',
        countryCode: 'US',
      }),
      lookupByPostalCode: vi.fn().mockResolvedValue({
        city: 'Resolved City',
        countyOrDistrict: 'Resolved County',
      }),
    };

    const composite = new CompositeAddressAutofillAdapter([
      hostileFailingProvider,
      reliableSecondaryProvider,
    ]);

    // Search fallback
    const searchRes = await composite.searchAddresses({ query: 'test' });
    expect(searchRes).toHaveLength(1);
    expect(searchRes[0].addressLine1).toBe('Backup St');

    // Coordinates fallback
    const coordRes = await composite.lookupByCoordinates({ latitude: 10, longitude: 20 });
    expect(coordRes?.addressLine1).toBe('Fallback St');

    // Postal code fallback
    const postalRes = await composite.lookupByPostalCode({ postalCode: '12345' });
    expect(postalRes?.city).toBe('Resolved City');
  });

  it('LkEduGeoAddressAdapter cascades to fallbackProvider when postal code is foreign or not found in Sri Lanka', async () => {
    const emptyLkGeo = {
      getPostalUnitByCode: vi.fn().mockReturnValue(undefined),
      inferFromPostalCode: vi.fn().mockReturnValue(null),
    };

    const fallbackGlobalProvider: IAddressAutofillPort = {
      providerId: 'global-fallback',
      searchAddresses: vi.fn().mockResolvedValue([]),
      lookupByCoordinates: vi.fn().mockResolvedValue(null),
      lookupByPostalCode: vi.fn().mockResolvedValue({
        postalCode: 'SW1A 1AA',
        city: 'London',
        country: 'United Kingdom',
        countryCode: 'GB',
      }),
    };

    const lkAdapter = new LkEduGeoAddressAdapter({
      geoModule: emptyLkGeo,
      fallbackProvider: fallbackGlobalProvider,
    });

    const result = await lkAdapter.lookupByPostalCode({ postalCode: 'SW1A 1AA' });
    expect(result).toEqual({
      postalCode: 'SW1A 1AA',
      city: 'London',
      country: 'United Kingdom',
      countryCode: 'GB',
    });
  });

  it('BrowserGeolocationAdapter handles permission denials, timeouts, and non-supported environments safely', async () => {
    // 1. Not supported environment
    const reverseMock: IAddressAutofillPort = {
      providerId: 'mock',
      searchAddresses: vi.fn().mockResolvedValue([]),
      lookupByCoordinates: vi.fn().mockResolvedValue(null),
      lookupByPostalCode: vi.fn().mockResolvedValue(null),
    };

    const adapter = new BrowserGeolocationAdapter({ reverseGeocoder: reverseMock });

    // In Node test environment, navigator.geolocation is undefined
    const unsupportedResult = await adapter.acquireCurrentAddress();
    expect(unsupportedResult.success).toBe(false);
    expect(unsupportedResult.reason).toBe('not_supported');

    // 2. Permission denied simulation
    const mockNav = {
      geolocation: {
        getCurrentPosition: vi.fn().mockImplementation((_success, error) => {
          error({ code: 1, message: 'User denied Geolocation' });
        }),
      },
    };

    try {
      vi.stubGlobal('navigator', mockNav);

      const deniedResult = await adapter.acquireCurrentAddress();
      expect(deniedResult.success).toBe(false);
      expect(deniedResult.reason).toBe('permission_denied');

      // 3. Successful location + reverse geocoding
      const candidate: AddressCandidate = {
        id: 'gps_1',
        formattedAddress: '1 Galle Face, Colombo 01',
        addressLine1: '1 Galle Face',
        city: 'Colombo 01',
        countyOrDistrict: 'Colombo',
        stateOrProvince: 'Western Province',
        postalCode: '00100',
        country: 'Sri Lanka',
        countryCode: 'LK',
      };
      reverseMock.lookupByCoordinates = vi.fn().mockResolvedValue(candidate);

      mockNav.geolocation.getCurrentPosition = vi.fn().mockImplementation((success) => {
        success({
          coords: { latitude: 6.9271, longitude: 79.8612 },
        });
      });

      const successResult = await adapter.acquireCurrentAddress();
      expect(successResult.success).toBe(true);
      expect(successResult.candidate?.addressLine1).toBe('1 Galle Face');
      expect(successResult.coordinates).toEqual({ latitude: 6.9271, longitude: 79.8612 });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('BrowserContactPickerAdapter safely handles unsupported browsers and user dismissals', async () => {
    const contactAdapter = new BrowserContactPickerAdapter();

    // 1. Unsupported browser check
    expect(contactAdapter.isSupported()).toBe(false);
    const noSupportContacts = await contactAdapter.pickContact();
    expect(noSupportContacts).toEqual([]);

    // 2. Supported browser with user selecting contact
    const mockContacts = {
      contacts: {
        select: vi.fn().mockResolvedValue([
          {
            name: ['Ada Lovelace'],
            email: ['ada@analytical.engine'],
            tel: ['+44 7700 900077'],
            address: [
              {
                addressLine: ['12 St James Square'],
                city: 'London',
                postalCode: 'SW1Y 4LE',
                country: 'UK',
              },
            ],
          },
        ]),
      },
    };

    try {
      vi.stubGlobal('navigator', mockContacts);
      expect(contactAdapter.isSupported()).toBe(true);

      const picked = await contactAdapter.pickContact();
      expect(picked).toHaveLength(1);
      expect(picked[0].name).toBe('Ada Lovelace');
      expect(picked[0].email).toBe('ada@analytical.engine');
      expect(picked[0].address?.city).toBe('London');

      // 3. User cancels / dialog closed throws error
      mockContacts.contacts.select = vi.fn().mockRejectedValue(new Error('User cancelled'));
      const cancelled = await contactAdapter.pickContact();
      expect(cancelled).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
