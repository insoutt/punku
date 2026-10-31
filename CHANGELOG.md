# @insoutt/punku

## 2.0.0

### Major Changes

- 07b6762: Request methods resolve the response data, and `useForm` gains finer-grained callbacks and `resetAndClearErrors`.

  Breaking changes:

  - **Types:** `get`, `post`, `put`, `patch` and `delete` return `Promise<TResponse | undefined>` instead of `Promise<void>`. Code that returns `form.post()` from a function typed `Promise<void>` stops compiling. Fix: `await form.post(...)` inside it, or widen the return type.
  - **Behavior (rare):** a response that arrives after its request was aborted (e.g. held by a response interceptor past `cancel()` or a newer request) is treated as a cancel (`onCancel`, resolves `undefined`) instead of calling `onSuccess`.

  Additions:

  - Request methods resolve `response.data` on success and `undefined` on every other outcome (validation error, HTTP exception, network error, other error, cancel, `onBefore` returning `false`). They never reject because of the request's outcome; an exception thrown by one of your own callbacks (other than `onSuccess`, whose synchronous throw goes to `onError()` and resolves `undefined`) propagates and rejects it.
  - `resetAndClearErrors(...fields)`: `reset(...fields)` plus `clearErrors(...fields)`; with no fields, resets all data and clears all errors.
  - `onBefore()`: called before anything else; returning `false` sends nothing, doesn't abort the in-flight request and changes no state.
  - `onProgress(progress)`: called on each upload progress event with punku's `Progress` (with `percentage`). The axios `onUploadProgress` option still works.
  - `onHttpException(response)`: called before `onError` when the server responds with a status other than a 422 with `errors`.
  - `onNetworkError(error)`: called before `onError` when no response was received.
  - Laravel's `message`: `onValidationError(firstMessage, { message, errors })` gets a second argument, and `onError`'s payload includes `message` for a 422 with `errors`.
  - A successful response that arrives after the component unmounted no longer sets `wasSuccessful`, `recentlySuccessful` or `errors`, and no longer schedules the `recentlySuccessful` timer.

### Minor Changes

- 65bf719: `useForm(initialData, { allErrors: true })` keeps every validation message per field: `errors`, `setError` and the `errors` passed to `onError` and to `onValidationError`'s second argument use `string[]` instead of `string`. `onValidationError`'s first argument is still the first message. Without the option, each field keeps its first message, as before. The mode is fixed at mount; changing `allErrors` later has no effect. Only the literal `true` is accepted, so a plain `boolean` doesn't compile. `FormProps` and `RequestConfig` gain an optional `TErrorValue` type parameter (default `string`).

## 1.2.1

### Patch Changes

- 6c495bd: Fix stale form state in `useForm`.

  - Submitting right after `setData` or `reset` in the same event handler now sends the new data (also to `transform`), and consecutive `setData(prev => ...)` calls compose.
  - `setDefaults()` right after `setData` in the same handler uses the new data, and `reset()` right after `setDefaults(...)` uses the new defaults, including from callbacks such as `onSuccess` that hold an older form object.
  - `isDirty` detects a replaced `File`, `Blob` or `FileList`. Plain objects and arrays are compared by value, dates by time, and anything else by identity.
  - A `transform` callback that throws no longer leaves `processing` stuck at `true`. It calls `onError()` and `onFinish`, sends no request, and the request method's promise resolves.

  Behavior changes:

  - Only a `422` response with an `errors` body is treated as a validation error. Any other failed response (e.g. a `500` whose body has `errors`) clears `errors` and calls `onError({ requestError })`; `onValidationError` is not called.
  - `setError({ ... })` merges into the existing errors instead of replacing them, like Inertia.

## 1.2.0

### Minor Changes

- 5fa8fa5: Fix several `useForm` bugs and align behavior with the Inertia.js form helper.

  - Nested objects and arrays are now serialized into `FormData` (`user[name]`, `user[tags][0]`); previously they were dropped. `FileList` values are appended as `key[0]`, `key[1]`, ...
  - Data containing a `File`, `Blob` or `FileList` (at any depth) is sent as `FormData` automatically, without `withFormData`.
  - `put`, `patch` and `delete` requests sent as `FormData` are sent as `POST` with a `_method` field, so Laravel can read multipart bodies.
  - Only the latest request clears `processing`: a request aborted because a newer one started no longer resets `processing`/`progress` while the newer one is running.
  - punku-only options (`withFormData`, `onStart`, `onFinish`, `onSuccess`, `onError`, `onValidationError`, `onCancel`) are no longer passed to axios. Caller `headers` are merged with the default `Accept`/`X-Punku` headers, the computed `method`, `url`, `data`, `params` and `signal` can no longer be overridden, and a caller `onUploadProgress` is called alongside the internal progress tracking.
  - `progress` is a new object with `percentage` (the axios event is no longer mutated and the global `AxiosProgressEvent` augmentation is removed), is reset to `null` when the request finishes, and no longer logs to the console. `wasSuccessful`/`recentlySuccessful` reset when a request starts, and the `recentlySuccessful` timer is re-armed on each success and cleared on unmount.
  - `setError(errors)` accepts a partial errors object.
  - `react` is now a peer dependency, and the `FormProps`, `RequestConfig`, `Progress`, `FormDataConvertible` and `FormDataType` types are exported.

  Behavior changes:

  - `transform(callback)` no longer changes `data`. The callback is stored and applied to the payload when the request is sent.
  - `setDefaults()` now makes the current data the new defaults (it used to reset data to the initial values). `setDefaults(field, value)` and `setDefaults({ ... })` now update the defaults without changing `data`. `reset()` restores from these defaults, and `isDirty` compares against them instead of the `initialData` argument.

## 1.1.0

### Minor Changes

- 177759c: Implement uploads

## 1.0.2

### Patch Changes

- b418d36: - Add headers
  - Add onCancel event
  - Update Readme.md

## 1.0.1

### Patch Changes

- 0d67bc9: Update docs

## 1.1.0

### Minor Changes

- 3ada199: Initial Release
