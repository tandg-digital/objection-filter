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
const Boom = require('boom');
const {
  sliceRelation,
  applyOperations
} = require('./utils');
const {
  createRelationExpression
} = require('./ExpressionBuilder');

module.exports = class FilterQueryBuilder {
  constructor(Model) {
    this.Model = Model;
    this._builder = Model.query();
  }

  build(params = {}) {
    const {
      fields,
      limit,
      offset,
      order,
      eager
    } = params;

    applyFields(fields, this._builder);
    applyEager(eager, this._builder);
    applyWhere(params.where, this._builder);
    applyRequire(params.require, this._builder);
    applyOrder(order, this._builder);
    applyLimit(limit, offset, this._builder);

    return this._builder;
  }

  /**
   * @param {String} exp The objection.js eager expression
   */
  allowEager(eagerExpression) {
    this._builder.allowEager(eagerExpression);

    return this;
  }
};

const applyEager = function(eager, builder) {
  builder.eager(eager);
};
module.exports.applyEager = applyEager;

/**
 * Apply an entire require expression to the query builder
 * e.g. { "prop1": { "$like": "A" }, "prop2": { "$in": [1] } }
 * Do a first pass on the fields to create an objectionjs RelationExpression
 * This prevents joining tables multiple times, and optimizes number of joins
 * @param {Object} filter
 * @param {QueryBuilder} builder The root query builder
 */
const applyRequire = function(filter = {}, builder) {
  if (Object.keys(filter).length === 0) return builder;
  const Model = builder._modelClass;
  const idColumn = `${Model.tableName}.${Model.idColumn}`;

  const filterQuery = Model
    .query()
    .distinct(idColumn);

  // Do all the joins at once
  const relationExpression = createRelationExpression(Object.keys(filter));
  filterQuery.joinRelation(relationExpression);

  // For each property, filter it assuming the expression is an AND
  let relatedPropertyCount = 0;
  _.forEach(filter, (andExpression, property) => {
    const {
      relationName,
      propertyName,
      fullyQualifiedProperty
    } = sliceRelation(property);

    // Without a relation, a "require" is equivalent to a "where" on the root model
    if (!relationName)
      return applyWhere({[propertyName]: andExpression}, builder);

    relatedPropertyCount++;
    applyOperations(fullyQualifiedProperty, andExpression, filterQuery);
  });

  // If there weren't any related properties, don't bother joining
  if (relatedPropertyCount === 0) return builder;

  const filterQueryAlias = 'filter_query';
  builder.innerJoin(
    filterQuery.as(filterQueryAlias),
    idColumn,
    `${filterQueryAlias}.${Model.idColumn}`
  );

  // TODO: Investigate performance difference WHERE IN vs a JOIN (DISTINCT)
  //this._builder.where(idColumn, 'in', subQuery);

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
const applyWhere = function(filter = {}, builder) {
  const Model = builder._modelClass;

  _.forEach(filter, (andExpression, property) => {
    const { relationName, propertyName } = sliceRelation(property);

    if (!relationName) {
      // Root level where should include the root table name
      const fullyQualifiedProperty = `${Model.tableName}.${propertyName}`;
      return applyOperations(fullyQualifiedProperty, andExpression, builder);
    }

    // Eager query fields should include the eager model table name
    builder.modifyEager(relationName, eagerBuilder => {
      const fullyQualifiedProperty = `${eagerBuilder._modelClass.tableName}.${propertyName}`;
      applyOperations(fullyQualifiedProperty, andExpression, eagerBuilder);
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
const applyOrder = function(order, builder) {
  if (!order) return;
  const Model = builder._modelClass;

  order.split(',').forEach(orderStatement => {
    const [orderProperty, direction = 'asc'] = orderStatement.split(' ');
    const { propertyName, relationName } = sliceRelation(orderProperty);

    if (!relationName) {
      // Root level where should include the root table name
      const fullyQualifiedColumn = `${Model.tableName}.${propertyName}`;
      return builder.orderBy(fullyQualifiedColumn, direction);
    }

    // For now, only allow sub-query ordering of eager expressions
    builder.modifyEager(relationName, eagerBuilder => {
      const fullyQualifiedColumn = `${eagerBuilder._modelClass.tableName}.${propertyName}`;
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

  if (!relationName)
    return builder.select(fields);

  builder.modifyEager(relationName, eagerQueryBuilder => {
    eagerQueryBuilder.select(fields.map(field => `${eagerQueryBuilder._modelClass.tableName}.${field}`));
  });
};
  

/**
 * Select a limited set of fields. Use dot notation to limit eagerly loaded models.
 * @param {Array<String>} fields An array of dot notation fields
 * @param {QueryBuilder} builder The root query builder
 */
const applyFields = function(fields = [], builder) {
  const Model = builder._modelClass;

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
  _.map(fieldsByRelation, (fields, relationName) => selectFields(
    fields, builder, relationName
  ));

  return builder;
};
module.exports.applyFields = applyFields;

const applyLimit = function(limit, offset, builder) {
  if (limit)
    builder.limit(limit);
  if (offset)
    builder.offset(offset);

  return builder;
};
module.exports.applyLimit = applyLimit;