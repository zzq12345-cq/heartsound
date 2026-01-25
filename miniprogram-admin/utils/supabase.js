/**
 * Supabase Client for WeChat Mini Program - Admin
 * 微信小程序Supabase客户端封装 (管理后台)
 *
 * 复用用户端的Supabase封装，适配wx.request替代fetch
 */

const config = require('../config/supabase');

/**
 * Custom fetch implementation using wx.request
 */
function wxFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const { method = 'GET', headers = {}, body } = options;

    wx.request({
      url,
      method,
      header: {
        'Content-Type': 'application/json',
        'apikey': config.anonKey,
        'Authorization': `Bearer ${config.anonKey}`,
        ...headers
      },
      data: body ? JSON.parse(body) : undefined,
      timeout: config.apiSettings.timeout,
      success(res) {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json: () => Promise.resolve(res.data),
          text: () => Promise.resolve(JSON.stringify(res.data))
        });
      },
      fail(err) {
        reject(new Error(err.errMsg || 'Network request failed'));
      }
    });
  });
}

/**
 * Supabase query builder
 */
class SupabaseQueryBuilder {
  constructor(tableName, baseUrl, headers) {
    this.tableName = tableName;
    this.baseUrl = baseUrl;
    this.headers = headers;
    this._filters = [];
    this._select = '*';
    this._order = null;
    this._limit = null;
    this._single = false;
  }

  select(columns = '*') {
    this._select = columns;
    return this;
  }

  eq(column, value) {
    this._filters.push(`${column}=eq.${value}`);
    return this;
  }

  neq(column, value) {
    this._filters.push(`${column}=neq.${value}`);
    return this;
  }

  gt(column, value) {
    this._filters.push(`${column}=gt.${value}`);
    return this;
  }

  gte(column, value) {
    this._filters.push(`${column}=gte.${value}`);
    return this;
  }

  lt(column, value) {
    this._filters.push(`${column}=lt.${value}`);
    return this;
  }

  lte(column, value) {
    this._filters.push(`${column}=lte.${value}`);
    return this;
  }

  like(column, pattern) {
    this._filters.push(`${column}=like.${pattern}`);
    return this;
  }

  ilike(column, pattern) {
    this._filters.push(`${column}=ilike.${pattern}`);
    return this;
  }

  in(column, values) {
    this._filters.push(`${column}=in.(${values.join(',')})`);
    return this;
  }

  order(column, { ascending = true } = {}) {
    this._order = `${column}.${ascending ? 'asc' : 'desc'}`;
    return this;
  }

  limit(count) {
    this._limit = count;
    return this;
  }

  range(from, to) {
    this._rangeFrom = from;
    this._rangeTo = to;
    return this;
  }

  single() {
    this._single = true;
    this._limit = 1;
    return this;
  }

  _buildUrl() {
    let url = `${this.baseUrl}/rest/v1/${this.tableName}?select=${this._select}`;

    if (this._filters.length > 0) {
      url += '&' + this._filters.join('&');
    }

    if (this._order) {
      url += `&order=${this._order}`;
    }

    if (this._limit) {
      url += `&limit=${this._limit}`;
    }

    return url;
  }

  async _execute(method, body = null) {
    const url = this._buildUrl();
    const options = {
      method,
      headers: { ...this.headers }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    if (this._single) {
      options.headers['Accept'] = 'application/vnd.pgrst.object+json';
    }

    if (this._rangeFrom !== undefined && this._rangeTo !== undefined) {
      options.headers['Range'] = `${this._rangeFrom}-${this._rangeTo}`;
      options.headers['Range-Unit'] = 'items';
      options.headers['Prefer'] = 'count=exact';
    }

    try {
      const response = await wxFetch(url, options);
      const data = await response.json();

      if (!response.ok) {
        return { data: null, error: data };
      }

      return { data, error: null, count: Array.isArray(data) ? data.length : 0 };
    } catch (err) {
      return { data: null, error: { message: err.message } };
    }
  }

  async then(resolve) {
    const result = await this._execute('GET');
    resolve(result);
  }
}

/**
 * Supabase table operations
 */
class SupabaseTable {
  constructor(tableName, baseUrl, headers) {
    this.tableName = tableName;
    this.baseUrl = baseUrl;
    this.headers = headers;
  }

  select(columns = '*') {
    const builder = new SupabaseQueryBuilder(
      this.tableName,
      this.baseUrl,
      this.headers
    );
    return builder.select(columns);
  }

  insert(data, options = {}) {
    return new SupabaseInsertBuilder(
      this.tableName,
      this.baseUrl,
      this.headers,
      data,
      options
    );
  }

