import type {
  ElasticBackend,
  Document,
  SearchResponse,
  EsqlResponse,
  SearchHit,
  IndexMapping,
  IngestPipeline,
  AggregationResult,
  AggBucket,
} from '../types';

interface SimIndex {
  mapping: IndexMapping | null;
  documents: Map<string, Record<string, unknown>>;
}

export class SimulatedBackend implements ElasticBackend {
  mode: 'simulated' = 'simulated';
  private indices: Map<string, SimIndex> = new Map();
  private pipelines: Map<string, IngestPipeline> = new Map();

  async createIndex(name: string, mapping?: IndexMapping): Promise<void> {
    this.indices.set(name, {
      mapping: mapping ?? null,
      documents: new Map(),
    });
  }

  async deleteIndex(name: string): Promise<void> {
    this.indices.delete(name);
  }

  async indexExists(name: string): Promise<boolean> {
    return this.indices.has(name);
  }

  async getMapping(name: string): Promise<IndexMapping | null> {
    return this.indices.get(name)?.mapping ?? null;
  }

  async indexDocument(index: string, id: string, doc: Record<string, unknown>): Promise<void> {
    let idx = this.indices.get(index);
    if (!idx) {
      idx = { mapping: null, documents: new Map() };
      this.indices.set(index, idx);
    }
    idx.documents.set(id, doc);
  }

  async bulkIndex(
    operations: Array<{ index: string; id: string; doc: Record<string, unknown> }>,
  ): Promise<void> {
    for (const op of operations) {
      await this.indexDocument(op.index, op.id, op.doc);
    }
  }

  async getDocument(index: string, id: string): Promise<Document | null> {
    const idx = this.indices.get(index);
    if (!idx) return null;
    const source = idx.documents.get(id);
    if (!source) return null;
    return { _id: id, _index: index, _source: source };
  }

  private goldenEsqlResponse: EsqlResponse | null = null;

  setGoldenEsqlResponse(response: EsqlResponse): void {
    this.goldenEsqlResponse = response;
  }

  async esqlQuery(_query: string): Promise<EsqlResponse> {
    if (this.goldenEsqlResponse) {
      return this.goldenEsqlResponse;
    }
    return { columns: [], values: [] };
  }

  async count(index: string, query?: Record<string, unknown>): Promise<number> {
    const result = await this.search(index, { query: query ?? { match_all: {} }, size: 0 });
    return result.hits.total.value;
  }

  async search(index: string, body: Record<string, unknown>): Promise<SearchResponse> {
    const start = Date.now();
    const idx = this.indices.get(index);
    if (!idx) {
      return {
        hits: { total: { value: 0, relation: 'eq' }, max_score: null, hits: [] },
        took: Date.now() - start,
      };
    }

    const allDocs = Array.from(idx.documents.entries());

    // Handle top-level knn parameter (separate from query.knn)
    let scoredDocs: Array<[string, Record<string, unknown>, number]>;
    if (body.knn) {
      const knnResults = this.vectorQuery(allDocs, { knn: body.knn });
      if (body.query) {
        // Hybrid: combine knn results with query results
        const queryResults = this.executeQuery(allDocs, body.query as Record<string, unknown>);
        const knnMap = new Map(knnResults.map(([id, src, score]) => [id, { src, score }]));
        const queryMap = new Map(queryResults.map(([id, src, score]) => [id, { src, score }]));
        const allIds = new Set([...knnMap.keys(), ...queryMap.keys()]);
        const combined: Array<[string, Record<string, unknown>, number]> = [];
        for (const id of allIds) {
          const knnEntry = knnMap.get(id);
          const queryEntry = queryMap.get(id);
          const src = knnEntry?.src ?? queryEntry!.src;
          const score = (knnEntry?.score ?? 0) + (queryEntry?.score ?? 0);
          combined.push([id, src, score]);
        }
        combined.sort((a, b) => b[2] - a[2]);
        scoredDocs = combined;
      } else {
        scoredDocs = knnResults;
      }
    } else {
      scoredDocs = this.executeQuery(allDocs, body.query as Record<string, unknown> | undefined);
    }

    // Apply sort
    if (body.sort) {
      scoredDocs = this.applySort(scoredDocs, body.sort as Array<Record<string, unknown>>);
    }

    const totalCount = scoredDocs.length;

    // Apply from/size
    const from = (body.from as number) ?? 0;
    const size = (body.size as number) ?? 10;
    const paginated = scoredDocs.slice(from, from + size);

    const hits: SearchHit[] = paginated.map(([id, source, score]) => ({
      _id: id,
      _index: index,
      _score: score,
      _source: source,
    }));

    const response: SearchResponse = {
      hits: {
        total: { value: totalCount, relation: 'eq' },
        max_score: hits.length > 0 ? Math.max(...hits.map((h) => h._score)) : null,
        hits,
      },
      took: Date.now() - start,
    };

    // Process aggregations
    if (body.aggs || body.aggregations) {
      const aggsDef = (body.aggs ?? body.aggregations) as Record<string, Record<string, unknown>>;
      const allMatchedDocs = scoredDocs.map(([, source]) => source);
      response.aggregations = this.processAggregations(aggsDef, allMatchedDocs);
    }

    return response;
  }

