import Elysia, { NotFoundError, t } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { bearer } from "@elysiajs/bearer";
import { AggieToken, AggieTokenDAO, ApiToken, ApiTokenDAO } from "../db/model";
import { Mailer } from "../utils";

export class AggieAuthService extends Elysia {
  static A_NUMBER_REGEX = new RegExp(/^a[0-9]{8}$/i);
  static UUID_V4_REGEX = new RegExp(
    /^[0-9A-F]{8}-[0-9A-F]{4}-[4][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i
  );
  static DEFAULT_CALLBACK = "http://localhost:3000/api/aggie_auth";

  private apiHost: string;
  private apiTokenDAO: ApiTokenDAO;
  private aggieTokenDAO: AggieTokenDAO;
  private aggieMailer: Mailer;

  constructor(
    apiHost: string,
    port: number,
    apiTokenDAO: ApiTokenDAO,
    aggieTokenDAO: AggieTokenDAO,
    aggieMailer: Mailer
  ) {
    super();

    this.apiHost = apiHost;
    this.apiTokenDAO = apiTokenDAO;
    this.aggieTokenDAO = aggieTokenDAO;
    this.aggieMailer = aggieMailer;

    this.use(
      swagger({
        documentation: {
          info: {
            title: "AggieAuthAPI",
            version: "0.0.1",
          },
          servers: [{ url: this.apiHost }],
        },
      })
    ); // openapi spec at /swagger/json!

    this.use(bearer());

    this.get("/health", () => "ok");

    this.get(
      "/authaggie",
      async ({ query, set }) => {
        const aggieToken = await this.aggieTokenDAO.find(
          query.aggieToken.toLowerCase()
        );
        if (!aggieToken) throw new NotFoundError();

        const apiToken = await this.apiTokenDAO.find(aggieToken.api_token);
        if (!apiToken) throw new NotFoundError();

        await this.aggieTokenDAO.setAuthedAtOrFail(aggieToken);

        const callbackParams = new URLSearchParams({
          token: aggieToken.token,
          redirect: ((query.wantsRedirect ?? "false") === "true").toString(),
        });

        set.redirect = apiToken.callback + `?${callbackParams.toString()}`;
      },
      {
        query: t.Object({
          aggieToken: t.String(),
          wantsRedirect: t.Optional(
            t.RegExp(/^(true|false)$/, { default: "false" })
          ),
        }),
      }
    );

    this.delete(
      "/aggieauth/:token",
      async ({ bearer, params, set }) => {
        const apiToken = await this.apiTokenDAO.find(bearer);
        if (!apiToken) throw new NotFoundError();

        const aggieToken = await this.aggieTokenDAO.find(params.token);
        if (!aggieToken) throw new NotFoundError();

        if (aggieToken.api_token != apiToken.token) {
          set.status = 403;
          throw new Error(
            "cannot delete aggieauth token unrelated to your api key!"
          );
        }

        await this.aggieTokenDAO.delete(aggieToken.token);
        return true;
      },
      {
        params: t.Object({ token: t.String() }),
        beforeHandle: async (before) => await this.ensureApiToken(before),
      }
    );

    this.post(
      "/authaggie",
      async ({ bearer, set, body: { anumber } }) => {
        const apiToken = await this.apiTokenDAO.find(bearer);
        if (!apiToken) {
          set.status = 401;
          return { error: "api token invalid or no longer exists" };
        }

        if (
          apiToken.is_dev_token &&
          anumber.toLowerCase() != apiToken.test_aggie?.toLowerCase()
        ) {
          set.status = 403;
          return { error: "cannot authorize given a-number with token" };
        }

        return await this.sendAggieToken(apiToken, anumber);
      },
      {
        beforeHandle: async (before) => await this.ensureApiToken(before),
        body: t.Object({
          anumber: t.RegExp(AggieAuthService.A_NUMBER_REGEX, { default: "" }),
        }),
        response: t.Any([
          t.Object({
            token: t.String(),
            expire_at: t.Date(),
          }),
          t.Object({ error: t.String() }),
        ]),
      }
    );

    this.get(
      "/token",
      async ({ bearer }) => {
        const apiToken = await this.apiTokenDAO.find(bearer);
        if (!apiToken) throw NotFoundError();

        return apiToken;
      },
      {
        beforeHandle: async (before) => await this.ensureApiToken(before),
      }
    );

    this.post(
      "/token",
      async ({ body: { anumber } }) => {
        await this.makeKeyVerification(anumber.toLowerCase());
      },
      {
        body: t.Object({
          anumber: t.RegExp(AggieAuthService.A_NUMBER_REGEX, { default: "" }),
        }),
        response: t.Any([t.Boolean(), t.Object({ error: t.String() })]),
      }
    );

    // callback after sending token confirmation to dev account
    this.get(
      "/token/verify/:apiToken",
      async ({ params }) => {
        try {
          const apiToken = await this.apiTokenDAO.find(params.apiToken);
          if (apiToken) {
            apiToken.callback = AggieAuthService.DEFAULT_CALLBACK;
            await this.apiTokenDAO.save(apiToken);
          }
        } catch (e) {
        } finally {
          return params.apiToken;
        }
      },
      {
        params: t.Object({
          apiToken: t.String(),
        }),
        response: t.String(),
      }
    );

    this.put(
      "/token",
      async ({ bearer, body }) => {
        const apiToken = await this.apiTokenDAO.find(bearer);
        if (!apiToken) throw NotFoundError();

        apiToken.callback = body.callback;
        apiToken.description = body.description;
        apiToken.wants_production = body.wants_production;
        apiToken.token_expiration_sec = body.token_expiration_sec;

        return await this.apiTokenDAO.save(apiToken);
      },
      {
        body: t.Object({
          callback: t.RegExp(new RegExp("^(http|https)://", "i"), {
            default: "",
          }),
          description: t.String({ minLength: 12, maxLength: 64 }),
          wants_production: t.Boolean(),
          token_expiration_sec: t.Number({
            minimum: 5 * 60, // 5 minutes
            maximum: 24 * 60 * 60, // one day
          }),
        }),
        beforeHandle: async (before) => await this.ensureApiToken(before),
      }
    );

    this.delete(
      "/token",
      async ({ bearer }) => {
        const apiToken = await this.apiTokenDAO.find(bearer);
        if (!apiToken) throw new NotFoundError();

        await this.apiTokenDAO.delete(apiToken.token);
        return true;
      },
      {
        response: t.Boolean(),
        beforeHandle: async (before) => await this.ensureApiToken(before),
      }
    );

    this.listen(port);

    console.log("Listening on " + port + "...");
  }

  private async ensureApiToken({ bearer, set }) {
    const matchesFormat =
      bearer && bearer.match(AggieAuthService.UUID_V4_REGEX);
    const tokenExists =
      matchesFormat && !!(await this.apiTokenDAO.find(bearer));

    if (!tokenExists) {
      set.status = 401;
      set.headers[
        "WWW-Authenticate"
      ] = `Bearer realm='sign', error="invalid_request"`;
      return "Unauthorized";
    }
  }

  // use the service to confirm its own users 🤯🤯🤯🤯
  private async makeKeyVerification(anumber: string) {
    const token = crypto.randomUUID();
    const newApiToken: ApiToken = {
      token,
      is_dev_token: true,
      description: "Key verification from aggie-auth.",
      test_aggie: anumber,
      callback: `${this.apiHost}/token/verify/${token}`,
      token_expiration_sec: 3600,
    };

    await this.apiTokenDAO.save(newApiToken);
    await this.sendAggieToken(newApiToken, anumber);
  }

  private async sendAggieToken(apiToken: ApiToken, anumber: string) {
    const aggieToken: AggieToken = {
      token: crypto.randomUUID(),
      api_token: apiToken.token,
      anumber,
      expire_at: new Date(Date.now() + apiToken.token_expiration_sec * 1000),
    };
    await this.aggieTokenDAO.save(aggieToken);

    const verificationLink = `${this.apiHost}/authaggie?aggieToken=${aggieToken.token}`;
    const sent = await this.aggieMailer.sendMail(
      anumber,
      `🐧 ${anumber} - Auth Request`,
      this.makeTemplate(anumber, apiToken.description, verificationLink)
    );
    if (sent)
      return { token: aggieToken.token, expire_at: aggieToken.expire_at };
    throw new Error("Failed sending mail");
  }

  private makeTemplate(
    anumber: string,
    description: string,
    verificationLink: string
  ) {
    return (
      "<h1>Hello from the FSLC 👋!</h1>\n" +
      `<p>🔒 A login token has been requested for <strong>${anumber}</strong>, for a service that describes itself as:</p>` +
      `<ul><li><code>{"description": "${description}"}</code></li></ul>\n` +
      `<p>🚫 <strong>If you did not request this, please ignore this email.</strong></p>\n` +
      `<p>✅ Else, here's that link: <a href="${verificationLink}">${verificationLink}</a>.</p>\n` +
      `<code>==================</code>` +
      `<p>🐙 <a href="https://github.com/usufslc/aggie-auth">aggie-auth</a>, a project from the <a href="https://linux.usu.edu">USU Free Software and Linux Club</a></p>`
    );
  }
}
