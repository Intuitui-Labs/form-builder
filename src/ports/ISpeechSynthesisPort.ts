export interface SpeechOptions {
  rate?: number;
  pitch?: number;
  language?: string;
  onDone?: () => void;
  onError?: (error: unknown) => void;
}

/**
 * Hexagonal Outbound Port for Speech Synthesis ("Speak Peek").
 * Decouples speech execution from the runtime environment (Web Speech API, Expo-Speech, or Headless).
 */
export interface ISpeechSynthesisPort {
  speak(text: string, options?: SpeechOptions): void | Promise<void>;
  stop(): void;
  isSpeaking(): boolean;
}
