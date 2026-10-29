# @insoutt/punku

`punku` is a React hook for easy form handling and validation when consuming Laravel APIs.

---

## Installation

To add `punku` to your project, simply run:

```bash
npm install @insoutt/punku
# or
yarn add @insoutt/punku
```

---

## Usage

Here's a detailed example demonstrating how you can use the `useForm` hook effectively with TypeScript:

```tsx
import React from 'react';
import { useForm } from '@insoutt/punku';

interface LoginForm {
  email: string;
  password: string;
}

interface LoginResponse {
  message: string;
  user: {
    id: number;
    email: string;
  };
}

const LoginComponent = () => {
  const { data, setData, post, processing, errors } = useForm<LoginForm>({
    email: '',
    password: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    post<LoginResponse>('/api/login', {
      onSuccess: (responseData) => {
        console.log('Login successful:', responseData.message);
      },
      onValidationError: (message) => {
        console.error('Validation Error:', message);
      },
      onError: ({ errors }) => {
        console.error('Validation errors:', errors);
      },
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={data.email}
        onChange={(e) => setData('email', e.target.value)}
      />
      {errors.email && <div>{errors.email}</div>}

      <input
        type="password"
        value={data.password}
        onChange={(e) => setData('password', e.target.value)}
      />
      {errors.password && <div>{errors.password}</div>}

      <button type="submit" disabled={processing}>
        {processing ? 'Logging in...' : 'Login'}
      </button>
    </form>
  );
};
```

---

## API Reference

### useForm Hook

#### Options

`useForm(initialData, options)` takes an optional second argument:

| Option      | Description                                                                                                                                                                                                                                                                                          | Type   |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `allErrors` | Keep every validation message per field. `errors`, `setError` and the `errors` passed to `onError` and to `onValidationError`'s second argument use `string[]` instead of `string`. `onValidationError`'s first argument is still the first message. Without it, each field keeps its first message. | `true` |

```tsx
const form = useForm({ email: '' }, { allErrors: true });
// after a 422: form.errors.email === ['The email field is required.', ...]
```

The mode is fixed when the component mounts: changing `allErrors` later has no effect. Only the literal `true` is accepted, so a plain `boolean` (or a non-`as const` options object) doesn't compile; with a dynamic flag, pick a branch yourself or use `as const`.

#### Properties

| Property             | Description                                                                          | Type                                   |
| -------------------- | ------------------------------------------------------------------------------------ | -------------------------------------- |
| `data`               | Current form data.                                                                   | `TForm`                                |
| `isDirty`            | Indicates if form data has changed from its defaults.                                | `boolean`                              |
| `errors`             | Form validation errors.                                                              | `Partial<Record<keyof TForm, string>>` |
| `hasErrors`          | Boolean indicating presence of validation errors.                                    | `boolean`                              |
| `processing`         | Boolean indicating if form submission is in progress.                                | `boolean`                              |
| `progress`           | Upload progress event with a `percentage` (0-100) while uploading, `null` otherwise. | `Progress \| null`                     |
| `wasSuccessful`      | Indicates if the last submission was successful.                                     | `boolean`                              |
| `recentlySuccessful` | Indicates if the submission was recently successful.                                 | `boolean`                              |

#### Methods

| Method                           | Description                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `setData(key, value)`            | Update specific form fields.                                                                            |
| `setData(newData)`               | Replace entire form data.                                                                               |
| `setData(prevData => newData)`   | Update form data using previous state.                                                                  |
| `setDefaults()`                  | Use the current form data as the new defaults.                                                          |
| `setDefaults(key, value)`        | Set the default value for a specific field (does not change `data`).                                    |
| `setDefaults({ field: value })`  | Set multiple default values (does not change `data`).                                                   |
| `reset(...fields)`               | Reset specific fields or entire form to defaults.                                                       |
| `clearErrors(...fields)`         | Clear validation errors from specific fields or all fields.                                             |
| `resetAndClearErrors(...fields)` | `reset(...fields)` and `clearErrors(...fields)`; with no fields, resets all data and clears all errors. |
| `setError(field, message)`       | Set validation error for a specific field.                                                              |
| `setError({ field: message })`   | Set multiple field errors, merged into the existing errors.                                             |
| `transform(callback)`            | Modify the payload sent with the request, without changing `data`.                                      |
| `cancel()`                       | Abort an ongoing HTTP request.                                                                          |

#### HTTP Methods

Each method (`get`, `post`, `put`, `patch`, `delete`) returns a promise that resolves with the response data on success and with `undefined` on any other outcome (validation error, HTTP exception, network error, other error, cancel, or `onBefore` returning `false`). It never rejects because of the request's outcome; an exception thrown by one of your own callbacks (other than `onSuccess`, whose synchronous throw goes to `onError()` and resolves `undefined`) propagates and rejects it.

```tsx
const user = await post<User>('/api/users');
```

`undefined` doesn't mean failure when the server returns an empty 2xx body: use the callbacks to tell outcomes apart. A response that arrives after its request was aborted (by `cancel()` or a newer request) counts as a cancel. A custom axios `validateStatus` changes which responses count as a success (and which as a 422 validation error).

Each method supports the following configuration options:

| Option              | Description                                                                                                                                                                                                                   | Type                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `url`               | Request endpoint.                                                                                                                                                                                                             | `string`                                                                                                          |
| `withFormData`      | Formats data as `FormData`. Used automatically when the data contains a `File`, `Blob` or `FileList`. `put`/`patch`/`delete` requests sent as `FormData` are sent as `POST` with a `_method` field (Laravel method spoofing). | `boolean`                                                                                                         |
| `onBefore`          | Called before anything else. Return `false` to skip the request: nothing is sent, the in-flight request is not aborted and no state changes.                                                                                  | `() => boolean \| void`                                                                                           |
| `onStart`           | Called when request begins.                                                                                                                                                                                                   | `() => void`                                                                                                      |
| `onProgress`        | Called on each upload progress event, with a `percentage` (0-100).                                                                                                                                                            | `(progress: Progress) => void`                                                                                    |
| `onFinish`          | Called after request completion.                                                                                                                                                                                              | `() => void`                                                                                                      |
| `onSuccess`         | Called on successful response.                                                                                                                                                                                                | `(data: TRequest, response?: AxiosResponse<TRequest>) => void`                                                    |
| `onValidationError` | Called when server returns validation errors (a 422 response with `errors`). If is declared and there is a validation message onError is not called. The second argument holds Laravel's `message` and the errors.            | `(message: string, validation: { message?: string; errors: Partial<Record<keyof TForm, string>> }) => void`       |
| `onHttpException`   | Called before `onError` when the server responds with any other error status (including a 422 without `errors`).                                                                                                              | `(response: AxiosResponse) => void`                                                                               |
| `onNetworkError`    | Called before `onError` when no response was received.                                                                                                                                                                        | `(error: AxiosError) => void`                                                                                     |
| `onError`           | Called on request failure. For a 422 with `errors`, the payload includes Laravel's `message`.                                                                                                                                 | `(error?: { errors?: Partial<Record<keyof TForm, string>>; requestError: AxiosError; message?: string }) => void` |

---

## Inspiration

`punku` was inspired by the [Inertia.js Form Helper for React](https://inertiajs.com/forms#react). While Inertia.js tightly integrates with Laravel's routing and server-side rendering, it has limitations making traditional API requests. `punku` addresses these limitations by providing a flexible solution designed specifically to interact directly with Laravel APIs, supporting a broader variety of React project structures and architectures.

---

## License

MIT License
