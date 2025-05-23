import type { FormDataConvertible, FormDataType } from './form.js';

/**
 * Modified version of Inertia FormData helper.
 * Source: https://github.com/inertiajs/inertia/blob/2ca0409cc386b89e0e6673889527901b6c22b6da/packages/core/src/formData.ts
 */

export const isFormData = (value: any): value is FormData =>
  value instanceof FormData;

export function objectToFormData<TForm extends FormDataType>(
  data: TForm,
  parentKey: string | null = null,
): FormData {
  const form = new FormData();

  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      append(
        form,
        composeKey(parentKey, key),
        data[key] as FormDataConvertible,
      );
    }
  }

  return form;
}

function composeKey(parent: string | null, key: string): string {
  return parent ? parent + '[' + key + ']' : key;
}

function append(form: FormData, key: string, value: FormDataConvertible): void {
  if (Array.isArray(value)) {
    return Array.from(value.keys()).forEach((index) =>
      append(form, composeKey(key, index.toString()), value[index]),
    );
  } else if (value instanceof Date) {
    return form.append(key, value.toISOString());
  } else if (value instanceof File) {
    return form.append(key, value, value.name);
  } else if (value instanceof Blob) {
    return form.append(key, value);
  } else if (typeof value === 'boolean') {
    return form.append(key, value ? '1' : '0');
  } else if (typeof value === 'string') {
    return form.append(key, value);
  } else if (typeof value === 'number') {
    return form.append(key, `${value}`);
  } else if (value === null || value === undefined) {
    return form.append(key, '');
  }

  objectToFormData(value, key);
}
