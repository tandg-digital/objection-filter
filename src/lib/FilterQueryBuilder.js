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
const { sliceRelation, Operations } = require('./utils');
const { createRelationExpression } = require('./ExpressionBuilder');
const {
  iterateLogicalExpression,
  getPropertiesFromExpression,
} = require('./LogicalIterator');

const baseFields = ['id', 'createdAt', 'updatedAt'];

module.exports = class FilterQueryBuilder {
  /**
   * @param {Model} Model
   * @param {Transaction} trx
   * @param {Object} options.operators Custom operator handlers
   */
  constructor(Model, trx, options = {}) {
    this.Model = Model;
    this._builder = Model.query(trx);

    // Initialize custom operators
    const { operators = {} } = options;

    // Initialize instance specific utilities
    this.utils = Operations({
      operators,
    });
  }

  build(params = {}, baseModel) {
    const {
      fields,
      limit,
      offset,
      orderBy,
      includes,
      filter,
      page,
      perPage,
    } = params;

    applyFields(fields, this._builder);
    applyWhere(filter || {}, this._builder, this.utils, baseModel);
    applyRequire(params.require, this._builder, this.utils);
    applyOrder(orderBy, this._builder, baseModel);

    // Clone the query before adding pagination functions in case of counting
    // this.countQuery = this._builder.clone();
    if (includes) {
      applyEager(includes, this._builder, this.utils);
    }
    applyLimit(limit, offset, page, perPage, this._builder);

    return this._builder;
  }

  count() {
    const query = this.countQuery.count('* AS count').first();

    return query.then(result => result.count);
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
 * Apply an object notation eager object with scope based filtering
 * @param {Object} expression
 * @param {QueryBuilder} builder
 * @param {Array<string>} path An array of the current relation
 * @param {Object} utils
 */
const applyEagerFilter = function(expression = {}, builder, path, utils) {
  debug(
    'applyEagerFilter(',
    {
      expression,
      path,
    },
    ')'
  );

  // Apply a where on the root model
  if (expression.$where) {
    const filterCopy = Object.assign({}, expression.$where);
    applyRequire(filterCopy, builder, utils);
    delete expression.$where;
  }

  // Walk the eager tree
  for (let lhs in expression) {
    const rhs = expression[lhs];
    debug(`Eager Filter lhs[${lhs}] rhs[${JSON.stringify(rhs)}]`);

    if (typeof rhs === 'boolean' || typeof rhs === 'string') continue;

    // rhs is an object
    const eagerName = rhs.$relation ? `${rhs.$relation} as ${lhs}` : lhs;

    // including aliases e.g. "a as b.c as d"
    const newPath = path.concat(eagerName);
    const relationExpression = newPath.join('.');

    if (rhs.$where) {
      debug(
        'modifyEager(',
        {
          relationExpression,
          filter: rhs.$where,
        },
        ')'
      );
      const filterCopy = Object.assign({}, rhs.$where);

      // TODO: Could potentially apply all 'modifyEagers' at the end
      builder.modifyEager(relationExpression, subQueryBuilder => {
        applyRequire(filterCopy, subQueryBuilder, utils);
      });

      delete rhs.$where;

      expression[lhs] = rhs;
    }

    if (Object.keys(rhs).length > 0)
      applyEagerFilter(rhs, builder, newPath, utils);
  }

  return expression;
};

const applyEagerObject = function(expression, builder, utils) {
  const expressionWithoutFilters = applyEagerFilter(
    expression,
    builder,
    [],
    utils
  );
  builder.eager(expressionWithoutFilters);
};

const applyEager = function(eager, builder, utils) {
  if (typeof eager === 'object') return applyEagerObject(eager, builder, utils);
  if (typeof eager === 'string') builder.eager(`[${eager}]`);
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
const applyRequire = function(filter = {}, builder, utils) {
  const { applyPropertyExpression } = utils;

  // If there are no properties at all, just return
  const propertiesSet = getPropertiesFromExpression(filter);
  if (propertiesSet.length === 0) return builder;

  const applyLogicalExpression = iterateLogicalExpression({
    onExit: function(propertyName, value, builder) {
      applyPropertyExpression(propertyName, value, builder);
    },
    onLiteral: function() {
      throw new Error('Filter is invalid');
    },
  });
  const getFullyQualifiedName = name =>
    sliceRelation(name).fullyQualifiedProperty;

  const Model = builder.modelClass();
  const idColumns = _.isArray(Model.idColumn)
    ? Model.idColumn
    : [Model.idColumn];
  const fullIdColumns = idColumns.map(
    idColumn => `${Model.tableName}.${idColumn}`
  );

  // If there are no related properties, don't join
  const relatedPropertiesSet = propertiesSet.filter(isRelatedProperty);
  if (relatedPropertiesSet.length === 0) {
    applyLogicalExpression(filter, builder, false, getFullyQualifiedName);
  } else {
    const filterQuery = Model.query().distinct(...fullIdColumns);

    applyLogicalExpression(filter, filterQuery, false, getFullyQualifiedName);

    // If there were related properties, join onto the filter
    const joinRelation = createRelationExpression(propertiesSet);
    if (joinRelation) filterQuery.joinRelation(joinRelation);

    const filterQueryAlias = 'filter_query';
    builder.innerJoin(filterQuery.as(filterQueryAlias), function() {
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
const applyWhere = function(filter = {}, builder, utils, baseModel) {
  const { applyPropertyExpression } = utils;
  const Model = builder.modelClass();

  _.forEach(filter, (andExpression, property) => {
    const { relationName, propertyName } = sliceRelation(property);

    if (!relationName) {
      // Root level where should include the root table name
      const fullyQualifiedProperty = _.includes(baseFields, propertyName)
        ? `${baseModel || Model.tableName}.${propertyName}`
        : propertyName;
      return applyPropertyExpression(
        fullyQualifiedProperty,
        andExpression,
        builder
      );
    }

    if (relationName) {
      // Root level where should include the root table name
      const fullyQualifiedProperty = `${relationName || Model.tableName}.${propertyName}`
      return applyPropertyExpression(
        fullyQualifiedProperty,
        andExpression,
        builder
      );
    }

    // Eager query fields should include the eager model table name
    builder.modifyEager(relationName, eagerBuilder => {
      const fullyQualifiedProperty = `${
        eagerBuilder.modelClass().tableName
      }.${propertyName}`;
      applyPropertyExpression(
        fullyQualifiedProperty,
        andExpression,
        eagerBuilder
      );
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
const applyOrder = function(order, builder, baseModel) {
  if (!order) return;
  const Model = builder.modelClass();

  order.split(',').forEach(orderStatement => {
    let orderProperty = orderStatement;
    let direction = 'asc';
    const isStartWithNegative = orderStatement.startsWith('-');
    if (isStartWithNegative) {
      direction = 'desc';
      orderProperty = orderProperty.substring(1);
    }
    const { propertyName, relationName } = sliceRelation(orderProperty);

    if (!relationName) {
      // Root level where should include the root table name
      const fullyQualifiedColumn = _.includes(baseFields, propertyName)
        ? `${baseModel || Model.tableName}.${propertyName}`
        : propertyName;
      return builder.orderBy(fullyQualifiedColumn, direction);
    }

    if (relationName) {
      // Root level where should include the root table name
      const fullyQualifiedColumn = `${relationName || Model.tableName}.${propertyName}`
      return builder.orderBy(fullyQualifiedColumn, direction);
    }

    // For now, only allow sub-query ordering of eager expressions
    builder.modifyEager(relationName, eagerBuilder => {
      const fullyQualifiedColumn = `${propertyName}`;
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
const selectFields = (fields = [], builder, relationName) => {
  if (fields.length === 0) return;

  if (!relationName) return builder.select(fields);

  builder.modifyEager(relationName, eagerQueryBuilder => {
    eagerQueryBuilder.select(
      fields.map(
        field => `${eagerQueryBuilder.modelClass().tableName}.${field}`
      )
    );
  });
};

/**
 * Select a limited set of fields. Use dot notation to limit eagerly loaded models.
 * @param {Array<String>} fields An array of dot notation fields
 * @param {QueryBuilder} builder The root query builder
 */
const applyFields = function(fields = [], builder) {
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
  _.map(fieldsByRelation, (fields, relationName) =>
    selectFields(fields, builder, relationName)
  );

  return builder;
};
module.exports.applyFields = applyFields;

const applyLimit = function(limit, offset, page, perPage, builder) {
  if (page && perPage) {
    builder.page(page - 1, perPage);
    return builder;
  }
  if (typeof limit === 'number' && typeof offset === 'number') {
    builder.page(parseInt(offset / limit), limit);
    return builder;
  }
  if (limit) builder.limit(limit);
  if (offset) builder.offset(offset);

  return builder;
};
module.exports.applyLimit = applyLimit;
