import type { IContactPickerPort, PickedContact } from '../../ports/IAddressAutofillPort.js';

export class BrowserContactPickerAdapter implements IContactPickerPort {
  readonly providerId = 'browser-contact-picker';

  public isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      'contacts' in navigator &&
      typeof (navigator as unknown as { contacts: { select: Function } }).contacts?.select === 'function'
    );
  }

  public async pickContact(options?: {
    multiple?: boolean;
    signal?: AbortSignal;
  }): Promise<PickedContact[]> {
    if (!this.isSupported()) {
      return [];
    }

    if (options?.signal?.aborted) {
      return [];
    }

    try {
      const contactsNav = (navigator as unknown as {
        contacts: {
          select(properties: string[], opts?: { multiple?: boolean }): Promise<Array<{
            name?: string[];
            email?: string[];
            tel?: string[];
            address?: Array<{
              addressLine?: string[];
              city?: string;
              region?: string;
              postalCode?: string;
              country?: string;
            }>;
          }>>;
        };
      });

      const rawContacts = await contactsNav.contacts.select(
        ['name', 'email', 'tel', 'address'],
        { multiple: options?.multiple ?? false },
      );

      if (!Array.isArray(rawContacts)) return [];

      return rawContacts.map((c) => ({
        name: c.name?.[0],
        email: c.email?.[0],
        tel: c.tel?.[0],
        address: c.address?.[0]
          ? {
              addressLine: c.address[0].addressLine,
              city: c.address[0].city,
              region: c.address[0].region,
              postalCode: c.address[0].postalCode,
              country: c.address[0].country,
            }
          : undefined,
      }));
    } catch {
      // User canceled selection or closed dialog
      return [];
    }
  }
}
