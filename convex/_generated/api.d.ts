/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as clubs from "../clubs.js";
import type * as coach from "../coach.js";
import type * as customTables from "../customTables.js";
import type * as fields from "../fields.js";
import type * as games from "../games.js";
import type * as http from "../http.js";
import type * as impersonation from "../impersonation.js";
import type * as lib_auth from "../lib/auth.js";
import type * as players from "../players.js";
import type * as referees from "../referees.js";
import type * as rosters from "../rosters.js";
import type * as teams from "../teams.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  clubs: typeof clubs;
  coach: typeof coach;
  customTables: typeof customTables;
  fields: typeof fields;
  games: typeof games;
  http: typeof http;
  impersonation: typeof impersonation;
  "lib/auth": typeof lib_auth;
  players: typeof players;
  referees: typeof referees;
  rosters: typeof rosters;
  teams: typeof teams;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
