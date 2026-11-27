CREATE TABLE public.payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_id uuid NOT NULL REFERENCES public.billing_plans(id),
  amount_paise integer NOT NULL CHECK (amount_paise >= 100),
  currency text NOT NULL DEFAULT 'INR',
  razorpay_order_id text UNIQUE,
  razorpay_payment_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_orders_user_idx ON public.payment_orders(user_id);
GRANT SELECT ON public.payment_orders TO authenticated;
GRANT ALL ON public.payment_orders TO service_role;
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own payment orders" ON public.payment_orders FOR SELECT TO authenticated USING (user_id = auth.uid());