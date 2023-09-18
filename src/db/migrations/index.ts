import { createUpdatedAtTrigger } from "./0_createUpdatedAtTrigger";
import { createTokens } from "./1_createTokens";

export const migrationOrder = [createUpdatedAtTrigger, createTokens];
