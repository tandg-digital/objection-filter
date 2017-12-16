const _ = require('lodash');

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
    $or: (property, operand, builder) => builder.where(subQueryBuilder => {
        for (let andExpression of operand)
          applyOperations(property, andExpression, subQueryBuilder, true);
      })
  };
  const { operators } = options;
  // Custom operators take override default operators
  const allOperators = Object.assign({}, defaultOperators, operators);

  /**
   * Apply an number of operations onto a single property
   * If 'or' is specified, then wrap the condition with a knex subquery builder scope
   * @param {String} propertyName
   * @param {Object} operations e.g. { "$gt": 5, "$lt": 10 }
   * @param {QueryBuilder} builder
   * @param {Boolean} or Whether the condition should be wrapped with AND or OR
   */
  const applyOperations = (propertyName, operations, builder, or = false) => {
    if (or) {
      return builder.orWhere(eagerQueryBuilder => applyOperations(
        propertyName, operations, eagerQueryBuilder
      ));
    }

    // Separate the operations into operator/operand tuples
    const pairs = operationsToPairs(operations);
    for (let pair of pairs) {
      const [ operator, operand ] = pair;
      applyOperation(propertyName, operator, operand, builder);
    }
  };

  /**
   * Apply a single operation on a single property
   * @param {String} property The property name e.g. "cities.name"
   * @param {String} operator The operator e.g. "$in"
   * @param {Any} operand The operand value e.g. "NZ"
   * @param {QueryBuilder} builder The objection query builder
   */
  const applyOperation = (property, operator, operand, builder) => {
    const operatorHandler = allOperators[operator];
    if (!operatorHandler) return;

    operatorHandler(property, operand, builder);
  };

  return { applyOperations };
};