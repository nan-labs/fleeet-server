// store.mjs — Store interface definition (portable, no implementation).
//
// This interface describes the storage contract that any backend
// (database, blob storage, etc.) must implement to support fleeet.

/**
 * @typedef {Object} Account
 * @property {string} id
 * @property {string} space
 * @property {'empty'|'detached'|'claimed'|'discarded'} status
 * @property {boolean} is_owner
 * @property {string} created_at - ISO timestamp
 * @property {string|null} first_log_at - ISO timestamp
 * @property {string|null} claim_deadline - ISO timestamp
 * @property {string|null} claimed_at - ISO timestamp
 * @property {string|null} discarded_at - ISO timestamp
 * @property {string|null} retain_until - ISO timestamp
 * @property {string|null} email
 * @property {string|null} google_id
 * @property {'none'|'daily'|'weekly'} digest_frequency
 * @property {boolean} marketing_opt_in
 * @property {string|null} marketing_opt_in_at - ISO timestamp
 * @property {string|null} marketing_consent_text
 * @property {Object} board_settings
 */

/**
 * @typedef {Object} Token
 * @property {string} id
 * @property {string} account_id
 * @property {string} token_hash
 * @property {string|null} label
 * @property {string} created_at - ISO timestamp
 * @property {string|null} updated_at - ISO timestamp
 * @property {string|null} last_seen_at - ISO timestamp
 * @property {boolean} revoked
 * @property {string|null} revoked_at - ISO timestamp
 * @property {string|null} last4
 * @property {string|null} agent_kind
 */

/**
 * @typedef {Object} Event
 * @property {string} account_id
 * @property {string|null} token_id
 * @property {'session_start'|'heartbeat'|'blocked'|'session_end'} event
 * @property {string} run_id
 * @property {string} ts - ISO timestamp
 * @property {string} received_at - ISO timestamp
 * @property {string} retain_until - ISO timestamp
 * @property {string} agent
 * @property {string|null} [surface]
 * @property {string|null} [project]
 * @property {'user'|'routine'|'agent'} [trigger]
 * @property {'private'|'public'|null} [visibility]
 * @property {string|null} [summary]
 * @property {string|null} [task]
 * @property {Object|null} [source]
 * @property {Object|null} [progress]
 * @property {Object|null} [blocker]
 * @property {Object|null} [outcome]
 * @property {Object|null} [client]
 */

/**
 * Store interface — portable storage contract
 */
export class Store {
  /**
   * Get account by id
   * @param {string} id
   * @returns {Promise<Account|null>}
   */
  async getAccount(id) { throw new Error("Not implemented"); }

  /**
   * Get account by space
   * @param {string} space
   * @returns {Promise<Account|null>}
   */
  async getAccountBySpace(space) { throw new Error("Not implemented"); }

  /**
   * Create new account
   * @param {Account} account
   * @returns {Promise<Account>}
   */
  async createAccount(account) { throw new Error("Not implemented"); }

  /**
   * Update account
   * @param {string} id
   * @param {Partial<Account>} patch
   * @returns {Promise<Account|null>}
   */
  async updateAccount(id, patch) { throw new Error("Not implemented"); }

  /**
   * Get token by hash
   * @param {string} hash
   * @returns {Promise<Token|null>}
   */
  async getTokenByHash(hash) { throw new Error("Not implemented"); }

  /**
   * Insert new token
   * @param {Token} token
   * @returns {Promise<Token>}
   */
  async insertToken(token) { throw new Error("Not implemented"); }

  /**
   * Update token
   * @param {string} hash
   * @param {Partial<Token>} patch
   * @returns {Promise<Token|null>}
   */
  async updateToken(hash, patch) { throw new Error("Not implemented"); }

  /**
   * List tokens for account
   * @param {Account} account
   * @returns {Promise<Token[]>}
   */
  async listTokens(account) { throw new Error("Not implemented"); }

  /**
   * Insert event
   * @param {Event} event
   * @returns {Promise<void>}
   */
  async insertEvent(event) { throw new Error("Not implemented"); }

  /**
   * List events
   * @param {Object} options
   * @param {string} [options.since] - ISO timestamp
   * @param {number} [options.limit]
   * @param {string} [options.accountId]
   * @returns {Promise<Event[]>}
   */
  async listEvents(options) { throw new Error("Not implemented"); }

  /**
   * Get hidden run IDs for account
   * @param {string} accountId
   * @returns {Promise<Set<string>>}
   */
  async getHiddenRuns(accountId) { throw new Error("Not implemented"); }

  /**
   * Set runs as hidden/visible
   * @param {string} accountId
   * @param {string[]} runIds
   * @param {boolean} hidden
   * @returns {Promise<void>}
   */
  async setRunsHidden(accountId, runIds, hidden) { throw new Error("Not implemented"); }

  /**
   * Get run overrides (edits) for account
   * @param {string} accountId
   * @returns {Promise<Map<string, Object>>}
   */
  async getRunOverrides(accountId) { throw new Error("Not implemented"); }

  /**
   * Set run override (edit)
   * @param {string} accountId
   * @param {string} runId
   * @param {Object} fields
   * @param {string} actor
   * @returns {Promise<Object>}
   */
  async setRunOverride(accountId, runId, fields, actor) { throw new Error("Not implemented"); }

  /**
   * Check if run exists
   * @param {string} accountId
   * @param {string} runId
   * @returns {Promise<boolean>}
   */
  async hasRun(accountId, runId) { throw new Error("Not implemented"); }

  /**
   * Delete run
   * @param {string} accountId
   * @param {string} runId
   * @param {string} actor
   * @returns {Promise<number>} - number of events deleted
   */
  async deleteRun(accountId, runId, actor) { throw new Error("Not implemented"); }
}
