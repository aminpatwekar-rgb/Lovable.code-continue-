# Set up Razorpay test checkout

## Scope
- Add an ONYX Subscription section to authenticated Settings.
- Provide a clearly labelled ₹1 test checkout so Razorpay Standard Checkout can be verified before plan details exist.
- Create authenticated server functions to create Razorpay orders and verify successful-payment signatures.
- Handle cancellation, payment failure, successful verification, and user-facing errors.
- Do not create subscription entitlements, recurring plans, or payment database tables until plan details are supplied.

## Security
- Keep the Razorpay key secret in encrypted project secrets and server code only.
- Return the publishable test key from the authenticated order-creation response rather than exposing the secret.
- Validate request and response fields, enforce the fixed server-side test amount, and compare signatures safely.
- Treat a checkout as successful only after server-side HMAC verification.

## Technical details
- Use TanStack Start authenticated `createServerFn` handlers for order creation and verification.
- Call Razorpay's HTTP API directly with `fetch` to remain compatible with the app runtime.
- Load Razorpay Standard Checkout only when the customer starts checkout.
- Add a focused billing component to Settings using existing ONYX controls and notification patterns.
- Record the server-function boundary in `AGENTS.md`, then verify typechecking, Preview build health, and the Settings checkout launch flow.
