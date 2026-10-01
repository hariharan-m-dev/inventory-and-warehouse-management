-- Migration: add unit_price to purchase_orders
-- Run once against an existing database that was created without this column.
-- Safe to run multiple times (the IF NOT EXISTS guard prevents errors).

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'purchase_orders' AND column_name = 'unit_price'
    ) THEN
        ALTER TABLE purchase_orders
            ADD COLUMN unit_price NUMERIC(10,2) NOT NULL DEFAULT 0
            CHECK (unit_price >= 0);
        RAISE NOTICE 'unit_price column added to purchase_orders';
    ELSE
        RAISE NOTICE 'unit_price already exists, nothing to do';
    END IF;
END
$$;
