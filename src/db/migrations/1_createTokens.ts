import { Knex } from "knex";
import { logOverPromise } from "../../utils";

export const createTokens = async (knex: Knex) => {
  await logOverPromise(
    "adding citext extension",
    knex.raw("CREATE EXTENSION IF NOT EXISTS citext;")
  );
  await logOverPromise(
    "adding pgcrypto extension",
    knex.raw("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
  );

  const hasApiTokens = await logOverPromise<boolean>(
    "do we have apitokens",
    knex.schema.hasTable("apitokens")
  );
  if (!hasApiTokens) {
    await logOverPromise(
      "create apitokens table",
      knex.schema.createTable("apitokens", async (table) => {
        table
          .uuid("token", { primaryKey: true })
          .defaultTo(knex.raw("gen_random_uuid()"));
        table.boolean("is_dev_token").defaultTo(true);
        table.boolean("wants_production").defaultTo(false);
        table.string("description");
        table.specificType("test_aggie", "citext");
        table.string("callback");

        table.integer("token_expiration_sec").defaultTo(3600);

        table.timestamp("created_at").defaultTo(knex.raw("NOW()"));
        table.timestamp("updated_at").defaultTo(knex.raw("NOW()"));
      })
    );

    await logOverPromise(
      "add updated_at trigger on apitokens",
      knex.raw(
        `CREATE TRIGGER api_tokens_update BEFORE UPDATE ON apitokens FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();`
      )
    );
  }

  const hasAggietokenTable = await logOverPromise<boolean>(
    "do we have aggietokens",
    knex.schema.hasTable("aggietokens")
  );
  if (!hasAggietokenTable)
    await logOverPromise(
      "create aggietokens table",
      knex.schema.createTable("aggietokens", (table) => {
        table
          .uuid("token", { primaryKey: true })
          .defaultTo(knex.raw("gen_random_uuid()"));
        table.specificType("anumber", "citext");
        table
          .uuid("api_token")
          .index()
          .references("token")
          .inTable("apitokens")
          .onDelete("CASCADE");
        table.timestamp("authenticated_at").defaultTo(null);
        table.timestamp("expire_at");
        table.timestamp("created_at").defaultTo(knex.raw("NOW()"));
      })
    );
};
