/**
 * A wrapper around the objection.js model class
 * For 'where' you cannot have combinations of properties in a single AND condition
 * e.g.
 * {
 *   $and: {
 *     'a.b.c': 1,
 *     'b.e': 2
 *   },
 *   $or: [
 *      {}
 *   ]
 * }
 *
 * However, for 'require' conditions, this might be possible since ALL variables exist
 * in the same scope, since there's a join
 */

import {
  QueryBuilder,
  Transaction,
  ModelClass,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Model as ObjModel,
  OrderByDirection,
  Relation
} from 'objection';
import * as _ from 'lodash';
import { debug } from '../config';
import { sliceRelation, Operations } from './utils';
import { createRelationExpression } from './ExpressionBuilder';
import {
  iterateLogicalExpression,
  getPropertiesFromExpression
} from './LogicalIterator';

// Types
import {
  FilterQueryBuilderOptions,
  OperationUtils,
  FilterQueryParams,
  BaseModel,
  AggregationConfig,
  RequireExpression,
  EagerExpression,
  ExpressionObject
} from './types';

// eslint-disable-next-line import/order
import Knex = require('knex');

export default class FilterQueryBuilder<
  M extends BaseModel,
  K extends typeof ObjModel
> {
  Model: K;

  _builder: QueryBuilder<M>;

  utils: OperationUtils<M>;

  /**
   * @param {Model} Model
   * @param {Transaction} trx
   * @param {Object} options.operators Custom operator handlers
   */
  constructor(
    Model: K,
    trx: Transaction,
    options: FilterQueryBuilderOptions<M> = {}
  ) {
    this.Model = Model;
    this._builder = Model.query(trx) as QueryBuilder<M>;

    const { operators = {}, onAggBuild } = options;

    // Initialize instance specific utilities
    this.utils = Operations({ operators, onAggBuild });
  }

  build(params: FilterQueryParams = {}): QueryBuilder<M> {
    const { fields, limit, offset, order, eager } = params;

    applyFields(fields, this._builder);
    applyWhere(params.where, this._builder, this.utils);
    applyRequire(params.require, this._builder, this.utils);

    applyOrder(order, this._builder);
    applyEager(eager, this._builder, this.utils);
    applyLimit(limit, offset, this._builder);

    return this._builder;
  }

  async count(): Promise<number> {
    const { count } = await this._builder
      .clone()
      .clear(/orderBy|offset|limit/)
      .clearWithGraph()
      .count('* AS count')
      .first();

    return count;
  }

  /**
   * @param {String} exp The objection.js eager expression
   */
  allowEager(eagerExpression: string): this {
    this._builder.allowEager(eagerExpression);

    return this;
  }
}

/**
 * Based on a relation string, get the outer most model
 * @param {QueryBuilder} builder
 * @param {String} relation
 */
const getOuterModel = function <M extends BaseModel>(
  builder: QueryBuilder<M>,
  relation: string
): ModelClass<M> {
  const Model = builder.modelClass();
  let CurrentModel = Model;
  for (const relationName of relation.split('.')) {
    const currentRelation = CurrentModel.getRelations()[relationName];
    CurrentModel = currentRelation.relatedModelClass as ModelClass<M>;
  }
  return CurrentModel;
};

/**
 * Return a case statement which fills nulls with zeroes
 * @param {String} alias
 */
const nullToZero = function (
  knex: Knex,
  tableAlias: string,
  columnAlias = 'count'
): Knex.Raw {
  const column = `${tableAlias}.${columnAlias}`;
  return knex.raw(
    'case when ?? is null then 0 else cast(?? as decimal) end as ??',
    [column, column, columnAlias]
  );
};

// A list of allowed aggregation functions
const aggregationFunctions = ['count', 'sum', 'min', 'max', 'avg'];

/**
 * Build a single aggregation into a target alias on a query builder
 * Defaults to count, but anything in aggregationFunctions can be used
 * @param {Object} aggregation
 * @param {QueryBuilder} builder
 * @param {Object} utils
 */