  private executeQuery(
    docs: Array<[string, Record<string, unknown>]>,
    query?: Record<string, unknown>,
  ): Array<[string, Record<string, unknown>, number]> {
    if (!query || Object.keys(query).length === 0 || 'match_all' in query) {
      return docs.map(([id, source]) => [id, source, 1.0]);
    }

    if ('match' in query) {
      return this.matchQuery(docs, query.match as Record<string, unknown>);
    }

    if ('multi_match' in query) {
      return this.multiMatchQuery(docs, query.multi_match as Record<string, unknown>);
    }

    if ('term' in query) {
      return this.termQuery(docs, query.term as Record<string, unknown>);
    }

    if ('terms' in query) {
      return this.termsQuery(docs, query.terms as Record<string, unknown>);
    }

    if ('range' in query) {
      return this.rangeQuery(docs, query.range as Record<string, unknown>);
    }

    if ('bool' in query) {
      return this.boolQuery(docs, query.bool as Record<string, unknown>);
    }

    if ('query_string' in query) {
      return this.queryStringQuery(docs, query.query_string as Record<string, unknown>);
    }

    if ('wildcard' in query) {
      return this.wildcardQuery(docs, query.wildcard as Record<string, unknown>);
    }

    if ('exists' in query) {
      return this.existsQuery(docs, query.exists as Record<string, unknown>);
    }

    if ('knn' in query || 'script_score' in query) {
      return this.vectorQuery(docs, query);
    }

    if ('match_phrase' in query) {
      return this.matchPhraseQuery(docs, query.match_phrase as Record<string, unknown>);
    }

    if ('fuzzy' in query) {
      return this.fuzzyQuery(docs, query.fuzzy as Record<string, unknown>);
    }

    if ('prefix' in query) {
      return this.prefixQuery(docs, query.prefix as Record<string, unknown>);
    }

    if ('dis_max' in query) {
      return this.disMaxQuery(docs, query.dis_max as Record<string, unknown>);
    }

    if ('boosting' in query) {
      return this.boostingQuery(docs, query.boosting as Record<string, unknown>);
    }

    if ('nested' in query) {
      return this.nestedQuery(docs, query.nested as Record<string, unknown>);
    }

    if ('function_score' in query) {
      return this.functionScoreQuery(docs, query.function_score as Record<string, unknown>);
    }

    if ('ids' in query) {
      return this.idsQuery(docs, query.ids as Record<string, unknown>);
    }

    // Fallback: return all with low score
    return docs.map(([id, source]) => [id, source, 0.1]);
  }

  private matchPhraseQuery(
    docs: Array<[string, Record<string, unknown>]>,
    matchPhrase: Record<string, unknown>,
  ): Array<[string, Record<string, unknown>, number]> {
    const results: Array<[string, Record<string, unknown>, number]> = [];
    for (const [field, queryVal] of Object.entries(matchPhrase)) {
      const phrase = typeof queryVal === 'object'
        ? String((queryVal as Record<string, unknown>).query ?? '')
        : String(queryVal);
      const phraseLower = phrase.toLowerCase();
      for (const [id, source] of docs) {
        const fieldVal = this.getNestedValue(source, field);
        if (fieldVal === undefined) continue;
        if (String(fieldVal).toLowerCase().includes(phraseLower)) {
          results.push([id, source, 1.0]);
        }
      }
    }
    return results;
  }

  private fuzzyQuery(
    docs: Array<[string, Record<string, unknown>]>,
    fuzzy: Record<string, unknown>,
  ): Array<[string, Record<string, unknown>, number]> {
    const results: Array<[string, Record<string, unknown>, number]> = [];
    for (const [field, queryVal] of Object.entries(fuzzy)) {
      const target = typeof queryVal === 'object'
        ? String((queryVal as Record<string, unknown>).value ?? '')
        : String(queryVal);
      const fuzziness = typeof queryVal === 'object'
        ? Number((queryVal as Record<string, unknown>).fuzziness ?? 2)
        : 2;
      const targetLower = target.toLowerCase();
      for (const [id, source] of docs) {
        const fieldVal = this.getNestedValue(source, field);
        if (fieldVal === undefined) continue;
        const fieldStr = String(fieldVal).toLowerCase();
        const tokens = fieldStr.split(/\s+/);
        for (const token of tokens) {
          if (this.levenshtein(token, targetLower) <= fuzziness) {
            results.push([id, source, 0.8]);
            break;
          }
        }
      }
    }
    return results;
  }

  private prefixQuery(
    docs: Array<[string, Record<string, unknown>]>,
    prefix: Record<string, unknown>,
  ): Array<[string, Record<string, unknown>, number]> {
    const results: Array<[string, Record<string, unknown>, number]> = [];
    for (const [field, queryVal] of Object.entries(prefix)) {
      const prefixStr = typeof queryVal === 'object'
        ? String((queryVal as Record<string, unknown>).value ?? '')
        : String(queryVal);
      for (const [id, source] of docs) {
        const fieldVal = this.getNestedValue(source, field);
        if (fieldVal !== undefined && String(fieldVal).toLowerCase().startsWith(prefixStr.toLowerCase())) {
          results.push([id, source, 1.0]);
        }
      }
    }
    return results;
  }

  private disMaxQuery(
    docs: Array<[string, Record<string, unknown>]>,
    disMax: Record<string, unknown>,
  ): Array<[string, Record<string, unknown>, number]> {
    const queries = (disMax.queries as Record<string, unknown>[]) ?? [];
    const tieBreaker = Number(disMax.tie_breaker ?? 0);
    const scoreMap = new Map<string, { source: Record<string, unknown>; scores: number[] }>();

    for (const q of queries) {
      const results = this.executeQuery(
        docs.map((d) => d),
        q,
      );
      for (const [id, source, score] of results) {
        const entry = scoreMap.get(id) ?? { source, scores: [] };
        entry.scores.push(score);
        scoreMap.set(id, entry);
      }
    }

    const results: Array<[string, Record<string, unknown>, number]> = [];
    for (const [id, { source, scores }] of scoreMap) {
      scores.sort((a, b) => b - a);
      const maxScore = scores[0] ?? 0;
      const otherSum = scores.slice(1).reduce((sum, s) => sum + s, 0);
      results.push([id, source, maxScore + otherSum * tieBreaker]);
    }
    results.sort((a, b) => b[2] - a[2]);
    return results;
  }

