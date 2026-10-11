export interface FocusableNode {
  focus: () => void;
  blur?: () => void;
  clear?: () => void;
  isFocused?: () => boolean;
}

export type React19RefCallback = (node: FocusableNode | null) => (() => void) | void;

/**
 * Headless controller for managing focus across native and web inputs.
 * Strictly adheres to React 19 and React Native 0.86+ (Fabric) callback ref cleanup semantics.
 */
export class NativeFocusController {
  private nodes = new Map<string, FocusableNode>();

  /**
   * Returns a React 19 compliant callback ref for a given field name.
   * Crucially returns a cleanup function closure so React 19 does not throw on unexpected return values.
   */
  public register(fieldName: string): React19RefCallback {
    return (node: FocusableNode | null) => {
      if (node) {
        this.nodes.set(fieldName, node);
      } else {
        this.nodes.delete(fieldName);
      }

      // React 19 cleanup protocol
      return () => {
        this.nodes.delete(fieldName);
      };
    };
  }

  /**
   * Manually unregisters a field node.
   */
  public unregister(fieldName: string): void {
    this.nodes.delete(fieldName);
  }

  /**
   * Focuses the specified field node by name.
   * Returns true if focused successfully, false otherwise.
   */
  public focusField(fieldName: string): boolean {
    const node = this.nodes.get(fieldName);
    if (node && typeof node.focus === 'function') {
      try {
        node.focus();
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Advances focus to the next field in the provided sequence or registered order.
   */
  public focusNext(currentField: string, fieldOrder?: string[]): boolean {
    const order = fieldOrder && fieldOrder.length > 0 ? fieldOrder : Array.from(this.nodes.keys());
    const currentIndex = order.indexOf(currentField);
    if (currentIndex >= 0 && currentIndex < order.length - 1) {
      const nextField = order[currentIndex + 1];
      return this.focusField(nextField);
    }
    return false;
  }

  /**
   * Focuses the first field in the order that has an error in the provided errors map.
   */
  public focusFirstInvalid(
    errors: Record<string, string | undefined>,
    fieldOrder?: string[],
  ): boolean {
    const order = fieldOrder && fieldOrder.length > 0 ? fieldOrder : Array.from(this.nodes.keys());
    for (const field of order) {
      if (errors[field]) {
        if (this.focusField(field)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Retrieves the raw node handle if registered.
   */
  public getNode(fieldName: string): FocusableNode | undefined {
    return this.nodes.get(fieldName);
  }

  /**
   * Returns the count of registered nodes.
   */
  public getRegisteredCount(): number {
    return this.nodes.size;
  }

  /**
   * Clears all registered handles.
   */
  public clear(): void {
    this.nodes.clear();
  }
}
