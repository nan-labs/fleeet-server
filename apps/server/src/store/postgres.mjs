// postgres-store.mjs — Postgres implementation of @fleeet/core Store interface

export class PostgresStore {
  constructor(sql) {
    this.sql = sql;
  }

  async getAccount(id) {
    if (!id) return null;
    const [account] = await this.sql`
      select * from accounts where id = ${id}
    `;
    return account || null;
  }

  async getAccountBySpace(space) {
    const [account] = await this.sql`
      select * from accounts where space = ${space}
    `;
    return account || null;
  }

  async createAccount(account) {
    const [created] = await this.sql`
      insert into accounts ${this.sql(account)}
      on conflict (space) do nothing
      returning *
    `;
    return created || await this.getAccountBySpace(account.space);
  }

  async updateAccount(id, patch) {
    const [updated] = await this.sql`
      update accounts
      set ${this.sql({ ...patch, updated_at: new Date().toISOString() })}
      where id = ${id}
      returning *
    `;
    return updated || null;
  }

  async getTokenByHash(hash) {
    const [token] = await this.sql`
      select * from tokens where token_hash = ${hash}
    `;
    return token || null;
  }

  async insertToken(token) {
    const data = { ...token };
    delete data.token_hash;
    await this.sql`
      insert into tokens (
        id, account_id, token_hash, label, created_at, revoked, revoked_at, last4, agent_kind
      ) values (
        ${token.id}, ${token.account_id}, ${token.token_hash}, ${token.label || null},
        ${token.created_at}, ${token.revoked}, ${token.revoked_at || null},
        ${token.last4 || null}, ${token.agent_kind || null}
      )
      on conflict (token_hash) do nothing
    `;
    return token;
  }

  async updateToken(hash, patch) {
    const [updated] = await this.sql`
      update tokens
      set ${this.sql(patch)}
      where token_hash = ${hash}
      returning *
    `;
    return updated || null;
  }

  async listTokens(account) {
    const tokens = await this.sql`
      select * from tokens
      where account_id = ${account.id}
      order by created_at desc
      limit 500
    `;
    return tokens;
  }

  async insertEvent(event) {
    await this.sql`
      insert into events ${this.sql(event)}
      on conflict (account_id, run_id, event, ts) do nothing
    `;
  }

  async listEvents({ since, limit, accountId }) {
    let query = this.sql`
      select * from events
      where account_id = ${accountId}
    `;
    
    if (since && Number.isFinite(Date.parse(since))) {
      query = this.sql`
        select * from events
        where account_id = ${accountId}
        and ts > ${new Date(since).toISOString()}
      `;
    }
    
    const events = await this.sql`
      ${query}
      order by ts desc
      limit ${limit}
    `;
    
    return events.map(({ id, ...rest }) => rest);
  }

  async getHiddenRuns(accountId) {
    const rows = await this.sql`
      select run_id from board_hidden_runs
      where account_id = ${accountId}
    `;
    return new Set(rows.map(r => r.run_id));
  }

  async setRunsHidden(accountId, runIds, hidden) {
    if (!runIds.length) return;
    
    if (hidden) {
      const values = runIds.map(run_id => ({ account_id: accountId, run_id }));
      await this.sql`
        insert into board_hidden_runs ${this.sql(values)}
        on conflict (account_id, run_id) do nothing
      `;
    } else {
      await this.sql`
        delete from board_hidden_runs
        where account_id = ${accountId}
        and run_id = any(${runIds})
      `;
    }
  }

  async getRunOverrides(accountId) {
    const rows = await this.sql`
      select run_id, task, summary, edited_at
      from run_overrides
      where account_id = ${accountId}
    `;
    return new Map(rows.map(({ run_id, ...rest }) => [run_id, rest]));
  }

  async setRunOverride(accountId, runId, fields, actor) {
    const [override] = await this.sql`
      insert into run_overrides (account_id, run_id, task, summary, edited_at, edited_by)
      values (
        ${accountId}, ${runId}, ${fields.task || null}, ${fields.summary || null},
        ${new Date().toISOString()}, ${actor}
      )
      on conflict (account_id, run_id) do update
      set task = coalesce(excluded.task, run_overrides.task),
          summary = coalesce(excluded.summary, run_overrides.summary),
          edited_at = excluded.edited_at,
          edited_by = excluded.edited_by
      returning *
    `;
    return override;
  }

  async hasRun(accountId, runId) {
    const [exists] = await this.sql`
      select 1 from events
      where account_id = ${accountId}
      and run_id = ${runId}
      limit 1
    `;
    return !!exists;
  }

  async deleteRun(accountId, runId, actor) {
    const runHash = await this.sql`
      select encode(sha256((${accountId}::text || ':' || ${runId})::bytea), 'hex') as hash
    `.then(([r]) => r.hash);
    
    const deleted = await this.sql`
      delete from events
      where account_id = ${accountId}
      and run_id = ${runId}
    `;
    
    if (deleted.count > 0) {
      await this.sql`
        insert into deleted_runs (account_id, run_hash, deleted_by)
        values (${accountId}, ${runHash}, ${actor})
        on conflict (account_id, run_hash) do nothing
      `;
      
      await this.sql`
        delete from board_hidden_runs
        where account_id = ${accountId}
        and run_id = ${runId}
      `;
      
      await this.sql`
        delete from run_overrides
        where account_id = ${accountId}
        and run_id = ${runId}
      `;
    }
    
    return deleted.count;
  }
}
