-- Prevent overwriting a finalized seller item decision (approved or rejected).
-- Once a seller decides on an item, that decision is locked at the DB level.

CREATE OR REPLACE FUNCTION public.prevent_decision_overwrite()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.decision IS NOT NULL AND OLD.decision <> 'pending' THEN
    RAISE EXCEPTION 'Cannot overwrite a finalized decision (%)', OLD.decision;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_decision_overwrite ON public.seller_order_item_decisions;

CREATE TRIGGER trg_prevent_decision_overwrite
  BEFORE UPDATE ON public.seller_order_item_decisions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_decision_overwrite();
