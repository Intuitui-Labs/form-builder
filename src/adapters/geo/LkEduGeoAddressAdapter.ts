import type {
  AddressCandidate,
  AddressSearchOptions,
  IAddressAutofillPort,
  PostalCodeLookupOptions,
  ReverseGeocodeOptions,
} from '../../ports/IAddressAutofillPort.js';

export interface LkPostalUnitLike {
  id?: string;
  district_id: string;
  city: string;
  postal_code: string;
  location?: { lat: number; lng: number };
}

export interface LkDistrictLike {
  id: string;
  province_id: string;
  name: string;
  mnemonic?: string;
}

export interface LkProvinceLike {
  id: string;
  name: string;
  mnemonic?: string;
}

export interface LkEduGeoModuleLike {
  getPostalUnitByCode?(code: string): LkPostalUnitLike | undefined;
  inferFromPostalCode?(code: string): { isValid: boolean; districtId?: string; city?: string } | null;
  getDistricts?(provinceId?: string): LkDistrictLike[];
  getProvinceById?(id: string): LkProvinceLike | undefined;
  getPostalUnitsByDistrict?(districtId: string): LkPostalUnitLike[];
}

export interface LkEduGeoAdapterOptions {
  geoModule?: LkEduGeoModuleLike;
  fallbackProvider?: IAddressAutofillPort;
}

/**
 * Adapter for Sri Lankan administrative & postal geography.
 * Decoupled from physical package imports so the core form engine bundle never bakes in heavy regional data.
 * Can be instantiated with `@intuitui-labs/lk-edu-geo` or any equivalent dataset.
 */
export class LkEduGeoAddressAdapter implements IAddressAutofillPort {
  readonly providerId = 'lk-edu-geo';
  private geoModule?: LkEduGeoModuleLike;
  private fallbackProvider?: IAddressAutofillPort;

  constructor(optionsOrModule?: LkEduGeoAdapterOptions | LkEduGeoModuleLike) {
    if (optionsOrModule && ('geoModule' in optionsOrModule || 'fallbackProvider' in optionsOrModule)) {
      const opts = optionsOrModule as LkEduGeoAdapterOptions;
      this.geoModule = opts.geoModule;
      this.fallbackProvider = opts.fallbackProvider;
    } else {
      this.geoModule = optionsOrModule as LkEduGeoModuleLike | undefined;
    }
  }

  public setGeoModule(mod: LkEduGeoModuleLike): void {
    this.geoModule = mod;
  }

  async lookupByPostalCode(options: PostalCodeLookupOptions): Promise<Partial<AddressCandidate> | null> {
    const rawCode = options.postalCode?.trim() ?? '';
    if (!rawCode) return null;

    if (this.geoModule) {
      // 1. Try exact postal unit match
      let city = '';
      let districtId: string | undefined;

      if (this.geoModule.getPostalUnitByCode) {
        const unit = this.geoModule.getPostalUnitByCode(rawCode);
        if (unit) {
          city = unit.city;
          districtId = unit.district_id;
        }
      }

      // 2. Try prefix infer
      if (!districtId && this.geoModule.inferFromPostalCode) {
        const inferred = this.geoModule.inferFromPostalCode(rawCode);
        if (inferred?.isValid && inferred.districtId) {
          districtId = inferred.districtId;
          city = inferred.city || city;
        }
      }

      if (districtId) {
        let districtName = districtId;
        let provinceName = '';

        if (this.geoModule.getDistricts) {
          const allDistricts = this.geoModule.getDistricts();
          const dist = allDistricts.find((d) => d.id === districtId);
          if (dist) {
            districtName = dist.name;
            if (dist.province_id && this.geoModule.getProvinceById) {
              const prov = this.geoModule.getProvinceById(dist.province_id);
              if (prov) {
                provinceName = prov.name;
              }
            }
          }
        }

        return {
          postalCode: rawCode,
          city,
          countyOrDistrict: districtName,
          stateOrProvince: provinceName,
          country: 'Sri Lanka',
          countryCode: 'LK',
          confidenceScore: 1.0,
        };
      }
    }

    // If not resolved locally and fallback is configured, pass through
    if (this.fallbackProvider) {
      return this.fallbackProvider.lookupByPostalCode(options);
    }

    return null;
  }

  async searchAddresses(options: AddressSearchOptions): Promise<AddressCandidate[]> {
    const query = options.query?.toLowerCase().trim();
    if (!query || query.length < 2) return [];

    const candidates: AddressCandidate[] = [];

    if (this.geoModule && this.geoModule.getDistricts) {
      const allDistricts = this.geoModule.getDistricts();
      for (const district of allDistricts) {
        if (district.name.toLowerCase().includes(query)) {
          let provinceName = '';
          if (district.province_id && this.geoModule.getProvinceById) {
            provinceName = this.geoModule.getProvinceById(district.province_id)?.name ?? '';
          }
          candidates.push({
            id: `lk_dist_${district.id}`,
            formattedAddress: `${district.name}, ${provinceName}, Sri Lanka`,
            addressLine1: district.name,
            city: district.name,
            countyOrDistrict: district.name,
            stateOrProvince: provinceName,
            postalCode: '',
            country: 'Sri Lanka',
            countryCode: 'LK',
            confidenceScore: 0.85,
          });
        }
      }
    }

    if (candidates.length === 0 && this.fallbackProvider) {
      return this.fallbackProvider.searchAddresses(options);
    }

    return candidates.slice(0, options.limit ?? 5);
  }

  async lookupByCoordinates(options: ReverseGeocodeOptions): Promise<AddressCandidate | null> {
    if (this.fallbackProvider) {
      return this.fallbackProvider.lookupByCoordinates(options);
    }
    return null;
  }
}