  async update(data) {
    const builder = new SupabaseUpdateBuilder(
      this.tableName,
      this.baseUrl,
      this.headers,
      data
    );
    return builder;
  }

  async delete() {
    const builder = new SupabaseDeleteBuilder(
      this.tableName,
      this.baseUrl,
      this.headers
    );
    return builder;
  }
}

/**
 * Supabase insert builder
 */
class SupabaseInsertBuilder {
  constructor(tableName, baseUrl, headers, data, options = {}) {
    this.tableName = tableName;
    this.baseUrl = baseUrl;
    this.headers = { ...headers };
    this.data = data;
    this.options = options;
    this._returnData = false;
    this._single = false;

    if (options.upsert) {
      this.headers['Prefer'] = 'resolution=merge-duplicates';
    }
  }

  select(columns = '*') {
    this._returnData = true;
    this._selectColumns = columns;
    this.headers['Prefer'] = (this.headers['Prefer'] || '') +
      (this.headers['Prefer'] ? ',' : '') + 'return=representation';
    return this;
  }

  single() {
    this._single = true;
    return this;
  }

  async then(resolve) {
    const url = `${this.baseUrl}/rest/v1/${this.tableName}`;

    try {
      const response = await wxFetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(this.data)
      });

      const result = await response.json();

      if (!response.ok) {
        resolve({ data: null, error: result });
      } else {
        const data = this._single && Array.isArray(result) ? result[0] : result;
        resolve({ data, error: null });
      }
    } catch (err) {
      resolve({ data: null, error: { message: err.message } });
    }
  }
}

/**
 * Supabase update builder
 */
class SupabaseUpdateBuilder {
  constructor(tableName, baseUrl, headers, data) {
    this.tableName = tableName;
    this.baseUrl = baseUrl;
    this.headers = headers;
    this.data = data;
    this._filters = [];
    this._single = false;
  }

  eq(column, value) {
    this._filters.push(`${column}=eq.${value}`);
    return this;
  }

  select(columns = '*') {
    this._returnData = true;
    this._selectColumns = columns;
    this.headers = { ...this.headers };
    this.headers['Prefer'] = (this.headers['Prefer'] || '') +
      (this.headers['Prefer'] ? ',' : '') + 'return=representation';
    return this;
  }

  single() {
    this._single = true;
    return this;
  }

  async then(resolve) {
    let url = `${this.baseUrl}/rest/v1/${this.tableName}`;

    if (this._filters.length > 0) {
      url += '?' + this._filters.join('&');
    }

    try {
      const response = await wxFetch(url, {
        method: 'PATCH',
        headers: this.headers,
        body: JSON.stringify(this.data)
      });

      const result = await response.json();

      if (!response.ok) {
        resolve({ data: null, error: result });
      } else {
        const data = this._single && Array.isArray(result) ? result[0] : result;
        resolve({ data, error: null });
      }
    } catch (err) {
      resolve({ data: null, error: { message: err.message } });
    }
  }
}

/**
 * Supabase delete builder
 */
class SupabaseDeleteBuilder {
  constructor(tableName, baseUrl, headers) {
    this.tableName = tableName;
    this.baseUrl = baseUrl;
    this.headers = headers;
    this._filters = [];
  }

  eq(column, value) {
    this._filters.push(`${column}=eq.${value}`);
    return this;
  }

  async then(resolve) {
    let url = `${this.baseUrl}/rest/v1/${this.tableName}`;

    if (this._filters.length > 0) {
      url += '?' + this._filters.join('&');
    }

    try {
      const response = await wxFetch(url, {
        method: 'DELETE',
        headers: this.headers
      });

      if (!response.ok) {
        const result = await response.json();
        resolve({ data: null, error: result });
      } else {
        resolve({ data: null, error: null });
      }
    } catch (err) {
      resolve({ data: null, error: { message: err.message } });
    }
  }
}

/**
 * Supabase client
 */
class SupabaseClient {
  constructor(url, anonKey) {
    this.url = url;
    this.anonKey = anonKey;
    this.headers = {
      'Content-Type': 'application/json',
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`
    };
  }

  from(tableName) {
    return new SupabaseTable(tableName, this.url, this.headers);
  }

  setAuth(token) {
    this.headers['Authorization'] = `Bearer ${token}`;
  }

  clearAuth() {
    this.headers['Authorization'] = `Bearer ${this.anonKey}`;
  }
}

// Create and export singleton instance
const supabase = new SupabaseClient(config.url, config.anonKey);

module.exports = {
  supabase,
  SupabaseClient
};
