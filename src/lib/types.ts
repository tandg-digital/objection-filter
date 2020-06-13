import { QueryBuilder, Model, Expression as ObjExpression } from 'objection';

// Shared types
export interface Relation {
  propertyName: string;
  relationName: string;
  fullyQualifiedProperty: string
}

export type Primitive = number | string | null;

// OperationOptions types and subtypes
type OperationHandler<M extends Model> = (
  property: string,
  operand: Expression | ExpressionValue,
  builder: QueryBuilder<M>
) => QueryBuilder<M>;

export type Operators<M extends Model> = {
  [f: string]: OperationHandler<M>;
}

export interface OperationOptions<M extends Model> {
  operators: Operators<M>;
  onAggBuild: Function;
}

export interface OperationUtils<M extends Model> {
  applyPropertyExpression: OperationHandler<M>;
  onAggBuild: Function;
}

// LogicalIterator types and subtypes
export type ExpressionValue = Expression | string | number;
export type Expression = {
  [key: string]: ExpressionValue;
};
export type PropertyOmissionPredicate = (
  propertyName?: string
) => boolean;

export type Item = {
  [x: string]: any;
};

export type LogicalIteratorExitFunction<M extends Model> = (
  operator: string,
  value: Primitive,
  subQueryBuilder: QueryBuilder<M>
) => void;
export type LogicalIteratorLiteralFunction<M extends Model> = (
  value: Primitive,
  subQueryBuilder: QueryBuilder<M>
) => void;

export interface LogicalExpressionIteratorOptions<M extends Model> {
  onExit: LogicalIteratorExitFunction<M>;
  onLiteral: LogicalIteratorLiteralFunction<M>;
}

// FilterQueryBuilder types and subtypes
export interface FilterQueryBuilderOptions<M extends Model> {
  operators?: Operators<M>;
  onAggBuild?: Function;
}

export interface FilterQueryParams {
  fields?: string[];
  limit?: number;
  offset?: number;
  order?: string;
  eager?: Object;
  where?: Object;
  require?: Object;
}