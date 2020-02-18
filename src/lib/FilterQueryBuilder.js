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
const _ = require('lodash');
const { debug } = require('../config');
const {
  sliceRelation,
  Operations
} = require('./utils');
const {
  createRelationExpression
} = require('./ExpressionBuilder');
const {
  iterateLogicalExpression,
  getPropertiesFromExpression
} = require('./LogicalIterator');

module.exports = class FilterQueryBuilder {
  /**
   * @param {Model} Model
   * @param {Transaction} trx
   * @param {Object} options.operators Custom operator handlers
   */
  constructor(Model, trx, options = {}) {
    this.Model = Model;
    this._builder = Model.query(trx);

    const { operators = {}, onAggBuild } = options;

    // Initialize instance specific utilities
    this.utils = Operations({ operators, onAggBuild });
  }

  build(params = {}) {
    const {
      fields,
      limit,
      offset,
      order,
      eager,
    } = params;

    applyFields(fields, this._builder);
    applyWhere(params.where, this._builder, this.utils);
    applyRequire(params.require, this._builder, this.utils);

    applyOrder(order, this._builder);
    applyEager(eager, this._builder, this.utils);
    applyLimit(limit, offset, this._builder);

    return this._builder;
  }

  async count() {
    const { count } = await this._builder.clone()
      .clear(/orderBy|offset|limit/)
      .clearWithGraph()
      .count('* AS count')
      .first();

    return count;
  }

  /**
   * @param {String} exp The objection.js eager expression
   */
  allowEager(eagerExpression) {
    this._builder.allowEager(eagerExpression);

    return this;
  }
};

/**
 * Based on a relation string, get the outer most model
 * @param {QueryBuilder} builder
 * @param {String} relation
 */
const getOuterModel = function(builder, relation) {
  const Model = builder.modelClass();
  let CurrentModel = Model;
  for (const relationName of relation.split('.')) {
    const currentRelation = CurrentModel.getRelations()[relationName];
    CurrentModel = currentRelation.relatedModelClass;
  }
  return CurrentModel;
};

/**
 * Return a case statement which fills nulls with zeroes
 * @param {String} alias
 */
