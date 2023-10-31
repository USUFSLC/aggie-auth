// after running "bun run src/index.ts..."

import { ApiToken } from "../src/db/model";
import { logOverPromise } from "../src/utils";

const TEST_PORT = 4200;
//const AGGIE_AUTH_HOST = "https://aggie-auth.linux.usu.edu"; for testing w/ prod :)
const AGGIE_AUTH_HOST = "http://localhost:8000";
let ANUMBER = "a01234567";
process.stdout.write("what is your anumber? > ");
for await (const line of console) {
  ANUMBER = line.toLowerCase();
  break;
}

/* A: getting a new token */

// 1. request a new token.
// when you get a new token, it exists in "dev" mode.
// meaning, it can only be used to authenticate the user which requested the api token.
// you must contact a member of leadership to escalate to production :))
await logOverPromise(
  "asking for new token...",
  fetch(AGGIE_AUTH_HOST + "/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      anumber: ANUMBER,
    }),
  })
);

// 2. you should get a new email. click it and you should be given a token
process.stdout.write(
  "please copy the token returned by following the link you got in your email \n (this is your new aggie-auth API token) > "
);
let token: string = "";
for await (const line of console) {
  token = line;
  break;
}

// 3. update the callback to your new local server

const headers = new Headers();
headers.set("Authorization", "Bearer " + token);

const currentKey: ApiToken = await fetch(AGGIE_AUTH_HOST + "/token", {
  headers,
})
  .then((r) => r.json())
  .catch((e) => console.error(e));

headers.set("Content-Type", "application/json");

await fetch(AGGIE_AUTH_HOST + "/token", {
  method: "PUT",
  headers,
  body: JSON.stringify({
    wants_production: currentKey.wants_production,
    token_expiration_sec: currentKey.token_expiration_sec,
    callback: "http://localhost:" + TEST_PORT + "/aggie_auth",
    description: "My test aggie auth app",
  }),
});

/* B: Using the token */

const tokenSessions: Map<string, { anumber: string; authenticated: boolean }> =
  new Map();
export const server = Bun.serve({
  port: TEST_PORT,
  fetch: (req) => {
    const url = new URL(req.url);

    if (url.pathname === "/aggie_auth") {
      const params = url.searchParams;
      const token = params.get("token")!;

      if (tokenSessions.has(token)) {
        const session = tokenSessions.get(token)!;
        session.authenticated = true;
        tokenSessions.set(token, session);

        console.log("new session authenticated", token, session);

        logOverPromise(
          "deleting resources...",
          fetch(AGGIE_AUTH_HOST + "/token", {
            method: "DELETE",
            headers,
          }).then(() => process.exit(0))
        );

        return new Response("hai :3 " + JSON.stringify(session));
      }
    }

    return new Response("hola :))");
  },
});

// 1. request a token
const { token: loginToken } = await logOverPromise(
  "requesting new session",
  fetch(AGGIE_AUTH_HOST + "/authaggie", {
    headers,
    method: "POST",
    body: JSON.stringify({
      anumber: ANUMBER,
    }),
  }).then((x) => x.json())
);

tokenSessions.set(loginToken, { anumber: ANUMBER, authenticated: false });

// 2. go to your mailbox and look! magic.
