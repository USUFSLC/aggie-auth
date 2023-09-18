import { Knex } from "knex";

export interface AggieToken {
  token: string;
  api_token: string;
  anumber: string;

  expire_at: Date;

  authenticated_at?: Date;
  created_at?: Date;
}

export class AggieTokenDAO {
  static AggieTokenTable = "aggietokens";

  private knexInstance: Knex;

  constructor(knexInstance: Knex) {
    this.knexInstance = knexInstance;
  }

  public find(token: string): Promise<AggieToken | undefined> {
    return this.knexInstance<AggieToken>(AggieTokenDAO.AggieTokenTable)
      .where({ token })
      .first();
  }

  public async delete(token: string): Promise<void> {
    await this.knexInstance(AggieTokenDAO.AggieTokenTable)
      .where({ token })
      .delete();
  }

  public async save(aggieToken: AggieToken): Promise<AggieToken | undefined> {
    const [token] = await this.knexInstance<AggieToken>(
      AggieTokenDAO.AggieTokenTable
    )
      .insert(aggieToken)
      .onConflict("token")
      .merge()
      .returning("*");
    return token;
  }

  public setAuthedAtOrFail(aggieToken: AggieToken) {
    if (aggieToken.authenticated_at)
      throw new Error("that token has been used already");
    if (aggieToken.expire_at.getTime() <= Date.now())
      throw new Error("that token has expired");

    return this.save({
      ...aggieToken,
      authenticated_at: new Date(),
    });
  }
}
