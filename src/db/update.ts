import knex from "knex";
import { migrationOrder } from "./migrations";
import { config } from ".";

export const initDB = async () => {
  const knexInstance = knex(config);
  for (const migration of migrationOrder) {
    await migration(knexInstance);
  }
  await knexInstance.destroy();
};

initDB();
