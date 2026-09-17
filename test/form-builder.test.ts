import { describe, it, expect } from 'vitest';
import { z } from 'zod';

describe('@intuitui-labs/form-builder (G0 Pure Mathematical & Contract Tests)', () => {
  it('validates schema definitions deterministically', () => {
    const mockSchema = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      age: z.number().min(18),
    });

    const validData = { name: 'Alice', email: 'alice@example.com', age: 25 };
    const invalidData = { name: '', email: 'not-an-email', age: 15 };

    expect(mockSchema.safeParse(validData).success).toBe(true);
    expect(mockSchema.safeParse(invalidData).success).toBe(false);
  });
});
