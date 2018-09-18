# Aggregations

Aggregations can currently be added to the base model (not onto eagerly loaded models).

The functions _count, sum, min, max, avg_ are supported, along with a _distinct_ flag.

### Basic examples

To get the number of _orders_ per _Customer_, where _Customer_ hasMany _Order_
```json
{
  "eager": {
    "$aggregations": [
        {
          "type": "count",
          "alias": "numberOfOrders",
          "relation": "orders"
        }
    ]
  }
}
```

To get the number of unique _products_ in an _order_ per _Customer_, where _Order_ hasMany _Item_ belongsTo _Product_
```json
{
  "eager": {
    "$aggregations": [
        {
          "type": "count",
          "distinct": true,
          "alias": "numberOfUniquelyOrderedProducts",
          "relation": "orders.items.product"
        }
    ]
  }
}
```

### Filtering

Filtering for aggregations is done at the _Outer Most_ model. Given a set of models:

* _Customer_ hasMany _Order_ hasMany _item_ hasMany _Product_

To query the _number of times a customer has ordered Apples_, then query would look something like:
```json
{
  "eager": {
    "$aggregations": [
        {
          "type": "count",
          "alias": "numberOfAppleOrders",
          "relation": "orders.items",
          "$where": {
            "product.name": "Apple"
          }
        }
    ]
  }
}
```

Note that in the `$where` filter for the aggregation, the relation is relative to the outer most model. In the query above, the outer most model is the `Item`. The `product` relation is a relation of the `Item` model, not the `Customer` model which we are querying from.

### Other aggregation types
To query the _total number of Apples ordered by a customer_, the query would look like:
```json
{
  "eager": {
    "$aggregations": [
        {
          "type": "sum",
          "alias": "numberOfApplesOrdered",
          "field": "quantity",
          "relation": "orders.items",
          "$where": {
            "product.name": "Apple"
          }
        }
    ]
  }
}
```

In the above example, the `field` attribute is specified. The `field` is also relative to the outer most model (eg `quantity` is a column of the `Item` model).

### Multiple aggregations
Aggregations can be combined as expected, and provided as an array:
```json
{
  "eager": {
    "$aggregations": [
        {
          "type": "count",
          "alias": "numberOfOrders",
          "relation": "orders"
        },
        {
          "type": "sum",
          "alias": "numberOfOrderedItems",
          "relation": "orders.items",
          "field": "quantity"
        }
    ]
  }
}
```