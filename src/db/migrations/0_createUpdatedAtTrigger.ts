import { Knex } from "knex";
import { logOverPromise } from "../../utils";

export const createUpdatedAtTrigger = async (knex: Knex) => {
  await logOverPromise(
    "updated_at trigger",
    knex.raw(`
        CREATE OR REPLACE FUNCTION trigger_set_timestamp()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    `)
  );
};