  private boostingQuery(
    docs: Array<[string, Record<string, unknown>]>,
    boosting: Record<string, unknown>,
  ): Array<[string, Record<string, unknown>, number]> {
    const positiveResults = this.executeQuery(
      docs,
      boosting.positive as Record<string, unknown>,
    );
    const negativeResults = this.executeQuery(
      docs,
      boosting.negative as Record<string, unknown>,
    );
    const negativeBoost = Number(boosting.negative_boost ?? 0.5);
    const negativeIds = new Set(negativeResults.map(([id]) => id));

    return positiveResults.map(([id, source, score]) => {
      if (negativeIds.has(id)) {
        return [id, source, score * negativeBoost];
      }
      return [id, source, score];
    });
  }

  private nestedQuery(
    docs: Array<[string, Record<string, unknown>]>,
    nested: Record<string, unknown>,
  ): Array<[string, Record<string, unknown>, number]> {
    const path = String(nested.path);
    const innerQuery = nested.query as Record<string, unknown>;
    const results: Array<[string, Record<string, unknown>, number]> = [];

    for (const [id, source] of docs) {
      const nestedArray = this.getNestedValue(source, path);
      if (!Array.isArray(nestedArray)) continue;

      let bestScore = 0;
      for (const nestedDoc of nestedArray) {
        if (typeof nestedDoc !== 'object' || nestedDoc === null) continue;
        const fakeDoc: [string, Record<string, unknown>] = [id, nestedDoc as Record<string, unknown>];
        const innerResults = this.executeQuery([fakeDoc], innerQuery);
        if (innerResults.length > 0) {
          bestScore = Math.max(bestScore, innerResults[0][2]);
        }
      }
      if (bestScore > 0) {
        results.push([id, source, bestScore]);
      }
    }
    return results;
  }

  private functionScoreQuery(
    docs: Array<[string, Record<string, unknown>]>,
    funcScore: Record<string, unknown>,
  ): Array<[string, Record<string, unknown>, number]> {
    const innerQuery = funcScore.query as Record<string, unknown> | undefined;
    let results = this.executeQuery(docs, innerQuery);

    const functions = funcScore.functions as Array<Record<string, unknown>> | undefined;
    const scoreMode = String(funcScore.score_mode ?? 'multiply');
    const boostMode = String(funcScore.boost_mode ?? 'multiply');

    if (functions && functions.length > 0) {
      results = results.map(([id, source, queryScore]) => {
        const funcScores: number[] = [];
        for (const func of functions) {
          let fs = 1.0;
          const weight = Number(func.weight ?? 1);
          if (func.field_value_factor) {
            const fvf = func.field_value_factor as Record<string, unknown>;
            const fieldVal = Number(this.getNestedValue(source, String(fvf.field)) ?? 0);
            const factor = Number(fvf.factor ?? 1);
            const modifier = String(fvf.modifier ?? 'none');
            let val = fieldVal * factor;
            if (modifier === 'log1p') val = Math.log1p(val);
            else if (modifier === 'log2p') val = Math.log(2 + val);
            else if (modifier === 'sqrt') val = Math.sqrt(val);
            fs = val;
          }
          if (func.filter) {
            const filterResults = this.executeQuery([[id, source]], func.filter as Record<string, unknown>);
            if (filterResults.length === 0) continue;
          }
          funcScores.push(fs * weight);
        }

        let combinedFunc = 1.0;
        if (funcScores.length > 0) {
          if (scoreMode === 'multiply') combinedFunc = funcScores.reduce((a, b) => a * b, 1);
          else if (scoreMode === 'sum') combinedFunc = funcScores.reduce((a, b) => a + b, 0);
          else if (scoreMode === 'avg') combinedFunc = funcScores.reduce((a, b) => a + b, 0) / funcScores.length;
          else if (scoreMode === 'max') combinedFunc = Math.max(...funcScores);
          else if (scoreMode === 'min') combinedFunc = Math.min(...funcScores);
          else if (scoreMode === 'first') combinedFunc = funcScores[0];
        }

        let finalScore = queryScore;
        if (boostMode === 'multiply') finalScore = queryScore * combinedFunc;
        else if (boostMode === 'replace') finalScore = combinedFunc;
        else if (boostMode === 'sum') finalScore = queryScore + combinedFunc;
        else if (boostMode === 'avg') finalScore = (queryScore + combinedFunc) / 2;
        else if (boostMode === 'max') finalScore = Math.max(queryScore, combinedFunc);
        else if (boostMode === 'min') finalScore = Math.min(queryScore, combinedFunc);

        return [id, source, finalScore] as [string, Record<string, unknown>, number];
      });
      results.sort((a, b) => b[2] - a[2]);
    }

    return results;
  }

  private idsQuery(
    docs: Array<[string, Record<string, unknown>]>,
    ids: Record<string, unknown>,
  ): Array<[string, Record<string, unknown>, number]> {
    const values = (ids.values as string[]) ?? [];
    const idSet = new Set(values);
    return docs
      .filter(([id]) => idSet.has(id))
      .map(([id, source]) => [id, source, 1.0]);
  }