const nullToZero = function(knex, tableAlias, columnAlias = 'count') {
  const column = `${tableAlias}.${columnAlias}`;
  return knex.raw('case when ?? is null then 0 '
  + 'else cast(?? as decimal) end as ??', [column, column, columnAlias]);
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
const buildAggregation = function(aggregation, builder, utils) {
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

  const baseIdColumn = typeof Model.idColumn === 'string'
    ? Model.tableName + '.' + Model.idColumn
    : Model.idColumn.map(idColumn => Model.tableName + '.' + idColumn);

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
    idColumn => `${fullOuterRelation}.${idColumn}`
  );

  // Create the subquery for the aggregation with the base model as a starting point
  const distinctTag = distinct ? 'distinct ' : '';
  const aggregationQuery = Model
    .query()
    .select(baseIdColumn)
    .select(knex.raw(`${type}(${distinctTag}??) as ??`, [
      field ? `${fullOuterRelation}.${field}` : fullIdColumns[0],
      columnAlias
    ]))
    .leftJoinRelated(relation);

  // Apply filters to models on the aggregation path
  if (onAggBuild) {
    let currentModel = Model;
    const relationStack = [];
    for (const relationName of relation.split('.')) {
      relationStack.push(relationName);
      const { relatedModelClass } = currentModel.getRelations()[relationName];
      const query = onAggBuild(relatedModelClass);
      const fullyQualifiedRelation = relationStack.join(':');
      if (query) {
        const aggModelAlias = `${fullyQualifiedRelation}_agg`;
        aggregationQuery.innerJoin(query.as(aggModelAlias), function() {
          this.on(
            `${aggModelAlias}.${relatedModelClass.idColumn}`,
            '=',
            `${fullyQualifiedRelation}.${relatedModelClass.idColumn}`
          );
        });
      }
      currentModel = relatedModelClass;
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

const applyAggregations = function(aggregations, builder, utils) {
  if (aggregations.length === 0) return;

  const Model = builder.modelClass();
  const knex = Model.knex();
  const aggAlias = i => `agg_${i}`;
  const idColumns = _.isArray(Model.idColumn) ? Model.idColumn : [Model.idColumn];
  const fullIdColumns = idColumns.map(id => `${Model.tableName}.${id}`);

  const aggregationQueries = aggregations.map(
    aggregation => buildAggregation(aggregation, builder, utils)
  );

  // Create a replicated subquery equivalent to the base model + aggregations
  const fullQuery = Model.query()
    .select(Model.tableName + '.*');

  // For each aggregation query, select the aggregation then join onto the full query
  aggregationQueries.forEach((query, i) => {
    const nullToZeroStatement = nullToZero(knex, aggAlias(i), aggregations[i].alias);
    fullQuery
      .select(nullToZeroStatement)
      .leftJoin(query.as(aggAlias(i)), function() {
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
const applyEagerFilter = function(expression, builder, path, utils) {
  debug('applyEagerFilter(', { expression, path }, ')');

  // Apply a where on the root model
  if (expression.$where) {
    const filterCopy = Object.assign({}, expression.$where);
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
      const filterCopy = Object.assign({}, rhs.$where);

      // TODO: Could potentially apply all 'modifyEagers' at the end
      builder.modifyGraph(relationExpression, subQueryBuilder => {
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

const applyEagerObject = function(expression, builder, utils) {
  const expressionWithoutFilters = applyEagerFilter(expression, builder, [], utils);
  builder.withGraphFetched(expressionWithoutFilters);
};

const applyEager = function (eager, builder, utils) {
  if (typeof eager === 'object') {
    return applyEagerObject(eager, builder, utils);
  }

  builder.withGraphFetched(eager);
};
module.exports.applyEager = applyEager;

/**
 * Test if a property is a related property
 * e.g. "name" => false, "movies.name" => true
 * @param {String} name
 */
const isRelatedProperty = function(name) {
  return !!sliceRelation(name).relationName;
};

/**
 * Apply an entire require expression to the query builder
 * e.g. { "prop1": { "$like": "A" }, "prop2": { "$in": [1] } }
 * Do a first pass on the fields to create an objectionjs RelationExpression
 * This prevents joining tables multiple times, and optimizes number of joins
 * @param {Object} filter
 * @param {QueryBuilder} builder The root query builder
 */
const applyRequire = function (filter = {}, builder, utils) {
  const { applyPropertyExpression } = utils;

  // If there are no properties at all, just return
  const propertiesSet = getPropertiesFromExpression(filter);
  if (propertiesSet.length === 0) return builder;

  const applyLogicalExpression = iterateLogicalExpression({
    onExit: function(propertyName, value, _builder) {
      applyPropertyExpression(propertyName, value, _builder);
    },
    onLiteral: function() {
      throw new Error('Filter is invalid');
    }
  });
  const getFullyQualifiedName = name => sliceRelation(name, '.', Model.tableName).fullyQualifiedProperty;

  const Model = builder.modelClass();
  const idColumns = _.isArray(Model.idColumn) ? Model.idColumn : [Model.idColumn];
  const fullIdColumns = idColumns.map(idColumn => `${Model.tableName}.${idColumn}`);

  // If there are no related properties, don't join
  const relatedPropertiesSet = propertiesSet.filter(isRelatedProperty);
  if (relatedPropertiesSet.length === 0) {
    applyLogicalExpression(filter, builder, false, getFullyQualifiedName);
  } else {
    const filterQuery = Model.query().distinct(...fullIdColumns);

    applyLogicalExpression(filter, filterQuery, false, getFullyQualifiedName);

    // If there were related properties, join onto the filter
    const joinRelation = createRelationExpression(propertiesSet);
    filterQuery.joinRelation(joinRelation);

    const filterQueryAlias = 'filter_query';
    builder.innerJoin(filterQuery.as(filterQueryAlias), function () {
      fullIdColumns.forEach((fullIdColumn, index) => {
        this.on(fullIdColumn, '=', `${filterQueryAlias}.${idColumns[index]}`);
      });
    });
  }

  return builder;
};
module.exports.applyRequire = applyRequire;

/**
 * Apply an entire where expression to the query builder
 * e.g. { "prop1": { "$like": "A" }, "prop2": { "$in": [1] } }
 * For now it only supports a single operation for each property
 * but in reality, it should allow an AND of multiple operations
 * @param {Object} filter The filter object
 * @param {QueryBuilder} builder The root query builder
 */
const applyWhere = function (filter = {}, builder, utils) {
  const { applyPropertyExpression } = utils;
  const Model = builder.modelClass();

  _.forEach(filter, (andExpression, property) => {
    const { relationName, propertyName } = sliceRelation(property);

    if (!relationName) {
      // Root level where should include the root table name
      const fullyQualifiedProperty = `${Model.tableName}.${propertyName}`;
      return applyPropertyExpression(fullyQualifiedProperty, andExpression, builder);
    }

    // Eager query fields should include the eager model table name
    builder.modifyGraph(relationName, eagerBuilder => {
      const fullyQualifiedProperty = `${eagerBuilder.modelClass().tableName}.${propertyName}`;
      applyPropertyExpression(fullyQualifiedProperty, andExpression, eagerBuilder);
    });
  });

  return builder;
};
module.exports.applyWhere = applyWhere;

/**
 * Order the result by a root model field or order related models
 * Related properties are ordered locally (within the subquery) and not globally
 * e.g. order = "name desc, city.country.name asc"
 * @param {String} order An comma delimited order expression
 * @param {QueryBuilder} builder The root query builder
 */
const applyOrder = function (order, builder) {
  if (!order) return;
  const Model = builder.modelClass();

  order.split(',').forEach(orderStatement => {
    const [orderProperty, direction = 'asc'] = orderStatement.trim().split(' ');
    const { propertyName, relationName } = sliceRelation(orderProperty);

    if (!relationName) {
      // Root level where should include the root table name
      const fullyQualifiedColumn = `${Model.tableName}.${propertyName}`;
      return builder.orderBy(fullyQualifiedColumn, direction);
    }

    // For now, only allow sub-query ordering of eager expressions
    builder.modifyGraph(relationName, eagerBuilder => {
      const fullyQualifiedColumn = `${eagerBuilder.modelClass().tableName}.${propertyName}`;
      eagerBuilder.orderBy(fullyQualifiedColumn, direction);
    });
  });

  return builder;
};
module.exports.applyOrder = applyOrder;

/**
 * Based on a relation name, select a subset of fields. Do nothing if there are no fields
 * @param {Builder} builder An instance of a knex builder
 * @param {Array<String>} fields A list of fields to select
  */
const selectFields = (fields, builder, relationName) => {
  if (fields.length === 0) return;
  const knex = builder.modelClass().knex();
  // HACK: sqlite incorrect column alias when selecting 1 column
  // TODO: investigate sqlite column aliasing on eager models
  if (fields.length === 1 && !relationName) {
    const field = fields[0].split('.')[1];
    return builder.select(knex.raw('?? as ??', [fields[0], field]));
  }
  if (!relationName) return builder.select(fields);

  builder.modifyGraph(relationName, eagerQueryBuilder => {
    eagerQueryBuilder
      .select(fields.map(field => `${eagerQueryBuilder.modelClass().tableName}.${field}`));
  });
};

/**
 * Select a limited set of fields. Use dot notation to limit eagerly loaded models.
 * @param {Array<String>} fields An array of dot notation fields
 * @param {QueryBuilder} builder The root query builder
 */
const applyFields = function (fields = [], builder) {
  const Model = builder.modelClass();

  // Group fields by relation e.g. ["a.b.name", "a.b.id"] => {"a.b": ["name", "id"]}
  const rootFields = []; // Fields on the root model
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
  _.map(fieldsByRelation, (_fields, relationName) => selectFields(
    _fields, builder, relationName
  ));

  return builder;
};
module.exports.applyFields = applyFields;

const applyLimit = function (limit, offset, builder) {
  if (limit) builder.limit(limit);
  if (offset) builder.offset(offset);

  return builder;
};
module.exports.applyLimit = applyLimit;
