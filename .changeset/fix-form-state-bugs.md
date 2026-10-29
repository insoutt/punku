---
'@insoutt/punku': patch
---

Fix stale form state in `useForm`.

- Submitting right after `setData` or `reset` in the same event handler now sends the new data (also to `transform`), and consecutive `setData(prev => ...)` calls compose.
- `setDefaults()` right after `setData` in the same handler uses the new data, and `reset()` right after `setDefaults(...)` uses the new defaults, including from callbacks such as `onSuccess` that hold an older form object.
- `isDirty` detects a replaced `File`, `Blob` or `FileList`. Plain objects and arrays are compared by value, dates by time, and anything else by identity.
- A `transform` callback that throws no longer leaves `processing` stuck at `true`. It calls `onError()` and `onFinish`, sends no request, and the request method's promise resolves.

Behavior changes:

- Only a `422` response with an `errors` body is treated as a validation error. Any other failed response (e.g. a `500` whose body has `errors`) clears `errors` and calls `onError({ requestError })`; `onValidationError` is not called.
- `setError({ ... })` merges into the existing errors instead of replacing them, like Inertia.
