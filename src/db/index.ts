import { Knex } from "knex";

export const config: Knex.Config = {
  client: "postgresql",
  connection: {
    port: parseInt(process.env.POSTGRES_PORT!),
    user: process.env.POSTGRES_USER!,
    password: process.env.POSTGRES_PASSWORD!,
    host: process.env.POSTGRES_HOST!,
    database: process.env.POSTGRES_DB,
  },
};