const buildAggregation = function <M extends BaseModel>(
  aggregation: AggregationConfig,
  builder: QueryBuilder<M>,
  utils: OperationUtils<M>
) {
  const Model = builder.modelClass();
  const knex = Model.knex();
  const {
    relation,
    $where,
    distinct = false,
    alias: columnAlias = 'count',
    type = 'count',
    field
  } = aggregation;
  const { onAggBuild } = utils;

  // Do some initial validation
  if (!aggregationFunctions.includes(type)) {
    throw new Error(`Invalid type [${type}] for aggregation`);
  }
  if (type !== 'count' && !field) {
    throw new Error(`Must specify "field" with [${type}] aggregation`);
  }

  const baseIdColumn: string[] =
    typeof Model.idColumn === 'string'
      ? [Model.tableName + '.' + Model.idColumn]
      : Model.idColumn.map((idColumn) => Model.tableName + '.' + idColumn);

  // When joining the filter query, the base left-joined table is aliased
  // as the full relation name joined by the : character
  const relationNames = relation.split('.');
  const fullOuterRelation = relationNames.join(':');

  // Filtering starts using the outermost model as a base
  const OuterModel = getOuterModel(builder, relation);

  const idColumns = _.isArray(OuterModel.idColumn)
    ? OuterModel.idColumn
    : [OuterModel.idColumn];
  const fullIdColumns = idColumns.map(
    (idColumn) => `${fullOuterRelation}.${idColumn}`
  );

  // Create the subquery for the aggregation with the base model as a starting point
  const distinctTag = distinct ? 'distinct ' : '';
  const aggregationQuery = Model.query()
    .select(baseIdColumn)
    .select(
      knex.raw(`${type}(${distinctTag}??) as ??`, [
        field ? `${fullOuterRelation}.${field}` : fullIdColumns[0],
        columnAlias
      ])
    )
    .leftJoinRelated(relation);

  // Apply filters to models on the aggregation path
  if (onAggBuild) {
    let CurrentModel = Model;
    const relationStack = [];
    for (const relationName of relation.split('.')) {
      relationStack.push(relationName);
      const { relatedModelClass } = CurrentModel.getRelations()[relationName];
      const query = onAggBuild(relatedModelClass);
      const fullyQualifiedRelation = relationStack.join(':');
      if (query) {
        const aggModelAlias = `${fullyQualifiedRelation}_agg`;
        aggregationQuery.innerJoin(query.as(aggModelAlias), function () {
          this.on(
            `${aggModelAlias}.${relatedModelClass.idColumn}`,
            '=',
            `${fullyQualifiedRelation}.${relatedModelClass.idColumn}`
          );
        });
      }
      CurrentModel = relatedModelClass as ModelClass<M>;
    }
  }

  // Apply the filtering using the outer model as a starting point
  const filterQuery = OuterModel.query();
  applyRequire($where, filterQuery, utils);
  const filterQueryAlias = 'filter_query';
  aggregationQuery.innerJoin(filterQuery.as(filterQueryAlias), function () {
    fullIdColumns.forEach((fullIdColumn, index) => {
      this.on(fullIdColumn, '=', `${filterQueryAlias}.${idColumns[index]}`);
    });
  });

  aggregationQuery.groupBy(baseIdColumn);

  return aggregationQuery;
};

const applyAggregations = function <M extends BaseModel>(
  aggregations: AggregationConfig[],
  builder: QueryBuilder<M>,
  utils: OperationUtils<M>
) {
  if (aggregations.length === 0) return;

  const Model = builder.modelClass();
  const knex = Model.knex();
  const aggAlias = (i) => `agg_${i}`;
  const idColumns = _.isArray(Model.idColumn)
    ? Model.idColumn
    : [Model.idColumn];
  const fullIdColumns = idColumns.map((id) => `${Model.tableName}.${id}`);

  const aggregationQueries = aggregations.map((aggregation) =>
    buildAggregation(aggregation, builder, utils)
  );

  // Create a replicated subquery equivalent to the base model + aggregations
  const fullQuery = Model.query().select(Model.tableName + '.*');

  // For each aggregation query, select the aggregation then join onto the full query
  aggregationQueries.forEach((query, i) => {
    const nullToZeroStatement = nullToZero(
      knex,
      aggAlias(i),
      aggregations[i].alias
    );
    fullQuery
      .select(nullToZeroStatement)
      .leftJoin(query.as(aggAlias(i)), function () {
        fullIdColumns.forEach((fullIdColumn, j) => {
          this.on(fullIdColumn, '=', `${aggAlias(i)}.${idColumns[j]}`);
        });
      });
  });

  // Finally, build the base query
  builder.from(fullQuery.as(Model.tableName));
};

