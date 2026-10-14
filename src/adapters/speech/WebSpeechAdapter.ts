import type { ISpeechSynthesisPort, SpeechOptions } from '../../ports/ISpeechSynthesisPort.js';

/**
 * WebSpeechAdapter
 * Native browser implementation using window.speechSynthesis.
 */
export class WebSpeechAdapter implements ISpeechSynthesisPort {
  private utterance: SpeechSynthesisUtterance | null = null;

  public speak(text: string, options?: SpeechOptions): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      options?.onDone?.();
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      if (options?.rate) utterance.rate = options.rate;
      if (options?.pitch) utterance.pitch = options.pitch;
      if (options?.language) utterance.lang = options.language;

      utterance.onend = () => {
        options?.onDone?.();
      };

      utterance.onerror = (e) => {
        options?.onError?.(e);
      };

      this.utterance = utterance;
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      options?.onError?.(err);
    }
  }

  public stop(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  public isSpeaking(): boolean {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      return window.speechSynthesis.speaking;
    }
    return false;
  }
}

/**
 * NullSpeechAdapter
 * Headless fallback for Node/testing environments with zero side effects.
 */
export class NullSpeechAdapter implements ISpeechSynthesisPort {
  public speak(_text: string, options?: SpeechOptions): void {
    options?.onDone?.();
  }

  public stop(): void {}

  public isSpeaking(): boolean {
    return false;
  }
}
