/**
 * The utils helpers are a set of common helpers to be passed around during
 * filter execution. It stores all default operators, custom operators and
 * functions which directly touch these operators.
 */
import {
  Model,
  QueryBuilder,
  PrimitiveValue,
  ref,
  ReferenceBuilder
} from 'objection';
import * as _ from 'lodash';

import { debug } from '../config';
import { iterateLogicalExpression, hasSubExpression } from './LogicalIterator';

// Types
import {
  Relation,
  Operators,
  OperationOptions,
  OperationUtils,
  LogicalIteratorExitFunction,
  LogicalIteratorLiteralFunction,
  Expression,
  ExpressionValue,
  Primitive,
  OperationHandler
} from './types';

/**
 * For a property "a.b.c", slice it into relationName: "a.b", "propertyName": "c" and
 * a fully qualified property "a:b.c"
 * @param {String} relatedProperty A dot notation property "a.b.c"
 * @param {String} delimiter A delimeter to use on the relation e.g. "." or ":"
 */
export function sliceRelation(
  relatedProperty: string,
  delimiter = '.',
  rootTableName?: string,
  fieldExpressionDelimiter = '$'
): Relation {
  let jsonProperty;
  [relatedProperty, jsonProperty] = relatedProperty.split(
    fieldExpressionDelimiter
  );

  const split = relatedProperty.split('.');
  let propertyName = split[split.length - 1];
  if (jsonProperty)
    propertyName += `${fieldExpressionDelimiter}${jsonProperty}`;
  const relationName = split.slice(0, split.length - 1).join(delimiter);

  // Nested relations need to be in the format a:b:c.name
  // https://github.com/Vincit/objection.js/issues/363
  const fullyQualifiedProperty = relationName
    ? `${relationName.replace(/\./g, ':')}.${propertyName}`
    : rootTableName
    ? `${rootTableName}.${propertyName}`
    : propertyName;

  return { propertyName, relationName, fullyQualifiedProperty };
}

/**
 * Create operation application utilities with some custom options
 * If options.operators is specified
 * @param {Object} options.operators
 * @param {Function} options.onAggBuild A utility function to filter aggregations per model
 */
