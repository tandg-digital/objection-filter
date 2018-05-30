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
   * Given a logical expression return an array of all properties
   * @param {Object} expression
   */
  const getPropertiesFromExpression = function(expression = {}) {
    let properties = [];

    for (let lhs in expression) {
      const rhs = expression[lhs];

      if (lhs === '$or') {
        const subExpressions = rhs; // Should be an array
        for (let subExpression of subExpressions)
          properties = properties.concat(getPropertiesFromExpression(subExpression));
      } else if (lhs === '$and') {
        properties = properties.concat(getPropertiesFromExpression(rhs));
      } else {
        properties.push(lhs);
      }
    }

    return properties;
  };

  /**
   * Heuristic:
   * 1. Start with an expression {} and iterate its keys
   * 2. Each [key] will either be a LOGICAL_OPERATOR or a PROPERTY
   * 3. If it's a LOGICAL_OPERATOR, pass back to the same function
   * 4. If it's a property, go to another function that stores this property name
   *
   * 5. Once a property is 'hit', it is maintained for the rest of the tree nodes
   */
  const handleProperty = function(propertyName, expression = {}, builder) {
    console.log(
      `Handling property[${propertyName}] expression[${JSON.stringify(expression)}]`
    );

    // If the rhs is a primitive, assume equality
    if (typeof expression !== 'object')
      return allOperators.$equals(propertyName, expression, builder);

    for (let lhs in expression) {
      const operationHandler = allOperators[lhs];
      const rhs = expression[lhs];

      if (!operationHandler)
        throw new Error(`The operator [${lhs}] does not exist`);

      operationHandler(propertyName, rhs, builder);
    }
  };

  /**
   *
   * @param {Object} expression
   * @param {QueryBuilder} builder
   * @param {Boolean} or
   * @param {Function} propertyTransform
   */
  const applyLogicalExpression = function(
    expression = {},
    builder,
    or = false,
    propertyTransform = propertyName => propertyName
  ) {
    console.log('applyLogicalExpression', expression);

    builder[or ? 'orWhere' : 'where'](subQueryBuilder => {
      for (let lhs in expression) {
        const rhs = expression[lhs];
        console.log(`Handling lhs[${lhs}] rhs[${JSON.stringify(rhs)}]`);

        if (lhs === '$or') {
          const subExpressions = rhs; // Should be an array
          for (let subExpression of subExpressions)
            applyLogicalExpression(subExpression, subQueryBuilder, true, propertyTransform);
        } else if (lhs === '$and') {
          applyLogicalExpression(rhs, subQueryBuilder, false, propertyTransform);
        } else {
          const fullyQualifiedProperty = propertyTransform(lhs);

          // The lhs is a property name
          handleProperty(fullyQualifiedProperty, rhs, subQueryBuilder);
        }
      }
    });

    return getPropertiesFromExpression(expression, propertyTransform);
  };

  /**
   * Apply an object notation eager object with scope based filtering
   * @param {Object} expression
   * @param {QueryBuilder} builder
   */
  const applyEagerFilter = function(expression = {}, builder, path = []) {
    console.log('=== path ===', path);

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
        console.log('applying modifyEager', relationExpression, rhs.$filter);
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

  return {
    applyOperations: applyLogicalExpression,
    handleProperty: handleProperty,
    applyEagerObject: applyEagerObject
  };
};