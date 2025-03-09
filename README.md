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

#### Properties

| Property             | Description                                             | Type                                   |
| -------------------- | ------------------------------------------------------- | -------------------------------------- |
| `data`               | Current form data.                                      | `TForm`                                |
| `isDirty`            | Indicates if form data has changed from initial values. | `boolean`                              |
| `errors`             | Form validation errors.                                 | `Partial<Record<keyof TForm, string>>` |
| `hasErrors`          | Boolean indicating presence of validation errors.       | `boolean`                              |
| `processing`         | Boolean indicating if form submission is in progress.   | `boolean`                              |
| `progress`           | Upload progress event (if applicable).                  | `Progress \| null`                     |
| `wasSuccessful`      | Indicates if the last submission was successful.        | `boolean`                              |
| `recentlySuccessful` | Indicates if the submission was recently successful.    | `boolean`                              |

#### Methods

| Method                          | Description                                                 |
| ------------------------------- | ----------------------------------------------------------- |
| `setData(key, value)`           | Update specific form fields.                                |
| `setData(newData)`              | Replace entire form data.                                   |
| `setData(prevData => newData)`  | Update form data using previous state.                      |
| `setDefaults()`                 | Reset form data to initial values.                          |
| `setDefaults(key, value)`       | Set default value for a specific field.                     |
| `setDefaults({ field: value })` | Set multiple default values.                                |
| `reset(...fields)`              | Reset specific fields or entire form to defaults.           |
| `clearErrors(...fields)`        | Clear validation errors from specific fields or all fields. |
| `setError(field, message)`      | Set validation error for a specific field.                  |
| `setError({ field: message })`  | Set multiple field errors.                                  |
| `transform(callback)`           | Modify form data before sending.                            |
| `cancel()`                      | Abort an ongoing HTTP request.                              |

#### HTTP Methods

Each method (`get`, `post`, `put`, `patch`, `delete`) supports the following configuration options:

| Option              | Description                                   | Type                                                                                            |
| ------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `url`               | Request endpoint.                             | `string`                                                                                        |
| `onStart`           | Called when request begins.                   | `() => void`                                                                                    |
| `onFinish`          | Called after request completion.              | `() => void`                                                                                    |
| `onSuccess`         | Called on successful response.                | `(data: TRequest, response?: AxiosResponse<TRequest>) => void`                                  |
| `onValidationError` | Called when server returns validation errors. If is declared and there is a validation message onError is not called | `(message: string) => void`                                                                     |
| `onError`           | Called on request failure.                    | `(error?: { errors?: Partial<Record<keyof TForm, string>>; requestError: AxiosError }) => void` |

---

## Inspiration

`punku` was inspired by the [Inertia.js Form Helper for React](https://inertiajs.com/forms#react). While Inertia.js tightly integrates with Laravel's routing and server-side rendering, it has limitations making traditional API requests. `punku` addresses these limitations by providing a flexible solution designed specifically to interact directly with Laravel APIs, supporting a broader variety of React project structures and architectures.

---

## License

MIT License