export function Operations<M extends Model>(
  options: OperationOptions<M>
): OperationUtils<M> {
  const defaultOperators: Operators<M> = {
    $like: (property, operand, builder) =>
      builder.where(property, 'like', operand as string),
    $lt: (property, operand, builder) =>
      builder.where(property, '<', operand as number),
    $gt: (property, operand, builder) =>
      builder.where(property, '>', operand as number),
    $lte: (property, operand, builder) =>
      builder.where(property, '<=', operand as number),
    $gte: (property, operand, builder) =>
      builder.where(property, '>=', operand as number),
    $equals: (property, operand, builder) =>
      builder.where(property, operand as PrimitiveValue),
    '=': (property, operand, builder) =>
      builder.where(property, operand as PrimitiveValue),
    $in: (property, operand, builder) =>
      builder
        // HACK: Use an unknown cast temporarily
        .whereIn(property, (operand as unknown) as QueryBuilder<M>),
    $exists: (property, operand, builder) =>
      operand ? builder.whereNotNull(property) : builder.whereNull(property),
    /**
     * @param {String} property
     * @param {Array} items Must be an array of objects/values
     * @param {QueryBuilder} builder
     */
    $or: (property, items, builder) => {
      const onExit: LogicalIteratorExitFunction<M> = function (
        operator,
        value,
        subQueryBuilder
      ) {
        const operationHandler = getOperationHandler(operator);
        operationHandler(property, value, subQueryBuilder);
      };
      const onLiteral: LogicalIteratorLiteralFunction<M> = function (
        value,
        subQueryBuilder
      ) {
        onExit('$equals', value, subQueryBuilder);
      };

      // Iterate the logical expression until it hits an operation e.g. $gte
      const iterateLogical = iterateLogicalExpression<M>({ onExit, onLiteral });

      // Wrap within another builder context to prevent end-of-expression errors
      // TODO: Investigate the consequences of not using this wrapper
      return builder.where((subQueryBuilder) => {
        iterateLogical({ $or: items }, subQueryBuilder, true);
      });
    },
    $and: (property, items, builder) => {
      const onExit: LogicalIteratorExitFunction<M> = function (
        operator,
        value,
        subQueryBuilder
      ) {
        const operationHandler = getOperationHandler(operator);
        operationHandler(property, value, subQueryBuilder);
      };
      const onLiteral: LogicalIteratorLiteralFunction<M> = function (
        value,
        subQueryBuilder
      ) {
        onExit('$equals', value, subQueryBuilder);
      };

      // Iterate the logical expression until it hits an operation e.g. $gte
      const iterateLogical = iterateLogicalExpression<M>({ onExit, onLiteral });

      // Wrap within another builder context to prevent end-of-expression errors
      return builder.where((subQueryBuilder) => {
        iterateLogical({ $and: items }, subQueryBuilder, false);
      });
    }
  };
  const { operators, onAggBuild } = options;

  // Custom operators override default operators
  const allOperators = { ...defaultOperators, ...operators };

  // TODO: Generalize
  function isPrimitive(expression: ExpressionValue): expression is Primitive {
    return typeof expression !== 'object';
  }

  /**
   * Returns the operationHandler by name. Builds a reference to the property if necessary.
   * @param operator name of the operator
   */
  function getOperationHandler(operator: any): OperationHandler<M> {
    const operationHandler = allOperators[operator];
    if (!operationHandler) return null;

    if (hasSubExpression(operator)) {
      return operationHandler;
    }

    return (property, operand, builder) => {
      if (typeof property === 'string' && isFieldExpression(property)) {
        let propertyRef = getFieldExpressionRef(property);
        propertyRef = castTo(propertyRef, operand);
        return operationHandler(propertyRef, operand, builder);
      }

      return operationHandler(property, operand, builder);
    };
  }

  /**
   * Apply a subset of operators on a single property
   * @param {String} propertyName
   * @param {Object} expression
   * @param {QueryBuilder} builder
   */
  const applyPropertyExpression = function (
    propertyName: string,
    expression: Expression,
    builder: QueryBuilder<M>
  ) {
    debug(
      `Handling property[${propertyName}] expression[${JSON.stringify(
        expression
      )}]`
    );

    // If the rhs is a primitive, assume equality
    if (isPrimitive(expression))
      return getOperationHandler('$equals')(propertyName, expression, builder);

    for (const lhs in expression) {
      const rhs = expression[lhs];
      const operationHandler = getOperationHandler(lhs);

      if (!operationHandler) {
        debug(`The operator [${lhs}] does not exist, skipping`);
        continue;
      }

      operationHandler(propertyName, rhs, builder);
    }
  };

  return { applyPropertyExpression, onAggBuild };
}

/**
 * Determines if a property is a [FieldExpression](https://vincit.github.io/objection.js/api/types/#type-fieldexpression)
 * @param property The property to check
 */
export function isFieldExpression(property: string): boolean {
  return property.indexOf('$') > -1;
}

/**
 * Builds a reference for a FieldExpression with support for fully-qualified properties
 * @param property a FieldExpression string
 */
export function getFieldExpressionRef(property: string): ReferenceBuilder {
  const isFullyQualified = property.indexOf(':') > -1;
  if (isFullyQualified) {
    let { propertyName, relationName } = sliceRelation(property, ':');
    relationName = relationName.replace('.', ':');
    propertyName = propertyName.replace('$', ':');
    return (ref(propertyName) as any).from(relationName);
  }

  const propertyName = property.replace('$', ':');
  return ref(propertyName);
}

/**
 * Casts a ReferenceBuilder instance to a type based on the type of the operand
 * @param reference A reference built from a filterExpression
 * @param operand the operand from which to infer the type
 */
export function castTo(
  reference: ReferenceBuilder,
  operand: Expression
): ReferenceBuilder {
  const type = typeof operand;
  if (type === 'string') {
    return reference.castText();
  }
  if (type === 'boolean') {
    return reference.castBool();
  }
  if (type === 'number') {
    return reference.castDecimal();
  }
  if (type === 'bigint') {
    return reference.castBigInt();
  }
  if (type === 'object') {
    if (_.isArray(operand)) {
      // For array comparisons, get the type of the first element
      return castTo(reference, operand[0]);
    }
    // For non-array objects, don't cast
    return reference;
  }

  // cast to text by default
  return reference.castText();
}
