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
  const fullyQualifiedProperty = `${relationName.replace(/\./g, ':')}.${propertyName}`;

  return { propertyName, relationName, fullyQualifiedProperty };
};
module.exports.sliceRelation = sliceRelation;

/**
 * Takes an operations expression and transforms it into an
 * array of operation-operand pairs e.g. { "$like": "a", "$contains": "b" } =>
 * [ [ "$like", "a"], [ "$contains", "b" ] ]
 * @param {Object} expression
 */
const operationsToPairs = expression => {
  // If the andExpression is NOT an object, it is an equality
  return typeof expression === 'object' ?
    (_.toPairs(expression) || []) :
    [ [ '=', expression ] ];
};

/**
 * Create operation application utilities with some custom options
 * If options.operators is specified
 * @param {Object} options
 */
module.exports.Operations = function(options = {}) {
  const defaultOperators = {
    $like: (property, operand, builder) => builder
      .where(property, 'like', operand),
    $lt: (property, operand, builder) => builder
      .where(property, '<', operand),
    $gt: (property, operand, builder) => builder
      .where(property, '>', operand),
    $lte: (property, operand, builder) => builder
      .where(property, '<=', operand),
    $gte: (property, operand, builder) => builder
      .where(property, '>=', operand),
    $equals: (property, operand, builder) => builder
      .where(property, operand),
    '=': (property, operand, builder) => builder
      .where(property, operand),
    $in: (property, operand, builder) => builder
      .where(property, 'in', operand),
    $exists: (property, operand, builder) => operand ?
      builder.whereNotNull(property) :
      builder.whereNull(property),
    /**
     * @param {String} property
     * @param {Array} items Must be an array of objects/values
     * @param {QueryBuilder} builder
     */
    $or: (property, items, builder) => {
      const onExit = function(operator, value, subQueryBuilder) {
        console.log({ operator, value });

        const operationHandler = allOperators[operator];
        operationHandler(property, value, subQueryBuilder);
      };
      const onLiteral = function(value, subQueryBuilder) {
        onExit('$equals', value, subQueryBuilder);
      };

      // Iterate the logical expression until it hits an operation e.g. $gte
      const iterateLogical = iterateLogicalExpression({ onExit, onLiteral });

      // Wrap within another builder context to prevent orWhere at ends
      return builder.where(subQueryBuilder => {
        iterateLogical({ $or: items }, subQueryBuilder, true);
      });
    }
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
  const applyPropertyExpression = function(
    propertyName,
    expression = {},
    builder
  ) {
    debug(
      `Handling property[${propertyName}] expression[${JSON.stringify(expression)}]`
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

  const applyLogicalExpression = iterateLogicalExpression({
    onExit: applyPropertyExpression,
    onLiteral: function(operator, value, builder) {
      throw new Error('Filter is invalid');
    },
    propertyTransform: function(propertyName) {
      const {
        fullyQualifiedProperty
      } = sliceRelation(propertyName);

      return fullyQualifiedProperty;
    }
  });

  /**
   * Apply an object notation eager object with scope based filtering
   * @param {Object} expression
   * @param {QueryBuilder} builder
   */
  const applyEagerFilter = function(expression = {}, builder, path = []) {
    // Walk the eager tree
    for (let lhs in expression) {
      const rhs = expression[lhs];

      if (typeof rhs === 'boolean')
        continue;

      // rhs is an object
      const relationName = rhs.$relation ? rhs.$relation : lhs;
      const newPath = path.concat(relationName);
      const relationExpression = newPath.join('.');

      if (rhs.$filter) {
        debug('applying modifyEager', relationExpression, rhs.$filter);
        const filterCopy = Object.assign({}, rhs.$filter);

        // Could potentially apply all 'modifyEagers' at the end
        builder.modifyEager(relationExpression, subQueryBuilder => {
          applyLogicalExpression(filterCopy, subQueryBuilder);
        });

        delete rhs.$filter;

        expression[lhs] = rhs;
      }

      if (Object.keys(rhs).length > 0)
        applyEagerFilter(rhs, builder, newPath);
    }

    return expression;
  };

  const applyEagerObject = function(expression = {}, builder) {
    const expressionWithoutFilters = applyEagerFilter(expression, builder, []);
    builder.eager(expressionWithoutFilters);
  };

  return {
    applyOperations: applyLogicalExpression,
    handleProperty: applyPropertyExpression,
    applyEagerObject: applyEagerObject
  };
};