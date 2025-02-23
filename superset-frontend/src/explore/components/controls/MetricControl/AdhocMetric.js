/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import {
  sqlaAutoGeneratedMetricRegex,
  AGGREGATES,
} from 'src/explore/constants';

export const EXPRESSION_TYPES = {
  SIMPLE: 'SIMPLE',
  SQL: 'SQL',
};

function inferSqlExpressionColumn(adhocMetric) {
  if (
    adhocMetric.sqlExpression &&
    sqlaAutoGeneratedMetricRegex.test(adhocMetric.sqlExpression)
  ) {
    const indexFirstCloseParen = adhocMetric.sqlExpression.indexOf(')');
    const indexPairedOpenParen = adhocMetric.sqlExpression
      .substring(0, indexFirstCloseParen)
      .lastIndexOf('(');
    if (indexFirstCloseParen > 0 && indexPairedOpenParen > 0) {
      return adhocMetric.sqlExpression.substring(
        indexPairedOpenParen + 1,
        indexFirstCloseParen,
      );
    }
  }
  return null;
}

function inferSqlExpressionAggregate(adhocMetric) {
  if (
    adhocMetric.sqlExpression &&
    sqlaAutoGeneratedMetricRegex.test(adhocMetric.sqlExpression)
  ) {
    const indexFirstOpenParen = adhocMetric.sqlExpression.indexOf('(');
    if (indexFirstOpenParen > 0) {
      return adhocMetric.sqlExpression.substring(0, indexFirstOpenParen);
    }
  }
  return null;
}

export default class AdhocMetric {
  constructor(adhocMetric) {
    this.expressionType = adhocMetric.expressionType || EXPRESSION_TYPES.SIMPLE;
    if (this.expressionType === EXPRESSION_TYPES.SIMPLE) {
      // try to be clever in the case of transitioning from Sql expression back to simple expression
      const inferredColumn = inferSqlExpressionColumn(adhocMetric);
      this.column =
        adhocMetric.column ||
        (inferredColumn && { column_name: inferredColumn });
      this.aggregate =
        adhocMetric.aggregate || inferSqlExpressionAggregate(adhocMetric);
      this.sqlExpression = null;
    } else if (this.expressionType === EXPRESSION_TYPES.SQL) {
      this.sqlExpression = adhocMetric.sqlExpression;
      this.column = null;
      this.aggregate = null;
    }
    this.isNew = !!adhocMetric.isNew;
    this.datasourceWarning = !!adhocMetric.datasourceWarning;
    this.hasCustomLabel = !!(adhocMetric.hasCustomLabel && adhocMetric.label);
    this.label = this.hasCustomLabel
      ? adhocMetric.label
      : this.getDefaultLabel();

    this.optionName =
      adhocMetric.optionName ||
      `metric_${Math.random().toString(36).substring(2, 15)}_${Math.random()
        .toString(36)
        .substring(2, 15)}`;
  }

  getDefaultLabel() {
    const label = this.translateToSql({ useVerboseName: true });
    return label.length < 43 ? label : `${label.substring(0, 40)}...`;
  }

  translateToSql(
    params = { useVerboseName: false, transformCountDistinct: false },
  ) {
    if (this.expressionType === EXPRESSION_TYPES.SIMPLE) {
      const aggregate = this.aggregate || '';
      // eslint-disable-next-line camelcase
      const column =
        params.useVerboseName && this.column?.verbose_name
          ? `(${this.column.verbose_name})`
          : this.column?.column_name
          ? `(${this.column.column_name})`
          : '';
      // transform from `count_distinct(column)` to `count(distinct column)`
      if (
        params.transformCountDistinct &&
        aggregate === AGGREGATES.COUNT_DISTINCT &&
        /^\(.*\)$/.test(column)
      ) {
        return `COUNT(DISTINCT ${column.slice(1, -1)})`;
      }
      return aggregate + column;
    }
    if (this.expressionType === EXPRESSION_TYPES.SQL) {
      return this.sqlExpression;
    }
    return '';
  }

  duplicateWith(nextFields) {
    return new AdhocMetric({
      ...this,
      // all duplicate metrics are not considered new by default
      isNew: false,
      // but still overridable by nextFields
      ...nextFields,
    });
  }

  equals(adhocMetric) {
    return (
      adhocMetric.label === this.label &&
      adhocMetric.expressionType === this.expressionType &&
      adhocMetric.sqlExpression === this.sqlExpression &&
      adhocMetric.aggregate === this.aggregate &&
      (adhocMetric.column && adhocMetric.column.column_name) ===
        (this.column && this.column.column_name)
    );
  }

  isValid() {
    if (this.expressionType === EXPRESSION_TYPES.SIMPLE) {
      return !!(this.column && this.aggregate);
    }
    if (this.expressionType === EXPRESSION_TYPES.SQL) {
      return !!this.sqlExpression;
    }
    return false;
  }

  inferSqlExpressionAggregate() {
    return inferSqlExpressionAggregate(this);
  }

  inferSqlExpressionColumn() {
    return inferSqlExpressionColumn(this);
  }
}
