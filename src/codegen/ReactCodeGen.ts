import type { FieldDefinition } from '@intuitui-labs/form-builder-engine/schema/FormSchema';

export function exportToStaticReact(
  title: string,
  fields: FieldDefinition[],
  description?: string
): string {
  // Generate Zod Schema fields
  const zodFields = fields
    .filter((f) => f.type !== 'heading' && f.type !== 'divider')
    .map((f) => {
      let validation = 'z.string()';
      if (f.type === 'number') {
        validation = 'z.number()';
      } else if (f.type === 'email') {
        validation = 'z.string().email("Invalid email address")';
      }

      if (f.required) {
        if (f.type === 'number') {
          validation += '.min(1, "Required")';
        } else {
          validation += '.min(1, "Required")';
        }
      } else {
        validation += '.optional()';
      }

      return `  ${f.name}: ${validation},`;
    })
    .join('\n');

  // Generate Default Values
  const defaultValues = fields
    .filter((f) => f.type !== 'heading' && f.type !== 'divider')
    .map((f) => {
      let defVal = "''";
      if (f.type === 'number') defVal = '0';
      if (f.defaultValue !== undefined) {
        defVal = typeof f.defaultValue === 'string' ? `'${f.defaultValue}'` : String(f.defaultValue);
      }
      return `    ${f.name}: ${defVal},`;
    })
    .join('\n');

  // Generate Inputs markup
  const inputsMarkup = fields
    .map((f) => {
      if (f.type === 'heading') {
        return `        <div className="mb-4">
          <h3 className="text-lg font-bold text-gray-900">${f.label || 'Heading'}</h3>
        </div>`;
      }
      if (f.type === 'divider') {
        return `        <hr className="my-6 border-gray-200" />`;
      }

      let inputControl = '';
      if (f.type === 'select') {
        const options = (f.options || [])
          .map((opt) => `            <option value="${opt.value}">${opt.label}</option>`)
          .join('\n');
        inputControl = `
          <select
            id="${f.name}"
            {...register('${f.name}')}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          >
            <option value="">Select option...</option>
${options}
          </select>`;
      } else if (f.type === 'textarea') {
        inputControl = `
          <textarea
            id="${f.name}"
            placeholder="${f.placeholder || ''}"
            {...register('${f.name}')}
            rows={4}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          />`;
      } else {
        const inputType = f.type === 'number' ? 'number' : f.type === 'password' ? 'password' : 'text';
        inputControl = `
          <input
            type="${inputType}"
            id="${f.name}"
            placeholder="${f.placeholder || ''}"
            {...register('${f.name}'${f.type === 'number' ? ', { valueAsNumber: true }' : ''})}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          />`;
      }

      return `        <div className="mb-4">
          <label htmlFor="${f.name}" className="block text-sm font-medium text-gray-700">
            ${f.label || f.name} ${f.required ? '<span className="text-red-500">*</span>' : ''}
          </label>
          ${inputControl.trim()}
          {errors.${f.name} && (
            <p className="mt-1 text-sm text-red-600">{errors.${f.name}?.message}</p>
          )}
        </div>`;
    })
    .join('\n\n');

  return `import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const formSchema = z.object({
${zodFields}
});

type FormValues = z.infer<typeof formSchema>;

export default function ${title.replace(/[^a-zA-Z0-9]/g, '') || 'GeneratedForm'}() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
${defaultValues}
    },
  });

  const onSubmit = async (data: FormValues) => {
    try {
      console.log('Form data submitted successfully:', data);
      // Handle server submission here
      reset();
    } catch (error) {
      console.error('Submission failed:', error);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6 bg-white rounded-xl shadow-md border border-gray-100">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">${title}</h2>
        ${description ? `<p className="mt-1 text-sm text-gray-500">${description}</p>` : ''}
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
${inputsMarkup}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-6 w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          {isSubmitting ? 'Submitting...' : 'Submit'}
        </button>
      </form>
    </div>
  );
}
`;
}