  private levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  }

  private matchQuery(
    docs: Array<[string, Record<string, unknown>]>,
    match: Record<string, unknown>,
  ): Array<[string, Record<string, unknown>, number]> {
    const results: Array<[string, Record<string, unknown>, number]> = [];

    for (const [field, queryVal] of Object.entries(match)) {
      const queryText = typeof queryVal === 'object'
        ? String((queryVal as Record<string, unknown>).query ?? '')
        : String(queryVal);

      const tokens = queryText.toLowerCase().split(/\s+/);

      for (const [id, source] of docs) {
        const fieldVal = this.getNestedValue(source, field);
        if (fieldVal === undefined) continue;

        const fieldStr = String(fieldVal).toLowerCase();
        const fieldTokens = fieldStr.split(/\s+/);

        let matchCount = 0;
        for (const token of tokens) {
          if (fieldTokens.some((ft) => ft.includes(token))) {
            matchCount++;
          }
        }

        if (matchCount > 0) {
          const score = matchCount / tokens.length;
          results.push([id, source, score]);
        }
      }
    }

    return results;
  }

  private multiMatchQuery(
    docs: Array<[string, Record<string, unknown>]>,
    multiMatch: Record<string, unknown>,
  ): Array<[string, Record<string, unknown>, number]> {
    const queryText = String(multiMatch.query ?? '');
    const fields = (multiMatch.fields as string[]) ?? ['*'];
    const results: Array<[string, Record<string, unknown>, number]> = [];

    const tokens = queryText.toLowerCase().split(/\s+/);

    for (const [id, source] of docs) {
      let bestScore = 0;

      for (const field of fields) {
        const cleanField = field.replace(/\^\d+$/, '');
        const boostMatch = field.match(/\^(\d+)$/);
        const boost = boostMatch ? parseInt(boostMatch[1], 10) : 1;

        const fieldVal = cleanField === '*'
          ? Object.values(source).map(String).join(' ')
          : this.getNestedValue(source, cleanField);

        if (fieldVal === undefined) continue;

        const fieldStr = String(fieldVal).toLowerCase();
        const fieldTokens = fieldStr.split(/\s+/);
        let matchCount = 0;
        for (const token of tokens) {
          if (fieldTokens.some((ft) => ft.includes(token))) matchCount++;
        }

        const score = (matchCount / tokens.length) * boost;
        bestScore = Math.max(bestScore, score);
      }

      if (bestScore > 0) {
        results.push([id, source, bestScore]);
      }
    }

    return results;
  }

  private termQuery(
    docs: Array<[string, Record<string, unknown>]>,
    term: Record<string, unknown>,
  ): Array<[string, Record<string, unknown>, number]> {
    const results: Array<[string, Record<string, unknown>, number]> = [];

    for (const [field, queryVal] of Object.entries(term)) {
      const targetVal = typeof queryVal === 'object'
        ? (queryVal as Record<string, unknown>).value
        : queryVal;

      for (const [id, source] of docs) {
        const fieldVal = this.getNestedValue(source, field);
        if (fieldVal !== undefined && String(fieldVal) === String(targetVal)) {
          results.push([id, source, 1.0]);
        }
      }
    }

    return results;
  }

  private termsQuery(
    docs: Array<[string, Record<string, unknown>]>,
    terms: Record<string, unknown>,
  ): Array<[string, Record<string, unknown>, number]> {
    const results: Array<[string, Record<string, unknown>, number]> = [];

    for (const [field, values] of Object.entries(terms)) {
      if (!Array.isArray(values)) continue;
      const strValues = values.map(String);

      for (const [id, source] of docs) {
        const fieldVal = this.getNestedValue(source, field);
        if (fieldVal !== undefined && strValues.includes(String(fieldVal))) {
          results.push([id, source, 1.0]);
        }
      }
    }

    return results;
  }

  private rangeQuery(
    docs: Array<[string, Record<string, unknown>]>,
    range: Record<string, unknown>,
  ): Array<[string, Record<string, unknown>, number]> {
    const results: Array<[string, Record<string, unknown>, number]> = [];

    for (const [field, constraints] of Object.entries(range)) {
      const c = constraints as Record<string, unknown>;

      for (const [id, source] of docs) {
        const fieldVal = this.getNestedValue(source, field);
        if (fieldVal === undefined) continue;

        const numVal = typeof fieldVal === 'number' ? fieldVal : parseFloat(String(fieldVal));
        const dateVal = isNaN(numVal) ? new Date(String(fieldVal)).getTime() : numVal;

        let passes = true;
        if (c.gte !== undefined) passes = passes && dateVal >= this.toComparable(c.gte);
        if (c.gt !== undefined) passes = passes && dateVal > this.toComparable(c.gt);
        if (c.lte !== undefined) passes = passes && dateVal <= this.toComparable(c.lte);
        if (c.lt !== undefined) passes = passes && dateVal < this.toComparable(c.lt);

        if (passes) {
          results.push([id, source, 1.0]);
        }
      }
    }

    return results;
  }

  private boolQuery(
    docs: Array<[string, Record<string, unknown>]>,
    bool: Record<string, unknown>,
  ): Array<[string, Record<string, unknown>, number]> {
    const must = this.ensureArray(bool.must);
    const should = this.ensureArray(bool.should);
    const mustNot = this.ensureArray(bool.must_not);
    const filter = this.ensureArray(bool.filter);

    let candidates = new Map<string, [string, Record<string, unknown>, number]>();

    // Start with all docs
    for (const [id, source] of docs) {
      candidates.set(id, [id, source, 0]);
    }

    // Apply must clauses
    for (const clause of must) {
      const clauseResults = this.executeQuery(docs, clause);
      const clauseIds = new Set(clauseResults.map(([id]) => id));
      const scores = new Map(clauseResults.map(([id, , score]) => [id, score]));

      for (const id of candidates.keys()) {
        if (!clauseIds.has(id)) {
          candidates.delete(id);
        } else {
          const existing = candidates.get(id)!;
          existing[2] += scores.get(id) ?? 0;
        }
      }
    }

    // Apply filter clauses (like must but no scoring)
    for (const clause of filter) {
      const clauseResults = this.executeQuery(docs, clause);
      const clauseIds = new Set(clauseResults.map(([id]) => id));

      for (const id of candidates.keys()) {
        if (!clauseIds.has(id)) {
          candidates.delete(id);
        }
      }
    }

    // Apply must_not clauses
    for (const clause of mustNot) {
      const clauseResults = this.executeQuery(docs, clause);
      const excludeIds = new Set(clauseResults.map(([id]) => id));

      for (const id of excludeIds) {
        candidates.delete(id);
      }
    }

    // Apply should clauses (boost score if matching)
    if (should.length > 0) {
      const minShouldMatch = must.length === 0 && filter.length === 0 ? 1 : 0;
      let shouldMatchCount = new Map<string, number>();

      for (const clause of should) {
        const clauseResults = this.executeQuery(docs, clause);
        for (const [id, , score] of clauseResults) {
          if (candidates.has(id)) {
            const existing = candidates.get(id)!;
            existing[2] += score;
            shouldMatchCount.set(id, (shouldMatchCount.get(id) ?? 0) + 1);
          }
        }
      }

      if (minShouldMatch > 0) {
        for (const [id, count] of shouldMatchCount) {
          if (count < minShouldMatch) {
            candidates.delete(id);
          }
        }
        // Remove candidates that didn't match any should
        for (const id of candidates.keys()) {
          if (!shouldMatchCount.has(id)) {
            candidates.delete(id);
          }
        }
      }
    }

    const results = Array.from(candidates.values());
    results.sort((a, b) => b[2] - a[2]);
    return results;
  }

  private queryStringQuery(
    docs: Array<[string, Record<string, unknown>]>,
    qs: Record<string, unknown>,
  ): Array<[string, Record<string, unknown>, number]> {
    const queryText = String(qs.query ?? '');
    const defaultField = String(qs.default_field ?? '_all');
    return this.matchQuery(docs, { [defaultField]: queryText });
  }

  private wildcardQuery(
    docs: Array<[string, Record<string, unknown>]>,
    wildcard: Record<string, unknown>,
  ): Array<[string, Record<string, unknown>, number]> {
    const results: Array<[string, Record<string, unknown>, number]> = [];

    for (const [field, queryVal] of Object.entries(wildcard)) {
      const pattern = typeof queryVal === 'object'
        ? String((queryVal as Record<string, unknown>).value ?? '')
        : String(queryVal);

      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');

      for (const [id, source] of docs) {
        const fieldVal = this.getNestedValue(source, field);
        if (fieldVal !== undefined && regex.test(String(fieldVal))) {
          results.push([id, source, 1.0]);
        }
      }
    }

    return results;
  }

  private existsQuery(
    docs: Array<[string, Record<string, unknown>]>,
    exists: Record<string, unknown>,
  ): Array<[string, Record<string, unknown>, number]> {
    const field = String(exists.field);
    const results: Array<[string, Record<string, unknown>, number]> = [];

    for (const [id, source] of docs) {
      const val = this.getNestedValue(source, field);
      if (val !== undefined && val !== null) {
        results.push([id, source, 1.0]);
      }
    }

    return results;
  }

  private vectorQuery(
    docs: Array<[string, Record<string, unknown>]>,
    query: Record<string, unknown>,
  ): Array<[string, Record<string, unknown>, number]> {
    // Simplified kNN: compute cosine similarity
    const knn = (query.knn ?? query.script_score) as Record<string, unknown> | undefined;
    if (!knn) return docs.map(([id, source]) => [id, source, 0.5]);

    const field = String(knn.field ?? 'embedding');
    const queryVector = (knn.query_vector as number[]) ?? [];
    const k = (knn.k as number) ?? 10;

    const results: Array<[string, Record<string, unknown>, number]> = [];

    for (const [id, source] of docs) {
      const docVector = this.getNestedValue(source, field) as number[] | undefined;
      if (!Array.isArray(docVector)) continue;

      const score = this.cosineSimilarity(queryVector, docVector);
      results.push([id, source, (1 + score) / 2]); // normalize to 0-1
    }

    results.sort((a, b) => b[2] - a[2]);
    return results.slice(0, k);
  }

  // --- Aggregations ---

  private processAggregations(
    aggsDef: Record<string, Record<string, unknown>>,
    docs: Record<string, unknown>[],
  ): Record<string, AggregationResult> {
    const results: Record<string, AggregationResult> = {};

    for (const [aggName, aggBody] of Object.entries(aggsDef)) {
      if ('terms' in aggBody) {
        results[aggName] = this.termsAggregation(aggBody.terms as Record<string, unknown>, docs);
      } else if ('avg' in aggBody) {
        results[aggName] = this.metricAggregation('avg', aggBody.avg as Record<string, unknown>, docs);
      } else if ('sum' in aggBody) {
        results[aggName] = this.metricAggregation('sum', aggBody.sum as Record<string, unknown>, docs);
      } else if ('min' in aggBody) {
        results[aggName] = this.metricAggregation('min', aggBody.min as Record<string, unknown>, docs);
      } else if ('max' in aggBody) {
        results[aggName] = this.metricAggregation('max', aggBody.max as Record<string, unknown>, docs);
      } else if ('value_count' in aggBody) {
        results[aggName] = this.metricAggregation('value_count', aggBody.value_count as Record<string, unknown>, docs);
      } else if ('cardinality' in aggBody) {
        results[aggName] = this.cardinalityAggregation(aggBody.cardinality as Record<string, unknown>, docs);
      } else if ('date_histogram' in aggBody) {
        results[aggName] = this.dateHistogramAggregation(aggBody.date_histogram as Record<string, unknown>, docs);
      } else if ('histogram' in aggBody) {
        results[aggName] = this.histogramAggregation(aggBody.histogram as Record<string, unknown>, docs);
      } else if ('range' in aggBody) {
        results[aggName] = this.rangeAggregation(aggBody.range as Record<string, unknown>, docs);
      } else if ('stats' in aggBody) {
        results[aggName] = this.statsAggregation(aggBody.stats as Record<string, unknown>, docs);
      } else if ('percentiles' in aggBody) {
        results[aggName] = this.percentilesAggregation(aggBody.percentiles as Record<string, unknown>, docs);
      } else if ('percentile_ranks' in aggBody) {
        results[aggName] = this.percentileRanksAggregation(aggBody.percentile_ranks as Record<string, unknown>, docs);
      } else if ('filters' in aggBody) {
        results[aggName] = this.filtersAggregation(aggBody.filters as Record<string, unknown>, docs);
      } else if ('top_hits' in aggBody) {
        results[aggName] = this.topHitsAggregation(aggBody.top_hits as Record<string, unknown>, docs);
      } else if ('rare_terms' in aggBody) {
        results[aggName] = this.rareTermsAggregation(aggBody.rare_terms as Record<string, unknown>, docs);
      }

      // Process pipeline aggregations (they reference sibling aggs)
      if (this.isPipelineAgg(aggBody)) {
        // Pipeline aggs are handled after all sibling aggs are computed
        // Store them for post-processing
      }

      // Process sub-aggregations
      if (aggBody.aggs || aggBody.aggregations) {
        const subAggs = (aggBody.aggs ?? aggBody.aggregations) as Record<string, Record<string, unknown>>;
        if (results[aggName]?.buckets) {
          for (const bucket of results[aggName].buckets!) {
            const bucketDocs = docs.filter((doc) => {
              const field = this.getAggField(aggBody);
              if (!field) return true;
              return String(this.getNestedValue(doc, field)) === String(bucket.key);
            });
            const subResults = this.processAggregations(subAggs, bucketDocs);
            Object.assign(bucket, subResults);
          }
        }
      }
    }

    // Process pipeline aggregations (derivative, cumulative_sum, bucket_script, bucket_selector)
    for (const [aggName, aggBody] of Object.entries(aggsDef)) {
      if ('derivative' in aggBody) {
        results[aggName] = this.derivativeAggregation(aggBody.derivative as Record<string, unknown>, results);
      } else if ('cumulative_sum' in aggBody) {
        results[aggName] = this.cumulativeSumAggregation(aggBody.cumulative_sum as Record<string, unknown>, results);
      } else if ('bucket_script' in aggBody) {
        // bucket_script operates on sibling bucket aggs - apply to parent buckets
        // This is handled at the bucket level, skip here
      } else if ('bucket_selector' in aggBody) {
        // bucket_selector filters buckets - handled at parent level
      }
    }

    return results;
  }

  private isPipelineAgg(aggBody: Record<string, unknown>): boolean {
    return 'derivative' in aggBody || 'cumulative_sum' in aggBody ||
           'bucket_script' in aggBody || 'bucket_selector' in aggBody ||
           'moving_avg' in aggBody || 'serial_diff' in aggBody;
  }

  private termsAggregation(
    params: Record<string, unknown>,
    docs: Record<string, unknown>[],
  ): AggregationResult {
    const field = String(params.field);
    const size = (params.size as number) ?? 10;
    const counts = new Map<string, number>();

    for (const doc of docs) {
      const val = this.getNestedValue(doc, field);
      if (val === undefined || val === null) continue;
      const key = String(val);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const buckets: AggBucket[] = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, size)
      .map(([key, count]) => ({ key, doc_count: count }));

    return { buckets };
  }

  private metricAggregation(
    type: string,
    params: Record<string, unknown>,
    docs: Record<string, unknown>[],
  ): AggregationResult {
    const field = String(params.field);
    const values: number[] = [];

    for (const doc of docs) {
      const val = this.getNestedValue(doc, field);
      if (val !== undefined && val !== null) {
        const num = Number(val);
        if (!isNaN(num)) values.push(num);
      }
    }

    if (values.length === 0) return { value: null as unknown as number };

    switch (type) {
      case 'avg': return { value: values.reduce((a, b) => a + b, 0) / values.length };
      case 'sum': return { value: values.reduce((a, b) => a + b, 0) };
      case 'min': return { value: Math.min(...values) };
      case 'max': return { value: Math.max(...values) };
      case 'value_count': return { value: values.length };
      default: return { value: 0 };
    }
  }

  private cardinalityAggregation(
    params: Record<string, unknown>,
    docs: Record<string, unknown>[],
  ): AggregationResult {
    const field = String(params.field);
    const unique = new Set<string>();

    for (const doc of docs) {
      const val = this.getNestedValue(doc, field);
      if (val !== undefined && val !== null) unique.add(String(val));
    }

    return { value: unique.size };
  }

  private dateHistogramAggregation(
    params: Record<string, unknown>,
    docs: Record<string, unknown>[],
  ): AggregationResult {
    const field = String(params.field);
    const interval = String(params.fixed_interval ?? params.calendar_interval ?? '1d');
    const intervalMs = this.parseInterval(interval);
    const counts = new Map<number, number>();

    for (const doc of docs) {
      const val = this.getNestedValue(doc, field);
      if (val === undefined) continue;
      const ts = new Date(String(val)).getTime();
      if (isNaN(ts)) continue;
      const bucket = Math.floor(ts / intervalMs) * intervalMs;
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }

    const buckets: AggBucket[] = Array.from(counts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([key, count]) => ({
        key,
        key_as_string: new Date(key).toISOString(),
        doc_count: count,
      }));

    return { buckets };
  }

  private histogramAggregation(
    params: Record<string, unknown>,
    docs: Record<string, unknown>[],
  ): AggregationResult {
    const field = String(params.field);
    const interval = Number(params.interval ?? 10);
    const counts = new Map<number, number>();

    for (const doc of docs) {
      const val = Number(this.getNestedValue(doc, field));
      if (isNaN(val)) continue;
      const bucket = Math.floor(val / interval) * interval;
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }

    const buckets: AggBucket[] = Array.from(counts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([key, count]) => ({ key, doc_count: count }));

    return { buckets };
  }

  private rangeAggregation(
    params: Record<string, unknown>,
    docs: Record<string, unknown>[],
  ): AggregationResult {
    const field = String(params.field);
    const ranges = params.ranges as Array<{ from?: number; to?: number; key?: string }>;
    const buckets: AggBucket[] = [];

    for (const range of ranges) {
      let count = 0;
      for (const doc of docs) {
        const val = Number(this.getNestedValue(doc, field));
        if (isNaN(val)) continue;
        const aboveFrom = range.from === undefined || val >= range.from;
        const belowTo = range.to === undefined || val < range.to;
        if (aboveFrom && belowTo) count++;
      }
      const key = range.key ?? `${range.from ?? '*'}-${range.to ?? '*'}`;
      buckets.push({ key, doc_count: count });
    }

    return { buckets };
  }

  private statsAggregation(
    params: Record<string, unknown>,
    docs: Record<string, unknown>[],
  ): AggregationResult {
    const field = String(params.field);
    const values: number[] = [];

    for (const doc of docs) {
      const val = Number(this.getNestedValue(doc, field));
      if (!isNaN(val)) values.push(val);
    }

    if (values.length === 0) {
      return { count: 0, min: null, max: null, avg: null, sum: 0 } as unknown as AggregationResult;
    }

    return {
      count: values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      sum: values.reduce((a, b) => a + b, 0),
    } as unknown as AggregationResult;
  }

  private percentilesAggregation(
    params: Record<string, unknown>,
    docs: Record<string, unknown>[],
  ): AggregationResult {
    const field = String(params.field);
    const percents = (params.percents as number[]) ?? [1, 5, 25, 50, 75, 95, 99];
    const values: number[] = [];
    for (const doc of docs) {
      const val = Number(this.getNestedValue(doc, field));
      if (!isNaN(val)) values.push(val);
    }
    values.sort((a, b) => a - b);
    const pctValues: Record<string, number | null> = {};
    for (const p of percents) {
      if (values.length === 0) { pctValues[String(p)] = null; continue; }
      const idx = Math.ceil((p / 100) * values.length) - 1;
      pctValues[String(p)] = values[Math.max(0, Math.min(idx, values.length - 1))];
    }
    return { values: pctValues } as unknown as AggregationResult;
  }

  private percentileRanksAggregation(
    params: Record<string, unknown>,
    docs: Record<string, unknown>[],
  ): AggregationResult {
    const field = String(params.field);
    const thresholds = (params.values as number[]) ?? [];
    const values: number[] = [];
    for (const doc of docs) {
      const val = Number(this.getNestedValue(doc, field));
      if (!isNaN(val)) values.push(val);
    }
    const pctRanks: Record<string, number> = {};
    for (const t of thresholds) {
      const below = values.filter((v) => v <= t).length;
      pctRanks[String(t)] = values.length > 0 ? Math.round((below / values.length) * 100 * 10) / 10 : 0;
    }
    return { values: pctRanks } as unknown as AggregationResult;
  }

  private filtersAggregation(
    params: Record<string, unknown>,
    docs: Record<string, unknown>[],
  ): AggregationResult {
    const filters = params.filters as Record<string, Record<string, unknown>> | undefined;
    if (!filters) return { buckets: [] };
    const buckets: AggBucket[] = [];
    const allDocsEntries = docs.map((d, i) => [String(i), d] as [string, Record<string, unknown>]);
    for (const [name, filter] of Object.entries(filters)) {
      const matched = this.executeQuery(allDocsEntries, filter);
      buckets.push({ key: name, doc_count: matched.length });
    }
    return { buckets };
  }

  private topHitsAggregation(
    params: Record<string, unknown>,
    docs: Record<string, unknown>[],
  ): AggregationResult {
    const size = (params.size as number) ?? 3;
    const hits = docs.slice(0, size).map((d, i) => ({
      _id: String(i),
      _source: d,
      _score: 1.0,
    }));
    return { hits: { total: { value: docs.length }, hits } } as unknown as AggregationResult;
  }

  private rareTermsAggregation(
    params: Record<string, unknown>,
    docs: Record<string, unknown>[],
  ): AggregationResult {
    const field = String(params.field);
    const maxDocCount = (params.max_doc_count as number) ?? 1;
    const counts = new Map<string, number>();
    for (const doc of docs) {
      const val = this.getNestedValue(doc, field);
      if (val === undefined || val === null) continue;
      const key = String(val);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const buckets: AggBucket[] = Array.from(counts.entries())
      .filter(([, count]) => count <= maxDocCount)
      .sort((a, b) => a[1] - b[1])
      .map(([key, count]) => ({ key, doc_count: count }));
    return { buckets };
  }

  // Pipeline aggregations
  private derivativeAggregation(
    params: Record<string, unknown>,
    siblingResults: Record<string, AggregationResult>,
  ): AggregationResult {
    const bucketsPath = String(params.buckets_path);
    // Find the parent bucket agg and compute derivative on its sub-agg values
    // This is a simplified version - returns the result for embedding in parent buckets
    return { value: 0 } as AggregationResult;
  }

  private cumulativeSumAggregation(
    params: Record<string, unknown>,
    siblingResults: Record<string, AggregationResult>,
  ): AggregationResult {
    return { value: 0 } as AggregationResult;
  }

  // --- Pipelines ---

  async putPipeline(id: string, pipeline: IngestPipeline): Promise<void> {
    this.pipelines.set(id, pipeline);
  }

  async simulatePipeline(
    id: string,
    docs: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]> {
    const pipeline = this.pipelines.get(id);
    if (!pipeline) throw new Error(`Pipeline '${id}' not found`);

    return docs.map((doc) => {
      let result = { ...doc };
      for (const processor of pipeline.processors) {
        result = this.applyProcessor(result, processor);
      }
      return result;
    });
  }

  private applyProcessor(
    doc: Record<string, unknown>,
    processor: Record<string, unknown>,
  ): Record<string, unknown> {
    const [type, config] = Object.entries(processor)[0];
    const cfg = config as Record<string, unknown>;
    const result = { ...doc };

    switch (type) {
      case 'set': {
        const field = String(cfg.field);
        result[field] = cfg.value;
        break;
      }
      case 'rename': {
        const field = String(cfg.field);
        const target = String(cfg.target_field);
        if (field in result) {
          result[target] = result[field];
          delete result[field];
        }
        break;
      }
      case 'remove': {
        const field = String(cfg.field);
        delete result[field];
        break;
      }
      case 'uppercase': {
        const field = String(cfg.field);
        if (typeof result[field] === 'string') {
          result[field] = (result[field] as string).toUpperCase();
        }
        break;
      }
      case 'lowercase': {
        const field = String(cfg.field);
        if (typeof result[field] === 'string') {
          result[field] = (result[field] as string).toLowerCase();
        }
        break;
      }
      case 'grok': {
        // Simplified grok: just extract named groups from pattern
        const field = String(cfg.field);
        const patterns = cfg.patterns as string[];
        if (typeof result[field] === 'string' && patterns) {
          for (const pattern of patterns) {
            const regex = this.grokToRegex(pattern);
            const match = (result[field] as string).match(regex);
            if (match?.groups) {
              Object.assign(result, match.groups);
              break;
            }
          }
        }
        break;
      }
      case 'date': {
        const field = String(cfg.field);
        const targetField = String(cfg.target_field ?? '@timestamp');
        const val = result[field];
        if (val) {
          result[targetField] = new Date(String(val)).toISOString();
        }
        break;
      }
      case 'convert': {
        const field = String(cfg.field);
        const targetType = String(cfg.type);
        if (result[field] !== undefined) {
          switch (targetType) {
            case 'integer': result[field] = parseInt(String(result[field]), 10); break;
            case 'float': result[field] = parseFloat(String(result[field])); break;
            case 'string': result[field] = String(result[field]); break;
            case 'boolean': result[field] = Boolean(result[field]); break;
          }
        }
        break;
      }
    }

    return result;
  }

  // --- Utility methods ---

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  private toComparable(val: unknown): number {
    if (typeof val === 'number') return val;
    const str = String(val);
    const num = parseFloat(str);
    if (!isNaN(num)) return num;
    return new Date(str).getTime();
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
  }

  private parseInterval(interval: string): number {
    const match = interval.match(/^(\d+)([smhd])$/);
    if (!match) return 86400000; // default 1 day
    const val = parseInt(match[1], 10);
    switch (match[2]) {
      case 's': return val * 1000;
      case 'm': return val * 60000;
      case 'h': return val * 3600000;
      case 'd': return val * 86400000;
      default: return 86400000;
    }
  }

  private applySort(
    docs: Array<[string, Record<string, unknown>, number]>,
    sort: Array<Record<string, unknown>>,
  ): Array<[string, Record<string, unknown>, number]> {
    return docs.sort((a, b) => {
      for (const sortClause of sort) {
        if (typeof sortClause === 'string' && sortClause === '_score') {
          const diff = b[2] - a[2];
          if (diff !== 0) return diff;
          continue;
        }
        for (const [field, order] of Object.entries(sortClause)) {
          const dir = typeof order === 'object'
            ? String((order as Record<string, unknown>).order ?? 'asc')
            : String(order);

          const valA = this.getNestedValue(a[1], field);
          const valB = this.getNestedValue(b[1], field);

          if (valA === valB) continue;
          if (valA === undefined) return 1;
          if (valB === undefined) return -1;

          const cmp = (valA as string | number) < (valB as string | number) ? -1 : 1;
          return dir === 'desc' ? -cmp : cmp;
        }
      }
      return 0;
    });
  }

  private ensureArray(val: unknown): Array<Record<string, unknown>> {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    return [val as Record<string, unknown>];
  }

  private getAggField(aggBody: Record<string, unknown>): string | null {
    for (const val of Object.values(aggBody)) {
      if (typeof val === 'object' && val && 'field' in (val as Record<string, unknown>)) {
        return String((val as Record<string, unknown>).field);
      }
    }
    return null;
  }

  private grokToRegex(pattern: string): RegExp {
    // Simplified: convert %{WORD:name} patterns to named groups
    const converted = pattern.replace(
      /%\{(\w+):(\w+)\}/g,
      (_, _type, name) => `(?<${name}>[\\S]+)`,
    );
    return new RegExp(converted);
  }

  async reset(): Promise<void> {
    this.indices.clear();
    this.pipelines.clear();
    this.goldenEsqlResponse = null;
  }
}
