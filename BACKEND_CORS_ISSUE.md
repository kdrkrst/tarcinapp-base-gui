# Backend CORS Issue

## Symptom

Frontend requests from `http://localhost:5173` fail with `TypeError: Failed to fetch` even when API responds `200 OK`.
The response headers do not include `Access-Control-Allow-Origin` and `Access-Control-Allow-Credentials`.

## Expected Behavior

For credentialed cross-origin requests, every API response should include:

- `Access-Control-Allow-Origin: http://localhost:5173`
- `Access-Control-Allow-Credentials: true`

Then the frontend should read the JSON response successfully instead of failing with a CORS/network error.
