import { Knex } from "knex";

export interface ApiToken {
  token: string;
  callback: string;
  token_expiration_sec: number;

  test_aggie?: string;
  is_dev_token: boolean;

  description: string;
  wants_production?: boolean;

  created_at?: Date;
  updated_at?: Date;
}

export class ApiTokenDAO {
  static ApiTokenTable = "apitokens";

  private knexInstance: Knex;

  constructor(knexInstance: Knex) {
    this.knexInstance = knexInstance;
  }

  public find(token: string): Promise<ApiToken | undefined> {
    return this.knexInstance<ApiToken>(ApiTokenDAO.ApiTokenTable)
      .where({ token })
      .first();
  }

  public delete(token: string) {
    return this.knexInstance(ApiTokenDAO.ApiTokenTable)
      .where({ token })
      .delete();
  }

  public async save(apiToken: ApiToken): Promise<ApiToken | undefined> {
    const [token] = await this.knexInstance(ApiTokenDAO.ApiTokenTable)
      .insert(apiToken)
      .onConflict("token")
      .merge()
      .returning("*");
    return token;
  }
}
