import { FormHydrator } from '@intuitui-labs/form-builder-engine/hydrator/FormHydrator';
import type { FormPage, FormSchema } from '@intuitui-labs/form-builder-engine/schema/FormSchema';
import { FormManager } from '@intuitui-labs/form-builder-engine/manager/FormManager';

export class MultiStepFormManager<T extends Record<string, unknown>> {
  private schema: FormSchema;
  private formManager: FormManager<T>;
  private currentPageIndex = 0;
  private subscribers: Set<(manager: MultiStepFormManager<T>) => void> = new Set();

  constructor(schema: FormSchema, onSubmit: (values: T) => Promise<void> | void) {
    this.schema = schema;

    // Flatten all fields across all pages to pass to FormHydrator
    const allFields = schema.pages.flatMap((page) => page.fields);
    this.formManager = FormHydrator.hydrate<T>({ fields: allFields as any }, onSubmit);
  }

  public getFormManager(): FormManager<T> {
    return this.formManager;
  }

  public getPages(): FormPage[] {
    return this.schema.pages;
  }

  public getCurrentPage(): FormPage {
    return this.schema.pages[this.currentPageIndex]!;
  }

  public getCurrentPageIndex(): number {
    return this.currentPageIndex;
  }

  public getTotalPages(): number {
    return this.schema.pages.length;
  }

  public isFirstStep(): boolean {
    return this.currentPageIndex === 0;
  }

  public isLastStep(): boolean {
    return this.currentPageIndex === this.schema.pages.length - 1;
  }

  public subscribe(callback: (manager: MultiStepFormManager<T>) => void): () => void {
    this.subscribers.add(callback);
    callback(this);
    return () => this.subscribers.delete(callback);
  }

  private notify() {
    this.subscribers.forEach((cb) => cb(this));
  }

  /**
   * Validates only the fields on the current active page.
   */
  public validateCurrentStep(): boolean {
    const currentPage = this.getCurrentPage();
    let isPageValid = true;

    for (const field of currentPage.fields) {
      if (!this.formManager.validateField(field.name as keyof T)) {
        isPageValid = false;
      }
    }

    return isPageValid;
  }

  public nextStep(): boolean {
    if (this.isLastStep()) {
      return false;
    }

    // Validate the current page before proceeding
    if (!this.validateCurrentStep()) {
      this.notify();
      return false;
    }

    this.currentPageIndex++;
    this.notify();
    return true;
  }

  public prevStep(): boolean {
    if (this.isFirstStep()) {
      return false;
    }

    this.currentPageIndex--;
    this.notify();
    return true;
  }

  public goToStep(index: number): boolean {
    if (index < 0 || index >= this.schema.pages.length) {
      return false;
    }
    this.currentPageIndex = index;
    this.notify();
    return true;
  }

  public async submit() {
    // Validate all pages before final submission
    let allValid = true;
    for (let i = 0; i < this.schema.pages.length; i++) {
      const page = this.schema.pages[i]!;
      for (const field of page.fields) {
        if (!this.formManager.validateField(field.name as keyof T)) {
          allValid = false;
        }
      }
    }

    if (!allValid) {
      this.notify();
      return;
    }

    await this.formManager.submit();
    this.notify();
  }
}