/**
 * Apply an object notation eager object with scope based filtering
 * @param {Object} expression
 * @param {QueryBuilder} builder
 * @param {Array<string>} path An array of the current relation
 * @param {Object} utils
 */
const applyEagerFilter = function <M extends BaseModel>(
  expression: EagerExpression,
  builder: QueryBuilder<M>,
  path: string[],
  utils: OperationUtils<M>
) {
  debug('applyEagerFilter(', { expression, path }, ')');

  // Apply a where on the root model
  if (expression.$where) {
    const filterCopy = Object.assign({}, expression.$where) as ExpressionObject;
    applyRequire(filterCopy, builder, utils);
    delete expression.$where;
  }

  // Apply an aggregation set on the root model
  if (expression.$aggregations) {
    applyAggregations(expression.$aggregations, builder, utils);
    delete expression.$aggregations;
  }

  // Walk the eager tree
  for (const lhs in expression) {
    const rhs = expression[lhs];
    debug(`Eager Filter lhs[${lhs}] rhs[${JSON.stringify(rhs)}]`);

    if (typeof rhs === 'boolean' || typeof rhs === 'string') continue;

    // rhs is an object
    const eagerName = rhs.$relation ? `${rhs.$relation} as ${lhs}` : lhs;

    // including aliases e.g. "a as b.c as d"
    const newPath = path.concat(eagerName);
    const relationExpression = newPath.join('.');

    if (rhs.$where) {
      debug('modifyGraph(', { relationExpression, filter: rhs.$where }, ')');
      const filterCopy = { ...rhs.$where };

      // TODO: Could potentially apply all 'modifyEagers' at the end
      builder.modifyGraph(relationExpression, (subQueryBuilder) => {
        applyRequire(filterCopy, subQueryBuilder, utils);
      });

      delete rhs.$where;

      expression[lhs] = rhs;
    }

    if (Object.keys(rhs).length > 0) {
      applyEagerFilter(rhs, builder, newPath, utils);
    }
  }

  return expression;
};

const applyEagerObject = function (expression, builder, utils) {
  const expressionWithoutFilters = applyEagerFilter(
    expression,
    builder,
    [],
    utils
  );
  builder.withGraphFetched(expressionWithoutFilters);
};

export function applyEager<M extends BaseModel>(
  eager: string | EagerExpression,
  builder: QueryBuilder<M>,
  utils: OperationUtils<M>
): void {
  if (typeof eager === 'object') {
    return applyEagerObject(eager, builder, utils);
  }

  builder.withGraphFetched(eager);
}

/**
 * Test if a property is a related property
 * e.g. "name" => false, "movies.name" => true
 * @param {String} name
 */
const isRelatedProperty = function (name) {
  return !!sliceRelation(name).relationName;
};

/**
 * Test all relations on a set of properties for a particular condition
 */
function testAllRelations<M extends BaseModel>(
  properties: string[],
  Model: ModelClass<M>,
  predicate: (relation: Relation) => boolean
) {
  let testResult = true;
  for (const field of properties) {
    const { relationName } = sliceRelation(field);
    if (!relationName) continue;

    let rootModel: typeof ObjModel | ModelClass<M> = Model;
    for (const relatedModelName of relationName.split('.')) {
      const relation = rootModel.getRelation(relatedModelName);
      if (!predicate(relation)) {
        testResult = false;
        break;
      }

      rootModel = relation.relatedModelClass;
    }
  }

  return testResult;
}

