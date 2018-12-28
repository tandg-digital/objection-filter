/**
 * The utils helpers are a set of common helpers to be passed around during
 * filter execution. It stores all default operators, custom operators and
 * functions which directly touch these operators.
 */

const _ = require('lodash');
const { debug } = require('../config');
const { iterateLogicalExpression } = require('./LogicalIterator');

/**
 * For a property "a.b.c", slice it into relationName: "a.b", "propertyName": "c" and
 * a fully qualified property "a:b.c"
 * @param {String} relatedProperty A dot notation property "a.b.c"
 * @param {String} delimiter A delimeter to use on the relation e.g. "." or ":"
 */
const sliceRelation = (relatedProperty, delimiter = '.') => {
  const split = relatedProperty.split('.');
  const propertyName = split[split.length - 1];
  const relationName = split.slice(0, split.length - 1).join(delimiter);

  // Nested relations need to be in the format a:b:c.name
  // https://github.com/Vincit/objection.js/issues/363
  const fullyQualifiedProperty = relationName
    ? `${relationName.replace(/\./g, ':')}.${propertyName}`
    : propertyName;

  return {
    propertyName,
    relationName,
    fullyQualifiedProperty,
  };
};
module.exports.sliceRelation = sliceRelation;

/**
 * Create operation application utilities with some custom options
 * If options.operators is specified
 * @param {Object} options.operators
 */
module.exports.Operations = function(options) {
  const defaultOperators = {
    $like: (property, operand, builder) =>
      builder.where(property, 'ilike', `%${operand}%`),
    $ilike: (property, operand, builder) =>
      builder.where(property, 'ilike', `%${operand}%`),
    $lt: (property, operand, builder) => builder.where(property, '<', operand),
    $gt: (property, operand, builder) => builder.where(property, '>', operand),
    $lte: (property, operand, builder) =>
      builder.where(property, '<=', operand),
    $gte: (property, operand, builder) =>
      builder.where(property, '>=', operand),
    $equals: (property, operand, builder) => builder.where(property, operand),
    '=': (property, operand, builder) => builder.where(property, operand),
    $in: (property, operand, builder) => builder.where(property, 'in', operand),
    $exists: (property, operand, builder) =>
      operand ? builder.whereNotNull(property) : builder.whereNull(property),
    $containAll: (property, operand, builder) =>
      builder.whereRaw('?? @> ?', [property, operand]),
    /**
     * @param {String} property
     * @param {Array} items Must be an array of objects/values
     * @param {QueryBuilder} builder
     */
    $or: (property, items, builder) => {
      const onExit = function(operator, value, subQueryBuilder) {
        const operationHandler = allOperators[operator];
        operationHandler(property, value, subQueryBuilder);
      };
      const onLiteral = function(value, subQueryBuilder) {
        onExit('$equals', value, subQueryBuilder);
      };

      // Iterate the logical expression until it hits an operation e.g. $gte
      const iterateLogical = iterateLogicalExpression({
        onExit,
        onLiteral,
      });

      // Wrap within another builder context to prevent end-of-expression errors
      // TODO: Investigate the consequences of not using this wrapper
      return builder.where(subQueryBuilder => {
        iterateLogical(
          {
            $or: items,
          },
          subQueryBuilder,
          true
        );
      });
    },
    $and: (property, items, builder) => {
      const onExit = function(operator, value, subQueryBuilder) {
        const operationHandler = allOperators[operator];
        operationHandler(property, value, subQueryBuilder);
      };
      const onLiteral = function(value, subQueryBuilder) {
        onExit('$equals', value, subQueryBuilder);
      };

      // Iterate the logical expression until it hits an operation e.g. $gte
      const iterateLogical = iterateLogicalExpression({
        onExit,
        onLiteral,
      });

      // Wrap within another builder context to prevent end-of-expression errors
      return builder.where(subQueryBuilder => {
        iterateLogical(
          {
            $and: items,
          },
          subQueryBuilder,
          false
        );
      });
    },
  };
  const { operators } = options;

  // Custom operators take override default operators
  const allOperators = Object.assign({}, defaultOperators, operators);

  /**
   * Apply a subset of operators on a single property
   * @param {String} propertyName
   * @param {Object} expression
   * @param {QueryBuilder} builder
   */
  const applyPropertyExpression = function(propertyName, expression, builder) {
    debug(
      `Handling property[${propertyName}] expression[${JSON.stringify(
        expression
      )}]`
    );

    // If the rhs is a primitive, assume equality
    if (typeof expression !== 'object')
      return allOperators.$equals(propertyName, expression, builder);

    for (let lhs in expression) {
      const operationHandler = allOperators[lhs];
      const rhs = expression[lhs];

      if (!operationHandler) {
        debug(`The operator [${lhs}] does not exist, skipping`);
        continue;
      }

      operationHandler(propertyName, rhs, builder);
    }
  };

  return {
    applyPropertyExpression,
  };
};
