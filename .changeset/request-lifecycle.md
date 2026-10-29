---
'@insoutt/punku': major
---

Request methods resolve the response data, and `useForm` gains finer-grained callbacks and `resetAndClearErrors`.

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