/**
 * Apply an entire require expression to the query builder
 * e.g. { "prop1": { "$like": "A" }, "prop2": { "$in": [1] } }
 * Do a first pass on the fields to create an objectionjs RelationExpression
 * This prevents joining tables multiple times, and optimizes number of joins
 * @param {Object} filter
 * @param {QueryBuilder} builder The root query builder
 */
export function applyRequire<M extends BaseModel>(
  filter: RequireExpression = {},
  builder: QueryBuilder<M>,
  utils: OperationUtils<M>
): QueryBuilder<M> {
  const { applyPropertyExpression } = utils;

  // If there are no properties at all, just return
  const propertiesSet = getPropertiesFromExpression(filter);
  if (propertiesSet.length === 0) return builder;

  const applyLogicalExpression = iterateLogicalExpression({
    onExit: function (propertyName, value, _builder) {
      applyPropertyExpression(propertyName, value, _builder as QueryBuilder<M>);
    },
    onLiteral: function () {
      throw new Error('Filter is invalid');
    }
  });
  const getFullyQualifiedName = (name) =>
    sliceRelation(name, '.', Model.tableName).fullyQualifiedProperty;

  const Model = builder.modelClass();
  const idColumns = _.isArray(Model.idColumn)
    ? Model.idColumn
    : [Model.idColumn];
  const fullIdColumns = idColumns.map(
    (idColumn) => `${Model.tableName}.${idColumn}`
  );

  // If there are no related properties, don't join
  const relatedPropertiesSet = propertiesSet.filter(isRelatedProperty);
  if (relatedPropertiesSet.length === 0) {
    applyLogicalExpression(filter, builder, false, getFullyQualifiedName);
    return builder;
  }

  // If only joining belongsTo relationships, create a simpler query
  const isOnlyJoiningToBelongsTo: boolean = testAllRelations(
    propertiesSet,
    Model,
    (relation: unknown) => {
      return (
        relation instanceof Model.BelongsToOneRelation ||
        relation instanceof Model.HasOneRelation
      );
    }
  );
  if (isOnlyJoiningToBelongsTo) {
    // If there are only belongsTo or hasOne relations, then filter on the main query
    applyLogicalExpression(filter, builder, false, getFullyQualifiedName);
    const joinRelation = createRelationExpression(propertiesSet);
    builder.joinRelated(joinRelation);
    return builder;
  }

  // If there are a hasMany or manyToMany relations, then create a separate filter query
  const filterQuery = Model.query().distinct(...fullIdColumns);
  applyLogicalExpression(filter, filterQuery, false, getFullyQualifiedName);

  // If there were related properties, join onto the filter
  const joinRelation = createRelationExpression(propertiesSet);
  filterQuery.joinRelated(joinRelation);

  const filterQueryAlias = 'filter_query';
  builder.innerJoin(filterQuery.as(filterQueryAlias), function () {
    fullIdColumns.forEach((fullIdColumn, index) => {
      this.on(fullIdColumn, '=', `${filterQueryAlias}.${idColumns[index]}`);
    });
  });

  return builder;
}

/**
 * Apply an entire where expression to the query builder
 * e.g. { "prop1": { "$like": "A" }, "prop2": { "$in": [1] } }
 * For now it only supports a single operation for each property
 * but in reality, it should allow an AND of multiple operations
 * @param {Object} filter The filter object
 * @param {QueryBuilder} builder The root query builder
 */
export function applyWhere<M extends BaseModel>(
  filter: RequireExpression = {},
  builder: QueryBuilder<M>,
  utils: OperationUtils<M>
): QueryBuilder<M> {
  const { applyPropertyExpression } = utils;
  const Model = builder.modelClass();

  _.forEach(filter as ExpressionObject, (andExpression, property) => {
    const { relationName, propertyName } = sliceRelation(property);

    if (!relationName) {
      // Root level where should include the root table name
      const fullyQualifiedProperty = `${Model.tableName}.${propertyName}`;
      return applyPropertyExpression(
        fullyQualifiedProperty,
        andExpression,
        builder
      );
    }

    // Eager query fields should include the eager model table name
    builder.modifyGraph(relationName, (eagerBuilder) => {
      const fullyQualifiedProperty = `${
        eagerBuilder.modelClass().tableName
      }.${propertyName}`;
      applyPropertyExpression(
        fullyQualifiedProperty,
        andExpression,
        eagerBuilder as QueryBuilder<M>
      );
    });
  });

  return builder;
}

