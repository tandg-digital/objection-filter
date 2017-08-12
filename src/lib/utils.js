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
module.exports.applyOperations = applyOperations;

/**
 * Apply a single operation on a single property
 * @param {String} property The property name e.g. "cities.name"
 * @param {String} operator The operator e.g. "$in"
 * @param {Any} operand The operand value e.g. "NZ"
 * @param {QueryBuilder} builder The objection query builder
 */
const applyOperation = (property, operator, operand, builder) => {
  switch(operator) {
    case '$like':
      return builder.where(property, 'like', operand);

    case '$lt':
      return builder.where(property, '<', operand);

    case '$gt':
      return builder.where(property, '>', operand);

    case '$lte':
      return builder.where(property, '<=', operand);

    case '$gte':
      return builder.where(property, '>=', operand);

    case '$equals':
    case '=':
      return builder.where(property, '=', operand);

    case '$in':
      return builder.where(property, 'in', operand);

    case '$exists':
      return operand ?
        builder.whereNotNull(property) :
        builder.whereNull(property);

    case '$or':
      return builder.where(subQueryBuilder => {
        for (let andExpression of operand)
          applyOperations(property, andExpression, subQueryBuilder, true);
      });

    default:
      return;
  }
};
module.exports.applyOperation = applyOperation;