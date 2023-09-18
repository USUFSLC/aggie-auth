import knex from "knex";
import { config } from "./db";
import { AggieTokenDAO, ApiTokenDAO } from "./db/model";
import { AggieAuthService } from "./api";
import { LinuxClubMailer } from "./utils";

const knexInstance = knex(config);
const apiTokenDAO = new ApiTokenDAO(knexInstance);
const aggieTokenDAO = new AggieTokenDAO(knexInstance);

const aggieMailer = new LinuxClubMailer(
  process.env.FSLC_USERNAME!,
  process.env.FSLC_PASSWORD!,
  process.env.FSLC_FROM!,
  // i _would_ be fine with putting the value here since it's easy to find, but it's an extra step a phisher would have to take to find it :)
  process.env.AGGIE_MAIL_DOMAIN!
);

export const app = new AggieAuthService(
  process.env.API_HOST!,
  parseInt(process.env.PORT!),
  apiTokenDAO,
  aggieTokenDAO,
  aggieMailer
);

export type App = typeof app;