/**
 * Order the result by a root model field or order related models
 * Related properties are ordered locally (within the subquery) and not globally
 * e.g. order = "name desc, city.country.name asc"
 * @param {String} order An comma delimited order expression
 * @param {QueryBuilder} builder The root query builder
 */
export function applyOrder<M extends BaseModel>(
  order: string,
  builder: QueryBuilder<M>
): QueryBuilder<M> {
  if (!order) return;
  const Model = builder.modelClass();

  order.split(',').forEach((orderStatement) => {
    const [orderProperty, direction = 'asc'] = orderStatement
      .trim()
      .split(' ') as [string, OrderByDirection];
    const { propertyName, relationName } = sliceRelation(orderProperty);

    if (!relationName) {
      // Root level where should include the root table name
      const fullyQualifiedColumn = `${Model.tableName}.${propertyName}`;
      return builder.orderBy(fullyQualifiedColumn, direction);
    }

    // For now, only allow sub-query ordering of eager expressions
    builder.modifyGraph(relationName, (eagerBuilder) => {
      const fullyQualifiedColumn = `${
        eagerBuilder.modelClass().tableName
      }.${propertyName}`;
      eagerBuilder.orderBy(fullyQualifiedColumn, direction);
    });
  });

  return builder;
}

/**
 * Based on a relation name, select a subset of fields. Do nothing if there are no fields
 * @param {Builder} builder An instance of a knex builder
 * @param {Array<String>} fields A list of fields to select
 */
function selectFields<M extends BaseModel>(
  fields: string[],
  builder: QueryBuilder<M>,
  relationName?: string
): QueryBuilder<M> {
  if (fields.length === 0) return;
  const knex = builder.modelClass().knex();
  // HACK: sqlite incorrect column alias when selecting 1 column
  // TODO: investigate sqlite column aliasing on eager models
  if (fields.length === 1 && !relationName) {
    const field = fields[0].split('.')[1];
    return builder.select(knex.raw('?? as ??', [fields[0], field]));
  }
  if (!relationName) return builder.select(fields);

  builder.modifyGraph(relationName, (eagerQueryBuilder) => {
    eagerQueryBuilder.select(
      fields.map(
        (field) => `${eagerQueryBuilder.modelClass().tableName}.${field}`
      )
    );
  });
}

/**
 * Select a limited set of fields. Use dot notation to limit eagerly loaded models.
 * @param {Array<String>} fields An array of dot notation fields
 * @param {QueryBuilder} builder The root query builder
 */
export function applyFields<M extends BaseModel>(
  fields: string[] = [],
  builder: QueryBuilder<M>
): QueryBuilder<M> {
  const Model = builder.modelClass();

  // Group fields by relation e.g. ["a.b.name", "a.b.id"] => {"a.b": ["name", "id"]}
  const rootFields: string[] = []; // Fields on the root model
  const fieldsByRelation = fields.reduce((obj, fieldName) => {
    const { propertyName, relationName } = sliceRelation(fieldName);
    if (!relationName) {
      rootFields.push(`${Model.tableName}.${propertyName}`);
    } else {
      // Push it into an array keyed by relationName
      obj[relationName] = obj[relationName] || [];
      obj[relationName].push(propertyName);
    }
    return obj;
  }, {});

  // Root fields
  selectFields(rootFields, builder);

  // Related fields
  _.map(fieldsByRelation, (_fields, relationName) =>
    selectFields(_fields, builder, relationName)
  );

  return builder;
}

export function applyLimit<M extends BaseModel>(
  limit: number | undefined,
  offset: number | undefined,
  builder: QueryBuilder<M>
): QueryBuilder<M> {
  if (limit) builder.limit(limit);
  if (offset) builder.offset(offset);

  return builder;
}
