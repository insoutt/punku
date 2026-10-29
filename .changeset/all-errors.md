---
'@insoutt/punku': minor
---

`useForm(initialData, { allErrors: true })` keeps every validation message per field: `errors`, `setError` and the `errors` passed to `onError` and to `onValidationError`'s second argument use `string[]` instead of `string`. `onValidationError`'s first argument is still the first message. Without the option, each field keeps its first message, as before. The mode is fixed at mount; changing `allErrors` later has no effect. Only the literal `true` is accepted, so a plain `boolean` doesn't compile. `FormProps` and `RequestConfig` gain an optional `TErrorValue` type parameter (default `string`).
